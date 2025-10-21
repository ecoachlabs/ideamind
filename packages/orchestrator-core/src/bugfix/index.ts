/**
 * Bug-Fix System - Main Exports
 *
 * Spec: IdeaMine Autonomous Bug-Fix System Spec v1.0
 *
 * Autonomous bug detection, reproduction, fixing, and verification system.
 */

// Coordinator
export { BugFixCoordinator } from './bugfix-coordinator';

// Agents
export {
  BugFixAgent,
  BugIntakeAgent,
  ReproSynthAgent,
  FlakeDetectorAgent,
  BisectionAgent,
  LogMinerAgent,
  RCAAgent,
  FixSynthAgent,
  TestAuthorAgent,
  VerifierAgent,
  CanaryRollerAgent,
  DocUpdaterAgent,
  BugFixAgentRegistry,
  type AgentContext,
  type BugIntakeInput,
  type BugIntakeOutput,
  type ReproSynthInput,
  type ReproSynthOutput,
  type FlakeDetectInput,
  type FlakeDetectOutput,
  type BisectionInput,
  type BisectionOutput,
  type LogMinerInput,
  type LogMinerOutput,
  type RCAInput,
  type RCAOutput,
  type FixSynthInput,
  type FixSynthOutput,
  type TestAuthorInput,
  type TestAuthorOutput,
  type VerifierInput,
  type VerifierOutput,
  type CanaryRollerInput,
  type CanaryRollerOutput,
  type DocUpdaterInput,
  type DocUpdaterOutput,
} from './agents';

// Tools
export {
  BugIntakeTool,
  ReproSynthTool,
  FlakeDetectTool,
  BisectTool,
  LogMinerTool,
  RCATool,
  FixSynthTool,
  TestAuthorTool,
  VerifyTool,
  CanaryTool,
  BugFixToolRegistry,
} from './tools';

// Guards
export {
  TestDeterminismGuard,
  MutationScoreGuard,
  PerfBudgetGuard,
  SecurityDeltaGuard,
  CoverageDeltaGuard,
  BugFixGuardRegistry,
  type GuardResult,
  type PerfBudgets,
} from './guards';

// Fix Acceptance Gate
export {
  FixAcceptanceGate,
  type FixAcceptanceContext,
  type GateResult,
  type CheckResult,
} from './fix-acceptance-gate';

// Events
export {
  BugEventStore,
  BugEventFactory,
  type BugEvent,
  type BugEventEmitter,
  type BaseBugEvent,
  type BugFoundEvent,
  type BugTriagedEvent,
  type BugReproducedEvent,
  type BugFlakeDetectedEvent,
  type BugBisectionCompleteEvent,
  type BugRCAReadyEvent,
  type BugPatchProposedEvent,
  type BugTestsAuthoredEvent,
  type BugVerifiedEvent,
  type BugGatePassedEvent,
  type BugGateFailedEvent,
  type BugCanaryStartedEvent,
  type BugCanaryRampingEvent,
  type BugCanaryCompleteEvent,
  type BugCanaryRolledBackEvent,
  type BugDocsUpdatedEvent,
  type BugFixedEvent,
  type BugRegressedEvent,
  type BugNeedsSignalEvent,
} from './events';
