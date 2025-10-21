"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowCompletedEventSchema = exports.WorkflowFailedEventSchema = exports.WorkflowResumedEventSchema = exports.WorkflowPausedEventSchema = exports.WorkflowStateChangedEventSchema = exports.WorkflowCreatedEventSchema = void 0;
const zod_1 = require("zod");
const types_1 = require("./types");
/**
 * Workflow Created Event
 * Published when a new workflow run is initiated from an idea submission
 */
exports.WorkflowCreatedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.WORKFLOW_CREATED),
    payload: zod_1.z.object({
        ideaSpecId: zod_1.z.string(),
        userId: zod_1.z.string(),
        budget: types_1.BudgetSchema,
        initialState: zod_1.z.nativeEnum(types_1.WorkflowState),
    }),
});
/**
 * Workflow State Changed Event
 * Published when workflow transitions between phases
 */
exports.WorkflowStateChangedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.WORKFLOW_STATE_CHANGED),
    payload: zod_1.z.object({
        fromState: zod_1.z.nativeEnum(types_1.WorkflowState),
        toState: zod_1.z.nativeEnum(types_1.WorkflowState),
        reason: zod_1.z.string().optional(),
        artifacts: zod_1.z.array(zod_1.z.string()).optional(),
    }),
});
/**
 * Workflow Paused Event
 * Published when workflow is paused (manual intervention or gate block)
 */
exports.WorkflowPausedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.WORKFLOW_PAUSED),
    payload: zod_1.z.object({
        reason: zod_1.z.string(),
        pausedBy: zod_1.z.string(), // 'system', 'user', or 'gatekeeper'
        currentState: zod_1.z.nativeEnum(types_1.WorkflowState),
        blockingGate: zod_1.z.string().optional(),
    }),
});
/**
 * Workflow Resumed Event
 * Published when paused workflow is resumed
 */
exports.WorkflowResumedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.WORKFLOW_RESUMED),
    payload: zod_1.z.object({
        resumedBy: zod_1.z.string(),
        currentState: zod_1.z.nativeEnum(types_1.WorkflowState),
    }),
});
/**
 * Workflow Failed Event
 * Published when workflow encounters unrecoverable error
 */
exports.WorkflowFailedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.WORKFLOW_FAILED),
    payload: zod_1.z.object({
        error: zod_1.z.string(),
        failedState: zod_1.z.nativeEnum(types_1.WorkflowState),
        retryCount: zod_1.z.number().int().nonnegative(),
        isRetryable: zod_1.z.boolean(),
    }),
});
/**
 * Workflow Completed Event
 * Published when workflow reaches GA state successfully
 */
exports.WorkflowCompletedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.WORKFLOW_COMPLETED),
    payload: zod_1.z.object({
        finalState: zod_1.z.nativeEnum(types_1.WorkflowState),
        totalCostUsd: zod_1.z.number().nonnegative(),
        totalTokens: zod_1.z.number().int().nonnegative(),
        durationMs: zod_1.z.number().int().positive(),
        artifactCount: zod_1.z.number().int().nonnegative(),
    }),
});
//# sourceMappingURL=workflow-events.js.map