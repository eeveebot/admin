# admin
admin manager / control command dispatcher

## Overview
The admin module manages bot administrators and permissions. It loads administrator configurations from a YAML file specified by the `ADMIN_CONFIG_PATH` environment variable.

## Configuration
The module expects a YAML configuration file with the following structure:

```yaml
admins:
  - displayName: "Admin Name"
    uuid: "unique-identifier"
    acceptedPlatforms:
      - "platform-name"
    authentication:
      irc:
        hostmask: "ident@host.mask"
```

## Environment Variables
- `ADMIN_CONFIG_PATH`: Path to the admin configuration YAML file (required)
- `NATS_HOST`: NATS server host (required)
- `NATS_TOKEN`: NATS authentication token (required)
