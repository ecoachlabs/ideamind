/**
 * Policy Store - Versioned storage for prompts, router rules, hyperparams, tool allowlists
 *
 * Stores and retrieves learning policies with full provenance and signatures
 */

import pino from 'pino';
import { Pool } from 'pg';
import crypto from 'crypto';

const logger = pino({ name: 'policy-store' });

export interface PolicyArtifact {
  doer: string; // Agent/doer ID
  phase: string; // Orchestration phase
  version: string; // Semantic version
  prompts: Record<string, string>; // Named prompts
  hparams: Record<string, any>; // Hyperparameters (temperature, top_p, etc.)
  routerRules: Record<string, any>; // Model/tool routing rules
  toolsAllowlist: string[]; // Allowed tools
  weights: Record<string, number>; // CRL weights or other weights
  provenance: ProvenanceInfo; // Lineage information
}

export interface ProvenanceInfo {
  datasetId?: string; // Dataset used for learning
  experimentId?: string; // Experiment that produced this policy
  parentVersion?: string; // Previous policy version
  createdBy: string; // System or user
  createdAt: Date;
  signature?: string; // Cryptographic signature
  metadata?: Record<string, any>;
}

export type PolicyStatus = 'draft' | 'shadow' | 'canary' | 'active' | 'archived';

export interface PolicyRecord {
  id: string;
  artifact: PolicyArtifact;
  status: PolicyStatus;
  activatedAt?: Date;
  archivedAt?: Date;
  performanceMetrics?: Record<string, any>;
}

export class PolicyStore {
  constructor(private db: Pool) {}

  /**
   * Create a new policy
   */
  async createPolicy(artifact: PolicyArtifact): Promise<string> {
    const policyId = this.generatePolicyId(artifact);

    // Sign the policy
    const signature = this.signPolicy(artifact);
    artifact.provenance.signature = signature;

    logger.info({ doer: artifact.doer, version: artifact.version }, 'Creating policy');

    await this.db.query(
      `INSERT INTO policies (
        id, doer, phase, version, prompts, hparams,
        router_rules, tools_allowlist, weights, provenance, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        policyId,
        artifact.doer,
        artifact.phase,
        artifact.version,
        JSON.stringify(artifact.prompts),
        JSON.stringify(artifact.hparams),
        JSON.stringify(artifact.routerRules),
        JSON.stringify(artifact.toolsAllowlist),
        JSON.stringify(artifact.weights),
        JSON.stringify(artifact.provenance),
        'draft',
      ]
    );

    return policyId;
  }

  /**
   * Get policy by doer and version
   */
  async getPolicy(doer: string, version?: string): Promise<PolicyArtifact | null> {
    let query: string;
    let params: any[];

    if (version) {
      query = `SELECT * FROM policies WHERE doer = $1 AND version = $2`;
      params = [doer, version];
    } else {
      // Get active version
      query = `SELECT * FROM policies WHERE doer = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`;
      params = [doer];
    }

    const result = await this.db.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToArtifact(result.rows[0]);
  }

  /**
   * Get policy by ID
   */
  async getPolicyById(policyId: string): Promise<PolicyRecord | null> {
    const result = await this.db.query(`SELECT * FROM policies WHERE id = $1`, [policyId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      artifact: this.rowToArtifact(row),
      status: row.status,
      activatedAt: row.activated_at,
      archivedAt: row.archived_at,
      performanceMetrics: row.performance_metrics,
    };
  }

  /**
   * Promote policy to new status
   */
  async promotePolicy(
    policyId: string,
    targetStatus: PolicyStatus,
    rationale?: string
  ): Promise<void> {
    logger.info({ policyId, targetStatus }, 'Promoting policy');

    const now = new Date();

    // If promoting to active, archive previous active policies for same doer
    if (targetStatus === 'active') {
      const policy = await this.getPolicyById(policyId);
      if (policy) {
        await this.db.query(
          `UPDATE policies
           SET status = 'archived', archived_at = $1
           WHERE doer = $2 AND status = 'active' AND id != $3`,
          [now, policy.artifact.doer, policyId]
        );
      }
    }

    await this.db.query(
      `UPDATE policies
       SET status = $1, ${targetStatus === 'active' ? 'activated_at = $3,' : ''}
           promotion_rationale = $2
       WHERE id = $${targetStatus === 'active' ? '4' : '3'}`,
      targetStatus === 'active' ? [targetStatus, rationale, now, policyId] : [targetStatus, rationale, policyId]
    );

    // Log promotion
    await this.db.query(
      `INSERT INTO policy_promotions (policy_id, from_status, to_status, rationale, timestamp)
       SELECT $1, status, $2, $3, NOW()
       FROM policies WHERE id = $1`,
      [policyId, targetStatus, rationale]
    );
  }

  /**
   * Get policy history for a doer
   */
  async getHistory(doer: string, limit: number = 10): Promise<PolicyRecord[]> {
    const result = await this.db.query(
      `SELECT * FROM policies WHERE doer = $1 ORDER BY created_at DESC LIMIT $2`,
      [doer, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      artifact: this.rowToArtifact(row),
      status: row.status,
      activatedAt: row.activated_at,
      archivedAt: row.archived_at,
      performanceMetrics: row.performance_metrics,
    }));
  }

  /**
   * Update performance metrics for a policy
   */
  async updatePerformanceMetrics(policyId: string, metrics: Record<string, any>): Promise<void> {
    await this.db.query(`UPDATE policies SET performance_metrics = $1 WHERE id = $2`, [
      JSON.stringify(metrics),
      policyId,
    ]);
  }

  /**
   * Generate policy ID
   */
  private generatePolicyId(artifact: PolicyArtifact): string {
    return `policy_${artifact.doer}_${artifact.version}_${Date.now()}`;
  }

  /**
   * Sign policy for provenance
   */
  private signPolicy(artifact: PolicyArtifact): string {
    const content = JSON.stringify({
      doer: artifact.doer,
      phase: artifact.phase,
      version: artifact.version,
      prompts: artifact.prompts,
      hparams: artifact.hparams,
    });

    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Convert database row to artifact
   */
  private rowToArtifact(row: any): PolicyArtifact {
    return {
      doer: row.doer,
      phase: row.phase,
      version: row.version,
      prompts: row.prompts,
      hparams: row.hparams,
      routerRules: row.router_rules,
      toolsAllowlist: row.tools_allowlist,
      weights: row.weights,
      provenance: row.provenance,
    };
  }
}

export const POLICY_STORE_MIGRATION = `
-- Policies table
CREATE TABLE IF NOT EXISTS policies (
  id VARCHAR(200) PRIMARY KEY,
  doer VARCHAR(100) NOT NULL,
  phase VARCHAR(100) NOT NULL,
  version VARCHAR(50) NOT NULL,
  prompts JSONB NOT NULL DEFAULT '{}'::jsonb,
  hparams JSONB NOT NULL DEFAULT '{}'::jsonb,
  router_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  tools_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
  weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  provenance JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  activated_at TIMESTAMP,
  archived_at TIMESTAMP,
  performance_metrics JSONB,
  promotion_rationale TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policies_doer ON policies(doer);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_doer_status ON policies(doer, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_policies_doer_version ON policies(doer, version);

COMMENT ON TABLE policies IS 'Versioned learning policies with provenance';

-- Policy promotions log
CREATE TABLE IF NOT EXISTS policy_promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id VARCHAR(200) NOT NULL REFERENCES policies(id),
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  rationale TEXT,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_policy ON policy_promotions(policy_id);
CREATE INDEX IF NOT EXISTS idx_promotions_timestamp ON policy_promotions(timestamp);

COMMENT ON TABLE policy_promotions IS 'Policy promotion/rollback audit log';
`;
