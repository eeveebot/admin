'use strict';

// Admin module
// manages bot administrators and permissions

import { NatsClient, log } from '@eeveebot/libeevee';
import { loadAdminConfig } from './lib/admin-config.mjs';
import { AdminRootConfig } from './types/admin.types.mjs';

const natsClients: InstanceType<typeof NatsClient>[] = [];
const natsSubscriptions: Array<Promise<string | boolean>> = [];

const adminJoinCommandUUID: string = '20a6f27e-bd12-4c5c-931e-cb4a232b2ce5';
const adminPartCommandUUID: string = '8d5c0a13-1336-4882-aa41-00a068b2aa00';

const adminJoinCommandDisplayName: string = 'admin-join';
const adminPartCommandDisplayName: string = 'admin-part';

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

//
// Setup NATS connection

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

const nats = new NatsClient({
  natsHost: natsHost as string,
  natsToken: natsToken as string,
});
natsClients.push(nats);
await nats.connect();

// Load admin configuration
let adminConfig: AdminRootConfig;
try {
  adminConfig = await loadAdminConfig();
  log.info('Admin module initialized successfully', {
    producer: 'admin',
    adminCount: adminConfig.admins.length
  });
} catch (error) {
  log.error('Failed to initialize admin module', {
    producer: 'admin',
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
}

// Function to check if a user is an authenticated admin
function isAuthenticatedAdmin(platform: string, user: string, userHost: string): boolean {
  // For now, we only support IRC authentication
  if (platform !== 'irc') {
    return false;
  }

  // Create full hostmask in the format nick!user@host
  const fullHostmask = `${user}!${userHost}`;

  // Check if the user matches any admin's hostmask
  return adminConfig.admins.some(admin => {
    // Check if the platform is accepted
    const platformAccepted = admin.acceptedPlatforms.some(pattern => {
      const regex = new RegExp(pattern);
      return regex.test(platform);
    });

    // Check if the hostmask matches (support both exact match and regex)
    let hostmaskMatches = false;
    if (admin.authentication.irc?.hostmask) {
      try {
        const hostmaskRegex = new RegExp(admin.authentication.irc.hostmask);
        hostmaskMatches = hostmaskRegex.test(userHost) || hostmaskRegex.test(fullHostmask);
      } catch {
        // If regex fails, fall back to exact match
        hostmaskMatches = admin.authentication.irc.hostmask === userHost || admin.authentication.irc.hostmask === fullHostmask;
      }
    }

    return platformAccepted && hostmaskMatches;
  });
}

// Register admin commands
async function registerAdminCommands(): Promise<void> {
  const commands = [
    {
      type: 'command.register',
      commandUUID: adminJoinCommandUUID,
      commandDisplayName: adminJoinCommandDisplayName,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: 'admin join ',
      platformPrefixAllowed: true,
      ratelimit: {
        mode: 'drop',
        level: 'user',
        limit: 3,
        interval: '1m',
      },
    },
    {
      type: 'command.register',
      commandUUID: adminPartCommandUUID,
      commandDisplayName: adminPartCommandDisplayName,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: 'admin part ',
      platformPrefixAllowed: true,
      ratelimit: {
        mode: 'drop',
        level: 'user',
        limit: 3,
        interval: '1m',
      },
    }
  ];

  for (const command of commands) {
    try {
      await nats.publish('command.register', JSON.stringify(command));
      log.info(`Registered ${command.commandDisplayName} command with router`, { producer: 'admin' });
    } catch (error) {
      log.error(`Failed to register ${command.commandDisplayName} command`, {
        producer: 'admin',
        error: error,
      });
    }
  }
}

// Register commands at startup
await registerAdminCommands();

// Subscribe to join command execution messages
const joinCommandSub = nats.subscribe(
  `command.execute.${adminJoinCommandUUID}`,
  (subject, message) => {
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
      if (!isAuthenticatedAdmin(data.platform, data.user, data.userHost)) {
        log.warn('Unauthorized join command attempt', {
          producer: 'admin',
          platform: data.platform,
          user: data.user,
          userHost: data.userHost,
          channel: data.channel,
        });
        return;
      }

      // Extract channel and optional key from command text (format: "#channel [key]")
      const parts = data.text.trim().split(/\s+/);
      if (parts.length === 0 || !parts[0]) {
        log.warn('Invalid join command format', {
          producer: 'admin',
          text: data.text,
        });
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
    } catch (error) {
      log.error('Failed to process join command', {
        producer: 'admin',
        message: message.string(),
        error: error,
      });
    }
  }
);
natsSubscriptions.push(joinCommandSub);

// Subscribe to part command execution messages
const partCommandSub = nats.subscribe(
  `command.execute.${adminPartCommandUUID}`,
  (subject, message) => {
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
      if (!isAuthenticatedAdmin(data.platform, data.user, data.userHost)) {
        log.warn('Unauthorized part command attempt', {
          producer: 'admin',
          platform: data.platform,
          user: data.user,
          userHost: data.userHost,
          channel: data.channel,
        });
        return;
      }

      // Extract channel from command text (format: "#channel")
      const channel = data.text.trim();
      if (!channel) {
        log.warn('Invalid part command format', {
          producer: 'admin',
          text: data.text,
        });
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
    } catch (error) {
      log.error('Failed to process part command', {
        producer: 'admin',
        message: message.string(),
        error: error,
      });
    }
  }
);
natsSubscriptions.push(partCommandSub);

// Subscribe to control messages for re-registering commands
const controlSubRegisterCommandAdminJoin = nats.subscribe(
  `control.registerCommands.${adminJoinCommandDisplayName}`,
  () => {
    log.info(`Received control.registerCommands.${adminPartCommandDisplayName} control message`, {
      producer: 'admin',
    });
    void registerAdminCommands();
  }
);

// Subscribe to control messages for re-registering commands
const controlSubRegisterCommandAdminPart = nats.subscribe(
  `control.registerCommands.${adminPartCommandDisplayName}`,
  () => {
    log.info(`Received control.registerCommands.${adminPartCommandDisplayName} control message`, {
      producer: 'admin',
    });
    void registerAdminCommands();
  }
);

const controlSubRegisterCommandAll = nats.subscribe(
  'control.registerCommands',
  () => {
    log.info('Received control.registerCommands control message', {
      producer: 'admin',
    });
    void registerAdminCommands();
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminJoin, controlSubRegisterCommandAdminPart, controlSubRegisterCommandAll);
