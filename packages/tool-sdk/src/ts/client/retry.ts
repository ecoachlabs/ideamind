/**
 * IdeaMine Tools SDK - Retry Logic
 * Exponential backoff retry with jitter
 */

import { ToolLogger } from '../types';
import { isRetryableError } from '../utils/errors';

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number; // 0-1, amount of randomness to add
  retryableStatuses?: number[]; // HTTP status codes to retry
  shouldRetry?: (error: any) => boolean; // Custom retry predicate
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

// ============================================================================
// RETRY STATE
// ============================================================================

export interface RetryState {
  attempt: number;
  delayMs: number;
  totalDelayMs: number;
  errors: Error[];
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Execute function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  logger?: ToolLogger
): Promise<T> {
  const mergedConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const state: RetryState = {
    attempt: 0,
    delayMs: 0,
    totalDelayMs: 0,
    errors: [],
  };

  while (state.attempt < mergedConfig.maxAttempts) {
    state.attempt++;

    try {
      logger?.debug('Attempting request', {
        attempt: state.attempt,
        maxAttempts: mergedConfig.maxAttempts,
      });

      return await fn();
    } catch (error) {
      state.errors.push(error instanceof Error ? error : new Error(String(error)));

      const isLastAttempt = state.attempt >= mergedConfig.maxAttempts;
      const shouldRetryError = shouldRetry(error, mergedConfig);

      logger?.warn('Request failed', {
        attempt: state.attempt,
        error: error instanceof Error ? error.message : String(error),
        retryable: shouldRetryError,
        isLastAttempt,
      });

      if (isLastAttempt || !shouldRetryError) {
        // Throw the last error
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(
        mergedConfig.initialDelayMs * Math.pow(mergedConfig.backoffMultiplier, state.attempt - 1),
        mergedConfig.maxDelayMs
      );

      const jitter = baseDelay * mergedConfig.jitterFactor * (Math.random() * 2 - 1);
      state.delayMs = Math.max(0, baseDelay + jitter);
      state.totalDelayMs += state.delayMs;

      logger?.info('Retrying after delay', {
        attempt: state.attempt,
        delayMs: state.delayMs,
        totalDelayMs: state.totalDelayMs,
      });

      await sleep(state.delayMs);
    }
  }

  // Should never reach here
  throw state.errors[state.errors.length - 1];
}

/**
 * Check if error should trigger a retry
 */
function shouldRetry(error: any, config: RetryConfig): boolean {
  // Custom retry predicate
  if (config.shouldRetry) {
    return config.shouldRetry(error);
  }

  // Check HTTP status codes
  if (error.statusCode && config.retryableStatuses) {
    if (config.retryableStatuses.includes(error.statusCode)) {
      return true;
    }
  }

  // Use SDK error retry flag
  return isRetryableError(error);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// RETRY POLICY BUILDERS
// ============================================================================

/**
 * Create aggressive retry policy for critical operations
 */
export function aggressiveRetryPolicy(): RetryConfig {
  return {
    maxAttempts: 5,
    initialDelayMs: 50,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    jitterFactor: 0.2,
    retryableStatuses: [408, 429, 500, 502, 503, 504],
  };
}

/**
 * Create conservative retry policy for non-critical operations
 */
export function conservativeRetryPolicy(): RetryConfig {
  return {
    maxAttempts: 2,
    initialDelayMs: 200,
    maxDelayMs: 2000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
    retryableStatuses: [503, 504],
  };
}

/**
 * Create no-retry policy
 */
export function noRetryPolicy(): RetryConfig {
  return {
    maxAttempts: 1,
    initialDelayMs: 0,
    maxDelayMs: 0,
    backoffMultiplier: 1,
    jitterFactor: 0,
    retryableStatuses: [],
  };
}

// ============================================================================
// CIRCUIT BREAKER (Advanced)
// ============================================================================

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening circuit
  successThreshold: number; // Number of successes to close circuit
  timeoutMs: number; // Time to wait before attempting reset
}

export class CircuitBreaker {
  private failures = 0;
  private successes = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private openedAt?: number;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const now = Date.now();
      if (this.openedAt && now - this.openedAt >= this.config.timeoutMs) {
        this.state = 'half-open';
        this.successes = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'closed';
        this.successes = 0;
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.successes = 0;

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.openedAt = undefined;
  }
}
