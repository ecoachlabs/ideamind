import { z } from 'zod';
import { BaseEventSchema, EventType } from './types';

/**
 * Tool Execution Started Event
 * Published when executor begins running a tool
 */
export const ToolExecutionStartedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.TOOL_EXECUTION_STARTED),
  payload: z.object({
    toolId: z.string(),
    toolVersion: z.string(),
    agentId: z.string(),
    executionId: z.string().uuid(),
    runtime: z.enum(['docker', 'wasm', 'native']),
    input: z.record(z.unknown()),
  }),
});

export type ToolExecutionStartedEvent = z.infer<typeof ToolExecutionStartedEventSchema>;

/**
 * Tool Execution Completed Event
 * Published when tool execution finishes successfully
 */
export const ToolExecutionCompletedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.TOOL_EXECUTION_COMPLETED),
  payload: z.object({
    toolId: z.string(),
    executionId: z.string().uuid(),
    agentId: z.string(),
    output: z.record(z.unknown()),
    costUsd: z.number().nonnegative(),
    durationMs: z.number().int().positive(),
    exitCode: z.number().int(),
    improvedQuality: z.boolean().optional(), // Result from Verifier
  }),
});

export type ToolExecutionCompletedEvent = z.infer<typeof ToolExecutionCompletedEventSchema>;

/**
 * Tool Execution Failed Event
 * Published when tool execution fails
 */
export const ToolExecutionFailedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.TOOL_EXECUTION_FAILED),
  payload: z.object({
    toolId: z.string(),
    executionId: z.string().uuid(),
    agentId: z.string(),
    error: z.string(),
    exitCode: z.number().int().optional(),
    stderr: z.string().optional(),
    isRetryable: z.boolean(),
  }),
});

export type ToolExecutionFailedEvent = z.infer<typeof ToolExecutionFailedEventSchema>;

/**
 * Union type of all tool events
 */
export type ToolEvent =
  | ToolExecutionStartedEvent
  | ToolExecutionCompletedEvent
  | ToolExecutionFailedEvent;
