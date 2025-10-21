"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GateBlockedEventSchema = exports.GateEvaluationCompletedEventSchema = exports.GateEvaluationStartedEventSchema = exports.GateResult = void 0;
const zod_1 = require("zod");
const types_1 = require("./types");
/**
 * Gate evaluation result
 */
var GateResult;
(function (GateResult) {
    GateResult["PASS"] = "PASS";
    GateResult["FAIL"] = "FAIL";
    GateResult["WARN"] = "WARN";
})(GateResult || (exports.GateResult = GateResult = {}));
/**
 * Gate Evaluation Started Event
 * Published when gatekeeper begins evaluating a gate
 */
exports.GateEvaluationStartedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.GATE_EVALUATION_STARTED),
    payload: zod_1.z.object({
        gateId: zod_1.z.string(),
        gateName: zod_1.z.string(),
        phase: zod_1.z.string(),
        artifacts: zod_1.z.array(zod_1.z.string()),
    }),
});
/**
 * Gate Evaluation Completed Event
 * Published when gate evaluation finishes
 */
exports.GateEvaluationCompletedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.GATE_EVALUATION_COMPLETED),
    payload: zod_1.z.object({
        gateId: zod_1.z.string(),
        gateName: zod_1.z.string(),
        phase: zod_1.z.string(),
        result: zod_1.z.nativeEnum(GateResult),
        score: zod_1.z.number().min(0).max(100).optional(),
        evidence: zod_1.z.array(zod_1.z.object({
            criterion: zod_1.z.string(),
            passed: zod_1.z.boolean(),
            score: zod_1.z.number().min(0).max(100).optional(),
            details: zod_1.z.string().optional(),
        })),
        humanReviewRequired: zod_1.z.boolean(),
    }),
});
/**
 * Gate Blocked Event
 * Published when workflow is blocked by failed gate
 */
exports.GateBlockedEventSchema = types_1.BaseEventSchema.extend({
    eventType: zod_1.z.literal(types_1.EventType.GATE_BLOCKED),
    payload: zod_1.z.object({
        gateId: zod_1.z.string(),
        gateName: zod_1.z.string(),
        phase: zod_1.z.string(),
        failureReasons: zod_1.z.array(zod_1.z.string()),
        requiredActions: zod_1.z.array(zod_1.z.string()),
        humanReviewRequired: zod_1.z.boolean(),
    }),
});
//# sourceMappingURL=gate-events.js.map