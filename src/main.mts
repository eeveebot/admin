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

// Import metrics
import {
  initializeSystemMetrics,
  setupHttpServer,
  register,
} from '@eeveebot/libeevee';
import {
  recordNatsSubscribe,
  recordNatsPublish,
} from './lib/metrics.mjs';
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
const moduleStartTime = Date.now();

// Initialize system metrics
initializeSystemMetrics('admin');

// Setup HTTP server for metrics and health checks
setupHttpServer({
  port: process.env.HTTP_API_PORT || '9001',
  serviceName: 'admin',
});

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
    recordNatsSubscribe(subject);
    void handleJoinCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(joinCommandSub);

// Subscribe to part command execution messages
const partCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.part}`,
  (subject, message) => {
    recordNatsSubscribe(subject);
    void handlePartCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(partCommandSub);

// Subscribe to show-ratelimits command execution messages
const showRatelimitsCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.showRatelimits}`,
  (subject, message) => {
    recordNatsSubscribe(subject);
    void handleShowRatelimitsCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(showRatelimitsCommandSub);

// Subscribe to show-command-registry command execution messages
const showCommandRegistryCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.showCommandRegistry}`,
  (subject, message) => {
    recordNatsSubscribe(subject);
    void handleShowCommandRegistryCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(showCommandRegistryCommandSub);

// Subscribe to module-uptime command execution messages
const moduleUptimeCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.moduleUptime}`,
  (subject, message) => {
    recordNatsSubscribe(subject);
    void handleModuleUptimeCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(moduleUptimeCommandSub);

// Subscribe to module-restart command execution messages
const moduleRestartCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.moduleRestart}`,
  (subject, message) => {
    recordNatsSubscribe(subject);
    void handleModuleRestartCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(moduleRestartCommandSub);

// Subscribe to list-bot-modules command execution messages
const listBotModulesCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.listBotModules}`,
  (subject, message) => {
    recordNatsSubscribe(subject);
    void handleListBotModulesCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(listBotModulesCommandSub);

// Subscribe to bot-stats command execution messages
const botStatsCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.botStats}`,
  (subject, message) => {
    recordNatsSubscribe(subject);
    void handleBotStatsCommand(nats, adminConfig, subject, message);
  }
);
natsSubscriptions.push(botStatsCommandSub);

// Subscribe to router responses with rate limit statistics
const routerResponseSub = nats.subscribe(
  'admin.response.router.ratelimit-stats',
  (subject, message) => {
    recordNatsSubscribe(subject);
    void handleRouterRatelimitStatsResponse(nats, subject, message);
  }
);
natsSubscriptions.push(routerResponseSub);

// Subscribe to router responses with command registry information
const routerCommandRegistryResponseSub = nats.subscribe(
  'admin.response.router.command-registry',
  (subject, message) => {
    recordNatsSubscribe(subject);
    void handleRouterCommandRegistryResponse(nats, subject, message);
  }
);
natsSubscriptions.push(routerCommandRegistryResponseSub);

// Subscribe to control messages for re-registering commands
const controlSubRegisterCommandAdminJoin = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.join}`,
  (subject) => {
    recordNatsSubscribe(subject);
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
  (subject) => {
    recordNatsSubscribe(subject);
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
  (subject) => {
    recordNatsSubscribe(subject);
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
  (subject) => {
    recordNatsSubscribe(subject);
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
  (subject) => {
    recordNatsSubscribe(subject);
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
  (subject) => {
    recordNatsSubscribe(subject);
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
  (subject) => {
    recordNatsSubscribe(subject);
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
  (subject) => {
    recordNatsSubscribe(subject);
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
  (subject) => {
    recordNatsSubscribe(subject);
    log.info('Received control.registerCommands control message', {
      producer: 'admin',
    });
    void registerAdminCommands(nats, adminConfig);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAll);

// Subscribe to stats.emit.request messages and respond with full module stats
const statsEmitRequestSub = nats.subscribe(
  'stats.emit.request',
  (subject, message) => {
    recordNatsSubscribe(subject);
    try {
      const data = JSON.parse(message.string());
      log.info('Received stats.emit.request', {
        producer: 'admin',
        replyChannel: data.replyChannel,
      });

      // Calculate uptime in milliseconds
      const uptime = Date.now() - moduleStartTime;

      // Get all prom-client metrics
      void register
        .metrics()
        .then((prometheusMetrics) => {
          // Get memory usage information
          const memoryUsage = process.memoryUsage();

          // Send stats back via the ephemeral reply channel
          const statsResponse = {
            module: 'admin',
            stats: {
              uptime_seconds: Math.floor(uptime / 1000),
              uptime_formatted: `${Math.floor(uptime / 86400000)}d ${Math.floor((uptime % 86400000) / 3600000)}h ${Math.floor((uptime % 3600000) / 60000)}m ${Math.floor((uptime % 60000) / 1000)}s`,
              memory_rss_mb: Math.round(memoryUsage.rss / (1024 * 1024)),
              memory_heap_used_mb: Math.round(
                memoryUsage.heapUsed / (1024 * 1024)
              ),
              prometheus_metrics: prometheusMetrics,
            },
          };

          if (data.replyChannel) {
            void nats.publish(data.replyChannel, JSON.stringify(statsResponse));
            recordNatsPublish(data.replyChannel, 'stats_response');
          }
        })
        .catch((error) => {
          log.error('Failed to collect prometheus metrics', {
            producer: 'admin',
            error: error,
          });
        });
    } catch (error) {
      log.error('Failed to process stats.emit.request', {
        producer: 'admin',
        error: error,
      });
    }
  }
);
natsSubscriptions.push(statsEmitRequestSub);
