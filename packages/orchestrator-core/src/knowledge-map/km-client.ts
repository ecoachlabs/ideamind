/**
 * Knowledge Map Database Client
 *
 * Handles all PostgreSQL operations for the Knowledge Map system:
 * - Persisting questions, answers, bindings
 * - Creating KM nodes from accepted bindings
 * - Querying coverage metrics
 * - Managing conflicts and backlog
 */

import { Pool, PoolClient, QueryResult } from 'pg';

export interface KMQuestion {
  id: string;
  phase: string;
  run_id: string;
  text: string;
  tags: string[];
  priority: number;
  depends_on: string[];
  status: 'open' | 'answered' | 'rejected' | 'carried_over';
  generated_by: string;
}

export interface KMAnswer {
  id: string;
  question_id: string;
  answer: string;
  evidence_ids: string[];
  assumptions: string[];
  confidence: number;
  generated_by: string;
}

export interface KMBinding {
  question_id: string;
  answer_id: string;
  score_grounding: number;
  score_completeness: number;
  score_specificity: number;
  score_consistency: number;
  decision: 'accept' | 'reject';
  reasons: string[];
  hints: string[];
  validated_by: string;
}

export interface KMCoverageMetrics {
  phase: string;
  run_id: string;
  total_questions: number;
  answered_questions: number;
  coverage_ratio: number;
  acceptance_rate: number;
  high_priority_open: number;
  critical_conflicts: number;
}

export class KnowledgeMapClient {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      console.error('[KM Client] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Insert questions into database
   * SECURITY FIX #6: Input validation
   */
  async insertQuestions(questions: KMQuestion[]): Promise<void> {
    // Validate input
    if (!questions || questions.length === 0) {
      return;
    }

    if (questions.length > 1000) {
      throw new Error(
        `Question batch too large: ${questions.length}. Maximum 1000 per batch.`
      );
    }

    // Valid phase enum
    const validPhases = new Set([
      'INTAKE', 'IDEATION', 'CRITIQUE', 'PRD', 'BIZDEV',
      'ARCH', 'BUILD', 'CODING', 'QA', 'AESTHETIC', 'RELEASE', 'BETA', 'GA'
    ]);

    // Valid status enum
    const validStatuses = new Set(['open', 'answered', 'rejected', 'carried_over']);

    // Validate each question
    for (const q of questions) {
      if (!q.id || typeof q.id !== 'string') {
        throw new Error(`Invalid question ID: ${q.id}`);
      }

      if (!validPhases.has(q.phase.toUpperCase())) {
        throw new Error(`Invalid phase: ${q.phase}`);
      }

      if (!validStatuses.has(q.status)) {
        throw new Error(`Invalid status: ${q.status}`);
      }

      if (typeof q.priority !== 'number' || q.priority < 0 || q.priority > 1) {
        throw new Error(`Invalid priority: ${q.priority}. Must be 0-1.`);
      }

      if (!Array.isArray(q.tags) || !Array.isArray(q.depends_on)) {
        throw new Error('tags and depends_on must be arrays');
      }

      // Sanitize arrays (prevent SQL injection via arrays)
      q.tags = q.tags.map(t => String(t).substring(0, 100));
      q.depends_on = q.depends_on.map(d => String(d).substring(0, 100));
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const q of questions) {
        await client.query(
          `INSERT INTO questions (
            id, phase, run_id, text, tags, priority, depends_on, status, generated_by, generated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (id) DO UPDATE SET
            text = EXCLUDED.text,
            tags = EXCLUDED.tags,
            priority = EXCLUDED.priority,
            status = EXCLUDED.status`,
          [
            q.id,
            q.phase.toUpperCase(),
            q.run_id,
            q.text,
            q.tags,
            q.priority,
            q.depends_on,
            q.status,
            q.generated_by,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Insert answers into database
   */
  async insertAnswers(answers: KMAnswer[]): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const a of answers) {
        await client.query(
          `INSERT INTO answers (
            id, question_id, answer, evidence_ids, assumptions, confidence, generated_by, generated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (id) DO UPDATE SET
            answer = EXCLUDED.answer,
            evidence_ids = EXCLUDED.evidence_ids,
            assumptions = EXCLUDED.assumptions,
            confidence = EXCLUDED.confidence`,
          [
            a.id,
            a.question_id,
            a.answer,
            a.evidence_ids,
            a.assumptions,
            a.confidence,
            a.generated_by,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Insert bindings and create KM nodes for accepted ones
   * CRITICAL FIX #11: Race condition prevention with SERIALIZABLE isolation
   */
  async insertBindings(bindings: KMBinding[]): Promise<number> {
    const client = await this.pool.connect();
    let acceptedCount = 0;

    try {
      // Set SERIALIZABLE isolation for strong consistency
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      for (const b of bindings) {
        // Lock the question to prevent concurrent binding
        await client.query(
          `SELECT id FROM questions WHERE id = $1 FOR UPDATE`,
          [b.question_id]
        );

        // Check if question already has an accepted binding
        const existingBinding = await client.query(
          `SELECT id FROM bindings
           WHERE question_id = $1 AND decision = 'accept'
           LIMIT 1`,
          [b.question_id]
        );

        if (existingBinding.rows.length > 0 && b.decision === 'accept') {
          throw new Error(
            `Question ${b.question_id} already has an accepted binding`
          );
        }

        // Insert binding
        const result = await client.query(
          `INSERT INTO bindings (
            question_id, answer_id,
            score_grounding, score_completeness, score_specificity, score_consistency,
            decision, reasons, hints, validated_by, validated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          RETURNING id`,
          [
            b.question_id,
            b.answer_id,
            b.score_grounding,
            b.score_completeness,
            b.score_specificity,
            b.score_consistency,
            b.decision,
            b.reasons,
            b.hints,
            b.validated_by,
          ]
        );

        const bindingId = result.rows[0].id;

        // If accepted, create KM node
        if (b.decision === 'accept') {
          await client.query('SELECT create_km_node_from_binding($1)', [bindingId]);
          acceptedCount++;

          // Update question status atomically
          await client.query(
            `UPDATE questions
             SET status = 'answered', updated_at = NOW()
             WHERE id = $1`,
            [b.question_id]
          );
        }

        // If rejected, update question status
        if (b.decision === 'reject') {
          await client.query(
            `UPDATE questions
             SET status = 'rejected', updated_at = NOW()
             WHERE id = $1`,
            [b.question_id]
          );
        }
      }

      await client.query('COMMIT');
      return acceptedCount;
    } catch (error) {
      await client.query('ROLLBACK');

      // Check for serialization failure (concurrent update)
      if ((error as any).code === '40001') {
        throw new Error(
          'Concurrent binding detected. Please retry the operation.'
        );
      }

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Query coverage metrics for a phase
   */
  async queryCoverageMetrics(phase: string, runId: string): Promise<KMCoverageMetrics> {
    const client = await this.pool.connect();

    try {
      // Get basic coverage from view
      const coverageResult = await client.query(
        `SELECT
          phase, run_id, total_questions, answered_questions,
          coverage_ratio, acceptance_rate
         FROM km_coverage
         WHERE phase = $1 AND run_id = $2`,
        [phase.toUpperCase(), runId]
      );

      // Get high-priority open questions count
      const highPriorityResult = await client.query(
        `SELECT COUNT(*) as count
         FROM questions
         WHERE phase = $1 AND run_id = $2 AND status = 'open' AND priority >= 0.8`,
        [phase.toUpperCase(), runId]
      );

      // Get critical conflicts count
      const conflictsResult = await client.query(
        `SELECT COUNT(*) as count
         FROM km_conflicts
         WHERE phase = $1 AND run_id = $2 AND resolved = false AND severity = 'critical'`,
        [phase.toUpperCase(), runId]
      );

      // If no data in coverage view, return defaults
      if (coverageResult.rows.length === 0) {
        return {
          phase: phase.toUpperCase(),
          run_id: runId,
          total_questions: 0,
          answered_questions: 0,
          coverage_ratio: 0.0,
          acceptance_rate: 0.0,
          high_priority_open: 0,
          critical_conflicts: 0,
        };
      }

      const row = coverageResult.rows[0];

      return {
        phase: row.phase,
        run_id: row.run_id,
        total_questions: parseInt(row.total_questions, 10),
        answered_questions: parseInt(row.answered_questions, 10),
        coverage_ratio: parseFloat(row.coverage_ratio),
        acceptance_rate: parseFloat(row.acceptance_rate),
        high_priority_open: parseInt(highPriorityResult.rows[0].count, 10),
        critical_conflicts: parseInt(conflictsResult.rows[0].count, 10),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get existing KM nodes for conflict detection
   */
  async getExistingNodes(phase: string, runId: string, limit: number = 100): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT node_id, question, answer, phase, tags
       FROM km_nodes
       WHERE phase = $1 AND run_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [phase.toUpperCase(), runId, limit]
    );

    return result.rows;
  }

  /**
   * Insert detected conflict
   */
  async insertConflict(
    nodeId1: string,
    nodeId2: string,
    conflictType: string,
    description: string,
    severity: 'critical' | 'high' | 'medium' | 'low',
    phase: string,
    runId: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO km_conflicts (
        node_id_1, node_id_2, conflict_type, description, severity, phase, run_id, detected_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [nodeId1, nodeId2, conflictType, description, severity, phase.toUpperCase(), runId]
    );
  }

  /**
   * Carry over unanswered high-priority questions to backlog
   */
  async carryOverToBacklog(phase: string, runId: string): Promise<number> {
    const result = await this.pool.query(
      `WITH carried_over AS (
        INSERT INTO km_backlog (question_id, from_phase, to_phase, reason, run_id, created_at)
        SELECT
          id,
          phase,
          $1::text,  -- Next phase (to be determined by caller)
          'High-priority question unanswered',
          run_id,
          NOW()
        FROM questions
        WHERE phase = $2 AND run_id = $3 AND status = 'open' AND priority >= 0.8
        RETURNING question_id
      )
      UPDATE questions
      SET status = 'carried_over'
      WHERE id IN (SELECT question_id FROM carried_over)
      RETURNING id`,
      [phase.toUpperCase(), phase.toUpperCase(), runId]
    );

    return result.rowCount || 0;
  }

  /**
   * Update question status
   */
  async updateQuestionStatus(questionId: string, status: string): Promise<void> {
    await this.pool.query(
      `UPDATE questions SET status = $1 WHERE id = $2`,
      [status, questionId]
    );
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
