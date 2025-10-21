/**
 * Cost Tracker & Dashboard
 *
 * Roadmap: M3 - Perf & Cost Optimizer
 *
 * Tracks and visualizes costs across runs, phases, and tenants.
 *
 * Features:
 * - Real-time cost tracking
 * - Budget alerts
 * - Cost attribution (by phase, agent, model)
 * - Optimization recommendations
 */

import pino from 'pino';
import { Pool } from 'pg';
import { EventEmitter } from 'events';

const logger = pino({ name: 'cost-tracker' });

// ============================================================================
// Types
// ============================================================================

export interface CostEntry {
  id: string;
  runId: string;
  tenantId?: string;
  phase?: string;
  agent?: string;
  modelId?: string;
  costType: 'llm' | 'tool' | 'storage' | 'compute' | 'other';
  costUSD: number;
  tokens?: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface Budget {
  tenantId: string;
  periodType: 'daily' | 'weekly' | 'monthly';
  limitUSD: number;
  currentSpendUSD: number;
  periodStart: Date;
  periodEnd: Date;
  alertThresholdPct: number; // Alert at X% of budget
}

export interface CostBreakdown {
  total: number;
  byType: Record<string, number>;
  byPhase: Record<string, number>;
  byModel: Record<string, number>;
  byAgent: Record<string, number>;
}

export interface CostAlert {
  type: 'budget_threshold' | 'budget_exceeded' | 'anomaly' | 'forecast_overage';
  severity: 'warning' | 'critical';
  message: string;
  budget?: Budget;
  currentSpend?: number;
  projectedSpend?: number;
}

export interface CostOptimization {
  type: 'model_downgrade' | 'caching' | 'batching' | 'reduce_tokens';
  priority: 'high' | 'medium' | 'low';
  description: string;
  estimatedSavingsUSD: number;
  estimatedSavingsPct: number;
  implementation: string;
}

// ============================================================================
// Cost Tracker
// ============================================================================

export class CostTracker extends EventEmitter {
  private budgets: Map<string, Budget> = new Map();

  constructor(private db: Pool) {
    super();
    this.startBudgetMonitoring();
  }

  /**
   * Record cost entry
   */
  async recordCost(entry: Omit<CostEntry, 'id' | 'timestamp'>): Promise<CostEntry> {
    const id = `cost-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const costEntry: CostEntry = {
      id,
      timestamp: new Date(),
      ...entry,
    };

    // Store in database
    await this.db.query(
      `
      INSERT INTO cost_entries (
        id, run_id, tenant_id, phase, agent, model_id, cost_type, cost_usd, tokens, timestamp, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
      [
        costEntry.id,
        costEntry.runId,
        costEntry.tenantId || null,
        costEntry.phase || null,
        costEntry.agent || null,
        costEntry.modelId || null,
        costEntry.costType,
        costEntry.costUSD,
        costEntry.tokens || null,
        costEntry.timestamp,
        JSON.stringify(costEntry.metadata || {}),
      ]
    );

    // Update budget tracking
    if (entry.tenantId) {
      await this.updateBudgetSpend(entry.tenantId, entry.costUSD);
    }

    logger.debug({ costEntry }, 'Cost recorded');

    return costEntry;
  }

  /**
   * Get cost breakdown for a run
   */
  async getRunCostBreakdown(runId: string): Promise<CostBreakdown> {
    const result = await this.db.query(
      `
      SELECT
        SUM(cost_usd) as total,
        json_object_agg(cost_type, type_total) as by_type,
        json_object_agg(COALESCE(phase, 'unknown'), phase_total) as by_phase,
        json_object_agg(COALESCE(model_id, 'unknown'), model_total) as by_model,
        json_object_agg(COALESCE(agent, 'unknown'), agent_total) as by_agent
      FROM cost_entries
      LEFT JOIN LATERAL (
        SELECT cost_type, SUM(cost_usd) as type_total
        FROM cost_entries WHERE run_id = $1
        GROUP BY cost_type
      ) type_agg ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(phase, 'unknown') as phase, SUM(cost_usd) as phase_total
        FROM cost_entries WHERE run_id = $1
        GROUP BY phase
      ) phase_agg ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(model_id, 'unknown') as model, SUM(cost_usd) as model_total
        FROM cost_entries WHERE run_id = $1
        GROUP BY model_id
      ) model_agg ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(agent, 'unknown') as agent, SUM(cost_usd) as agent_total
        FROM cost_entries WHERE run_id = $1
        GROUP BY agent
      ) agent_agg ON true
      WHERE run_id = $1
    `,
      [runId]
    );

    const row = result.rows[0];

    return {
      total: parseFloat(row?.total || '0'),
      byType: row?.by_type || {},
      byPhase: row?.by_phase || {},
      byModel: row?.by_model || {},
      byAgent: row?.by_agent || {},
    };
  }

  /**
   * Get tenant cost summary
   */
  async getTenantCostSummary(
    tenantId: string,
    fromDate?: Date,
    toDate?: Date
  ): Promise<{
    totalCost: number;
    breakdown: CostBreakdown;
    runCount: number;
    avgCostPerRun: number;
  }> {
    const from = fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const to = toDate || new Date();

    const result = await this.db.query(
      `
      SELECT
        SUM(cost_usd) as total_cost,
        COUNT(DISTINCT run_id) as run_count,
        SUM(cost_usd) / NULLIF(COUNT(DISTINCT run_id), 0) as avg_per_run
      FROM cost_entries
      WHERE tenant_id = $1
        AND timestamp >= $2
        AND timestamp <= $3
    `,
      [tenantId, from, to]
    );

    const row = result.rows[0];

    // Get breakdown
    const breakdownResult = await this.db.query(
      `
      SELECT
        cost_type,
        SUM(cost_usd) as total
      FROM cost_entries
      WHERE tenant_id = $1
        AND timestamp >= $2
        AND timestamp <= $3
      GROUP BY cost_type
    `,
      [tenantId, from, to]
    );

    const byType: Record<string, number> = {};
    for (const row of breakdownResult.rows) {
      byType[row.cost_type] = parseFloat(row.total);
    }

    return {
      totalCost: parseFloat(row.total_cost || '0'),
      breakdown: {
        total: parseFloat(row.total_cost || '0'),
        byType,
        byPhase: {},
        byModel: {},
        byAgent: {},
      },
      runCount: parseInt(row.run_count || '0'),
      avgCostPerRun: parseFloat(row.avg_per_run || '0'),
    };
  }

  /**
   * Set budget for tenant
   */
  async setBudget(
    tenantId: string,
    periodType: Budget['periodType'],
    limitUSD: number,
    alertThresholdPct: number = 80
  ): Promise<Budget> {
    const now = new Date();
    const { periodStart, periodEnd } = this.calculatePeriod(periodType, now);

    const budget: Budget = {
      tenantId,
      periodType,
      limitUSD,
      currentSpendUSD: 0,
      periodStart,
      periodEnd,
      alertThresholdPct,
    };

    // Get current spend
    const spendResult = await this.db.query(
      `
      SELECT COALESCE(SUM(cost_usd), 0) as total
      FROM cost_entries
      WHERE tenant_id = $1
        AND timestamp >= $2
        AND timestamp <= $3
    `,
      [tenantId, periodStart, periodEnd]
    );

    budget.currentSpendUSD = parseFloat(spendResult.rows[0].total);

    // Store budget
    await this.db.query(
      `
      INSERT INTO budgets (tenant_id, period_type, limit_usd, current_spend_usd, period_start, period_end, alert_threshold_pct)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, period_type)
      DO UPDATE SET
        limit_usd = $3,
        period_start = $5,
        period_end = $6,
        alert_threshold_pct = $7
    `,
      [
        budget.tenantId,
        budget.periodType,
        budget.limitUSD,
        budget.currentSpendUSD,
        budget.periodStart,
        budget.periodEnd,
        budget.alertThresholdPct,
      ]
    );

    this.budgets.set(`${tenantId}-${periodType}`, budget);

    logger.info({ tenantId, periodType, limitUSD }, 'Budget set');

    return budget;
  }

  /**
   * Update budget spend
   */
  private async updateBudgetSpend(tenantId: string, costUSD: number): Promise<void> {
    // Update all active budgets for this tenant
    for (const [key, budget] of this.budgets.entries()) {
      if (budget.tenantId === tenantId && new Date() <= budget.periodEnd) {
        budget.currentSpendUSD += costUSD;

        // Check for alerts
        const pctUsed = (budget.currentSpendUSD / budget.limitUSD) * 100;

        if (pctUsed >= 100) {
          this.emitAlert({
            type: 'budget_exceeded',
            severity: 'critical',
            message: `Budget exceeded for ${tenantId} (${budget.periodType})`,
            budget,
            currentSpend: budget.currentSpendUSD,
          });
        } else if (pctUsed >= budget.alertThresholdPct) {
          this.emitAlert({
            type: 'budget_threshold',
            severity: 'warning',
            message: `Budget ${pctUsed.toFixed(0)}% used for ${tenantId} (${budget.periodType})`,
            budget,
            currentSpend: budget.currentSpendUSD,
          });
        }

        // Update in database
        await this.db.query(
          `UPDATE budgets SET current_spend_usd = $1 WHERE tenant_id = $2 AND period_type = $3`,
          [budget.currentSpendUSD, tenantId, budget.periodType]
        );
      }
    }
  }

  /**
   * Generate cost optimization suggestions
   */
  async generateOptimizations(tenantId: string): Promise<CostOptimization[]> {
    const optimizations: CostOptimization[] = [];

    // Get tenant's cost breakdown
    const summary = await this.getTenantCostSummary(tenantId);

    // Check if expensive models are being overused
    const modelCosts = await this.db.query(
      `
      SELECT
        model_id,
        SUM(cost_usd) as total_cost,
        COUNT(*) as call_count
      FROM cost_entries
      WHERE tenant_id = $1
        AND timestamp > NOW() - INTERVAL '7 days'
        AND cost_type = 'llm'
      GROUP BY model_id
      ORDER BY total_cost DESC
      LIMIT 5
    `,
      [tenantId]
    );

    for (const row of modelCosts.rows) {
      const modelCost = parseFloat(row.total_cost);
      const pct = (modelCost / summary.totalCost) * 100;

      if (pct > 30 && row.model_id.includes('opus')) {
        optimizations.push({
          type: 'model_downgrade',
          priority: 'high',
          description: `Switch from ${row.model_id} to Sonnet for non-critical tasks`,
          estimatedSavingsUSD: modelCost * 0.8, // 80% savings
          estimatedSavingsPct: pct * 0.8,
          implementation: `Update ModelRouter to prefer Sonnet for tasks with affinity !== 'long_context'`,
        });
      }
    }

    // Check cache hit rate
    const cacheStats = await this.db.query(
      `
      SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE access_count > 1) as cache_hits
      FROM replay_cache
      WHERE metadata->>'tenantId' = $1
        AND timestamp > NOW() - INTERVAL '7 days'
    `,
      [tenantId]
    );

    if (cacheStats.rows.length > 0) {
      const total = parseInt(cacheStats.rows[0].total_calls || '0');
      const hits = parseInt(cacheStats.rows[0].cache_hits || '0');
      const hitRate = total > 0 ? hits / total : 0;

      if (hitRate < 0.5) {
        const potentialSavings = summary.totalCost * (0.5 - hitRate);

        optimizations.push({
          type: 'caching',
          priority: 'high',
          description: `Improve cache hit rate from ${(hitRate * 100).toFixed(0)}% to 50%`,
          estimatedSavingsUSD: potentialSavings,
          estimatedSavingsPct: (potentialSavings / summary.totalCost) * 100,
          implementation: `Enable deterministic seeding for more tasks; increase cache TTL`,
        });
      }
    }

    // Check for high token usage
    const tokenStats = await this.db.query(
      `
      SELECT AVG(tokens) as avg_tokens, MAX(tokens) as max_tokens
      FROM cost_entries
      WHERE tenant_id = $1
        AND tokens IS NOT NULL
        AND timestamp > NOW() - INTERVAL '7 days'
    `,
      [tenantId]
    );

    if (tokenStats.rows.length > 0) {
      const avgTokens = parseFloat(tokenStats.rows[0].avg_tokens || '0');

      if (avgTokens > 50000) {
        optimizations.push({
          type: 'reduce_tokens',
          priority: 'medium',
          description: `Reduce average token usage from ${avgTokens.toFixed(0)} to <40k`,
          estimatedSavingsUSD: summary.totalCost * 0.2,
          estimatedSavingsPct: 20,
          implementation: `Implement prompt compression; use smaller context windows; summarize outputs`,
        });
      }
    }

    return optimizations;
  }

  /**
   * Emit cost alert
   */
  private emitAlert(alert: CostAlert): void {
    logger.warn({ alert }, 'Cost alert triggered');
    this.emit('cost.alert', alert);

    // Store alert
    this.db.query(
      `INSERT INTO cost_alerts (type, severity, message, metadata) VALUES ($1, $2, $3, $4)`,
      [alert.type, alert.severity, alert.message, JSON.stringify(alert)]
    );
  }

  /**
   * Calculate period boundaries
   */
  private calculatePeriod(
    periodType: Budget['periodType'],
    now: Date
  ): { periodStart: Date; periodEnd: Date } {
    const periodStart = new Date(now);
    const periodEnd = new Date(now);

    switch (periodType) {
      case 'daily':
        periodStart.setHours(0, 0, 0, 0);
        periodEnd.setHours(23, 59, 59, 999);
        break;

      case 'weekly':
        const dayOfWeek = now.getDay();
        periodStart.setDate(now.getDate() - dayOfWeek);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd.setDate(periodStart.getDate() + 6);
        periodEnd.setHours(23, 59, 59, 999);
        break;

      case 'monthly':
        periodStart.setDate(1);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd.setMonth(periodStart.getMonth() + 1);
        periodEnd.setDate(0); // Last day of month
        periodEnd.setHours(23, 59, 59, 999);
        break;
    }

    return { periodStart, periodEnd };
  }

  /**
   * Start budget monitoring (check every hour)
   */
  private startBudgetMonitoring(): void {
    setInterval(async () => {
      await this.checkBudgets();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Check all budgets
   */
  private async checkBudgets(): Promise<void> {
    const result = await this.db.query(`SELECT * FROM budgets`);

    for (const row of result.rows) {
      const budget: Budget = {
        tenantId: row.tenant_id,
        periodType: row.period_type,
        limitUSD: parseFloat(row.limit_usd),
        currentSpendUSD: parseFloat(row.current_spend_usd),
        periodStart: row.period_start,
        periodEnd: row.period_end,
        alertThresholdPct: parseFloat(row.alert_threshold_pct),
      };

      this.budgets.set(`${budget.tenantId}-${budget.periodType}`, budget);

      // Check if period expired - reset
      if (new Date() > budget.periodEnd) {
        await this.resetBudget(budget.tenantId, budget.periodType);
      }
    }
  }

  /**
   * Reset budget for new period
   */
  private async resetBudget(
    tenantId: string,
    periodType: Budget['periodType']
  ): Promise<void> {
    const { periodStart, periodEnd } = this.calculatePeriod(periodType, new Date());

    await this.db.query(
      `
      UPDATE budgets
      SET current_spend_usd = 0, period_start = $1, period_end = $2
      WHERE tenant_id = $3 AND period_type = $4
    `,
      [periodStart, periodEnd, tenantId, periodType]
    );

    logger.info({ tenantId, periodType }, 'Budget reset for new period');
  }
}

// ============================================================================
// Database Migration
// ============================================================================

export const COST_TRACKER_MIGRATION = `
-- Cost entries table
CREATE TABLE IF NOT EXISTS cost_entries (
  id VARCHAR(100) PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  tenant_id VARCHAR(255),
  phase VARCHAR(100),
  agent VARCHAR(100),
  model_id VARCHAR(100),
  cost_type VARCHAR(50) NOT NULL,
  cost_usd NUMERIC(12, 6) NOT NULL,
  tokens INTEGER,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cost_entries_run ON cost_entries(run_id);
CREATE INDEX IF NOT EXISTS idx_cost_entries_tenant ON cost_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cost_entries_timestamp ON cost_entries(timestamp);
CREATE INDEX IF NOT EXISTS idx_cost_entries_type ON cost_entries(cost_type);
CREATE INDEX IF NOT EXISTS idx_cost_entries_model ON cost_entries(model_id);

COMMENT ON TABLE cost_entries IS 'Granular cost tracking for runs, phases, and agents';

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
  tenant_id VARCHAR(255) NOT NULL,
  period_type VARCHAR(20) NOT NULL,
  limit_usd NUMERIC(12, 2) NOT NULL,
  current_spend_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  alert_threshold_pct NUMERIC(5, 2) NOT NULL DEFAULT 80,
  metadata JSONB DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, period_type)
);

CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period_start, period_end);

COMMENT ON TABLE budgets IS 'Cost budgets per tenant and period';

-- Cost alerts table
CREATE TABLE IF NOT EXISTS cost_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_alerts_created ON cost_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_cost_alerts_type ON cost_alerts(type);

COMMENT ON TABLE cost_alerts IS 'Cost alerts for budget thresholds and anomalies';
`;
