'use strict';

/**
 * Validate environment variables
 * @throws Error if required environment variables are missing
 */
export function validateEnvironmentVariables(): {
  natsHost: string;
  natsToken: string;
} {
  // Get host and token
  const natsHost = process.env.NATS_HOST || false;
  if (!natsHost) {
    const msg = 'environment variable NATS_HOST is not set.';
    throw new Error(msg);
  }

  const natsToken = process.env.NATS_TOKEN || false;
  if (!natsToken) {
    const msg = 'environment variable NATS_TOKEN is not set.';
    throw new Error(msg);
  }

  return {
    natsHost: natsHost as string,
    natsToken: natsToken as string,
  };
}