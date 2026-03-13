'use strict';

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
}