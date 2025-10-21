"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolPolicySchema = void 0;
const zod_1 = require("zod");
/**
 * Tool policy configuration
 */
exports.ToolPolicySchema = zod_1.z.object({
    allowedTools: zod_1.z.array(zod_1.z.string()).optional(), // Tool IDs or patterns
    deniedTools: zod_1.z.array(zod_1.z.string()).optional(),
    maxToolInvocations: zod_1.z.number().int().positive().default(10),
    maxToolCostUsd: zod_1.z.number().positive().default(5.0),
    requireApproval: zod_1.z.boolean().default(false),
    voiThreshold: zod_1.z.number().min(0).max(1).default(0.3), // Minimum VoI to invoke tool
});
//# sourceMappingURL=types.js.map