import { z } from 'zod';
/**
 * Workflow states mapping to the 12-phase pipeline
 */
export declare enum WorkflowState {
    CREATED = "CREATED",
    INTAKE = "INTAKE",
    IDEATION = "IDEATION",
    CRITIQUE = "CRITIQUE",
    PRD = "PRD",
    BIZDEV = "BIZDEV",
    ARCHITECTURE = "ARCHITECTURE",
    BUILD = "BUILD",
    SECURITY = "SECURITY",// Phase 6a: Security & Privacy Assurance
    STORY_LOOP = "STORY_LOOP",
    QA = "QA",
    AESTHETIC = "AESTHETIC",
    RELEASE = "RELEASE",
    BETA = "BETA",
    FEEDBACK_LOOP = "FEEDBACK_LOOP",
    DOCS_GROWTH = "DOCS_GROWTH",
    GA = "GA",
    PAUSED = "PAUSED",
    FAILED = "FAILED",
    CLOSED = "CLOSED"
}
/**
 * Event types for the event bus (NATS topics)
 */
export declare enum EventType {
    WORKFLOW_CREATED = "workflow.created",
    WORKFLOW_STATE_CHANGED = "workflow.state.changed",
    WORKFLOW_PAUSED = "workflow.paused",
    WORKFLOW_RESUMED = "workflow.resumed",
    WORKFLOW_FAILED = "workflow.failed",
    WORKFLOW_COMPLETED = "workflow.completed",
    PHASE_STARTED = "phase.started",
    PHASE_COMPLETED = "phase.completed",
    PHASE_FAILED = "phase.failed",
    AGENT_STARTED = "agent.started",
    AGENT_COMPLETED = "agent.completed",
    AGENT_FAILED = "agent.failed",
    AGENT_TOOL_REQUESTED = "agent.tool.requested",
    TOOL_EXECUTION_STARTED = "tool.execution.started",
    TOOL_EXECUTION_COMPLETED = "tool.execution.completed",
    TOOL_EXECUTION_FAILED = "tool.execution.failed",
    GATE_EVALUATION_STARTED = "gate.evaluation.started",
    GATE_EVALUATION_COMPLETED = "gate.evaluation.completed",
    GATE_BLOCKED = "gate.blocked",
    ARTIFACT_CREATED = "artifact.created",
    ARTIFACT_UPDATED = "artifact.updated",
    BUDGET_THRESHOLD_EXCEEDED = "budget.threshold.exceeded",
    BUDGET_LIMIT_REACHED = "budget.limit.reached"
}
/**
 * Base event schema - all events extend this
 */
export declare const BaseEventSchema: any;
export type BaseEvent = z.infer<typeof BaseEventSchema>;
/**
 * Budget tracking
 */
export declare const BudgetSchema: any;
export type Budget = z.infer<typeof BudgetSchema>;
/**
 * Cost attribution
 */
export declare const CostAttributionSchema: any;
export type CostAttribution = z.infer<typeof CostAttributionSchema>;
//# sourceMappingURL=types.d.ts.map