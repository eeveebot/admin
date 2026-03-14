'use strict';

// Rate limit configuration interface
export interface RateLimitConfig {
  mode: 'enqueue' | 'drop';
  level: 'channel' | 'user' | 'global';
  limit: number;
  interval: string; // e.g., "30s", "1m", "5m"
}

// Admin authentication interface for IRC hostmask
export interface IrcAuthentication {
  hostmask: string;
}

// Supported authentication methods
export interface AuthenticationMethods {
  irc?: IrcAuthentication;
}

// Admin configuration interface
export interface AdminConfig {
  displayName: string;
  uuid: string;
  acceptedPlatforms: string[];
  authentication: AuthenticationMethods;
}

// Root configuration interface
export interface AdminRootConfig {
  admins: AdminConfig[];
  ratelimits?: {
    join?: RateLimitConfig;
    part?: RateLimitConfig;
    showRatelimits?: RateLimitConfig;
    showCommandRegistry?: RateLimitConfig;
    moduleUptime?: RateLimitConfig;
    moduleRestart?: RateLimitConfig;
    listBotModules?: RateLimitConfig;
    botStats?: RateLimitConfig;
  };
}
