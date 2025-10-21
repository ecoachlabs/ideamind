import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'metrics-collector' });

/**
 * Phase metrics
 */
export interface PhaseMetrics {
  phase: string;
  run_id: string;

  // Duration metrics
  duration_ms: number;
  started_at: Date;
  completed_at: Date;

  // Gate metrics
  gate_pass: boolean;
  gate_score: number;
  gate_retries: number;

  // Agent metrics
  agents_count: number;
  agents_succeeded: number;
  agents_failed: number;

  // Resource metrics
  tokens_used: number;
  tools_minutes_used: number;
  cost_usd: number;

  // Quality metrics (optional, phase-specific)
  test_pass_percent?: number;
  coverage_percent?: number;
  unsupported_claims_count?: number;
  cves_count?: number;
}

/**
 * Aggregate metrics for entire run
 */
export interface AggregateMetrics {
  total_duration_ms: number;
  total_cost_usd: number;
  total_tokens: number;
  phases_completed: number;
  phases_failed: number;
  gate_pass_rate: number;
}

/**
 * Metrics Collector - Structured metrics for all phases
 *
 * Features:
 * - Track phase-level metrics
 * - Aggregate run-level metrics
 * - Calculate percentiles and trends
 * - Persist to database for analysis
 *
 * Spec: orchestrator.txt:198, phase.txt:119-122
 */
export class MetricsCollector {
  private metrics: Map<string, PhaseMetrics> = new Map();

  constructor(private pool: Pool) {}

  /**
   * Start tracking metrics for phase
   */
  startPhase(runId: string, phase: string): void {
    const key = `${runId}-${phase}`;

    this.metrics.set(key, {
      phase,
      run_id: runId,
      duration_ms: 0,
      started_at: new Date(),
      completed_at: new Date(),
      gate_pass: false,
      gate_score: 0,
      gate_retries: 0,
      agents_count: 0,
      agents_succeeded: 0,
      agents_failed: 0,
      tokens_used: 0,
      tools_minutes_used: 0,
      cost_usd: 0,
    });

    logger.debug({ runId, phase }, 'Phase metrics tracking started');
  }

  /**
   * Record agent execution result
   */
  recordAgentResult(runId: string, phase: string, success: boolean): void {
    const key = `${runId}-${phase}`;
    const metrics = this.metrics.get(key);

    if (!metrics) {
      logger.warn({ runId, phase }, 'No metrics found for phase');
      return;
    }

    metrics.agents_count++;

    if (success) {
      metrics.agents_succeeded++;
    } else {
      metrics.agents_failed++;
    }

    logger.debug({ runId, phase, success, count: metrics.agents_count }, 'Agent result recorded');
  }

  /**
   * Record resource usage
   */
  recordResourceUsage(
    runId: string,
    phase: string,
    usage: {
      tokens: number;
      tools_minutes: number;
      cost_usd: number;
    }
  ): void {
    const key = `${runId}-${phase}`;
    const metrics = this.metrics.get(key);

    if (!metrics) {
      logger.warn({ runId, phase }, 'No metrics found for phase');
      return;
    }

    metrics.tokens_used += usage.tokens;
    metrics.tools_minutes_used += usage.tools_minutes;
    metrics.cost_usd += usage.cost_usd;

    logger.debug({ runId, phase, usage }, 'Resource usage recorded');
  }

  /**
   * Record gate evaluation result
   */
  recordGateResult(
    runId: string,
    phase: string,
    result: {
      pass: boolean;
      score: number;
    }
  ): void {
    const key = `${runId}-${phase}`;
    const metrics = this.metrics.get(key);

    if (!metrics) {
      logger.warn({ runId, phase }, 'No metrics found for phase');
      return;
    }

    metrics.gate_pass = result.pass;
    metrics.gate_score = result.score;

    if (!result.pass) {
      metrics.gate_retries++;
    }

    logger.debug({ runId, phase, pass: result.pass, score: result.score }, 'Gate result recorded');
  }

  /**
   * Record quality metrics (phase-specific)
   */
  recordQualityMetrics(
    runId: string,
    phase: string,
    qualityMetrics: {
      test_pass_percent?: number;
      coverage_percent?: number;
      unsupported_claims_count?: number;
      cves_count?: number;
    }
  ): void {
    const key = `${runId}-${phase}`;
    const metrics = this.metrics.get(key);

    if (!metrics) {
      logger.warn({ runId, phase }, 'No metrics found for phase');
      return;
    }

    Object.assign(metrics, qualityMetrics);

    logger.debug({ runId, phase, qualityMetrics }, 'Quality metrics recorded');
  }

  /**
   * Complete phase and persist metrics
   */
  async completePhase(runId: string, phase: string): Promise<PhaseMetrics> {
    const key = `${runId}-${phase}`;
    const metrics = this.metrics.get(key);

    if (!metrics) {
      throw new Error(`No metrics found for ${key}`);
    }

    metrics.completed_at = new Date();
    metrics.duration_ms = metrics.completed_at.getTime() - metrics.started_at.getTime();

    // Persist to database
    await this.persistMetrics(metrics);

    logger.info(
      {
        runId,
        phase,
        durationMs: metrics.duration_ms,
        costUsd: metrics.cost_usd,
        gatePass: metrics.gate_pass,
      },
      'Phase metrics completed and persisted'
    );

    return metrics;
  }

  /**
   * Persist metrics to database
   */
  private async persistMetrics(metrics: PhaseMetrics): Promise<void> {
    try {
      await this.pool.query(
        `
        INSERT INTO phase_metrics (run_id, phase, data, created_at)
        VALUES ($1, $2, $3, NOW())
        `,
        [metrics.run_id, metrics.phase, JSON.stringify(metrics)]
      );
    } catch (error) {
      logger.error({ error, metrics }, 'Failed to persist metrics');
      throw error;
    }
  }

  /**
   * Get aggregate metrics for run
   */
  async getAggregateMetrics(runId: string): Promise<AggregateMetrics> {
    try {
      const result = await this.pool.query(
        `
        SELECT
          SUM((data->>'duration_ms')::int) as total_duration_ms,
          SUM((data->>'cost_usd')::float) as total_cost_usd,
          SUM((data->>'tokens_used')::int) as total_tokens,
          COUNT(CASE WHEN (data->>'gate_pass')::boolean = true THEN 1 END) as phases_completed,
          COUNT(CASE WHEN (data->>'gate_pass')::boolean = false THEN 1 END) as phases_failed
        FROM phase_metrics
        WHERE run_id = $1
        `,
        [runId]
      );

      const row = result.rows[0];

      const phasesCompleted = parseInt(row.phases_completed, 10) || 0;
      const phasesFailed = parseInt(row.phases_failed, 10) || 0;
      const totalPhases = phasesCompleted + phasesFailed;

      return {
        total_duration_ms: parseInt(row.total_duration_ms, 10) || 0,
        total_cost_usd: parseFloat(row.total_cost_usd) || 0,
        total_tokens: parseInt(row.total_tokens, 10) || 0,
        phases_completed: phasesCompleted,
        phases_failed: phasesFailed,
        gate_pass_rate: totalPhases > 0 ? phasesCompleted / totalPhases : 0,
      };
    } catch (error) {
      logger.error({ error, runId }, 'Failed to get aggregate metrics');
      throw error;
    }
  }

  /**
   * Get P95 latency for phase
   */
  async getP95Latency(phase: string, timeWindowHours: number = 24): Promise<number> {
    try {
      const since = new Date(Date.now() - timeWindowHours * 3600000);

      const result = await this.pool.query(
        `
        SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (data->>'duration_ms')::int) as p95
        FROM phase_metrics
        WHERE phase = $1 AND created_at > $2
        `,
        [phase, since]
      );

      return parseInt(result.rows[0].p95, 10) || 0;
    } catch (error) {
      logger.error({ error, phase }, 'Failed to get P95 latency');
      throw error;
    }
  }

  /**
   * Get cost trend for phase
   */
  async getCostTrend(
    phase: string,
    timeWindowHours: number = 24
  ): Promise<Array<{ timestamp: Date; cost_usd: number }>> {
    try {
      const since = new Date(Date.now() - timeWindowHours * 3600000);

      const result = await this.pool.query(
        `
        SELECT
          created_at as timestamp,
          (data->>'cost_usd')::float as cost_usd
        FROM phase_metrics
        WHERE phase = $1 AND created_at > $2
        ORDER BY created_at ASC
        `,
        [phase, since]
      );

      return result.rows.map((row) => ({
        timestamp: row.timestamp,
        cost_usd: parseFloat(row.cost_usd) || 0,
      }));
    } catch (error) {
      logger.error({ error, phase }, 'Failed to get cost trend');
      throw error;
    }
  }

  /**
   * Get success rate for phase
   */
  async getSuccessRate(phase: string, timeWindowHours: number = 24): Promise<number> {
    try {
      const since = new Date(Date.now() - timeWindowHours * 3600000);

      const result = await this.pool.query(
        `
        SELECT
          COUNT(CASE WHEN (data->>'gate_pass')::boolean = true THEN 1 END) as successes,
          COUNT(*) as total
        FROM phase_metrics
        WHERE phase = $1 AND created_at > $2
        `,
        [phase, since]
      );

      const row = result.rows[0];
      const successes = parseInt(row.successes, 10) || 0;
      const total = parseInt(row.total, 10) || 0;

      return total > 0 ? successes / total : 0;
    } catch (error) {
      logger.error({ error, phase }, 'Failed to get success rate');
      throw error;
    }
  }

  /**
   * Get current metrics for phase (before completion)
   */
  getCurrentMetrics(runId: string, phase: string): PhaseMetrics | null {
    const key = `${runId}-${phase}`;
    return this.metrics.get(key) || null;
  }

  /**
   * Clear in-memory metrics (cleanup)
   */
  clearPhaseMetrics(runId: string, phase: string): void {
    const key = `${runId}-${phase}`;
    this.metrics.delete(key);
    logger.debug({ runId, phase }, 'Phase metrics cleared from memory');
  }
}
