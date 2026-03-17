'use strict';

import { NatsClient, log } from '@eeveebot/libeevee';
import { AdminRootConfig } from '../../types/admin.types.mjs';
import { isAuthenticatedAdmin } from '../auth.mjs';
import { recordAdminCommand, recordAdminError, recordProcessingTime } from '../metrics.mjs';

/**
 * Handle the admin part command
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 * @param subject - The NATS subject
 * @param message - The NATS message
 */
export async function handlePartCommand(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig,
  subject: string,
  message: { string(): string }
): Promise<void> {
  const startTime = Date.now();
  try {
    const data = JSON.parse(message.string());
    log.info('Received command.execute for part', {
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
      log.warn('Unauthorized part command attempt', {
        producer: 'admin',
        platform: data.platform,
        user: data.user,
        userHost: data.userHost,
        channel: data.channel,
      });
      recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'part', 'unauthorized');
      return;
    }

    // Extract channel from command text (format: "#channel")
    const channel = data.text.trim();
    if (!channel) {
      log.warn('Invalid part command format', {
        producer: 'admin',
        text: data.text,
      });
      recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'part', 'invalid_format');
      return;
    }

    // Publish control message to NATS
    const controlMessage = {
      action: 'part',
      data: {
        channel: channel,
      },
      platform: data.platform,
      instance: data.instance,
      trace: data.trace,
    };

    const controlTopic = `control.chatConnectors.${data.platform}.${data.instance}`;
    void nats.publish(controlTopic, JSON.stringify(controlMessage));

    log.info(`Published part control message for ${channel}`, {
      producer: 'admin',
      topic: controlTopic,
    });
    
    // Record successful command execution
    recordAdminCommand(data.platform, data.network || 'unknown', data.channel, 'part', 'success');
  } catch (error) {
    log.error('Failed to process part command', {
      producer: 'admin',
      message: message.string(),
      error: error,
    });
    // Record error
    recordAdminError('part_command', 'process');
    if (typeof error === 'object' && error !== null && 'platform' in error && 'channel' in error) {
      recordAdminCommand(
        error.platform,
        error.network || 'unknown',
        error.channel,
        'part',
        'error'
      );
    } else {
      recordAdminCommand('unknown', 'unknown', 'unknown', 'part', 'error');
    }
  } finally {
    // Record processing time
    const duration = Date.now() - startTime;
    recordProcessingTime(duration / 1000); // Convert to seconds
  }
}