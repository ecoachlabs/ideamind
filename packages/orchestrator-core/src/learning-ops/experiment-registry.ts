/**
 * Experiment Registry - Track learning experiments
 *
 * Tracks candidate policies, adapters, and heuristics with configuration and lineage
 */

import pino from 'pino';
import { Pool } from 'pg';

const logger = pino({ name: 'experiment-registry' });

export type ExperimentType = 'prompt_synthesis' | 'adapter_training' | 'tool_tuning' | 'rag_optimization';
export type ExperimentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ExperimentConfig {
  type: ExperimentType;
  doer: string;
  phase: string;
  parentPolicyId?: string;
  datasetId?: string;
  config: Record<string, any>; // Type-specific configuration
  seeds: number[]; // For deterministic replay
}

export interface ExperimentResult {
  experimentId: string;
  policyId?: string; // Generated policy (if successful)
  metrics: {
    crlDelta: number; // Change in CRL
    stability: number; // Stability across seeds (0-1)
    cost: number; // Experiment cost
    duration: number; // Duration in ms
  };
  offlineReplayResults?: any;
  shadowResults?: any;
  canaryResults?: any;
}

export class ExperimentRegistry {
  constructor(private db: Pool) {}

  /**
   * Create new experiment
   */
  async createExperiment(config: ExperimentConfig): Promise<string> {
    const experimentId = `exp_${config.type}_${Date.now()}`;

    logger.info({ experimentId, type: config.type }, 'Creating experiment');

    await this.db.query(
      `INSERT INTO experiments (
        id, type, doer, phase, parent_policy_id, dataset_id, config, seeds, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        experimentId,
        config.type,
        config.doer,
        config.phase,
        config.parentPolicyId,
        config.datasetId,
        JSON.stringify(config.config),
        JSON.stringify(config.seeds),
        'pending',
      ]
    );

    return experimentId;
  }

  /**
   * Update experiment status
   */
  async updateStatus(experimentId: string, status: ExperimentStatus, error?: string): Promise<void> {
    logger.info({ experimentId, status }, 'Updating experiment status');

    await this.db.query(
      `UPDATE experiments
       SET status = $1, error = $2, updated_at = NOW()
       WHERE id = $3`,
      [status, error, experimentId]
    );
  }

  /**
   * Record experiment result
   */
  async recordResult(experimentId: string, result: ExperimentResult): Promise<void> {
    logger.info({ experimentId, crlDelta: result.metrics.crlDelta }, 'Recording experiment result');

    await this.db.query(
      `UPDATE experiments
       SET policy_id = $1,
           metrics = $2,
           offline_replay_results = $3,
           shadow_results = $4,
           canary_results = $5,
           status = 'completed',
           completed_at = NOW()
       WHERE id = $6`,
      [
        result.policyId,
        JSON.stringify(result.metrics),
        JSON.stringify(result.offlineReplayResults),
        JSON.stringify(result.shadowResults),
        JSON.stringify(result.canaryResults),
        experimentId,
      ]
    );
  }

  /**
   * Get experiment by ID
   */
  async getExperiment(experimentId: string): Promise<any> {
    const result = await this.db.query(`SELECT * FROM experiments WHERE id = $1`, [experimentId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Get experiments for a doer
   */
  async getExperimentsByDoer(doer: string, limit: number = 20): Promise<any[]> {
    const result = await this.db.query(
      `SELECT * FROM experiments WHERE doer = $1 ORDER BY created_at DESC LIMIT $2`,
      [doer, limit]
    );

    return result.rows;
  }

  /**
   * Get successful experiments (CRL improvement)
   */
  async getSuccessfulExperiments(doer?: string, days?: number): Promise<any[]> {
    let query = `
      SELECT * FROM experiments
      WHERE status = 'completed'
        AND (metrics->>'crlDelta')::float < 0
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (doer) {
      query += ` AND doer = $${paramIndex}`;
      params.push(doer);
      paramIndex++;
    }

    if (days) {
      query += ` AND created_at > NOW() - INTERVAL '${days} days'`;
    }

    query += ` ORDER BY (metrics->>'crlDelta')::float ASC LIMIT 10`;

    const result = await this.db.query(query, params);
    return result.rows;
  }
}

export const EXPERIMENT_REGISTRY_MIGRATION = `
-- Experiments table
CREATE TABLE IF NOT EXISTS experiments (
  id VARCHAR(200) PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  doer VARCHAR(100) NOT NULL,
  phase VARCHAR(100) NOT NULL,
  parent_policy_id VARCHAR(200) REFERENCES policies(id),
  dataset_id VARCHAR(200),
  config JSONB NOT NULL,
  seeds JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  policy_id VARCHAR(200) REFERENCES policies(id),
  metrics JSONB,
  offline_replay_results JSONB,
  shadow_results JSONB,
  canary_results JSONB,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_experiments_doer ON experiments(doer);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);
CREATE INDEX IF NOT EXISTS idx_experiments_type ON experiments(type);
CREATE INDEX IF NOT EXISTS idx_experiments_created_at ON experiments(created_at);

COMMENT ON TABLE experiments IS 'Learning experiment tracking and results';
`;
