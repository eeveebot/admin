'use strict';

import { NatsClient, log } from '@eeveebot/libeevee';
import { AdminRootConfig } from '../types/admin.types.mjs';
import { adminCommandUUIDs, adminCommandDisplayNames, adminHelp } from './commandDefinitions.mjs';
import { getAdminRateLimits } from './rateLimitDefinitions.mjs';

/**
 * Register admin commands with the router
 * @param nats - The NATS client instance
 * @param adminConfig - The loaded admin configuration
 */
export async function registerAdminCommands(
  nats: InstanceType<typeof NatsClient>,
  adminConfig: AdminRootConfig
): Promise<void> {
  const {
    joinRateLimit,
    partRateLimit,
    showRatelimitsRateLimit,
    showCommandRegistryRateLimit,
    moduleUptimeRateLimit,
    moduleRestartRateLimit,
    listBotModulesRateLimit,
    botStatsRateLimit,
  } = getAdminRateLimits(adminConfig);

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

// Re-export constants for backward compatibility
export { adminCommandUUIDs, adminCommandDisplayNames, adminHelp };