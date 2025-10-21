/**
 * Composite Run Loss (CRL) Computation Service
 *
 * Computes a single scalar metric for run quality
 */

import pino from 'pino';
import { Pool } from 'pg';
import { CRLTerms, CRLWeights, CRLResult, DEFAULT_CRL_WEIGHTS } from './crl-types';

const logger = pino({ name: 'crl-compute' });

/**
 * Normalize value to 0-1 range
 */
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Compute Composite Run Loss
 *
 * Formula:
 * L = wq·(1−GatePassRate)
 *   + wg·ContradictionRate
 *   + wr·(1−GroundingScore)
 *   + wc·CostOverBudgetPct
 *   + wt·LatencyP95Norm
 *   + ws·SecurityCriticals
 *   + wa·APIBreakages
 *   + wd·DBMigrationFail
 *   + wrag·(1−RAGCoverage)
 */
export function computeCRL(
  terms: CRLTerms,
  weights: CRLWeights = DEFAULT_CRL_WEIGHTS
): number {
  const L =
    weights.wq * (1 - terms.gatePass) +
    weights.wg * terms.contradictions +
    weights.wr * (1 - terms.grounding) +
    weights.wc * normalize(terms.costOverBudgetPct, 0, 1) +
    weights.wt * terms.latencyP95Norm +
    weights.ws * normalize(terms.securityCriticals, 0, 10) +
    weights.wa * normalize(terms.apiBreakages, 0, 5) +
    weights.wd * terms.dbMigrationFail +
    weights.wrag * (1 - terms.ragCoverage);

  return L;
}

export class CRLCompute {
  constructor(private db: Pool) {}

  /**
   * Compute CRL for a run
   */
  async computeForRun(runId: string, customWeights?: CRLWeights): Promise<CRLResult> {
    logger.info({ runId }, 'Computing CRL for run');

    // Fetch run metrics from database
    const terms = await this.fetchRunTerms(runId);
    const weights = customWeights || (await this.getWeightsForRun(runId)) || DEFAULT_CRL_WEIGHTS;

    const L = computeCRL(terms, weights);

    const result: CRLResult = {
      L,
      terms,
      weights,
      normalized: true,
      timestamp: new Date(),
    };

    // Store CRL result
    await this.storeCRLResult(runId, result);

    logger.info({ runId, L }, 'CRL computed');

    return result;
  }

  /**
   * Fetch terms for a run from database
   */
  private async fetchRunTerms(runId: string): Promise<CRLTerms> {
    // Fetch gate pass rate
    const gateResult = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE passed = true) as passed,
         COUNT(*) as total
       FROM gate_evaluations
       WHERE run_id = $1`,
      [runId]
    );

    const gatePass =
      gateResult.rows[0].total > 0 ? gateResult.rows[0].passed / gateResult.rows[0].total : 1;

    // Fetch contradictions from QAV
    const contradictionResult = await this.db.query(
      `SELECT COUNT(*) as count
       FROM qav_validations
       WHERE run_id = $1 AND has_contradiction = true`,
      [runId]
    );

    const totalValidations = await this.db.query(
      `SELECT COUNT(*) as count FROM qav_validations WHERE run_id = $1`,
      [runId]
    );

    const contradictions =
      totalValidations.rows[0].count > 0
        ? contradictionResult.rows[0].count / totalValidations.rows[0].count
        : 0;

    // Fetch grounding score
    const groundingResult = await this.db.query(
      `SELECT AVG(grounding_score) as avg_grounding
       FROM qav_validations
       WHERE run_id = $1`,
      [runId]
    );

    const grounding = groundingResult.rows[0].avg_grounding || 0;

    // Fetch cost metrics
    const costResult = await this.db.query(
      `SELECT
         total_cost,
         budget,
         GREATEST(0, (total_cost - budget) / budget) as over_budget_pct
       FROM cost_tracking
       WHERE run_id = $1`,
      [runId]
    );

    const costOverBudgetPct = costResult.rows[0]?.over_budget_pct || 0;

    // Fetch latency
    const latencyResult = await this.db.query(
      `SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration) as p95
       FROM task_executions
       WHERE run_id = $1`,
      [runId]
    );

    const latencyP95 = latencyResult.rows[0]?.p95 || 0;
    const latencyP95Norm = normalize(latencyP95, 0, 60000); // Normalize to 0-60s

    // Fetch security criticals
    const securityResult = await this.db.query(
      `SELECT COUNT(*) as count
       FROM security_findings
       WHERE run_id = $1 AND severity = 'critical'`,
      [runId]
    );

    const securityCriticals = securityResult.rows[0]?.count || 0;

    // Fetch API breakages
    const apiResult = await this.db.query(
      `SELECT COUNT(*) as count
       FROM api_breakages
       WHERE run_id = $1`,
      [runId]
    );

    const apiBreakages = apiResult.rows[0]?.count || 0;

    // Fetch DB migration failures
    const dbResult = await this.db.query(
      `SELECT COUNT(*) as count
       FROM db_migrations
       WHERE run_id = $1 AND rehearsal_success = false`,
      [runId]
    );

    const dbMigrationFail = dbResult.rows[0]?.count > 0 ? 1 : 0;

    // Fetch RAG coverage
    const ragResult = await this.db.query(
      `SELECT AVG(citation_coverage) as avg_coverage
       FROM rag_quality_reports
       WHERE run_id = $1`,
      [runId]
    );

    const ragCoverage = ragResult.rows[0]?.avg_coverage || 0;

    return {
      gatePass,
      contradictions,
      grounding,
      costOverBudgetPct,
      latencyP95Norm,
      securityCriticals,
      apiBreakages,
      dbMigrationFail,
      ragCoverage,
    };
  }

  /**
   * Get custom weights for a run (from policy or tenant settings)
   */
  private async getWeightsForRun(runId: string): Promise<CRLWeights | null> {
    const result = await this.db.query(
      `SELECT crl_weights
       FROM runs
       WHERE id = $1`,
      [runId]
    );

    return result.rows[0]?.crl_weights || null;
  }

  /**
   * Store CRL result
   */
  private async storeCRLResult(runId: string, result: CRLResult): Promise<void> {
    await this.db.query(
      `INSERT INTO crl_results (run_id, loss_value, terms, weights, timestamp)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (run_id) DO UPDATE SET
         loss_value = $2,
         terms = $3,
         weights = $4,
         timestamp = $5`,
      [runId, result.L, JSON.stringify(result.terms), JSON.stringify(result.weights), result.timestamp]
    );
  }

  /**
   * Get CRL trend for a tenant or phase
   */
  async getCRLTrend(options: {
    tenantId?: string;
    phase?: string;
    days?: number;
  }): Promise<Array<{ date: Date; avgLoss: number; count: number }>> {
    const days = options.days || 30;

    let query = `
      SELECT
        DATE_TRUNC('day', timestamp) as date,
        AVG(loss_value) as avg_loss,
        COUNT(*) as count
      FROM crl_results cr
      JOIN runs r ON r.id = cr.run_id
      WHERE timestamp > NOW() - INTERVAL '${days} days'
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (options.tenantId) {
      query += ` AND r.tenant_id = $${paramIndex}`;
      params.push(options.tenantId);
      paramIndex++;
    }

    if (options.phase) {
      query += ` AND r.phase = $${paramIndex}`;
      params.push(options.phase);
      paramIndex++;
    }

    query += ` GROUP BY DATE_TRUNC('day', timestamp) ORDER BY date`;

    const result = await this.db.query(query, params);

    return result.rows.map((row) => ({
      date: row.date,
      avgLoss: parseFloat(row.avg_loss),
      count: parseInt(row.count),
    }));
  }
}

export const CRL_COMPUTE_MIGRATION = `
-- CRL results table
CREATE TABLE IF NOT EXISTS crl_results (
  run_id VARCHAR(100) PRIMARY KEY REFERENCES runs(id),
  loss_value DECIMAL(10, 6) NOT NULL,
  terms JSONB NOT NULL,
  weights JSONB NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crl_timestamp ON crl_results(timestamp);
CREATE INDEX IF NOT EXISTS idx_crl_loss_value ON crl_results(loss_value);

COMMENT ON TABLE crl_results IS 'Composite Run Loss calculations per run';
`;
