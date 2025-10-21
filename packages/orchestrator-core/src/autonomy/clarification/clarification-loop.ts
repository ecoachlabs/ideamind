import pino from 'pino';
import { EventEmitter } from 'events';
import { QAVCoordinator, QAVConfig } from '../qav/qav-coordinator';
import { Question } from '../qav/question-agent';
import { ValidationResult } from '../qav/validate-agent';

const logger = pino({ name: 'clarification-loop' });

/**
 * Clarification state
 */
export interface ClarificationState {
  phase: string;
  runId: string;
  attempt: number;
  max_attempts: number;
  questions_generated: number;
  questions_answered: number;
  grounding_score: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'requires_human';
  unanswered_questions: Question[];
  validation?: ValidationResult;
  created_at: string;
  updated_at: string;
}

/**
 * Clarification result
 */
export interface ClarificationResult {
  success: boolean;
  grounding_score: number;
  attempts_used: number;
  kmap_updates: Record<string, any>;
  validation: ValidationResult;
  requires_human: boolean;
  unanswered_questions: Question[];
}

/**
 * Clarification Loop
 *
 * Manages the clarification cycle integrated into phase execution
 * Spec: phase.txt:186-207
 */
export class ClarificationLoop extends EventEmitter {
  private states: Map<string, ClarificationState> = new Map();

  constructor(
    private qavCoordinator: QAVCoordinator,
    private db: any
  ) {
    super();
  }

  /**
   * Run clarification loop for a phase
   *
   * @param phase - Phase name
   * @param runId - Run ID
   * @param context - Phase context
   * @param kmap - Knowledge map
   * @param artifacts - Existing artifacts
   * @param config - Q/A/V configuration
   * @returns Clarification result
   */
  async run(
    phase: string,
    runId: string,
    context: Record<string, any>,
    kmap: Record<string, any>,
    artifacts: Array<{ id: string; type: string; content?: any }>,
    config: QAVConfig
  ): Promise<ClarificationResult> {
    const stateKey = `${runId}:${phase}`;

    logger.info(
      {
        phase,
        runId,
        max_attempts: config.max_questions,
      },
      'Starting clarification loop'
    );

    // Initialize state
    const state: ClarificationState = {
      phase,
      runId,
      attempt: 0,
      max_attempts: 3, // Max clarification attempts
      questions_generated: 0,
      questions_answered: 0,
      grounding_score: 0,
      status: 'in_progress',
      unanswered_questions: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.states.set(stateKey, state);
    this.emit('clarification.started', { phase, runId });

    let currentKmap = { ...kmap };
    let validation: ValidationResult | undefined;

    // Clarification loop
    while (state.attempt < state.max_attempts) {
      state.attempt += 1;
      state.updated_at = new Date().toISOString();

      logger.info(
        {
          phase,
          runId,
          attempt: state.attempt,
          max_attempts: state.max_attempts,
        },
        'Clarification attempt'
      );

      this.emit('clarification.attempt', {
        phase,
        runId,
        attempt: state.attempt,
      });

      // Run Q/A/V cycle
      try {
        validation = await this.qavCoordinator.runCycle(
          phase,
          context,
          currentKmap,
          artifacts,
          config
        );

        state.questions_generated = validation.summary.questions_count;
        state.questions_answered = validation.summary.answered_count;
        state.grounding_score = validation.grounding_score;
        state.validation = validation;

        logger.info(
          {
            phase,
            runId,
            attempt: state.attempt,
            questions: validation.summary.questions_count,
            answered: validation.summary.answered_count,
            grounding_score: validation.grounding_score,
          },
          'Q/A/V cycle complete'
        );

        // Check if validation passed
        if (validation.valid) {
          logger.info(
            {
              phase,
              runId,
              attempt: state.attempt,
              grounding_score: validation.grounding_score,
            },
            'Clarification successful'
          );

          // Update knowledge map with validated bindings
          currentKmap = this.qavCoordinator.updateKnowledgeMap(
            currentKmap,
            validation
          );

          state.status = 'completed';
          this.states.set(stateKey, state);

          this.emit('clarification.completed', {
            phase,
            runId,
            grounding_score: validation.grounding_score,
            attempts: state.attempt,
          });

          return {
            success: true,
            grounding_score: validation.grounding_score,
            attempts_used: state.attempt,
            kmap_updates: currentKmap,
            validation,
            requires_human: false,
            unanswered_questions: [],
          };
        }

        // Check if we have unanswered questions
        const unansweredCount =
          validation.summary.questions_count - validation.summary.answered_count;

        if (unansweredCount > 0) {
          logger.warn(
            {
              phase,
              runId,
              unanswered_count: unansweredCount,
            },
            'Questions remain unanswered'
          );

          // If we're on last attempt or requires human approval, fail with human required
          if (
            state.attempt >= state.max_attempts ||
            config.require_human_approval
          ) {
            state.status = 'requires_human';
            this.states.set(stateKey, state);

            this.emit('clarification.requires_human', {
              phase,
              runId,
              unanswered_count: unansweredCount,
            });

            return {
              success: false,
              grounding_score: validation.grounding_score,
              attempts_used: state.attempt,
              kmap_updates: currentKmap,
              validation,
              requires_human: true,
              unanswered_questions: state.unanswered_questions,
            };
          }
        }

        // Not valid yet - try again with updated context
        logger.info(
          {
            phase,
            runId,
            attempt: state.attempt,
            grounding_score: validation.grounding_score,
          },
          'Clarification not sufficient, retrying'
        );

        // Update context with partial bindings for next attempt
        if (validation.bindings.length > 0) {
          currentKmap = this.qavCoordinator.updateKnowledgeMap(
            currentKmap,
            validation
          );
        }
      } catch (error) {
        logger.error(
          {
            error,
            phase,
            runId,
            attempt: state.attempt,
          },
          'Clarification attempt failed'
        );

        // If last attempt, fail
        if (state.attempt >= state.max_attempts) {
          break;
        }
      }
    }

    // Max attempts reached without success
    logger.warn(
      {
        phase,
        runId,
        attempts: state.attempt,
        grounding_score: state.grounding_score,
      },
      'Clarification failed after max attempts'
    );

    state.status = 'failed';
    this.states.set(stateKey, state);

    this.emit('clarification.failed', {
      phase,
      runId,
      attempts: state.attempt,
      grounding_score: state.grounding_score,
    });

    return {
      success: false,
      grounding_score: state.grounding_score,
      attempts_used: state.attempt,
      kmap_updates: currentKmap,
      validation: validation || {
        valid: false,
        grounding_score: 0,
        bindings: [],
        conflicts: [],
        summary: {
          questions_count: 0,
          answered_count: 0,
          validated_count: 0,
          avg_confidence: 0,
          avg_grounding: 0,
        },
      },
      requires_human: true,
      unanswered_questions: state.unanswered_questions,
    };
  }

  /**
   * Run clarification with human fallback
   *
   * @param phase - Phase name
   * @param runId - Run ID
   * @param context - Phase context
   * @param kmap - Knowledge map
   * @param artifacts - Existing artifacts
   * @param config - Q/A/V configuration
   * @param humanInputCallback - Callback to get human input for questions
   * @returns Clarification result
   */
  async runWithHuman(
    phase: string,
    runId: string,
    context: Record<string, any>,
    kmap: Record<string, any>,
    artifacts: Array<{ id: string; type: string; content?: any }>,
    config: QAVConfig,
    humanInputCallback: (questions: Question[]) => Promise<Record<string, string>>
  ): Promise<ClarificationResult> {
    const stateKey = `${runId}:${phase}`;

    logger.info(
      {
        phase,
        runId,
      },
      'Starting clarification loop with human fallback'
    );

    const state: ClarificationState = {
      phase,
      runId,
      attempt: 1,
      max_attempts: 1, // Single attempt when using human
      questions_generated: 0,
      questions_answered: 0,
      grounding_score: 0,
      status: 'in_progress',
      unanswered_questions: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.states.set(stateKey, state);
    this.emit('clarification.started', { phase, runId });

    try {
      const validation = await this.qavCoordinator.runCycleWithHuman(
        phase,
        context,
        kmap,
        artifacts,
        config,
        humanInputCallback
      );

      state.questions_generated = validation.summary.questions_count;
      state.questions_answered = validation.summary.answered_count;
      state.grounding_score = validation.grounding_score;
      state.validation = validation;

      if (validation.valid) {
        const updatedKmap = this.qavCoordinator.updateKnowledgeMap(
          kmap,
          validation
        );

        state.status = 'completed';
        this.states.set(stateKey, state);

        this.emit('clarification.completed', {
          phase,
          runId,
          grounding_score: validation.grounding_score,
        });

        return {
          success: true,
          grounding_score: validation.grounding_score,
          attempts_used: 1,
          kmap_updates: updatedKmap,
          validation,
          requires_human: false,
          unanswered_questions: [],
        };
      }

      // Failed even with human input
      state.status = 'failed';
      this.states.set(stateKey, state);

      this.emit('clarification.failed', {
        phase,
        runId,
        grounding_score: validation.grounding_score,
      });

      return {
        success: false,
        grounding_score: validation.grounding_score,
        attempts_used: 1,
        kmap_updates: kmap,
        validation,
        requires_human: false,
        unanswered_questions: [],
      };
    } catch (error) {
      logger.error(
        {
          error,
          phase,
          runId,
        },
        'Clarification with human failed'
      );

      state.status = 'failed';
      this.states.set(stateKey, state);

      throw error;
    }
  }

  /**
   * Get clarification state
   */
  getState(runId: string, phase: string): ClarificationState | null {
    return this.states.get(`${runId}:${phase}`) || null;
  }

  /**
   * Check if clarification is required
   *
   * @param phase - Phase name
   * @param context - Phase context
   * @param config - Q/A/V configuration
   * @returns True if clarification is needed
   */
  isRequired(
    phase: string,
    context: Record<string, any>,
    config: QAVConfig
  ): boolean {
    // Clarification is required if Q/A/V is enabled
    return config.enabled;
  }

  /**
   * Persist clarification state to database
   */
  async persist(runId: string, phase: string): Promise<void> {
    const state = this.getState(runId, phase);
    if (!state) {
      return;
    }

    await this.db.query(
      `
      INSERT INTO clarification_loops (run_id, phase, attempt, max_attempts, questions_generated, questions_answered, grounding_score, status, validation, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (run_id, phase) DO UPDATE
      SET attempt = EXCLUDED.attempt,
          questions_answered = EXCLUDED.questions_answered,
          grounding_score = EXCLUDED.grounding_score,
          status = EXCLUDED.status,
          validation = EXCLUDED.validation,
          updated_at = EXCLUDED.updated_at
    `,
      [
        runId,
        phase,
        state.attempt,
        state.max_attempts,
        state.questions_generated,
        state.questions_answered,
        state.grounding_score,
        state.status,
        JSON.stringify(state.validation || null),
        state.created_at,
        state.updated_at,
      ]
    );

    logger.debug({ runId, phase }, 'Clarification state persisted');
  }

  /**
   * Clear state
   */
  clear(runId: string, phase: string): void {
    this.states.delete(`${runId}:${phase}`);
  }

  /**
   * Get all active clarification loops
   */
  getActiveLoops(): ClarificationState[] {
    return Array.from(this.states.values()).filter(
      (s) => s.status === 'in_progress'
    );
  }
}
