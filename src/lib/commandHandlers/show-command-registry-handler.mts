'use strict';

import { NatsClient, log } from '@eeveebot/libeevee';
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
  subject: string,
  message: { string(): string }
): Promise<void> {
  try {
    const data = JSON.parse(message.string());
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

    log.info('Requested command registry from router', {
      producer: 'admin',
      trace: data.trace,
    });
  } catch (error) {
    log.error('Failed to process show-command-registry command', {
      producer: 'admin',
      message: message.string(),
      error: error,
    });
  }
}