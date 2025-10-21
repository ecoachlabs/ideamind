import { z } from 'zod';
import { BaseEventSchema, EventType } from './types';

/**
 * Gate evaluation result
 */
export enum GateResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  WARN = 'WARN',
}

/**
 * Gate Evaluation Started Event
 * Published when gatekeeper begins evaluating a gate
 */
export const GateEvaluationStartedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.GATE_EVALUATION_STARTED),
  payload: z.object({
    gateId: z.string(),
    gateName: z.string(),
    phase: z.string(),
    artifacts: z.array(z.string()),
  }),
});

export type GateEvaluationStartedEvent = z.infer<typeof GateEvaluationStartedEventSchema>;

/**
 * Gate Evaluation Completed Event
 * Published when gate evaluation finishes
 */
export const GateEvaluationCompletedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.GATE_EVALUATION_COMPLETED),
  payload: z.object({
    gateId: z.string(),
    gateName: z.string(),
    phase: z.string(),
    result: z.nativeEnum(GateResult),
    score: z.number().min(0).max(100).optional(),
    evidence: z.array(z.object({
      criterion: z.string(),
      passed: z.boolean(),
      score: z.number().min(0).max(100).optional(),
      details: z.string().optional(),
    })),
    humanReviewRequired: z.boolean(),
  }),
});

export type GateEvaluationCompletedEvent = z.infer<typeof GateEvaluationCompletedEventSchema>;

/**
 * Gate Blocked Event
 * Published when workflow is blocked by failed gate
 */
export const GateBlockedEventSchema = BaseEventSchema.extend({
  eventType: z.literal(EventType.GATE_BLOCKED),
  payload: z.object({
    gateId: z.string(),
    gateName: z.string(),
    phase: z.string(),
    failureReasons: z.array(z.string()),
    requiredActions: z.array(z.string()),
    humanReviewRequired: z.boolean(),
  }),
});

export type GateBlockedEvent = z.infer<typeof GateBlockedEventSchema>;

/**
 * Union type of all gate events
 */
export type GateEvent =
  | GateEvaluationStartedEvent
  | GateEvaluationCompletedEvent
  | GateBlockedEvent;
