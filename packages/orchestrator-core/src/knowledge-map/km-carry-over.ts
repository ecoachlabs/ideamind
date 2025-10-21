/**
 * Knowledge Map Carry-Over Logic
 *
 * Manages the lifecycle of questions across phases:
 * - Identifies unresolved questions from previous phases
 * - Carries them forward to subsequent phases
 * - Tracks question resolution status
 * - Prioritizes carry-over questions based on importance
 */

import { Pool } from 'pg';

// ============================================================================
// CARRY-OVER MANAGER
// ============================================================================

export class KMCarryOverManager {
  private db: Pool;

  constructor(dbPool: Pool) {
    this.db = dbPool;
  }

  /**
   * Get unresolved questions from previous phases for carry-over
   */
  async getCarryOverQuestions(config: CarryOverConfig): Promise<CarryOverQuestion[]> {
    const { currentPhase, runId, maxQuestions = 50, minPriority = 0.5 } = config;

    console.log(`[CarryOver] Fetching unresolved questions for ${currentPhase} phase`);

    // Get phase order to determine which phases come before
    const previousPhases = this.getPreviousPhases(currentPhase);

    if (previousPhases.length === 0) {
      console.log(`[CarryOver] No previous phases for ${currentPhase}`);
      return [];
    }

    const query = `
      SELECT
        q.id,
        q.phase AS origin_phase,
        q.text,
        q.tags,
        q.priority,
        q.depends_on,
        q.status,
        q.created_at,
        COUNT(a.id) AS answer_count,
        COUNT(CASE WHEN b.decision = 'accept' THEN 1 END) AS accepted_answer_count
      FROM questions q
      LEFT JOIN answers a ON q.id = a.question_id
      LEFT JOIN bindings b ON a.id = b.answer_id
      WHERE q.phase = ANY($1)
        AND q.priority >= $2
        AND q.status IN ('open', 'partial')
      GROUP BY q.id
      HAVING COUNT(CASE WHEN b.decision = 'accept' THEN 1 END) = 0
      ORDER BY q.priority DESC, q.created_at ASC
      LIMIT $3
    `;

    const result = await this.db.query(query, [previousPhases, minPriority, maxQuestions]);

    const carryOverQuestions: CarryOverQuestion[] = result.rows.map((row) => ({
      id: row.id,
      originPhase: row.origin_phase,
      text: row.text,
      tags: row.tags || [],
      priority: parseFloat(row.priority),
      dependsOn: row.depends_on || [],
      status: row.status,
      answerCount: parseInt(row.answer_count),
      acceptedAnswerCount: parseInt(row.accepted_answer_count),
      ageInDays: this.calculateAge(row.created_at),
    }));

    console.log(`[CarryOver] Found ${carryOverQuestions.length} unresolved questions to carry over`);

    return carryOverQuestions;
  }

  /**
   * Mark question as carried over to new phase
   */
  async markAsCarriedOver(questionId: string, fromPhase: string, toPhase: string): Promise<void> {
    const query = `
      INSERT INTO km_edges (id, source_node_id, target_node_id, edge_type, metadata, created_at)
      VALUES ($1, $2, $3, 'carried_over', $4, NOW())
    `;

    const edgeId = `EDGE-CARRY-${questionId}-${toPhase}`;
    const metadata = {
      from_phase: fromPhase,
      to_phase: toPhase,
      carried_over_at: new Date().toISOString(),
    };

    await this.db.query(query, [edgeId, questionId, questionId, JSON.stringify(metadata)]);

    console.log(`[CarryOver] Marked ${questionId} as carried over from ${fromPhase} to ${toPhase}`);
  }

  /**
   * Update question status based on answers
   */
  async updateQuestionStatus(questionId: string): Promise<QuestionStatus> {
    const query = `
      SELECT
        COUNT(a.id) AS answer_count,
        COUNT(CASE WHEN b.decision = 'accept' THEN 1 END) AS accepted_answer_count
      FROM questions q
      LEFT JOIN answers a ON q.id = a.question_id
      LEFT JOIN bindings b ON a.id = b.answer_id
      WHERE q.id = $1
      GROUP BY q.id
    `;

    const result = await this.db.query(query, [questionId]);

    if (result.rows.length === 0) {
      return 'open';
    }

    const { answer_count, accepted_answer_count } = result.rows[0];
    const answerCount = parseInt(answer_count);
    const acceptedCount = parseInt(accepted_answer_count);

    let status: QuestionStatus;
    if (acceptedCount > 0) {
      status = 'resolved';
    } else if (answerCount > 0) {
      status = 'partial'; // Has answers but none accepted
    } else {
      status = 'open';
    }

    // Update status in database
    await this.db.query('UPDATE questions SET status = $1, updated_at = NOW() WHERE id = $2', [
      status,
      questionId,
    ]);

    return status;
  }

  /**
   * Batch update statuses for all questions in a phase
   */
  async updatePhaseQuestionStatuses(phase: string, runId: string): Promise<{
    open: number;
    partial: number;
    resolved: number;
  }> {
    console.log(`[CarryOver] Updating question statuses for ${phase} phase`);

    const query = `
      UPDATE questions q
      SET status = CASE
        WHEN EXISTS (
          SELECT 1 FROM answers a
          INNER JOIN bindings b ON a.id = b.answer_id
          WHERE a.question_id = q.id AND b.decision = 'accept'
        ) THEN 'resolved'
        WHEN EXISTS (
          SELECT 1 FROM answers a WHERE a.question_id = q.id
        ) THEN 'partial'
        ELSE 'open'
      END,
      updated_at = NOW()
      WHERE q.phase = $1 AND q.run_id = $2
      RETURNING status
    `;

    const result = await this.db.query(query, [phase, runId]);

    const counts = {
      open: result.rows.filter((r) => r.status === 'open').length,
      partial: result.rows.filter((r) => r.status === 'partial').length,
      resolved: result.rows.filter((r) => r.status === 'resolved').length,
    };

    console.log(`[CarryOver] Status update complete:`, counts);

    return counts;
  }

  /**
   * Get carry-over statistics for a phase
   */
  async getCarryOverStats(phase: string): Promise<CarryOverStats> {
    const previousPhases = this.getPreviousPhases(phase);

    if (previousPhases.length === 0) {
      return {
        totalUnresolvedFromPrevious: 0,
        highPriorityUnresolved: 0,
        avgAgeInDays: 0,
        topOriginPhases: [],
      };
    }

    const query = `
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN q.priority >= 0.7 THEN 1 END) AS high_priority,
        AVG(EXTRACT(EPOCH FROM (NOW() - q.created_at)) / 86400) AS avg_age_days,
        q.phase
      FROM questions q
      LEFT JOIN answers a ON q.id = a.question_id
      LEFT JOIN bindings b ON a.id = b.answer_id
      WHERE q.phase = ANY($1)
        AND q.status IN ('open', 'partial')
      GROUP BY q.phase
      HAVING COUNT(CASE WHEN b.decision = 'accept' THEN 1 END) = 0
    `;

    const result = await this.db.query(query, [previousPhases]);

    const totalUnresolved = result.rows.reduce((sum, row) => sum + parseInt(row.total), 0);
    const highPriorityUnresolved = result.rows.reduce(
      (sum, row) => sum + parseInt(row.high_priority),
      0
    );
    const avgAge =
      result.rows.reduce((sum, row) => sum + parseFloat(row.avg_age_days || 0), 0) /
      Math.max(result.rows.length, 1);

    const topOriginPhases = result.rows
      .map((row) => ({
        phase: row.phase,
        count: parseInt(row.total),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return {
      totalUnresolvedFromPrevious: totalUnresolved,
      highPriorityUnresolved,
      avgAgeInDays: Math.round(avgAge * 10) / 10,
      topOriginPhases,
    };
  }

  /**
   * Get previous phases based on standard workflow order
   */
  private getPreviousPhases(currentPhase: string): string[] {
    const phaseOrder = [
      'INTAKE',
      'IDEATION',
      'CRITIQUE',
      'PRD',
      'BIZDEV',
      'ARCH',
      'BUILD',
      'CODING',
      'QA',
      'AESTHETIC',
      'RELEASE',
      'BETA',
      'GA',
    ];

    const currentIndex = phaseOrder.indexOf(currentPhase.toUpperCase());

    if (currentIndex <= 0) {
      return [];
    }

    // Return all previous phases
    return phaseOrder.slice(0, currentIndex);
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
// TYPES
// ============================================================================

export interface CarryOverConfig {
  currentPhase: string;
  runId: string;
  maxQuestions?: number; // Default: 50
  minPriority?: number; // Default: 0.5
}

export interface CarryOverQuestion {
  id: string;
  originPhase: string;
  text: string;
  tags: string[];
  priority: number;
  dependsOn: string[];
  status: QuestionStatus;
  answerCount: number;
  acceptedAnswerCount: number;
  ageInDays: number;
}

export type QuestionStatus = 'open' | 'partial' | 'resolved';

export interface CarryOverStats {
  totalUnresolvedFromPrevious: number;
  highPriorityUnresolved: number;
  avgAgeInDays: number;
  topOriginPhases: Array<{ phase: string; count: number }>;
}
