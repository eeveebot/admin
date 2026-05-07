import { createModuleMetrics } from '@eeveebot/libeevee';

const metrics = createModuleMetrics('admin');

// Re-export the standard metrics
// recordNatsPublish accepts (subject, messageType) for backward compat,
// but only uses messageType (the module name is already set)
export function recordNatsPublish(subject: string, messageType: string): void {
  void subject;
  metrics.recordNatsPublish(messageType);
}

export const recordNatsSubscribe = metrics.recordNatsSubscribe;
export const recordProcessingTime = metrics.recordProcessingTime;

// Admin-specific wrappers that accept extra context args
export function recordAdminCommand(
  platform: string,
  network: string,
  channel: string,
  _command: string,
  result: string
): void {
  metrics.recordCommand(platform, network, channel, result);
}

export function recordAdminError(errorType: string, operation: string): void {
  void operation;
  metrics.recordError(errorType);
}
