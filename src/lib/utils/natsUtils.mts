'use strict';

import { NatsClient } from '@eeveebot/libeevee';

/**
 * Set up NATS connection
 * @param natsHost - The NATS host
 * @param natsToken - The NATS token
 * @returns Promise resolving to connected NATS client
 */
export async function setupNatsConnection(
  natsHost: string,
  natsToken: string
): Promise<InstanceType<typeof NatsClient>> {
  const nats = new NatsClient({
    natsHost: natsHost,
    natsToken: natsToken,
  });
  await nats.connect();
  return nats;
}