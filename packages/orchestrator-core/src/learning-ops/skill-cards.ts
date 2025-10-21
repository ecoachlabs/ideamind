/**
 * Skill Cards - Per-doer performance tracking
 *
 * Tracks strengths, weaknesses, best models, failure modes, and learning progress for each doer
 */

import pino from 'pino';
import { Pool } from 'pg';

const logger = pino({ name: 'skill-cards' });

export interface SkillCard {
  doer: string;
  phase: string;
  strengths: string[]; // e.g., ["fast iteration", "high gate pass rate"]
  weaknesses: string[]; // e.g., ["occasional contradictions", "cost overruns"]
  bestModels: string[]; // Top performing models for this doer
  failureModes: string[]; // Common failure patterns
  lossDelta7d: number; // CRL change over last 7 days (negative = improvement)
  lossDelta30d: number; // CRL change over last 30 days
  experiments: ExperimentSummary[]; // Recent experiments
  currentPolicy: string; // Active policy ID
  lastUpdated: Date;
}

export interface ExperimentSummary {
  experimentId: string;
  type: string;
  crlDelta: number;
  status: string;
  createdAt: Date;
}

export class SkillCards {
  constructor(private db: Pool) {}

  /**
   * Get skill card for a doer
   */
  async getSkillCard(doer: string): Promise<SkillCard | null> {
    const result = await this.db.query(`SELECT * FROM skill_cards WHERE doer = $1`, [doer]);

    if (result.rows.length === 0) {
      // Create default skill card
      return this.createDefaultSkillCard(doer);
    }

    return this.rowToSkillCard(result.rows[0]);
  }

  /**
   * Update skill card
   */
  async updateSkillCard(card: SkillCard): Promise<void> {
    logger.info({ doer: card.doer }, 'Updating skill card');

    await this.db.query(
      `INSERT INTO skill_cards (
        doer, phase, strengths, weaknesses, best_models,
        failure_modes, loss_delta_7d, loss_delta_30d,
        experiments, current_policy, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (doer) DO UPDATE SET
        phase = $2,
        strengths = $3,
        weaknesses = $4,
        best_models = $5,
        failure_modes = $6,
        loss_delta_7d = $7,
        loss_delta_30d = $8,
        experiments = $9,
        current_policy = $10,
        last_updated = NOW()`,
      [
        card.doer,
        card.phase,
        JSON.stringify(card.strengths),
        JSON.stringify(card.weaknesses),
        JSON.stringify(card.bestModels),
        JSON.stringify(card.failureModes),
        card.lossDelta7d,
        card.lossDelta30d,
        JSON.stringify(card.experiments),
        card.currentPolicy,
      ]
    );
  }

  /**
   * Refresh skill card from recent data
   */
  async refreshSkillCard(doer: string): Promise<SkillCard> {
    logger.info({ doer }, 'Refreshing skill card');

    // Compute CRL deltas
    const lossDelta7d = await this.computeCRLDelta(doer, 7);
    const lossDelta30d = await this.computeCRLDelta(doer, 30);

    // Find best models
    const bestModels = await this.findBestModels(doer, 5);

    // Find recent experiments
    const experiments = await this.getRecentExperiments(doer, 5);

    // Get current policy
    const currentPolicy = await this.getCurrentPolicy(doer);

    // Analyze strengths/weaknesses (simplified heuristics)
    const { strengths, weaknesses } = await this.analyzePerformance(doer);

    // Find failure modes
    const failureModes = await this.identifyFailureModes(doer);

    const card: SkillCard = {
      doer,
      phase: 'all', // TODO: Could be phase-specific
      strengths,
      weaknesses,
      bestModels,
      failureModes,
      lossDelta7d,
      lossDelta30d,
      experiments,
      currentPolicy,
      lastUpdated: new Date(),
    };

    await this.updateSkillCard(card);

    return card;
  }

  /**
   * Get all skill cards
   */
  async getAllSkillCards(): Promise<SkillCard[]> {
    const result = await this.db.query(`SELECT * FROM skill_cards ORDER BY doer`);

    return result.rows.map((row) => this.rowToSkillCard(row));
  }

  /**
   * Compute CRL delta for doer over days
   */
  private async computeCRLDelta(doer: string, days: number): Promise<number> {
    const result = await this.db.query(
      `SELECT
         AVG(CASE WHEN cr.timestamp > NOW() - INTERVAL '${days} days' THEN cr.loss_value END) as recent_avg,
         AVG(CASE WHEN cr.timestamp <= NOW() - INTERVAL '${days} days'
              AND cr.timestamp > NOW() - INTERVAL '${days * 2} days'
              THEN cr.loss_value END) as prev_avg
       FROM crl_results cr
       JOIN runs r ON r.id = cr.run_id
       WHERE r.doer = $1`,
      [doer]
    );

    const recentAvg = parseFloat(result.rows[0]?.recent_avg) || 0;
    const prevAvg = parseFloat(result.rows[0]?.prev_avg) || recentAvg;

    return recentAvg - prevAvg; // Negative = improvement
  }

  /**
   * Find best performing models for doer
   */
  private async findBestModels(doer: string, limit: number): Promise<string[]> {
    const result = await this.db.query(
      `SELECT model_used, AVG(cr.loss_value) as avg_loss
       FROM telemetry_events te
       JOIN runs r ON r.id = te.run_id
       JOIN crl_results cr ON cr.run_id = r.id
       WHERE r.doer = $1
       GROUP BY model_used
       ORDER BY avg_loss ASC
       LIMIT $2`,
      [doer, limit]
    );

    return result.rows.map((row) => row.model_used);
  }

  /**
   * Get recent experiments
   */
  private async getRecentExperiments(doer: string, limit: number): Promise<ExperimentSummary[]> {
    const result = await this.db.query(
      `SELECT id, type, (metrics->>'crlDelta')::float as crl_delta, status, created_at
       FROM experiments
       WHERE doer = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [doer, limit]
    );

    return result.rows.map((row) => ({
      experimentId: row.id,
      type: row.type,
      crlDelta: row.crl_delta,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get current active policy
   */
  private async getCurrentPolicy(doer: string): Promise<string> {
    const result = await this.db.query(
      `SELECT id FROM policies WHERE doer = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [doer]
    );

    return result.rows[0]?.id || 'default';
  }

  /**
   * Analyze performance for strengths/weaknesses
   */
  private async analyzePerformance(doer: string): Promise<{
    strengths: string[];
    weaknesses: string[];
  }> {
    // Simplified heuristics
    const result = await this.db.query(
      `SELECT
         AVG((terms->>'gatePass')::float) as avg_gate_pass,
         AVG((terms->>'contradictions')::float) as avg_contradictions,
         AVG((terms->>'grounding')::float) as avg_grounding,
         AVG((terms->>'costOverBudgetPct')::float) as avg_cost_over
       FROM crl_results cr
       JOIN runs r ON r.id = cr.run_id
       WHERE r.doer = $1
         AND cr.timestamp > NOW() - INTERVAL '30 days'`,
      [doer]
    );

    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (result.rows.length > 0) {
      const row = result.rows[0];

      if (row.avg_gate_pass > 0.9) strengths.push('High gate pass rate');
      if (row.avg_gate_pass < 0.7) weaknesses.push('Low gate pass rate');

      if (row.avg_contradictions < 0.1) strengths.push('Low contradiction rate');
      if (row.avg_contradictions > 0.2) weaknesses.push('High contradictions');

      if (row.avg_grounding > 0.85) strengths.push('Strong grounding');
      if (row.avg_grounding < 0.7) weaknesses.push('Poor grounding');

      if (row.avg_cost_over < 0.1) strengths.push('Budget adherence');
      if (row.avg_cost_over > 0.3) weaknesses.push('Frequent cost overruns');
    }

    return { strengths, weaknesses };
  }

  /**
   * Identify common failure modes
   */
  private async identifyFailureModes(doer: string): Promise<string[]> {
    const modes: string[] = [];

    // Check for frequent gate failures
    const gateResult = await this.db.query(
      `SELECT gate_id, COUNT(*) as fail_count
       FROM gate_evaluations ge
       JOIN runs r ON r.id = ge.run_id
       WHERE r.doer = $1 AND ge.passed = false
         AND ge.timestamp > NOW() - INTERVAL '30 days'
       GROUP BY gate_id
       ORDER BY fail_count DESC
       LIMIT 3`,
      [doer]
    );

    gateResult.rows.forEach((row) => {
      modes.push(`Frequent ${row.gate_id} gate failures (${row.fail_count})`);
    });

    // Check for timeout/resource issues
    const resourceResult = await this.db.query(
      `SELECT COUNT(*) as timeout_count
       FROM tasks t
       JOIN runs r ON r.id = t.run_id
       WHERE r.doer = $1 AND t.status = 'timeout'
         AND t.created_at > NOW() - INTERVAL '30 days'`,
      [doer]
    );

    if (parseInt(resourceResult.rows[0]?.timeout_count) > 5) {
      modes.push('Task timeouts');
    }

    return modes;
  }

  /**
   * Create default skill card
   */
  private async createDefaultSkillCard(doer: string): Promise<SkillCard> {
    const card: SkillCard = {
      doer,
      phase: 'all',
      strengths: [],
      weaknesses: [],
      bestModels: [],
      failureModes: [],
      lossDelta7d: 0,
      lossDelta30d: 0,
      experiments: [],
      currentPolicy: 'default',
      lastUpdated: new Date(),
    };

    await this.updateSkillCard(card);

    return card;
  }

  /**
   * Convert row to skill card
   */
  private rowToSkillCard(row: any): SkillCard {
    return {
      doer: row.doer,
      phase: row.phase,
      strengths: row.strengths,
      weaknesses: row.weaknesses,
      bestModels: row.best_models,
      failureModes: row.failure_modes,
      lossDelta7d: parseFloat(row.loss_delta_7d),
      lossDelta30d: parseFloat(row.loss_delta_30d),
      experiments: row.experiments,
      currentPolicy: row.current_policy,
      lastUpdated: row.last_updated,
    };
  }
}

export const SKILL_CARDS_MIGRATION = `
-- Skill cards table
CREATE TABLE IF NOT EXISTS skill_cards (
  doer VARCHAR(100) PRIMARY KEY,
  phase VARCHAR(100) NOT NULL,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  weaknesses JSONB NOT NULL DEFAULT '[]'::jsonb,
  best_models JSONB NOT NULL DEFAULT '[]'::jsonb,
  failure_modes JSONB NOT NULL DEFAULT '[]'::jsonb,
  loss_delta_7d DECIMAL(10, 6) NOT NULL DEFAULT 0,
  loss_delta_30d DECIMAL(10, 6) NOT NULL DEFAULT 0,
  experiments JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_policy VARCHAR(200),
  last_updated TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_cards_updated ON skill_cards(last_updated);

COMMENT ON TABLE skill_cards IS 'Per-doer performance tracking and learning progress';
`;
