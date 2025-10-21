/**
 * Express type augmentations
 *
 * Properly typed Express Request extensions to avoid unsafe `any` casts
 */

import { Request } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { ApiConfig } from '../server';

/**
 * Extended Express Request with IdeaMine-specific properties
 */
export interface IdeaMineRequest extends Request {
  db: Pool;
  config: ApiConfig;
  io: SocketIOServer;
  userId?: string;  // Set by auth middleware after JWT verification
}

/**
 * Type guard to check if a request has IdeaMine properties
 */
export function isIdeaMineRequest(req: Request): req is IdeaMineRequest {
  return (
    'db' in req &&
    'config' in req &&
    'io' in req
  );
}

/**
 * Helper to safely access IdeaMine request properties
 * Throws if properties are missing (should never happen after middleware)
 */
export function getIdeaMineContext(req: Request): {
  db: Pool;
  config: ApiConfig;
  io: SocketIOServer;
  userId?: string;
} {
  if (!isIdeaMineRequest(req)) {
    throw new Error('Request missing IdeaMine context - middleware not applied');
  }

  return {
    db: req.db,
    config: req.config,
    io: req.io,
    userId: req.userId,
  };
}
