/**
 * Idempotence Utilities
 *
 * Provides idempotency key generation and duplicate detection for task execution.
 * Ensures exactly-once semantics by preventing duplicate task executions.
 *
 * Key Features:
 * - SHA256-based idempotency keys
 * - Duplicate task detection
 * - Task deduplication with result caching
 * - Configurable TTL for idempotency records
 */

import crypto from 'crypto';

/**
 * Task identification for idempotency
 */
export interface IdempotentTask {
  type: 'agent' | 'tool';
  target: string;
  input: any;
  runId?: string;
  phaseId?: string;
}

/**
 * Idempotency check result
 */
export interface IdempotencyResult {
  isIdempotent: boolean;
  existingTaskId?: string;
  existingResult?: any;
  idempotencyKey: string;
}

/**
 * Idempotency manager configuration
 */
export interface IdempotencyConfig {
  /**
   * Time-to-live for idempotency records in seconds
   * Default: 86400 (24 hours)
   */
  ttlSeconds?: number;

  /**
   * Whether to include phase context in key generation
   * Default: true
   */
  includePhaseContext?: boolean;

  /**
   * Whether to include run context in key generation
   * Default: true
   */
  includeRunContext?: boolean;
}

/**
 * Generate idempotency key from task specification
 *
 * Creates a deterministic SHA256 hash from task parameters.
 * The key is designed to be collision-resistant and reproducible.
 *
 * @param task - Task specification
 * @param config - Idempotency configuration
 * @returns SHA256 hash as hex string
 */
export function generateIdempotencyKey(
  task: IdempotentTask,
  config: IdempotencyConfig = {}
): string {
  const {
    includePhaseContext = true,
    includeRunContext = true,
  } = config;

  // Create canonical representation for hashing
  const canonical: Record<string, any> = {
    type: task.type,
    target: task.target,
    // Stringify input with sorted keys for determinism
    input: sortedStringify(task.input),
  };

  // Include contextual information if configured
  if (includePhaseContext && task.phaseId) {
    canonical.phaseId = task.phaseId;
  }

  if (includeRunContext && task.runId) {
    canonical.runId = task.runId;
  }

  // Generate SHA256 hash
  const canonicalString = sortedStringify(canonical);
  const hash = crypto.createHash('sha256');
  hash.update(canonicalString);

  return hash.digest('hex');
}

/**
 * Stringify object with sorted keys for deterministic hashing
 *
 * Ensures that objects with the same content but different key order
 * produce the same hash.
 *
 * @param obj - Object to stringify
 * @returns Deterministic JSON string
 */
function sortedStringify(obj: any): string {
  if (obj === null || obj === undefined) {
    return String(obj);
  }

  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(sortedStringify).join(',') + ']';
  }

  // Sort object keys and stringify
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(key => `"${key}":${sortedStringify(obj[key])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Extract idempotency key from various input formats
 *
 * Supports extracting keys from:
 * - Task specifications
 * - Pre-computed keys
 * - Custom key providers
 *
 * @param input - Input to extract key from
 * @param config - Idempotency configuration
 * @returns Idempotency key
 */
export function extractIdempotencyKey(
  input: IdempotentTask | string,
  config?: IdempotencyConfig
): string {
  if (typeof input === 'string') {
    return input;
  }

  return generateIdempotencyKey(input, config);
}

/**
 * Idempotency Manager
 *
 * Manages idempotency records and duplicate detection.
 * Integrates with database to track task executions.
 */
export class IdempotencyManager {
  private config: Required<IdempotencyConfig>;
  private db: any; // Database connection

  constructor(db: any, config: IdempotencyConfig = {}) {
    this.db = db;
    this.config = {
      ttlSeconds: config.ttlSeconds ?? 86400, // 24 hours default
      includePhaseContext: config.includePhaseContext ?? true,
      includeRunContext: config.includeRunContext ?? true,
    };
  }

  /**
   * Check if task has already been executed
   *
   * Queries database for existing task with same idempotency key.
   * Returns existing result if found.
   *
   * @param task - Task to check
   * @returns Idempotency check result
   */
  async checkIdempotency(task: IdempotentTask): Promise<IdempotencyResult> {
    const idempotencyKey = generateIdempotencyKey(task, this.config);

    // Query database for existing task
    const existingTask = await this.db.query(
      `SELECT id, result, status, completed_at
       FROM tasks
       WHERE idempotence_key = $1
         AND status IN ('completed', 'running')
         AND created_at > NOW() - INTERVAL '${this.config.ttlSeconds} seconds'
       ORDER BY created_at DESC
       LIMIT 1`,
      [idempotencyKey]
    );

    if (existingTask.rows.length === 0) {
      return {
        isIdempotent: false,
        idempotencyKey,
      };
    }

    const existing = existingTask.rows[0];

    return {
      isIdempotent: true,
      existingTaskId: existing.id,
      existingResult: existing.result,
      idempotencyKey,
    };
  }

  /**
   * Register task execution with idempotency key
   *
   * Should be called before executing task to claim the idempotency slot.
   * Prevents race conditions in distributed execution.
   *
   * @param taskId - Task ID
   * @param idempotencyKey - Idempotency key
   */
  async registerTask(taskId: string, idempotencyKey: string): Promise<void> {
    await this.db.query(
      `UPDATE tasks
       SET idempotence_key = $1
       WHERE id = $2`,
      [idempotencyKey, taskId]
    );
  }

  /**
   * Clean up expired idempotency records
   *
   * Removes idempotency keys from completed tasks older than TTL.
   * Should be called periodically (e.g., daily cron job).
   *
   * @returns Number of records cleaned up
   */
  async cleanup(): Promise<number> {
    const result = await this.db.query(
      `UPDATE tasks
       SET idempotence_key = NULL
       WHERE idempotence_key IS NOT NULL
         AND status = 'completed'
         AND completed_at < NOW() - INTERVAL '${this.config.ttlSeconds} seconds'`
    );

    return result.rowCount || 0;
  }

  /**
   * Force clear idempotency key for a task
   *
   * Use with caution - allows task re-execution.
   * Useful for manual retry scenarios.
   *
   * @param idempotencyKey - Key to clear
   */
  async clearIdempotencyKey(idempotencyKey: string): Promise<void> {
    await this.db.query(
      `UPDATE tasks
       SET idempotence_key = NULL
       WHERE idempotence_key = $1`,
      [idempotencyKey]
    );
  }

  /**
   * Get statistics about idempotency usage
   *
   * @returns Idempotency statistics
   */
  async getStats(): Promise<{
    totalWithKeys: number;
    recentDuplicates: number;
    oldestKey: Date | null;
  }> {
    const stats = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE idempotence_key IS NOT NULL) as total_with_keys,
         COUNT(*) FILTER (
           WHERE idempotence_key IS NOT NULL
           AND created_at > NOW() - INTERVAL '1 hour'
           AND status = 'completed'
         ) as recent_duplicates,
         MIN(created_at) FILTER (WHERE idempotence_key IS NOT NULL) as oldest_key
       FROM tasks`
    );

    return {
      totalWithKeys: parseInt(stats.rows[0].total_with_keys) || 0,
      recentDuplicates: parseInt(stats.rows[0].recent_duplicates) || 0,
      oldestKey: stats.rows[0].oldest_key,
    };
  }
}

/**
 * Idempotent task executor wrapper
 *
 * Wraps task execution with automatic idempotency checking.
 * Returns cached result if task has already been executed.
 *
 * @param task - Task to execute
 * @param executor - Task execution function
 * @param manager - Idempotency manager
 * @returns Task result (from cache or fresh execution)
 */
export async function executeIdempotent<T>(
  task: IdempotentTask,
  executor: () => Promise<T>,
  manager: IdempotencyManager
): Promise<T> {
  // Check if task has already been executed
  const check = await manager.checkIdempotency(task);

  if (check.isIdempotent) {
    // Return cached result
    return check.existingResult as T;
  }

  // Execute task
  const result = await executor();

  return result;
}

/**
 * Create idempotency key validator
 *
 * Returns a function that validates idempotency key format.
 *
 * @returns Validator function
 */
export function createIdempotencyKeyValidator(): (key: string) => boolean {
  const sha256Regex = /^[a-f0-9]{64}$/i;

  return (key: string): boolean => {
    return sha256Regex.test(key);
  };
}

/**
 * Export utilities
 */
export const isValidIdempotencyKey = createIdempotencyKeyValidator();
