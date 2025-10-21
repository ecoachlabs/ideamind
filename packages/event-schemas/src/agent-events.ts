import { z } from 'zod';
import { BaseEventSchema, EventType } from './types';

/**
 * Agent Started Event
 * Published when an agent begins execution
 */
export const AgentStartedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.AGENT_STARTED),
  payload: z.object({
    agentId: z.string(),
    agentType: z.string(), // 'IdeationAgent', 'CritiqueAgent', etc.
    phase: z.string(),
    input: z.record(z.unknown()),
  }),
});

export type AgentStartedEvent = z.infer<typeof AgentStartedEventSchema>;

/**
 * Agent Completed Event
 * Published when agent successfully completes execution
 */
export const AgentCompletedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.AGENT_COMPLETED),
  payload: z.object({
    agentId: z.string(),
    agentType: z.string(),
    phase: z.string(),
    output: z.record(z.unknown()),
    costUsd: z.number().nonnegative(),
    tokensUsed: z.number().int().nonnegative(),
    durationMs: z.number().int().positive(),
    toolsInvoked: z.array(z.string()).optional(),
  }),
});

export type AgentCompletedEvent = z.infer<typeof AgentCompletedEventSchema>;

/**
 * Agent Failed Event
 * Published when agent encounters an error
 */
export const AgentFailedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.AGENT_FAILED),
  payload: z.object({
    agentId: z.string(),
    agentType: z.string(),
    phase: z.string(),
    error: z.string(),
    retryCount: z.number().int().nonnegative(),
    isRetryable: z.boolean(),
  }),
});

export type AgentFailedEvent = z.infer<typeof AgentFailedEventSchema>;

/**
 * Agent Tool Requested Event
 * Published when agent decides to invoke a tool (Analyzer decision)
 */
export const AgentToolRequestedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.AGENT_TOOL_REQUESTED),
  payload: z.object({
    agentId: z.string(),
    toolId: z.string(),
    toolVersion: z.string(),
    voiScore: z.number().min(0).max(1), // Value-of-Information score
    input: z.record(z.unknown()),
    estimatedCostUsd: z.number().nonnegative().optional(),
  }),
});

export type AgentToolRequestedEvent = z.infer<typeof AgentToolRequestedEventSchema>;

/**
 * Union type of all agent events
 */
export type AgentEvent =
  | AgentStartedEvent
  | AgentCompletedEvent
  | AgentFailedEvent
  | AgentToolRequestedEvent;
