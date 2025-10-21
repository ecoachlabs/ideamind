/**
 * Secure ID Generation Utilities
 *
 * SECURITY FIX #6: Use cryptographically secure UUID generation
 * instead of Math.random() which is predictable.
 */

import { randomUUID, randomBytes } from 'crypto';

/**
 * Generate a cryptographically secure UUID (v4)
 *
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * Example: 550e8400-e29b-41d4-a716-446655440000
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * Generate a prefixed UUID for better readability and type identification
 *
 * @param prefix - Identifier prefix (e.g., 'run', 'agent', 'phase')
 * @returns Prefixed UUID (e.g., 'run-550e8400-e29b-41d4-a716-446655440000')
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

/**
 * Generate a short, URL-safe random ID
 *
 * SECURITY: Uses crypto.randomBytes for cryptographic randomness
 *
 * @param length - Length of the random portion (default: 9)
 * @returns Short ID (e.g., 'xK9fZ2mL4')
 */
export function generateShortId(length: number = 9): string {
  // Generate random bytes and convert to base62 (alphanumeric)
  const bytes = randomBytes(Math.ceil(length * 3 / 4));
  return bytes
    .toString('base64')
    .replace(/[+/=]/g, '') // Remove non-alphanumeric
    .slice(0, length);
}

/**
 * Generate a prefixed short ID for compact identifiers
 *
 * @param prefix - Identifier prefix
 * @param length - Length of random portion (default: 9)
 * @returns Prefixed short ID (e.g., 'msg-xK9fZ2mL4')
 */
export function generatePrefixedShortId(prefix: string, length: number = 9): string {
  return `${prefix}-${generateShortId(length)}`;
}

/**
 * DEPRECATED: Old insecure ID generator
 * @deprecated Use generatePrefixedShortId() instead
 */
export function generateIdLegacy(prefix: string): string {
  console.warn(`[DEPRECATED] generateIdLegacy() is deprecated. Use generatePrefixedShortId() instead.`);
  return `${prefix}-${Date.now()}-${generateShortId(9)}`;
}
