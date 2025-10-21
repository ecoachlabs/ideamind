"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolExecutionFailedEventSchema = exports.ToolExecutionCompletedEventSchema = exports.ToolExecutionStartedEventSchema = void 0;
const zod_1 = require("zod");
const types_1 = require("./types");
/**
 * Tool Execution Started Event
 * Published when executor begins running a tool
 */
exports.ToolExecutionStartedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.TOOL_EXECUTION_STARTED),
    payload: zod_1.z.object({
        toolId: zod_1.z.string(),
        toolVersion: zod_1.z.string(),
        agentId: zod_1.z.string(),
        executionId: zod_1.z.string().uuid(),
        runtime: zod_1.z.enum(['docker', 'wasm', 'native']),
        input: zod_1.z.record(zod_1.z.unknown()),
    }),
});
/**
 * Tool Execution Completed Event
 * Published when tool execution finishes successfully
 */
exports.ToolExecutionCompletedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.TOOL_EXECUTION_COMPLETED),
    payload: zod_1.z.object({
        toolId: zod_1.z.string(),
        executionId: zod_1.z.string().uuid(),
        agentId: zod_1.z.string(),
        output: zod_1.z.record(zod_1.z.unknown()),
        costUsd: zod_1.z.number().nonnegative(),
        durationMs: zod_1.z.number().int().positive(),
        exitCode: zod_1.z.number().int(),
        improvedQuality: zod_1.z.boolean().optional(), // Result from Verifier
    }),
});
/**
 * Tool Execution Failed Event
 * Published when tool execution fails
 */
exports.ToolExecutionFailedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.TOOL_EXECUTION_FAILED),
    payload: zod_1.z.object({
        toolId: zod_1.z.string(),
        executionId: zod_1.z.string().uuid(),
        agentId: zod_1.z.string(),
        error: zod_1.z.string(),
        exitCode: zod_1.z.number().int().optional(),
        stderr: zod_1.z.string().optional(),
        isRetryable: zod_1.z.boolean(),
    }),
});
//# sourceMappingURL=tool-events.js.map