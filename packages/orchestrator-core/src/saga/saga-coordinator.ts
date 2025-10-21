/**
 * Saga Coordinator - Distributed Transactions with Compensation
 *
 * Spec: orchestrator.txt:7 (Sagas & Compensation)
 *
 * "If a downstream gate fails, run compensating actions
 * (revert migrations, roll back flags)"
 *
 * **Pattern:**
 * 1. Execute steps sequentially
 * 2. Track each completed step
 * 3. On failure, execute compensating actions in reverse order
 * 4. Guarantee eventual consistency
 *
 * **Use Cases:**
 * - Gate failure after artifacts created → delete artifacts
 * - Database migrations applied → rollback migrations
 * - Feature flags enabled → disable flags
 * - External API calls made → send cancellation requests
 * - Files written → delete files
 */

import pino from 'pino';
import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { Recorder } from '../recorder/recorder';

const logger = pino({ name: 'saga-coordinator' });

/**
 * Saga step definition
 */
export interface SagaStep {
  id: string;
  name: string;
  description: string;
  action: () => Promise<any>; // Forward action
  compensation: () => Promise<void>; // Rollback action
  timeout?: number; // Step timeout in ms
  retryable?: boolean; // Can this step be retried on failure
  critical?: boolean; // If true, saga fails immediately on step failure
}

/**
 * Saga step execution result
 */
interface StepResult {
  stepId: string;
  status: 'success' | 'failed' | 'compensated' | 'compensation_failed';
  result?: any;
  error?: string;
  executedAt: Date;
  compensatedAt?: Date;
  durationMs: number;
}

/**
 * Saga execution status
 */
export enum SagaStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  COMPENSATING = 'compensating',
  COMPENSATED = 'compensated',
  COMPENSATION_FAILED = 'compensation_failed',
}

/**
 * Saga definition
 */
export interface Saga {
  id: string;
  runId: string;
  phase: string;
  steps: SagaStep[];
  status: SagaStatus;
  startedAt?: Date;
  completedAt?: Date;
  stepResults: StepResult[];
  metadata?: Record<string, any>;
}

/**
 * Saga Coordinator
 *
 * Manages distributed transactions with compensating actions.
 * Ensures eventual consistency by rolling back completed steps
 * when downstream steps fail (e.g., gate failures).
 */
export class SagaCoordinator extends EventEmitter {
  private activeSagas: Map<string, Saga> = new Map();

  constructor(
    private db: Pool,
    private recorder: Recorder
  ) {
    super();
  }

  /**
   * Execute a saga
   *
   * @param saga - Saga definition
   * @returns Final saga state
   */
  async execute(saga: Saga): Promise<Saga> {
    const startTime = Date.now();

    logger.info(
      {
        sagaId: saga.id,
        runId: saga.runId,
        phase: saga.phase,
        steps: saga.steps.length,
      },
      'Starting saga execution'
    );

    // Mark saga as running
    saga.status = SagaStatus.RUNNING;
    saga.startedAt = new Date();
    this.activeSagas.set(saga.id, saga);

    // Persist saga to database
    await this.persistSaga(saga);

    this.emit('saga.started', {
      sagaId: saga.id,
      runId: saga.runId,
      phase: saga.phase,
    });

    try {
      // Execute steps sequentially
      for (const step of saga.steps) {
        logger.debug({ stepId: step.id, stepName: step.name }, 'Executing saga step');

        const stepStartTime = Date.now();

        try {
          // Execute step action with timeout
          const result = await this.executeWithTimeout(
            step.action,
            step.timeout || 300000 // Default 5 minute timeout
          );

          const stepDuration = Date.now() - stepStartTime;

          // Record successful step
          const stepResult: StepResult = {
            stepId: step.id,
            status: 'success',
            result,
            executedAt: new Date(),
            durationMs: stepDuration,
          };

          saga.stepResults.push(stepResult);

          // Update saga in database
          await this.updateSagaStep(saga.id, stepResult);

          this.emit('saga.step.success', {
            sagaId: saga.id,
            stepId: step.id,
            result,
          });

          logger.debug(
            { stepId: step.id, durationMs: stepDuration },
            'Saga step completed successfully'
          );
        } catch (error: any) {
          const stepDuration = Date.now() - stepStartTime;

          logger.error(
            {
              error,
              stepId: step.id,
              stepName: step.name,
            },
            'Saga step failed'
          );

          // Record failed step
          const stepResult: StepResult = {
            stepId: step.id,
            status: 'failed',
            error: error.message,
            executedAt: new Date(),
            durationMs: stepDuration,
          };

          saga.stepResults.push(stepResult);

          this.emit('saga.step.failed', {
            sagaId: saga.id,
            stepId: step.id,
            error: error.message,
          });

          // Critical step failure → abort immediately
          if (step.critical) {
            throw new Error(
              `Critical saga step failed: ${step.name} - ${error.message}`
            );
          }

          // Retry if step is retryable
          if (step.retryable) {
            logger.info({ stepId: step.id }, 'Retrying failed step');

            try {
              const retryResult = await step.action();
              stepResult.status = 'success';
              stepResult.result = retryResult;

              saga.stepResults[saga.stepResults.length - 1] = stepResult;
              await this.updateSagaStep(saga.id, stepResult);

              logger.info({ stepId: step.id }, 'Step retry succeeded');
              continue;
            } catch (retryError: any) {
              logger.error({ retryError, stepId: step.id }, 'Step retry failed');
              throw new Error(
                `Saga step failed after retry: ${step.name} - ${retryError.message}`
              );
            }
          }

          // Non-retryable step failed → trigger compensation
          throw new Error(`Saga step failed: ${step.name} - ${error.message}`);
        }
      }

      // All steps completed successfully
      saga.status = SagaStatus.COMPLETED;
      saga.completedAt = new Date();

      await this.updateSagaStatus(saga.id, SagaStatus.COMPLETED);

      this.emit('saga.completed', {
        sagaId: saga.id,
        runId: saga.runId,
        phase: saga.phase,
        durationMs: Date.now() - startTime,
      });

      // Record saga completion
      await this.recorder.recordStep({
        runId: saga.runId,
        phase: saga.phase,
        step: 'saga.completed',
        actor: 'SagaCoordinator',
        outputs: saga.stepResults.map((r) => r.stepId),
        cost: { usd: 0, tokens: 0 },
        latency_ms: Date.now() - startTime,
        status: 'succeeded',
        metadata: {
          sagaId: saga.id,
          stepsCompleted: saga.steps.length,
        },
      });

      logger.info(
        {
          sagaId: saga.id,
          durationMs: Date.now() - startTime,
        },
        'Saga completed successfully'
      );

      this.activeSagas.delete(saga.id);

      return saga;
    } catch (error: any) {
      logger.error(
        {
          error,
          sagaId: saga.id,
          completedSteps: saga.stepResults.filter((r) => r.status === 'success').length,
        },
        'Saga failed, triggering compensation'
      );

      // Trigger compensation (rollback)
      saga.status = SagaStatus.COMPENSATING;
      await this.updateSagaStatus(saga.id, SagaStatus.COMPENSATING);

      this.emit('saga.compensating', {
        sagaId: saga.id,
        runId: saga.runId,
        error: error.message,
      });

      try {
        await this.compensate(saga);

        saga.status = SagaStatus.COMPENSATED;
        saga.completedAt = new Date();

        await this.updateSagaStatus(saga.id, SagaStatus.COMPENSATED);

        this.emit('saga.compensated', {
          sagaId: saga.id,
          runId: saga.runId,
        });

        // Record saga compensation
        await this.recorder.recordStep({
          runId: saga.runId,
          phase: saga.phase,
          step: 'saga.compensated',
          actor: 'SagaCoordinator',
          cost: { usd: 0, tokens: 0 },
          latency_ms: Date.now() - startTime,
          status: 'succeeded',
          metadata: {
            sagaId: saga.id,
            error: error.message,
            compensatedSteps: saga.stepResults.filter((r) => r.status === 'compensated').length,
          },
        });

        logger.info(
          {
            sagaId: saga.id,
            compensatedSteps: saga.stepResults.filter((r) => r.status === 'compensated').length,
          },
          'Saga compensated successfully'
        );
      } catch (compensationError: any) {
        logger.error(
          {
            error: compensationError,
            sagaId: saga.id,
          },
          'Saga compensation failed'
        );

        saga.status = SagaStatus.COMPENSATION_FAILED;
        await this.updateSagaStatus(saga.id, SagaStatus.COMPENSATION_FAILED);

        this.emit('saga.compensation_failed', {
          sagaId: saga.id,
          runId: saga.runId,
          error: compensationError.message,
        });

        // Record compensation failure
        await this.recorder.recordStep({
          runId: saga.runId,
          phase: saga.phase,
          step: 'saga.compensation_failed',
          actor: 'SagaCoordinator',
          cost: { usd: 0, tokens: 0 },
          latency_ms: Date.now() - startTime,
          status: 'failed',
          metadata: {
            sagaId: saga.id,
            error: error.message,
            compensationError: compensationError.message,
          },
        });
      }

      this.activeSagas.delete(saga.id);

      return saga;
    }
  }

  /**
   * Compensate (rollback) a saga
   *
   * Execute compensating actions in reverse order for all completed steps
   */
  private async compensate(saga: Saga): Promise<void> {
    logger.info({ sagaId: saga.id }, 'Starting saga compensation');

    // Get successfully completed steps
    const completedSteps = saga.stepResults
      .filter((r) => r.status === 'success')
      .map((r) => r.stepId);

    // Find corresponding saga steps
    const stepsToCompensate = saga.steps
      .filter((step) => completedSteps.includes(step.id))
      .reverse(); // Compensate in reverse order

    logger.debug(
      {
        sagaId: saga.id,
        stepsToCompensate: stepsToCompensate.length,
      },
      'Compensating steps'
    );

    // Execute compensation actions
    for (const step of stepsToCompensate) {
      logger.debug({ stepId: step.id, stepName: step.name }, 'Compensating step');

      const compensationStartTime = Date.now();

      try {
        await this.executeWithTimeout(
          step.compensation,
          step.timeout || 300000
        );

        const compensationDuration = Date.now() - compensationStartTime;

        // Update step result
        const stepResult = saga.stepResults.find((r) => r.stepId === step.id);
        if (stepResult) {
          stepResult.status = 'compensated';
          stepResult.compensatedAt = new Date();
        }

        await this.updateSagaStep(saga.id, stepResult!);

        this.emit('saga.step.compensated', {
          sagaId: saga.id,
          stepId: step.id,
        });

        logger.debug(
          { stepId: step.id, durationMs: compensationDuration },
          'Step compensated successfully'
        );
      } catch (error: any) {
        logger.error(
          {
            error,
            stepId: step.id,
            stepName: step.name,
          },
          'Step compensation failed'
        );

        // Update step result
        const stepResult = saga.stepResults.find((r) => r.stepId === step.id);
        if (stepResult) {
          stepResult.status = 'compensation_failed';
          stepResult.error = `Compensation failed: ${error.message}`;
        }

        await this.updateSagaStep(saga.id, stepResult!);

        this.emit('saga.step.compensation_failed', {
          sagaId: saga.id,
          stepId: step.id,
          error: error.message,
        });

        throw new Error(
          `Compensation failed for step ${step.name}: ${error.message}`
        );
      }
    }

    logger.info(
      {
        sagaId: saga.id,
        compensatedSteps: stepsToCompensate.length,
      },
      'Saga compensation completed'
    );
  }

  /**
   * Create a saga for gate failure compensation
   *
   * When a gate fails, this saga rolls back artifacts and state changes
   */
  createGateFailureCompensationSaga(
    runId: string,
    phase: string,
    artifactsCreated: string[],
    migrationsApplied: string[],
    flagsEnabled: string[]
  ): Saga {
    const sagaId = `saga-gate-failure-${runId}-${phase}-${Date.now()}`;

    const steps: SagaStep[] = [];

    // Step 1: Delete created artifacts
    if (artifactsCreated.length > 0) {
      steps.push({
        id: 'delete-artifacts',
        name: 'Delete Artifacts',
        description: `Delete ${artifactsCreated.length} artifacts`,
        action: async () => {
          // In compensation saga, forward action is a no-op
          return { artifacts: artifactsCreated };
        },
        compensation: async () => {
          await this.db.query(
            `DELETE FROM artifacts WHERE run_id = $1 AND phase = $2 AND artifact_id = ANY($3)`,
            [runId, phase, artifactsCreated]
          );

          logger.debug(
            { artifacts: artifactsCreated.length },
            'Artifacts deleted'
          );
        },
        retryable: true,
      });
    }

    // Step 2: Rollback database migrations
    if (migrationsApplied.length > 0) {
      steps.push({
        id: 'rollback-migrations',
        name: 'Rollback Migrations',
        description: `Rollback ${migrationsApplied.length} migrations`,
        action: async () => {
          return { migrations: migrationsApplied };
        },
        compensation: async () => {
          for (const migration of migrationsApplied.reverse()) {
            await this.db.query(
              `DELETE FROM schema_migrations WHERE version = $1`,
              [migration]
            );

            // Execute rollback SQL (in production, would load from migration files)
            logger.debug({ migration }, 'Migration rolled back');
          }
        },
        retryable: true,
      });
    }

    // Step 3: Disable feature flags
    if (flagsEnabled.length > 0) {
      steps.push({
        id: 'disable-flags',
        name: 'Disable Feature Flags',
        description: `Disable ${flagsEnabled.length} feature flags`,
        action: async () => {
          return { flags: flagsEnabled };
        },
        compensation: async () => {
          await this.db.query(
            `UPDATE feature_flags SET enabled = false WHERE run_id = $1 AND flag_name = ANY($2)`,
            [runId, flagsEnabled]
          );

          logger.debug({ flags: flagsEnabled.length }, 'Feature flags disabled');
        },
        retryable: true,
      });
    }

    // Step 4: Mark phase as failed
    steps.push({
      id: 'mark-phase-failed',
      name: 'Mark Phase Failed',
      description: 'Update phase status to failed',
      action: async () => {
        return {};
      },
      compensation: async () => {
        await this.db.query(
          `UPDATE phases SET status = 'failed', failed_at = NOW() WHERE run_id = $1 AND phase_id = $2`,
          [runId, phase]
        );

        logger.debug({ phase }, 'Phase marked as failed');
      },
      retryable: true,
      critical: true,
    });

    return {
      id: sagaId,
      runId,
      phase,
      steps,
      status: SagaStatus.PENDING,
      stepResults: [],
      metadata: {
        type: 'gate_failure_compensation',
        artifactsCreated: artifactsCreated.length,
        migrationsApplied: migrationsApplied.length,
        flagsEnabled: flagsEnabled.length,
      },
    };
  }

  /**
   * Execute action with timeout
   */
  private executeWithTimeout<T>(
    action: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      action(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Step timeout')), timeoutMs)
      ),
    ]);
  }

  /**
   * Persist saga to database
   */
  private async persistSaga(saga: Saga): Promise<void> {
    await this.db.query(
      `
      INSERT INTO sagas (
        saga_id, run_id, phase, status, steps, step_results, metadata, started_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (saga_id) DO UPDATE SET
        status = EXCLUDED.status,
        step_results = EXCLUDED.step_results,
        updated_at = NOW()
    `,
      [
        saga.id,
        saga.runId,
        saga.phase,
        saga.status,
        JSON.stringify(saga.steps.map((s) => ({ id: s.id, name: s.name, description: s.description }))),
        JSON.stringify(saga.stepResults),
        JSON.stringify(saga.metadata || {}),
        saga.startedAt,
      ]
    );
  }

  /**
   * Update saga status
   */
  private async updateSagaStatus(sagaId: string, status: SagaStatus): Promise<void> {
    await this.db.query(
      `UPDATE sagas SET status = $1, updated_at = NOW() WHERE saga_id = $2`,
      [status, sagaId]
    );
  }

  /**
   * Update saga step result
   */
  private async updateSagaStep(sagaId: string, stepResult: StepResult): Promise<void> {
    const saga = this.activeSagas.get(sagaId);
    if (!saga) return;

    await this.db.query(
      `UPDATE sagas SET step_results = $1, updated_at = NOW() WHERE saga_id = $2`,
      [JSON.stringify(saga.stepResults), sagaId]
    );
  }

  /**
   * Get saga by ID
   */
  async getSaga(sagaId: string): Promise<Saga | null> {
    // Check active sagas first
    const activeSaga = this.activeSagas.get(sagaId);
    if (activeSaga) {
      return activeSaga;
    }

    // Query database
    const result = await this.db.query(
      `SELECT * FROM sagas WHERE saga_id = $1`,
      [sagaId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.saga_id,
      runId: row.run_id,
      phase: row.phase,
      steps: [], // Steps not stored in DB (only metadata)
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      stepResults: row.step_results,
      metadata: row.metadata,
    };
  }

  /**
   * Get all sagas for a run
   */
  async getSagasForRun(runId: string): Promise<Saga[]> {
    const result = await this.db.query(
      `SELECT * FROM sagas WHERE run_id = $1 ORDER BY started_at DESC`,
      [runId]
    );

    return result.rows.map((row) => ({
      id: row.saga_id,
      runId: row.run_id,
      phase: row.phase,
      steps: [],
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      stepResults: row.step_results,
      metadata: row.metadata,
    }));
  }

  /**
   * Get saga statistics
   */
  async getStats(runId?: string): Promise<{
    total_sagas: number;
    completed: number;
    compensated: number;
    failed: number;
    active: number;
  }> {
    const whereClause = runId ? 'WHERE run_id = $1' : '';
    const params = runId ? [runId] : [];

    const result = await this.db.query(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'compensated' THEN 1 ELSE 0 END) as compensated,
        SUM(CASE WHEN status = 'failed' OR status = 'compensation_failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'running' OR status = 'compensating' THEN 1 ELSE 0 END) as active
      FROM sagas
      ${whereClause}
    `,
      params
    );

    const row = result.rows[0];

    return {
      total_sagas: parseInt(row.total, 10),
      completed: parseInt(row.completed, 10),
      compensated: parseInt(row.compensated, 10),
      failed: parseInt(row.failed, 10),
      active: parseInt(row.active, 10),
    };
  }
}
