/**
 * QA Binding Manager
 *
 * Manages question-answer-validation bindings for knowledge capture
 */

import { Pool } from 'pg';
import pino from 'pino';
import crypto from 'crypto';
import { QABinding } from './types';

const logger = pino({ name: 'qa-binding' });

export class QABindingManager {
  constructor(private db: Pool) {}

  /**
   * Create a new QA binding
   */
  async createBinding(
    question: string,
    answer: string,
    options?: {
      validatorScore?: number;
      accepted?: boolean;
      grounding?: number;
      contradictions?: number;
      citations?: string[];
      phase?: string;
      runId?: string;
      doer?: string;
    }
  ): Promise<string> {
    const qid = `q_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const aid = `a_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    const validatorScore = options?.validatorScore ?? 0.8;
    const accepted = options?.accepted ?? validatorScore >= 0.7;
    const grounding = options?.grounding ?? 0.0;
    const contradictions = options?.contradictions ?? 0;
    const citations = options?.citations || [];

    const query = `
      INSERT INTO qa_bindings (
        qid, aid, question, answer, validator_score, accepted,
        grounding, contradictions, citations, created_at,
        phase, run_id, doer
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING qid
    `;

    const values = [
      qid,
      aid,
      question,
      answer,
      validatorScore,
      accepted,
      grounding,
      contradictions,
      JSON.stringify(citations),
      new Date(),
      options?.phase || null,
      options?.runId || null,
      options?.doer || null,
    ];

    const result = await this.db.query(query, values);

    logger.info({ qid, aid, accepted, grounding }, 'QA binding created');

    return result.rows[0].qid;
  }

  /**
   * Get binding by QID
   */
  async getBinding(qid: string): Promise<QABinding | null> {
    const query = `SELECT * FROM qa_bindings WHERE qid = $1`;
    const result = await this.db.query(query, [qid]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToBinding(result.rows[0]);
  }

  /**
   * Query bindings
   */
  async queryBindings(options?: {
    phase?: string;
    runId?: string;
    doer?: string;
    minGrounding?: number;
    acceptedOnly?: boolean;
    limit?: number;
  }): Promise<QABinding[]> {
    let query = `SELECT * FROM qa_bindings WHERE 1=1`;
    const values: any[] = [];
    let paramCount = 0;

    if (options?.phase) {
      paramCount++;
      query += ` AND phase = $${paramCount}`;
      values.push(options.phase);
    }

    if (options?.runId) {
      paramCount++;
      query += ` AND run_id = $${paramCount}`;
      values.push(options.runId);
    }

    if (options?.doer) {
      paramCount++;
      query += ` AND doer = $${paramCount}`;
      values.push(options.doer);
    }

    if (options?.minGrounding !== undefined) {
      paramCount++;
      query += ` AND grounding >= $${paramCount}`;
      values.push(options.minGrounding);
    }

    if (options?.acceptedOnly) {
      query += ` AND accepted = true`;
    }

    query += ` ORDER BY created_at DESC`;

    if (options?.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(options.limit);
    }

    const result = await this.db.query(query, values);

    return result.rows.map((row) => this.rowToBinding(row));
  }

  /**
   * Update binding validation
   */
  async updateValidation(
    qid: string,
    validatorScore: number,
    accepted: boolean,
    grounding?: number,
    contradictions?: number
  ): Promise<void> {
    const query = `
      UPDATE qa_bindings
      SET
        validator_score = $1,
        accepted = $2,
        grounding = COALESCE($3, grounding),
        contradictions = COALESCE($4, contradictions)
      WHERE qid = $5
    `;

    await this.db.query(query, [validatorScore, accepted, grounding, contradictions, qid]);

    logger.info({ qid, validatorScore, accepted }, 'QA binding validation updated');
  }

  /**
   * Add citations to binding
   */
  async addCitations(qid: string, newCitations: string[]): Promise<void> {
    const binding = await this.getBinding(qid);
    if (!binding) {
      throw new Error(`QA binding not found: ${qid}`);
    }

    const existingCitations = binding.citations || [];
    const allCitations = [...new Set([...existingCitations, ...newCitations])];

    const query = `
      UPDATE qa_bindings
      SET citations = $1
      WHERE qid = $2
    `;

    await this.db.query(query, [JSON.stringify(allCitations), qid]);

    logger.debug({ qid, newCitations: newCitations.length }, 'Citations added to QA binding');
  }

  /**
   * Get average grounding score for a doer/phase
   */
  async getAverageGrounding(doer?: string, phase?: string): Promise<number> {
    let query = `SELECT AVG(grounding) as avg_grounding FROM qa_bindings WHERE accepted = true`;
    const values: any[] = [];
    let paramCount = 0;

    if (doer) {
      paramCount++;
      query += ` AND doer = $${paramCount}`;
      values.push(doer);
    }

    if (phase) {
      paramCount++;
      query += ` AND phase = $${paramCount}`;
      values.push(phase);
    }

    const result = await this.db.query(query, values);

    return result.rows[0]?.avg_grounding || 0.0;
  }

  /**
   * Get contradiction rate for a doer/phase
   */
  async getContradictionRate(doer?: string, phase?: string): Promise<number> {
    let query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN contradictions > 0 THEN 1 ELSE 0 END) as with_contradictions
      FROM qa_bindings
      WHERE accepted = true
    `;
    const values: any[] = [];
    let paramCount = 0;

    if (doer) {
      paramCount++;
      query += ` AND doer = $${paramCount}`;
      values.push(doer);
    }

    if (phase) {
      paramCount++;
      query += ` AND phase = $${paramCount}`;
      values.push(phase);
    }

    const result = await this.db.query(query, values);

    const total = parseInt(result.rows[0]?.total || '0');
    const withContradictions = parseInt(result.rows[0]?.with_contradictions || '0');

    if (total === 0) return 0.0;

    return withContradictions / total;
  }

  /**
   * Convert database row to QABinding
   */
  private rowToBinding(row: any): QABinding {
    return {
      qid: row.qid,
      aid: row.aid,
      question: row.question,
      answer: row.answer,
      validatorScore: parseFloat(row.validator_score),
      accepted: row.accepted,
      grounding: parseFloat(row.grounding),
      contradictions: parseInt(row.contradictions),
      citations: JSON.parse(row.citations || '[]'),
      createdAt: row.created_at,
      phase: row.phase,
      runId: row.run_id,
      doer: row.doer,
    };
  }
}
