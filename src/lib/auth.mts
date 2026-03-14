'use strict';

import { AdminRootConfig } from '../types/admin.types.mjs';

/**
 * Check if a user is an authenticated admin
 * @param adminConfig - The loaded admin configuration
 * @param platform - The platform the user is connecting from
 * @param user - The username
 * @param userHost - The user's host
 * @returns boolean indicating if the user is an authenticated admin
 */
export function isAuthenticatedAdmin(
  adminConfig: AdminRootConfig,
  platform: string,
  user: string,
  userHost: string
): boolean {
  // For now, we only support IRC authentication
  if (platform !== 'irc') {
    return false;
  }

  // Create full hostmask in the format user@host
  const fullHostmask = `${user}@${userHost}`;

  // Check if the user matches any admin's hostmask
  return adminConfig.admins.some((admin) => {
    // Check if the platform is accepted
    const platformAccepted = admin.acceptedPlatforms.some((pattern) => {
      const regex = new RegExp(pattern);
      return regex.test(platform);
    });

    // Check if the hostmask matches (support both exact match and regex)
    let hostmaskMatches = false;
    if (admin.authentication.irc?.hostmask) {
      try {
        const hostmaskRegex = new RegExp(admin.authentication.irc.hostmask);
        hostmaskMatches =
          hostmaskRegex.test(userHost) || hostmaskRegex.test(fullHostmask);
      } catch {
        // If regex fails, fall back to exact match
        hostmaskMatches =
          admin.authentication.irc.hostmask === userHost ||
          admin.authentication.irc.hostmask === fullHostmask;
      }
    }

    return platformAccepted && hostmaskMatches;
  });
}
