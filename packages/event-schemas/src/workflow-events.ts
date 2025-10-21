import { z } from 'zod';
import { BaseEventSchema, EventType, WorkflowState, BudgetSchema } from './types';

/**
 * Workflow Created Event
 * Published when a new workflow run is initiated from an idea submission
 */
export const WorkflowCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.WORKFLOW_CREATED),
  payload: z.object({
    ideaSpecId: z.string(),
    userId: z.string(),
    budget: BudgetSchema,
    initialState: z.nativeEnum(WorkflowState),
  }),
});

export type WorkflowCreatedEvent = z.infer<typeof WorkflowCreatedEventSchema>;

/**
 * Workflow State Changed Event
 * Published when workflow transitions between phases
 */
export const WorkflowStateChangedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.WORKFLOW_STATE_CHANGED),
  payload: z.object({
    fromState: z.nativeEnum(WorkflowState),
    toState: z.nativeEnum(WorkflowState),
    reason: z.string().optional(),
    artifacts: z.array(z.string()).optional(),
  }),
});

export type WorkflowStateChangedEvent = z.infer<typeof WorkflowStateChangedEventSchema>;

/**
 * Workflow Paused Event
 * Published when workflow is paused (manual intervention or gate block)
 */
export const WorkflowPausedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.WORKFLOW_PAUSED),
  payload: z.object({
    reason: z.string(),
    pausedBy: z.string(), // 'system', 'user', or 'gatekeeper'
    currentState: z.nativeEnum(WorkflowState),
    blockingGate: z.string().optional(),
  }),
});

export type WorkflowPausedEvent = z.infer<typeof WorkflowPausedEventSchema>;

/**
 * Workflow Resumed Event
 * Published when paused workflow is resumed
 */
export const WorkflowResumedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.WORKFLOW_RESUMED),
  payload: z.object({
    resumedBy: z.string(),
    currentState: z.nativeEnum(WorkflowState),
  }),
});

export type WorkflowResumedEvent = z.infer<typeof WorkflowResumedEventSchema>;

/**
 * Workflow Failed Event
 * Published when workflow encounters unrecoverable error
 */
export const WorkflowFailedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.WORKFLOW_FAILED),
  payload: z.object({
    error: z.string(),
    failedState: z.nativeEnum(WorkflowState),
    retryCount: z.number().int().nonnegative(),
    isRetryable: z.boolean(),
  }),
});

export type WorkflowFailedEvent = z.infer<typeof WorkflowFailedEventSchema>;

/**
 * Workflow Completed Event
 * Published when workflow reaches GA state successfully
 */
export const WorkflowCompletedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.WORKFLOW_COMPLETED),
  payload: z.object({
    finalState: z.nativeEnum(WorkflowState),
    totalCostUsd: z.number().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    durationMs: z.number().int().positive(),
    artifactCount: z.number().int().nonnegative(),
  }),
});

export type WorkflowCompletedEvent = z.infer<typeof WorkflowCompletedEventSchema>;

/**
 * Union type of all workflow events
 */
export type WorkflowEvent =
  | WorkflowCreatedEvent
  | WorkflowStateChangedEvent
  | WorkflowPausedEvent
  | WorkflowResumedEvent
  | WorkflowFailedEvent
  | WorkflowCompletedEvent;
