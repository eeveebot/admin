'use strict';

import { NatsClient, log, ModuleMetrics } from '@eeveebot/libeevee';
import * as crypto from 'crypto';
import AsciiTable from 'ascii-table';
import { AdminRootConfig } from '../../types/admin.types.mjs';
import type { CommandMessageData } from '../../types/admin.types.mjs';
import { isAuthenticatedAdmin } from '../auth.mjs';
import { parsePerModuleMetrics } from '../utils.mjs';
import type { ConnectorInfo } from '../utils/metricsParser.mjs';

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

// Interface for NATS stats response
interface StatsResponse {
  module: string;
  stats: Record<string, string | number | boolean | object | null | undefined>;
}

/**
 * Handle the admin bot-stats command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param metrics - The module metrics instance
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleBotStatsCommand(
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
    log.info('Received command.execute for bot-stats', {
      producer: 'admin',
      platform: data.platform,
      instance: data.instance,
      channel: data.channel,
      user: data.user,
      originalText: data.originalText,
    });

    // Auth check
    if (!isAuthenticatedAdmin(adminConfig, data.platform, data.user, data.userHost)) {
      log.warn('Unauthorized bot-stats command attempt', {
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
      metrics.recordNatsPublish('bot_stats_config_error_response');
      metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'config_error');
      return;
    }

    // Fetch bot modules from operator API
    let moduleNames: string[] = [];
    try {
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

      const modulesResponse = await response.json();
      moduleNames = Array.isArray(modulesResponse)
        ? (modulesResponse as Array<{ name: string }>)
            .map((module) => module.name)
            .filter(Boolean)
        : [];
    } catch (fetchError) {
      log.error('Failed to fetch bot modules from operator API', {
        producer: 'admin',
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
      });
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
      metrics.recordNatsPublish('bot_stats_fetch_error_response');
      metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'fetch_error');
      return;
    }

    if (moduleNames.length === 0) {
      const responseMessage = {
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
        text: 'No bot modules found in the system.',
        trace: data.trace,
      };
      const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
      void nats.publish(responseTopic, JSON.stringify(responseMessage));
      metrics.recordNatsPublish('bot_stats_no_modules_response');
      metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'no_modules');
      return;
    }

    // NATS stats.emit.request fan-out
    const replyChannel = `stats.emit.response.${crypto.randomUUID()}`;
    const responses: StatsResponse[] = [];
    const expectedResponses = new Set(moduleNames);
    let allResponsesReceived = false;

    const sendStatsReport = () => {
      if (timeoutId) clearTimeout(timeoutId);

      let responseText = 'Bot Statistics:\n';

      if (responses.length === 0) {
        responseText += 'No modules responded within the timeout period.\n';
      } else {
        // Build per-module data for the parser
        const modulesData = new Map<string, { prometheusMetrics: string; version?: string; memoryRssMb: number; uptimeFormatted: string; connector?: ConnectorInfo[] }>();

        for (const resp of responses) {
          if (!resp.stats) continue;
          const promMetrics = resp.stats.prometheus_metrics
            ? String(resp.stats.prometheus_metrics)
            : '';
          const version = resp.stats.version
            ? String(resp.stats.version)
            : undefined;
          const memoryRssMb = resp.stats.memory_rss_mb
            ? Number(resp.stats.memory_rss_mb)
            : 0;
          const uptimeFormatted = resp.stats.uptime_formatted
            ? String(resp.stats.uptime_formatted)
            : '—';
          const connector = Array.isArray(resp.stats.connector)
            ? resp.stats.connector as ConnectorInfo[]
            : undefined;
          modulesData.set(resp.module, {
            prometheusMetrics: promMetrics,
            version,
            memoryRssMb,
            uptimeFormatted,
            connector,
          });
        }

        const parsed = parsePerModuleMetrics(modulesData);

        // Per-module table
        const table = new AsciiTable();
        table.setHeading('Module', 'Ver', 'Uptime', 'Mem', 'Msgs', 'Cmds', 'Errs', 'Msg p50/p95', 'Cmd p50/p95');

        // Sort modules alphabetically
        const sortedNames = Object.keys(parsed.modules).sort();

        for (const name of sortedNames) {
          const m = parsed.modules[name];

          const msgLatency = m.message_p50_ms !== null && m.message_p95_ms !== null
            ? `${m.message_p50_ms}/${m.message_p95_ms}ms`
            : '—';

          const cmdLatency = m.command_p50_ms !== null && m.command_p95_ms !== null
            ? `${m.command_p50_ms}/${m.command_p95_ms}ms`
            : '—';

          table.addRow(
            name,
            m.version || '—',
            m.uptime_formatted,
            `${m.memory_rss_mb}MB`,
            m.messages_processed.toLocaleString(),
            m.commands_processed.toLocaleString(),
            m.errors_total,
            msgLatency,
            cmdLatency
          );
        }

        responseText += table.toString() + '\n';

        // Aggregate section
        const totalOps = parsed.totalMessages + parsed.totalCommands + parsed.totalBroadcasts;
        const errorRate = totalOps > 0
          ? Math.round((parsed.totalErrors / totalOps) * 10000) / 100
          : 0;

        responseText += `\nTotals:\n`;
        responseText += `  Messages: ${parsed.totalMessages.toLocaleString()}  Commands: ${parsed.totalCommands.toLocaleString()}  Broadcasts: ${parsed.totalBroadcasts.toLocaleString()}\n`;
        responseText += `  Errors: ${parsed.totalErrors.toLocaleString()} (${errorRate}% of operations)  Memory: ${parsed.totalMemoryMB}MB  NATS: ${parsed.totalNatsPublished.toLocaleString()}\n`;

        // Connection info (only from connectors)
        const connectors = sortedNames.filter(n => parsed.modules[n].is_connector);
        if (connectors.length > 0) {
          responseText += `  Connections:\n`;
          for (const name of connectors) {
            const mod = parsed.modules[name];
            if (mod.connector && mod.connector.length > 0) {
              for (const conn of mod.connector) {
                const status = conn.connected ? 'connected' : 'DISCONNECTED';
                const lastSeen = conn.connected
                  ? (conn.lastConnect ? timeAgo(conn.lastConnect) : '—')
                  : (conn.lastDisconnect ? timeAgo(conn.lastDisconnect) : '—');
                const extra = conn.reconnects > 0 ? `, ${conn.reconnects} reconnect${conn.reconnects !== 1 ? 's' : ''}` : '';
                responseText += `    ${name}:${conn.name} ${status} (${conn.channels} chans, ${lastSeen}${extra})\n`;
              }
            } else {
              responseText += `    ${name}: ${mod.active_connections} conns, ${mod.active_channels} chans\n`;
            }
          }
        }

        // Warnings
        const warnings: string[] = [];
        for (const name of sortedNames) {
          const m = parsed.modules[name];
          if (m.errors_total > 0) {
            warnings.push(`${name}: ${m.errors_total} errors`);
          }
          if (m.message_p95_ms !== null && m.message_p95_ms > 100) {
            warnings.push(`${name}: high msg latency (p95 ${m.message_p95_ms}ms)`);
          }
          if (m.command_p95_ms !== null && m.command_p95_ms > 100) {
            warnings.push(`${name}: high cmd latency (p95 ${m.command_p95_ms}ms)`);
          }
        }

        if (warnings.length > 0) {
          responseText += `\nWarnings:\n`;
          for (const w of warnings) {
            responseText += `  - ${w}\n`;
          }
        }

        // Non-responding modules
        const nonResponding = Array.from(expectedResponses).sort();
        if (nonResponding.length > 0) {
          responseText += `\nNo response: ${nonResponding.join(', ')}\n`;
        }

        responseText += `\n${responses.length}/${moduleNames.length} modules responded\n`;
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
      metrics.recordNatsPublish('bot_stats_report_response');

      log.info('Sent bot statistics report to user', {
        producer: 'admin',
        user: data.user,
        channel: data.channel,
        platform: data.platform,
        instance: data.instance,
        moduleCount: responses.length,
        expectedModules: moduleNames.length,
      });

      metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'success');
    };

    // Subscribe to the reply channel to collect responses
    await nats.subscribe(replyChannel, (replySubject, replyMessage) => {
      try {
        const replyData: StatsResponse = JSON.parse(replyMessage.string());

        if (!replyData.module) {
          log.warn('Received stats response with missing module name', {
            producer: 'admin',
            replySubject,
          });
          return;
        }

        responses.push(replyData);
        expectedResponses.delete(replyData.module);

        // Finish early if all expected responses received
        if (expectedResponses.size === 0 && !allResponsesReceived) {
          allResponsesReceived = true;
          sendStatsReport();
        }
      } catch (error) {
        log.error('Failed to parse stats response', {
          producer: 'admin',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Send stats.emit.request to all modules
    const statsRequest = { replyChannel };
    void nats.publish('stats.emit.request', JSON.stringify(statsRequest));
    metrics.recordNatsPublish('bot_stats_request');

    // 5 second timeout
    const timeoutId = setTimeout(() => {
      if (!allResponsesReceived) {
        allResponsesReceived = true;
        sendStatsReport();
      }
    }, 5000);
  } catch (error) {
    log.error('Failed to process bot-stats command', {
      producer: 'admin',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    metrics.recordError('bot_stats_command');
    metrics.recordCommand(data.platform || 'unknown', data.network || 'unknown', data.channel || 'unknown', 'error');

    try {
      const errorMessage = {
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
        text: `Error: Failed to process bot-stats command: ${error instanceof Error ? error.message : String(error)}`,
        trace: data.trace,
      };
      const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
      void nats.publish(responseTopic, JSON.stringify(errorMessage));
      metrics.recordNatsPublish('bot_stats_exception_response');
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
