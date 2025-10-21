/**
 * Experiment Runner
 *
 * Roadmap: M6 - Synthetic Cohorts & Experimentation
 *
 * Tool: exp.runner
 *
 * Safe experiment framework with statistical guards.
 */

import pino from 'pino';
import { Pool } from 'pg';

const logger = pino({ name: 'experiment-runner' });

export interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  variants: ExperimentVariant[];
  metrics: string[];
  duration: number;
  trafficAllocation: number;
}

export interface ExperimentVariant {
  id: string;
  name: string;
  allocation: number;
  config: Record<string, any>;
}

export interface ExperimentResult {
  experimentId: string;
  variant: string;
  metrics: Record<string, number>;
  sampleSize: number;
  pValue?: number;
  significance: boolean;
}

export class ExperimentRunner {
  constructor(private db: Pool) {}

  async createExperiment(experiment: Experiment): Promise<string> {
    const result = await this.db.query(
      `INSERT INTO experiments (id, name, hypothesis, variants, metrics, duration, traffic_allocation, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft') RETURNING id`,
      [experiment.id, experiment.name, experiment.hypothesis, JSON.stringify(experiment.variants), JSON.stringify(experiment.metrics), experiment.duration, experiment.trafficAllocation]
    );

    logger.info({ experimentId: experiment.id }, 'Experiment created');
    return result.rows[0].id;
  }

  async runExperiment(experimentId: string): Promise<ExperimentResult[]> {
    await this.db.query(`UPDATE experiments SET status = 'running', started_at = NOW() WHERE id = $1`, [experimentId]);

    // TODO: Implement actual experiment execution
    const results: ExperimentResult[] = [];

    logger.info({ experimentId }, 'Experiment started');
    return results;
  }

  async analyzeResults(experimentId: string): Promise<ExperimentResult[]> {
    const result = await this.db.query(`SELECT * FROM experiment_results WHERE experiment_id = $1`, [experimentId]);

    return result.rows.map(row => ({
      experimentId: row.experiment_id,
      variant: row.variant,
      metrics: row.metrics,
      sampleSize: row.sample_size,
      pValue: row.p_value,
      significance: row.p_value < 0.05,
    }));
  }
}

export const EXPERIMENT_MIGRATION = `
CREATE TABLE IF NOT EXISTS experiments (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  hypothesis TEXT NOT NULL,
  variants JSONB NOT NULL,
  metrics JSONB NOT NULL,
  duration INTEGER NOT NULL,
  traffic_allocation NUMERIC(3,2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS experiment_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id VARCHAR(100) REFERENCES experiments(id) ON DELETE CASCADE,
  variant VARCHAR(100) NOT NULL,
  metrics JSONB NOT NULL,
  sample_size INTEGER NOT NULL,
  p_value NUMERIC(10,8),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;
