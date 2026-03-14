'use strict';

// Admin module
// manages bot administrators and permissions

import { NatsClient, log } from '@eeveebot/libeevee';
import { loadAdminConfig } from './lib/admin-config.mjs';
import { AdminRootConfig } from './types/admin.types.mjs';
import * as crypto from 'crypto';
// @ts-expect-error ascii-table has no type definitions
import AsciiTable from 'ascii-table';

// Record module startup time for uptime tracking
const moduleStartTime = Date.now();

const natsClients: InstanceType<typeof NatsClient>[] = [];
const natsSubscriptions: Array<Promise<string | boolean>> = [];

const adminJoinCommandUUID: string = '20a6f27e-bd12-4c5c-931e-cb4a232b2ce5';
const adminPartCommandUUID: string = '8d5c0a13-1336-4882-aa41-00a068b2aa00';
const adminShowRatelimitsCommandUUID: string =
  '2bbfdf48-4cab-4200-b8a6-521036ffa87e';
const adminShowCommandRegistryCommandUUID: string =
  '13576a4e-f6a5-4659-99d0-4cab09a9158c';
const adminModuleUptimeCommandUUID: string =
  'f8e8a7b2-4c1d-4e5f-9a2b-3c4d5e6f7890';
const adminModuleRestartCommandUUID: string =
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const adminListBotModulesCommandUUID: string =
  'b2c3d4e5-f6g7-8901-bcde-fg2345678901';

const adminJoinCommandDisplayName: string = 'admin-join';
const adminPartCommandDisplayName: string = 'admin-part';
const adminShowRatelimitsCommandDisplayName: string = 'admin-show-ratelimits';
const adminShowCommandRegistryCommandDisplayName: string = 'admin-show-command-registry';
const adminModuleUptimeCommandDisplayName: string = 'admin-module-uptime';
const adminModuleRestartCommandDisplayName: string = 'admin-module-restart';
const adminListBotModulesCommandDisplayName: string = 'admin-list-bot-modules';

// Help information for admin commands
const adminHelp = [
  {
    command: 'admin join',
    descr: 'Join a channel on a specific platform/network/instance',
    params: [
      {
        param: 'platform',
        required: true,
        descr: 'Platform to join (e.g., discord, slack, irc)',
      },
      {
        param: 'network',
        required: true,
        descr: 'Network name',
      },
      {
        param: 'instance',
        required: true,
        descr: 'Instance identifier',
      },
      {
        param: 'channel',
        required: true,
        descr: 'Channel name to join',
      },
    ],
  },
  {
    command: 'admin part',
    descr: 'Leave a channel on a specific platform/network/instance',
    params: [
      {
        param: 'platform',
        required: true,
        descr: 'Platform to leave (e.g., discord, slack, irc)',
      },
      {
        param: 'network',
        required: true,
        descr: 'Network name',
      },
      {
        param: 'instance',
        required: true,
        descr: 'Instance identifier',
      },
      {
        param: 'channel',
        required: true,
        descr: 'Channel name to leave',
      },
    ],
  },
  {
    command: 'admin show-ratelimits',
    descr: 'Show current rate limit statistics',
    params: [],
  },
  {
    command: 'admin show-command-registry',
    descr: 'Show current command registry',
    params: [],
  },
  {
    command: 'admin module-uptime',
    descr: 'Show uptime information for all modules',
    params: [],
  },
  {
    command: 'admin module-restart',
    descr: 'Restart a specific module',
    params: [
      {
        param: 'module',
        required: true,
        descr: 'Name of the module to restart',
      },
    ],
  },
  {
    command: 'admin list-bot-modules',
    descr: 'List all bot modules and their deployment information',
    params: [],
  },
];

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
    adminCount: adminConfig.admins.length,
  });
} catch (error) {
  log.error('Failed to initialize admin module', {
    producer: 'admin',
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
}

// Function to check if a user is an authenticated admin
function isAuthenticatedAdmin(
  platform: string,
  user: string,
  userHost: string
): boolean {
  // For now, we only support IRC authentication
  if (platform !== 'irc') {
    return false;
  }

  // Create full hostmask in the format user@host
  const fullHostmask = `${user}@${userHost}`;

  // Check if the user matches any admin's hostmask
  return adminConfig.admins.some((admin) => {
    // Check if the platform is accepted
    const platformAccepted = admin.acceptedPlatforms.some((pattern) => {
      const regex = new RegExp(pattern);
      return regex.test(platform);
    });

    // Check if the hostmask matches (support both exact match and regex)
    let hostmaskMatches = false;
    if (admin.authentication.irc?.hostmask) {
      try {
        const hostmaskRegex = new RegExp(admin.authentication.irc.hostmask);
        hostmaskMatches =
          hostmaskRegex.test(userHost) || hostmaskRegex.test(fullHostmask);
      } catch {
        // If regex fails, fall back to exact match
        hostmaskMatches =
          admin.authentication.irc.hostmask === userHost ||
          admin.authentication.irc.hostmask === fullHostmask;
      }
    }

    return platformAccepted && hostmaskMatches;
  });
}

// Register admin commands
async function registerAdminCommands(): Promise<void> {
  // Default rate limit configurations
  const defaultRateLimits = {
    join: {
      mode: 'drop',
      level: 'user',
      limit: 3,
      interval: '1m',
    },
    part: {
      mode: 'drop',
      level: 'user',
      limit: 3,
      interval: '1m',
    },
    showRatelimits: {
      mode: 'drop',
      level: 'user',
      limit: 3,
      interval: '1m',
    },
    showCommandRegistry: {
      mode: 'drop',
      level: 'user',
      limit: 3,
      interval: '1m',
    },
    moduleUptime: {
      mode: 'drop',
      level: 'user',
      limit: 5,
      interval: '1m',
    },
    moduleRestart: {
      mode: 'drop',
      level: 'user',
      limit: 3,
      interval: '1m',
    },
    listBotModules: {
      mode: 'drop',
      level: 'user',
      limit: 5,
      interval: '1m',
    },
  };

  // Use configured rate limits or defaults
  const joinRateLimit = adminConfig.ratelimits?.join || defaultRateLimits.join;
  const partRateLimit = adminConfig.ratelimits?.part || defaultRateLimits.part;
  const showRatelimitsRateLimit =
    adminConfig.ratelimits?.showRatelimits || defaultRateLimits.showRatelimits;
  const showCommandRegistryRateLimit =
    adminConfig.ratelimits?.showCommandRegistry || defaultRateLimits.showCommandRegistry;
  const moduleUptimeRateLimit =
    adminConfig.ratelimits?.moduleUptime || defaultRateLimits.moduleUptime;
  const moduleRestartRateLimit =
    adminConfig.ratelimits?.moduleRestart || defaultRateLimits.moduleRestart;
  const listBotModulesRateLimit =
    adminConfig.ratelimits?.listBotModules || defaultRateLimits.listBotModules;

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
      regex: '^admin\\s+join\\s+', // Match admin join command at start of line
      platformPrefixAllowed: true,
      ratelimit: joinRateLimit,
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
      regex: '^admin\\s+part\\s+', // Match admin part command at start of line
      platformPrefixAllowed: true,
      ratelimit: partRateLimit,
    },
    {
      type: 'command.register',
      commandUUID: adminShowRatelimitsCommandUUID,
      commandDisplayName: adminShowRatelimitsCommandDisplayName,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: '^admin\\s+show-ratelimits\\s*', // Match admin show-ratelimits command at start of line
      platformPrefixAllowed: true,
      ratelimit: showRatelimitsRateLimit,
    },
    {
      type: 'command.register',
      commandUUID: adminShowCommandRegistryCommandUUID,
      commandDisplayName: adminShowCommandRegistryCommandDisplayName,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: '^admin\\s+show-command-registry\\s*', // Match admin show-command-registry command at start of line
      platformPrefixAllowed: true,
      ratelimit: showCommandRegistryRateLimit,
    },
    {
      type: 'command.register',
      commandUUID: adminModuleUptimeCommandUUID,
      commandDisplayName: adminModuleUptimeCommandDisplayName,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: '^admin\\s+module-uptime\\s*', // Match admin module-uptime command at start of line
      platformPrefixAllowed: true,
      ratelimit: moduleUptimeRateLimit,
    },
    {
      type: 'command.register',
      commandUUID: adminModuleRestartCommandUUID,
      commandDisplayName: adminModuleRestartCommandDisplayName,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: '^admin\\s+module-restart\\s*', // Match admin module-restart command at start of line
      platformPrefixAllowed: true,
      ratelimit: moduleRestartRateLimit,
    },
    {
      type: 'command.register',
      commandUUID: adminListBotModulesCommandUUID,
      commandDisplayName: adminListBotModulesCommandDisplayName,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: '^admin\\s+list-bot-modules\\s*', // Match admin list-bot-modules command at start of line
      platformPrefixAllowed: true,
      ratelimit: listBotModulesRateLimit,
    },
  ];

  // Function to publish help information
  async function publishHelp(): Promise<void> {
    const helpUpdate = {
      from: 'admin',
      help: adminHelp,
    };

    try {
      await nats.publish('help.update', JSON.stringify(helpUpdate));
      log.info('Published admin help information', {
        producer: 'admin',
      });
    } catch (error) {
      log.error('Failed to publish admin help information', {
        producer: 'admin',
        error: error,
      });
    }
  }

  // Publish help information at startup
  await publishHelp();

  // Subscribe to help update requests
  const helpUpdateRequestSub = nats.subscribe('help.updateRequest', () => {
    log.info('Received help.updateRequest message', {
      producer: 'admin',
    });
    void publishHelp();
  });
  natsSubscriptions.push(helpUpdateRequestSub);

  for (const command of commands) {
    try {
      await nats.publish('command.register', JSON.stringify(command));
      log.info(`Registered ${command.commandDisplayName} command with router`, {
        producer: 'admin',
        ratelimit: command.ratelimit,
      });
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

// Subscribe to show-ratelimits command execution messages
const showRatelimitsCommandSub = nats.subscribe(
  `command.execute.${adminShowRatelimitsCommandUUID}`,
  (subject, message) => {
    try {
      const data = JSON.parse(message.string());
      log.info('Received command.execute for show-ratelimits', {
        producer: 'admin',
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
        originalText: data.originalText,
      });

      // Check if user is authenticated admin
      if (!isAuthenticatedAdmin(data.platform, data.user, data.userHost)) {
        log.warn('Unauthorized show-ratelimits command attempt', {
          producer: 'admin',
          platform: data.platform,
          user: data.user,
          userHost: data.userHost,
          channel: data.channel,
        });
        return;
      }

      // Send a message to the router to gather rate limit statistics
      const requestMessage = {
        action: 'get-ratelimit-stats',
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

      log.info('Requested rate limit statistics from router', {
        producer: 'admin',
        trace: data.trace,
      });
    } catch (error) {
      log.error('Failed to process show-ratelimits command', {
        producer: 'admin',
        message: message.string(),
        error: error,
      });
    }
  }
);
natsSubscriptions.push(showRatelimitsCommandSub);

// Subscribe to show-command-registry command execution messages
const showCommandRegistryCommandSub = nats.subscribe(
  `command.execute.${adminShowCommandRegistryCommandUUID}`,
  (subject, message) => {
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
      if (!isAuthenticatedAdmin(data.platform, data.user, data.userHost)) {
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
);
natsSubscriptions.push(showCommandRegistryCommandSub);

// Subscribe to module-uptime command execution messages
const moduleUptimeCommandSub = nats.subscribe(
  `command.execute.${adminModuleUptimeCommandUUID}`,
  (subject, message) => {
    try {
      const data = JSON.parse(message.string());
      log.info('Received command.execute for module-uptime', {
        producer: 'admin',
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
        originalText: data.originalText,
      });

      // Check if user is authenticated admin
      if (!isAuthenticatedAdmin(data.platform, data.user, data.userHost)) {
        log.warn('Unauthorized module-uptime command attempt', {
          producer: 'admin',
          platform: data.platform,
          user: data.user,
          userHost: data.userHost,
          channel: data.channel,
        });
        return;
      }

      // Generate a unique reply channel for this request
      const replyChannel = `stats.uptime.reply.${crypto.randomUUID()}`;

      // Store responses we receive
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responses: any[] = [];

      // Subscribe to the reply channel to collect responses
      void nats
        .subscribe(replyChannel, (replySubject, replyMessage) => {
          try {
            const replyData = JSON.parse(replyMessage.string());
            responses.push(replyData);
          } catch (error) {
            log.error('Failed to parse uptime response', {
              producer: 'admin',
              error: error,
            });
          }
        })
        .then((sub) => {
          if (sub && typeof sub === 'string') {
            // We'll let the subscription naturally expire
            // In a production system, we might want to track and clean these up
          }
        });

      // Send stats.uptime request to all modules
      const uptimeRequest = {
        replyChannel: replyChannel,
      };
      void nats.publish('stats.uptime', JSON.stringify(uptimeRequest));

      // Wait 5 seconds for modules to respond
      setTimeout(() => {
        // Format the responses as a message
        let responseText = 'Module Uptime Report:\n';

        if (responses.length === 0) {
          responseText += 'No modules responded within the timeout period.\n';
        } else {
          // Sort responses by module name
          responses.sort((a, b) => a.module.localeCompare(b.module));

          // Create a formatted table using ascii-table
          const table = new AsciiTable();
          table.setHeading('Module', 'Uptime');

          for (const response of responses) {
            table.addRow(response.module, response.uptimeFormatted);
          }

          responseText += table.toString() + '\n';
          responseText += `Total modules: ${responses.length}\n`;
        }

        // Send the response back to the user/channel
        const responseMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: responseText,
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(responseMessage));

        log.info('Sent module uptime report to user', {
          producer: 'admin',
          user: data.user,
          channel: data.channel,
          platform: data.platform,
          instance: data.instance,
          moduleCount: responses.length,
        });
      }, 5000); // 5 second timeout
    } catch (error) {
      log.error('Failed to process module-uptime command', {
        producer: 'admin',
        message: message.string(),
        error: error,
      });
    }
  }
);
natsSubscriptions.push(moduleUptimeCommandSub);

// Subscribe to module-restart command execution messages
const moduleRestartCommandSub = nats.subscribe(
  `command.execute.${adminModuleRestartCommandUUID}`,
  (subject, message) => {
    try {
      const data = JSON.parse(message.string());
      log.info('Received command.execute for module-restart', {
        producer: 'admin',
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
        originalText: data.originalText,
      });

      // Check if user is authenticated admin
      if (!isAuthenticatedAdmin(data.platform, data.user, data.userHost)) {
        log.warn('Unauthorized module-restart command attempt', {
          producer: 'admin',
          platform: data.platform,
          user: data.user,
          userHost: data.userHost,
          channel: data.channel,
        });
        return;
      }

      // Extract module name from command text (format: "$MODULE")
      const moduleName = data.text.trim();
      if (!moduleName) {
        log.warn('Invalid module-restart command format', {
          producer: 'admin',
          text: data.text,
        });
        return;
      }

      // Get required environment variables
      const apiToken = process.env.EEVEE_OPERATOR_API_TOKEN;
      const apiUrl = process.env.EEVEE_OPERATOR_API_URL;

      if (!apiToken || !apiUrl) {
        log.error(
          'Missing EEVEE_OPERATOR_API_TOKEN or EEVEE_OPERATOR_API_URL environment variables',
          {
            producer: 'admin',
          }
        );
        return;
      }

      // Send restart request to operator API
      void (async () => {
        try {
          const response = await fetch(`${apiUrl}/api/action/restart-module`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              moduleName: moduleName,
              namespace: 'eevee-bot',
            }),
          });

          if (response.ok) {
            log.info(
              `Successfully sent restart request for module ${moduleName}`,
              {
                producer: 'admin',
                moduleName,
              }
            );

            // Send confirmation message back to user
            const responseMessage = {
              platform: data.platform,
              instance: data.instance,
              channel: data.channel,
              user: data.user,
              text: `Module restart request sent for: ${moduleName}`,
              trace: data.trace,
            };

            const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
            void nats.publish(responseTopic, JSON.stringify(responseMessage));
          } else {
            const errorText = await response.text();
            log.error(`Failed to restart module ${moduleName}`, {
              producer: 'admin',
              moduleName,
              status: response.status,
              error: errorText,
            });

            // Send error message back to user
            const responseMessage = {
              platform: data.platform,
              instance: data.instance,
              channel: data.channel,
              user: data.user,
              text: `Failed to send restart request for module ${moduleName}. Status: ${response.status}`,
              trace: data.trace,
            };

            const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
            void nats.publish(responseTopic, JSON.stringify(responseMessage));
          }
        } catch (error) {
          log.error(`Error sending restart request for module ${moduleName}`, {
            producer: 'admin',
            moduleName,
            error: error instanceof Error ? error.message : String(error),
          });

          // Send error message back to user
          const responseMessage = {
            platform: data.platform,
            instance: data.instance,
            channel: data.channel,
            user: data.user,
            text: `Error sending restart request for module ${moduleName}: ${error instanceof Error ? error.message : String(error)}`,
            trace: data.trace,
          };

          const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
          void nats.publish(responseTopic, JSON.stringify(responseMessage));
        }
      })();
    } catch (error) {
      log.error('Failed to process module-restart command', {
        producer: 'admin',
        message: message.string(),
        error: error,
      });
    }
  }
);
natsSubscriptions.push(moduleRestartCommandSub);

// Subscribe to list-bot-modules command execution messages
const listBotModulesCommandSub = nats.subscribe(
  `command.execute.${adminListBotModulesCommandUUID}`,
  (subject, message) => {
    void (async () => {
      try {
        const data = JSON.parse(message.string());
        log.info('Received command.execute for list-bot-modules', {
          producer: 'admin',
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          originalText: data.originalText,
        });

        // Check if user is authenticated admin
        if (!isAuthenticatedAdmin(data.platform, data.user, data.userHost)) {
          log.warn('Unauthorized list-bot-modules command attempt', {
            producer: 'admin',
            platform: data.platform,
            user: data.user,
            userHost: data.userHost,
            channel: data.channel,
          });
          return;
        }

        // Get required environment variables
        const apiToken = process.env.EEVEE_OPERATOR_API_TOKEN;
        const apiUrl = process.env.EEVEE_OPERATOR_API_URL;

        if (!apiToken || !apiUrl) {
          log.error(
            'Missing EEVEE_OPERATOR_API_TOKEN or EEVEE_OPERATOR_API_URL environment variables',
            {
              producer: 'admin',
            }
          );
          
          // Send error message back to user
          const responseMessage = {
            platform: data.platform,
            instance: data.instance,
            channel: data.channel,
            user: data.user,
            text: 'Error: Missing operator API configuration',
            trace: data.trace,
          };

          const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
          void nats.publish(responseTopic, JSON.stringify(responseMessage));
          return;
        }

        // Fetch bot modules from operator API
        const response = await fetch(`${apiUrl}/api/bot-modules`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          log.error('Failed to fetch bot modules from operator API', {
            producer: 'admin',
            status: response.status,
            error: errorText,
          });
          
          // Send error message back to user
          const responseMessage = {
            platform: data.platform,
            instance: data.instance,
            channel: data.channel,
            user: data.user,
            text: `Error: Failed to fetch bot modules. Status: ${response.status}`,
            trace: data.trace,
          };

          const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
          void nats.publish(responseTopic, JSON.stringify(responseMessage));
          return;
        }

        const modules = await response.json();

        // Format the response as a table
        let responseText = 'Bot Modules:\n';

        if (!modules || modules.length === 0) {
          responseText += 'No bot modules found.\n';
        } else {
          // Create ASCII table using ascii-table
          const table = new AsciiTable();
          table.setHeading('Name', 'Namespace', 'Image', 'Tag', 'Enabled');

          // Add each module entry
          for (const module of modules) {
            table.addRow(
              module.name,
              module.namespace,
              module.image,
              module.tag,
              module.enabled ? 'Yes' : 'No'
            );
          }

          responseText += table.toString() + '\n';
          responseText += `Total modules: ${modules.length}\n`;
        }

        // Send the response back to the user/channel
        const responseMessage = {
          platform: data.platform,
          instance: data.instance,
          channel: data.channel,
          user: data.user,
          text: responseText,
          trace: data.trace,
        };

        const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
        void nats.publish(responseTopic, JSON.stringify(responseMessage));

        log.info('Sent bot modules list to user', {
          producer: 'admin',
          user: data.user,
          channel: data.channel,
          platform: data.platform,
          instance: data.instance,
          moduleCount: modules.length,
        });
      } catch (error) {
        log.error('Failed to process list-bot-modules command', {
          producer: 'admin',
          message: message.string(),
          error: error instanceof Error ? error.message : String(error),
        });
        
        // Try to send error message back to user
        try {
          const data = JSON.parse(message.string());
          const errorMessage = {
            platform: data.platform,
            instance: data.instance,
            channel: data.channel,
            user: data.user,
            text: 'Error: Failed to process list-bot-modules command',
            trace: data.trace,
          };

          const responseTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
          void nats.publish(responseTopic, JSON.stringify(errorMessage));
        } catch (sendError) {
          log.error('Failed to send error message to user', {
            producer: 'admin',
            error: sendError instanceof Error ? sendError.message : String(sendError),
          });
        }
      }
    })();
  }
);
natsSubscriptions.push(listBotModulesCommandSub);

// Subscribe to router responses with rate limit statistics
const routerResponseSub = nats.subscribe(
  'admin.response.router.ratelimit-stats',
  (subject, message) => {
    try {
      const data = JSON.parse(message.string());
      log.info('Received rate limit statistics from router', {
        producer: 'admin',
        trace: data.trace,
      });

      // Format the statistics as an ASCII table
      let responseText = 'Rate Limit Statistics:\n';

      if (!data.stats || Object.keys(data.stats).length === 0) {
        responseText += 'No rate limit data available.\n';
      } else {
        // Create ASCII table using ascii-table
        const table = new AsciiTable();
        table.setHeading(
          'Command Name',
          'Identifier',
          'Count',
          'Limit',
          'Interval'
        );

        // Add each rate limit entry
        for (const [key, stat] of Object.entries(data.stats)) {
          // Type assertion for the stat object
          const typedStat = stat as {
            count: number;
            limit: number;
            interval: string;
            commandName?: string;
          };
          const parts = key.split(':');
          const commandUUID = parts[0];
          const identifier = parts.slice(1).join(':');
          // Use command name if available, otherwise fallback to UUID
          const commandName = typedStat.commandName || commandUUID;

          table.addRow(
            commandName,
            identifier,
            typedStat.count,
            typedStat.limit,
            typedStat.interval
          );
        }

        responseText += table.toString() + '\n';
        responseText += `Total entries: ${Object.keys(data.stats).length}\n`;
      }

      // Send the response back to the user/channel
      const responseMessage = {
        platform: data.requester.platform,
        instance: data.requester.instance,
        channel: data.requester.channel,
        user: data.requester.user,
        text: responseText,
        trace: data.trace,
      };

      const responseTopic = `chat.message.outgoing.${data.requester.platform}.${data.requester.instance}.${data.requester.channel}`;
      void nats.publish(responseTopic, JSON.stringify(responseMessage));

      log.info('Sent rate limit statistics to user', {
        producer: 'admin',
        user: data.requester.user,
        channel: data.requester.channel,
        platform: data.requester.platform,
        instance: data.requester.instance,
      });
    } catch (error) {
      log.error('Failed to process router rate limit stats response', {
        producer: 'admin',
        message: message.string(),
        error: error,
      });
    }
  }
);
natsSubscriptions.push(routerResponseSub);

// Subscribe to router responses with command registry information
const routerCommandRegistryResponseSub = nats.subscribe(
  'admin.response.router.command-registry',
  (subject, message) => {
    try {
      const data = JSON.parse(message.string());
      log.info('Received command registry from router', {
        producer: 'admin',
        trace: data.trace,
      });

      let responseText = '';

      // Check if this is an error response
      if (data.action === 'command-registry-error') {
        responseText = `Error retrieving command registry: ${data.error}\n`;
      } else {
        // Format the command registry as an ASCII table
        responseText = 'Command Registry:\n';

        if (!data.registry || data.registry.length === 0) {
          responseText += 'No commands registered.\n';
        } else {
          // Create ASCII table using ascii-table
          const table = new AsciiTable();
          table.setHeading(
            'Command Name',
            'UUID',
            'Platform',
            'Network',
            'Instance',
            'Channel',
            'User'
          );

          // Add each command entry
          for (const command of data.registry) {
            table.addRow(
              command.commandDisplayName || command.commandUUID,
              command.commandUUID,
              command.platformRegex.source,
              command.networkRegex.source,
              command.instanceRegex.source,
              command.channelRegex.source,
              command.userRegex.source
            );
          }

          responseText += table.toString() + '\n';
          responseText += `Total commands: ${data.registry.length}\n`;
        }
      }

      // Send the response back to the user/channel
      const responseMessage = {
        platform: data.requester.platform,
        instance: data.requester.instance,
        channel: data.requester.channel,
        user: data.requester.user,
        text: responseText,
        trace: data.trace,
      };

      const responseTopic = `chat.message.outgoing.${data.requester.platform}.${data.requester.instance}.${data.requester.channel}`;
      void nats.publish(responseTopic, JSON.stringify(responseMessage));

      log.info('Sent command registry to user', {
        producer: 'admin',
        user: data.requester.user,
        channel: data.requester.channel,
        platform: data.requester.platform,
        instance: data.requester.instance,
      });
    } catch (error) {
      log.error('Failed to process router command registry response', {
        producer: 'admin',
        message: message.string(),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      // Try to send an error message back to the user
      try {
        const data = JSON.parse(message.string());
        if (data.requester) {
          const errorMessage = {
            platform: data.requester.platform,
            instance: data.requester.instance,
            channel: data.requester.channel,
            user: data.requester.user,
            text: 'Error: Failed to process command registry response',
            trace: data.trace,
          };

          const responseTopic = `chat.message.outgoing.${data.requester.platform}.${data.requester.instance}.${data.requester.channel}`;
          void nats.publish(responseTopic, JSON.stringify(errorMessage));
        }
      } catch (sendError) {
        log.error('Failed to send error message to user', {
          producer: 'admin',
          error: sendError instanceof Error ? sendError.message : String(sendError),
        });
      }
    }
  }
);
natsSubscriptions.push(routerCommandRegistryResponseSub);

// Subscribe to control messages for re-registering commands
const controlSubRegisterCommandAdminJoin = nats.subscribe(
  `control.registerCommands.${adminJoinCommandDisplayName}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminPartCommandDisplayName} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands();
  }
);

// Subscribe to control messages for re-registering commands
const controlSubRegisterCommandAdminPart = nats.subscribe(
  `control.registerCommands.${adminPartCommandDisplayName}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminPartCommandDisplayName} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands();
  }
);

// Subscribe to control messages for re-registering show-ratelimits command
const controlSubRegisterCommandAdminShowRatelimits = nats.subscribe(
  `control.registerCommands.${adminShowRatelimitsCommandDisplayName}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminJoinCommandDisplayName} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands();
  }
);

// Subscribe to control messages for re-registering show-command-registry command
const controlSubRegisterCommandAdminShowCommandRegistry = nats.subscribe(
  `control.registerCommands.${adminShowCommandRegistryCommandDisplayName}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminShowCommandRegistryCommandDisplayName} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands();
  }
);

// Subscribe to control messages for re-registering module-uptime command
const controlSubRegisterCommandAdminModuleUptime = nats.subscribe(
  `control.registerCommands.${adminModuleUptimeCommandDisplayName}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminModuleUptimeCommandDisplayName} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands();
  }
);

// Subscribe to control messages for re-registering module-restart command
const controlSubRegisterCommandAdminModuleRestart = nats.subscribe(
  `control.registerCommands.${adminModuleRestartCommandDisplayName}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminModuleRestartCommandDisplayName} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands();
  }
);

// Subscribe to control messages for re-registering list-bot-modules command
const controlSubRegisterCommandAdminListBotModules = nats.subscribe(
  `control.registerCommands.${adminListBotModulesCommandDisplayName}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminListBotModulesCommandDisplayName} control message`,
      {
        producer: 'admin',
      }
    );
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

// Subscribe to stats.uptime messages and respond with module uptime
const statsUptimeSub = nats.subscribe('stats.uptime', (subject, message) => {
  try {
    const data = JSON.parse(message.string());
    log.info('Received stats.uptime request', {
      producer: 'admin',
      replyChannel: data.replyChannel,
    });

    // Calculate uptime in milliseconds
    const uptime = Date.now() - moduleStartTime;

    // Send uptime back via the ephemeral reply channel
    const uptimeResponse = {
      module: 'admin',
      uptime: uptime,
      uptimeFormatted: `${Math.floor(uptime / 86400000)}d ${Math.floor((uptime % 86400000) / 3600000)}h ${Math.floor((uptime % 3600000) / 60000)}m ${Math.floor((uptime % 60000) / 1000)}s`,
    };

    if (data.replyChannel) {
      void nats.publish(data.replyChannel, JSON.stringify(uptimeResponse));
    }
  } catch (error) {
    log.error('Failed to process stats.uptime request', {
      producer: 'admin',
      error: error,
    });
  }
});
natsSubscriptions.push(
  controlSubRegisterCommandAdminJoin,
  controlSubRegisterCommandAdminPart,
  controlSubRegisterCommandAdminShowRatelimits,
  controlSubRegisterCommandAdminShowCommandRegistry,
  controlSubRegisterCommandAdminModuleUptime,
  controlSubRegisterCommandAdminModuleRestart,
  controlSubRegisterCommandAdminListBotModules,
  controlSubRegisterCommandAll,
  statsUptimeSub
);
