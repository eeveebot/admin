'use strict';

// Admin module
// manages bot administrators and permissions

import {
  NatsClient,
  log,
  createNatsConnection,
  registerGracefulShutdown,
  createModuleMetrics,
  register as promRegister,
  initializeSystemMetrics,
  setupHttpServer,
} from '@eeveebot/libeevee';
import { loadAdminConfig } from './lib/admin-config.mjs';
import { AdminRootConfig } from './types/admin.types.mjs';
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

// Initialize module-scoped metrics recorder
const metrics = createModuleMetrics('admin');

// Initialize system metrics
initializeSystemMetrics('admin');

// Setup HTTP server for metrics and health checks
setupHttpServer({
  port: process.env.HTTP_API_PORT || '9000',
  serviceName: 'admin',
  natsClients: natsClients,
});

const natsClients: InstanceType<typeof NatsClient>[] = [];
const natsSubscriptions: Array<Promise<string | boolean>> = [];

// Register graceful shutdown handlers
registerGracefulShutdown(natsClients);

// Setup NATS connection
const nats = await createNatsConnection();
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
await registerAdminCommands(nats, adminConfig, metrics);

// Subscribe to join command execution messages
const joinCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.join}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleJoinCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(joinCommandSub);

// Subscribe to part command execution messages
const partCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.part}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handlePartCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(partCommandSub);

// Subscribe to show-ratelimits command execution messages
const showRatelimitsCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.showRatelimits}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleShowRatelimitsCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(showRatelimitsCommandSub);

// Subscribe to show-command-registry command execution messages
const showCommandRegistryCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.showCommandRegistry}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleShowCommandRegistryCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(showCommandRegistryCommandSub);

// Subscribe to module-uptime command execution messages
const moduleUptimeCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.moduleUptime}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleModuleUptimeCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(moduleUptimeCommandSub);

// Subscribe to module-restart command execution messages
const moduleRestartCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.moduleRestart}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleModuleRestartCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(moduleRestartCommandSub);

// Subscribe to list-bot-modules command execution messages
const listBotModulesCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.listBotModules}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleListBotModulesCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(listBotModulesCommandSub);

// Subscribe to bot-stats command execution messages
const botStatsCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.botStats}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleBotStatsCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(botStatsCommandSub);

// Subscribe to router responses with rate limit statistics
const routerResponseSub = nats.subscribe(
  'admin.response.router.ratelimit-stats',
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleRouterRatelimitStatsResponse(nats, metrics, subject, message);
  }
);
natsSubscriptions.push(routerResponseSub);

// Subscribe to router responses with command registry information
const routerCommandRegistryResponseSub = nats.subscribe(
  'admin.response.router.command-registry',
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleRouterCommandRegistryResponse(nats, metrics, subject, message);
  }
);
natsSubscriptions.push(routerCommandRegistryResponseSub);

// Subscribe to control messages for re-registering commands
const controlSubRegisterCommandAdminJoin = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.join}`,
  (subject) => {
    metrics.recordNatsSubscribe(subject);
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.join} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig, metrics);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminJoin);

const controlSubRegisterCommandAdminPart = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.part}`,
  (subject) => {
    metrics.recordNatsSubscribe(subject);
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.part} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig, metrics);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminPart);

const controlSubRegisterCommandAdminShowRatelimits = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.showRatelimits}`,
  (subject) => {
    metrics.recordNatsSubscribe(subject);
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.showRatelimits} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig, metrics);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminShowRatelimits);

const controlSubRegisterCommandAdminShowCommandRegistry = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.showCommandRegistry}`,
  (subject) => {
    metrics.recordNatsSubscribe(subject);
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.showCommandRegistry} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig, metrics);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminShowCommandRegistry);

const controlSubRegisterCommandAdminModuleUptime = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.moduleUptime}`,
  (subject) => {
    metrics.recordNatsSubscribe(subject);
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.moduleUptime} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig, metrics);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminModuleUptime);

const controlSubRegisterCommandAdminModuleRestart = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.moduleRestart}`,
  (subject) => {
    metrics.recordNatsSubscribe(subject);
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.moduleRestart} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig, metrics);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminModuleRestart);

const controlSubRegisterCommandAdminListBotModules = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.listBotModules}`,
  (subject) => {
    metrics.recordNatsSubscribe(subject);
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.listBotModules} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig, metrics);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminListBotModules);

const controlSubRegisterCommandAdminBotStats = nats.subscribe(
  `control.registerCommands.${adminCommandDisplayNames.botStats}`,
  (subject) => {
    metrics.recordNatsSubscribe(subject);
    log.info(
      `Received control.registerCommands.${adminCommandDisplayNames.botStats} control message`,
      {
        producer: 'admin',
      }
    );
    void registerAdminCommands(nats, adminConfig, metrics);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAdminBotStats);

const controlSubRegisterCommandAll = nats.subscribe(
  'control.registerCommands',
  (subject) => {
    metrics.recordNatsSubscribe(subject);
    log.info('Received control.registerCommands control message', {
      producer: 'admin',
    });
    void registerAdminCommands(nats, adminConfig, metrics);
  }
);
natsSubscriptions.push(controlSubRegisterCommandAll);

// Subscribe to stats.emit.request messages and respond with full module stats
const statsEmitRequestSub = nats.subscribe(
  'stats.emit.request',
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    try {
      const data = JSON.parse(message.string());
      log.info('Received stats.emit.request', {
        producer: 'admin',
        replyChannel: data.replyChannel,
      });

      const uptime = Date.now() - moduleStartTime;

      void promRegister
        .metrics()
        .then((prometheusMetrics) => {
          const memoryUsage = process.memoryUsage();

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
            metrics.recordNatsPublish('stats_response');
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
