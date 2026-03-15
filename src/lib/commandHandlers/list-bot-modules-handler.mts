'use strict';

import { NatsClient, log } from '@eeveebot/libeevee';
import AsciiTable from 'ascii-table';
import { AdminRootConfig } from '../../types/admin.types.mjs';
import { isAuthenticatedAdmin } from '../auth.mjs';

/**
 * Handle the admin list-bot-modules command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleListBotModulesCommand(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig,
  subject: string,
  message: { string(): string }
): Promise<void> {
  void (async () => {
    try {
      const data = JSON.parse(message.string());
      log.info('Received command.execute for list-bot-modules', {
        producer: 'admin',
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
        originalText: data.originalText,
      });

      // Check if user is authenticated admin
      if (
        !isAuthenticatedAdmin(
          adminConfig,
          data.platform,
          data.user,
          data.userHost
        )
      ) {
        log.warn('Unauthorized list-bot-modules command attempt', {
          producer: 'admin',
          platform: data.platform,
          user: data.user,
          userHost: data.userHost,
          channel: data.channel,
        });
        return;
      }

      // Get required environment variables
      const apiToken = process.env.EEVEE_OPERATOR_API_TOKEN;
      const apiUrl = process.env.EEVEE_OPERATOR_API_URL;

      if (!apiToken || !apiUrl) {
        log.error(
          'Missing EEVEE_OPERATOR_API_TOKEN or EEVEE_OPERATOR_API_URL environment variables',
          {
            producer: 'admin',
          }
        );

        // Send error message back to user
        const responseMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: 'Error: Missing operator API configuration',
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(responseMessage));
        return;
      }

      // Fetch bot modules from operator API
      let response;
      try {
        response = await fetch(`${apiUrl}/api/bot-modules`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (fetchError) {
        log.error('Failed to connect to operator API', {
          producer: 'admin',
          error:
            fetchError instanceof Error
              ? fetchError.message
              : String(fetchError),
        });

        // Send error message back to user
        const responseMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: 'Error: Failed to connect to operator API',
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(responseMessage));
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        log.error('Failed to fetch bot modules from operator API', {
          producer: 'admin',
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });

        // Send error message back to user
        const responseMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: `Error: Failed to fetch bot modules. Status: ${response.status} (${response.statusText})`,
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(responseMessage));
        return;
      }

      let modulesResponse;
      try {
        modulesResponse = await response.json();
      } catch (parseError) {
        log.error('Failed to parse bot modules response from operator API', {
          producer: 'admin',
          error:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
        });

        // Send error message back to user
        const responseMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: 'Error: Failed to parse response from operator API',
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(responseMessage));
        return;
      }

      const modules: Array<{
        name: string;
        namespace: string;
        image: string;
        tag: string;
        enabled: boolean;
      }> = Array.isArray(modulesResponse) ? modulesResponse : [];

      // Format the response as a table
      let responseText = 'Bot Modules:\n';

      if (!modules || modules.length === 0) {
        responseText += 'No bot modules found.\n';
      } else {
        // Create ASCII table using ascii-table
        const table = new AsciiTable();
        table.setHeading('Name', 'Namespace', 'Image', 'Tag', 'Enabled');

        // Add each module entry
        for (const module of modules) {
          table.addRow(
            module.name,
            module.namespace,
            module.image,
            module.tag,
            module.enabled ? 'Yes' : 'No'
          );
        }

        responseText += table.toString() + '\n';
        responseText += `Total modules: ${modules.length}\n`;
      }

      // Send the response back to the user/channel
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

      log.info('Sent bot modules list to user', {
        producer: 'admin',
        user: data.user,
        channel: data.channel,
        platform: data.platform,
        instance: data.instance,
        moduleCount: modules.length,
      });
    } catch (error) {
      log.error('Failed to process list-bot-modules command', {
        producer: 'admin',
        message: message.string(),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Try to send error message back to user
      try {
        const data = JSON.parse(message.string());
        const errorMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: `Error: Failed to process list-bot-modules command: ${error instanceof Error ? error.message : String(error)}`,
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(errorMessage));
      } catch (sendError) {
        log.error('Failed to send error message to user', {
          producer: 'admin',
          error:
            sendError instanceof Error ? sendError.message : String(sendError),
        });
      }
    }
  })();
}