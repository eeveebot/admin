'use strict';

import { NatsClient, log, ModuleMetrics } from '@eeveebot/libeevee';
import { AdminRootConfig } from '../../types/admin.types.mjs';
import { isAuthenticatedAdmin } from '../auth.mjs';

/**
 * Handle the admin show-command-registry command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleShowCommandRegistryCommand(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig,
  metrics: ModuleMetrics,
  subject: string,
  message: { string(): string }
): Promise<void> {
  const startTime = Date.now();
  let data: Record<string, any> = {};
  try {
    data = JSON.parse(message.string());
    log.info('Received command.execute for show-command-registry', {
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
      log.warn('Unauthorized show-command-registry command attempt', {
        producer: 'admin',
        platform: data.platform,
        user: data.user,
        userHost: data.userHost,
        channel: data.channel,
      });
      metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'unauthorized');
      return;
    }

    // Send a message to the router to gather command registry information
    const requestMessage = {
      action: 'get-command-registry',
      requester: {
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
      },
      trace: data.trace,
    };

    // Publish request to router
    void nats.publish('admin.request.router', JSON.stringify(requestMessage));
    metrics.recordNatsPublish('command_registry_request');

    log.info('Requested command registry from router', {
      producer: 'admin',
      trace: data.trace,
    });
    
    // Record successful command execution
    metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'success');
  } catch (error) {
    log.error('Failed to process show-command-registry command', {
      producer: 'admin',
      error: error,
    });
    // Record error
    metrics.recordError('show_command_registry_command');
    metrics.recordCommand(data.platform || 'unknown', data.network || 'unknown', data.channel || 'unknown', 'error');
  } finally {
    // Record processing time
    const duration = Date.now() - startTime;
    metrics.recordProcessingTime(duration / 1000); // Convert to seconds
  }
}