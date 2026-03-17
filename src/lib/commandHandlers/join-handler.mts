'use strict';

import { NatsClient, log } from '@eeveebot/libeevee';
import { AdminRootConfig } from '../../types/admin.types.mjs';
import { isAuthenticatedAdmin } from '../auth.mjs';
import { recordAdminCommand, recordAdminError, recordProcessingTime } from '../metrics.mjs';

/**
 * Handle the admin join command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handleJoinCommand(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig,
  subject: string,
  message: { string(): string }
): Promise<void> {
  const startTime = Date.now();
  try {
    const data = JSON.parse(message.string());
    log.info('Received command.execute for join', {
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
      log.warn('Unauthorized join command attempt', {
        producer: 'admin',
        platform: data.platform,
        user: data.user,
        userHost: data.userHost,
        channel: data.channel,
      });
      recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'join', 'unauthorized');
      return;
    }

    // Extract channel and optional key from command text (format: "#channel [key]")
    const parts = data.text.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) {
      log.warn('Invalid join command format', {
        producer: 'admin',
        text: data.text,
      });
      recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'join', 'invalid_format');
      return;
    }

    const channel = parts[0];
    const key = parts.length > 1 ? parts[1] : undefined;

    // Publish control message to NATS
    const controlMessage: {
      action: string;
      data: {
        channel: string;
        key?: string;
      };
      platform: string;
      instance: string;
      trace: string;
    } = {
      action: 'join',
      data: {
        channel: channel,
      },
      platform: data.platform,
      instance: data.instance,
      trace: data.trace,
    };

    // Add key to data if provided
    if (key) {
      controlMessage.data.key = key;
    }

    // Publish control message to NATS
    const controlTopic = `control.chatConnectors.${data.platform}.${data.instance}`;
    void nats.publish(controlTopic, JSON.stringify(controlMessage));

    log.info(`Published join control message for ${channel}`, {
      producer: 'admin',
      topic: controlTopic,
    });
    
    // Record successful command execution
    recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'join', 'success');
  } catch (error) {
    log.error('Failed to process join command', {
      producer: 'admin',
      message: message.string(),
      error: error,
    });
    // Record error
    recordAdminError('join_command', 'process');
    if (typeof error === 'object' && error !== null && 'platform' in error && 'channel' in error) {
      recordAdminCommand(
        error.platform,
        error.network || 'unknown',
        error.channel,
        'join',
        'error'
      );
    } else {
      recordAdminCommand('unknown', 'unknown', 'unknown', 'join', 'error');
    }
  } finally {
    // Record processing time
    const duration = Date.now() - startTime;
    recordProcessingTime(duration / 1000); // Convert to seconds
  }
}