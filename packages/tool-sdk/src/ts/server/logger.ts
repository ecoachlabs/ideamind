/**
 * IdeaMine Tools SDK - Server Logger
 * Structured logger for tool servers (writes to stderr to avoid polluting stdout)
 */

import winston from 'winston';
import { ToolLogger, ToolHandlerContext } from '../types';
import { getTraceContext } from '../utils/telemetry';

// ============================================================================
// SERVER LOGGER
// ============================================================================

/**
 * Create logger for tool server
 * Writes to stderr to avoid interfering with stdin/stdout protocol
 */
export function createServerLogger(
  toolName: string,
  version: string,
  level: string = 'info'
): ToolLogger {
  const logger = winston.createLogger({
    level: level || 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'ISO' }),
      winston.format.errors({ stack: true }),
      winston.format((info) => {
        info.tool_name = toolName;
        info.tool_version = version;
        info.role = 'server';
        return info;
      })(),
      winston.format((info) => {
        const traceContext = getTraceContext();
        if (traceContext.traceId) {
          info.trace_id = traceContext.traceId;
        }
        if (traceContext.spanId) {
          info.span_id = traceContext.spanId;
        }
        return info;
      })(),
      winston.format.json()
    ),
    transports: [
      // Write to stderr to avoid polluting stdout
      new winston.transports.Stream({
        stream: process.stderr,
      }),
    ],
  });

  return {
    debug(message: string, meta?: Record<string, any>): void {
      logger.debug(message, meta);
    },

    info(message: string, meta?: Record<string, any>): void {
      logger.info(message, meta);
    },

    warn(message: string, meta?: Record<string, any>): void {
      logger.warn(message, meta);
    },

    error(message: string, meta?: Record<string, any>): void {
      logger.error(message, meta);
    },
  };
}

/**
 * Create execution-scoped logger with context
 */
export function createExecutionLogger(
  baseLogger: ToolLogger,
  context: ToolHandlerContext
): ToolLogger {
  return {
    debug(message: string, meta?: Record<string, any>): void {
      baseLogger.debug(message, {
        ...meta,
        execution_id: context.executionId,
        run_id: context.runId,
        agent_id: context.agentId,
        phase: context.phase,
      });
    },

    info(message: string, meta?: Record<string, any>): void {
      baseLogger.info(message, {
        ...meta,
        execution_id: context.executionId,
        run_id: context.runId,
        agent_id: context.agentId,
        phase: context.phase,
      });
    },

    warn(message: string, meta?: Record<string, any>): void {
      baseLogger.warn(message, {
        ...meta,
        execution_id: context.executionId,
        run_id: context.runId,
        agent_id: context.agentId,
        phase: context.phase,
      });
    },

    error(message: string, meta?: Record<string, any>): void {
      baseLogger.error(message, {
        ...meta,
        execution_id: context.executionId,
        run_id: context.runId,
        agent_id: context.agentId,
        phase: context.phase,
      });
    },
  };
}
