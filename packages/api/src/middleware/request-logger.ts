import { Request, Response, NextFunction } from 'express';
import pino from 'pino';

const logger = pino({ name: 'api-request' });

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Log request
  logger.info(
    {
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    },
    'Incoming request'
  );

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    logger.info(
      {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
      },
      'Request completed'
    );
  });

  next();
}
