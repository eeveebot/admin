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
export function parsePrometheusMetrics(metricsText: string): Record<string, number | string> {
  try {
    // Split the text into lines
    const lines = metricsText.split('\n');
    const result: Record<string, number | string> = {};
    
    // Track totals for counters
    let totalMessages = 0;
    let totalCommands = 0;
    let totalBroadcasts = 0;
    let totalErrors = 0;
    
    // Process each line
    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || line.trim() === '') {
        continue;
      }
      
      // Parse counter metrics
      const messageMatch = line.match(/^router_messages_total\{[^}]*\}\s+(\d+)/);
      if (messageMatch) {
        totalMessages += parseInt(messageMatch[1], 10);
        result.messages_processed_count = totalMessages;
      }
      
      const commandMatch = line.match(/^router_commands_total\{[^}]*\}\s+(\d+)/);
      if (commandMatch) {
        totalCommands += parseInt(commandMatch[1], 10);
        result.commands_processed_count = totalCommands;
      }
      
      const broadcastMatch = line.match(/^router_broadcasts_total\{[^}]*\}\s+(\d+)/);
      if (broadcastMatch) {
        totalBroadcasts += parseInt(broadcastMatch[1], 10);
        result.broadcasts_processed_count = totalBroadcasts;
      }
      
      const errorMatch = line.match(/^router_errors_total\{[^}]*\}\s+(\d+)/);
      if (errorMatch) {
        totalErrors += parseInt(errorMatch[1], 10);
        result.errors_total = totalErrors;
      }
      
      // Parse memory usage metrics
      const rssMatch = line.match(/^router_memory_usage_bytes\{type="rss"\}\s+(\d+)/);
      if (rssMatch) {
        const bytes = parseInt(rssMatch[1], 10);
        result.memory_rss_mb = Math.round(bytes / (1024 * 1024));
      }
      
      const heapMatch = line.match(/^router_memory_usage_bytes\{type="heap_used"\}\s+(\d+)/);
      if (heapMatch) {
        const bytes = parseInt(heapMatch[1], 10);
        result.memory_heap_used_mb = Math.round(bytes / (1024 * 1024));
      }
      
      // Parse uptime metrics
      const uptimeMatch = line.match(/^router_uptime_seconds\s+(\d+(?:\.\d+)?)/);
      if (uptimeMatch) {
        const seconds = parseFloat(uptimeMatch[1]);
        result.uptime_seconds = seconds;
        result.uptime_formatted = `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${Math.floor(seconds % 60)}s`;
      }
    }
    
    return result;
  } catch {
    // If parsing fails, return empty object
    return {};
  }
}
