'use strict';

import { NatsClient, log } from '@eeveebot/libeevee';
import AsciiTable from 'ascii-table';

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

/**
 * Handle router responses with command registry information
 * @param nats - The NATS client instance
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleRouterCommandRegistryResponse(
  nats: InstanceType<typeof NatsClient>,
  subject: string,
  message: { string(): string }
): Promise<void> {
  try {
    const data = JSON.parse(message.string());
    log.info('Received command registry from router', {
      producer: 'admin',
      trace: data.trace,
    });

    let responseText = '';

    // Check if this is an error response
    if (data.action === 'command-registry-error') {
      responseText = `Error retrieving command registry: ${data.error}\n`;
    } else {
      // Format the command registry as an ASCII table
      responseText = 'Command Registry:\n';

      if (!data.registry || data.registry.length === 0) {
        responseText += 'No commands registered.\n';
      } else {
        // Create ASCII table using ascii-table
        const table = new AsciiTable();
        table.setHeading(
          'Command Name',
          'UUID',
          'Platform',
          'Network',
          'Instance',
          'Channel',
          'User'
        );

        // Add each command entry
        for (const command of data.registry) {
          table.addRow(
            command.commandDisplayName || command.commandUUID,
            command.commandUUID,
            command.platformRegex.source,
            command.networkRegex.source,
            command.instanceRegex.source,
            command.channelRegex.source,
            command.userRegex.source
          );
        }

        responseText += table.toString() + '\n';
        responseText += `Total commands: ${data.registry.length}\n`;
      }
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

    log.info('Sent command registry to user', {
      producer: 'admin',
      user: data.requester.user,
      channel: data.requester.channel,
      platform: data.requester.platform,
      instance: data.requester.instance,
    });
  } catch (error) {
    log.error('Failed to process router command registry response', {
      producer: 'admin',
      message: message.string(),
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Try to send an error message back to the user
    try {
      const data = JSON.parse(message.string());
      if (data.requester) {
        const errorMessage = {
          platform: data.requester.platform,
          instance: data.requester.instance,
          channel: data.requester.channel,
          user: data.requester.user,
          text: 'Error: Failed to process command registry response',
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.requester.platform}.${data.requester.instance}.${data.requester.channel}`;
        void nats.publish(responseTopic, JSON.stringify(errorMessage));
      }
    } catch (sendError) {
      log.error('Failed to send error message to user', {
        producer: 'admin',
        error:
          sendError instanceof Error ? sendError.message : String(sendError),
      });
    }
  }
}
