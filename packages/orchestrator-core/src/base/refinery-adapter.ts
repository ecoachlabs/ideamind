/**
 * Refinery Adapter
 *
 * Transforms refined Refinery outputs (AtomicQuestion, CanonicalAnswer)
 * to Knowledge Map format (KMQuestion, KMAnswer) for persistence.
 *
 * ENHANCED: Processes Q/A/V bundles from autonomous clarification loop
 * - Fission: Breaks accepted Q/A pairs into atomic knowledge frames
 * - Grounding: Validates frames against existing knowledge
 * - Fusion: Clusters similar frames, creates canonical frames
 * - ASSUMPTIONS: Registers UNKNOWN answers as assumptions in DB
 */

import { Pool } from 'pg';
import { EventEmitter } from 'events';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Q/A/V Bundle from autonomous clarification loop
 */
export interface QAVBundle {
  questions: any[];
  answers: any[];
  validations: any[];
  phase: string;
  run_id: string;
}

/**
 * Result of processing Q/A/V bundle
 */
export interface QAVProcessingResult {
  kmap_refs: string[];      // Knowledge Map frame IDs created
  assumptions: any[];       // Assumptions registered for UNKNOWN answers
  metrics: {
    questions_processed: number;
    answers_accepted: number;
    answers_unknown: number;
    frames_created: number;
    assumptions_created: number;
  };
}

/**
 * Knowledge frame (atomic unit of knowledge)
 */
interface KnowledgeFrame {
  id: string;
  question_id: string;
  answer_id: string;
  frame_type: 'factual' | 'procedural' | 'constraint' | 'assumption';
  content: string;
  evidence_ids: string[];
  confidence: number;
  phase: string;
}

// ============================================================================
// ADAPTER
// ============================================================================

export class RefineryAdapter {
  private dbPool?: Pool;
  private eventEmitter?: EventEmitter;

  constructor(config?: { dbPool?: Pool; eventEmitter?: EventEmitter }) {
    this.dbPool = config?.dbPool;
    this.eventEmitter = config?.eventEmitter;
  }

  /**
   * Process Q/A/V bundle through Knowledge Refinery pipeline
   *
   * Flow:
   * 1. Filter accepted Q/A pairs and UNKNOWN answers
   * 2. FISSION: Break accepted pairs into atomic knowledge frames
   * 3. GROUNDING: Validate frames against existing KM
   * 4. FUSION: Cluster similar frames, create canonical frames
   * 5. Emit kmap.delta event
   * 6. Register UNKNOWN answers as ASSUMPTIONS in DB
   *
   * Spec: UNIFIED_IMPLEMENTATION_SPEC.md Section 2.2
   */
  async processQAVBundle(bundle: QAVBundle): Promise<QAVProcessingResult> {
    console.log(
      `[RefineryAdapter] Processing Q/A/V bundle: ${bundle.questions.length} questions, ${bundle.answers.length} answers`
    );

    const metrics = {
      questions_processed: bundle.questions.length,
      answers_accepted: 0,
      answers_unknown: 0,
      frames_created: 0,
      assumptions_created: 0,
    };

    try {
      // Step 1: Filter accepted Q/A pairs
      const acceptedPairs = bundle.validations
        .filter((v: any) => v.accepted)
        .map((v: any) => {
          const question = bundle.questions.find((q: any) => q.id === v.question_id);
          const answer = bundle.answers.find((a: any) => a.question_id === v.question_id);
          return { question, answer, validation: v };
        })
        .filter((p: any) => p.question && p.answer);

      metrics.answers_accepted = acceptedPairs.length;

      // Step 2: Filter UNKNOWN answers
      const unknownAnswers = bundle.answers.filter((a: any) => a.answer === 'UNKNOWN');
      metrics.answers_unknown = unknownAnswers.length;

      console.log(
        `[RefineryAdapter] ${acceptedPairs.length} accepted, ${unknownAnswers.length} UNKNOWN`
      );

      // Step 3: FISSION - Create knowledge frames from accepted Q/A pairs
      const frames = await this.fissionQAPairs(acceptedPairs, bundle.phase);
      metrics.frames_created = frames.length;

      console.log(`[RefineryAdapter] Created ${frames.length} knowledge frames`);

      // Step 4: GROUNDING - Validate frames (placeholder for full Refinery integration)
      // In full implementation, this would call RefineryClient.groundFrames()
      const groundedFrames = frames; // For MVP, skip grounding

      // Step 5: FUSION - Cluster frames (placeholder for full Refinery integration)
      // In full implementation, this would call RefineryClient.fusionFrames()
      const canonicalFrames = groundedFrames; // For MVP, skip fusion

      // Step 6: Emit kmap.delta event
      await this.emitKMapDelta(canonicalFrames, bundle.run_id, bundle.phase);

      // Step 7: Register UNKNOWN answers as ASSUMPTIONS
      const assumptions = await this.registerAssumptions(
        unknownAnswers,
        bundle.run_id,
        bundle.phase
      );
      metrics.assumptions_created = assumptions.length;

      console.log(`[RefineryAdapter] Registered ${assumptions.length} assumptions`);

      return {
        kmap_refs: canonicalFrames.map((f: KnowledgeFrame) => f.id),
        assumptions,
        metrics,
      };
    } catch (error) {
      console.error('[RefineryAdapter] Q/A/V processing failed:', error);
      throw error;
    }
  }

  /**
   * FISSION: Break Q/A pairs into atomic knowledge frames
   */
  private async fissionQAPairs(
    acceptedPairs: any[],
    phase: string
  ): Promise<KnowledgeFrame[]> {
    const frames: KnowledgeFrame[] = [];

    for (const pair of acceptedPairs) {
      const { question, answer, validation } = pair;

      // Determine frame type from question category
      const frameTypeMap: Record<string, KnowledgeFrame['frame_type']> = {
        clarification: 'factual',
        validation: 'factual',
        assumption: 'assumption',
        risk: 'constraint',
        completeness: 'factual',
        consistency: 'factual',
      };

      const frameType = frameTypeMap[question.category] || 'factual';

      // Create knowledge frame
      const frame: KnowledgeFrame = {
        id: `FRAME-${crypto.randomBytes(8).toString('hex')}`,
        question_id: question.id,
        answer_id: answer.answer_id,
        frame_type: frameType,
        content: `Q: ${question.text}\nA: ${answer.answer}`,
        evidence_ids: answer.citations?.map((c: any) => c.id) || [],
        confidence: validation.overall_score,
        phase,
      };

      frames.push(frame);
    }

    return frames;
  }

  /**
   * Emit kmap.delta event for Knowledge Map updates
   */
  private async emitKMapDelta(
    frames: KnowledgeFrame[],
    runId: string,
    phase: string
  ): Promise<void> {
    if (!this.eventEmitter) {
      console.warn('[RefineryAdapter] No event emitter configured, skipping kmap.delta event');
      return;
    }

    const event = {
      type: 'kmap.delta',
      keys: {
        run_id: runId,
        phase,
      },
      payload: {
        frames: frames.map((f) => ({
          id: f.id,
          question_id: f.question_id,
          answer_id: f.answer_id,
          type: f.frame_type,
          confidence: f.confidence,
        })),
        count: frames.length,
        timestamp: new Date().toISOString(),
      },
      metadata: {
        source: 'qav',
      },
    };

    this.eventEmitter.emit('kmap.delta', event);
    console.log(`[RefineryAdapter] Emitted kmap.delta event with ${frames.length} frames`);
  }

  /**
   * Register UNKNOWN answers as ASSUMPTIONS in database
   *
   * Per spec: When confidence < 0.6, answer is UNKNOWN and becomes an ASSUMPTION
   * that must be validated in future phases.
   */
  private async registerAssumptions(
    unknownAnswers: any[],
    runId: string,
    phase: string
  ): Promise<any[]> {
    if (!this.dbPool) {
      console.warn('[RefineryAdapter] No DB pool configured, skipping assumption registration');
      return [];
    }

    const assumptions = [];

    const client = await this.dbPool.connect();

    try {
      await client.query('BEGIN');

      for (const answer of unknownAnswers) {
        const assumptionId = crypto.randomUUID();

        // Find corresponding question
        const questionText = answer.question_id || 'Unknown question';

        const assumption = {
          id: assumptionId,
          run_id: runId,
          phase_id: phase,
          assumption: `Question: ${questionText} - Answer UNKNOWN (insufficient evidence)`,
          rationale: answer.reasoning || 'Confidence below threshold (0.6)',
          mitigation_tasks: answer.next_steps || [],
          status: 'active',
          created_at: new Date().toISOString(),
        };

        // Insert into assumptions table
        await client.query(
          `INSERT INTO assumptions (id, run_id, phase_id, assumption, rationale, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (id) DO NOTHING`,
          [
            assumption.id,
            assumption.run_id,
            assumption.phase_id,
            assumption.assumption,
            assumption.rationale,
            assumption.status,
          ]
        );

        assumptions.push(assumption);

        console.log(
          `[RefineryAdapter] Registered assumption ${assumptionId} for question ${answer.question_id}`
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[RefineryAdapter] Failed to register assumptions:', error);
      throw error;
    } finally {
      client.release();
    }

    return assumptions;
  }

  /**
   * Convert AtomicQuestion[] to KM-compatible question format
   */
  static adaptQuestions(
    atomicQuestions: any[],
    originalQuestions: any[]
  ): any[] {
    // Create map of original questions for reference
    const originalMap = new Map(originalQuestions.map((q) => [q.id, q]));

    return atomicQuestions.map((atom) => {
      // Get original question if this is not a decomposed atom
      const original = originalMap.get(atom.id) || originalMap.get(atom.parentQuestionId);

      return {
        id: atom.id,
        text: atom.text,
        tags: original?.tags || this.inferTagsFromType(atom.type),
        priority: this.convertPriority(atom.priority),
        depends_on: original?.depends_on || [],
        // Preserve additional fields from atomic question
        type: atom.type,
        parentQuestionId: atom.parentQuestionId,
      };
    });
  }

  /**
   * Convert CanonicalAnswer[] to KM-compatible answer format
   */
  static adaptAnswers(
    canonicalAnswers: any[],
    originalAnswers: any[],
    questionMap: Map<string, string>  // Maps answer ID to question ID
  ): any[] {
    // Create map of original answers for reference
    const originalMap = new Map(originalAnswers.map((a) => [a.answer_id || a.id, a]));

    return canonicalAnswers.map((canonical) => {
      // Try to find matching original answer
      // Canonical answer ID format: "CANONICAL-CLUSTER-N"
      // Need to map back to original question
      const clusterId = canonical.id.replace('CANONICAL-', '');
      const questionId = questionMap.get(canonical.id) || this.findQuestionForCanonical(canonical, originalAnswers);

      return {
        id: canonical.id,
        answer_id: canonical.id,
        question_id: questionId,
        answer: canonical.answer,
        evidence_ids: canonical.evidenceIds || [],
        assumptions: [], // Canonical answers are synthesized, no assumptions
        confidence: canonical.consensusConfidence,
        // Preserve Refinery-specific fields
        lineage: canonical.lineage,
        isCanonical: true,
      };
    });
  }

  /**
   * Convert priority string to number
   */
  private static convertPriority(priority: string | number): number {
    if (typeof priority === 'number') {
      return Math.max(0, Math.min(1, priority));
    }

    const priorityMap: Record<string, number> = {
      high: 0.9,
      medium: 0.5,
      low: 0.2,
    };

    return priorityMap[priority.toLowerCase()] || 0.5;
  }

  /**
   * Infer tags from question type
   */
  private static inferTagsFromType(type: string): string[] {
    const tagMap: Record<string, string[]> = {
      factual: ['factual', 'atomic'],
      analytical: ['analytical', 'atomic'],
      exploratory: ['exploratory', 'atomic'],
    };

    return tagMap[type] || ['atomic'];
  }

  /**
   * Find question ID for canonical answer
   * Uses lineage information if available
   */
  private static findQuestionForCanonical(canonical: any, originalAnswers: any[]): string {
    // Check lineage for contributor answer IDs
    if (canonical.lineage?.contributorIds && canonical.lineage.contributorIds.length > 0) {
      // Find first original answer to get question ID
      const contributorId = canonical.lineage.contributorIds[0];
      const contributor = originalAnswers.find((a) => a.answer_id === contributorId || a.id === contributorId);
      if (contributor?.question_id) {
        return contributor.question_id;
      }
    }

    // Fallback: extract from canonical ID or return placeholder
    return `Q-CANONICAL-${canonical.id}`;
  }

  /**
   * Create question-to-answer mapping from clustering
   */
  static createQuestionMapping(
    clusters: any[],
    originalAnswers: any[]
  ): Map<string, string> {
    const mapping = new Map<string, string>();
    const answerMap = new Map(originalAnswers.map((a) => [a.answer_id || a.id, a]));

    for (const cluster of clusters) {
      const canonicalId = `CANONICAL-${cluster.id}`;

      // Get question ID from first contributor answer
      if (cluster.answerIds && cluster.answerIds.length > 0) {
        const firstAnswer = answerMap.get(cluster.answerIds[0]);
        if (firstAnswer?.question_id) {
          mapping.set(canonicalId, firstAnswer.question_id);
        }
      }
    }

    return mapping;
  }
}
