'use strict';

import fs from 'node:fs';
import yaml from 'js-yaml';
import { log } from '@eeveebot/libeevee';
import { AdminRootConfig } from '../types/admin.types.mjs';

const ADMIN_CONFIG_ENV_VAR = 'MODULE_CONFIG_PATH';

/**
 * Load admin configuration from YAML file
 * @returns AdminRootConfig parsed from YAML file
 */
export async function loadAdminConfig(): Promise<AdminRootConfig> {
  // Get the config file path from environment variable
  const configPath = process.env[ADMIN_CONFIG_ENV_VAR];
  if (!configPath) {
    const msg = `Environment variable ${ADMIN_CONFIG_ENV_VAR} is not set.`;
    log.error(msg, { producer: 'admin' });
    throw new Error(msg);
  }

  try {
    // Read the YAML file
    const configFile = fs.readFileSync(configPath, 'utf8');

    // Parse the YAML content
    const config = yaml.load(configFile) as AdminRootConfig;

    // Validate the configuration
    if (!config.admins || !Array.isArray(config.admins)) {
      const msg =
        'Invalid admin configuration: admins array is missing or not an array';
      log.error(msg, { producer: 'admin', configPath });
      throw new Error(msg);
    }

    // Validate each admin entry
    for (const [index, admin] of config.admins.entries()) {
      if (!admin.displayName) {
        const msg = `Invalid admin configuration at index ${index}: displayName is required`;
        log.error(msg, { producer: 'admin', configPath });
        throw new Error(msg);
      }

      if (!admin.uuid) {
        const msg = `Invalid admin configuration at index ${index}: uuid is required`;
        log.error(msg, { producer: 'admin', configPath });
        throw new Error(msg);
      }

      if (!admin.acceptedPlatforms || !Array.isArray(admin.acceptedPlatforms)) {
        const msg = `Invalid admin configuration for ${admin.displayName}: acceptedPlatforms is required and must be an array`;
        log.error(msg, { producer: 'admin', configPath });
        throw new Error(msg);
      }

      if (!admin.authentication) {
        const msg = `Invalid admin configuration for ${admin.displayName}: authentication is required`;
        log.error(msg, { producer: 'admin', configPath });
        throw new Error(msg);
      }

      // For now, we only support IRC authentication
      if (!admin.authentication.irc) {
        const msg = `Invalid admin configuration for ${admin.displayName}: IRC authentication is required`;
        log.error(msg, { producer: 'admin', configPath });
        throw new Error(msg);
      }

      if (!admin.authentication.irc.hostmask) {
        const msg = `Invalid admin configuration for ${admin.displayName}: IRC hostmask is required`;
        log.error(msg, { producer: 'admin', configPath });
        throw new Error(msg);
      }
    }

    log.info(`Loaded admin configuration with ${config.admins.length} admins`, {
      producer: 'admin',
      configPath,
    });

    return config;
  } catch (error) {
    log.error('Failed to load admin configuration', {
      producer: 'admin',
      configPath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
