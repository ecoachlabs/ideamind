/**
 * IdeaMine Tools SDK - Structured Logger
 * Winston-based logger with consistent formatting
 */

import winston from 'winston';
import { Logger } from './types';

export function createLogger(serviceName: string): Logger {
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: serviceName },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
          })
        ),
      }),
    ],
  });

  // Add file transport in production
  if (process.env.NODE_ENV === 'production' && process.env.LOG_FILE) {
    logger.add(
      new winston.transports.File({
        filename: process.env.LOG_FILE,
        format: winston.format.json(),
      })
    );
  }

  return {
    debug: (message: string, meta?: any) => logger.debug(message, meta),
    info: (message: string, meta?: any) => logger.info(message, meta),
    warn: (message: string, meta?: any) => logger.warn(message, meta),
    error: (message: string, meta?: any) => logger.error(message, meta),
  };
}

export const defaultLogger = createLogger('tool-sdk');
