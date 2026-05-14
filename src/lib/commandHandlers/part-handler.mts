'use strict';

import { NatsClient, log, ModuleMetrics } from '@eeveebot/libeevee';
import { AdminRootConfig } from '../../types/admin.types.mjs';
import { isAuthenticatedAdmin } from '../auth.mjs';

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
  metrics: ModuleMetrics,
  subject: string,
  message: { string(): string }
): Promise<void> {
  const startTime = Date.now();
  let data: Record<string, any> = {};
  try {
    data = JSON.parse(message.string());
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
      metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'unauthorized');
      return;
    }

    // Extract channel from command text (format: "#channel")
    const channel = data.text.trim();
    if (!channel) {
      log.warn('Invalid part command format', {
        producer: 'admin',
        text: data.text,
      });
      metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'invalid_format');
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
    metrics.recordCommand(data.platform, data.network || 'unknown', data.channel, 'success');
  } catch (error) {
    log.error('Failed to process part command', {
      producer: 'admin',
      error: error,
    });
    // Record error
    metrics.recordError('part_command');
    metrics.recordCommand(data.platform || 'unknown', data.network || 'unknown', data.channel || 'unknown', 'error');
  } finally {
    // Record processing time
    const duration = Date.now() - startTime;
    metrics.recordProcessingTime(duration / 1000); // Convert to seconds
  }
}