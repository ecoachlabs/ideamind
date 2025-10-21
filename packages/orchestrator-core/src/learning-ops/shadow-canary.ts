/**
 * Shadow/Canary Controller
 *
 * Routes traffic percentage to candidate policies and compares online CRL
 */

import pino from 'pino';
import { Pool } from 'pg';
import { EventEmitter } from 'events';

const logger = pino({ name: 'shadow-canary' });

export type DeploymentMode = 'shadow' | 'canary';

export interface ShadowConfig {
  doer: string;
  candidatePolicyId: string;
  controlPolicyId: string;
  allocationPct: number; // Percentage of traffic (0-100)
}

export interface CanaryConfig extends ShadowConfig {
  minJobs: number; // Minimum jobs before decision
  maxDurationHours: number; // Maximum canary duration
  autoPromote: boolean; // Auto-promote if successful
  safetyThresholds: {
    maxCRLIncrease: number; // Max CRL increase allowed
    minSampleSize: number; // Min samples for statistical significance
  };
}

export interface CanaryReport {
  canaryId: string;
  crlControl: number;
  crlCandidate: number;
  delta: number; // Negative = improvement
  deltaPercent: number;
  pValue: number; // Statistical significance
  sampleSize: number;
  recommendation: 'promote' | 'rollback' | 'continue';
  safetyPassed: boolean;
}

export class ShadowCanaryController extends EventEmitter {
  constructor(private db: Pool) {
    super();
  }

  /**
   * Start shadow deployment
   */
  async startShadow(config: ShadowConfig): Promise<string> {
    const shadowId = `shadow_${config.doer}_${Date.now()}`;

    logger.info({ shadowId, doer: config.doer }, 'Starting shadow deployment');

    await this.db.query(
      `INSERT INTO shadow_deployments (
        id, doer, candidate_policy_id, control_policy_id, allocation_pct, mode
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [shadowId, config.doer, config.candidatePolicyId, config.controlPolicyId, config.allocationPct, 'shadow']
    );

    return shadowId;
  }

  /**
   * Start canary deployment
   */
  async startCanary(config: CanaryConfig): Promise<string> {
    const canaryId = `canary_${config.doer}_${Date.now()}`;

    logger.info({ canaryId, doer: config.doer }, 'Starting canary deployment');

    await this.db.query(
      `INSERT INTO shadow_deployments (
        id, doer, candidate_policy_id, control_policy_id, allocation_pct,
        mode, min_jobs, max_duration_hours, auto_promote, safety_thresholds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        canaryId,
        config.doer,
        config.candidatePolicyId,
        config.controlPolicyId,
        config.allocationPct,
        'canary',
        config.minJobs,
        config.maxDurationHours,
        config.autoPromote,
        JSON.stringify(config.safetyThresholds),
      ]
    );

    return canaryId;
  }

  /**
   * Route task to control or candidate
   */
  async routeTask(doer: string, taskId: string): Promise<string> {
    // Check for active shadow/canary deployment
    const deployment = await this.getActiveDeployment(doer);

    if (!deployment) {
      // No deployment, use active policy
      return 'active';
    }

    // Determine routing (simple random allocation)
    const random = Math.random() * 100;

    if (random < deployment.allocation_pct) {
      // Route to candidate
      await this.recordRouting(deployment.id, taskId, 'candidate');
      return 'candidate';
    } else {
      // Route to control
      await this.recordRouting(deployment.id, taskId, 'control');
      return 'control';
    }
  }

  /**
   * Get canary report
   */
  async getCanaryReport(canaryId: string): Promise<CanaryReport | null> {
    const deployment = await this.db.query(
      `SELECT * FROM shadow_deployments WHERE id = $1 AND mode = 'canary'`,
      [canaryId]
    );

    if (deployment.rows.length === 0) {
      return null;
    }

    const d = deployment.rows[0];

    // Fetch CRL metrics for control and candidate
    const controlMetrics = await this.getMetricsForPolicy(canaryId, 'control');
    const candidateMetrics = await this.getMetricsForPolicy(canaryId, 'candidate');

    if (!controlMetrics || !candidateMetrics) {
      return null;
    }

    const delta = candidateMetrics.avgCRL - controlMetrics.avgCRL;
    const deltaPercent = controlMetrics.avgCRL > 0 ? (delta / controlMetrics.avgCRL) * 100 : 0;

    // Compute p-value (simplified t-test)
    const pValue = this.computePValue(
      controlMetrics.avgCRL,
      candidateMetrics.avgCRL,
      controlMetrics.stdCRL,
      candidateMetrics.stdCRL,
      controlMetrics.count,
      candidateMetrics.count
    );

    const sampleSize = controlMetrics.count + candidateMetrics.count;

    // Determine recommendation
    const safetyPassed =
      delta <= d.safety_thresholds.maxCRLIncrease && sampleSize >= d.safety_thresholds.minSampleSize;

    let recommendation: 'promote' | 'rollback' | 'continue';

    if (sampleSize < d.min_jobs) {
      recommendation = 'continue';
    } else if (delta < 0 && pValue < 0.05 && safetyPassed) {
      recommendation = 'promote';
    } else if (delta > 0 || !safetyPassed) {
      recommendation = 'rollback';
    } else {
      recommendation = 'continue';
    }

    return {
      canaryId,
      crlControl: controlMetrics.avgCRL,
      crlCandidate: candidateMetrics.avgCRL,
      delta,
      deltaPercent,
      pValue,
      sampleSize,
      recommendation,
      safetyPassed,
    };
  }

  /**
   * Promote candidate
   */
  async promote(canaryId: string): Promise<void> {
    logger.info({ canaryId }, 'Promoting candidate policy');

    const deployment = await this.db.query(`SELECT * FROM shadow_deployments WHERE id = $1`, [canaryId]);

    if (deployment.rows.length === 0) {
      throw new Error(`Deployment ${canaryId} not found`);
    }

    const candidatePolicyId = deployment.rows[0].candidate_policy_id;

    // Mark deployment as promoted
    await this.db.query(
      `UPDATE shadow_deployments SET status = 'promoted', promoted_at = NOW() WHERE id = $1`,
      [canaryId]
    );

    // Promote policy to active (handled by PolicyStore)
    this.emit('promote', { canaryId, policyId: candidatePolicyId });
  }

  /**
   * Rollback deployment
   */
  async rollback(canaryId: string, reason: string): Promise<void> {
    logger.warn({ canaryId, reason }, 'Rolling back deployment');

    await this.db.query(
      `UPDATE shadow_deployments
       SET status = 'rolled_back', rollback_reason = $1, rolled_back_at = NOW()
       WHERE id = $2`,
      [reason, canaryId]
    );

    this.emit('rollback', { canaryId, reason });
  }

  /**
   * Get active deployment for doer
   */
  private async getActiveDeployment(doer: string): Promise<any | null> {
    const result = await this.db.query(
      `SELECT * FROM shadow_deployments
       WHERE doer = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [doer]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Record routing decision
   */
  private async recordRouting(deploymentId: string, taskId: string, route: 'control' | 'candidate'): Promise<void> {
    await this.db.query(
      `INSERT INTO deployment_routings (deployment_id, task_id, route)
       VALUES ($1, $2, $3)`,
      [deploymentId, taskId, route]
    );
  }

  /**
   * Get metrics for a policy in deployment
   */
  private async getMetricsForPolicy(deploymentId: string, route: 'control' | 'candidate'): Promise<{
    avgCRL: number;
    stdCRL: number;
    count: number;
  } | null> {
    const result = await this.db.query(
      `SELECT
         AVG(cr.loss_value) as avg_crl,
         STDDEV(cr.loss_value) as std_crl,
         COUNT(*) as count
       FROM deployment_routings dr
       JOIN tasks t ON t.id = dr.task_id
       JOIN crl_results cr ON cr.run_id = t.run_id
       WHERE dr.deployment_id = $1 AND dr.route = $2`,
      [deploymentId, route]
    );

    if (result.rows.length === 0 || result.rows[0].count === 0) {
      return null;
    }

    return {
      avgCRL: parseFloat(result.rows[0].avg_crl),
      stdCRL: parseFloat(result.rows[0].std_crl) || 0,
      count: parseInt(result.rows[0].count),
    };
  }

  /**
   * Simplified t-test for statistical significance
   */
  private computePValue(
    mean1: number,
    mean2: number,
    std1: number,
    std2: number,
    n1: number,
    n2: number
  ): number {
    // Simplified: return fake p-value (in production, use proper stats library)
    const pooledStd = Math.sqrt(((n1 - 1) * std1 ** 2 + (n2 - 1) * std2 ** 2) / (n1 + n2 - 2));
    const t = (mean1 - mean2) / (pooledStd * Math.sqrt(1 / n1 + 1 / n2));

    // Stub: return 0.01 if large difference, 0.5 if small
    return Math.abs(t) > 2 ? 0.01 : 0.5;
  }
}

export const SHADOW_CANARY_MIGRATION = `
-- Shadow/canary deployments table
CREATE TABLE IF NOT EXISTS shadow_deployments (
  id VARCHAR(200) PRIMARY KEY,
  doer VARCHAR(100) NOT NULL,
  candidate_policy_id VARCHAR(200) NOT NULL REFERENCES policies(id),
  control_policy_id VARCHAR(200) NOT NULL REFERENCES policies(id),
  allocation_pct DECIMAL(5, 2) NOT NULL,
  mode VARCHAR(20) NOT NULL,
  min_jobs INTEGER,
  max_duration_hours INTEGER,
  auto_promote BOOLEAN DEFAULT false,
  safety_thresholds JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  promoted_at TIMESTAMP,
  rolled_back_at TIMESTAMP,
  rollback_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployments_doer ON shadow_deployments(doer);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON shadow_deployments(status);

-- Deployment routing log
CREATE TABLE IF NOT EXISTS deployment_routings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deployment_id VARCHAR(200) NOT NULL REFERENCES shadow_deployments(id),
  task_id VARCHAR(100) NOT NULL,
  route VARCHAR(20) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routings_deployment ON deployment_routings(deployment_id);
CREATE INDEX IF NOT EXISTS idx_routings_task ON deployment_routings(task_id);

COMMENT ON TABLE shadow_deployments IS 'Shadow and canary deployments for safe policy rollouts';
COMMENT ON TABLE deployment_routings IS 'Routing decisions log for deployments';
`;
