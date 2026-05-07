'use strict';

import { RateLimitConfig } from '@eeveebot/libeevee';

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
