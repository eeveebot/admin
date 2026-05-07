# Admin

> Admin manager and control command dispatcher for the eevee ecosystem.

## Overview

The admin module manages bot administrators and permissions. It loads administrator configurations from a YAML file specified by the `MODULE_CONFIG_PATH` environment variable and provides administrative commands for controlling chat connectors and inspecting bot state.

This module enables authorized administrators to dynamically join and part channels across different platforms, view rate-limit statistics, inspect the command registry, check module uptime, restart modules, list deployed modules, and retrieve bot statistics — all through simple chat commands routed via NATS.

The admin module is a core infrastructure component: it registers its commands with the router, subscribes to command execution events, publishes control messages to connectors, and publishes help information to the help module.

## Features

- Administrator authentication and authorization via IRC hostmask matching (exact and regex)
- Dynamic channel joining and parting across platforms
- Rate-limit statistics inspection (`admin show-ratelimits`)
- Command registry inspection (`admin show-command-registry`)
- Module uptime reporting (`admin module-uptime`)
- Module restart capability (`admin module-restart`)
- Bot module listing with deployment info (`admin list-bot-modules`)
- Bot statistics aggregation (`admin bot-stats`)
- Configurable per-command rate limiting (drop or enqueue mode, user/channel/global scope)
- NATS messaging integration for command routing and inter-service communication
- Prometheus metrics and health-check HTTP endpoint
- Help documentation auto-publishing to the help module

## Install

```bash
npm install @eeveebot/admin
```

Or, in the eevee workspace:

```bash
cd admin
npm install
```

## Configuration

The module expects a YAML configuration file with the following structure:

```yaml
admins:
  - displayName: "root"
    uuid: "123e4567-e89b-12d3-a456-426614174000"
    acceptedPlatforms:
      - "irc"
      - "discord"
    authentication:
      irc:
        hostmask: "nick!username@example.com"
ratelimits:
  join:
    mode: drop
    level: user
    limit: 3
    interval: 1m
  part:
    mode: drop
    level: user
    limit: 3
    interval: 1m
```

### Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| `admins` | Yes | Array of administrator entries |
| `admins[].displayName` | Yes | Human-readable name for the administrator |
| `admins[].uuid` | Yes | Unique identifier for this admin entry |
| `admins[].acceptedPlatforms` | Yes | Array of platform identifiers or regex patterns this admin can operate on |
| `admins[].authentication.irc.hostmask` | Yes | IRC hostmask pattern for identification (supports regex) |
| `ratelimits` | No | Per-command rate limit configuration |
| `ratelimits.<command>.mode` | No | `drop` (reject excess) or `enqueue` (queue excess) |
| `ratelimits.<command>.level` | No | Scope: `user`, `channel`, or `global` |
| `ratelimits.<command>.limit` | No | Maximum number of requests allowed |
| `ratelimits.<command>.interval` | No | Time period for the limit (e.g., `30s`, `1m`, `5m`) |

Rate limits can be configured for: `join`, `part`, `showRatelimits`, `showCommandRegistry`, `moduleUptime`, `moduleRestart`, `listBotModules`, `botStats`. All default to `{ mode: "drop", level: "user", limit: 3, interval: "1m" }` (5 requests/min for `moduleUptime`, `listBotModules`, and `botStats`).

See [`config/admin-config.example.yaml`](config/admin-config.example.yaml) for a complete example.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MODULE_CONFIG_PATH` | Yes | — | Path to the admin configuration YAML file |
| `NATS_HOST` | Yes | — | NATS server host |
| `NATS_TOKEN` | Yes | — | NATS authentication token |
| `HTTP_API_PORT` | No | `9000` | Port for the metrics and health-check HTTP server |

## Commands

Once configured and running, authenticated administrators can use the following commands:

### `admin join`

```none
admin join <platform> <network> <instance> <channel>
```

Joins the specified channel on the given platform, network, and instance.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `platform` | Yes | Platform to join (e.g., `irc`, `discord`) |
| `network` | Yes | Network name |
| `instance` | Yes | Instance identifier |
| `channel` | Yes | Channel name to join |

### `admin part`

```none
admin part <platform> <network> <instance> <channel>
```

Leaves the specified channel on the given platform, network, and instance.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `platform` | Yes | Platform to leave |
| `network` | Yes | Network name |
| `instance` | Yes | Instance identifier |
| `channel` | Yes | Channel name to leave |

### `admin show-ratelimits`

```none
admin show-ratelimits
```

Displays current rate-limit statistics from the router.

### `admin show-command-registry`

```none
admin show-command-registry
```

Displays the current command registry from the router.

### `admin module-uptime`

```none
admin module-uptime
```

Shows uptime information for all active bot modules.

### `admin module-restart`

```none
admin module-restart <module>
```

Restarts the specified module.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `module` | Yes | Name of the module to restart |

### `admin list-bot-modules`

```none
admin list-bot-modules
```

Lists all bot modules and their deployment information.

### `admin bot-stats`

```none
admin bot-stats
```

Shows aggregated statistics from various bot modules.

## Security

Administrators are authenticated based on their platform-specific identifiers:

- **IRC**: Hostmask matching (supports both exact matches and regex patterns)
- Currently, only IRC authentication is supported; other platforms are rejected

Only properly authenticated administrators can execute control commands. All command attempts are logged for security auditing.

## Architecture

The admin module communicates with other services through NATS messaging:

```
┌─────────┐  command.register  ┌────────┐
│  Admin  │ ──────────────────► │ Router │
│ Module  │ ◄────────────────── │        │
│         │  command.execute.*  │        │
└────┬────┘                     └────────┘
     │
     │  help.update
     ▼
┌─────────┐
│  Help   │
│ Module  │
└─────────┘
```

- **Command registration**: On startup, admin publishes `command.register` messages to the router for each command with its UUID, regex pattern, and rate-limit config.
- **Command execution**: Admin subscribes to `command.execute.<UUID>` subjects to receive routed commands.
- **Help publishing**: Admin publishes help docs to `help.update` and responds to `help.updateRequest`.
- **Control messages**: Admin subscribes to `control.registerCommands.*` to re-register commands on demand.
- **Stats collection**: Admin subscribes to `stats.emit.request` and responds with uptime, memory, and Prometheus metrics.
- **Metrics**: An HTTP server exposes Prometheus metrics and a health-check endpoint (default port 9000).

## Development

### Prerequisites

- Node.js >= 24.0.0

### Build & Run

```bash
# Install dependencies
npm install

# Run linter
npm test

# Build the project
npm run build

# Development mode (build and run)
npm run dev
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `@eeveebot/libeevee` | Shared eevee library (NATS client, logging, metrics) |
| `nats` | NATS messaging client |
| `js-yaml` | YAML configuration parsing |
| `winston` | Logging framework |
| `prom-client` | Prometheus metrics collection |
| `ascii-table` | Tabular output formatting |
| `irc-framework` | IRC protocol support |

## Contributing

Contributions are welcome! Please see the [eevee contributing guide](https://github.com/eeveebot/eevee) for details.

## License

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — see [LICENSE](./LICENSE) for the full text.
