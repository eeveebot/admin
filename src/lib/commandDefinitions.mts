'use strict';

// Command UUIDs
export const adminCommandUUIDs = {
  join: '20a6f27e-bd12-4c5c-931e-cb4a232b2ce5',
  part: '8d5c0a13-1336-4882-aa41-00a068b2aa00',
  showRatelimits: '2bbfdf48-4cab-4200-b8a6-521036ffa87e',
  showCommandRegistry: '13576a4e-f6a5-4659-99d0-4cab09a9158c',
  moduleUptime: 'f8e8a7b2-4c1d-4e5f-9a2b-3c4d5e6f7890',
  moduleRestart: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  listBotModules: 'b2c3d4e5-f6g7-8901-bcde-fg2345678901',
  botStats: 'c3d4e5f6-g7h8-9012-cdef-gh3456789012',
};

// Command display names
export const adminCommandDisplayNames = {
  join: 'admin-join',
  part: 'admin-part',
  showRatelimits: 'admin-show-ratelimits',
  showCommandRegistry: 'admin-show-command-registry',
  moduleUptime: 'admin-module-uptime',
  moduleRestart: 'admin-module-restart',
  listBotModules: 'admin-list-bot-modules',
  botStats: 'admin-bot-stats',
};

// Help information for admin commands
export const adminHelp = [
  {
    command: 'admin join',
    descr: 'Join a channel on a specific platform/network/instance',
    params: [
      {
        param: 'platform',
        required: true,
        descr: 'Platform to join (e.g., discord, slack, irc)',
      },
      {
        param: 'network',
        required: true,
        descr: 'Network name',
      },
      {
        param: 'instance',
        required: true,
        descr: 'Instance identifier',
      },
      {
        param: 'channel',
        required: true,
        descr: 'Channel name to join',
      },
    ],
  },
  {
    command: 'admin part',
    descr: 'Leave a channel on a specific platform/network/instance',
    params: [
      {
        param: 'platform',
        required: true,
        descr: 'Platform to leave (e.g., discord, slack, irc)',
      },
      {
        param: 'network',
        required: true,
        descr: 'Network name',
      },
      {
        param: 'instance',
        required: true,
        descr: 'Instance identifier',
      },
      {
        param: 'channel',
        required: true,
        descr: 'Channel name to leave',
      },
    ],
  },
  {
    command: 'admin show-ratelimits',
    descr: 'Show current rate limit statistics',
    params: [],
  },
  {
    command: 'admin show-command-registry',
    descr: 'Show current command registry',
    params: [],
  },
  {
    command: 'admin module-uptime',
    descr: 'Show uptime information for all modules',
    params: [],
  },
  {
    command: 'admin module-restart',
    descr: 'Restart a specific module',
    params: [
      {
        param: 'module',
        required: true,
        descr: 'Name of the module to restart',
      },
    ],
  },
  {
    command: 'admin list-bot-modules',
    descr: 'List all bot modules and their deployment information',
    params: [],
  },
  {
    command: 'admin bot-stats',
    descr: 'Show bot statistics from various modules',
    params: [],
  },
];