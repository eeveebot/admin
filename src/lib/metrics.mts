import {
  commandCounter,
  commandProcessingTime,
  commandErrorCounter,
  natsPublishCounter,
  natsSubscribeCounter,
  errorCounter,
  log,
} from '@eeveebot/libeevee';

// Function to record command execution
export function recordAdminCommand(
  platform: string,
  network: string,
  channel: string,
  command: string,
  result: string
): void {
  try {
    commandCounter.inc({
      module: 'admin',
      platform,
      network,
      channel,
      result,
    });
  } catch (error) {
    log.error('Failed to record admin command metric', {
      producer: 'admin-metrics',
      error,
    });
  }
}

// Function to record processing time
export function recordProcessingTime(duration: number): void {
  try {
    commandProcessingTime.observe({ module: 'admin' }, duration);
  } catch (error) {
    log.error('Failed to record admin processing time metric', {
      producer: 'admin-metrics',
      error,
    });
  }
}

// Function to record errors
export function recordAdminError(errorType: string, operation: string): void {
  try {
    errorCounter.inc({
      module: 'admin',
      type: errorType,
      operation,
    });
  } catch (error) {
    log.error('Failed to record admin error metric', {
      producer: 'admin-metrics',
      error,
    });
  }
}

// Function to record command errors
export function recordAdminCommandError(errorType: string): void {
  try {
    commandErrorCounter.inc({
      module: 'admin',
      type: errorType,
    });
  } catch (error) {
    log.error('Failed to record admin command error metric', {
      producer: 'admin-metrics',
      error,
    });
  }
}

// Function to record NATS publish operations
export function recordNatsPublish(subject: string, messageType: string): void {
  try {
    natsPublishCounter.inc({
      module: 'admin',
      type: messageType,
    });
  } catch (error) {
    log.error('Failed to record NATS publish metric', {
      producer: 'admin-metrics',
      error,
    });
  }
}

// Function to record NATS subscribe operations
export function recordNatsSubscribe(subject: string): void {
  try {
    natsSubscribeCounter.inc({
      module: 'admin',
      subject: subject,
    });
  } catch (error) {
    log.error('Failed to record NATS subscribe metric', {
      producer: 'admin-metrics',
      error,
    });
  }
}