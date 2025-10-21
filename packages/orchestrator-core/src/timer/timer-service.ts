import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';
import pino from 'pino';
import { JobQueue } from '../queue/queue';
import { TaskSpec } from '../queue/types';

const logger = pino({ name: 'timer-service' });

/**
 * Timer action types
 */
export type TimerAction = 'retry' | 'timeout' | 'cleanup' | 'custom';

/**
 * Timer record
 */
export interface Timer {
  id: string;
  task_id?: string;
  run_id?: string;
  phase_id?: string;
  fire_at: Date;
  action: TimerAction;
  payload: Record<string, any>;
  status: 'pending' | 'fired' | 'cancelled';
  created_at: Date;
  fired_at?: Date;
}

/**
 * Retry policy
 */
export interface RetryPolicy {
  base: number; // Base delay in milliseconds
  maxMs: number; // Maximum delay in milliseconds
  maxAttempts: number; // Maximum retry attempts
}

/**
 * Default retry policy: exponential backoff
 * Base: 1s, Max: 5min, Max attempts: 3
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  base: 1000,
  maxMs: 300000, // 5 minutes
  maxAttempts: 3,
};

/**
 * TimerService - Durable timers for retries, timeouts, and scheduled actions
 *
 * Features:
 * - Schedule retries with exponential backoff
 * - Enforce phase timeboxes
 * - Persist timers for durability (survive restarts)
 * - Resume timers after service restart
 * - Fire actions when timers expire
 *
 * Spec: UNIFIED_IMPLEMENTATION_SPEC.md Section 3.5
 */
export class TimerService {
  private pool: Pool;
  private queue: JobQueue;
  private isRunning = false;
  private timerCheckInterval: NodeJS.Timeout | null = null;

  constructor(pool: Pool, queue: JobQueue) {
    this.pool = pool;
    this.queue = queue;
  }

  /**
   * Start timer service
   *
   * - Resume pending timers from database
   * - Start timer check loop
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('TimerService already running');
      return;
    }

    this.isRunning = true;

    logger.info('Starting TimerService');

    // Resume pending timers
    await this.resumeTimers();

    // Start timer check loop (every 10 seconds)
    this.timerCheckInterval = setInterval(async () => {
      try {
        await this.checkTimers();
      } catch (error) {
        logger.error({ error }, 'Timer check loop error');
      }
    }, 10000);

    logger.info('TimerService started');
  }

  /**
   * Stop timer service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping TimerService');

    this.isRunning = false;

    if (this.timerCheckInterval) {
      clearInterval(this.timerCheckInterval);
      this.timerCheckInterval = null;
    }

    logger.info('TimerService stopped');
  }

  /**
   * Schedule retry for task
   *
   * Implements exponential backoff: delay = base * 2^attempt
   *
   * @param task - Task to retry
   * @param attempt - Current retry attempt (0-indexed)
   * @param policy - Retry policy (optional, uses default if not provided)
   * @returns Timer ID
   */
  async scheduleRetry(
    task: TaskSpec,
    attempt: number,
    policy: RetryPolicy = DEFAULT_RETRY_POLICY
  ): Promise<string> {
    try {
      // Calculate delay with exponential backoff
      const delay = Math.min(policy.base * Math.pow(2, attempt), policy.maxMs);

      const fireAt = new Date(Date.now() + delay);

      logger.info(
        {
          taskId: task.id,
          attempt,
          delayMs: delay,
          fireAt,
        },
        'Scheduling task retry'
      );

      // Insert timer
      const result = await this.pool.query(
        `
        INSERT INTO timers (task_id, run_id, phase_id, fire_at, action, payload, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        `,
        [
          task.id,
          null, // run_id extracted from task if needed
          null, // phase_id extracted from task if needed
          fireAt,
          'retry',
          { task, attempt },
          'pending',
        ]
      );

      const timerId = result.rows[0].id;

      logger.debug({ timerId, taskId: task.id, delayMs: delay }, 'Retry timer scheduled');

      return timerId;
    } catch (error) {
      logger.error({ error, taskId: task.id, attempt }, 'Failed to schedule retry');
      throw error;
    }
  }

  /**
   * Schedule timeout for phase
   *
   * Enforces phase timebox by firing timeout action
   *
   * @param phaseId - Phase ID
   * @param timeboxMs - Timebox duration in milliseconds
   * @returns Timer ID
   */
  async scheduleTimeout(phaseId: string, timeboxMs: number): Promise<string> {
    try {
      const fireAt = new Date(Date.now() + timeboxMs);

      logger.info(
        {
          phaseId,
          timeboxMs,
          fireAt,
        },
        'Scheduling phase timeout'
      );

      // Insert timer
      const result = await this.pool.query(
        `
        INSERT INTO timers (phase_id, fire_at, action, payload, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        `,
        [phaseId, fireAt, 'timeout', { phaseId, timeboxMs }, 'pending']
      );

      const timerId = result.rows[0].id;

      logger.debug({ timerId, phaseId, timeboxMs }, 'Timeout timer scheduled');

      return timerId;
    } catch (error) {
      logger.error({ error, phaseId, timeboxMs }, 'Failed to schedule timeout');
      throw error;
    }
  }

  /**
   * Schedule custom timer
   *
   * @param fireAt - When to fire
   * @param action - Custom action name
   * @param payload - Action payload
   * @returns Timer ID
   */
  async scheduleTimer(
    fireAt: Date,
    action: TimerAction,
    payload: Record<string, any>
  ): Promise<string> {
    try {
      const result = await this.pool.query(
        `
        INSERT INTO timers (fire_at, action, payload, status)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [fireAt, action, payload, 'pending']
      );

      const timerId = result.rows[0].id;

      logger.debug({ timerId, fireAt, action }, 'Custom timer scheduled');

      return timerId;
    } catch (error) {
      logger.error({ error, fireAt, action }, 'Failed to schedule custom timer');
      throw error;
    }
  }

  /**
   * Cancel timer
   *
   * @param timerId - Timer ID
   */
  async cancelTimer(timerId: string): Promise<void> {
    try {
      await this.pool.query(
        `
        UPDATE timers
        SET status = 'cancelled'
        WHERE id = $1 AND status = 'pending'
        `,
        [timerId]
      );

      logger.debug({ timerId }, 'Timer cancelled');
    } catch (error) {
      logger.error({ error, timerId }, 'Failed to cancel timer');
      throw error;
    }
  }

  /**
   * Resume pending timers after restart
   *
   * Loads all pending timers and checks if any should fire immediately
   */
  private async resumeTimers(): Promise<void> {
    try {
      const result = await this.pool.query(`
        SELECT id, task_id, run_id, phase_id, fire_at, action, payload
        FROM timers
        WHERE status = 'pending'
        ORDER BY fire_at ASC
      `);

      const timers = result.rows;

      logger.info({ timerCount: timers.length }, 'Resuming pending timers');

      // Fire overdue timers immediately
      const now = Date.now();
      let firedCount = 0;

      for (const timer of timers) {
        const fireAt = new Date(timer.fire_at).getTime();

        if (fireAt <= now) {
          // Fire immediately
          await this.fireTimer(timer.id, timer.action, timer.payload);
          firedCount++;
        }
      }

      if (firedCount > 0) {
        logger.info({ firedCount }, 'Fired overdue timers on resume');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to resume timers');
      throw error;
    }
  }

  /**
   * Check for timers that should fire
   *
   * Called periodically by timer check loop
   */
  private async checkTimers(): Promise<void> {
    try {
      // Get timers that should fire now
      const result = await this.pool.query(`
        SELECT id, task_id, run_id, phase_id, fire_at, action, payload
        FROM timers
        WHERE status = 'pending'
        AND fire_at <= NOW()
        ORDER BY fire_at ASC
        LIMIT 100
      `);

      const timers = result.rows;

      if (timers.length === 0) {
        return;
      }

      logger.debug({ timerCount: timers.length }, 'Firing timers');

      // Fire timers
      for (const timer of timers) {
        try {
          await this.fireTimer(timer.id, timer.action, timer.payload);
        } catch (error) {
          logger.error({ error, timerId: timer.id }, 'Failed to fire timer');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to check timers');
    }
  }

  /**
   * Fire timer action
   *
   * @param timerId - Timer ID
   * @param action - Timer action
   * @param payload - Action payload
   */
  private async fireTimer(
    timerId: string,
    action: TimerAction,
    payload: Record<string, any>
  ): Promise<void> {
    try {
      logger.info({ timerId, action }, 'Firing timer');

      // Execute action
      switch (action) {
        case 'retry':
          await this.handleRetryAction(payload);
          break;

        case 'timeout':
          await this.handleTimeoutAction(payload);
          break;

        case 'cleanup':
          await this.handleCleanupAction(payload);
          break;

        case 'custom':
          logger.warn({ timerId, payload }, 'Custom timer action (no handler)');
          break;

        default:
          logger.warn({ timerId, action }, 'Unknown timer action');
      }

      // Mark timer as fired
      await this.pool.query(
        `
        UPDATE timers
        SET status = 'fired', fired_at = NOW()
        WHERE id = $1
        `,
        [timerId]
      );

      logger.debug({ timerId, action }, 'Timer fired successfully');
    } catch (error) {
      logger.error({ error, timerId, action }, 'Timer action failed');
      throw error;
    }
  }

  /**
   * Handle retry action
   *
   * Re-enqueues task to job queue
   */
  private async handleRetryAction(payload: Record<string, any>): Promise<void> {
    const { task, attempt } = payload;

    logger.info({ taskId: task.id, attempt }, 'Retrying task');

    // Re-enqueue task
    await this.queue.enqueue('tasks', { ...task, retries: attempt + 1 });
  }

  /**
   * Handle timeout action
   *
   * Emits timeout event for phase
   */
  private async handleTimeoutAction(payload: Record<string, any>): Promise<void> {
    const { phaseId } = payload;

    logger.warn({ phaseId }, 'Phase timeout reached');

    // Emit timeout event (handled by supervisor/orchestrator)
    await this.queue.enqueue('events', {
      type: 'phase.timeout',
      phaseId,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle cleanup action
   *
   * Performs cleanup tasks (e.g., delete old checkpoints)
   */
  private async handleCleanupAction(payload: Record<string, any>): Promise<void> {
    logger.info({ payload }, 'Executing cleanup action');

    // Cleanup logic here (could call CheckpointManager.cleanup(), etc.)
  }

  /**
   * Get timer statistics
   */
  async getStats(): Promise<{
    pending: number;
    fired: number;
    cancelled: number;
    nextFireAt?: Date;
  }> {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'fired') as fired,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
          MIN(fire_at) FILTER (WHERE status = 'pending') as next_fire_at
        FROM timers
      `);

      const row = result.rows[0];

      return {
        pending: parseInt(row.pending, 10),
        fired: parseInt(row.fired, 10),
        cancelled: parseInt(row.cancelled, 10),
        nextFireAt: row.next_fire_at ? new Date(row.next_fire_at) : undefined,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get timer stats');
      throw error;
    }
  }
}
