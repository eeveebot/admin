'use strict';

import { NatsClient } from '@eeveebot/libeevee';

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
 * Parsed metrics with optional modules property
 */
interface ParsedMetrics extends Record<string, number | string | Record<string, ModuleStats> | undefined> {
  modules?: Record<string, ModuleStats>;
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
interface ParsedMetrics extends Record<string, number | string | Record<string, ModuleStats> | undefined> {
  modules?: Record<string, ModuleStats>;
}

/**
 * Parsed metrics with optional modules property
 */
interface ParsedMetrics extends Record<string, number | string | Record<string, ModuleStats> | undefined> {
  modules?: Record<string, ModuleStats>;
}

/**
 * Parse Prometheus metrics text and extract key statistics
 * @param metricsText - The raw Prometheus metrics text
 * @returns Object containing parsed metrics
 */
export function parsePrometheusMetrics(
  metricsText: string
): ParsedMetrics {
  try {
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
      // Skip comments and empty lines
      if (line.startsWith('#') || line.trim() === '') {
        continue;
      }

      // Message counter patterns
      const messageMatch = line.match(
        /^messages_total\{[^}]*result="processed"[^}]*\}\s+(\d+)/
      );
      if (messageMatch) {
        const count = parseInt(messageMatch[1], 10);
        totalMessages += count;
        const current = result.messages_processed_count ? Number(result.messages_processed_count) : 0;
        result.messages_processed_count = current + count;
      }

      const messageErrorMatch = line.match(
        /^messages_total\{[^}]*result="error"[^}]*\}\s+(\d+)/
      );
      if (messageErrorMatch) {
        const count = parseInt(messageErrorMatch[1], 10);
        totalErrors += count;
        const current = result.errors_total ? Number(result.errors_total) : 0;
        result.errors_total = current + count;
      }

      // Command counter patterns
      const commandMatch = line.match(
        /^commands_total\{[^}]*rate_limit_action="allowed"[^}]*\}\s+(\d+)/
      );
      if (commandMatch) {
        const count = parseInt(commandMatch[1], 10);
        totalCommands += count;
        const current = result.commands_processed_count ? Number(result.commands_processed_count) : 0;
        result.commands_processed_count = current + count;
      }

      const commandErrorMatch = line.match(
        /^commands_total\{[^}]*rate_limit_action="(dropped|enqueued)"[^}]*\}\s+(\d+)/
      );
      if (commandErrorMatch) {
        const count = parseInt(commandErrorMatch[2], 10);
        totalErrors += count;
        const current = result.errors_total ? Number(result.errors_total) : 0;
        result.errors_total = current + count;
      }

      // Broadcast counter patterns
      const broadcastMatch = line.match(
        /^broadcasts_total\{[^}]*\}\s+(\d+)/
      );
      if (broadcastMatch) {
        const count = parseInt(broadcastMatch[1], 10);
        totalBroadcasts += count;
        const current = result.broadcasts_processed_count ? Number(result.broadcasts_processed_count) : 0;
        result.broadcasts_processed_count = current + count;
      }

      // Timing histogram patterns
      const messageTimeSumMatch = line.match(
        /^message_processing_seconds_sum\{[^}]*\}\s+([\d.]+)/
      );
      if (messageTimeSumMatch) {
        messageTiming.push(parseFloat(messageTimeSumMatch[1]));
      }

      const commandTimeSumMatch = line.match(
        /^command_processing_seconds_sum\{[^}]*\}\s+([\d.]+)/
      );
      if (commandTimeSumMatch) {
        commandTiming.push(parseFloat(commandTimeSumMatch[1]));
      }

      const commandTimeCountMatch = line.match(
        /^command_processing_seconds_count\{[^}]*\}\s+(\d+)/
      );
      if (commandTimeCountMatch) {
        if (result.command_processing_count === undefined) {
          result.command_processing_count = parseInt(
            commandTimeCountMatch[1],
            10
          );
        }
      }

      // Generic connection metrics
      const connectionSuccessMatch = line.match(
        /^connections_total\{[^}]*module="connector-irc"[^}]*result="success"[^}]*\}\s+(\d+)/
      );
      if (connectionSuccessMatch) {
        const currentConnections = result.connections_successful ? Number(result.connections_successful) : 0;
        result.connections_successful = currentConnections + parseInt(connectionSuccessMatch[1], 10);
      }

      const activeConnectionsMatch = line.match(
        /^active_connections\{[^}]*module="connector-irc"[^}]*\}\s+(\d+)/
      );
      if (activeConnectionsMatch) {
        const currentActive = result.active_connections ? Number(result.active_connections) : 0;
        result.active_connections = currentActive + parseInt(activeConnectionsMatch[1], 10);
      }

      const channelsJoinedMatch = line.match(
        /^channels_total\{[^}]*module="connector-irc"[^}]*action="join"[^}]*\}\s+(\d+)/
      );
      if (channelsJoinedMatch) {
        const currentChannels = result.channels_joined ? Number(result.channels_joined) : 0;
        result.channels_joined = currentChannels + parseInt(channelsJoinedMatch[1], 10);
      }

      const activeChannelsMatch = line.match(
        /^active_channels\{[^}]*module="connector-irc"[^}]*\}\s+(\d+)/
      );
      if (activeChannelsMatch) {
        const currentActiveChannels = result.active_channels ? Number(result.active_channels) : 0;
        result.active_channels = currentActiveChannels + parseInt(activeChannelsMatch[1], 10);
      }

      // Generic pattern for NATS publish counters from any module
      const natsPublishMatch = line.match(
        /^nats_publish_total\{[^}]*module="([^}]+)"[^}]*\}\s+(\d+)/
      );
      if (natsPublishMatch) {
        const moduleName = natsPublishMatch[1];
        const count = parseInt(natsPublishMatch[2], 10);
        const currentNats = result.nats_messages_published ? Number(result.nats_messages_published) : 0;
        result.nats_messages_published = currentNats + count;
        
        // Also track per-module stats
        const modules = result.modules || {};
        if (!modules[moduleName]) {
          modules[moduleName] = { nats_publish_count: 0 };
        }
        modules[moduleName].nats_publish_count += count;
        result.modules = modules;
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
  } catch {
    // If parsing fails, return empty object
    return {};
  }
}
