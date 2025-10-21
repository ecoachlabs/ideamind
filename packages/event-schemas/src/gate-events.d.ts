import { z } from 'zod';
/**
 * Gate evaluation result
 */
export declare enum GateResult {
    PASS = "PASS",
    FAIL = "FAIL",
    WARN = "WARN"
}
/**
 * Gate Evaluation Started Event
 * Published when gatekeeper begins evaluating a gate
 */
export declare const GateEvaluationStartedEventSchema: any;
export type GateEvaluationStartedEvent = z.infer<typeof GateEvaluationStartedEventSchema>;
/**
 * Gate Evaluation Completed Event
 * Published when gate evaluation finishes
 */
export declare const GateEvaluationCompletedEventSchema: any;
export type GateEvaluationCompletedEvent = z.infer<typeof GateEvaluationCompletedEventSchema>;
/**
 * Gate Blocked Event
 * Published when workflow is blocked by failed gate
 */
export declare const GateBlockedEventSchema: any;
export type GateBlockedEvent = z.infer<typeof GateBlockedEventSchema>;
/**
 * Union type of all gate events
 */
export type GateEvent = GateEvaluationStartedEvent | GateEvaluationCompletedEvent | GateBlockedEvent;
//# sourceMappingURL=gate-events.d.ts.map