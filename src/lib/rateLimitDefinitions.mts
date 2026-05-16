'use strict';

import { RateLimitConfig } from '@eeveebot/libeevee';
import { AdminRootConfig } from '../types/admin.types.mjs';

/**
 * Get rate limit configuration for admin commands
 * @param adminConfig - The loaded admin configuration
 * @returns Object containing rate limit configurations for each command
 */
export function getAdminRateLimits(adminConfig: AdminRootConfig) {
  // Default rate limit configurations
  const defaultRateLimits: Record<string, RateLimitConfig> = {
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
    health: {
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
  const moduleRestartRateLimit =
    adminConfig.ratelimits?.moduleRestart || defaultRateLimits.moduleRestart;
  const listBotModulesRateLimit =
    adminConfig.ratelimits?.listBotModules || defaultRateLimits.listBotModules;
  const botStatsRateLimit =
    adminConfig.ratelimits?.botStats || defaultRateLimits.botStats;
  const healthRateLimit =
    adminConfig.ratelimits?.health || defaultRateLimits.health;

  return {
    joinRateLimit: joinRateLimit as RateLimitConfig,
    partRateLimit: partRateLimit as RateLimitConfig,
    showRatelimitsRateLimit: showRatelimitsRateLimit as RateLimitConfig,
    showCommandRegistryRateLimit: showCommandRegistryRateLimit as RateLimitConfig,
    moduleRestartRateLimit: moduleRestartRateLimit as RateLimitConfig,
    listBotModulesRateLimit: listBotModulesRateLimit as RateLimitConfig,
    botStatsRateLimit: botStatsRateLimit as RateLimitConfig,
    healthRateLimit: healthRateLimit as RateLimitConfig,
  };
}