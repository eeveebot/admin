'use strict';

import { NatsClient, log, ModuleMetrics } from '@eeveebot/libeevee';
import { AdminRootConfig } from '../../types/admin.types.mjs';
import type { CommandMessageData } from '../../types/admin.types.mjs';
import { isAuthenticatedAdmin } from '../auth.mjs';

/**
 * Handle the admin module-restart command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleModuleRestartCommand(
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
    log.info('Received command.execute for module-restart', {
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
      log.warn('Unauthorized module-restart command attempt', {
        producer: 'admin',
        platform: data.platform,
        user: data.user,
        userHost: data.userHost,
        channel: data.channel,
      });
      metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'unauthorized');
      return;
    }

    // Extract module name from command text (format: "$MODULE")
    const moduleName = (data.text ?? "").trim();
    if (!moduleName) {
      log.warn('Invalid module-restart command format', {
        producer: 'admin',
        text: data.text ?? "",
      });
      metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'invalid_format');
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
      metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'config_error');
      return;
    }

    // Send restart request to operator API
    void (async () => {
      try {
        const response = await fetch(`${apiUrl}/api/action/restart-module`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            moduleName: moduleName,
            namespace: process.env.NAMESPACE || 'eevee-bot',
          }),
        });

        if (response.ok) {
          log.info(
            `Successfully sent restart request for module ${moduleName}`,
            {
              producer: 'admin',
              moduleName,
            }
          );

          // Send confirmation message back to user
          const responseMessage = {
            platform: data.platform,
            instance: data.instance,
            channel: data.channel,
            user: data.user,
            text: `Module restart request sent for: ${moduleName}`,
            trace: data.trace,
          };

          const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
          void nats.publish(responseTopic, JSON.stringify(responseMessage));
          metrics.recordNatsPublish('module_restart_success_response');
          
          // Record successful command execution
          metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'success');
        } else {
          const errorText = await response.text();
          log.error(`Failed to restart module ${moduleName}`, {
            producer: 'admin',
            moduleName,
            status: response.status,
            error: errorText,
          });

          // Send error message back to user
          const responseMessage = {
            platform: data.platform,
            instance: data.instance,
            channel: data.channel,
            user: data.user,
            text: `Failed to send restart request for module ${moduleName}. Status: ${response.status}`,
            trace: data.trace,
          };

          const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
          void nats.publish(responseTopic, JSON.stringify(responseMessage));
          metrics.recordNatsPublish('module_restart_error_response');
          metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'api_error');
        }
      } catch (error) {
        log.error(`Error sending restart request for module ${moduleName}`, {
          producer: 'admin',
          moduleName,
          error: error instanceof Error ? error.message : String(error),
        });

        // Send error message back to user
        const responseMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: `Error sending restart request for module ${moduleName}: ${error instanceof Error ? error.message : String(error)}`,
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(responseMessage));
        metrics.recordNatsPublish('module_restart_exception_response');
        metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'exception');
      }
    })();
  } catch (error) {
    log.error('Failed to process module-restart command', {
      producer: 'admin',
      error: error,
    });
    // Record error
    metrics.recordError('module_restart_command');
    metrics.recordCommand(data.platform || 'unknown', data.network || 'unknown', data.channel || 'unknown', 'error');
  } finally {
    // Record processing time
    const duration = Date.now() - startTime;
    metrics.recordProcessingTime(duration / 1000); // Convert to seconds
  }
}