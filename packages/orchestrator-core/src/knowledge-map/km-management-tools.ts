/**
 * Knowledge Map Management Tools
 *
 * Provides tools for querying, superseding, and resolving knowledge in the Knowledge Map.
 */

import { Pool } from 'pg';

// ============================================================================
// KM QUERY TOOL
// ============================================================================

export class KMQueryTool {
  private db: Pool;

  constructor(dbPool: Pool) {
    this.db = dbPool;
  }

  /**
   * Query knowledge map by text search
   */
  async queryByText(params: {
    searchText: string;
    phase?: string;
    limit?: number;
  }): Promise<KMQueryResult[]> {
    const { searchText, phase, limit = 20 } = params;

    console.log(`[KMQuery] Searching for: "${searchText}" in phase: ${phase || 'all'}`);

    const query = `
      SELECT
        k.id AS node_id,
        k.question_id,
        k.answer_id,
        q.text AS question_text,
        a.answer AS answer_text,
        q.phase,
        b.score_grounding,
        b.score_completeness,
        b.score_specificity,
        b.score_consistency,
        k.created_at
      FROM km_nodes k
      INNER JOIN questions q ON k.question_id = q.id
      INNER JOIN answers a ON k.answer_id = a.id
      INNER JOIN bindings b ON k.question_id = b.question_id AND k.answer_id = b.answer_id
      WHERE k.is_active = true
        AND ($1::text IS NULL OR q.phase = $1)
        AND (
          q.text ILIKE $2
          OR a.answer ILIKE $2
          OR $2 = ANY(q.tags)
        )
      ORDER BY
        (b.score_grounding + b.score_completeness + b.score_specificity + b.score_consistency) / 4 DESC,
        k.created_at DESC
      LIMIT $3
    `;

    const result = await this.db.query(query, [
      phase || null,
      `%${searchText}%`,
      limit,
    ]);

    return result.rows.map((row) => ({
      nodeId: row.node_id,
      questionId: row.question_id,
      answerId: row.answer_id,
      question: row.question_text,
      answer: row.answer_text,
      phase: row.phase,
      quality: {
        grounding: parseFloat(row.score_grounding),
        completeness: parseFloat(row.score_completeness),
        specificity: parseFloat(row.score_specificity),
        consistency: parseFloat(row.score_consistency),
      },
      createdAt: row.created_at,
    }));
  }

  /**
   * Query knowledge map by question ID
   */
  async queryByQuestionId(questionId: string): Promise<KMQueryResult | null> {
    const query = `
      SELECT
        k.id AS node_id,
        k.question_id,
        k.answer_id,
        q.text AS question_text,
        a.answer AS answer_text,
        q.phase,
        q.tags,
        q.priority,
        q.status,
        b.score_grounding,
        b.score_completeness,
        b.score_specificity,
        b.score_consistency,
        b.reasons,
        b.hints,
        k.created_at,
        k.superseded_by
      FROM km_nodes k
      INNER JOIN questions q ON k.question_id = q.id
      INNER JOIN answers a ON k.answer_id = a.id
      INNER JOIN bindings b ON k.question_id = b.question_id AND k.answer_id = b.answer_id
      WHERE k.question_id = $1 AND k.is_active = true
    `;

    const result = await this.db.query(query, [questionId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      nodeId: row.node_id,
      questionId: row.question_id,
      answerId: row.answer_id,
      question: row.question_text,
      answer: row.answer_text,
      phase: row.phase,
      tags: row.tags,
      priority: parseFloat(row.priority),
      status: row.status,
      quality: {
        grounding: parseFloat(row.score_grounding),
        completeness: parseFloat(row.score_completeness),
        specificity: parseFloat(row.score_specificity),
        consistency: parseFloat(row.score_consistency),
      },
      reasons: row.reasons || [],
      hints: row.hints || [],
      createdAt: row.created_at,
      supersededBy: row.superseded_by,
    };
  }

  /**
   * Get all unresolved questions (open or partial status)
   */
  async getUnresolvedQuestions(phase?: string): Promise<UnresolvedQuestion[]> {
    const query = `
      SELECT
        q.id,
        q.phase,
        q.text,
        q.tags,
        q.priority,
        q.status,
        q.depends_on,
        q.created_at,
        COUNT(a.id) AS answer_count,
        COUNT(CASE WHEN b.decision = 'accept' THEN 1 END) AS accepted_answer_count
      FROM questions q
      LEFT JOIN answers a ON q.id = a.question_id
      LEFT JOIN bindings b ON a.id = b.answer_id
      WHERE q.status IN ('open', 'partial')
        AND ($1::text IS NULL OR q.phase = $1)
      GROUP BY q.id
      ORDER BY q.priority DESC, q.created_at ASC
    `;

    const result = await this.db.query(query, [phase || null]);

    return result.rows.map((row) => ({
      id: row.id,
      phase: row.phase,
      text: row.text,
      tags: row.tags || [],
      priority: parseFloat(row.priority),
      status: row.status,
      dependsOn: row.depends_on || [],
      answerCount: parseInt(row.answer_count),
      acceptedAnswerCount: parseInt(row.accepted_answer_count),
      ageInDays: this.calculateAge(row.created_at),
    }));
  }

  /**
   * Calculate age in days
   */
  private calculateAge(createdAt: Date): number {
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now.getTime() - created.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
}

// ============================================================================
// KM SUPERSEDE TOOL
// ============================================================================

export class KMSupersedeTool {
  private db: Pool;

  constructor(dbPool: Pool) {
    this.db = dbPool;
  }

  /**
   * Mark a KM node as superseded by a new node
   */
  async supersede(params: {
    oldNodeId: string;
    newNodeId: string;
    reason: string;
    supersededBy: string; // Agent/user who initiated supersession
  }): Promise<SupersedeResult> {
    const { oldNodeId, newNodeId, reason, supersededBy } = params;

    console.log(`[KMSupersede] Superseding ${oldNodeId} with ${newNodeId}`);

    try {
      await this.db.query('BEGIN');

      // Step 1: Check that old node exists and is active
      const oldNodeQuery = await this.db.query(
        'SELECT id, question_id, answer_id, is_active FROM km_nodes WHERE id = $1',
        [oldNodeId]
      );

      if (oldNodeQuery.rows.length === 0) {
        throw new Error(`Old node ${oldNodeId} not found`);
      }

      if (!oldNodeQuery.rows[0].is_active) {
        throw new Error(`Old node ${oldNodeId} is already inactive`);
      }

      // Step 2: Check that new node exists
      const newNodeQuery = await this.db.query(
        'SELECT id, question_id, answer_id FROM km_nodes WHERE id = $1',
        [newNodeId]
      );

      if (newNodeQuery.rows.length === 0) {
        throw new Error(`New node ${newNodeId} not found`);
      }

      // Step 3: Mark old node as superseded
      await this.db.query(
        `UPDATE km_nodes
         SET is_active = false,
             superseded_by = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [newNodeId, oldNodeId]
      );

      // Step 4: Create supersession edge
      const edgeId = `EDGE-SUPERSEDE-${oldNodeId}-${newNodeId}`;
      await this.db.query(
        `INSERT INTO km_edges (id, source_node_id, target_node_id, edge_type, metadata, created_at)
         VALUES ($1, $2, $3, 'supersedes', $4, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          edgeId,
          newNodeId,
          oldNodeId,
          JSON.stringify({
            reason,
            superseded_by: supersededBy,
            superseded_at: new Date().toISOString(),
          }),
        ]
      );

      // Step 5: Log the supersession
      console.log(`[KMSupersede] Successfully superseded ${oldNodeId} with ${newNodeId}`);

      await this.db.query('COMMIT');

      return {
        success: true,
        oldNodeId,
        newNodeId,
        supersededAt: new Date().toISOString(),
      };
    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error('[KMSupersede] Failed to supersede:', error);
      throw error;
    }
  }

  /**
   * Get supersession history for a node
   */
  async getSupersessionHistory(nodeId: string): Promise<SupersessionHistoryEntry[]> {
    const query = `
      WITH RECURSIVE supersession_chain AS (
        -- Start with the given node
        SELECT
          k.id AS node_id,
          k.question_id,
          k.answer_id,
          k.superseded_by,
          k.is_active,
          k.created_at,
          0 AS depth
        FROM km_nodes k
        WHERE k.id = $1

        UNION ALL

        -- Follow the supersession chain
        SELECT
          k.id AS node_id,
          k.question_id,
          k.answer_id,
          k.superseded_by,
          k.is_active,
          k.created_at,
          sc.depth + 1 AS depth
        FROM km_nodes k
        INNER JOIN supersession_chain sc ON k.id = sc.superseded_by
      )
      SELECT
        sc.node_id,
        sc.question_id,
        sc.answer_id,
        sc.superseded_by,
        sc.is_active,
        sc.created_at,
        sc.depth,
        q.text AS question_text,
        a.answer AS answer_text
      FROM supersession_chain sc
      INNER JOIN questions q ON sc.question_id = q.id
      INNER JOIN answers a ON sc.answer_id = a.id
      ORDER BY sc.depth ASC
    `;

    const result = await this.db.query(query, [nodeId]);

    return result.rows.map((row) => ({
      nodeId: row.node_id,
      questionId: row.question_id,
      answerId: row.answer_id,
      question: row.question_text,
      answer: row.answer_text,
      supersededBy: row.superseded_by,
      isActive: row.is_active,
      createdAt: row.created_at,
      depth: row.depth,
    }));
  }
}

// ============================================================================
// KM RESOLVE TOOL
// ============================================================================

export class KMResolveTool {
  private db: Pool;

  constructor(dbPool: Pool) {
    this.db = dbPool;
  }

  /**
   * Resolve a contradiction by choosing which answer to keep
   */
  async resolveContradiction(params: {
    questionId: string;
    chosenAnswerId: string;
    rejectedAnswerIds: string[];
    reason: string;
    resolvedBy: string;
  }): Promise<ResolveResult> {
    const { questionId, chosenAnswerId, rejectedAnswerIds, reason, resolvedBy } = params;

    console.log(
      `[KMResolve] Resolving contradiction for ${questionId}: chosen=${chosenAnswerId}, rejected=${rejectedAnswerIds.join(', ')}`
    );

    try {
      await this.db.query('BEGIN');

      // Step 1: Verify chosen answer exists and is bound to question
      const chosenBindingQuery = await this.db.query(
        'SELECT * FROM bindings WHERE question_id = $1 AND answer_id = $2',
        [questionId, chosenAnswerId]
      );

      if (chosenBindingQuery.rows.length === 0) {
        throw new Error(`No binding found for question ${questionId} and answer ${chosenAnswerId}`);
      }

      // Step 2: Update chosen binding to 'accept' (if not already)
      await this.db.query(
        `UPDATE bindings
         SET decision = 'accept',
             updated_at = NOW()
         WHERE question_id = $1 AND answer_id = $2`,
        [questionId, chosenAnswerId]
      );

      // Step 3: Mark rejected answers as rejected
      for (const rejectedId of rejectedAnswerIds) {
        await this.db.query(
          `UPDATE bindings
           SET decision = 'reject',
               reasons = array_append(reasons, 'contradiction_resolved'),
               hints = array_append(hints, $1),
               updated_at = NOW()
           WHERE question_id = $2 AND answer_id = $3`,
          [
            `Rejected in favor of ${chosenAnswerId}: ${reason}`,
            questionId,
            rejectedId,
          ]
        );

        // Deactivate KM nodes for rejected answers
        await this.db.query(
          `UPDATE km_nodes
           SET is_active = false,
               updated_at = NOW()
           WHERE question_id = $1 AND answer_id = $2`,
          [questionId, rejectedId]
        );
      }

      // Step 4: Create or activate KM node for chosen answer (if not exists)
      const kmNodeQuery = await this.db.query(
        'SELECT id FROM km_nodes WHERE question_id = $1 AND answer_id = $2',
        [questionId, chosenAnswerId]
      );

      if (kmNodeQuery.rows.length === 0) {
        // Create new KM node
        const nodeId = `KM-${questionId}-${chosenAnswerId}`;
        await this.db.query(
          `INSERT INTO km_nodes (id, question_id, answer_id, is_active, created_at)
           VALUES ($1, $2, $3, true, NOW())`,
          [nodeId, questionId, chosenAnswerId]
        );
      } else {
        // Reactivate existing node if needed
        await this.db.query(
          `UPDATE km_nodes
           SET is_active = true,
               updated_at = NOW()
           WHERE question_id = $1 AND answer_id = $2`,
          [questionId, chosenAnswerId]
        );
      }

      // Step 5: Update question status to 'resolved'
      await this.db.query(
        `UPDATE questions
         SET status = 'resolved',
             updated_at = NOW()
         WHERE id = $1`,
        [questionId]
      );

      // Step 6: Log resolution
      console.log(`[KMResolve] Contradiction resolved for ${questionId}`);

      await this.db.query('COMMIT');

      return {
        success: true,
        questionId,
        chosenAnswerId,
        rejectedAnswerIds,
        resolvedAt: new Date().toISOString(),
        resolvedBy,
      };
    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error('[KMResolve] Failed to resolve contradiction:', error);
      throw error;
    }
  }

  /**
   * Get all conflicts in the Knowledge Map
   */
  async getConflicts(phase?: string): Promise<ConflictEntry[]> {
    const query = `
      SELECT
        q.id AS question_id,
        q.text AS question_text,
        q.phase,
        array_agg(DISTINCT a.id) AS answer_ids,
        array_agg(DISTINCT a.answer) AS answers,
        COUNT(DISTINCT a.id) AS answer_count
      FROM questions q
      INNER JOIN bindings b ON q.id = b.question_id
      INNER JOIN answers a ON b.answer_id = a.id
      WHERE b.decision = 'accept'
        AND ($1::text IS NULL OR q.phase = $1)
      GROUP BY q.id, q.text, q.phase
      HAVING COUNT(DISTINCT a.id) > 1
      ORDER BY q.phase, q.created_at DESC
    `;

    const result = await this.db.query(query, [phase || null]);

    return result.rows.map((row) => ({
      questionId: row.question_id,
      question: row.question_text,
      phase: row.phase,
      conflictingAnswers: row.answer_ids.map((id: string, idx: number) => ({
        answerId: id,
        answer: row.answers[idx],
      })),
      conflictCount: parseInt(row.answer_count),
    }));
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface KMQueryResult {
  nodeId: string;
  questionId: string;
  answerId: string;
  question: string;
  answer: string;
  phase: string;
  tags?: string[];
  priority?: number;
  status?: string;
  quality: {
    grounding: number;
    completeness: number;
    specificity: number;
    consistency: number;
  };
  reasons?: string[];
  hints?: string[];
  createdAt: Date;
  supersededBy?: string | null;
}

export interface UnresolvedQuestion {
  id: string;
  phase: string;
  text: string;
  tags: string[];
  priority: number;
  status: 'open' | 'partial';
  dependsOn: string[];
  answerCount: number;
  acceptedAnswerCount: number;
  ageInDays: number;
}

export interface SupersedeResult {
  success: boolean;
  oldNodeId: string;
  newNodeId: string;
  supersededAt: string;
}

export interface SupersessionHistoryEntry {
  nodeId: string;
  questionId: string;
  answerId: string;
  question: string;
  answer: string;
  supersededBy: string | null;
  isActive: boolean;
  createdAt: Date;
  depth: number;
}

export interface ResolveResult {
  success: boolean;
  questionId: string;
  chosenAnswerId: string;
  rejectedAnswerIds: string[];
  resolvedAt: string;
  resolvedBy: string;
}

export interface ConflictEntry {
  questionId: string;
  question: string;
  phase: string;
  conflictingAnswers: Array<{
    answerId: string;
    answer: string;
  }>;
  conflictCount: number;
}
