# Admin Module

Admin manager and control command dispatcher for the Eevee bot ecosystem.

## Overview

The admin module manages bot administrators and permissions. It loads administrator configurations from a YAML file specified by the `MODULE_CONFIG_PATH` environment variable and provides administrative commands for controlling chat connectors.

This module enables authorized administrators to dynamically join and part channels across different platforms through simple commands.

## Features

- Administrator authentication and authorization
- Dynamic channel joining/parting commands
- Multi-platform support (currently IRC focused)
- NATS messaging integration
- Configurable rate limiting for commands

## Configuration

The module expects a YAML configuration file with the following structure:

```yaml
admins:
- displayName: 'Admin Name'
  uuid: '$(uuidgen)'
  acceptedPlatforms:
    - 'irc'
  authentication:
    irc:
      hostmask: 'user@host.mask'
```

### Configuration Fields

- `displayName`: Human-readable name for the administrator
- `uuid`: Unique identifier for this admin entry
- `acceptedPlatforms`: Array of platform identifiers or regex patterns this admin can operate on
- `authentication`: Authentication methods for this admin
  - `irc.hostmask`: IRC hostmask pattern for identification (supports regex)

See [`config/admin-config.example.yaml`](config/admin-config.example.yaml) for a complete example.

## Environment Variables

| Variable             | Required | Description                               |
| -------------------- | -------- | ----------------------------------------- |
| `MODULE_CONFIG_PATH` | Yes      | Path to the admin configuration YAML file |
| `NATS_HOST`          | Yes      | NATS server host                          |
| `NATS_TOKEN`         | Yes      | NATS authentication token                 |

## Commands

Once configured and running, authenticated administrators can use the following commands:

### Join Command

```none
admin join #channel [key]
```

Joins the specified channel with an optional key.

### Part Command

```none
admin part #channel
```

Parts/leaves the specified channel.

## Security

Administrators are authenticated based on their platform-specific identifiers:

- **IRC**: Hostmask matching (exact both exact matches and regex patterns)

Only properly authenticated administrators can execute control commands. All command attempts are logged for security auditing.

## Architecture

The admin module communicates with other services through NATS messaging:

- Registers commands with the command router
- Subscribes to command execution events
- Publishes control messages to chat connectors

## Development

### Prerequisites

- Node.js >= 24.0.0

### Build Commands

```bash
# Install dependencies
npm install

# Run linter
npm run test

# Build the project
npm run build

# Development mode (build and run)
npm run dev
```

### Dependencies

- `@eeveebot/libeevee`: Shared Eevee bot library
- `nats`: NATS messaging client
- `js-yaml`: YAML parsing
- `winston`: Logging framework
