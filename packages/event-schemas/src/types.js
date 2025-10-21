"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostAttributionSchema = exports.BudgetSchema = exports.BaseEventSchema = exports.EventType = exports.WorkflowState = void 0;
const zod_1 = require("zod");
/**
 * Workflow states mapping to the 12-phase pipeline
 */
var WorkflowState;
(function (WorkflowState) {
    WorkflowState["CREATED"] = "CREATED";
    WorkflowState["INTAKE"] = "INTAKE";
    WorkflowState["IDEATION"] = "IDEATION";
    WorkflowState["CRITIQUE"] = "CRITIQUE";
    WorkflowState["PRD"] = "PRD";
    WorkflowState["BIZDEV"] = "BIZDEV";
    WorkflowState["ARCHITECTURE"] = "ARCHITECTURE";
    WorkflowState["BUILD"] = "BUILD";
    WorkflowState["SECURITY"] = "SECURITY";
    WorkflowState["STORY_LOOP"] = "STORY_LOOP";
    WorkflowState["QA"] = "QA";
    WorkflowState["AESTHETIC"] = "AESTHETIC";
    WorkflowState["RELEASE"] = "RELEASE";
    WorkflowState["BETA"] = "BETA";
    WorkflowState["FEEDBACK_LOOP"] = "FEEDBACK_LOOP";
    WorkflowState["DOCS_GROWTH"] = "DOCS_GROWTH";
    WorkflowState["GA"] = "GA";
    WorkflowState["PAUSED"] = "PAUSED";
    WorkflowState["FAILED"] = "FAILED";
    WorkflowState["CLOSED"] = "CLOSED";
})(WorkflowState || (exports.WorkflowState = WorkflowState = {}));
/**
 * Event types for the event bus (NATS topics)
 */
var EventType;
(function (EventType) {
    // Workflow events
    EventType["WORKFLOW_CREATED"] = "workflow.created";
    EventType["WORKFLOW_STATE_CHANGED"] = "workflow.state.changed";
    EventType["WORKFLOW_PAUSED"] = "workflow.paused";
    EventType["WORKFLOW_RESUMED"] = "workflow.resumed";
    EventType["WORKFLOW_FAILED"] = "workflow.failed";
    EventType["WORKFLOW_COMPLETED"] = "workflow.completed";
    // Phase events
    EventType["PHASE_STARTED"] = "phase.started";
    EventType["PHASE_COMPLETED"] = "phase.completed";
    EventType["PHASE_FAILED"] = "phase.failed";
    // Agent events
    EventType["AGENT_STARTED"] = "agent.started";
    EventType["AGENT_COMPLETED"] = "agent.completed";
    EventType["AGENT_FAILED"] = "agent.failed";
    EventType["AGENT_TOOL_REQUESTED"] = "agent.tool.requested";
    // Tool events
    EventType["TOOL_EXECUTION_STARTED"] = "tool.execution.started";
    EventType["TOOL_EXECUTION_COMPLETED"] = "tool.execution.completed";
    EventType["TOOL_EXECUTION_FAILED"] = "tool.execution.failed";
    // Gate events
    EventType["GATE_EVALUATION_STARTED"] = "gate.evaluation.started";
    EventType["GATE_EVALUATION_COMPLETED"] = "gate.evaluation.completed";
    EventType["GATE_BLOCKED"] = "gate.blocked";
    // Artifact events
    EventType["ARTIFACT_CREATED"] = "artifact.created";
    EventType["ARTIFACT_UPDATED"] = "artifact.updated";
    // Budget events
    EventType["BUDGET_THRESHOLD_EXCEEDED"] = "budget.threshold.exceeded";
    EventType["BUDGET_LIMIT_REACHED"] = "budget.limit.reached";
})(EventType || (exports.EventType = EventType = {}));
/**
 * Base event schema - all events extend this
 */
exports.BaseEventSchema = zod_1.z.object({
    eventId: zod_1.z.string().uuid(),
    eventType: zod_1.z.nativeEnum(EventType),
    timestamp: zod_1.z.string().datetime(),
    workflowRunId: zod_1.z.string(),
    correlationId: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
/**
 * Budget tracking
 */
exports.BudgetSchema = zod_1.z.object({
    maxCostUsd: zod_1.z.number().positive(),
    currentCostUsd: zod_1.z.number().nonnegative().default(0),
    maxTokens: zod_1.z.number().int().positive(),
    currentTokens: zod_1.z.number().int().nonnegative().default(0),
    maxRetries: zod_1.z.number().int().positive().default(3),
});
/**
 * Cost attribution
 */
exports.CostAttributionSchema = zod_1.z.object({
    agentId: zod_1.z.string(),
    toolId: zod_1.z.string().optional(),
    costUsd: zod_1.z.number().nonnegative(),
    tokensUsed: zod_1.z.number().int().nonnegative(),
    durationMs: zod_1.z.number().int().nonnegative(),
});
//# sourceMappingURL=types.js.map