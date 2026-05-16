'use strict';

// Command UUIDs
export const adminCommandUUIDs = {
  join: '74f22011-6066-47fa-b7c7-313511f22a8a',
  part: 'e38f691e-b671-4217-bc70-fd02d2e763c5',
  showRatelimits: '2e9ec6b9-9309-4083-a30d-857c8f5a5802',
  showCommandRegistry: '881eb895-5507-44f4-afd6-936dce88e25e',
  moduleRestart: 'fcfe0e9c-9104-493f-b533-113a2838efdb',
  listBotModules: '5ddb9356-e581-469e-88a7-a42e916d09b8',
  botStats: '48f329be-e150-488a-a9d9-1ca1b4300c2d',
  health: 'a7c4e8f2-3b1d-4e5a-9f8c-2d6b0a1e3f7c',
};

// Command display names
export const adminCommandDisplayNames = {
  join: 'admin-join',
  part: 'admin-part',
  showRatelimits: 'admin-show-ratelimits',
  showCommandRegistry: 'admin-show-command-registry',
  moduleRestart: 'admin-module-restart',
  listBotModules: 'admin-list-bot-modules',
  botStats: 'admin-bot-stats',
  health: 'admin-health',
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
  {
    command: 'admin health',
    descr: 'Show health status of all bot modules',
    params: [],
  },
];