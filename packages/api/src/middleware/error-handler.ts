import { Request, Response, NextFunction } from 'express';
import pino from 'pino';

const logger = pino({ name: 'error-handler' });

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export class BadRequestError extends Error implements ApiError {
  statusCode = 400;
  code = 'BAD_REQUEST';
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends Error implements ApiError {
  statusCode = 401;
  code = 'UNAUTHORIZED';
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error implements ApiError {
  statusCode = 403;
  code = 'FORBIDDEN';
  constructor(message: string = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error implements ApiError {
  statusCode = 404;
  code = 'NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error implements ApiError {
  statusCode = 409;
  code = 'CONFLICT';
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class InternalServerError extends Error implements ApiError {
  statusCode = 500;
  code = 'INTERNAL_SERVER_ERROR';
  constructor(message: string = 'Internal server error', public details?: any) {
    super(message);
    this.name = 'InternalServerError';
  }
}

export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  // Log error
  logger.error(
    {
      error: err.message,
      stack: err.stack,
      statusCode,
      code,
      path: req.path,
      method: req.method,
      details: err.details,
    },
    'Request error'
  );

  // Send error response
  res.status(statusCode).json({
    error: {
      code,
      message: err.message,
      ...(err.details && { details: err.details }),
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
}
