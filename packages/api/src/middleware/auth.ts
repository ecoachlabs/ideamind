import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from './error-handler';

export interface JwtPayload {
  userId: string;
  email?: string;
  role?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        throw new UnauthorizedError('No authorization header provided');
      }

      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        throw new UnauthorizedError('Invalid authorization header format');
      }

      const token = parts[1];

      try {
        const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
        req.user = decoded;
        next();
      } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
          throw new UnauthorizedError('Token expired');
        } else if (error.name === 'JsonWebTokenError') {
          throw new UnauthorizedError('Invalid token');
        } else {
          throw error;
        }
      }
    } catch (error) {
      next(error);
    }
  };
}

export function optionalAuth(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next();
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next();
    }

    const token = parts[1];

    try {
      const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
      req.user = decoded;
    } catch (error) {
      // Ignore errors for optional auth
    }

    next();
  };
}
