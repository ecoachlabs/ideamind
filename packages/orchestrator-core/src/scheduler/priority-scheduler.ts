/**
 * Priority Scheduler
 *
 * Implements P0-P3 priority classes with resource-based preemption.
 * Handles resource contention by intelligently preempting lower-priority tasks.
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import pino from 'pino';
import {
  PriorityClass,
  PreemptionReason,
  ResourceType,
  PreemptionConfig,
  TaskPriority,
  PreemptionEvent,
  PreemptionCandidate,
  PriorityAssignment,
  PreemptionPolicy,
  PriorityStats,
  ResourceUtilization,
  DEFAULT_PREEMPTION_CONFIG,
  DEFAULT_PREEMPTION_POLICY,
  getPriorityValue,
  isPreemptible,
  hasHigherPriority,
} from './priority-types';

const logger = pino({ name: 'priority-scheduler' });

export class PriorityScheduler extends EventEmitter {
  private config: PreemptionConfig;
  private policy: PreemptionPolicy;
  private taskPriorities: Map<string, TaskPriority> = new Map();
  private preemptionCounts: Map<string, number> = new Map();
  private monitoringInterval?: NodeJS.Timeout;

  constructor(
    private pool: Pool,
    config: Partial<PreemptionConfig> = {},
    policy?: PreemptionPolicy
  ) {
    super();
    this.config = { ...DEFAULT_PREEMPTION_CONFIG, ...config };
    this.policy = policy || DEFAULT_PREEMPTION_POLICY;
  }

  /**
   * Assign priority to a task
   */
  async assignPriority(assignment: PriorityAssignment): Promise<void> {
    logger.info({ assignment }, 'Assigning priority to task');

    // Check if task already has priority
    const existing = this.taskPriorities.get(assignment.taskId);
    if (existing && !assignment.overridable) {
      throw new Error(`Task ${assignment.taskId} already has priority ${existing.priorityClass}`);
    }

    const taskPriority: TaskPriority = {
      taskId: assignment.taskId,
      priorityClass: assignment.priorityClass,
      assignedAt: new Date(),
      assignedReason: assignment.reason,
      preemptible: isPreemptible(assignment.priorityClass),
    };

    this.taskPriorities.set(assignment.taskId, taskPriority);

    // Update database
    await this.pool.query(
      `UPDATE tasks
       SET priority_class = $1
       WHERE id = $2`,
      [assignment.priorityClass, assignment.taskId]
    );

    this.emit('priority-assigned', taskPriority);

    logger.info({ taskId: assignment.taskId, priorityClass: assignment.priorityClass }, 'Priority assigned');
  }

  /**
   * Preempt a task
   */
  async preemptTask(taskId: string, reason: PreemptionReason, resource?: ResourceType): Promise<void> {
    logger.info({ taskId, reason, resource }, 'Preempting task');

    const taskPriority = this.taskPriorities.get(taskId);
    if (!taskPriority) {
      throw new Error(`Task ${taskId} has no priority assignment`);
    }

    if (!taskPriority.preemptible) {
      logger.warn({ taskId, priorityClass: taskPriority.priorityClass }, 'Attempted to preempt non-preemptible task');
      return;
    }

    // Check preemption count
    const preemptionCount = this.preemptionCounts.get(taskId) || 0;
    if (preemptionCount >= this.config.maxPreemptions) {
      logger.error({ taskId, preemptionCount }, 'Task exceeded max preemptions, failing task');
      await this.failTask(taskId, `Exceeded max preemptions (${this.config.maxPreemptions})`);
      return;
    }

    // Create checkpoint before preempting
    const checkpointId = await this.createCheckpoint(taskId);

    // Get current resource utilization
    const utilization = await this.getResourceUtilization();
    const resourceUtil = this.getResourceUtilizationPercent(utilization, resource || 'cpu');

    // Record preemption
    const event: PreemptionEvent = {
      taskId,
      priorityClass: taskPriority.priorityClass,
      reason,
      resource: resource || 'cpu',
      resourceUtilization: resourceUtil,
      preemptedAt: new Date(),
      checkpointId,
      resumeAfter: new Date(Date.now() + this.config.retryDelay),
    };

    // Begin transaction
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update tasks table
      await client.query(
        `UPDATE tasks
         SET preempted = true,
             preemption_reason = $1,
             preempted_at = $2,
             preemption_count = preemption_count + 1,
             status = 'preempted'
         WHERE id = $3`,
        [reason, event.preemptedAt, taskId]
      );

      // Insert into preemption_history
      await client.query(
        `INSERT INTO preemption_history
         (task_id, preempted_at, reason, resource_type, resource_threshold, priority_class, checkpoint_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          taskId,
          event.preemptedAt,
          reason,
          resource || 'cpu',
          resourceUtil / 100, // Store as decimal 0-1
          taskPriority.priorityClass,
          checkpointId,
          JSON.stringify({ utilization, resumeAfter: event.resumeAfter }),
        ]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Update preemption count in memory
    this.preemptionCounts.set(taskId, preemptionCount + 1);

    this.emit('task-preempted', event);

    logger.info({ taskId, preemptionCount: preemptionCount + 1 }, 'Task preempted successfully');

    // Schedule resume
    setTimeout(() => {
      this.resumePreemptedTask(taskId).catch((err) => {
        logger.error({ err, taskId }, 'Failed to resume preempted task');
      });
    }, this.config.retryDelay);
  }

  /**
   * Resume a preempted task
   */
  async resumePreemptedTask(taskId: string): Promise<void> {
    logger.info({ taskId }, 'Resuming preempted task');

    // Check if resources are available
    const utilization = await this.getResourceUtilization();
    if (await this.shouldPreempt(utilization)) {
      logger.info({ taskId }, 'Resources still constrained, delaying resume');
      setTimeout(() => {
        this.resumePreemptedTask(taskId).catch((err) => {
          logger.error({ err, taskId }, 'Failed to resume preempted task');
        });
      }, this.config.retryDelay);
      return;
    }

    const resumedAt = new Date();

    // Begin transaction
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update tasks table
      await client.query(
        `UPDATE tasks
         SET preempted = false,
             preemption_reason = NULL,
             resumed_at = $1,
             status = 'pending'
         WHERE id = $2`,
        [resumedAt, taskId]
      );

      // Update preemption_history (most recent record)
      await client.query(
        `UPDATE preemption_history
         SET resumed_at = $1
         WHERE task_id = $2
           AND resumed_at IS NULL
         ORDER BY preempted_at DESC
         LIMIT 1`,
        [resumedAt, taskId]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    this.emit('task-resumed', { taskId, resumedAt });

    logger.info({ taskId }, 'Task resumed successfully');
  }

  /**
   * Get preemption candidates for a given priority class
   */
  async getPreemptionCandidates(
    priorityClasses: PriorityClass[],
    count: number = 1
  ): Promise<PreemptionCandidate[]> {
    const result = await this.pool.query(
      `SELECT
        id as task_id,
        priority_class,
        started_at,
        EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000 as duration
       FROM tasks
       WHERE status = 'running'
       AND priority_class = ANY($1)
       AND preempted = false
       ORDER BY started_at ASC
       LIMIT $2`,
      [priorityClasses, count]
    );

    return result.rows.map((row) => ({
      taskId: row.task_id,
      priorityClass: row.priority_class as PriorityClass,
      startedAt: row.started_at,
      duration: parseInt(row.duration),
      resourceUsage: {
        cpu: 0, // Would be populated from monitoring data
        memory: 0,
        gpu: 0,
      },
      score: this.calculatePreemptionScore(row),
    }));
  }

  /**
   * Calculate preemption score (higher = better candidate)
   */
  private calculatePreemptionScore(taskData: any): number {
    // Score based on:
    // - Priority (lower priority = higher score)
    // - Duration (longer running = higher score)
    // - Resource usage (higher usage = higher score)

    const priorityScore = getPriorityValue(taskData.priority_class) * 100;
    const durationScore = Math.min(taskData.duration / 1000 / 60, 60); // Cap at 60 minutes
    const resourceScore = 0; // Would calculate from resource usage

    return priorityScore + durationScore + resourceScore;
  }

  /**
   * Check if preemption should occur based on current resource utilization
   */
  private async shouldPreempt(utilization: ResourceUtilization): Promise<boolean> {
    // Check each resource against thresholds
    if (utilization.cpu.percent >= this.config.thresholds.cpu.preemptP3) {
      return true;
    }

    if (utilization.memory.percent >= this.config.thresholds.memory.preemptP3) {
      return true;
    }

    if (utilization.gpu.percent >= this.config.thresholds.gpu.preemptP3) {
      return true;
    }

    return false;
  }

  /**
   * Evaluate preemption policy and preempt tasks if needed
   */
  async evaluatePreemptionPolicy(): Promise<void> {
    if (!this.config.enablePreemption) {
      return;
    }

    const utilization = await this.getResourceUtilization();

    logger.debug({ utilization }, 'Evaluating preemption policy');

    // Sort rules by priority
    const sortedRules = [...this.policy.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      const resourceUtil = this.getResourceUtilizationPercent(utilization, rule.condition.resource);

      if (resourceUtil >= rule.condition.threshold) {
        logger.info(
          { rule: rule.id, resource: rule.condition.resource, utilization: resourceUtil },
          'Preemption rule triggered'
        );

        // Get candidates
        const candidates = await this.getPreemptionCandidates(rule.action.preempt, rule.action.count);

        // Preempt tasks
        for (const candidate of candidates) {
          await this.preemptTask(candidate.taskId, PreemptionReason.RESOURCE_CONSTRAINT, rule.condition.resource);
        }

        // Only evaluate one rule per cycle
        break;
      }
    }
  }

  /**
   * Get resource utilization percentage
   */
  private getResourceUtilizationPercent(utilization: ResourceUtilization, resource: ResourceType): number {
    switch (resource) {
      case 'cpu':
        return utilization.cpu.percent;
      case 'memory':
        return utilization.memory.percent;
      case 'gpu':
        return utilization.gpu.percent;
      default:
        return 0;
    }
  }

  /**
   * Get current resource utilization
   */
  async getResourceUtilization(): Promise<ResourceUtilization> {
    try {
      // Query aggregated tenant usage from last 5 minutes
      const result = await this.pool.query(`
        SELECT
          resource_type,
          SUM(amount) as total_usage
        FROM tenant_usage
        WHERE recorded_at > NOW() - INTERVAL '5 minutes'
        GROUP BY resource_type
      `);

      const usageMap = new Map<string, number>();
      for (const row of result.rows) {
        usageMap.set(row.resource_type, parseFloat(row.total_usage) || 0);
      }

      // Get system totals from tenant quotas (aggregate max values)
      const quotasResult = await this.pool.query(`
        SELECT
          SUM(max_cpu_cores) as total_cpu,
          SUM(max_memory_gb) as total_memory,
          SUM(max_gpus) as total_gpus
        FROM tenant_quotas
      `);

      const quotas = quotasResult.rows[0] || {};
      const totalCPU = parseInt(quotas.total_cpu) || 8;
      const totalMemory = parseInt(quotas.total_memory) || 32;
      const totalGPU = parseInt(quotas.total_gpus) || 2;

      const cpuUsed = usageMap.get('cpu') || 0;
      const memoryUsed = usageMap.get('memory') || 0;
      const gpuUsed = usageMap.get('gpu') || 0;

      return {
        cpu: {
          used: cpuUsed,
          total: totalCPU,
          percent: totalCPU > 0 ? Math.round((cpuUsed / totalCPU) * 100) : 0,
        },
        memory: {
          usedMB: memoryUsed * 1024, // Convert GB to MB
          totalMB: totalMemory * 1024,
          percent: totalMemory > 0 ? Math.round((memoryUsed / totalMemory) * 100) : 0,
        },
        gpu: {
          used: gpuUsed,
          total: totalGPU,
          percent: totalGPU > 0 ? Math.round((gpuUsed / totalGPU) * 100) : 0,
        },
      };
    } catch (err) {
      logger.error({ err }, 'Failed to query resource utilization, using defaults');
      // Fallback to safe defaults
      return {
        cpu: {
          used: 0,
          total: 8,
          percent: 0,
        },
        memory: {
          usedMB: 0,
          totalMB: 32768,
          percent: 0,
        },
        gpu: {
          used: 0,
          total: 2,
          percent: 0,
        },
      };
    }
  }

  /**
   * Get priority statistics
   */
  async getStats(): Promise<PriorityStats> {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE priority_class = 'P0') as p0,
        COUNT(*) FILTER (WHERE priority_class = 'P1') as p1,
        COUNT(*) FILTER (WHERE priority_class = 'P2') as p2,
        COUNT(*) FILTER (WHERE priority_class = 'P3') as p3,
        COUNT(*) FILTER (WHERE preempted = true) as preempted
      FROM tasks
      WHERE status IN ('pending', 'running', 'preempted')
    `);

    const row = result.rows[0];

    return {
      totalTasks: parseInt(row.total),
      byPriority: {
        P0: parseInt(row.p0),
        P1: parseInt(row.p1),
        P2: parseInt(row.p2),
        P3: parseInt(row.p3),
      },
      preemptions: {
        total: parseInt(row.preempted),
        byReason: {
          [PreemptionReason.RESOURCE_CONSTRAINT]: 0,
          [PreemptionReason.BUDGET_EXCEEDED]: 0,
          [PreemptionReason.QUOTA_EXCEEDED]: 0,
          [PreemptionReason.HIGH_PRIORITY_TASK]: 0,
          [PreemptionReason.MANUAL]: 0,
        },
        byPriority: {
          P0: 0,
          P1: 0,
          P2: 0,
          P3: parseInt(row.preempted), // Simplified
        },
      },
      resourceUtilization: await this.getResourceUtilization(),
      averageWaitTime: {
        P0: 0,
        P1: 0,
        P2: 0,
        P3: 0,
      },
    };
  }

  /**
   * Start monitoring for resource constraints
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      logger.warn('Monitoring already started');
      return;
    }

    logger.info({ intervalMs }, 'Starting preemption monitoring');

    this.monitoringInterval = setInterval(() => {
      this.evaluatePreemptionPolicy().catch((err) => {
        logger.error({ err }, 'Failed to evaluate preemption policy');
      });
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      logger.info('Stopped preemption monitoring');
    }
  }

  /**
   * Create checkpoint for task
   */
  private async createCheckpoint(taskId: string): Promise<string> {
    const checkpointId = `chk-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // In production, would call CheckpointManager
    logger.info({ taskId, checkpointId }, 'Created checkpoint for task');

    return checkpointId;
  }

  /**
   * Fail a task
   */
  private async failTask(taskId: string, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE tasks
       SET status = 'failed',
           error = $1
       WHERE id = $2`,
      [reason, taskId]
    );

    this.emit('task-failed', { taskId, reason });

    logger.error({ taskId, reason }, 'Task failed due to excessive preemptions');
  }

  /**
   * Get task priority
   */
  getTaskPriority(taskId: string): TaskPriority | undefined {
    return this.taskPriorities.get(taskId);
  }

  /**
   * Get preemption count for task
   */
  getPreemptionCount(taskId: string): number {
    return this.preemptionCounts.get(taskId) || 0;
  }

  /**
   * Clear task priority (when task completes)
   */
  clearTaskPriority(taskId: string): void {
    this.taskPriorities.delete(taskId);
    this.preemptionCounts.delete(taskId);
  }
}
