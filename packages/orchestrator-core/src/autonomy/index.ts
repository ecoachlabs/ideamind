/**
 * Autonomy Core Module
 *
 * Roadmap: M1 - Autonomy Core
 *
 * Components:
 * - Model Router: LLM routing by skill/cost/policy
 * - Determinism: Seeded execution + CAS cache
 * - Kill-Switch: Runaway detection & pause
 */

// Model Router
export {
  ModelRouterAgent,
  ModelRegistry,
  type TaskAffinity,
  type PrivacyMode,
  type ModelCapabilities,
  type ModelHealth,
  type RoutingRequest,
  type RoutingDecision,
  MODEL_USAGE_MIGRATION,
} from './model-router';

// Determinism & CAS
export {
  SeedManager,
  ContentAddressedStore,
  ReplayHashManager,
  type SeedContext,
  type CASEntry,
  type ReplayHash,
  DETERMINISM_MIGRATIONS,
} from './determinism';

// Kill-Switch
export {
  AnomalyDetector,
  type PolicyThresholds,
  type TelemetrySnapshot,
  type PauseReason,
  type RunSnapshot,
  KILL_SWITCH_MIGRATION,
} from './kill-switch';
