/**
 * Structured Logging Utility
 * MEDIUM PRIORITY FIX #20: Replace console.log with structured logging
 *
 * Features:
 * - JSON structured output for log aggregation
 * - Log levels (debug, info, warn, error)
 * - Automatic PII redaction
 * - Performance-optimized (async writes)
 * - Request correlation IDs
 */

import { SECURITY } from '../config/constants';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogContext {
  [key: string]: any;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  correlationId?: string;
}

class Logger {
  private minLevel: LogLevel;
  private redactPII: boolean;

  constructor() {
    this.minLevel = this.parseLogLevel(process.env.LOG_LEVEL || 'info');
    this.redactPII = process.env.NODE_ENV === 'production';
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      message: this.sanitize(message),
      context: context ? this.sanitizeContext(context) : undefined,
    };

    if (error instanceof Error) {
      entry.error = {
        name: error.name,
        message: this.sanitize(error.message),
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      };
    } else if (error) {
      entry.error = {
        name: 'Unknown',
        message: String(error),
      };
    }

    this.write(entry);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: this.sanitize(message),
      context: context ? this.sanitizeContext(context) : undefined,
      correlationId: context?.correlationId,
    };

    this.write(entry);
  }

  /**
   * Write log entry to output
   */
  private write(entry: LogEntry): void {
    const output = JSON.stringify(entry);

    // Write to appropriate stream
    if (entry.level === LogLevel.ERROR) {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }

  /**
   * Check if log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentIndex = levels.indexOf(this.minLevel);
    const logIndex = levels.indexOf(level);
    return logIndex >= currentIndex;
  }

  /**
   * Parse log level from string
   */
  private parseLogLevel(level: string): LogLevel {
    const normalized = level.toLowerCase();
    switch (normalized) {
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
        return LogLevel.INFO;
      case 'warn':
      case 'warning':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * Sanitize message to remove PII
   */
  private sanitize(text: string): string {
    if (!this.redactPII) return text;

    let sanitized = text;

    // Apply PII redaction patterns
    for (const pattern of SECURITY.PII_REDACTION_PATTERNS) {
      if (pattern === SECURITY.PII_REDACTION_PATTERNS[0]) {
        sanitized = sanitized.replace(pattern, '[EMAIL_REDACTED]');
      } else if (pattern === SECURITY.PII_REDACTION_PATTERNS[1]) {
        sanitized = sanitized.replace(pattern, '[SSN_REDACTED]');
      } else if (pattern === SECURITY.PII_REDACTION_PATTERNS[2]) {
        sanitized = sanitized.replace(pattern, '[CARD_REDACTED]');
      }
    }

    // Limit length
    if (sanitized.length > SECURITY.MAX_LOG_LENGTH) {
      sanitized = sanitized.substring(0, SECURITY.MAX_LOG_LENGTH) + '...[truncated]';
    }

    return sanitized;
  }

  /**
   * Sanitize context object
   */
  private sanitizeContext(context: LogContext): LogContext {
    const sanitized: LogContext = {};

    for (const [key, value] of Object.entries(context)) {
      // Skip sensitive keys
      if (this.isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Sanitize string values
      if (typeof value === 'string') {
        sanitized[key] = this.sanitize(value);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeContext(value as LogContext);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Check if key is sensitive
   */
  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password',
      'apiKey',
      'api_key',
      'token',
      'secret',
      'credential',
      'auth',
      'authorization',
    ];

    const normalized = key.toLowerCase();
    return sensitiveKeys.some(k => normalized.includes(k));
  }
}

// Export singleton instance
export const logger = new Logger();

// Export type for convenience
export type { LogContext };
