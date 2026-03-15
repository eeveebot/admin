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
 * Parse Prometheus metrics text and extract key statistics
 * @param metricsText - The raw Prometheus metrics text
 * @returns Object containing parsed metrics
 */
export function parsePrometheusMetrics(
  metricsText: string
): Record<string, number | string> {
  try {
    // Split the text into lines
    const lines = metricsText.split('\n');
    const result: Record<string, number | string> = {};

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

      // Generic pattern for message counters from any module
      const messageMatch = line.match(
        /^(.+)_messages_total\{[^}]*\}\s+(\d+)/
      );
      if (messageMatch) {
        totalMessages += parseInt(messageMatch[2], 10);
        result.messages_processed_count = totalMessages;
      }

      // Generic pattern for command counters from any module
      const commandMatch = line.match(
        /^(.+)_commands_total\{[^}]*\}\s+(\d+)/
      );
      if (commandMatch) {
        totalCommands += parseInt(commandMatch[2], 10);
        result.commands_processed_count = totalCommands;
      }

      // Generic pattern for broadcast counters from any module
      const broadcastMatch = line.match(
        /^(.+)_broadcasts_total\{[^}]*\}\s+(\d+)/
      );
      if (broadcastMatch) {
        totalBroadcasts += parseInt(broadcastMatch[2], 10);
        result.broadcasts_processed_count = totalBroadcasts;
      }

      // Generic pattern for error counters from any module
      const errorMatch = line.match(/^(.+)_errors_total\{[^}]*\}\s+(\d+)/);
      if (errorMatch) {
        totalErrors += parseInt(errorMatch[2], 10);
        result.errors_total = totalErrors;
      }

      // Generic pattern for memory usage metrics from any module
      const rssMatch = line.match(
        /^(.+)_memory_usage_bytes\{type="rss"\}\s+(\d+)/
      );
      if (rssMatch) {
        const bytes = parseInt(rssMatch[2], 10);
        const currentRss = result.memory_rss_mb ? Number(result.memory_rss_mb) : 0;
        result.memory_rss_mb = currentRss + Math.round(bytes / (1024 * 1024));
      }

      const heapMatch = line.match(
        /^(.+)_memory_usage_bytes\{type="heap_used"\}\s+(\d+)/
      );
      if (heapMatch) {
        const bytes = parseInt(heapMatch[2], 10);
        const currentHeap = result.memory_heap_used_mb ? Number(result.memory_heap_used_mb) : 0;
        result.memory_heap_used_mb = currentHeap + Math.round(bytes / (1024 * 1024));
      }

      // Generic pattern for uptime metrics from any module
      const uptimeMatch = line.match(
        /^(.+)_uptime_seconds\s+(\d+(?:\.\d+)?)/
      );
      if (uptimeMatch) {
        // We'll use the first uptime value we find (typically from router)
        if (result.uptime_seconds === undefined) {
          const seconds = parseFloat(uptimeMatch[2]);
          result.uptime_seconds = seconds;
          result.uptime_formatted = `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${Math.floor(seconds % 60)}s`;
        }
      }

      // Generic pattern for message processing time buckets from any module
      const messageTimingMatch = line.match(
        /^(.+)_message_processing_seconds_bucket\{[^}]*le="([^"]+)"\}\s+(\d+)/
      );
      if (messageTimingMatch) {
        const bucket = parseFloat(messageTimingMatch[2]);
        const count = parseInt(messageTimingMatch[3], 10);
        // Store timing data for analysis
        for (let i = 0; i < count; i++) {
          messageTiming.push(bucket);
        }
      }

      // Generic pattern for command processing time buckets from any module
      const commandTimingMatch = line.match(
        /^(.+)_command_processing_seconds_bucket\{[^}]*le="([^"]+)"\}\s+(\d+)/
      );
      if (commandTimingMatch) {
        const bucket = parseFloat(commandTimingMatch[2]);
        const count = parseInt(commandTimingMatch[3], 10);
        // Store timing data for analysis
        for (let i = 0; i < count; i++) {
          commandTiming.push(bucket);
        }
      }

      // Generic pattern for message processing time sum from any module
      const messageTimeSumMatch = line.match(
        /^(.+)_message_processing_seconds_sum\s+(\d+(?:\.\d+)?)/
      );
      if (messageTimeSumMatch && totalMessages > 0) {
        // We'll calculate average based on total messages from all modules
        // This is a simplification but should work for most cases
        const sum = parseFloat(messageTimeSumMatch[2]);
        if (result.message_avg_processing_time_ms === undefined) {
          result.message_avg_processing_time_ms = Math.round(
            (sum / totalMessages) * 1000
          );
        }
      }

      // Generic pattern for message processing time count from any module
      const messageTimeCountMatch = line.match(
        /^(.+)_message_processing_seconds_count\s+(\d+)/
      );
      if (messageTimeCountMatch) {
        if (result.message_processing_count === undefined) {
          result.message_processing_count = parseInt(
            messageTimeCountMatch[2],
            10
          );
        }
      }

      // Generic pattern for command processing time sum from any module
      const commandTimeSumMatch = line.match(
        /^(.+)_command_processing_seconds_sum\s+(\d+(?:\.\d+)?)/
      );
      if (commandTimeSumMatch && totalCommands > 0) {
        // We'll calculate average based on total commands from all modules
        const sum = parseFloat(commandTimeSumMatch[2]);
        if (result.command_avg_processing_time_ms === undefined) {
          result.command_avg_processing_time_ms = Math.round(
            (sum / totalCommands) * 1000
          );
        }
      }

      // Generic pattern for command processing time count from any module
      const commandTimeCountMatch = line.match(
        /^(.+)_command_processing_seconds_count\s+(\d+)/
      );
      if (commandTimeCountMatch) {
        if (result.command_processing_count === undefined) {
          result.command_processing_count = parseInt(
            commandTimeCountMatch[2],
            10
          );
        }
      }

      // IRC-specific metrics
      const ircConnectionMatch = line.match(
        /^connector_irc_connections_total\{[^}]*result="success"[^}]*\}\s+(\d+)/
      );
      if (ircConnectionMatch) {
        const currentConnections = result.connections_successful ? Number(result.connections_successful) : 0;
        result.connections_successful = currentConnections + parseInt(ircConnectionMatch[1], 10);
      }

      const ircActiveConnectionsMatch = line.match(
        /^connector_irc_active_connections\{[^}]*\}\s+(\d+)/
      );
      if (ircActiveConnectionsMatch) {
        const currentActive = result.active_connections ? Number(result.active_connections) : 0;
        result.active_connections = currentActive + parseInt(ircActiveConnectionsMatch[1], 10);
      }

      const ircChannelsJoinedMatch = line.match(
        /^connector_irc_channels_total\{[^}]*action="join"[^}]*\}\s+(\d+)/
      );
      if (ircChannelsJoinedMatch) {
        const currentChannels = result.channels_joined ? Number(result.channels_joined) : 0;
        result.channels_joined = currentChannels + parseInt(ircChannelsJoinedMatch[1], 10);
      }

      const ircActiveChannelsMatch = line.match(
        /^connector_irc_active_channels\{[^}]*\}\s+(\d+)/
      );
      if (ircActiveChannelsMatch) {
        const currentActiveChannels = result.active_channels ? Number(result.active_channels) : 0;
        result.active_channels = currentActiveChannels + parseInt(ircActiveChannelsMatch[1], 10);
      }

      // Generic pattern for NATS publish counters from any module
      const natsPublishMatch = line.match(
        /^(.+)_nats_publish_total\{[^}]*\}\s+(\d+)/
      );
      if (natsPublishMatch) {
        const count = parseInt(natsPublishMatch[2], 10);
        const currentNats = result.nats_messages_published ? Number(result.nats_messages_published) : 0;
        result.nats_messages_published = currentNats + count;
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

    return result;
  } catch {
    // If parsing fails, return empty object
    return {};
  }
}
