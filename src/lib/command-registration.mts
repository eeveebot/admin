'use strict';

import { NatsClient, log } from '@eeveebot/libeevee';
import { AdminRootConfig } from '../types/admin.types.mjs';

// Command UUIDs
export const adminCommandUUIDs = {
  join: '20a6f27e-bd12-4c5c-931e-cb4a232b2ce5',
  part: '8d5c0a13-1336-4882-aa41-00a068b2aa00',
  showRatelimits: '2bbfdf48-4cab-4200-b8a6-521036ffa87e',
  showCommandRegistry: '13576a4e-f6a5-4659-99d0-4cab09a9158c',
  moduleUptime: 'f8e8a7b2-4c1d-4e5f-9a2b-3c4d5e6f7890',
  moduleRestart: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  listBotModules: 'b2c3d4e5-f6g7-8901-bcde-fg2345678901',
  botStats: 'c3d4e5f6-g7h8-9012-cdef-gh3456789012',
};

// Command display names
export const adminCommandDisplayNames = {
  join: 'admin-join',
  part: 'admin-part',
  showRatelimits: 'admin-show-ratelimits',
  showCommandRegistry: 'admin-show-command-registry',
  moduleUptime: 'admin-module-uptime',
  moduleRestart: 'admin-module-restart',
  listBotModules: 'admin-list-bot-modules',
  botStats: 'admin-bot-stats',
};

// Help information for admin commands
export const adminHelp = [
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
  {
    command: 'admin bot-stats',
    descr: 'Show bot statistics from various modules',
    params: [],
  },
];

/**
 * Register admin commands with the router
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 */
export async function registerAdminCommands(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig
): Promise<void> {
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
    botStats: {
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
    adminConfig.ratelimits?.showCommandRegistry ||
    defaultRateLimits.showCommandRegistry;
  const moduleUptimeRateLimit =
    adminConfig.ratelimits?.moduleUptime || defaultRateLimits.moduleUptime;
  const moduleRestartRateLimit =
    adminConfig.ratelimits?.moduleRestart || defaultRateLimits.moduleRestart;
  const listBotModulesRateLimit =
    adminConfig.ratelimits?.listBotModules || defaultRateLimits.listBotModules;
  const botStatsRateLimit =
    adminConfig.ratelimits?.botStats || defaultRateLimits.botStats;

  const commands = [
    {
      type: 'command.register',
      commandUUID: adminCommandUUIDs.join,
      commandDisplayName: adminCommandDisplayNames.join,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: '^admin join', // Match admin join command at start of line
      platformPrefixAllowed: true,
      ratelimit: joinRateLimit,
    },
    {
      type: 'command.register',
      commandUUID: adminCommandUUIDs.part,
      commandDisplayName: adminCommandDisplayNames.part,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: '^admin part', // Match admin part command at start of line
      platformPrefixAllowed: true,
      ratelimit: partRateLimit,
    },
    {
      type: 'command.register',
      commandUUID: adminCommandUUIDs.showRatelimits,
      commandDisplayName: adminCommandDisplayNames.showRatelimits,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: '^admin show-ratelimits', // Match admin show-ratelimits command at start of line
      platformPrefixAllowed: true,
      ratelimit: showRatelimitsRateLimit,
    },
    {
      type: 'command.register',
      commandUUID: adminCommandUUIDs.showCommandRegistry,
      commandDisplayName: adminCommandDisplayNames.showCommandRegistry,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: '^admin show-command-registry', // Match admin show-command-registry command at start of line
      platformPrefixAllowed: true,
      ratelimit: showCommandRegistryRateLimit,
    },
    {
      type: 'command.register',
      commandUUID: adminCommandUUIDs.moduleUptime,
      commandDisplayName: adminCommandDisplayNames.moduleUptime,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: '^admin module-uptime', // Match admin module-uptime command at start of line
      platformPrefixAllowed: true,
      ratelimit: moduleUptimeRateLimit,
    },
    {
      type: 'command.register',
      commandUUID: adminCommandUUIDs.moduleRestart,
      commandDisplayName: adminCommandDisplayNames.moduleRestart,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: '^admin module-restart', // Match admin module-restart command at start of line
      platformPrefixAllowed: true,
      ratelimit: moduleRestartRateLimit,
    },
    {
      type: 'command.register',
      commandUUID: adminCommandUUIDs.listBotModules,
      commandDisplayName: adminCommandDisplayNames.listBotModules,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: '^admin list-bot-modules', // Match admin list-bot-modules command at start of line
      platformPrefixAllowed: true,
      ratelimit: listBotModulesRateLimit,
    },
    {
      type: 'command.register',
      commandUUID: adminCommandUUIDs.botStats,
      commandDisplayName: adminCommandDisplayNames.botStats,
      platform: '.*',
      network: '.*',
      instance: '.*',
      channel: '.*',
      user: '.*',
      regex: '^admin bot-stats', // Match admin bot-stats command at start of line
      platformPrefixAllowed: true,
      ratelimit: botStatsRateLimit,
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
  void nats.subscribe('help.updateRequest', () => {
    log.info('Received help.updateRequest message', {
      producer: 'admin',
    });
    void publishHelp();
  });

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
