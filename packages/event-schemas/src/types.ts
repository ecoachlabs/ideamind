import { z } from 'zod';

/**
 * Workflow states mapping to the 12-phase pipeline
 */
export enum WorkflowState {
  CREATED = 'CREATED',
  INTAKE = 'INTAKE',
  IDEATION = 'IDEATION',
  CRITIQUE = 'CRITIQUE',
  PRD = 'PRD',
  BIZDEV = 'BIZDEV',
  ARCHITECTURE = 'ARCHITECTURE',
  BUILD = 'BUILD',
  SECURITY = 'SECURITY', // Phase 6a: Security & Privacy Assurance
  STORY_LOOP = 'STORY_LOOP',
  QA = 'QA',
  AESTHETIC = 'AESTHETIC',
  RELEASE = 'RELEASE',
  BETA = 'BETA',
  FEEDBACK_LOOP = 'FEEDBACK_LOOP',
  DOCS_GROWTH = 'DOCS_GROWTH',
  GA = 'GA',
  PAUSED = 'PAUSED',
  FAILED = 'FAILED',
  CLOSED = 'CLOSED',
}

/**
 * Event types for the event bus (NATS topics)
 */
export enum EventType {
  // Workflow events
  WORKFLOW_CREATED = 'workflow.created',
  WORKFLOW_STATE_CHANGED = 'workflow.state.changed',
  WORKFLOW_PAUSED = 'workflow.paused',
  WORKFLOW_RESUMED = 'workflow.resumed',
  WORKFLOW_FAILED = 'workflow.failed',
  WORKFLOW_COMPLETED = 'workflow.completed',

  // Phase events
  PHASE_STARTED = 'phase.started',
  PHASE_COMPLETED = 'phase.completed',
  PHASE_FAILED = 'phase.failed',

  // Agent events
  AGENT_STARTED = 'agent.started',
  AGENT_COMPLETED = 'agent.completed',
  AGENT_FAILED = 'agent.failed',
  AGENT_TOOL_REQUESTED = 'agent.tool.requested',

  // Tool events
  TOOL_EXECUTION_STARTED = 'tool.execution.started',
  TOOL_EXECUTION_COMPLETED = 'tool.execution.completed',
  TOOL_EXECUTION_FAILED = 'tool.execution.failed',

  // Gate events
  GATE_EVALUATION_STARTED = 'gate.evaluation.started',
  GATE_EVALUATION_COMPLETED = 'gate.evaluation.completed',
  GATE_BLOCKED = 'gate.blocked',

  // Artifact events
  ARTIFACT_CREATED = 'artifact.created',
  ARTIFACT_UPDATED = 'artifact.updated',

  // Budget events
  BUDGET_THRESHOLD_EXCEEDED = 'budget.threshold.exceeded',
  BUDGET_LIMIT_REACHED = 'budget.limit.reached',
}

/**
 * Base event schema - all events extend this
 */
export const BaseEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.nativeEnum(EventType),
  timestamp: z.string().datetime(),
  workflowRunId: z.string(),
  correlationId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

/**
 * Budget tracking
 */
export const BudgetSchema = z.object({
  maxCostUsd: z.number().positive(),
  currentCostUsd: z.number().nonnegative().default(0),
  maxTokens: z.number().int().positive(),
  currentTokens: z.number().int().nonnegative().default(0),
  maxRetries: z.number().int().positive().default(3),
});

export type Budget = z.infer<typeof BudgetSchema>;

/**
 * Cost attribution
 */
export const CostAttributionSchema = z.object({
  agentId: z.string(),
  toolId: z.string().optional(),
  costUsd: z.number().nonnegative(),
  tokensUsed: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});

export type CostAttribution = z.infer<typeof CostAttributionSchema>;
