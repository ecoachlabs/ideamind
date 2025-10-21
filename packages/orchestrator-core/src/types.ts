import { WorkflowState, Budget } from '@ideamine/event-schemas';
import { ArtifactReference } from '@ideamine/artifact-schemas';

/**
 * Workflow run represents a single execution from idea to GA
 */
export interface WorkflowRun {
  id: string;
  state: WorkflowState;
  ideaSpecId: string;
  userId: string;
  budget: Budget;
  phases: PhaseExecution[];
  gates: GateResult[];
  artifacts: ArtifactReference[];
  createdAt: Date;
  updatedAt: Date;
  retryCount: number;
  metadata?: Record<string, unknown>;
}

/**
 * Phase execution record
 */
export interface PhaseExecution {
  phaseId: string;
  phaseName: string;
  state: PhaseState;
  startedAt?: Date;
  completedAt?: Date;
  agents: AgentExecution[];
  artifacts: ArtifactReference[];
  costUsd: number;
  retryCount: number;
  error?: string;
}

/**
 * Phase state
 */
export enum PhaseState {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  BLOCKED = 'BLOCKED',
}

/**
 * Agent execution record
 */
export interface AgentExecution {
  agentId: string;
  agentType: string;
  state: AgentState;
  startedAt?: Date;
  completedAt?: Date;
  costUsd: number;
  tokensUsed: number;
  toolsInvoked: string[];
  error?: string;
}

/**
 * Agent state
 */
export enum AgentState {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * Gate result
 */
export interface GateResult {
  gateId: string;
  gateName: string;
  phase: string;
  result: GateResultType;
  score?: number;
  evidence: GateEvidence[];
  humanReviewRequired: boolean;
  evaluatedAt: Date;
}

/**
 * Gate result type
 */
export enum GateResultType {
  PASS = 'PASS',
  FAIL = 'FAIL',
  WARN = 'WARN',
}

/**
 * Gate evidence
 */
export interface GateEvidence {
  criterion: string;
  passed: boolean;
  score?: number;
  details?: string;
}

/**
 * Phase configuration
 */
export interface PhaseConfig {
  phaseId: string;
  phaseName: string;
  state: WorkflowState;
  agents: string[]; // Agent IDs
  gates?: string[]; // Gate IDs to evaluate after phase
  isMandatory: boolean;
  dependencies: string[]; // Phase IDs that must complete first
}
