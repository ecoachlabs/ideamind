/**
 * Budget Guard
 *
 * Budget-based preemption enforcement (separate from cost tracking).
 * Preempts tasks based on budget thresholds to prevent cost overruns.
 * Integrates with Priority Scheduler for actual task preemption.
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'budget-guard' });

export interface BudgetEvent {
  id?: string;
  runId: string;
  tenantId?: string;
  budgetTotal: number;
  budgetSpent: number;
  budgetRemaining: number;
  budgetPercentUsed: number;
  eventType: 'warn' | 'throttle' | 'pause' | 'resume' | 'preempt';
  thresholdType: 'warn' | 'throttle' | 'pause';
  thresholdPercent: number;
  actionTaken: string;
  tasksAffected?: string[];
  priorityClassesPreempted?: string[];
  triggeredAt: Date;
  resolvedAt?: Date;
}

export interface BudgetPolicy {
  warnAt: number; // 0.5 (50%)
  throttleAt: number; // 0.8 (80% - preempt P3)
  pauseAt: number; // 0.95 (95% - pause all)
  actions: {
    warn: 'alert' | 'log';
    throttle: 'preempt-P3' | 'preempt-P2-P3';
    pause: 'pause-all' | 'pause-non-critical';
  };
}

export interface BudgetStatus {
  runId: string;
  budget: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  status: 'ok' | 'warning' | 'throttled' | 'paused';
}

export interface BudgetAlert {
  runId: string;
  level: 'warn' | 'throttle' | 'pause';
  threshold: number;
  percentUsed: number;
  timestamp: Date;
}

const DEFAULT_BUDGET_POLICY: BudgetPolicy = {
  warnAt: 0.5,
  throttleAt: 0.8,
  pauseAt: 0.95,
  actions: {
    warn: 'alert',
    throttle: 'preempt-P3',
    pause: 'pause-all',
  },
};

export class BudgetGuard extends EventEmitter {
  private policy: BudgetPolicy;
  private budgets: Map<string, number> = new Map();
  private spent: Map<string, number> = new Map();
  private alertsSent: Map<string, Set<string>> = new Map();

  constructor(
    private pool: Pool,
    policy: Partial<BudgetPolicy> = {}
  ) {
    super();
    this.policy = { ...DEFAULT_BUDGET_POLICY, ...policy };
  }

  /**
   * Set budget for run
   */
  async setBudget(runId: string, budgetUSD: number): Promise<void> {
    this.budgets.set(runId, budgetUSD);
    this.spent.set(runId, 0);
    this.alertsSent.set(runId, new Set());

    logger.info({ runId, budgetUSD }, 'Budget set for run');
  }

  /**
   * Record cost and check budget
   */
  async recordCost(runId: string, costUSD: number): Promise<void> {
    const currentSpent = this.spent.get(runId) || 0;
    const newSpent = currentSpent + costUSD;
    this.spent.set(runId, newSpent);

    // Check budget and enforce
    await this.enforceBudget(runId);

    logger.debug({ runId, costUSD, newSpent }, 'Cost recorded');
  }

  /**
   * Get actual spent from database (fallback to in-memory)
   */
  private async getActualSpent(runId: string): Promise<number> {
    try {
      // Query from cost_events or similar table
      const result = await this.pool.query(
        `SELECT COALESCE(SUM(cost_usd), 0) as total
         FROM cost_events
         WHERE run_id = $1`,
        [runId]
      );

      if (result.rows.length > 0 && result.rows[0].total !== null) {
        return parseFloat(result.rows[0].total);
      }
    } catch (err) {
      logger.warn({ err, runId }, 'Failed to query actual spent, using in-memory tracking');
    }

    // Fallback to in-memory
    return this.spent.get(runId) || 0;
  }

  /**
   * Check budget status
   */
  async checkBudget(runId: string): Promise<BudgetStatus> {
    const budget = this.budgets.get(runId) || 0;
    const spent = await this.getActualSpent(runId); // Query from database
    const remaining = Math.max(0, budget - spent);
    const percentUsed = budget > 0 ? (spent / budget) * 100 : 0;

    let status: 'ok' | 'warning' | 'throttled' | 'paused' = 'ok';

    if (percentUsed >= this.policy.pauseAt * 100) {
      status = 'paused';
    } else if (percentUsed >= this.policy.throttleAt * 100) {
      status = 'throttled';
    } else if (percentUsed >= this.policy.warnAt * 100) {
      status = 'warning';
    }

    return {
      runId,
      budget,
      spent,
      remaining,
      percentUsed,
      status,
    };
  }

  /**
   * Enforce budget policy
   */
  async enforceBudget(runId: string): Promise<void> {
    const status = await this.checkBudget(runId);
    const alerts = this.alertsSent.get(runId) || new Set();

    // Warn at threshold
    if (status.percentUsed >= this.policy.warnAt * 100 && !alerts.has('warn')) {
      await this.sendAlert(runId, 'warn', this.policy.warnAt, status.percentUsed);
      alerts.add('warn');
      this.alertsSent.set(runId, alerts);
    }

    // Throttle at threshold
    if (status.percentUsed >= this.policy.throttleAt * 100 && !alerts.has('throttle')) {
      await this.throttleForBudget(runId, this.policy.actions.throttle);
      await this.sendAlert(runId, 'throttle', this.policy.throttleAt, status.percentUsed);
      alerts.add('throttle');
      this.alertsSent.set(runId, alerts);
    }

    // Pause at threshold
    if (status.percentUsed >= this.policy.pauseAt * 100 && !alerts.has('pause')) {
      await this.pauseForBudget(runId, this.policy.actions.pause);
      await this.sendAlert(runId, 'pause', this.policy.pauseAt, status.percentUsed);
      alerts.add('pause');
      this.alertsSent.set(runId, alerts);
    }
  }

  /**
   * Throttle tasks for budget
   */
  private async throttleForBudget(runId: string, action: string): Promise<void> {
    logger.warn({ runId, action }, 'Throttling tasks for budget');

    const prioritiesToPreempt = action === 'preempt-P3' ? ['P3'] : ['P2', 'P3'];

    // Get tasks to preempt
    const result = await this.pool.query(
      `SELECT id FROM tasks
       WHERE run_id = $1
       AND status = 'running'
       AND priority_class = ANY($2)
       ORDER BY started_at DESC
       LIMIT 5`,
      [runId, prioritiesToPreempt]
    );

    const tasksAffected = result.rows.map((r) => r.id);

    // Store budget event in database
    const status = await this.checkBudget(runId);
    await this.storeBudgetEvent({
      runId,
      budgetTotal: status.budget,
      budgetSpent: status.spent,
      budgetRemaining: status.remaining,
      budgetPercentUsed: status.percentUsed,
      eventType: 'throttle',
      thresholdType: 'throttle',
      thresholdPercent: this.policy.throttleAt * 100,
      actionTaken: action,
      tasksAffected,
      priorityClassesPreempted: prioritiesToPreempt,
      triggeredAt: new Date(),
    });

    // Emit events for preemption
    for (const taskId of tasksAffected) {
      this.emit('preempt-for-budget', {
        taskId,
        runId,
        reason: 'budget_exceeded',
        threshold: this.policy.throttleAt,
      });
    }

    logger.info({ runId, preempted: tasksAffected.length }, 'Tasks preempted for budget');
  }

  /**
   * Store budget event in database
   */
  private async storeBudgetEvent(event: BudgetEvent): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO budget_events
         (run_id, tenant_id, budget_total, budget_spent, budget_remaining,
          budget_percent_used, event_type, threshold_type, threshold_percent,
          action_taken, tasks_affected, priority_classes_preempted, triggered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          event.runId,
          event.tenantId || null,
          event.budgetTotal,
          event.budgetSpent,
          event.budgetRemaining,
          event.budgetPercentUsed,
          event.eventType,
          event.thresholdType,
          event.thresholdPercent,
          event.actionTaken,
          JSON.stringify(event.tasksAffected || []),
          JSON.stringify(event.priorityClassesPreempted || []),
          event.triggeredAt,
        ]
      );

      logger.debug({ event }, 'Budget event stored');
    } catch (err) {
      logger.error({ err, event }, 'Failed to store budget event');
      // Don't throw - event storage should not block execution
    }
  }

  /**
   * Pause tasks for budget
   */
  private async pauseForBudget(runId: string, action: string): Promise<void> {
    logger.error({ runId, action }, 'Pausing run for budget exceeded');

    // Pause run
    await this.pool.query(
      `UPDATE runs
       SET status = 'paused',
           paused_reason = 'budget_exceeded',
           paused_at = NOW()
       WHERE id = $1`,
      [runId]
    );

    // Store budget event
    const status = await this.checkBudget(runId);
    await this.storeBudgetEvent({
      runId,
      budgetTotal: status.budget,
      budgetSpent: status.spent,
      budgetRemaining: status.remaining,
      budgetPercentUsed: status.percentUsed,
      eventType: 'pause',
      thresholdType: 'pause',
      thresholdPercent: this.policy.pauseAt * 100,
      actionTaken: action,
      triggeredAt: new Date(),
    });

    this.emit('run-paused-for-budget', {
      runId,
      threshold: this.policy.pauseAt,
      timestamp: new Date(),
    });

    logger.error({ runId }, 'Run paused due to budget exceeded');
  }

  /**
   * Send budget alert
   */
  private async sendAlert(runId: string, level: 'warn' | 'throttle' | 'pause', threshold: number, percentUsed: number): Promise<void> {
    const alert: BudgetAlert = {
      runId,
      level,
      threshold,
      percentUsed,
      timestamp: new Date(),
    };

    // Store budget event for warnings too
    const status = await this.checkBudget(runId);
    await this.storeBudgetEvent({
      runId,
      budgetTotal: status.budget,
      budgetSpent: status.spent,
      budgetRemaining: status.remaining,
      budgetPercentUsed: status.percentUsed,
      eventType: level,
      thresholdType: level,
      thresholdPercent: threshold * 100,
      actionTaken: this.policy.actions[level],
      triggeredAt: new Date(),
    });

    this.emit('budget-alert', alert);

    logger.warn({ alert }, 'Budget alert sent');
  }

  /**
   * Get budget events for a run
   */
  async getBudgetEvents(runId: string, limit: number = 10): Promise<BudgetEvent[]> {
    const result = await this.pool.query(
      `SELECT *
       FROM budget_events
       WHERE run_id = $1
       ORDER BY triggered_at DESC
       LIMIT $2`,
      [runId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      tenantId: row.tenant_id,
      budgetTotal: parseFloat(row.budget_total),
      budgetSpent: parseFloat(row.budget_spent),
      budgetRemaining: parseFloat(row.budget_remaining),
      budgetPercentUsed: parseFloat(row.budget_percent_used),
      eventType: row.event_type,
      thresholdType: row.threshold_type,
      thresholdPercent: parseFloat(row.threshold_percent),
      actionTaken: row.action_taken,
      tasksAffected: row.tasks_affected ? JSON.parse(row.tasks_affected) : [],
      priorityClassesPreempted: row.priority_classes_preempted
        ? JSON.parse(row.priority_classes_preempted)
        : [],
      triggeredAt: row.triggered_at,
      resolvedAt: row.resolved_at,
    }));
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget(runId: string): number {
    const budget = this.budgets.get(runId) || 0;
    const spent = this.spent.get(runId) || 0;
    return Math.max(0, budget - spent);
  }

  /**
   * Reset budget tracking for run
   */
  reset(runId: string): void {
    this.budgets.delete(runId);
    this.spent.delete(runId);
    this.alertsSent.delete(runId);
  }
}
