/**
 * Memory Vault - Central Knowledge Management System
 *
 * Unified memory system that stores, organizes, and distributes knowledge
 * across all runs and phases, making every doer smarter after every run
 */

// Core Types
export {
  // Scopes & Lifetimes
  MemoryScope,
  TTLConfig,
  DEFAULT_TTL_CONFIG,
  // Knowledge Frame
  Provenance,
  KnowledgeFrame,
  // QA Binding
  QABinding,
  // Signal
  Signal,
  // Context Pack
  ContextPack,
  // Query & Filters
  MemoryQuery,
  MemorySuggestRequest,
  // Ingest Requests
  IngestFrameRequest,
  IngestQABindingRequest,
  IngestArtifactRequest,
  IngestSignalRequest,
  // Subscription & Distribution
  MemoryTopic,
  MemorySubscription,
  MemoryDelta,
  // Admin Operations
  UpdateTTLRequest,
  PinRequest,
  ForgetRequest,
  // Refinery
  RefineryResult,
  ConflictReport,
  // Guards
  GroundingCheckResult,
  ContradictionCheckResult,
} from './types';

// Knowledge Frame Management
export { KnowledgeFrameManager } from './knowledge-frame';

// QA Binding Management
export { QABindingManager } from './qa-binding';

// Knowledge Refinery (Fission/Fusion)
export { KnowledgeRefinery } from './refinery';

// Context Pack Builder
export { ContextPackBuilder, ContextBuildOptions } from './context-pack-builder';

// Memory Broker (Pub/Sub)
export { MemoryBroker } from './memory-broker';

// Memory Gate
export { MemoryGate, MemoryGateConfig, MemoryGateResult } from './memory-gate';

// Guards
export { GroundingGuard } from './guards/grounding-guard';
export { ContradictionGuard } from './guards/contradiction-guard';

// Main API
export { MemoryVaultAPI } from './vault-api';

// Migration
export { MEMORY_VAULT_MIGRATION } from './migrations';
