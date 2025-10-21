import pino from 'pino';
import { EventEmitter } from 'events';
import { PhaseCoordinator } from '../phase/phase-coordinator';
import { BudgetTracker } from '../budget/budget-tracker';
import { Unsticker } from '../unsticker/unsticker';
import { DAGExecutor } from '../dag/dag-executor';
import { PhaseContext } from '@ideamine/schemas';

const logger = pino({ name: 'run-manager' });

/**
 * Run configuration
 */
export interface RunConfig {
  runId: string;
  phases: string[]; // Ordered list of phases to execute
  initialContext: {
    idea: string;
    constraints?: Record<string, any>;
    requirements?: Record<string, any>;
  };
  budgets: {
    total_tokens: number;
    total_tools_minutes: number;
    total_wallclock_minutes: number;
  };
  options?: {
    auto_advance: boolean; // Automatically advance to next phase on success
    stop_on_gate_failure: boolean;
    enable_checkpoints: boolean;
    checkpoint_interval_phases: number;
  };
}

/**
 * Run status
 */
export interface RunStatus {
  runId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  currentPhase?: string;
  completedPhases: string[];
  failedPhases: string[];
  progress: {
    total_phases: number;
    completed_phases: number;
    percent: number;
  };
  budgets: {
    allocated: {
      tokens: number;
      tools_minutes: number;
      wallclock_minutes: number;
    };
    used: {
      tokens: number;
      tools_minutes: number;
      wallclock_ms: number;
      cost_usd: number;
    };
    remaining: {
      tokens: number;
      tools_minutes: number;
      wallclock_minutes: number;
    };
  };
  startedAt?: string;
  completedAt?: string;
  duration_ms?: number;
  artifacts: Array<{
    phase: string;
    artifact_id: string;
    artifact_type: string;
  }>;
  errors?: Array<{
    phase: string;
    message: string;
    timestamp: string;
  }>;
}

/**
 * Run result
 */
export interface RunResult {
  runId: string;
  success: boolean;
  status: RunStatus;
  finalArtifacts: Array<{
    id: string;
    type: string;
    phase: string;
    content?: any;
    path?: string;
  }>;
  dossier?: {
    version: string;
    artifacts: any[];
    completeness: number;
  };
}

/**
 * Run Manager
 *
 * Manages end-to-end run execution across all phases
 * Spec: orchestrator.txt:1-50
 */
export class RunManager extends EventEmitter {
  private runs: Map<string, RunStatus> = new Map();

  constructor(
    private db: any,
    private phaseCoordinator: PhaseCoordinator,
    private budgetTracker: BudgetTracker,
    private unsticker: Unsticker,
    private dagExecutor: DAGExecutor
  ) {
    super();
  }

  /**
   * Start a new run
   *
   * @param config - Run configuration
   * @returns Run result
   */
  async startRun(config: RunConfig): Promise<RunResult> {
    logger.info(
      {
        runId: config.runId,
        phases: config.phases,
      },
      'Starting new run'
    );

    // Create run record in database
    await this.db.query(
      `
      INSERT INTO runs (run_id, status, config, created_at)
      VALUES ($1, $2, $3, NOW())
    `,
      [config.runId, 'running', JSON.stringify(config)]
    );

    // Initialize run status
    const status: RunStatus = {
      runId: config.runId,
      status: 'running',
      completedPhases: [],
      failedPhases: [],
      progress: {
        total_phases: config.phases.length,
        completed_phases: 0,
        percent: 0,
      },
      budgets: {
        allocated: {
          tokens: config.budgets.total_tokens,
          tools_minutes: config.budgets.total_tools_minutes,
          wallclock_minutes: config.budgets.total_wallclock_minutes,
        },
        used: {
          tokens: 0,
          tools_minutes: 0,
          wallclock_ms: 0,
          cost_usd: 0,
        },
        remaining: {
          tokens: config.budgets.total_tokens,
          tools_minutes: config.budgets.total_tools_minutes,
          wallclock_minutes: config.budgets.total_wallclock_minutes,
        },
      },
      startedAt: new Date().toISOString(),
      artifacts: [],
    };

    this.runs.set(config.runId, status);

    // Set total budget
    this.budgetTracker.setBudget(`run:${config.runId}`, {
      tokens: config.budgets.total_tokens,
      tools_minutes: config.budgets.total_tools_minutes,
      wallclock_minutes: config.budgets.total_wallclock_minutes,
    });

    // Start tracking
    this.budgetTracker.startTracking(`run:${config.runId}`);

    // Emit run.started event
    this.emit('run.started', {
      runId: config.runId,
      phases: config.phases,
      timestamp: new Date().toISOString(),
    });

    try {
      // Execute phases sequentially
      let context: PhaseContext = {
        runId: config.runId,
        phase: config.phases[0],
        inputs: config.initialContext,
        budgets: {
          tokens: 0,
          tools_minutes: 0,
          wallclock_minutes: 0,
        },
        artifacts: [],
        kmap: {},
      };

      const allArtifacts: any[] = [];

      for (const phaseName of config.phases) {
        logger.info(
          {
            runId: config.runId,
            phase: phaseName,
            progress: `${status.completedPhases.length + 1}/${config.phases.length}`,
          },
          'Starting phase'
        );

        // Update status
        status.currentPhase = phaseName;
        this.emit('run.phase_started', {
          runId: config.runId,
          phase: phaseName,
          timestamp: new Date().toISOString(),
        });

        // Load phase configuration
        const phaseConfig = await this.phaseCoordinator.loadPhaseConfig(phaseName);

        // Update context for this phase
        context.phase = phaseName;
        context.budgets = phaseConfig.budgets;

        // Start unsticker monitoring
        this.unsticker.startMonitoring(config.runId, phaseName);

        try {
          // Execute phase
          const phaseResult = await this.phaseCoordinator.executePhase(
            config.runId,
            phaseConfig,
            context
          );

          // Stop monitoring
          this.unsticker.stopMonitoring(config.runId, phaseName);

          if (phaseResult.status === 'success') {
            // Phase succeeded
            status.completedPhases.push(phaseName);

            // Collect artifacts
            allArtifacts.push(...phaseResult.artifacts);
            status.artifacts.push(
              ...phaseResult.artifacts.map((a) => ({
                phase: phaseName,
                artifact_id: a.id,
                artifact_type: a.type,
              }))
            );

            // Update context with phase outputs
            context.artifacts = phaseResult.artifacts;

            // Update budget usage
            const runUsage = this.budgetTracker.getUsage(`run:${config.runId}`)!;
            status.budgets.used = {
              tokens: runUsage.tokens,
              tools_minutes: runUsage.tools_minutes,
              wallclock_ms: runUsage.wallclock_ms,
              cost_usd: this.budgetTracker.calculateCost(runUsage),
            };
            status.budgets.remaining = {
              tokens: Math.max(0, config.budgets.total_tokens - runUsage.tokens),
              tools_minutes: Math.max(
                0,
                config.budgets.total_tools_minutes - runUsage.tools_minutes
              ),
              wallclock_minutes: Math.max(
                0,
                config.budgets.total_wallclock_minutes - runUsage.wallclock_ms / 60000
              ),
            };

            // Update progress
            status.progress.completed_phases = status.completedPhases.length;
            status.progress.percent =
              (status.completedPhases.length / config.phases.length) * 100;

            this.emit('run.phase_completed', {
              runId: config.runId,
              phase: phaseName,
              status: 'success',
              artifacts: phaseResult.artifacts.length,
              timestamp: new Date().toISOString(),
            });

            logger.info(
              {
                runId: config.runId,
                phase: phaseName,
                artifacts: phaseResult.artifacts.length,
                gate_score: phaseResult.gate_score,
              },
              'Phase completed successfully'
            );

            // Checkpoint if enabled
            if (
              config.options?.enable_checkpoints &&
              status.completedPhases.length %
                (config.options.checkpoint_interval_phases || 3) ===
                0
            ) {
              await this.createCheckpoint(config.runId, status, context);
            }
          } else {
            // Phase failed
            status.failedPhases.push(phaseName);

            if (!status.errors) {
              status.errors = [];
            }
            status.errors.push(
              ...(phaseResult.errors || []).map((e) => ({
                phase: phaseName,
                message: e.message,
                timestamp: e.timestamp,
              }))
            );

            this.emit('run.phase_failed', {
              runId: config.runId,
              phase: phaseName,
              errors: phaseResult.errors,
              timestamp: new Date().toISOString(),
            });

            logger.error(
              {
                runId: config.runId,
                phase: phaseName,
                errors: phaseResult.errors,
              },
              'Phase failed'
            );

            // Stop if configured to stop on gate failure
            if (config.options?.stop_on_gate_failure) {
              throw new Error(`Phase ${phaseName} failed gate evaluation`);
            }
          }
        } catch (error: any) {
          this.unsticker.stopMonitoring(config.runId, phaseName);

          logger.error(
            {
              error,
              runId: config.runId,
              phase: phaseName,
            },
            'Phase execution error'
          );

          status.failedPhases.push(phaseName);
          if (!status.errors) {
            status.errors = [];
          }
          status.errors.push({
            phase: phaseName,
            message: error.message,
            timestamp: new Date().toISOString(),
          });

          this.emit('run.phase_error', {
            runId: config.runId,
            phase: phaseName,
            error: error.message,
            timestamp: new Date().toISOString(),
          });

          if (config.options?.stop_on_gate_failure) {
            throw error;
          }
        }
      }

      // Run completed
      this.budgetTracker.stopTracking(`run:${config.runId}`);

      status.status = status.failedPhases.length === 0 ? 'completed' : 'failed';
      status.completedAt = new Date().toISOString();
      status.duration_ms = Date.now() - new Date(status.startedAt!).getTime();

      // Update database
      await this.db.query(
        `UPDATE runs SET status = $1, completed_at = NOW(), result = $2 WHERE run_id = $3`,
        [status.status, JSON.stringify(status), config.runId]
      );

      this.emit('run.completed', {
        runId: config.runId,
        status: status.status,
        completed_phases: status.completedPhases.length,
        failed_phases: status.failedPhases.length,
        timestamp: new Date().toISOString(),
      });

      logger.info(
        {
          runId: config.runId,
          status: status.status,
          completed: status.completedPhases.length,
          failed: status.failedPhases.length,
          duration_ms: status.duration_ms,
        },
        'Run completed'
      );

      return {
        runId: config.runId,
        success: status.status === 'completed',
        status,
        finalArtifacts: allArtifacts,
      };
    } catch (error: any) {
      this.budgetTracker.stopTracking(`run:${config.runId}`);

      status.status = 'failed';
      status.completedAt = new Date().toISOString();
      status.duration_ms = Date.now() - new Date(status.startedAt!).getTime();

      if (!status.errors) {
        status.errors = [];
      }
      status.errors.push({
        phase: status.currentPhase || 'unknown',
        message: error.message,
        timestamp: new Date().toISOString(),
      });

      await this.db.query(
        `UPDATE runs SET status = $1, completed_at = NOW(), result = $2 WHERE run_id = $3`,
        ['failed', JSON.stringify(status), config.runId]
      );

      this.emit('run.failed', {
        runId: config.runId,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      logger.error(
        {
          error,
          runId: config.runId,
        },
        'Run failed'
      );

      return {
        runId: config.runId,
        success: false,
        status,
        finalArtifacts: [],
      };
    }
  }

  /**
   * Get run status
   */
  async getStatus(runId: string): Promise<RunStatus | null> {
    // Try memory first
    let status = this.runs.get(runId);
    if (status) {
      return status;
    }

    // Load from database
    const result = await this.db.query(
      `SELECT status, result FROM runs WHERE run_id = $1`,
      [runId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    status = result.rows[0].result
      ? JSON.parse(result.rows[0].result)
      : {
          runId,
          status: result.rows[0].status,
          completedPhases: [],
          failedPhases: [],
          progress: { total_phases: 0, completed_phases: 0, percent: 0 },
          budgets: {
            allocated: { tokens: 0, tools_minutes: 0, wallclock_minutes: 0 },
            used: { tokens: 0, tools_minutes: 0, wallclock_ms: 0, cost_usd: 0 },
            remaining: { tokens: 0, tools_minutes: 0, wallclock_minutes: 0 },
          },
          artifacts: [],
        };

    return status;
  }

  /**
   * Cancel a running run
   */
  async cancelRun(runId: string): Promise<void> {
    const status = await this.getStatus(runId);
    if (!status || status.status !== 'running') {
      throw new Error(`Run ${runId} is not running`);
    }

    logger.info({ runId }, 'Cancelling run');

    status.status = 'cancelled';
    status.completedAt = new Date().toISOString();
    status.duration_ms = Date.now() - new Date(status.startedAt!).getTime();

    // Update database
    await this.db.query(
      `UPDATE runs SET status = $1, completed_at = NOW(), result = $2 WHERE run_id = $3`,
      ['cancelled', JSON.stringify(status), runId]
    );

    // Stop budget tracking
    this.budgetTracker.stopTracking(`run:${runId}`);

    // Stop unsticker monitoring
    if (status.currentPhase) {
      this.unsticker.stopMonitoring(runId, status.currentPhase);
    }

    this.emit('run.cancelled', {
      runId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Pause a running run
   */
  async pauseRun(runId: string): Promise<void> {
    const status = await this.getStatus(runId);
    if (!status || status.status !== 'running') {
      throw new Error(`Run ${runId} is not running`);
    }

    logger.info({ runId }, 'Pausing run');

    status.status = 'paused';

    await this.db.query(
      `UPDATE runs SET status = $1, result = $2 WHERE run_id = $3`,
      ['paused', JSON.stringify(status), runId]
    );

    // Stop budget tracking temporarily
    this.budgetTracker.stopTracking(`run:${runId}`);

    this.emit('run.paused', {
      runId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Resume a paused run
   */
  async resumeRun(runId: string): Promise<void> {
    const status = await this.getStatus(runId);
    if (!status || status.status !== 'paused') {
      throw new Error(`Run ${runId} is not paused`);
    }

    logger.info({ runId }, 'Resuming run');

    status.status = 'running';

    await this.db.query(
      `UPDATE runs SET status = $1, result = $2 WHERE run_id = $3`,
      ['running', JSON.stringify(status), runId]
    );

    // Resume budget tracking
    this.budgetTracker.startTracking(`run:${runId}`);

    this.emit('run.resumed', {
      runId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Create checkpoint
   */
  private async createCheckpoint(
    runId: string,
    status: RunStatus,
    context: PhaseContext
  ): Promise<void> {
    logger.info({ runId, phase: context.phase }, 'Creating checkpoint');

    const checkpointId = `ckpt-${runId}-${Date.now()}`;

    await this.db.query(
      `
      INSERT INTO checkpoints (checkpoint_id, run_id, phase, status, context, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `,
      [
        checkpointId,
        runId,
        context.phase,
        JSON.stringify(status),
        JSON.stringify(context),
      ]
    );

    this.emit('checkpoint.created', {
      runId,
      checkpointId,
      phase: context.phase,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get all runs
   */
  async getAllRuns(
    filter?: {
      status?: RunStatus['status'];
      limit?: number;
    }
  ): Promise<RunStatus[]> {
    let query = `SELECT run_id, status, result FROM runs`;
    const params: any[] = [];

    if (filter?.status) {
      query += ` WHERE status = $1`;
      params.push(filter.status);
    }

    query += ` ORDER BY created_at DESC`;

    if (filter?.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(filter.limit);
    }

    const result = await this.db.query(query, params);

    return result.rows.map((row: any) =>
      row.result ? JSON.parse(row.result) : { runId: row.run_id, status: row.status }
    );
  }
}
