'use strict';

import { NatsClient, log, ModuleMetrics } from '@eeveebot/libeevee';
import * as crypto from 'crypto';
import AsciiTable from 'ascii-table';
import { AdminRootConfig } from '../../types/admin.types.mjs';
import type { CommandMessageData } from '../../types/admin.types.mjs';
import { isAuthenticatedAdmin } from '../auth.mjs';
import { parsePrometheusMetrics } from '../utils.mjs';

/** Format an ISO timestamp as a human-readable "time ago" string */
function timeAgo(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  const diffMs = Date.now() - then;
  if (diffMs < 60000) return 'just now';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Interfaces for operator API response (with pod status from Step B)
interface ContainerState {
  waiting?: { reason?: string; message?: string };
  running?: { startedAt?: string };
  terminated?: { reason?: string; exitCode?: number; finishedAt?: string };
}

interface ContainerStatus {
  name: string;
  ready: boolean;
  restartCount: number;
  image: string;
  state: ContainerState | null;
  lastState: ContainerState | null;
}

interface PodCondition {
  type: string;
  status: string;
  lastTransitionTime: string;
}

interface PodStatus {
  phase: string;
  ready: boolean;
  restartCount: number;
  containerStatuses: ContainerStatus[];
  conditions: PodCondition[];
  startedAt: string | null;
}

interface OperatorModule {
  name: string;
  crName: string;
  namespace: string;
  image: string;
  tag: string;
  enabled: boolean;
  podStatus: PodStatus | null;
}

// Interface for NATS stats response
interface StatsResponse {
  module: string;
  stats: Record<string, string | number | boolean | object | null | undefined>;
}

// Per-connection info from a connector module
interface ConnectorConnInfo {
  name: string;
  connected: boolean;
  host: string;
  nick: string;
  channels: number;
  reconnects: number;
  lastConnect: string | null;
  lastDisconnect: string | null;
}

// Derived health status for a module
type HealthStatus = 'ok' | 'degraded' | 'down' | 'disabled' | 'unknown';

interface ModuleHealth {
  name: string;
  status: HealthStatus;
  uptime: string;
  memory: string;
  errors: number;
  restarts: number;
  version: string;
  warnings: string[];
  connector?: ConnectorConnInfo[];
  // Raw data for warning generation
  podStatus: PodStatus | null;
  responded: boolean;
  enabled: boolean;
}

/**
 * Derive health status from pod status and NATS response
 */
function deriveModuleHealth(
  module: OperatorModule,
  statsResponse: StatsResponse | undefined
): ModuleHealth {
  const warnings: string[] = [];
  const pod = module.podStatus;
  const responded = statsResponse !== undefined;
  let status: HealthStatus = 'unknown';

  // Parse stats for errors and memory
  let errors = 0;
  let memoryMB = 0;
  let uptimeFormatted = '—';
  let version = '—';

  if (responded && statsResponse!.stats) {
    const parsed = statsResponse!.stats.prometheus_metrics
      ? { ...statsResponse!.stats, ...parsePrometheusMetrics(statsResponse!.stats.prometheus_metrics as string) }
      : statsResponse!.stats;

    if (parsed.errors_total !== undefined) {
      errors = Number(parsed.errors_total);
    }
    if (parsed.memory_rss_mb !== undefined) {
      memoryMB = Math.round(Number(parsed.memory_rss_mb));
    }
    if (parsed.uptime_formatted !== undefined) {
      uptimeFormatted = String(parsed.uptime_formatted);
    }
    if (parsed.version !== undefined) {
      version = String(parsed.version);
    }
  }

  let connector: ConnectorConnInfo[] | undefined;
  // Re-extract connector from stats response (outside the if block to handle scope)
  if (responded && statsResponse!.stats) {
    const rawStats = statsResponse!.stats;
    if (Array.isArray(rawStats.connector)) {
      connector = rawStats.connector as ConnectorConnInfo[];
    }
  }

  // Check for crash loop in container states
  let crashLoop = false;
  let crashReason = '';
  if (pod?.containerStatuses) {
    for (const cs of pod.containerStatuses) {
      if (cs.state?.waiting?.reason === 'CrashLoopBackOff') {
        crashLoop = true;
        crashReason = cs.state.waiting.message || 'CrashLoopBackOff';
      }
    }
  }

  // Derive status
  if (!module.enabled && !pod) {
    status = 'disabled';
  } else if (crashLoop) {
    status = 'down';
    warnings.push(`CrashLoopBackOff: ${crashReason}`);
  } else if (!pod) {
    // Enabled but no pod — could be pending creation
    status = responded ? 'degraded' : 'down';
    warnings.push('No pod found');
  } else if (pod.phase === 'Pending') {
    status = 'degraded';
    warnings.push(`Pod pending`);
  } else if (pod.phase === 'Failed') {
    status = 'down';
    warnings.push('Pod failed');
  } else if (pod.phase === 'Running') {
    if (!pod.ready) {
      status = 'degraded';
      warnings.push('Pod running but not ready');
    } else if (!responded) {
      status = 'degraded';
      warnings.push('Not responding to stats request');
    } else if (errors > 0) {
      status = 'degraded';
    } else {
      status = 'ok';
    }
  } else {
    // Unknown phase
    status = responded ? 'degraded' : 'unknown';
  }

  // Additional warnings
  if (pod?.restartCount && pod.restartCount > 0) {
    if (status === 'ok') status = 'degraded';
    warnings.push(`${pod.restartCount} restart${pod.restartCount !== 1 ? 's' : ''}`);
  }

  if (errors > 0) {
    warnings.push(`${errors} error${errors !== 1 ? 's' : ''}`);
  }

  // Flag disabled modules that still have a pod
  if (!module.enabled && pod) {
    warnings.push('Disabled but pod still exists');
  }

  // Version drift detection: K8s image tag vs running version
  if (module.tag && version !== '—' && module.tag !== version) {
    warnings.push(`Version drift: image ${module.tag} != running ${version}`);
  }

  // Connector-specific warnings
  if (connector) {
    for (const conn of connector) {
      if (!conn.connected) {
        if (status === 'ok') status = 'degraded';
        const last = conn.lastDisconnect ? ` (last seen ${timeAgo(conn.lastDisconnect)})` : '';
        warnings.push(`${conn.name}: disconnected${last}`);
      }
      if (conn.reconnects > 0) {
        if (status === 'ok') status = 'degraded';
        warnings.push(`${conn.name}: ${conn.reconnects} reconnect${conn.reconnects !== 1 ? 's' : ''}`);
      }
    }
  }

  return {
    name: module.name,
    status,
    uptime: responded ? uptimeFormatted : '—',
    memory: memoryMB > 0 ? `${memoryMB} MB` : '—',
    errors,
    restarts: pod?.restartCount ?? 0,
    version,
    warnings,
    connector,
    podStatus: pod,
    responded,
    enabled: module.enabled,
  };
}

/**
 * Handle the admin health command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param metrics - The module metrics instance
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleHealthCommand(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig,
  metrics: ModuleMetrics,
  subject: string,
  message: { string(): string }
): Promise<void> {
  const startTime = Date.now();
  let data: CommandMessageData = { platform: 'unknown', instance: 'unknown', channel: 'unknown', user: 'unknown', userHost: 'unknown', network: 'unknown', originalText: '', trace: '' };
  try {
    data = JSON.parse(message.string());
    log.info('Received command.execute for health', {
      producer: 'admin',
      platform: data.platform,
      instance: data.instance,
      channel: data.channel,
      user: data.user,
      originalText: data.originalText,
    });

    // Auth check
    if (!isAuthenticatedAdmin(adminConfig, data.platform, data.user, data.userHost)) {
      log.warn('Unauthorized health command attempt', {
        producer: 'admin',
        platform: data.platform,
        user: data.user,
        userHost: data.userHost,
        channel: data.channel,
      });
      metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'unauthorized');
      return;
    }

    // Get operator API config
    const apiToken = process.env.EEVEE_OPERATOR_API_TOKEN;
    const apiUrl = process.env.EEVEE_OPERATOR_API_URL;

    if (!apiToken || !apiUrl) {
      log.error('Missing EEVEE_OPERATOR_API_TOKEN or EEVEE_OPERATOR_API_URL', { producer: 'admin' });
      const errorMessage = {
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
        text: 'Error: Missing operator API configuration',
        trace: data.trace,
      };
      const errorTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
      void nats.publish(errorTopic, JSON.stringify(errorMessage));
      metrics.recordNatsPublish('health_config_error_response');
      metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'config_error');
      return;
    }

    // --- Parallel data gathering ---

    // 1. Fetch modules from operator API (includes pod status)
    const operatorPromise = (async (): Promise<OperatorModule[]> => {
      const response = await fetch(`${apiUrl}/api/bot-modules`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`Operator API returned status ${response.status}`);
      }
      const modules = (await response.json()) as OperatorModule[];
      return modules;
    })();

    // 2. NATS stats.emit.request fan-out
    const replyChannel = `health.stats.reply.${crypto.randomUUID()}`;
    const statsResponses = new Map<string, StatsResponse>();
    let statsComplete = false;
    let statsTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const statsPromise = new Promise<Map<string, StatsResponse>>((resolve) => {
      void (async () => {
        await nats.subscribe(replyChannel, (replySubject: string, replyMessage: { string(): string }) => {
          try {
            const replyData: StatsResponse = JSON.parse(replyMessage.string());
            if (replyData.module) {
              statsResponses.set(replyData.module, replyData);
            }
          } catch (error) {
            log.error('Failed to parse health stats response', {
              producer: 'admin',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });

        // Send the request
        const statsRequest = { replyChannel };
        void nats.publish('stats.emit.request', JSON.stringify(statsRequest));
        metrics.recordNatsPublish('health_stats_request');

        // 5 second timeout
        statsTimeoutId = setTimeout(() => {
          if (!statsComplete) {
            statsComplete = true;
            resolve(statsResponses);
          }
        }, 5000);
      })();
    });

    // Wait for both data sources (both promises are already in-flight)
    let operatorModules: OperatorModule[] | null = null;
    try {
      operatorModules = await operatorPromise;
    } catch (error: unknown) {
      log.error('Failed to fetch modules from operator API', {
        producer: 'admin',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const natsStats = await statsPromise;

    if (statsTimeoutId) clearTimeout(statsTimeoutId);

    // Handle operator API failure
    if (!operatorModules) {
      const errorMessage = {
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
        text: 'Error: Failed to fetch bot modules from operator',
        trace: data.trace,
      };
      const errorTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
      void nats.publish(errorTopic, JSON.stringify(errorMessage));
      metrics.recordNatsPublish('health_fetch_error_response');
      metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'fetch_error');
      return;
    }

    // --- Derive health per module ---
    const moduleHealthList: ModuleHealth[] = operatorModules.map((mod) => {
      const stats = natsStats.get(mod.name);
      return deriveModuleHealth(mod, stats);
    });

    // Sort: down first, then degraded, then unknown, then ok, then disabled
    const statusOrder: Record<HealthStatus, number> = {
      down: 0,
      degraded: 1,
      unknown: 2,
      ok: 3,
      disabled: 4,
    };
    moduleHealthList.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });

    // --- Render report ---
    const healthyCount = moduleHealthList.filter((m) => m.status === 'ok').length;
    const totalEnabled = moduleHealthList.filter((m) => m.enabled).length;
    const allWarnings: Array<{ name: string; warnings: string[] }> = [];

    // Status icon
    const statusIcon = (s: HealthStatus): string => {
      switch (s) {
        case 'ok': return 'ok';
        case 'degraded': return 'degraded';
        case 'down': return 'DOWN';
        case 'disabled': return 'disabled';
        case 'unknown': return '???';
      }
    };

    // Header
    let responseText = `eevee health: ${healthyCount}/${totalEnabled} modules healthy\n`;

    // Table
    const table = new AsciiTable();
    table.setHeading('Module', 'Status', 'Uptime', 'Memory', 'Errors', 'Restarts', 'Version');

    for (const m of moduleHealthList) {
      table.addRow(
        m.name,
        statusIcon(m.status),
        m.uptime,
        m.memory,
        m.errors,
        m.restarts,
        m.version
      );

      if (m.warnings.length > 0) {
        allWarnings.push({ name: m.name, warnings: m.warnings });
      }
    }

    responseText += table.toString() + '\n';

    // Warnings section
    if (allWarnings.length > 0) {
      responseText += 'Warnings:\n';
      for (const w of allWarnings) {
        responseText += `  - ${w.name}: ${w.warnings.join(', ')}\n`;
      }
    }

    // Connector details section
    const connectorModules = moduleHealthList.filter(m => m.connector && m.connector.length > 0);
    if (connectorModules.length > 0) {
      responseText += 'Connectors:\n';
      for (const mod of connectorModules) {
        for (const conn of mod.connector!) {
          const status = conn.connected ? '✓' : '✗';
          const last = conn.connected
            ? (conn.lastConnect ? `up ${timeAgo(conn.lastConnect)}` : 'up')
            : (conn.lastDisconnect ? `down since ${timeAgo(conn.lastDisconnect)}` : 'down');
          const extra = conn.reconnects > 0 ? `, ${conn.reconnects} reconnect${conn.reconnects !== 1 ? 's' : ''}` : '';
          responseText += `  ${status} ${mod.name}:${conn.name} (${conn.host}) ${conn.nick} · ${conn.channels} chans · ${last}${extra}\n`;
        }
      }
    }

    // Send response
    const responseMessage = {
      platform: data.platform,
      instance: data.instance,
      channel: data.channel,
      user: data.user,
      text: responseText,
      trace: data.trace,
    };

    const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
    void nats.publish(responseTopic, JSON.stringify(responseMessage));
    metrics.recordNatsPublish('health_report_response');

    log.info('Sent health report to user', {
      producer: 'admin',
      user: data.user,
      channel: data.channel,
      platform: data.platform,
      instance: data.instance,
      moduleCount: operatorModules.length,
      healthyCount,
    });

    metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'success');
  } catch (error) {
    log.error('Failed to process health command', {
      producer: 'admin',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    metrics.recordError('health_command');
    metrics.recordCommand(data.platform || 'unknown', data.network || 'unknown', data.channel || 'unknown', 'error');

    try {
      const errorMessage = {
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
        text: `Error: Failed to process health command: ${error instanceof Error ? error.message : String(error)}`,
        trace: data.trace,
      };
      const errorTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
      void nats.publish(errorTopic, JSON.stringify(errorMessage));
      metrics.recordNatsPublish('health_exception_response');
    } catch (sendError) {
      log.error('Failed to send error message to user', {
        producer: 'admin',
        error: sendError instanceof Error ? sendError.message : String(sendError),
      });
    }
  } finally {
    const duration = Date.now() - startTime;
    metrics.recordProcessingTime(duration / 1000);
  }
}
