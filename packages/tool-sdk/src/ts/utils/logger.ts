/**
 * IdeaMine Tools SDK - Structured Logger
 * Winston-based logger with OTEL integration
 */

import winston from 'winston';
import { ToolLogger } from '../types';
import { getTraceContext } from './telemetry';

// ============================================================================
// LOGGER CONFIGURATION
// ============================================================================

export interface LoggerConfig {
  level?: 'debug' | 'info' | 'warn' | 'error';
  service?: string;
  format?: 'json' | 'pretty';
  silent?: boolean;
}

// ============================================================================
// WINSTON LOGGER
// ============================================================================

/**
 * Create a Winston logger instance with structured logging
 */
export function createLogger(config: LoggerConfig = {}): winston.Logger {
  const {
    level = 'info',
    service = 'ideamine-tools',
    format = 'json',
    silent = false,
  } = config;

  const formats: winston.Logform.Format[] = [
    winston.format.timestamp({ format: 'ISO' }),
    winston.format.errors({ stack: true }),
  ];

  // Add service name
  formats.push(
    winston.format((info) => {
      info.service = service;
      return info;
    })()
  );

  // Add trace context if available
  formats.push(
    winston.format((info) => {
      const traceContext = getTraceContext();
      if (traceContext.traceId) {
        info.trace_id = traceContext.traceId;
      }
      if (traceContext.spanId) {
        info.span_id = traceContext.spanId;
      }
      return info;
    })()
  );

  // Output format
  if (format === 'pretty') {
    formats.push(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
      })
    );
  } else {
    formats.push(winston.format.json());
  }

  return winston.createLogger({
    level,
    silent,
    format: winston.format.combine(...formats),
    transports: [new winston.transports.Console()],
  });
}

// ============================================================================
// TOOL LOGGER ADAPTER
// ============================================================================

/**
 * Adapter to convert Winston logger to ToolLogger interface
 */
export class WinstonToolLogger implements ToolLogger {
  constructor(private logger: winston.Logger) {}

  debug(message: string, meta?: Record<string, any>): void {
    this.logger.debug(message, meta);
  }

  info(message: string, meta?: Record<string, any>): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.logger.warn(message, meta);
  }

  error(message: string, meta?: Record<string, any>): void {
    this.logger.error(message, meta);
  }

  /**
   * Create child logger with additional context
   */
  child(context: Record<string, any>): WinstonToolLogger {
    return new WinstonToolLogger(this.logger.child(context));
  }
}

// ============================================================================
// NO-OP LOGGER
// ============================================================================

/**
 * No-op logger for testing or when logging is disabled
 */
export class NoOpLogger implements ToolLogger {
  debug(_message: string, _meta?: Record<string, any>): void {}
  info(_message: string, _meta?: Record<string, any>): void {}
  warn(_message: string, _meta?: Record<string, any>): void {}
  error(_message: string, _meta?: Record<string, any>): void {}
}

// ============================================================================
// DEFAULT LOGGER
// ============================================================================

/**
 * Default logger instance
 */
export const defaultLogger = new WinstonToolLogger(
  createLogger({
    level: process.env.LOG_LEVEL as any || 'info',
    service: 'ideamine-tools',
    format: process.env.LOG_FORMAT === 'pretty' ? 'pretty' : 'json',
  })
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create execution logger with context
 */
export function createExecutionLogger(
  executionId: string,
  toolId: string,
  version: string,
  config?: LoggerConfig
): ToolLogger {
  const winston = createLogger(config);
  const logger = new WinstonToolLogger(winston);

  return logger.child({
    execution_id: executionId,
    tool_id: toolId,
    tool_version: version,
  });
}

/**
 * Create server logger
 */
export function createServerLogger(
  toolName: string,
  version: string,
  config?: LoggerConfig
): ToolLogger {
  const winston = createLogger(config);
  const logger = new WinstonToolLogger(winston);

  return logger.child({
    tool_name: toolName,
    tool_version: version,
    role: 'server',
  });
}

/**
 * Create client logger
 */
export function createClientLogger(config?: LoggerConfig): ToolLogger {
  const winston = createLogger(config);
  return new WinstonToolLogger(winston).child({
    role: 'client',
  });
}

/**
 * Sanitize sensitive data from logs
 */
export function sanitizeLogData(data: Record<string, any>): Record<string, any> {
  const sanitized = { ...data };
  const sensitiveKeys = [
    'password',
    'secret',
    'token',
    'api_key',
    'apiKey',
    'auth',
    'authorization',
    'credentials',
  ];

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
      sanitized[key] = '***REDACTED***';
    }
  }

  return sanitized;
}
