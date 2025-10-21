/**
 * Memory Vault - Core Types
 *
 * Central memory system for storing, organizing, and distributing
 * knowledge across all runs and phases.
 */

// ============================================================================
// Scopes & Lifetimes
// ============================================================================

export type MemoryScope = 'ephemeral' | 'run' | 'tenant' | 'global';

export interface TTLConfig {
  scope: MemoryScope;
  defaultTTL: number; // milliseconds
  maxTTL: number;
}

export const DEFAULT_TTL_CONFIG: Record<MemoryScope, TTLConfig> = {
  ephemeral: { scope: 'ephemeral', defaultTTL: 3600000, maxTTL: 86400000 }, // 1h default, 24h max
  run: { scope: 'run', defaultTTL: 604800000, maxTTL: 2592000000 }, // 1w default, 30d max
  tenant: { scope: 'tenant', defaultTTL: 2592000000, maxTTL: 31536000000 }, // 30d default, 365d max
  global: { scope: 'global', defaultTTL: 31536000000, maxTTL: -1 }, // 365d default, no max
};

// ============================================================================
// KnowledgeFrame
// ============================================================================

export interface Provenance {
  who: string; // user, agent, or system
  when: Date;
  tools: string[];
  inputs: string[];
  signature?: string; // cryptographic digest
}

export interface KnowledgeFrame {
  id: string;
  scope: MemoryScope;
  theme: string; // e.g., "API.design", "SECURITY.threats", "PRD.v1"
  summary: string;
  claims: string[]; // atomic statements
  citations: string[]; // artifact IDs, URLs, or frame IDs
  parents: string[]; // parent frame IDs
  children: string[]; // child frame IDs
  version: string;
  provenance: Provenance;
  createdAt: Date;
  updatedAt: Date;
  ttl?: number; // override default TTL
  pinned: boolean; // if true, never expires
  tags?: string[];
  metadata?: Record<string, any>;
}

// ============================================================================
// QABinding (Question-Answer-Validation)
// ============================================================================

export interface QABinding {
  qid: string; // question ID
  aid: string; // answer ID
  question: string;
  answer: string;
  validatorScore: number; // 0-1
  accepted: boolean;
  grounding: number; // 0-1, how well grounded in citations
  contradictions: number; // count of detected contradictions
  citations: string[];
  createdAt: Date;
  phase?: string;
  runId?: string;
  doer?: string;
}

// ============================================================================
// Signal (Metrics/Telemetry)
// ============================================================================

export interface Signal {
  id: string;
  runId: string;
  taskId?: string;
  gateScores?: Record<string, number>;
  cost?: number;
  time?: number;
  model?: string;
  tool?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

// ============================================================================
// Context Pack (Query Response)
// ============================================================================

export interface ContextPack {
  frames: KnowledgeFrame[];
  artifacts: string[]; // artifact IDs or URIs
  citations: string[];
  freshnessScore: number; // 0-1, based on age vs TTL
  policyHints?: {
    recommendedModel?: string;
    temperature?: number;
    maxTokens?: number;
  };
  metadata?: {
    queryTime: number;
    tokensUsed: number;
    cacheHit: boolean;
  };
}

// ============================================================================
// Query & Filters
// ============================================================================

export interface MemoryQuery {
  scope?: MemoryScope | MemoryScope[];
  phase?: string;
  doer?: string;
  theme?: string;
  k?: number; // top-k results
  filters?: {
    minFreshness?: number; // 0-1
    minGrounding?: number; // 0-1
    tags?: string[];
    afterDate?: Date;
    beforeDate?: Date;
  };
  freshness?: number; // reject if freshness < this
  need?: 'citation' | 'code' | 'spec' | 'policy'; // hint for prioritization
}

export interface MemorySuggestRequest {
  doer: string;
  phase: string;
  task: string;
  context?: Record<string, any>;
}

// ============================================================================
// Ingest Requests
// ============================================================================

export interface IngestFrameRequest {
  frame: Omit<KnowledgeFrame, 'id' | 'createdAt' | 'updatedAt'>;
}

export interface IngestQABindingRequest {
  q: string;
  a: string;
  v?: number; // validator score
  phase?: string;
  runId?: string;
  doer?: string;
  citations?: string[];
}

export interface IngestArtifactRequest {
  type: string;
  uri: string;
  sha256: string;
  phase: string;
  runId: string;
  metadata?: Record<string, any>;
}

export interface IngestSignalRequest {
  signal: Omit<Signal, 'id' | 'timestamp'>;
}

// ============================================================================
// Subscription & Distribution
// ============================================================================

export type MemoryTopic =
  | 'memory.delta.created'
  | 'memory.delta.updated'
  | 'memory.delta.deleted'
  | 'memory.policy.promoted'
  | 'memory.frame.invalidated';

export interface MemorySubscription {
  id: string;
  topic: MemoryTopic | string; // supports wildcards like "memory.delta.*"
  doer?: string;
  phase?: string;
  theme?: string;
  callback?: string; // webhook URL or internal handler
  createdAt: Date;
}

export interface MemoryDelta {
  topic: MemoryTopic;
  frameIds?: string[];
  policyIds?: string[];
  summary: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// ============================================================================
// Admin Operations
// ============================================================================

export interface UpdateTTLRequest {
  scope: MemoryScope;
  theme?: string;
  ttl: number;
}

export interface PinRequest {
  frameId?: string;
  artifactId?: string;
}

export interface ForgetRequest {
  selectors: {
    scope?: MemoryScope;
    theme?: string;
    beforeDate?: Date;
    runId?: string;
    doer?: string;
  };
  reason: string; // for audit
}

// ============================================================================
// Refinery (Fission/Fusion)
// ============================================================================

export interface RefineryResult {
  frames: KnowledgeFrame[];
  conflicts: ConflictReport[];
  stats: {
    fissioned: number; // compound → atomic
    fused: number; // duplicates → canonical
    rejected: number; // failed validation
  };
}

export interface ConflictReport {
  frameIds: string[];
  claims: string[];
  resolution: 'quarantined' | 'majority' | 'manual';
  metadata?: Record<string, any>;
}

// ============================================================================
// Guards
// ============================================================================

export interface GroundingCheckResult {
  grounded: boolean;
  score: number; // 0-1
  missingCitations: string[];
  reason?: string;
}

export interface ContradictionCheckResult {
  contradicts: boolean;
  conflicts: Array<{
    claim: string;
    conflictingFrameId: string;
    conflictingClaim: string;
  }>;
  severity: 'low' | 'medium' | 'high';
}

// ============================================================================
// Migration Schema
// ============================================================================

export const MEMORY_VAULT_MIGRATION = `
-- Migration placeholder - actual SQL in migrations.ts
-- Tables: knowledge_frames, qa_bindings, signals, memory_subscriptions
`;
