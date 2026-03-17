'use strict';

import { NatsClient, log } from '@eeveebot/libeevee';
import AsciiTable from 'ascii-table';
import { recordNatsPublish } from '../metrics.mjs';

/**
 * Handle router responses with rate limit statistics
 * @param nats - The NATS client instance
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleRouterRatelimitStatsResponse(
  nats: InstanceType<typeof NatsClient>,
  subject: string,
  message: { string(): string }
): Promise<void> {
  try {
    const data = JSON.parse(message.string());
    log.info('Received rate limit statistics from router', {
      producer: 'admin',
      trace: data.trace,
    });

    // Format the statistics as an ASCII table
    let responseText = 'Rate Limit Statistics:\n';

    if (!data.stats || Object.keys(data.stats).length === 0) {
      responseText += 'No rate limit data available.\n';
    } else {
      // Create ASCII table using ascii-table
      const table = new AsciiTable();
      table.setHeading(
        'Command Name',
        'Identifier',
        'Count',
        'Limit',
        'Interval'
      );

      // Add each rate limit entry
      for (const [key, stat] of Object.entries(data.stats)) {
        // Type assertion for the stat object
        const typedStat = stat as {
          count: number;
          limit: number;
          interval: string;
          commandName?: string;
        };
        const parts = key.split(':');
        const commandUUID = parts[0];
        const identifier = parts.slice(1).join(':');
        // Use command name if available, otherwise fallback to UUID
        const commandName = typedStat.commandName || commandUUID;

        table.addRow(
          commandName,
          identifier,
          typedStat.count,
          typedStat.limit,
          typedStat.interval
        );
      }

      responseText += table.toString() + '\n';
      responseText += `Total entries: ${Object.keys(data.stats).length}\n`;
    }

    // Send the response back to the user/channel
    const responseMessage = {
      platform: data.requester.platform,
      instance: data.requester.instance,
      channel: data.requester.channel,
      user: data.requester.user,
      text: responseText,
      trace: data.trace,
    };

    const responseTopic = `chat.message.outgoing.${data.requester.platform}.${data.requester.instance}.${data.requester.channel}`;
    void nats.publish(responseTopic, JSON.stringify(responseMessage));
    recordNatsPublish(responseTopic, 'ratelimit_stats_response');

    log.info('Sent rate limit statistics to user', {
      producer: 'admin',
      user: data.requester.user,
      channel: data.requester.channel,
      platform: data.requester.platform,
      instance: data.requester.instance,
    });
  } catch (error) {
    log.error('Failed to process router rate limit stats response', {
      producer: 'admin',
      message: message.string(),
      error: error,
    });
  }
}