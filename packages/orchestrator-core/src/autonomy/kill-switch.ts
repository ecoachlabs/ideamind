/**
 * Anomaly Guard & Kill-Switch
 *
 * Roadmap: M1 - Autonomy Core
 *
 * Detects runaway cost/time/toxicity and pauses runs with reason & snapshot.
 *
 * Features:
 * - Policy thresholds per tenant
 * - Telemetry stream monitoring
 * - Graceful pause with state snapshot
 *
 * Acceptance:
 * - Synthetic runaway paused < 60s
 * - Resume replays safely from snapshot
 */

import pino from 'pino';
import { Pool } from 'pg';
import { EventEmitter } from 'events';

const logger = pino({ name: 'kill-switch' });

// ============================================================================
// Types
// ============================================================================

export interface PolicyThresholds {
  maxCostUSD: number;
  maxDurationMs: number;
  maxTokens: number;
  maxLLMCalls: number;
  maxToolCalls: number;
  maxErrorRate: number; // 0.0 to 1.0
  maxToxicityScore: number; // 0.0 to 1.0
}

export interface TelemetrySnapshot {
  runId: string;
  timestamp: Date;
  costUSD: number;
  durationMs: number;
  tokensUsed: number;
  llmCalls: number;
  toolCalls: number;
  errorRate: number;
  toxicityScore: number;
  metadata: Record<string, any>;
}

export interface PauseReason {
  type:
    | 'cost_exceeded'
    | 'time_exceeded'
    | 'token_limit'
    | 'error_rate'
    | 'toxicity'
    | 'manual'
    | 'policy_violation';
  message: string;
  snapshot: TelemetrySnapshot;
  threshold?: any;
  actual?: any;
}

export interface RunSnapshot {
  runId: string;
  phase: string;
  state: any;
  pausedAt: Date;
  reason: PauseReason;
  canResume: boolean;
}

// ============================================================================
// Anomaly Detector
// ============================================================================

export class AnomalyDetector extends EventEmitter {
  private thresholds: Map<string, PolicyThresholds> = new Map();
  private runSnapshots: Map<string, TelemetrySnapshot> = new Map();
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(private db: Pool) {
    super();
    this.loadDefaultThresholds();
  }

  /**
   * Load default policy thresholds
   */
  private loadDefaultThresholds() {
    const defaultThresholds: PolicyThresholds = {
      maxCostUSD: 100.0, // $100 per run
      maxDurationMs: 4 * 60 * 60 * 1000, // 4 hours
      maxTokens: 10_000_000, // 10M tokens
      maxLLMCalls: 1000,
      maxToolCalls: 5000,
      maxErrorRate: 0.5, // 50% error rate
      maxToxicityScore: 0.8,
    };

    this.thresholds.set('default', defaultThresholds);

    // Stricter thresholds for beta/trial tenants
    this.thresholds.set('trial', {
      ...defaultThresholds,
      maxCostUSD: 10.0,
      maxDurationMs: 30 * 60 * 1000, // 30 min
      maxTokens: 1_000_000,
    });
  }

  /**
   * Set custom thresholds for a tenant
   */
  setThresholds(tenantId: string, thresholds: Partial<PolicyThresholds>) {
    const current = this.thresholds.get(tenantId) || this.thresholds.get('default')!;
    this.thresholds.set(tenantId, { ...current, ...thresholds });
  }

  /**
   * Get thresholds for a tenant
   */
  getThresholds(tenantId: string = 'default'): PolicyThresholds {
    return this.thresholds.get(tenantId) || this.thresholds.get('default')!;
  }

  /**
   * Start monitoring a run
   */
  startMonitoring(runId: string, tenantId: string = 'default') {
    logger.info({ runId, tenantId }, 'Starting anomaly monitoring');

    // Initialize snapshot
    this.runSnapshots.set(runId, {
      runId,
      timestamp: new Date(),
      costUSD: 0,
      durationMs: 0,
      tokensUsed: 0,
      llmCalls: 0,
      toolCalls: 0,
      errorRate: 0,
      toxicityScore: 0,
      metadata: {},
    });

    // Start periodic checks (every 10 seconds)
    const interval = setInterval(async () => {
      await this.checkAnomalies(runId, tenantId);
    }, 10000);

    this.monitoringIntervals.set(runId, interval);
  }

  /**
   * Stop monitoring a run
   */
  stopMonitoring(runId: string) {
    const interval = this.monitoringIntervals.get(runId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(runId);
    }

    this.runSnapshots.delete(runId);

    logger.info({ runId }, 'Stopped anomaly monitoring');
  }

  /**
   * Update telemetry for a run
   */
  updateTelemetry(runId: string, update: Partial<TelemetrySnapshot>) {
    const current = this.runSnapshots.get(runId);
    if (!current) {
      logger.warn({ runId }, 'No snapshot found for run');
      return;
    }

    this.runSnapshots.set(runId, {
      ...current,
      ...update,
      timestamp: new Date(),
    });
  }

  /**
   * Check for anomalies
   */
  private async checkAnomalies(runId: string, tenantId: string): Promise<boolean> {
    const snapshot = this.runSnapshots.get(runId);
    const thresholds = this.getThresholds(tenantId);

    if (!snapshot) {
      return false;
    }

    // Check cost
    if (snapshot.costUSD > thresholds.maxCostUSD) {
      await this.triggerKillSwitch(runId, {
        type: 'cost_exceeded',
        message: `Cost exceeded: $${snapshot.costUSD.toFixed(2)} > $${thresholds.maxCostUSD}`,
        snapshot,
        threshold: thresholds.maxCostUSD,
        actual: snapshot.costUSD,
      });
      return true;
    }

    // Check duration
    if (snapshot.durationMs > thresholds.maxDurationMs) {
      await this.triggerKillSwitch(runId, {
        type: 'time_exceeded',
        message: `Duration exceeded: ${(snapshot.durationMs / 1000).toFixed(0)}s > ${(thresholds.maxDurationMs / 1000).toFixed(0)}s`,
        snapshot,
        threshold: thresholds.maxDurationMs,
        actual: snapshot.durationMs,
      });
      return true;
    }

    // Check tokens
    if (snapshot.tokensUsed > thresholds.maxTokens) {
      await this.triggerKillSwitch(runId, {
        type: 'token_limit',
        message: `Token limit exceeded: ${snapshot.tokensUsed} > ${thresholds.maxTokens}`,
        snapshot,
        threshold: thresholds.maxTokens,
        actual: snapshot.tokensUsed,
      });
      return true;
    }

    // Check error rate
    if (snapshot.errorRate > thresholds.maxErrorRate) {
      await this.triggerKillSwitch(runId, {
        type: 'error_rate',
        message: `Error rate too high: ${(snapshot.errorRate * 100).toFixed(1)}% > ${(thresholds.maxErrorRate * 100).toFixed(1)}%`,
        snapshot,
        threshold: thresholds.maxErrorRate,
        actual: snapshot.errorRate,
      });
      return true;
    }

    // Check toxicity
    if (snapshot.toxicityScore > thresholds.maxToxicityScore) {
      await this.triggerKillSwitch(runId, {
        type: 'toxicity',
        message: `Toxicity score too high: ${snapshot.toxicityScore.toFixed(2)} > ${thresholds.maxToxicityScore}`,
        snapshot,
        threshold: thresholds.maxToxicityScore,
        actual: snapshot.toxicityScore,
      });
      return true;
    }

    return false;
  }

  /**
   * Manually trigger kill-switch
   */
  async triggerManual(runId: string, reason: string): Promise<void> {
    const snapshot = this.runSnapshots.get(runId);

    await this.triggerKillSwitch(runId, {
      type: 'manual',
      message: reason,
      snapshot: snapshot || {
        runId,
        timestamp: new Date(),
        costUSD: 0,
        durationMs: 0,
        tokensUsed: 0,
        llmCalls: 0,
        toolCalls: 0,
        errorRate: 0,
        toxicityScore: 0,
        metadata: {},
      },
    });
  }

  /**
   * Trigger kill-switch (pause run with snapshot)
   */
  private async triggerKillSwitch(runId: string, reason: PauseReason): Promise<void> {
    logger.warn({ runId, reason }, 'KILL SWITCH TRIGGERED');

    // Stop monitoring
    this.stopMonitoring(runId);

    // Get current run state
    const runState = await this.captureRunState(runId);

    // Create snapshot
    const snapshot: RunSnapshot = {
      runId,
      phase: runState.phase,
      state: runState.state,
      pausedAt: new Date(),
      reason,
      canResume: this.canResume(reason.type),
    };

    // Store snapshot in database
    await this.db.query(
      `
      INSERT INTO run_snapshots (run_id, phase, state, paused_at, reason, can_resume)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [
        snapshot.runId,
        snapshot.phase,
        JSON.stringify(snapshot.state),
        snapshot.pausedAt,
        JSON.stringify(snapshot.reason),
        snapshot.canResume,
      ]
    );

    // Update run status to 'paused'
    await this.db.query(
      `UPDATE runs SET status = 'paused', metadata = metadata || $1 WHERE id = $2`,
      [JSON.stringify({ pauseReason: reason }), runId]
    );

    // Emit event
    this.emit('run.paused', { runId, reason, snapshot });

    // TODO: Send notification to user/admin
  }

  /**
   * Capture current run state for snapshot
   */
  private async captureRunState(runId: string): Promise<{ phase: string; state: any }> {
    const result = await this.db.query(
      `SELECT current_phase, phase_data FROM runs WHERE id = $1`,
      [runId]
    );

    if (result.rows.length === 0) {
      return { phase: 'unknown', state: {} };
    }

    return {
      phase: result.rows[0].current_phase || 'unknown',
      state: result.rows[0].phase_data || {},
    };
  }

  /**
   * Determine if run can be resumed
   */
  private canResume(type: PauseReason['type']): boolean {
    // Manual pauses and policy violations can be resumed after intervention
    if (type === 'manual' || type === 'policy_violation') {
      return true;
    }

    // Cost/time exceeded can be resumed with higher limits
    if (type === 'cost_exceeded' || type === 'time_exceeded') {
      return true;
    }

    // Toxicity/error rate issues may require fixes
    return false;
  }

  /**
   * Resume a paused run
   */
  async resume(runId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT * FROM run_snapshots WHERE run_id = $1 ORDER BY paused_at DESC LIMIT 1`,
      [runId]
    );

    if (result.rows.length === 0) {
      throw new Error(`No snapshot found for run ${runId}`);
    }

    const snapshot = result.rows[0];

    if (!snapshot.can_resume) {
      throw new Error(`Run ${runId} cannot be resumed (reason: ${snapshot.reason.type})`);
    }

    // Restore run state
    await this.db.query(
      `UPDATE runs SET status = 'running', current_phase = $1, phase_data = $2 WHERE id = $3`,
      [snapshot.phase, snapshot.state, runId]
    );

    // Start monitoring again
    const tenantId = 'default'; // TODO: Get from run record
    this.startMonitoring(runId, tenantId);

    logger.info({ runId }, 'Run resumed from snapshot');

    this.emit('run.resumed', { runId });

    return true;
  }

  /**
   * Get statistics
   */
  async getStats(tenantId?: string): Promise<{
    totalPauses: number;
    byReason: Record<string, number>;
    avgDurationBeforePause: number;
  }> {
    const whereClause = tenantId ? `WHERE metadata->>'tenantId' = $1` : '';
    const params = tenantId ? [tenantId] : [];

    const result = await this.db.query(
      `
      SELECT
        COUNT(*) as total,
        json_object_agg(reason->>'type', cnt) as by_reason,
        AVG(EXTRACT(EPOCH FROM (paused_at - created_at)) * 1000) as avg_duration
      FROM run_snapshots
      LEFT JOIN runs ON runs.id = run_snapshots.run_id
      ${whereClause}
      CROSS JOIN LATERAL (
        SELECT reason->>'type' as type, COUNT(*) as cnt
        FROM run_snapshots
        GROUP BY reason->>'type'
      ) AS reason_counts
    `,
      params
    );

    const row = result.rows[0];

    return {
      totalPauses: parseInt(row.total || '0'),
      byReason: row.by_reason || {},
      avgDurationBeforePause: parseFloat(row.avg_duration || '0'),
    };
  }
}

// ============================================================================
// Database Migration
// ============================================================================

export const KILL_SWITCH_MIGRATION = `
-- Run snapshots table
CREATE TABLE IF NOT EXISTS run_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase VARCHAR(100) NOT NULL,
  state JSONB NOT NULL,
  paused_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reason JSONB NOT NULL,
  can_resume BOOLEAN DEFAULT false,
  resumed_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_run_snapshots_run_id ON run_snapshots(run_id);
CREATE INDEX IF NOT EXISTS idx_run_snapshots_paused_at ON run_snapshots(paused_at);
CREATE INDEX IF NOT EXISTS idx_run_snapshots_can_resume ON run_snapshots(can_resume);

COMMENT ON TABLE run_snapshots IS 'Snapshots of paused runs for resumption';
`;
