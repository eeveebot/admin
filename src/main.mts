'use strict';

// Admin module
// manages bot administrators and permissions

import {
  NatsClient,
  log,
  createNatsConnection,
  registerGracefulShutdown,
  createModuleMetrics,
  initializeSystemMetrics,
  setupHttpServer,
  registerCommand,
  registerHelp,
  registerStatsHandlers,
  HelpEntry,
} from '@eeveebot/libeevee';
import { loadAdminConfig } from './lib/admin-config.mjs';
import { AdminRootConfig } from './types/admin.types.mjs';
import {
  adminCommandUUIDs,
  adminCommandDisplayNames,
  adminHelp,
} from './lib/commandDefinitions.mjs';
import { getAdminRateLimits } from './lib/rateLimitDefinitions.mjs';
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

const natsClients: InstanceType<typeof NatsClient>[] = [];

// Setup HTTP server for metrics and health checks
setupHttpServer({
  port: process.env.HTTP_API_PORT || '9000',
  serviceName: 'admin',
  natsClients: natsClients,
});
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

// Get rate limits from admin config
const rateLimits = getAdminRateLimits(adminConfig);

// Register commands with the router using registerCommand helper
const joinSubs = await registerCommand(
  nats,
  {
    commandUUID: adminCommandUUIDs.join,
    commandDisplayName: adminCommandDisplayNames.join,
    regex: '^admin join',
    platformPrefixAllowed: true,
    ratelimit: rateLimits.joinRateLimit,
  },
  metrics
);
natsSubscriptions.push(...joinSubs);

const partSubs = await registerCommand(
  nats,
  {
    commandUUID: adminCommandUUIDs.part,
    commandDisplayName: adminCommandDisplayNames.part,
    regex: '^admin part',
    platformPrefixAllowed: true,
    ratelimit: rateLimits.partRateLimit,
  },
  metrics
);
natsSubscriptions.push(...partSubs);

const showRatelimitsSubs = await registerCommand(
  nats,
  {
    commandUUID: adminCommandUUIDs.showRatelimits,
    commandDisplayName: adminCommandDisplayNames.showRatelimits,
    regex: '^admin show-ratelimits',
    platformPrefixAllowed: true,
    ratelimit: rateLimits.showRatelimitsRateLimit,
  },
  metrics
);
natsSubscriptions.push(...showRatelimitsSubs);

const showCommandRegistrySubs = await registerCommand(
  nats,
  {
    commandUUID: adminCommandUUIDs.showCommandRegistry,
    commandDisplayName: adminCommandDisplayNames.showCommandRegistry,
    regex: '^admin show-command-registry',
    platformPrefixAllowed: true,
    ratelimit: rateLimits.showCommandRegistryRateLimit,
  },
  metrics
);
natsSubscriptions.push(...showCommandRegistrySubs);

const moduleUptimeSubs = await registerCommand(
  nats,
  {
    commandUUID: adminCommandUUIDs.moduleUptime,
    commandDisplayName: adminCommandDisplayNames.moduleUptime,
    regex: '^admin module-uptime',
    platformPrefixAllowed: true,
    ratelimit: rateLimits.moduleUptimeRateLimit,
  },
  metrics
);
natsSubscriptions.push(...moduleUptimeSubs);

const moduleRestartSubs = await registerCommand(
  nats,
  {
    commandUUID: adminCommandUUIDs.moduleRestart,
    commandDisplayName: adminCommandDisplayNames.moduleRestart,
    regex: '^admin module-restart',
    platformPrefixAllowed: true,
    ratelimit: rateLimits.moduleRestartRateLimit,
  },
  metrics
);
natsSubscriptions.push(...moduleRestartSubs);

const listBotModulesSubs = await registerCommand(
  nats,
  {
    commandUUID: adminCommandUUIDs.listBotModules,
    commandDisplayName: adminCommandDisplayNames.listBotModules,
    regex: '^admin list-bot-modules',
    platformPrefixAllowed: true,
    ratelimit: rateLimits.listBotModulesRateLimit,
  },
  metrics
);
natsSubscriptions.push(...listBotModulesSubs);

const botStatsSubs = await registerCommand(
  nats,
  {
    commandUUID: adminCommandUUIDs.botStats,
    commandDisplayName: adminCommandDisplayNames.botStats,
    regex: '^admin bot-stats',
    platformPrefixAllowed: true,
    ratelimit: rateLimits.botStatsRateLimit,
  },
  metrics
);
natsSubscriptions.push(...botStatsSubs);

// Subscribe to command execution messages
const joinCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.join}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleJoinCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(joinCommandSub);

const partCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.part}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handlePartCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(partCommandSub);

const showRatelimitsCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.showRatelimits}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleShowRatelimitsCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(showRatelimitsCommandSub);

const showCommandRegistryCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.showCommandRegistry}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleShowCommandRegistryCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(showCommandRegistryCommandSub);

const moduleUptimeCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.moduleUptime}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleModuleUptimeCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(moduleUptimeCommandSub);

const moduleRestartCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.moduleRestart}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleModuleRestartCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(moduleRestartCommandSub);

const listBotModulesCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.listBotModules}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleListBotModulesCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(listBotModulesCommandSub);

const botStatsCommandSub = nats.subscribe(
  `command.execute.${adminCommandUUIDs.botStats}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleBotStatsCommand(nats, adminConfig, metrics, subject, message);
  }
);
natsSubscriptions.push(botStatsCommandSub);

// Subscribe to router responses
const routerResponseSub = nats.subscribe(
  'admin.response.router.ratelimit-stats',
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleRouterRatelimitStatsResponse(nats, metrics, subject, message);
  }
);
natsSubscriptions.push(routerResponseSub);

const routerCommandRegistryResponseSub = nats.subscribe(
  'admin.response.router.command-registry',
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    void handleRouterCommandRegistryResponse(nats, metrics, subject, message);
  }
);
natsSubscriptions.push(routerCommandRegistryResponseSub);

// Register stats handlers
const statsSubs = registerStatsHandlers({ nats, moduleName: 'admin', startTime: moduleStartTime, metrics });
natsSubscriptions.push(...statsSubs);

// Register help information
const helpSubs = await registerHelp(nats, 'admin', adminHelp as HelpEntry[], metrics);
natsSubscriptions.push(...helpSubs);
