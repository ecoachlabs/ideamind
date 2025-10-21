/**
 * Event Schemas
 * 
 * JSON schemas and TypeScript types for phase events
 * Spec: phase.txt:35-38
 */

export * from './phase-started';
export * from './phase-progress';
export * from './phase-ready';
export * from './phase-gate-passed';
export * from './phase-gate-failed';
export * from './phase-stalled';
export * from './phase-completed';

// Re-export schemas for validation
import { PhaseStartedEventSchema } from './phase-started';
import { PhaseProgressEventSchema } from './phase-progress';
import { PhaseReadyEventSchema } from './phase-ready';
import { PhaseGatePassedEventSchema } from './phase-gate-passed';
import { PhaseGateFailedEventSchema } from './phase-gate-failed';
import { PhaseStalledEventSchema } from './phase-stalled';
import { PhaseCompletedEventSchema } from './phase-completed';

export const EventSchemas = {
  PhaseStarted: PhaseStartedEventSchema,
  PhaseProgress: PhaseProgressEventSchema,
  PhaseReady: PhaseReadyEventSchema,
  PhaseGatePassed: PhaseGatePassedEventSchema,
  PhaseGateFailed: PhaseGateFailedEventSchema,
  PhaseStalled: PhaseStalledEventSchema,
  PhaseCompleted: PhaseCompletedEventSchema,
};

// Union type for all phase events
export type PhaseEvent =
  | import('./phase-started').PhaseStartedEvent
  | import('./phase-progress').PhaseProgressEvent
  | import('./phase-ready').PhaseReadyEvent
  | import('./phase-gate-passed').PhaseGatePassedEvent
  | import('./phase-gate-failed').PhaseGateFailedEvent
  | import('./phase-stalled').PhaseStalledEvent
  | import('./phase-completed').PhaseCompletedEvent;
