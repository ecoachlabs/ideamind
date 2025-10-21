import pino from 'pino';

const logger = pino({ name: 'retry-policy' });

/**
 * Error types for retry policies
 */
export enum ErrorType {
  TRANSIENT = 'transient', // network errors, timeouts
  SCHEMA = 'schema', // schema validation failures
  TOOL_INFRA = 'tool_infra', // tool execution failures
  HALLUCINATION = 'hallucination', // guard detected hallucination
  RATE_LIMIT = 'rate_limit', // API rate limiting
  UNKNOWN = 'unknown', // unknown errors
}

/**
 * Backoff strategy
 */
export type BackoffStrategy = 'exponential' | 'linear' | 'constant';

/**
 * Escalation strategy when retries exhausted
 */
export type EscalationStrategy = 'fix-synth' | 'alternate-tool' | 'fail';

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  type: ErrorType;
  max_retries: number;
  backoff: BackoffStrategy;
  base_delay_ms: number;
  max_delay_ms: number;
  escalation?: EscalationStrategy;
}

/**
 * Retry Policy Engine - Configurable retries per error type
 *
 * Features:
 * - Different retry strategies per error type
 * - Exponential/linear/constant backoff
 * - Escalation when retries exhausted
 * - Retry statistics tracking
 *
 * Spec: orchestrator.txt:145-147, phase.txt:89
 */
export class RetryPolicyEngine {
  private policies: Record<ErrorType, RetryPolicy>;
  private retryStats: Map<string, { attempts: number; lastError?: string }> = new Map();

  constructor(customPolicies?: Partial<Record<ErrorType, RetryPolicy>>) {
    // Default policies
    this.policies = {
      [ErrorType.TRANSIENT]: {
        type: ErrorType.TRANSIENT,
        max_retries: 5,
        backoff: 'exponential',
        base_delay_ms: 1000,
        max_delay_ms: 60000,
      },
      [ErrorType.SCHEMA]: {
        type: ErrorType.SCHEMA,
        max_retries: 1,
        backoff: 'constant',
        base_delay_ms: 0,
        max_delay_ms: 0,
        escalation: 'fix-synth',
      },
      [ErrorType.TOOL_INFRA]: {
        type: ErrorType.TOOL_INFRA,
        max_retries: 3,
        backoff: 'exponential',
        base_delay_ms: 2000,
        max_delay_ms: 30000,
        escalation: 'alternate-tool',
      },
      [ErrorType.HALLUCINATION]: {
        type: ErrorType.HALLUCINATION,
        max_retries: 2,
        backoff: 'constant',
        base_delay_ms: 0,
        max_delay_ms: 0,
        escalation: 'fail',
      },
      [ErrorType.RATE_LIMIT]: {
        type: ErrorType.RATE_LIMIT,
        max_retries: 10,
        backoff: 'exponential',
        base_delay_ms: 5000,
        max_delay_ms: 300000, // 5 minutes
      },
      [ErrorType.UNKNOWN]: {
        type: ErrorType.UNKNOWN,
        max_retries: 3,
        backoff: 'exponential',
        base_delay_ms: 1000,
        max_delay_ms: 30000,
        escalation: 'fail',
      },
    };

    // Override with custom policies
    if (customPolicies) {
      this.policies = { ...this.policies, ...customPolicies };
    }

    logger.info({ policies: this.policies }, 'RetryPolicyEngine initialized');
  }

  /**
   * Execute function with retry logic
   *
   * @param fn - Function to execute
   * @param errorType - Error type for policy selection
   * @param taskId - Task ID for tracking (optional)
   * @param attempt - Current attempt number (for recursive calls)
   * @returns Function result
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    errorType: ErrorType,
    taskId?: string,
    attempt: number = 0
  ): Promise<T> {
    const policy = this.policies[errorType];

    try {
      const result = await fn();

      // Success - clear retry stats
      if (taskId) {
        this.retryStats.delete(taskId);
      }

      if (attempt > 0) {
        logger.info(
          { errorType, attempt, taskId },
          'Retry succeeded after previous failures'
        );
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.warn(
        {
          errorType,
          attempt: attempt + 1,
          maxRetries: policy.max_retries,
          taskId,
          error: errorMessage,
        },
        'Execution failed'
      );

      // Track retry attempt
      if (taskId) {
        this.retryStats.set(taskId, {
          attempts: attempt + 1,
          lastError: errorMessage,
        });
      }

      // Check if we've exhausted retries
      if (attempt >= policy.max_retries) {
        logger.error(
          {
            errorType,
            maxRetries: policy.max_retries,
            escalation: policy.escalation,
            taskId,
          },
          'Max retries exhausted'
        );

        // Escalate
        if (policy.escalation === 'fix-synth') {
          return this.escalateToFixSynth(error);
        } else if (policy.escalation === 'alternate-tool') {
          throw new Error(
            `Max retries exhausted for ${errorType}. Escalation: alternate-tool (not implemented)`
          );
        } else {
          throw error;
        }
      }

      // Calculate delay
      const delay = this.calculateDelay(policy, attempt);

      logger.info(
        {
          errorType,
          attempt: attempt + 1,
          maxRetries: policy.max_retries,
          delayMs: delay,
          taskId,
        },
        'Retrying after delay'
      );

      await this.sleep(delay);

      // Recursive retry
      return this.executeWithRetry(fn, errorType, taskId, attempt + 1);
    }
  }

  /**
   * Calculate retry delay based on policy
   *
   * @param policy - Retry policy
   * @param attempt - Current attempt number (0-indexed)
   * @returns Delay in milliseconds
   */
  private calculateDelay(policy: RetryPolicy, attempt: number): number {
    let delay = policy.base_delay_ms;

    if (policy.backoff === 'exponential') {
      delay = policy.base_delay_ms * Math.pow(2, attempt);
    } else if (policy.backoff === 'linear') {
      delay = policy.base_delay_ms * (attempt + 1);
    }
    // For 'constant', delay stays at base_delay_ms

    return Math.min(delay, policy.max_delay_ms);
  }

  /**
   * Escalate to Fix-Synth agent for auto-repair
   *
   * @param error - Original error
   * @returns Repaired result (placeholder)
   */
  private async escalateToFixSynth(error: Error): Promise<any> {
    logger.warn({ error: error.message }, 'Escalating to Fix-Synth agent (not implemented)');

    // TODO: Implement Fix-Synth agent integration
    // For now, throw the original error
    throw error;
  }

  /**
   * Sleep for specified duration
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get retry statistics
   */
  getStats(): {
    trackedTasks: number;
    tasks: Array<{ taskId: string; attempts: number; lastError?: string }>;
  } {
    const tasks = Array.from(this.retryStats.entries()).map(([taskId, stats]) => ({
      taskId,
      ...stats,
    }));

    return {
      trackedTasks: this.retryStats.size,
      tasks,
    };
  }

  /**
   * Get policy for error type
   *
   * @param errorType - Error type
   * @returns Retry policy
   */
  getPolicy(errorType: ErrorType): RetryPolicy {
    return this.policies[errorType];
  }

  /**
   * Update policy for error type
   *
   * @param errorType - Error type
   * @param policy - New policy
   */
  setPolicy(errorType: ErrorType, policy: RetryPolicy): void {
    this.policies[errorType] = policy;
    logger.info({ errorType, policy }, 'Retry policy updated');
  }

  /**
   * Classify error into ErrorType
   *
   * Heuristic-based classification
   *
   * @param error - Error to classify
   * @returns Error type
   */
  classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('network') || message.includes('econnrefused')) {
      return ErrorType.TRANSIENT;
    }

    if (message.includes('schema') || message.includes('validation')) {
      return ErrorType.SCHEMA;
    }

    if (message.includes('tool') && message.includes('failed')) {
      return ErrorType.TOOL_INFRA;
    }

    if (message.includes('hallucination')) {
      return ErrorType.HALLUCINATION;
    }

    if (message.includes('rate limit') || message.includes('too many requests')) {
      return ErrorType.RATE_LIMIT;
    }

    return ErrorType.UNKNOWN;
  }
}
