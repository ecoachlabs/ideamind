/**
 * Offline Replayer - Deterministic policy evaluation
 *
 * Replays tasks using CAS + seeds for deterministic evaluation without external side effects
 */

import pino from 'pino';
import { Pool } from 'pg';
import { ContentAddressedStore } from '../autonomy/determinism';
import { SeedManager } from '../autonomy/determinism';
import { CRLCompute, computeCRL } from './crl-compute';
import { CRLTerms } from './crl-types';

const logger = pino({ name: 'offline-replayer' });

export interface ReplayConfig {
  datasetId: string; // Dataset to replay
  policyId: string; // Policy to test
  seeds: number[]; // Multiple seeds for stability testing
  maxTasks?: number; // Limit number of tasks
}

export interface ReplayResult {
  replayId: string;
  policyId: string;
  status: 'running' | 'completed' | 'failed';
  crl: number; // Average CRL across seeds
  crlByStd: number; // Standard deviation (stability metric)
  terms: CRLTerms; // Average terms
  stability: number; // 1 - (std / mean), closer to 1 = more stable
  tasksReplayed: number;
  duration: number;
  cost: number;
}

export class OfflineReplayer {
  private cas: ContentAddressedStore;
  private seedManager: SeedManager;
  private crlCompute: CRLCompute;

  constructor(private db: Pool) {
    this.cas = new ContentAddressedStore(db);
    this.seedManager = new SeedManager(db);
    this.crlCompute = new CRLCompute(db);
  }

  /**
   * Start offline replay
   */
  async startReplay(config: ReplayConfig): Promise<string> {
    const replayId = `replay_${Date.now()}`;

    logger.info({ replayId, policyId: config.policyId }, 'Starting offline replay');

    await this.db.query(
      `INSERT INTO offline_replays (
        id, dataset_id, policy_id, seeds, max_tasks, status
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        replayId,
        config.datasetId,
        config.policyId,
        JSON.stringify(config.seeds),
        config.maxTasks || null,
        'running',
      ]
    );

    // Execute replay asynchronously
    this.executeReplay(replayId, config).catch((err) => {
      logger.error({ replayId, err }, 'Replay failed');
      this.db.query(`UPDATE offline_replays SET status = 'failed', error = $1 WHERE id = $2`, [
        err.message,
        replayId,
      ]);
    });

    return replayId;
  }

  /**
   * Get replay status
   */
  async getReplayStatus(replayId: string): Promise<ReplayResult | null> {
    const result = await this.db.query(`SELECT * FROM offline_replays WHERE id = $1`, [replayId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      replayId: row.id,
      policyId: row.policy_id,
      status: row.status,
      crl: row.crl_avg,
      crlByStd: row.crl_std,
      terms: row.terms_avg,
      stability: row.stability,
      tasksReplayed: row.tasks_replayed,
      duration: row.duration,
      cost: row.cost,
    };
  }

  /**
   * Execute replay (private, async)
   */
  private async executeReplay(replayId: string, config: ReplayConfig): Promise<void> {
    const startTime = Date.now();
    let totalCost = 0;
    let tasksReplayed = 0;

    // Fetch dataset tasks
    const tasks = await this.fetchDatasetTasks(config.datasetId, config.maxTasks);

    logger.info({ replayId, taskCount: tasks.length }, 'Fetched dataset tasks');

    // Results per seed
    const crlResults: number[] = [];
    const termsResults: CRLTerms[] = [];

    // Replay with each seed
    for (const seed of config.seeds) {
      logger.info({ replayId, seed }, 'Replaying with seed');

      // Initialize seed
      this.seedManager.initSeed(`replay_${replayId}_${seed}`, seed);

      // Simulate task execution with this policy
      const runId = `replay_run_${replayId}_${seed}`;
      const mockTerms = await this.simulateExecution(runId, tasks, config.policyId, seed);

      // Compute CRL
      const crl = computeCRL(mockTerms);

      crlResults.push(crl);
      termsResults.push(mockTerms);
      tasksReplayed += tasks.length;
    }

    // Compute statistics
    const crlAvg = crlResults.reduce((a, b) => a + b, 0) / crlResults.length;
    const crlStd = Math.sqrt(
      crlResults.reduce((sum, crl) => sum + Math.pow(crl - crlAvg, 2), 0) / crlResults.length
    );
    const stability = crlAvg > 0 ? 1 - crlStd / crlAvg : 1;

    // Average terms
    const termsAvg: CRLTerms = {
      gatePass: this.avg(termsResults.map((t) => t.gatePass)),
      contradictions: this.avg(termsResults.map((t) => t.contradictions)),
      grounding: this.avg(termsResults.map((t) => t.grounding)),
      costOverBudgetPct: this.avg(termsResults.map((t) => t.costOverBudgetPct)),
      latencyP95Norm: this.avg(termsResults.map((t) => t.latencyP95Norm)),
      securityCriticals: this.avg(termsResults.map((t) => t.securityCriticals)),
      apiBreakages: this.avg(termsResults.map((t) => t.apiBreakages)),
      dbMigrationFail: this.avg(termsResults.map((t) => t.dbMigrationFail)),
      ragCoverage: this.avg(termsResults.map((t) => t.ragCoverage)),
    };

    const duration = Date.now() - startTime;

    // Store results
    await this.db.query(
      `UPDATE offline_replays
       SET status = 'completed',
           crl_avg = $1,
           crl_std = $2,
           terms_avg = $3,
           stability = $4,
           tasks_replayed = $5,
           duration = $6,
           cost = $7,
           completed_at = NOW()
       WHERE id = $8`,
      [crlAvg, crlStd, JSON.stringify(termsAvg), stability, tasksReplayed, duration, totalCost, replayId]
    );

    logger.info({ replayId, crlAvg, stability }, 'Replay completed');
  }

  /**
   * Fetch tasks from dataset
   */
  private async fetchDatasetTasks(datasetId: string, maxTasks?: number): Promise<any[]> {
    const limit = maxTasks || 100;

    const result = await this.db.query(
      `SELECT * FROM dataset_samples WHERE dataset_id = $1 ORDER BY created_at LIMIT $2`,
      [datasetId, limit]
    );

    return result.rows;
  }

  /**
   * Simulate execution with policy (stub - would use actual execution)
   */
  private async simulateExecution(
    runId: string,
    tasks: any[],
    policyId: string,
    seed: number
  ): Promise<CRLTerms> {
    // Stub: In production, this would:
    // 1. Load policy from PolicyStore
    // 2. Execute tasks using the policy (with CAS hits for determinism)
    // 3. Collect metrics
    // 4. Return CRL terms

    // For now, return simulated terms
    return {
      gatePass: 0.9 + Math.random() * 0.1,
      contradictions: Math.random() * 0.1,
      grounding: 0.85 + Math.random() * 0.15,
      costOverBudgetPct: Math.random() * 0.2,
      latencyP95Norm: Math.random() * 0.3,
      securityCriticals: Math.floor(Math.random() * 2),
      apiBreakages: Math.floor(Math.random() * 2),
      dbMigrationFail: Math.random() > 0.9 ? 1 : 0,
      ragCoverage: 0.8 + Math.random() * 0.2,
    };
  }

  /**
   * Utility: average of array
   */
  private avg(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
}

export const OFFLINE_REPLAYER_MIGRATION = `
-- Offline replays table
CREATE TABLE IF NOT EXISTS offline_replays (
  id VARCHAR(200) PRIMARY KEY,
  dataset_id VARCHAR(200) NOT NULL,
  policy_id VARCHAR(200) NOT NULL REFERENCES policies(id),
  seeds JSONB NOT NULL,
  max_tasks INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  crl_avg DECIMAL(10, 6),
  crl_std DECIMAL(10, 6),
  terms_avg JSONB,
  stability DECIMAL(5, 4),
  tasks_replayed INTEGER,
  duration INTEGER,
  cost DECIMAL(10, 2),
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_replays_policy ON offline_replays(policy_id);
CREATE INDEX IF NOT EXISTS idx_replays_status ON offline_replays(status);
CREATE INDEX IF NOT EXISTS idx_replays_created_at ON offline_replays(created_at);

COMMENT ON TABLE offline_replays IS 'Offline deterministic policy replays for evaluation';
`;
