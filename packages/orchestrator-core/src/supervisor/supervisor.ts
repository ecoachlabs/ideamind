/**
 * Supervisor - Unstick retries, handle backoff, restart failed nodes
 *
 * Implements resilience patterns from the Level-2 microflow specification:
 * - Exponential backoff with jitter
 * - Circuit breaker pattern
 * - Heartbeat monitoring
 * - Automatic restart of stuck executions
 * - Quarantine for repeated failures
 * - Escalation to human intervention
 *
 * Error Handling Policy:
 * - Tool failure: retry with exponential backoff (max 3)
 * - Fallback tool if available
 * - Escalate to human if policy requires
 * - Gate fail: attach hints; open tickets; loop back to upstream phase
 * - Budget breach: switch to cheaper models, reduce sampling
 * - Stuck execution: detect heartbeat loss → restart node; if repeated, quarantine
 */

import { Recorder } from '../recorder/recorder';

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number; // 0-1, adds randomness to prevent thundering herd
  retryableErrors: string[]; // Error codes that should trigger retry
  nonRetryableErrors: string[]; // Error codes that should not retry
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening circuit
  successThreshold: number; // Number of successes before closing circuit
  timeout: number; // How long to wait before trying again (ms)
  halfOpenRequests: number; // Number of requests to try in half-open state
}

export interface HeartbeatConfig {
  interval: number; // How often to expect heartbeat (ms)
  timeout: number; // How long to wait before declaring stuck (ms)
  maxMissed: number; // Max consecutive missed heartbeats before restart
}

export interface SupervisionConfig {
  retryPolicy: RetryPolicy;
  circuitBreaker?: CircuitBreakerConfig;
  heartbeat?: HeartbeatConfig;
  quarantineAfterFailures?: number; // Quarantine after N consecutive failures
  escalateAfterRetries?: number; // Escalate to human after N retries
}

export interface ExecutionContext {
  runId: string;
  phase: string;
  step: string;
  actor: string;
  attempt: number;
  metadata?: Record<string, any>;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelayMs: number;
  quarantined: boolean;
  escalated: boolean;
}

export interface CircuitState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastStateChange: number;
}

export interface HeartbeatState {
  lastHeartbeat: number;
  missedCount: number;
  stuck: boolean;
}

/**
 * Supervisor - Handles retries, backoff, and failure recovery
 */
export class Supervisor {
  private circuitStates: Map<string, CircuitState> = new Map();
  private heartbeatStates: Map<string, HeartbeatState> = new Map();
  private quarantinedActors: Set<string> = new Set();

  constructor(
    private config: SupervisionConfig,
    private recorder?: Recorder
  ) {}

  /**
   * Execute a function with retry logic
   */
  async executeWithRetry<T>(
    context: ExecutionContext,
    fn: () => Promise<T>
  ): Promise<RetryResult<T>> {
    const { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier, jitterFactor } =
      this.config.retryPolicy;

    let attempt = 0;
    let totalDelayMs = 0;
    let lastError: Error | undefined;

    // Check if actor is quarantined
    if (this.isQuarantined(context.actor)) {
      await this.recordSupervision(context, 'quarantine_check', {
        quarantined: true,
        reason: 'Actor previously quarantined',
      });

      return {
        success: false,
        error: new Error(`Actor ${context.actor} is quarantined`),
        attempts: 0,
        totalDelayMs: 0,
        quarantined: true,
        escalated: false,
      };
    }

    // Check circuit breaker
    if (this.config.circuitBreaker && this.isCircuitOpen(context.actor)) {
      await this.recordSupervision(context, 'circuit_breaker_check', {
        state: 'open',
        reason: 'Circuit breaker is open',
      });

      return {
        success: false,
        error: new Error(`Circuit breaker is open for ${context.actor}`),
        attempts: 0,
        totalDelayMs: 0,
        quarantined: false,
        escalated: false,
      };
    }

    while (attempt < maxAttempts) {
      attempt++;

      try {
        const startTime = Date.now();
        const result = await fn();
        const latencyMs = Date.now() - startTime;

        // Success - record and update circuit breaker
        if (this.config.circuitBreaker) {
          this.recordSuccess(context.actor);
        }

        await this.recordSupervision(context, 'execution_success', {
          attempt,
          latencyMs,
          totalDelayMs,
        });

        return {
          success: true,
          result,
          attempts: attempt,
          totalDelayMs,
          quarantined: false,
          escalated: false,
        };
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (!this.isRetryable(lastError)) {
          await this.recordSupervision(context, 'non_retryable_error', {
            attempt,
            error: lastError.message,
          });

          return {
            success: false,
            error: lastError,
            attempts: attempt,
            totalDelayMs,
            quarantined: false,
            escalated: false,
          };
        }

        // Record failure
        if (this.config.circuitBreaker) {
          this.recordFailure(context.actor);
        }

        await this.recordSupervision(context, 'retryable_error', {
          attempt,
          error: lastError.message,
          willRetry: attempt < maxAttempts,
        });

        // Check if we should quarantine
        if (
          this.config.quarantineAfterFailures &&
          attempt >= this.config.quarantineAfterFailures
        ) {
          this.quarantine(context.actor);

          await this.recordSupervision(context, 'quarantine', {
            attempt,
            reason: `Failed ${attempt} times`,
          });

          return {
            success: false,
            error: lastError,
            attempts: attempt,
            totalDelayMs,
            quarantined: true,
            escalated: false,
          };
        }

        // Check if we should escalate
        if (this.config.escalateAfterRetries && attempt >= this.config.escalateAfterRetries) {
          await this.recordSupervision(context, 'escalate', {
            attempt,
            error: lastError.message,
          });

          return {
            success: false,
            error: lastError,
            attempts: attempt,
            totalDelayMs,
            quarantined: false,
            escalated: true,
          };
        }

        // Calculate backoff delay with jitter
        if (attempt < maxAttempts) {
          const baseDelay = Math.min(
            initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
            maxDelayMs
          );
          const jitter = baseDelay * jitterFactor * (Math.random() - 0.5) * 2;
          const delay = Math.max(0, baseDelay + jitter);

          await this.recordSupervision(context, 'backoff', {
            attempt,
            delayMs: delay,
          });

          await this.sleep(delay);
          totalDelayMs += delay;
        }
      }
    }

    // Max attempts reached
    await this.recordSupervision(context, 'max_attempts_reached', {
      attempts: attempt,
      totalDelayMs,
      lastError: lastError?.message,
    });

    return {
      success: false,
      error: lastError,
      attempts: attempt,
      totalDelayMs,
      quarantined: false,
      escalated: false,
    };
  }

  /**
   * Start heartbeat monitoring for a long-running execution
   */
  startHeartbeat(executionId: string): void {
    if (!this.config.heartbeat) return;

    this.heartbeatStates.set(executionId, {
      lastHeartbeat: Date.now(),
      missedCount: 0,
      stuck: false,
    });
  }

  /**
   * Record a heartbeat
   */
  recordHeartbeat(executionId: string): void {
    const state = this.heartbeatStates.get(executionId);
    if (state) {
      state.lastHeartbeat = Date.now();
      state.missedCount = 0;
      state.stuck = false;
    }
  }

  /**
   * Check if execution is stuck (missed heartbeats)
   */
  isStuck(executionId: string): boolean {
    if (!this.config.heartbeat) return false;

    const state = this.heartbeatStates.get(executionId);
    if (!state) return false;

    const now = Date.now();
    const timeSinceLastHeartbeat = now - state.lastHeartbeat;

    if (timeSinceLastHeartbeat > this.config.heartbeat.timeout) {
      state.missedCount++;
      if (state.missedCount >= this.config.heartbeat.maxMissed) {
        state.stuck = true;
        return true;
      }
    }

    return false;
  }

  /**
   * Stop heartbeat monitoring
   */
  stopHeartbeat(executionId: string): void {
    this.heartbeatStates.delete(executionId);
  }

  /**
   * Check if actor is quarantined
   */
  isQuarantined(actor: string): boolean {
    return this.quarantinedActors.has(actor);
  }

  /**
   * Quarantine an actor
   */
  quarantine(actor: string): void {
    this.quarantinedActors.add(actor);
  }

  /**
   * Release from quarantine
   */
  releaseFromQuarantine(actor: string): void {
    this.quarantinedActors.delete(actor);
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: Error): boolean {
    const { retryableErrors, nonRetryableErrors } = this.config.retryPolicy;

    // Check non-retryable first (takes precedence)
    if (nonRetryableErrors.some((code) => error.message.includes(code))) {
      return false;
    }

    // If retryable list is empty, retry all errors
    if (retryableErrors.length === 0) {
      return true;
    }

    // Check if error matches retryable list
    return retryableErrors.some((code) => error.message.includes(code));
  }

  /**
   * Circuit Breaker - Check if circuit is open
   */
  private isCircuitOpen(actor: string): boolean {
    if (!this.config.circuitBreaker) return false;

    const state = this.getCircuitState(actor);
    const config = this.config.circuitBreaker;

    if (state.state === 'open') {
      const now = Date.now();
      const timeSinceFailure = state.lastFailureTime
        ? now - state.lastFailureTime
        : Number.MAX_SAFE_INTEGER;

      // Try to transition to half-open after timeout
      if (timeSinceFailure >= config.timeout) {
        state.state = 'half-open';
        state.successes = 0;
        state.lastStateChange = now;
        return false;
      }

      return true;
    }

    return false;
  }

  /**
   * Record a successful execution (for circuit breaker)
   */
  private recordSuccess(actor: string): void {
    if (!this.config.circuitBreaker) return;

    const state = this.getCircuitState(actor);
    const config = this.config.circuitBreaker;

    state.successes++;
    state.failures = 0;

    // Transition from half-open to closed after enough successes
    if (state.state === 'half-open' && state.successes >= config.successThreshold) {
      state.state = 'closed';
      state.successes = 0;
      state.lastStateChange = Date.now();
    }
  }

  /**
   * Record a failed execution (for circuit breaker)
   */
  private recordFailure(actor: string): void {
    if (!this.config.circuitBreaker) return;

    const state = this.getCircuitState(actor);
    const config = this.config.circuitBreaker;

    state.failures++;
    state.successes = 0;
    state.lastFailureTime = Date.now();

    // Open circuit after threshold failures
    if (state.state === 'closed' && state.failures >= config.failureThreshold) {
      state.state = 'open';
      state.lastStateChange = Date.now();
    }

    // Return to open if failure in half-open state
    if (state.state === 'half-open') {
      state.state = 'open';
      state.lastStateChange = Date.now();
    }
  }

  /**
   * Get or create circuit state
   */
  private getCircuitState(actor: string): CircuitState {
    if (!this.circuitStates.has(actor)) {
      this.circuitStates.set(actor, {
        state: 'closed',
        failures: 0,
        successes: 0,
        lastStateChange: Date.now(),
      });
    }
    return this.circuitStates.get(actor)!;
  }

  /**
   * Record supervision event
   */
  private async recordSupervision(
    context: ExecutionContext,
    event: string,
    details: any
  ): Promise<void> {
    if (!this.recorder) return;

    await this.recorder.recordStep({
      runId: context.runId,
      phase: context.phase,
      step: `supervision.${event}`,
      actor: `Supervisor:${context.actor}`,
      cost: { usd: 0, tokens: 0 },
      latency_ms: 0,
      status: 'succeeded',
      metadata: { ...context.metadata, ...details },
    });
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get supervision metrics
   */
  getMetrics(actor?: string): {
    circuitStates: Record<string, CircuitState>;
    heartbeatStates: Record<string, HeartbeatState>;
    quarantinedActors: string[];
  } {
    const circuitStates: Record<string, CircuitState> = {};
    const heartbeatStates: Record<string, HeartbeatState> = {};

    if (actor) {
      const circuit = this.circuitStates.get(actor);
      if (circuit) circuitStates[actor] = circuit;

      const heartbeat = this.heartbeatStates.get(actor);
      if (heartbeat) heartbeatStates[actor] = heartbeat;
    } else {
      this.circuitStates.forEach((state, key) => {
        circuitStates[key] = state;
      });
      this.heartbeatStates.forEach((state, key) => {
        heartbeatStates[key] = state;
      });
    }

    return {
      circuitStates,
      heartbeatStates,
      quarantinedActors: Array.from(this.quarantinedActors),
    };
  }
}

/**
 * Default retry policies for common scenarios
 */
export const DEFAULT_RETRY_POLICIES: Record<string, RetryPolicy> = {
  standard: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    jitterFactor: 0.2,
    retryableErrors: [],
    nonRetryableErrors: ['ValidationError', 'AuthenticationError'],
  },

  aggressive: {
    maxAttempts: 5,
    initialDelayMs: 500,
    maxDelayMs: 30000,
    backoffMultiplier: 3,
    jitterFactor: 0.3,
    retryableErrors: [],
    nonRetryableErrors: ['ValidationError', 'AuthenticationError'],
  },

  conservative: {
    maxAttempts: 2,
    initialDelayMs: 2000,
    maxDelayMs: 5000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.1,
    retryableErrors: [],
    nonRetryableErrors: ['ValidationError', 'AuthenticationError'],
  },
};
