'use strict';

import { NatsClient } from '@eeveebot/libeevee';

/**
 * Set up signal handlers for graceful shutdown
 * @param natsClients - Array of NATS clients to drain on shutdown
 */
export function setupSignalHandlers(
  natsClients: InstanceType<typeof NatsClient>[]
): void {
  //
  // Do whatever teardown is necessary before calling common handler
  process.on('SIGINT', () => {
    natsClients.forEach((natsClient) => {
      void natsClient.drain();
    });
  });

  process.on('SIGTERM', () => {
    natsClients.forEach((natsClient) => {
      void natsClient.drain();
    });
  });
}