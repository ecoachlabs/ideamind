import { Pool } from 'pg';
import crypto from 'crypto';
import pino from 'pino';

const logger = pino({ name: 'run-ledger' });

/**
 * Ledger entry types
 */
export type LedgerEntryType = 'task' | 'gate' | 'decision' | 'artifact' | 'cost' | 'signature';

/**
 * Provenance information
 */
export interface Provenance {
  who: string; // agent/tool ID
  when: string; // ISO8601
  tool_version?: string;
  inputs?: string[]; // artifact IDs that were inputs
}

/**
 * Ledger entry
 */
export interface LedgerEntry {
  id: string;
  run_id: string;
  timestamp: Date;
  type: LedgerEntryType;
  data: any;
  provenance: Provenance;
}

/**
 * Run Ledger - Immutable append-only timeline of everything
 *
 * Features:
 * - Append-only immutable log
 * - Captures all tasks, gates, decisions, artifacts, costs
 * - Full provenance tracking
 * - Query capabilities for debugging and audit
 *
 * Spec: orchestrator.txt:197-198, 77
 */
export class RunLedger {
  constructor(private pool: Pool) {}

  /**
   * Append task execution to ledger
   */
  async appendTaskExecution(
    runId: string,
    task: {
      id: string;
      phase: string;
      type: 'agent' | 'tool';
      target: string;
      input: any;
    },
    result: any,
    cost: { tokens: number; tools_minutes: number; usd?: number }
  ): Promise<void> {
    await this.append({
      run_id: runId,
      type: 'task',
      data: {
        task_id: task.id,
        phase: task.phase,
        type: task.type,
        target: task.target,
        input: task.input,
        result,
        duration_ms: result.ms,
        cost,
      },
      provenance: {
        who: task.target,
        when: new Date().toISOString(),
        tool_version: result.tool_version,
      },
    });

    logger.debug({ runId, taskId: task.id, phase: task.phase }, 'Task execution logged');
  }

  /**
   * Append gate evaluation to ledger
   */
  async appendGateEvaluation(
    runId: string,
    phase: string,
    gateResult: {
      pass: boolean;
      reasons: string[];
      evidence_pack_id: string;
      score: number;
    }
  ): Promise<void> {
    await this.append({
      run_id: runId,
      type: 'gate',
      data: {
        phase,
        pass: gateResult.pass,
        reasons: gateResult.reasons,
        evidence_pack_id: gateResult.evidence_pack_id,
        score: gateResult.score,
      },
      provenance: {
        who: `gatekeeper-${phase}`,
        when: new Date().toISOString(),
      },
    });

    logger.info({ runId, phase, pass: gateResult.pass }, 'Gate evaluation logged');
  }

  /**
   * Append decision to ledger
   */
  async appendDecision(
    runId: string,
    phase: string,
    decision: {
      type: string;
      outcome: any;
      qav_summary?: any;
    }
  ): Promise<void> {
    await this.append({
      run_id: runId,
      type: 'decision',
      data: {
        phase,
        decision_type: decision.type,
        outcome: decision.outcome,
        qav_summary: decision.qav_summary,
      },
      provenance: {
        who: 'orchestrator',
        when: new Date().toISOString(),
      },
    });

    logger.debug({ runId, phase, decisionType: decision.type }, 'Decision logged');
  }

  /**
   * Append artifact to ledger
   */
  async appendArtifact(
    runId: string,
    artifact: {
      id: string;
      type: string;
      size: number;
      hash: string;
    },
    provenance: {
      source: string;
      inputs: string[];
      tool_version?: string;
    }
  ): Promise<void> {
    await this.append({
      run_id: runId,
      type: 'artifact',
      data: artifact,
      provenance: {
        who: provenance.source,
        when: new Date().toISOString(),
        tool_version: provenance.tool_version,
        inputs: provenance.inputs,
      },
    });

    logger.debug({ runId, artifactId: artifact.id, type: artifact.type }, 'Artifact logged');
  }

  /**
   * Append cost to ledger
   */
  async appendCost(
    runId: string,
    phase: string,
    cost: {
      tokens: number;
      tools_minutes: number;
      usd: number;
    }
  ): Promise<void> {
    await this.append({
      run_id: runId,
      type: 'cost',
      data: { phase, ...cost },
      provenance: {
        who: 'budget-tracker',
        when: new Date().toISOString(),
      },
    });

    logger.debug({ runId, phase, costUsd: cost.usd }, 'Cost logged');
  }

  /**
   * Append signature to ledger
   */
  async appendSignature(
    runId: string,
    artifact_id: string,
    signature: {
      algorithm: string;
      value: string;
      signer: string;
    }
  ): Promise<void> {
    await this.append({
      run_id: runId,
      type: 'signature',
      data: { artifact_id, ...signature },
      provenance: {
        who: signature.signer,
        when: new Date().toISOString(),
      },
    });

    logger.debug({ runId, artifactId: artifact_id }, 'Signature logged');
  }

  /**
   * Append entry to ledger (internal method)
   */
  private async append(entry: Omit<LedgerEntry, 'id' | 'timestamp'>): Promise<void> {
    try {
      await this.pool.query(
        `
        INSERT INTO ledger (id, run_id, timestamp, type, data, provenance)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          crypto.randomUUID(),
          entry.run_id,
          new Date(),
          entry.type,
          JSON.stringify(entry.data),
          JSON.stringify(entry.provenance),
        ]
      );
    } catch (error) {
      logger.error({ error, entry }, 'Failed to append to ledger');
      throw error;
    }
  }

  /**
   * Query ledger entries
   */
  async query(
    runId: string,
    options?: {
      type?: LedgerEntryType;
      from?: Date;
      to?: Date;
      limit?: number;
    }
  ): Promise<LedgerEntry[]> {
    try {
      let sql = `SELECT * FROM ledger WHERE run_id = $1`;
      const params: any[] = [runId];

      if (options?.type) {
        sql += ` AND type = $${params.length + 1}`;
        params.push(options.type);
      }

      if (options?.from) {
        sql += ` AND timestamp >= $${params.length + 1}`;
        params.push(options.from);
      }

      if (options?.to) {
        sql += ` AND timestamp <= $${params.length + 1}`;
        params.push(options.to);
      }

      sql += ` ORDER BY timestamp DESC`;

      if (options?.limit) {
        sql += ` LIMIT $${params.length + 1}`;
        params.push(options.limit);
      }

      const result = await this.pool.query(sql, params);

      return result.rows.map((row) => ({
        id: row.id,
        run_id: row.run_id,
        timestamp: row.timestamp,
        type: row.type,
        data: row.data,
        provenance: row.provenance,
      }));
    } catch (error) {
      logger.error({ error, runId }, 'Failed to query ledger');
      throw error;
    }
  }

  /**
   * Get timeline for run
   *
   * Returns all entries in chronological order
   */
  async getTimeline(runId: string): Promise<LedgerEntry[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM ledger
      WHERE run_id = $1
      ORDER BY timestamp ASC
      `,
      [runId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      run_id: row.run_id,
      timestamp: row.timestamp,
      type: row.type,
      data: row.data,
      provenance: row.provenance,
    }));
  }

  /**
   * Get cost summary for run
   */
  async getCostSummary(runId: string): Promise<{
    total_usd: number;
    total_tokens: number;
    total_tools_minutes: number;
    by_phase: Record<string, { usd: number; tokens: number; tools_minutes: number }>;
  }> {
    const entries = await this.query(runId, { type: 'cost' });

    const totalUsd = entries.reduce((sum, e) => sum + (e.data.usd || 0), 0);
    const totalTokens = entries.reduce((sum, e) => sum + (e.data.tokens || 0), 0);
    const totalToolsMinutes = entries.reduce((sum, e) => sum + (e.data.tools_minutes || 0), 0);

    const byPhase: Record<string, { usd: number; tokens: number; tools_minutes: number }> = {};

    for (const entry of entries) {
      const phase = entry.data.phase;
      if (!byPhase[phase]) {
        byPhase[phase] = { usd: 0, tokens: 0, tools_minutes: 0 };
      }
      byPhase[phase].usd += entry.data.usd || 0;
      byPhase[phase].tokens += entry.data.tokens || 0;
      byPhase[phase].tools_minutes += entry.data.tools_minutes || 0;
    }

    return {
      total_usd: totalUsd,
      total_tokens: totalTokens,
      total_tools_minutes: totalToolsMinutes,
      by_phase: byPhase,
    };
  }

  /**
   * Get entry count for run
   */
  async getEntryCount(runId: string): Promise<number> {
    const result = await this.pool.query(
      `
      SELECT COUNT(*) as count
      FROM ledger
      WHERE run_id = $1
      `,
      [runId]
    );

    return parseInt(result.rows[0].count, 10);
  }
}
