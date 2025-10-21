import pino from 'pino';
import { EventEmitter } from 'events';

const logger = pino({ name: 'unsticker' });

/**
 * Stall information
 */
export interface StallInfo {
  runId: string;
  phase: string;
  taskId?: string;
  stallDurationMs: number;
  lastProgressAt: string;
  suspectedCause: 'hung-agent' | 'resource-exhaustion' | 'external-dependency' | 'deadlock' | 'infinite-loop' | 'unknown';
  currentState: {
    activeTasks: string[];
    blockedTasks: string[];
    resourceUsage?: {
      cpuPercent: number;
      memoryMb: number;
    };
  };
}

/**
 * Unstick action
 */
export interface UnstickAction {
  action: 'kill-task' | 'restart-agent' | 'increase-timeout' | 'skip-task' | 'manual-intervention';
  reason: string;
  targetTask?: string;
  parameters?: Record<string, any>;
}

/**
 * Unsticker
 *
 * Detects stalls and applies recovery strategies
 * Spec: orchestrator.txt:142-151
 */
export class Unsticker extends EventEmitter {
  private stallThresholdMs: number;
  private checkIntervalMs: number;
  private monitoringTasks: Map<string, NodeJS.Timeout> = new Map();
  private lastProgress: Map<string, number> = new Map();
  private stallHistory: Map<string, number> = new Map();

  constructor(
    private db: any,
    stallThresholdMs: number = 300000, // 5 minutes
    checkIntervalMs: number = 60000 // 1 minute
  ) {
    super();
    this.stallThresholdMs = stallThresholdMs;
    this.checkIntervalMs = checkIntervalMs;
  }

  /**
   * Start monitoring a task for stalls
   *
   * @param runId - Run identifier
   * @param phase - Phase name
   * @param taskId - Task identifier
   */
  startMonitoring(runId: string, phase: string, taskId?: string): void {
    const key = this.getKey(runId, phase, taskId);

    // Record initial progress
    this.lastProgress.set(key, Date.now());

    // Set up periodic stall check
    const interval = setInterval(() => {
      this.checkForStall(runId, phase, taskId);
    }, this.checkIntervalMs);

    this.monitoringTasks.set(key, interval);

    logger.debug({ runId, phase, taskId }, 'Started stall monitoring');
  }

  /**
   * Stop monitoring a task
   */
  stopMonitoring(runId: string, phase: string, taskId?: string): void {
    const key = this.getKey(runId, phase, taskId);

    const interval = this.monitoringTasks.get(key);
    if (interval) {
      clearInterval(interval);
      this.monitoringTasks.delete(key);
    }

    this.lastProgress.delete(key);

    logger.debug({ runId, phase, taskId }, 'Stopped stall monitoring');
  }

  /**
   * Record progress (resets stall timer)
   */
  recordProgress(runId: string, phase: string, taskId?: string): void {
    const key = this.getKey(runId, phase, taskId);
    this.lastProgress.set(key, Date.now());

    logger.debug({ runId, phase, taskId }, 'Progress recorded');
  }

  /**
   * Check for stall
   */
  private async checkForStall(
    runId: string,
    phase: string,
    taskId?: string
  ): Promise<void> {
    const key = this.getKey(runId, phase, taskId);
    const lastProgressTime = this.lastProgress.get(key);

    if (!lastProgressTime) {
      return;
    }

    const stallDuration = Date.now() - lastProgressTime;

    if (stallDuration >= this.stallThresholdMs) {
      logger.warn(
        {
          runId,
          phase,
          taskId,
          stallDurationMs: stallDuration,
        },
        'Stall detected'
      );

      // Gather stall information
      const stallInfo = await this.gatherStallInfo(
        runId,
        phase,
        taskId,
        stallDuration,
        lastProgressTime
      );

      // Emit stall event
      this.emit('stall.detected', stallInfo);

      // Determine and apply unstick action
      const action = this.determineUnstickAction(stallInfo);

      logger.info(
        {
          runId,
          phase,
          taskId,
          action: action.action,
          reason: action.reason,
        },
        'Applying unstick action'
      );

      try {
        await this.applyUnstickAction(stallInfo, action);

        // Reset progress timer after successful unstick
        this.recordProgress(runId, phase, taskId);

        this.emit('stall.resolved', {
          ...stallInfo,
          action,
          resolvedAt: new Date().toISOString(),
        });
      } catch (error: any) {
        logger.error(
          {
            error,
            runId,
            phase,
            taskId,
          },
          'Failed to apply unstick action'
        );

        this.emit('stall.failed', {
          ...stallInfo,
          action,
          error: error.message,
        });
      }
    }
  }

  /**
   * Gather information about the stall
   */
  private async gatherStallInfo(
    runId: string,
    phase: string,
    taskId: string | undefined,
    stallDuration: number,
    lastProgressTime: number
  ): Promise<StallInfo> {
    // Query database for current state
    const result = await this.db.query(
      `
      SELECT task_id, status, worker_id
      FROM tasks
      WHERE run_id = $1 AND phase = $2
      ORDER BY created_at DESC
    `,
      [runId, phase]
    );

    const activeTasks = result.rows
      .filter((r: any) => r.status === 'running')
      .map((r: any) => r.task_id);

    const blockedTasks = result.rows
      .filter((r: any) => r.status === 'blocked')
      .map((r: any) => r.task_id);

    // Determine suspected cause
    const suspectedCause = this.diagnoseCause(
      stallDuration,
      activeTasks,
      blockedTasks
    );

    return {
      runId,
      phase,
      taskId,
      stallDurationMs: stallDuration,
      lastProgressAt: new Date(lastProgressTime).toISOString(),
      suspectedCause,
      currentState: {
        activeTasks,
        blockedTasks,
        resourceUsage: {
          cpuPercent: 0, // Would get from system metrics
          memoryMb: 0,
        },
      },
    };
  }

  /**
   * Diagnose suspected cause of stall
   */
  private diagnoseCause(
    stallDuration: number,
    activeTasks: string[],
    blockedTasks: string[]
  ): StallInfo['suspectedCause'] {
    // Heuristics for cause diagnosis

    // No active tasks but has blocked tasks = deadlock
    if (activeTasks.length === 0 && blockedTasks.length > 0) {
      return 'deadlock';
    }

    // Very long stall with active tasks = hung agent
    if (stallDuration > this.stallThresholdMs * 3) {
      return 'hung-agent';
    }

    // Multiple active tasks not progressing = resource exhaustion
    if (activeTasks.length > 3) {
      return 'resource-exhaustion';
    }

    return 'unknown';
  }

  /**
   * Determine unstick action based on stall info
   */
  private determineUnstickAction(stallInfo: StallInfo): UnstickAction {
    // Track stall history for this run/phase
    const key = this.getKey(stallInfo.runId, stallInfo.phase, stallInfo.taskId);
    const stallCount = (this.stallHistory.get(key) || 0) + 1;
    this.stallHistory.set(key, stallCount);

    // Strategy selection based on cause and history

    switch (stallInfo.suspectedCause) {
      case 'hung-agent':
        // Kill the hung task and restart
        return {
          action: 'kill-task',
          reason: 'Agent appears hung, killing and restarting',
          targetTask: stallInfo.taskId,
        };

      case 'deadlock':
        // Skip one of the blocked tasks to break deadlock
        const targetTask = stallInfo.currentState.blockedTasks[0];
        return {
          action: 'skip-task',
          reason: 'Deadlock detected, skipping blocked task',
          targetTask,
        };

      case 'resource-exhaustion':
        // Reduce concurrent tasks
        return {
          action: 'restart-agent',
          reason: 'Resource exhaustion suspected, restarting with lower concurrency',
          parameters: {
            maxConcurrency: 2,
          },
        };

      case 'external-dependency':
        // Increase timeout for external calls
        return {
          action: 'increase-timeout',
          reason: 'External dependency may be slow',
          parameters: {
            timeoutMs: this.stallThresholdMs * 2,
          },
        };

      default:
        // After multiple stalls, escalate to manual intervention
        if (stallCount >= 3) {
          return {
            action: 'manual-intervention',
            reason: `Multiple stalls (${stallCount}) without resolution`,
          };
        }

        // First stall - try restarting
        return {
          action: 'restart-agent',
          reason: 'Unknown cause, attempting restart',
        };
    }
  }

  /**
   * Apply unstick action
   */
  private async applyUnstickAction(
    stallInfo: StallInfo,
    action: UnstickAction
  ): Promise<void> {
    logger.info(
      {
        action: action.action,
        runId: stallInfo.runId,
        phase: stallInfo.phase,
      },
      'Applying unstick action'
    );

    switch (action.action) {
      case 'kill-task':
        await this.killTask(stallInfo, action);
        break;

      case 'restart-agent':
        await this.restartAgent(stallInfo, action);
        break;

      case 'increase-timeout':
        await this.increaseTimeout(stallInfo, action);
        break;

      case 'skip-task':
        await this.skipTask(stallInfo, action);
        break;

      case 'manual-intervention':
        await this.requestManualIntervention(stallInfo, action);
        break;

      default:
        logger.warn({ action: action.action }, 'Unknown unstick action');
    }
  }

  /**
   * Kill a hung task
   */
  private async killTask(
    stallInfo: StallInfo,
    action: UnstickAction
  ): Promise<void> {
    if (!action.targetTask) {
      throw new Error('No target task specified for kill action');
    }

    await this.db.query(
      `UPDATE tasks SET status = 'killed', ended_at = NOW() WHERE task_id = $1`,
      [action.targetTask]
    );

    logger.info({ taskId: action.targetTask }, 'Task killed');
  }

  /**
   * Restart agent with new parameters
   */
  private async restartAgent(
    stallInfo: StallInfo,
    action: UnstickAction
  ): Promise<void> {
    // In production, would send restart signal to worker
    logger.info(
      {
        runId: stallInfo.runId,
        phase: stallInfo.phase,
        parameters: action.parameters,
      },
      'Agent restart requested'
    );
  }

  /**
   * Increase timeout
   */
  private async increaseTimeout(
    stallInfo: StallInfo,
    action: UnstickAction
  ): Promise<void> {
    const newTimeout = action.parameters?.timeoutMs || this.stallThresholdMs * 2;

    logger.info(
      {
        runId: stallInfo.runId,
        phase: stallInfo.phase,
        newTimeoutMs: newTimeout,
      },
      'Timeout increased'
    );

    // Update stall threshold for this specific run/phase
    // In production, would update task configuration
  }

  /**
   * Skip a blocked task
   */
  private async skipTask(
    stallInfo: StallInfo,
    action: UnstickAction
  ): Promise<void> {
    if (!action.targetTask) {
      throw new Error('No target task specified for skip action');
    }

    await this.db.query(
      `UPDATE tasks SET status = 'skipped', ended_at = NOW() WHERE task_id = $1`,
      [action.targetTask]
    );

    logger.info({ taskId: action.targetTask }, 'Task skipped');
  }

  /**
   * Request manual intervention
   */
  private async requestManualIntervention(
    stallInfo: StallInfo,
    action: UnstickAction
  ): Promise<void> {
    await this.db.query(
      `
      INSERT INTO manual_interventions (run_id, phase, task_id, reason, requested_at)
      VALUES ($1, $2, $3, $4, NOW())
    `,
      [stallInfo.runId, stallInfo.phase, stallInfo.taskId, action.reason]
    );

    logger.warn(
      {
        runId: stallInfo.runId,
        phase: stallInfo.phase,
        reason: action.reason,
      },
      'Manual intervention requested'
    );

    // In production, would send notification to operators
  }

  /**
   * Get monitoring key
   */
  private getKey(runId: string, phase: string, taskId?: string): string {
    return taskId ? `${runId}:${phase}:${taskId}` : `${runId}:${phase}`;
  }

  /**
   * Get stall statistics
   */
  getStats(): {
    monitored_count: number;
    stall_history_count: number;
    total_stalls: number;
  } {
    const totalStalls = Array.from(this.stallHistory.values()).reduce(
      (sum, count) => sum + count,
      0
    );

    return {
      monitored_count: this.monitoringTasks.size,
      stall_history_count: this.stallHistory.size,
      total_stalls: totalStalls,
    };
  }

  /**
   * Clear stall history
   */
  clearHistory(runId?: string): void {
    if (runId) {
      // Clear only for specific run
      for (const key of this.stallHistory.keys()) {
        if (key.startsWith(runId)) {
          this.stallHistory.delete(key);
        }
      }
    } else {
      // Clear all
      this.stallHistory.clear();
    }
  }

  /**
   * Shutdown unsticker
   */
  shutdown(): void {
    for (const interval of this.monitoringTasks.values()) {
      clearInterval(interval);
    }
    this.monitoringTasks.clear();
    this.lastProgress.clear();

    logger.info('Unsticker shutdown complete');
  }
}
