"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolInvocationResponseSchema = exports.ToolInvocationRequestSchema = exports.ToolMetadataSchema = exports.ToolCategory = exports.ToolApprovalStatus = exports.ToolRuntime = void 0;
const zod_1 = require("zod");
/**
 * Tool runtime environment
 */
var ToolRuntime;
(function (ToolRuntime) {
    ToolRuntime["DOCKER"] = "docker";
    ToolRuntime["WASM"] = "wasm";
    ToolRuntime["NATIVE"] = "native";
})(ToolRuntime || (exports.ToolRuntime = ToolRuntime = {}));
/**
 * Tool approval status
 */
var ToolApprovalStatus;
(function (ToolApprovalStatus) {
    ToolApprovalStatus["PENDING"] = "pending";
    ToolApprovalStatus["APPROVED"] = "approved";
    ToolApprovalStatus["REJECTED"] = "rejected";
    ToolApprovalStatus["DEPRECATED"] = "deprecated";
})(ToolApprovalStatus || (exports.ToolApprovalStatus = ToolApprovalStatus = {}));
/**
 * Tool category (aligned with readme.txt catalog)
 */
var ToolCategory;
(function (ToolCategory) {
    ToolCategory["SHARED_PLATFORM"] = "shared-platform";
    ToolCategory["INTAKE"] = "intake";
    ToolCategory["IDEATION"] = "ideation";
    ToolCategory["CRITIQUE"] = "critique";
    ToolCategory["PRD"] = "prd";
    ToolCategory["BIZDEV"] = "bizdev";
    ToolCategory["ARCHITECTURE"] = "architecture";
    ToolCategory["BUILD_SETUP"] = "build-setup";
    ToolCategory["CODING"] = "coding";
    ToolCategory["QA"] = "qa";
    ToolCategory["RELEASE"] = "release";
    ToolCategory["BETA"] = "beta";
    ToolCategory["FEEDBACK"] = "feedback";
    ToolCategory["AESTHETIC"] = "aesthetic";
    ToolCategory["SECURITY"] = "security";
    ToolCategory["GROWTH"] = "growth";
    ToolCategory["OBSERVABILITY"] = "observability";
})(ToolCategory || (exports.ToolCategory = ToolCategory = {}));
/**
 * Tool metadata schema
 */
exports.ToolMetadataSchema = zod_1.z.object({
    id: zod_1.z.string(),
    version: zod_1.z.string(),
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    category: zod_1.z.nativeEnum(ToolCategory),
    runtime: zod_1.z.nativeEnum(ToolRuntime),
    // Docker runtime configuration
    dockerImage: zod_1.z.string().optional(),
    // Resource limits
    maxMemoryMb: zod_1.z.number().int().positive().default(512),
    maxCpuCores: zod_1.z.number().positive().default(1),
    timeoutSeconds: zod_1.z.number().int().positive().default(300),
    // Network configuration
    networkEgress: zod_1.z.enum(['none', 'restricted', 'full']).default('none'),
    allowedDomains: zod_1.z.array(zod_1.z.string()).optional(),
    // Cost estimation
    estimatedCostUsd: zod_1.z.number().nonnegative().optional(),
    billingModel: zod_1.z.enum(['per-invocation', 'per-second', 'per-mb']).optional(),
    // Input/output schemas (Zod schemas serialized as JSON Schema)
    inputSchema: zod_1.z.record(zod_1.z.unknown()),
    outputSchema: zod_1.z.record(zod_1.z.unknown()),
    // Approval workflow
    approvalStatus: zod_1.z.nativeEnum(ToolApprovalStatus).default(ToolApprovalStatus.PENDING),
    approvedBy: zod_1.z.string().optional(),
    approvedAt: zod_1.z.string().datetime().optional(),
    // Metadata
    author: zod_1.z.string(),
    createdAt: zod_1.z.string().datetime(),
    updatedAt: zod_1.z.string().datetime(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
});
/**
 * Tool invocation request
 */
exports.ToolInvocationRequestSchema = zod_1.z.object({
    toolId: zod_1.z.string(),
    version: zod_1.z.string().default('latest'),
    input: zod_1.z.record(zod_1.z.unknown()),
    timeout: zod_1.z.number().int().positive().optional(),
    context: zod_1.z.object({
        workflowRunId: zod_1.z.string(),
        agentId: zod_1.z.string(),
    }),
});
/**
 * Tool invocation response
 */
exports.ToolInvocationResponseSchema = zod_1.z.object({
    success: zod_1.z.boolean(),
    output: zod_1.z.record(zod_1.z.unknown()),
    costUsd: zod_1.z.number().nonnegative(),
    durationMs: zod_1.z.number().int().nonnegative(),
    exitCode: zod_1.z.number().int().optional(),
    error: zod_1.z.string().optional(),
    logs: zod_1.z.string().optional(),
});
//# sourceMappingURL=tool-metadata.js.map