/**
 * Application Constants
 * LOW PRIORITY FIX #23: Extract magic numbers to constants
 *
 * Centralizes all magic numbers and configuration values for:
 * - Better maintainability
 * - Type safety
 * - Documentation
 * - Easier testing
 */

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 1000,
  MAX_DELAY_MS: 10000,
  BACKOFF_MULTIPLIER: 2,
  JITTER_FACTOR: 0.2,
} as const;

// ============================================================================
// ANALYZER CONFIGURATION
// ============================================================================

export const ANALYZER_CONFIG = {
  MIN_CONFIDENCE_NO_TOOL: 0.78,
  MIN_SCORE_TO_INVOKE: 0.22,
  EXPECTED_TOOL_CONFIDENCE: 0.95,
} as const;

// ============================================================================
// DISPATCHER CONFIGURATION
// ============================================================================

export const DISPATCHER_CONFIG = {
  PROCESSING_INTERVAL_MS: 10,
  MAX_QUEUE_SIZE: 10000,
  MAX_CONCURRENCY: 100,
  BACK_PRESSURE_THRESHOLD: 0.7,
  BACK_PRESSURE_MAX_DELAY_MS: 5000,
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,
  CIRCUIT_BREAKER_TIMEOUT_MS: 30000,
} as const;

// ============================================================================
// DATABASE CONFIGURATION
// ============================================================================

export const DATABASE_CONFIG = {
  MAX_CONNECTIONS: 20,
  IDLE_TIMEOUT_MS: 30000,
  CONNECTION_TIMEOUT_MS: 5000,
  QUERY_TIMEOUT_MS: 30000,
  MAX_QUERY_LENGTH_LOG: 200,
  HEALTH_CHECK_INTERVAL_MS: 30000,
  POOL_WARNING_IDLE_RATIO: 0.2,
  POOL_WARNING_WAIT_COUNT: 5,
} as const;

// ============================================================================
// KNOWLEDGE MAP CONFIGURATION
// ============================================================================

export const KNOWLEDGE_MAP_CONFIG = {
  MAX_QUESTIONS_PER_BATCH: 1000,
  MAX_CARRY_OVER_QUESTIONS: 50,
  MIN_CARRY_OVER_PRIORITY: 0.5,
  HIGH_PRIORITY_THRESHOLD: 0.8,
  MAX_TAG_LENGTH: 100,
  MAX_QUESTION_ID_LENGTH: 100,
} as const;

// ============================================================================
// VALIDATION THRESHOLDS
// ============================================================================

export const VALIDATION_THRESHOLDS = {
  GROUNDING: 0.85,
  COMPLETENESS: 0.80,
  SPECIFICITY: 0.75,
  CONSISTENCY: 1.0,
} as const;

// ============================================================================
// LLM PROVIDER CONFIGURATION
// ============================================================================

export const LLM_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAYS_MS: [1000, 2000, 4000],
  TOKEN_CHAR_RATIO: 3.5, // 1 token ≈ 3.5 characters
  REQUEST_TIMEOUT_MS: 60000,
} as const;

// ============================================================================
// PAGINATION LIMITS
// ============================================================================

export const PAGINATION = {
  MAX_LIMIT: 1000,
  DEFAULT_LIMIT: 100,
  MIN_LIMIT: 1,
  MAX_OFFSET: 1000000,
} as const;

// ============================================================================
// WORKFLOW PHASES
// ============================================================================

export const WORKFLOW_PHASES = [
  'INTAKE',
  'IDEATION',
  'CRITIQUE',
  'PRD',
  'BIZDEV',
  'ARCH',
  'BUILD',
  'CODING',
  'QA',
  'AESTHETIC',
  'RELEASE',
  'BETA',
  'GA',
] as const;

export type WorkflowPhase = typeof WORKFLOW_PHASES[number];

// ============================================================================
// QUESTION STATUSES
// ============================================================================

export const QUESTION_STATUSES = [
  'open',
  'partial',
  'answered',
  'rejected',
  'carried_over',
] as const;

export type QuestionStatus = typeof QUESTION_STATUSES[number];

// ============================================================================
// BINDING DECISIONS
// ============================================================================

export const BINDING_DECISIONS = ['accept', 'reject'] as const;

export type BindingDecision = typeof BINDING_DECISIONS[number];

// ============================================================================
// CONFLICT SEVERITY LEVELS
// ============================================================================

export const CONFLICT_SEVERITY = ['low', 'medium', 'high', 'critical'] as const;

export type ConflictSeverity = typeof CONFLICT_SEVERITY[number];

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================

export const PERFORMANCE = {
  MAX_PROCESSING_TIMES_STORED: 100,
  STATS_WINDOW_SECONDS: 60,
  SLOW_QUERY_THRESHOLD_MS: 1000,
} as const;

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

export const SECURITY = {
  MAX_LOG_LENGTH: 1000,
  PII_REDACTION_PATTERNS: [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, // Email
    /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
    /\b\d{16}\b/g, // Credit card
  ],
  BCRYPT_ROUNDS: 10,
  SESSION_TIMEOUT_MS: 3600000, // 1 hour
} as const;

// ============================================================================
// GRACEFUL SHUTDOWN CONFIGURATION
// ============================================================================

export const SHUTDOWN = {
  TIMEOUT_MS: 30000, // 30 seconds
  CHECK_INTERVAL_MS: 100,
} as const;

// ============================================================================
// FILE UPLOAD LIMITS
// ============================================================================

export const UPLOAD = {
  MAX_FILE_SIZE_MB: 10,
  MAX_FILES_PER_REQUEST: 5,
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/json',
  ],
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a phase is valid
 */
export function isValidPhase(phase: string): phase is WorkflowPhase {
  return WORKFLOW_PHASES.includes(phase as WorkflowPhase);
}

/**
 * Check if a question status is valid
 */
export function isValidQuestionStatus(status: string): status is QuestionStatus {
  return QUESTION_STATUSES.includes(status as QuestionStatus);
}

/**
 * Check if a binding decision is valid
 */
export function isValidBindingDecision(decision: string): decision is BindingDecision {
  return BINDING_DECISIONS.includes(decision as BindingDecision);
}

/**
 * Get previous phase in workflow
 */
export function getPreviousPhase(currentPhase: WorkflowPhase): WorkflowPhase | null {
  const index = WORKFLOW_PHASES.indexOf(currentPhase);
  if (index <= 0) return null;
  return WORKFLOW_PHASES[index - 1];
}

/**
 * Get next phase in workflow
 */
export function getNextPhase(currentPhase: WorkflowPhase): WorkflowPhase | null {
  const index = WORKFLOW_PHASES.indexOf(currentPhase);
  if (index === -1 || index === WORKFLOW_PHASES.length - 1) return null;
  return WORKFLOW_PHASES[index + 1];
}

/**
 * Get all phases before current phase
 */
export function getPreviousPhases(currentPhase: WorkflowPhase): WorkflowPhase[] {
  const index = WORKFLOW_PHASES.indexOf(currentPhase);
  if (index <= 0) return [];
  return WORKFLOW_PHASES.slice(0, index) as WorkflowPhase[];
}
