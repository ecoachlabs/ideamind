"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentToolRequestedEventSchema = exports.AgentFailedEventSchema = exports.AgentCompletedEventSchema = exports.AgentStartedEventSchema = void 0;
const zod_1 = require("zod");
const types_1 = require("./types");
/**
 * Agent Started Event
 * Published when an agent begins execution
 */
exports.AgentStartedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.AGENT_STARTED),
    payload: zod_1.z.object({
        agentId: zod_1.z.string(),
        agentType: zod_1.z.string(), // 'IdeationAgent', 'CritiqueAgent', etc.
        phase: zod_1.z.string(),
        input: zod_1.z.record(zod_1.z.unknown()),
    }),
});
/**
 * Agent Completed Event
 * Published when agent successfully completes execution
 */
exports.AgentCompletedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.AGENT_COMPLETED),
    payload: zod_1.z.object({
        agentId: zod_1.z.string(),
        agentType: zod_1.z.string(),
        phase: zod_1.z.string(),
        output: zod_1.z.record(zod_1.z.unknown()),
        costUsd: zod_1.z.number().nonnegative(),
        tokensUsed: zod_1.z.number().int().nonnegative(),
        durationMs: zod_1.z.number().int().positive(),
        toolsInvoked: zod_1.z.array(zod_1.z.string()).optional(),
    }),
});
/**
 * Agent Failed Event
 * Published when agent encounters an error
 */
exports.AgentFailedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.AGENT_FAILED),
    payload: zod_1.z.object({
        agentId: zod_1.z.string(),
        agentType: zod_1.z.string(),
        phase: zod_1.z.string(),
        error: zod_1.z.string(),
        retryCount: zod_1.z.number().int().nonnegative(),
        isRetryable: zod_1.z.boolean(),
    }),
});
/**
 * Agent Tool Requested Event
 * Published when agent decides to invoke a tool (Analyzer decision)
 */
exports.AgentToolRequestedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.AGENT_TOOL_REQUESTED),
    payload: zod_1.z.object({
        agentId: zod_1.z.string(),
        toolId: zod_1.z.string(),
        toolVersion: zod_1.z.string(),
        voiScore: zod_1.z.number().min(0).max(1), // Value-of-Information score
        input: zod_1.z.record(zod_1.z.unknown()),
        estimatedCostUsd: zod_1.z.number().nonnegative().optional(),
    }),
});
//# sourceMappingURL=agent-events.js.map