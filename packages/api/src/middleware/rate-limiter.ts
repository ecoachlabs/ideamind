import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

export function rateLimiter(options: RateLimiterOptions) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.maxRequests,
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for health checks
    skip: (req: Request) => req.path === '/health',
  });
}
