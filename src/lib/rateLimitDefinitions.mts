'use strict';

import { AdminRootConfig } from '../types/admin.types.mjs';

/**
 * Get rate limit configuration for admin commands
 * @param adminConfig - The loaded admin configuration
 * @returns Object containing rate limit configurations for each command
 */
export function getAdminRateLimits(adminConfig: AdminRootConfig) {
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

  return {
    joinRateLimit,
    partRateLimit,
    showRatelimitsRateLimit,
    showCommandRegistryRateLimit,
    moduleUptimeRateLimit,
    moduleRestartRateLimit,
    listBotModulesRateLimit,
    botStatsRateLimit,
  };
}