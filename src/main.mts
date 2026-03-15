'use strict';

// Admin module
// manages bot administrators and permissions

import { NatsClient, log } from '@eeveebot/libeevee';
import { loadAdminConfig } from './lib/admin-config.mjs';
import { AdminRootConfig } from './types/admin.types.mjs';
import {
  setupSignalHandlers,
  setupNatsConnection,
  validateEnvironmentVariables,
} from './lib/utils.mjs';
import {
  registerAdminCommands,
  adminCommandUUIDs,
  adminCommandDisplayNames,
} from './lib/command-registration.mjs';
import {
  handleJoinCommand,
  handlePartCommand,
  handleShowRatelimitsCommand,
  handleShowCommandRegistryCommand,
  handleModuleUptimeCommand,
  handleModuleRestartCommand,
  handleListBotModulesCommand,
  handleBotStatsCommand,
} from './lib/command-handlers.mjs';
import {
  handleRouterRatelimitStatsResponse,
  handleRouterCommandRegistryResponse,
} from './lib/nats-handlers.mjs';

// Record module startup time for uptime tracking
// const moduleStartTime = Date.now();

const natsClients: InstanceType<typeof NatsClient>[] = [];
const natsSubscriptions: Array<Promise<string | boolean>> = [];

// Setup signal handlers for graceful shutdown
setupSignalHandlers(natsClients);

// Validate environment variables
const { natsHost, natsToken } = validateEnvironmentVariables();

// Setup NATS connection
const nats = await setupNatsConnection(natsHost, natsToken);
natsClients.push(nats);

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

// Register admin commands
await registerAdminCommands(nats, adminConfig);

// Subscribe to join command execution messages
const joinCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.join}`,
  (subject, message) => {
    void handleJoinCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(joinCommandSub);

// Subscribe to part command execution messages
const partCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.part}`,
  (subject, message) => {
    void handlePartCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(partCommandSub);

// Subscribe to show-ratelimits command execution messages
const showRatelimitsCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.showRatelimits}`,
  (subject, message) => {
    void handleShowRatelimitsCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(showRatelimitsCommandSub);

// Subscribe to show-command-registry command execution messages
const showCommandRegistryCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.showCommandRegistry}`,
  (subject, message) => {
    void handleShowCommandRegistryCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(showCommandRegistryCommandSub);

// Subscribe to module-uptime command execution messages
const moduleUptimeCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.moduleUptime}`,
  (subject, message) => {
    void handleModuleUptimeCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(moduleUptimeCommandSub);

// Subscribe to module-restart command execution messages
const moduleRestartCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.moduleRestart}`,
  (subject, message) => {
    void handleModuleRestartCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(moduleRestartCommandSub);

// Subscribe to list-bot-modules command execution messages
const listBotModulesCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.listBotModules}`,
  (subject, message) => {
    void handleListBotModulesCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(listBotModulesCommandSub);

// Subscribe to bot-stats command execution messages
const botStatsCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.botStats}`,
  (subject, message) => {
    void handleBotStatsCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(botStatsCommandSub);

// Subscribe to router responses with rate limit statistics
const routerResponseSub = nats.subscribe(
  'admin.response.router.ratelimit-stats',
  (subject, message) => {
    void handleRouterRatelimitStatsResponse(nats, subject, message);
  }
);
natsSubscriptions.push(routerResponseSub);

// Subscribe to router responses with command registry information
const routerCommandRegistryResponseSub = nats.subscribe(
  'admin.response.router.command-registry',
  (subject, message) => {
    void handleRouterCommandRegistryResponse(nats, subject, message);
  }
);
natsSubscriptions.push(routerCommandRegistryResponseSub);

// Subscribe to control messages for re-registering commands
const controlSubRegisterCommandAdminJoin = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.join}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.join} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminJoin);

// Subscribe to control messages for re-registering commands
const controlSubRegisterCommandAdminPart = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.part}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.part} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminPart);

// Subscribe to control messages for re-registering show-ratelimits command
const controlSubRegisterCommandAdminShowRatelimits = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.showRatelimits}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.showRatelimits} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminShowRatelimits);

// Subscribe to control messages for re-registering show-command-registry command
const controlSubRegisterCommandAdminShowCommandRegistry = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.showCommandRegistry}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.showCommandRegistry} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminShowCommandRegistry);

// Subscribe to control messages for re-registering module-uptime command
const controlSubRegisterCommandAdminModuleUptime = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.moduleUptime}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.moduleUptime} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminModuleUptime);

// Subscribe to control messages for re-registering module-restart command
const controlSubRegisterCommandAdminModuleRestart = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.moduleRestart}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.moduleRestart} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminModuleRestart);

// Subscribe to control messages for re-registering list-bot-modules command
const controlSubRegisterCommandAdminListBotModules = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.listBotModules}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.listBotModules} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminListBotModules);

// Subscribe to control messages for re-registering bot-stats command
const controlSubRegisterCommandAdminBotStats = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.botStats}`,
  () => {
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.botStats} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminBotStats);

// Subscribe to general control messages for re-registering all commands
const controlSubRegisterCommandAll = nats.subscribe(
  'control.registerCommands',
  () => {
    log.info('Received control.registerCommands control message', {
      producer: 'admin',
    });
    void registerAdminCommands(nats, adminConfig);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAll);
