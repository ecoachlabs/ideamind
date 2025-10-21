/**
 * IdeaMine Tools SDK - Cryptographic Utilities
 * Hash functions for idempotence and data integrity
 */

import { createHash, randomBytes } from 'crypto';

// ============================================================================
// HASH FUNCTIONS
// ============================================================================

/**
 * Compute SHA-256 hash of a string
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Compute SHA-256 hash of an object (deterministic JSON serialization)
 */
export function sha256Object(obj: any): string {
  const normalized = normalizeObject(obj);
  const json = JSON.stringify(normalized);
  return sha256(json);
}

/**
 * Compute MD5 hash of a string (for non-cryptographic purposes ONLY)
 *
 * @deprecated MD5 is cryptographically broken. Use sha256() for security purposes.
 * This function is ONLY for non-cryptographic uses like content fingerprinting
 * where cryptographic security is not required.
 *
 * WARNING: This function will log a warning in development mode.
 */
export function md5NonCryptographic(data: string): string {
  // MEDIUM FIX: Warn developers not to use MD5 for security
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[SECURITY WARNING] md5NonCryptographic() called. MD5 is cryptographically broken. ' +
      'Use sha256() for any security-sensitive operations.'
    );
  }

  return createHash('md5').update(data).digest('hex');
}

/**
 * @deprecated Use md5NonCryptographic() or sha256() instead.
 * This alias will be removed in a future version.
 */
export function md5(data: string): string {
  return md5NonCryptographic(data);
}

/**
 * Compute hash for tool execution idempotence
 * Combines tool version, input data, and optional context
 */
export function computeExecutionKey(
  toolId: string,
  version: string,
  input: Record<string, any>,
  context?: {
    agentId?: string;
    phase?: string;
  }
): string {
  const data = {
    toolId,
    version,
    input: normalizeObject(input),
    ...(context?.agentId && { agentId: context.agentId }),
    ...(context?.phase && { phase: context.phase }),
  };

  return sha256Object(data);
}

/**
 * Compute input hash for idempotence cache lookup
 */
export function computeInputHash(input: Record<string, any>): string {
  return sha256Object(input);
}

/**
 * Compute artifact hash for integrity verification
 */
export function computeArtifactHash(content: Buffer | string): string {
  const buffer = typeof content === 'string' ? Buffer.from(content) : content;
  return createHash('sha256').update(buffer).digest('hex');
}

// ============================================================================
// OBJECT NORMALIZATION
// ============================================================================

/**
 * Normalize object for deterministic hashing
 * - Sorts object keys
 * - Removes undefined values
 * - Handles nested objects and arrays
 * - Ensures consistent serialization
 */
export function normalizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(normalizeObject);
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (obj instanceof RegExp) {
    return obj.toString();
  }

  if (obj instanceof Map) {
    const entries = Array.from(obj.entries()).sort(([a], [b]) =>
      String(a).localeCompare(String(b))
    );
    return Object.fromEntries(entries.map(([k, v]) => [k, normalizeObject(v)]));
  }

  if (obj instanceof Set) {
    return Array.from(obj).sort().map(normalizeObject);
  }

  // Regular object
  const normalized: Record<string, any> = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    const value = obj[key];

    // Skip undefined and function values
    if (value === undefined || typeof value === 'function') {
      continue;
    }

    normalized[key] = normalizeObject(value);
  }

  return normalized;
}

// ============================================================================
// RANDOM GENERATION
// ============================================================================

/**
 * Generate cryptographically secure random hex string
 */
export function randomHex(bytes: number = 16): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Generate random UUID v4
 */
export function randomUUID(): string {
  // Node.js 14.17.0+ has built-in randomUUID
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }

  // Fallback implementation
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

  const hex = bytes.toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join('-');
}

/**
 * Generate execution ID (random UUID)
 */
export function generateExecutionId(): string {
  return randomUUID();
}

/**
 * Generate idempotency token
 */
export function generateIdempotencyToken(): string {
  return randomHex(32);
}

// ============================================================================
// VERIFICATION
// ============================================================================

/**
 * Verify artifact hash matches expected
 */
export function verifyArtifactHash(
  content: Buffer | string,
  expectedHash: string
): boolean {
  const actualHash = computeArtifactHash(content);
  return actualHash === expectedHash;
}

/**
 * Compare two hashes in constant time (prevents timing attacks)
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

// ============================================================================
// BASE64 ENCODING/DECODING
// ============================================================================

/**
 * Encode data to Base64
 */
export function toBase64(data: string | Buffer): string {
  const buffer = typeof data === 'string' ? Buffer.from(data) : data;
  return buffer.toString('base64');
}

/**
 * Decode Base64 to string
 */
export function fromBase64(base64: string): string {
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Decode Base64 to Buffer
 */
export function fromBase64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

/**
 * Encode data to URL-safe Base64
 */
export function toBase64Url(data: string | Buffer): string {
  return toBase64(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode URL-safe Base64
 */
export function fromBase64Url(base64url: string): string {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  const padded = padding ? base64 + '='.repeat(4 - padding) : base64;
  return fromBase64(padded);
}
