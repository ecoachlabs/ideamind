import pino from 'pino';
import { QuestionAgent, Question } from './question-agent';
import { AnswerAgent, Answer, KnowledgeSource } from './answer-agent';
import { ValidateAgent, ValidationResult } from './validate-agent';

const logger = pino({ name: 'qav-coordinator' });

/**
 * Q/A/V Triad Configuration
 */
export interface QAVConfig {
  enabled: boolean;
  max_questions: number;
  min_grounding_score: number;
  allow_inference: boolean;
  require_human_approval: boolean;
}

/**
 * Q/A/V Triad Coordinator
 *
 * Orchestrates the Question, Answer, Validate cycle for autonomous clarification
 * Spec: phase.txt:186-207
 */
export class QAVCoordinator {
  private questionAgent: QuestionAgent;
  private answerAgent: AnswerAgent;
  private validateAgent: ValidateAgent;

  constructor(
    apiKey: string,
    knowledgeSource: KnowledgeSource | null,
    config: Partial<QAVConfig> = {}
  ) {
    const fullConfig: QAVConfig = {
      enabled: true,
      max_questions: 15,
      min_grounding_score: 0.85,
      allow_inference: true,
      require_human_approval: false,
      ...config,
    };

    this.questionAgent = new QuestionAgent(apiKey);
    this.answerAgent = new AnswerAgent(apiKey, knowledgeSource);
    this.validateAgent = new ValidateAgent(
      apiKey,
      fullConfig.min_grounding_score
    );
  }

  /**
   * Run complete Q/A/V cycle
   *
   * @param phase - Phase name
   * @param context - Current phase context
   * @param kmap - Knowledge map
   * @param artifacts - Existing artifacts
   * @param config - Q/A/V configuration
   * @returns Validation result with bindings
   */
  async runCycle(
    phase: string,
    context: Record<string, any>,
    kmap: Record<string, any>,
    artifacts: Array<{ id: string; type: string; content?: any }>,
    config: QAVConfig
  ): Promise<ValidationResult> {
    logger.info(
      {
        phase,
        max_questions: config.max_questions,
        min_grounding: config.min_grounding_score,
      },
      'Starting Q/A/V cycle'
    );

    // Step 1: Generate questions
    const questions = await this.questionAgent.generateQuestions(
      phase,
      context,
      artifacts,
      config.max_questions
    );

    if (questions.length === 0) {
      logger.info({ phase }, 'No questions generated - context is sufficient');
      return {
        valid: true,
        grounding_score: 1.0,
        bindings: [],
        conflicts: [],
        summary: {
          questions_count: 0,
          answered_count: 0,
          validated_count: 0,
          avg_confidence: 1.0,
          avg_grounding: 1.0,
        },
      };
    }

    // Step 2: Answer questions
    const { answers, unanswered } = await this.answerAgent.answerQuestions(
      questions,
      context,
      kmap,
      config.allow_inference
    );

    // Check if we have unanswered required questions
    const unansweredRequired = unanswered.filter((q) => q.required);
    if (unansweredRequired.length > 0 && config.require_human_approval) {
      logger.warn(
        {
          phase,
          unanswered_required: unansweredRequired.length,
          questions: unansweredRequired.map((q) => q.text),
        },
        'Required questions unanswered - human input needed'
      );

      // Emit event for human intervention
      // In a real implementation, this would trigger a workflow for human input
    }

    // Step 3: Validate answers
    const validation = await this.validateAgent.validate(
      questions,
      answers,
      context,
      artifacts
    );

    logger.info(
      {
        phase,
        valid: validation.valid,
        grounding_score: validation.grounding_score,
        bindings_count: validation.bindings.length,
      },
      'Q/A/V cycle complete'
    );

    return validation;
  }

  /**
   * Run Q/A/V cycle with human input for unanswered questions
   *
   * @param phase - Phase name
   * @param context - Current phase context
   * @param kmap - Knowledge map
   * @param artifacts - Existing artifacts
   * @param config - Q/A/V configuration
   * @param humanInputCallback - Callback to get human input
   * @returns Validation result with bindings
   */
  async runCycleWithHuman(
    phase: string,
    context: Record<string, any>,
    kmap: Record<string, any>,
    artifacts: Array<{ id: string; type: string; content?: any }>,
    config: QAVConfig,
    humanInputCallback: (questions: Question[]) => Promise<Record<string, string>>
  ): Promise<ValidationResult> {
    logger.info({ phase }, 'Starting Q/A/V cycle with human fallback');

    // Generate questions
    const questions = await this.questionAgent.generateQuestions(
      phase,
      context,
      artifacts,
      config.max_questions
    );

    if (questions.length === 0) {
      return {
        valid: true,
        grounding_score: 1.0,
        bindings: [],
        conflicts: [],
        summary: {
          questions_count: 0,
          answered_count: 0,
          validated_count: 0,
          avg_confidence: 1.0,
          avg_grounding: 1.0,
        },
      };
    }

    // Try to answer automatically
    const { answers: autoAnswers, unanswered } =
      await this.answerAgent.answerQuestions(
        questions,
        context,
        kmap,
        config.allow_inference
      );

    // Get human input for unanswered questions
    let humanAnswers: Answer[] = [];
    if (unanswered.length > 0) {
      logger.info(
        { unanswered_count: unanswered.length },
        'Requesting human input'
      );

      const humanResponses = await humanInputCallback(unanswered);
      humanAnswers = Object.entries(humanResponses).map(
        ([questionId, answerText]) =>
          this.answerAgent.createHumanAnswer(questionId, answerText)
      );
    }

    // Combine all answers
    const allAnswers = [...autoAnswers, ...humanAnswers];

    // Validate
    const validation = await this.validateAgent.validate(
      questions,
      allAnswers,
      context,
      artifacts
    );

    logger.info(
      {
        phase,
        valid: validation.valid,
        grounding_score: validation.grounding_score,
        auto_answers: autoAnswers.length,
        human_answers: humanAnswers.length,
      },
      'Q/A/V cycle with human input complete'
    );

    return validation;
  }

  /**
   * Update knowledge map with validated bindings
   */
  updateKnowledgeMap(
    kmap: Record<string, any>,
    validation: ValidationResult
  ): Record<string, any> {
    if (!validation.valid) {
      logger.warn('Validation not valid - not updating knowledge map');
      return kmap;
    }

    return this.validateAgent.applyBindings(kmap, validation.bindings);
  }
}
