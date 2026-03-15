'use strict';

import { NatsClient, log } from '@eeveebot/libeevee';

/**
 * Set up signal handlers for graceful shutdown
 * @param natsClients - Array of NATS clients to drain on shutdown
 */
export function setupSignalHandlers(
  natsClients: InstanceType<typeof NatsClient>[]
): void {
  //
  // Do whatever teardown is necessary before calling common handler
  process.on('SIGINT', () => {
    natsClients.forEach((natsClient) => {
      void natsClient.drain();
    });
  });

  process.on('SIGTERM', () => {
    natsClients.forEach((natsClient) => {
      void natsClient.drain();
    });
  });
}

/**
 * Set up NATS connection
 * @param natsHost - The NATS host
 * @param natsToken - The NATS token
 * @returns Promise resolving to connected NATS client
 */
export async function setupNatsConnection(
  natsHost: string,
  natsToken: string
): Promise<InstanceType<typeof NatsClient>> {
  const nats = new NatsClient({
    natsHost: natsHost,
    natsToken: natsToken,
  });
  await nats.connect();
  return nats;
}

/**
 * Validate environment variables
 * @throws Error if required environment variables are missing
 */
export function validateEnvironmentVariables(): {
  natsHost: string;
  natsToken: string;
} {
  // Get host and token
  const natsHost = process.env.NATS_HOST || false;
  if (!natsHost) {
    const msg = 'environment variable NATS_HOST is not set.';
    throw new Error(msg);
  }

  const natsToken = process.env.NATS_TOKEN || false;
  if (!natsToken) {
    const msg = 'environment variable NATS_TOKEN is not set.';
    throw new Error(msg);
  }

  return {
    natsHost: natsHost as string,
    natsToken: natsToken as string,
  };
}

/**
 * Module statistics
 */
interface ModuleStats {
  nats_publish_count: number;
  [key: string]: number | string;
}

/**
 * Parsed metrics with optional modules property
 */
interface ParsedMetrics extends Record<
  string,
  number | string | Record<string, ModuleStats> | undefined
> {
  modules?: Record<string, ModuleStats>;
  [key: string]: number | string | Record<string, ModuleStats> | undefined;
}

/**
 * Parsed metrics with optional modules property
 */
interface ParsedMetrics extends Record<
  string,
  number | string | Record<string, ModuleStats> | undefined
> {
  modules?: Record<string, ModuleStats>;
}

/**
 * Parsed metrics with optional modules property
 */
interface ParsedMetrics extends Record<
  string,
  number | string | Record<string, ModuleStats> | undefined
> {
  modules?: Record<string, ModuleStats>;
}

/**
 * Parse Prometheus metrics text and extract key statistics
 * @param metricsText - The raw Prometheus metrics text
 * @returns Object containing parsed metrics
 */
export function parsePrometheusMetrics(metricsText: string): ParsedMetrics {
  try {
    // Handle empty or invalid input
    if (!metricsText || typeof metricsText !== 'string') {
      return {};
    }

    // Split the text into lines
    const lines = metricsText.split('\n');
    const result: ParsedMetrics = {};

    // Track totals for counters
    let totalMessages = 0;
    let totalCommands = 0;
    let totalBroadcasts = 0;
    let totalErrors = 0;

    // Store timing metrics for analysis
    const messageTiming: number[] = [];
    const commandTiming: number[] = [];

    // Process each line
    for (const line of lines) {
      try {
        // Skip comments and empty lines
        if (line.startsWith('#') || line.trim() === '') {
          continue;
        }

        // Generic counter pattern: metric_name{labels} value
        const counterMatch = line.match(/^([a-zA-Z0-9_]+)\{([^}]*)\}\s+(\d+)/);
        if (counterMatch) {
          const metricName = counterMatch[1];
          const labelsStr = counterMatch[2];
          const value = parseInt(counterMatch[3], 10);

          // Skip if value is NaN
          if (isNaN(value)) {
            continue;
          }

          // Parse labels
          const labels: Record<string, string> = {};
          const labelPairs = labelsStr.split(',');
          for (const pair of labelPairs) {
            const [key, value] = pair.split('=');
            if (key && value) {
              labels[key.trim()] = value.replace(/"/g, '').trim();
            }
          }

          // Handle specific metrics based on their names and labels
          switch (metricName) {
            case 'messages_total':
              if (labels.result === 'processed') {
                totalMessages += value;
                const current = result.messages_processed_count
                  ? Number(result.messages_processed_count)
                  : 0;
                result.messages_processed_count = current + value;
              } else if (labels.result === 'error') {
                totalErrors += value;
                const current = result.errors_total
                  ? Number(result.errors_total)
                  : 0;
                result.errors_total = current + value;
              }
              break;

            case 'commands_total':
              if (labels.rate_limit_action === 'allowed') {
                totalCommands += value;
                const current = result.commands_processed_count
                  ? Number(result.commands_processed_count)
                  : 0;
                result.commands_processed_count = current + value;
              } else if (
                labels.rate_limit_action === 'dropped' ||
                labels.rate_limit_action === 'enqueued'
              ) {
                totalErrors += value;
                const current = result.errors_total
                  ? Number(result.errors_total)
                  : 0;
                result.errors_total = current + value;
              }
              break;

            case 'broadcasts_total':
              totalBroadcasts += value;
              {
                const current = result.broadcasts_processed_count
                  ? Number(result.broadcasts_processed_count)
                  : 0;
                result.broadcasts_processed_count = current + value;
              }
              break;

            case 'connections_total':
              if (labels.result === 'success') {
                const currentConnections = result.connections_successful
                  ? Number(result.connections_successful)
                  : 0;
                result.connections_successful = currentConnections + value;
              }
              break;

            case 'nats_publish_total': {
              const moduleName = labels.module;
              if (moduleName) {
                const currentNats = result.nats_messages_published
                  ? Number(result.nats_messages_published)
                  : 0;
                result.nats_messages_published = currentNats + value;

                // Also track per-module stats
                const modules = result.modules || {};
                if (!modules[moduleName]) {
                  modules[moduleName] = { nats_publish_count: 0 };
                }
                modules[moduleName].nats_publish_count += value;
                result.modules = modules;
              }
              break;
            }

            case 'active_connections': {
              const currentActive = result.active_connections
                ? Number(result.active_connections)
                : 0;
              result.active_connections = currentActive + value;
              break;
            }

            case 'active_channels': {
              const currentActiveChannels = result.active_channels
                ? Number(result.active_channels)
                : 0;
              result.active_channels = currentActiveChannels + value;
              break;
            }
          }
        }

        // Histogram sum patterns
        const histogramSumMatch = line.match(
          /^([a-zA-Z0-9_]+)_sum\{([^}]*)\}\s+([\d.]+)/
        );
        if (histogramSumMatch) {
          const metricName = histogramSumMatch[1];
          const value = parseFloat(histogramSumMatch[3]);

          // Skip if value is NaN
          if (isNaN(value)) {
            continue;
          }

          switch (metricName) {
            case 'message_processing_seconds':
              messageTiming.push(value);
              break;
            case 'command_processing_seconds':
              commandTiming.push(value);
              break;
          }
        }

        // Histogram count patterns
        const histogramCountMatch = line.match(
          /^([a-zA-Z0-9_]+)_count\{([^}]*)\}\s+(\d+)/
        );
        if (histogramCountMatch) {
          const metricName = histogramCountMatch[1];
          const value = parseInt(histogramCountMatch[3], 10);

          // Skip if value is NaN
          if (isNaN(value)) {
            continue;
          }

          if (metricName === 'command_processing_seconds') {
            if (result.command_processing_count === undefined) {
              result.command_processing_count = value;
            }
          }
        }
      } catch (lineError) {
        // Log error but continue processing other lines
        log.warn('Failed to parse metrics line', {
          producer: 'admin-utils',
          line: line,
          error: lineError,
        });
        continue;
      }
    }

    // Calculate percentiles for timing metrics if we have data
    if (messageTiming.length > 0) {
      messageTiming.sort((a, b) => a - b);
      result.message_p50_time_ms = Math.round(
        messageTiming[Math.floor(messageTiming.length * 0.5)] * 1000
      );
      result.message_p95_time_ms = Math.round(
        messageTiming[Math.floor(messageTiming.length * 0.95)] * 1000
      );
      result.message_p99_time_ms = Math.round(
        messageTiming[Math.floor(messageTiming.length * 0.99)] * 1000
      );
    }

    if (commandTiming.length > 0) {
      commandTiming.sort((a, b) => a - b);
      result.command_p50_time_ms = Math.round(
        commandTiming[Math.floor(commandTiming.length * 0.5)] * 1000
      );
      result.command_p95_time_ms = Math.round(
        commandTiming[Math.floor(commandTiming.length * 0.95)] * 1000
      );
      result.command_p99_time_ms = Math.round(
        commandTiming[Math.floor(commandTiming.length * 0.99)] * 1000
      );
    }

    // Calculate error rates if we have sufficient data
    if (totalMessages > 0) {
      result.error_rate_percent =
        Math.round((totalErrors / totalMessages) * 10000) / 100;
    }

    // Add total counters to result (used by command handlers)
    result.total_commands = totalCommands;
    result.total_broadcasts = totalBroadcasts;

    return result;
  } catch (error) {
    // If parsing fails, log error and return empty object
    log.error('Failed to parse Prometheus metrics', {
      producer: 'admin-utils',
      error: error,
    });
    return {};
  }
}
