'use strict';

import { NatsClient, log } from '@eeveebot/libeevee';
import * as crypto from 'crypto';
import AsciiTable from 'ascii-table';
import { AdminRootConfig } from '../../types/admin.types.mjs';
import { isAuthenticatedAdmin } from '../auth.mjs';
import { recordAdminCommand, recordAdminError, recordProcessingTime, recordNatsPublish } from '../metrics.mjs';

// Interfaces for type safety
interface UptimeResponse {
  module: string;
  uptimeFormatted: string;
  [key: string]: string | number | boolean | object | null | undefined;
}

/**
 * Handle the admin module-uptime command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleModuleUptimeCommand(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig,
  subject: string,
  message: { string(): string }
): Promise<void> {
  const startTime = Date.now();
  try {
    const data = JSON.parse(message.string());
    log.info('Received command.execute for module-uptime', {
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
      log.warn('Unauthorized module-uptime command attempt', {
        producer: 'admin',
        platform: data.platform,
        user: data.user,
        userHost: data.userHost,
        channel: data.channel,
      });
      recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'module-uptime', 'unauthorized');
      return;
    }

    // Get required environment variables for operator API
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
      recordNatsPublish(errorTopic, 'module_uptime_error_response');
      recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'module-uptime', 'config_error');
      return;
    }

    // Fetch bot modules from operator API
    let modulesResponse;
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

      modulesResponse = await response.json();
    } catch (fetchError) {
      log.error('Failed to fetch bot modules from operator API', {
        producer: 'admin',
        error:
          fetchError instanceof Error ? fetchError.message : String(fetchError),
      });

      // Send error message back to user
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
      recordNatsPublish(errorTopic, 'module_uptime_fetch_error_response');
      recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'module-uptime', 'fetch_error');
      return;
    }

    // Extract module names from the response
    const moduleNames: string[] = Array.isArray(modulesResponse)
      ? (modulesResponse as Array<{name: string}>)
          .map((module) => module.name)
          .filter(Boolean)
      : [];

    if (moduleNames.length === 0) {
      // Send message back to user that no modules were found
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
      recordNatsPublish(responseTopic, 'module_uptime_no_modules_response');
      recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'module-uptime', 'no_modules');
      return;
    }

    // Generate a unique reply channel for this request
    const replyChannel = `stats.uptime.reply.${crypto.randomUUID()}`;

    // Store responses we receive
    const responses: UptimeResponse[] = [];
    const expectedResponses = new Set(moduleNames);
    let allResponsesReceived = false;

    // Function to send the uptime report
    const sendUptimeReport = () => {
      // Clear the timeout if it's still active
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Format the responses as a message
      let responseText = 'Module Uptime Report:\n';

      if (responses.length === 0) {
        responseText += 'No modules responded within the timeout period.\n';
      } else {
        // Sort responses by module name
        responses.sort((a, b) => a.module.localeCompare(b.module));

        // Create a formatted table using ascii-table
        const table = new AsciiTable();
        table.setHeading('Module', 'Uptime');

        for (const response of responses) {
          table.addRow(response.module, response.uptimeFormatted);
        }

        responseText += table.toString() + '\n';
        responseText += `Total modules: ${responses.length}\n`;
        responseText += `Expected modules: ${moduleNames.length}\n`;

        // List modules that didn't respond
        const nonRespondingModules = Array.from(expectedResponses).sort();
        if (nonRespondingModules.length > 0) {
          responseText += `Non-responding modules: ${nonRespondingModules.join(', ')}\n`;
        }
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
      recordNatsPublish(responseTopic, 'module_uptime_report_response');

      log.info('Sent module uptime report to user', {
        producer: 'admin',
        user: data.user,
        channel: data.channel,
        platform: data.platform,
        instance: data.instance,
        moduleCount: responses.length,
        expectedModules: moduleNames.length,
        nonRespondingModules: Array.from(expectedResponses),
      });
      
      // Record successful command execution
      recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'module-uptime', 'success');
    };

    // Subscribe to the reply channel to collect responses
    await nats.subscribe(replyChannel, (replySubject, replyMessage) => {
      try {
        const replyData: UptimeResponse = JSON.parse(replyMessage.string());
        responses.push(replyData);

        // Remove this module from expected responses
        if (replyData.module) {
          expectedResponses.delete(replyData.module);
        }

        // If we've received responses from all expected modules, we can finish early
        if (expectedResponses.size === 0 && !allResponsesReceived) {
          allResponsesReceived = true;
          sendUptimeReport();
        }
      } catch (error) {
        log.error('Failed to parse uptime response', {
          producer: 'admin',
          error: error,
        });
      }
    });

    // Send stats.uptime request to all modules
    const uptimeRequest = {
      replyChannel: replyChannel,
    };
    void nats.publish('stats.uptime', JSON.stringify(uptimeRequest));
    recordNatsPublish('stats.uptime', 'module_uptime_request');

    // Wait 5 seconds for modules to respond, but finish early if all expected responses received
    const timeoutId = setTimeout(() => {
      if (!allResponsesReceived) {
        allResponsesReceived = true;
        sendUptimeReport();
      }
    }, 5000); // 5 second timeout
  } catch (error) {
    log.error('Failed to process module-uptime command', {
      producer: 'admin',
      message: message.string(),
      error: error,
    });
    // Record error
    recordAdminError('module_uptime_command', 'process');
    if (typeof error === 'object' && error !== null && 'platform' in error && 'channel' in error) {
      recordAdminCommand(
        error.platform,
        error.network || 'unknown',
        error.channel,
        'module-uptime',
        'error'
      );
    } else {
      recordAdminCommand('unknown', 'unknown', 'unknown', 'module-uptime', 'error');
    }
  } finally {
    // Record processing time
    const duration = Date.now() - startTime;
    recordProcessingTime(duration / 1000); // Convert to seconds
  }
}