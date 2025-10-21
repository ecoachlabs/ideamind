/**
 * EnhancedPhaseCoordinator - Integrates Level-2 Gatekeepers
 *
 * Extends PhaseCoordinator with:
 * - Gatekeeper evaluation after phase completion
 * - Dispatcher for event-driven coordination
 * - Comprehensive recorder integration
 * - Automatic retry on gate failure with hints
 *
 * Execution flow:
 * 1. FAN-OUT: Execute agents in parallel
 * 2. FAN-IN: Aggregate results
 * 3. GATEKEEPER: Evaluate quality gates
 * 4. If PASS: Continue to next phase
 * 5. If FAIL: Generate required actions, loop back with hints
 * 6. RECORDER: Log all decisions and gate results
 */

import {
  PhaseCoordinator,
  type PhaseCoordinatorConfig,
  type PhaseInput,
  type PhaseOutput,
} from './phase-coordinator';
import {
  Gatekeeper,
  type GateEvaluationResult,
  type GateEvaluationInput,
} from '../gatekeeper/gatekeeper';
import {
  Recorder,
  InMemoryRecorderStorage,
} from '../recorder/recorder';
import {
  Dispatcher,
  EventTopic,
} from '../dispatcher/dispatcher';
import {
  QuestionAgentHub,
} from '../../../agent-sdk/src/hubs/question-agent-hub';
import {
  AnswerAgentHub,
} from '../../../agent-sdk/src/hubs/answer-agent-hub';
import {
  ValidatorHub,
} from '../../../agent-sdk/src/hubs/validator-hub';
import {
  KnowledgeMapClient,
  type KMQuestion,
  type KMAnswer,
  type KMBinding,
} from '../knowledge-map/km-client';
import {
  RefineryClient,
} from '../../../tool-sdk/src/refinery/refinery-client';
import { Pool } from 'pg';
import { RefineryAdapter, type QAVBundle } from './refinery-adapter';
import { KMCarryOverManager } from '../knowledge-map/km-carry-over';
import {
  PhaseEventType,
  type PhaseStartedEvent,
  type PhaseProgressEvent,
  type PhaseStalledEvent,
  type PhaseReadyEvent,
  type PhaseGatePassedEvent,
  type PhaseGateFailedEvent,
  type PhaseErrorEvent,
  type PhaseEvent,
} from '@ideamine/event-schemas';
import { QuestionAgent } from '../../../agents/src/qav/question-agent';
import { AnswerAgent } from '../../../agents/src/qav/answer-agent';
import { QuestionValidator } from '../../../agents/src/qav/question-validator';
import type { Question, Answer, ValidationResult } from '../../../agents/src/qav/types';

export interface EnhancedPhaseCoordinatorConfig extends PhaseCoordinatorConfig {
  // Gatekeeper for this phase
  gatekeeper?: Gatekeeper;

  // Recorder instance
  recorder?: Recorder;

  // Dispatcher instance
  dispatcher?: Dispatcher;

  // Max retry attempts on gate failure
  maxGateRetries?: number;

  // Auto-retry on gate failure
  autoRetryOnGateFail?: boolean;

  // Enable Knowledge Map generation (QAQ/QAA/QV triad)
  enableKnowledgeMap?: boolean;

  // PostgreSQL connection string for Knowledge Map
  knowledgeMapConnectionString?: string;

  // Enable Knowledge Refinery (12-stage post-processing pipeline)
  enableRefinery?: boolean;

  // Database connection pool for Refinery
  dbPool?: Pool;
}

/**
 * EnhancedPhaseCoordinator - Adds gatekeeper integration
 */
export abstract class EnhancedPhaseCoordinator extends PhaseCoordinator {
  protected gatekeeper?: Gatekeeper;
  protected recorder: Recorder;
  protected dispatcher?: Dispatcher;
  protected maxGateRetries: number;
  protected autoRetryOnGateFail: boolean;
  protected gateRetryCount: number = 0;

  // Knowledge Map hubs
  protected enableKnowledgeMap: boolean;
  protected questionAgentHub: QuestionAgentHub;
  protected answerAgentHub: AnswerAgentHub;
  protected validatorHub: ValidatorHub;
  protected knowledgeMapConnectionString?: string;
  protected kmClient?: KnowledgeMapClient;

  // Knowledge Refinery
  protected enableRefinery: boolean;
  protected dbPool?: Pool;
  protected refineryClient?: RefineryClient;

  // Knowledge Map Carry-Over
  protected carryOverManager?: KMCarryOverManager;

  // Q/A/V Triad (Autonomy Layer)
  protected questionAgent?: QuestionAgent;
  protected answerAgent?: AnswerAgent;
  protected questionValidator?: QuestionValidator;
  protected refineryAdapter?: RefineryAdapter;

  constructor(config: EnhancedPhaseCoordinatorConfig) {
    super(config);

    this.gatekeeper = config.gatekeeper;
    this.recorder = config.recorder || new Recorder(new InMemoryRecorderStorage());
    this.dispatcher = config.dispatcher;
    this.maxGateRetries = config.maxGateRetries || 2;
    this.autoRetryOnGateFail = config.autoRetryOnGateFail ?? true;

    // Initialize Knowledge Map hubs
    this.enableKnowledgeMap = config.enableKnowledgeMap ?? false;
    this.questionAgentHub = new QuestionAgentHub();
    this.answerAgentHub = new AnswerAgentHub();
    this.validatorHub = new ValidatorHub();
    this.knowledgeMapConnectionString = config.knowledgeMapConnectionString;

    // Initialize KM database client if enabled
    if (this.enableKnowledgeMap && this.knowledgeMapConnectionString) {
      this.kmClient = new KnowledgeMapClient(this.knowledgeMapConnectionString);
    }

    // Initialize Refinery
    this.enableRefinery = config.enableRefinery ?? false;
    this.dbPool = config.dbPool;

    // Initialize Carry-Over Manager
    if (this.enableKnowledgeMap && this.dbPool) {
      this.carryOverManager = new KMCarryOverManager(this.dbPool);
    }

    // Initialize Q/A/V Triad (Autonomy Layer)
    this.questionAgent = new QuestionAgent({ phase: this.phaseName });
    this.answerAgent = new AnswerAgent({ phase: this.phaseName });
    this.questionValidator = new QuestionValidator({ phase: this.phaseName, dbPool: this.dbPool });
    this.refineryAdapter = new RefineryAdapter({ dbPool: this.dbPool, eventEmitter: this.dispatcher });

    // Note: RefineryClient is instantiated per-run in runKnowledgeMapGeneration
    // to ensure proper runId tracking
  }

  /**
   * Execute phase with gatekeeper evaluation
   */
  async execute(input: PhaseInput): Promise<PhaseOutput> {
    const runId = input.workflowRunId;
    const phaseRunId = `${runId}-${this.phaseName}`;
    const startTime = Date.now();

    // ✅ Emit phase.started event
    await this.emitPhaseStarted(runId);

    // Record phase start
    await this.recorder.recordStep({
      runId,
      phase: this.phaseName,
      step: `phase.${this.phaseName}.start`,
      actor: `Coordinator:${this.phaseName}`,
      cost: { usd: 0, tokens: 0 },
      latency_ms: 0,
      status: 'succeeded',
      metadata: { attempt: this.gateRetryCount + 1 },
    });

    try {
      // Execute agents (parent class implementation)
      const phaseResult = await super.execute(input);

      if (!phaseResult.success) {
        await this.emitPhaseError(runId, 'Phase execution failed', false);
        return phaseResult;
      }

      // ✅ Emit phase.ready event (artifacts created)
      await this.emitPhaseReady(runId, phaseResult.artifacts || []);

      // Run Knowledge Map generation (QAQ/QAA/QV triad)
      if (this.enableKnowledgeMap) {
        try {
          await this.runKnowledgeMapGeneration(runId, phaseResult);
        } catch (error) {
          console.error(`[${this.phaseName}Coordinator] Knowledge Map generation failed:`, error);
          // Continue even if KM generation fails - don't block phase completion
        }
      }

      // Evaluate gatekeeper if configured
      if (this.gatekeeper && phaseResult.artifacts) {
        const gateStartTime = Date.now();

        // Prepare gate evaluation input
        const gateInput = await this.prepareGateInput(input, phaseResult);

        // Evaluate gate
        const gateResult = await this.gatekeeper.evaluate(gateInput);

      const gateLatency = Date.now() - gateStartTime;

      console.log(
        `[${this.phaseName}Coordinator] Gate evaluation: ${gateResult.status} (score: ${gateResult.overallScore}/100)`
      );

      // Record gate result
      await this.recorder.recordScore({
        runId,
        phase: this.phaseName,
        scoreType: `gate:${this.gatekeeper.gateId}`,
        value: gateResult.overallScore,
        target: 70, // Default threshold
        status: gateResult.status === 'pass' ? 'pass' : gateResult.status === 'warn' ? 'warn' : 'fail',
        details: {
          decision: gateResult.decision.decision,
          metricResults: gateResult.metricResults,
        },
      });

        // Handle gate failure
        if (gateResult.status === 'fail') {
          console.log(
            `[${this.phaseName}Coordinator] Gate failed. Required actions:`,
            gateResult.decision.requiredActions
          );

          // ✅ Emit phase.gate.failed event
          await this.emitGateFailed(
            runId,
            gateResult.decision.reasons,
            'evidence-pack-id-placeholder', // TODO: Get actual evidence pack ID
            gateResult.overallScore,
            gateResult.decision.requiredActions || []
          );

          // Check if we should retry
          if (this.autoRetryOnGateFail && this.gateRetryCount < this.maxGateRetries) {
            this.gateRetryCount++;

            console.log(
              `[${this.phaseName}Coordinator] Retrying phase (attempt ${this.gateRetryCount + 1}/${this.maxGateRetries + 1}) with hints`
            );

            // Add hints from gate failure to input
            const enhancedInput = await this.enhanceInputWithHints(input, gateResult);

            // Recursive retry
            return await this.execute(enhancedInput);
          }

          // Max retries reached or auto-retry disabled
          return {
            success: false,
            error: `Gate evaluation failed: ${gateResult.decision.reasons.join('; ')}`,
            artifacts: phaseResult.artifacts,
            cost: phaseResult.cost,
            duration: phaseResult.duration,
          };
        }

        // Gate passed or warning
        if (gateResult.status === 'warn') {
          console.log(
            `[${this.phaseName}Coordinator] Gate passed with warnings:`,
            gateResult.recommendations
          );
        }

        // ✅ Emit phase.gate.passed event
        await this.emitGatePassed(
          runId,
          'evidence-pack-id-placeholder', // TODO: Get actual evidence pack ID
          gateResult.overallScore
        );

      // Dispatch phase completion event
      if (this.dispatcher) {
        await this.dispatcher.dispatch({
          topic: this.getPhaseCompletionEvent(),
          payload: {
            artifacts: phaseResult.artifacts,
            gateResult,
            metrics: gateInput.metrics,
          },
          priority: 8,
          metadata: {
            runId,
            phase: this.phaseName,
            source: `${this.phaseName}Coordinator`,
          },
        });
      }
    }

      // Reset retry count on success
      this.gateRetryCount = 0;

      return phaseResult;

    } catch (error) {
      // ✅ Emit phase.error event
      await this.emitPhaseError(
        runId,
        (error as Error).message,
        this.isRetryableError(error),
        this.gateRetryCount
      );
      throw error;
    }
  }

  /**
   * Prepare gate evaluation input from phase results
   * Override in subclasses to provide phase-specific metrics
   */
  protected abstract prepareGateInput(
    phaseInput: PhaseInput,
    phaseResult: PhaseOutput
  ): Promise<GateEvaluationInput>;

  /**
   * Enhance input with hints from gate failure
   * Override in subclasses for phase-specific hint processing
   */
  protected async enhanceInputWithHints(
    input: PhaseInput,
    gateResult: GateEvaluationResult
  ): Promise<PhaseInput> {
    // Default: Add gate feedback to input
    return {
      ...input,
      gateHints: {
        failedMetrics: gateResult.metricResults.filter((m) => !m.passed),
        requiredActions: gateResult.decision.requiredActions,
        recommendations: gateResult.recommendations,
      },
    };
  }

  /**
   * Get phase completion event topic
   */
  protected getPhaseCompletionEvent(): EventTopic | string {
    // Map phase name to event topic
    const eventMap: Record<string, EventTopic> = {
      INTAKE: EventTopic.INTAKE_READY,
      IDEATION: EventTopic.IDEATION_READY,
      CRITIQUE: EventTopic.CRITIQUE_READY,
      PRD: EventTopic.PRD_READY,
      BIZDEV: EventTopic.BIZDEV_READY,
      ARCH: EventTopic.ARCH_READY,
      BUILD: EventTopic.BUILD_READY,
      STORY_LOOP: EventTopic.STORY_DONE,
      QA: EventTopic.QA_READY,
      AESTHETIC: EventTopic.AESTHETIC_READY,
      RELEASE: EventTopic.RELEASE_READY,
      BETA: EventTopic.BETA_READY,
      GA: EventTopic.GA_READY,
    };

    return eventMap[this.phaseName] || `${this.phaseName.toLowerCase()}.ready`;
  }

  /**
   * Get recorder instance for subclasses
   */
  protected getRecorder(): Recorder {
    return this.recorder;
  }

  /**
   * Get dispatcher instance for subclasses
   */
  protected getDispatcher(): Dispatcher | undefined {
    return this.dispatcher;
  }

  /**
   * Event Emission Methods (Foundation Layer)
   */

  /**
   * Emit phase.started event
   */
  protected async emitPhaseStarted(runId: string): Promise<void> {
    const event: PhaseStartedEvent = {
      type: PhaseEventType.PHASE_STARTED,
      keys: {
        run_id: runId,
        phase: this.phaseName
      },
      payload: {
        phase_run_id: `${runId}-${this.phaseName}`,
        started_at: new Date().toISOString()
      }
    };

    await this.publishPhaseEvent(event);
  }

  /**
   * Emit phase.ready event
   */
  protected async emitPhaseReady(runId: string, artifacts: any[]): Promise<void> {
    const event: PhaseReadyEvent = {
      type: PhaseEventType.PHASE_READY,
      keys: {
        run_id: runId,
        phase: this.phaseName
      },
      payload: {
        phase: this.phaseName,
        artifacts: artifacts.map((a: any) => a.id || a.type || 'unknown'),
        completed_at: new Date().toISOString()
      }
    };

    await this.publishPhaseEvent(event);
  }

  /**
   * Emit phase.gate.passed event
   */
  protected async emitGatePassed(
    runId: string,
    evidencePackId: string,
    score: number
  ): Promise<void> {
    const event: PhaseGatePassedEvent = {
      type: PhaseEventType.PHASE_GATE_PASSED,
      keys: {
        run_id: runId,
        phase: this.phaseName
      },
      payload: {
        phase: this.phaseName,
        evidence_pack_id: evidencePackId,
        passed_at: new Date().toISOString(),
        score,
        rubrics_met: [] // TODO: Extract from gate result
      }
    };

    await this.publishPhaseEvent(event);
  }

  /**
   * Emit phase.gate.failed event
   */
  protected async emitGateFailed(
    runId: string,
    reasons: string[],
    evidencePackId: string,
    score: number,
    requiredActions: string[]
  ): Promise<void> {
    const event: PhaseGateFailedEvent = {
      type: PhaseEventType.PHASE_GATE_FAILED,
      keys: {
        run_id: runId,
        phase: this.phaseName
      },
      payload: {
        phase: this.phaseName,
        reasons,
        evidence_pack_id: evidencePackId,
        score,
        required_actions: requiredActions,
        can_waive: false // TODO: Determine from rubrics
      }
    };

    await this.publishPhaseEvent(event);
  }

  /**
   * Emit phase.error event
   */
  protected async emitPhaseError(
    runId: string,
    errorMessage: string,
    retryable: boolean,
    retryCount?: number
  ): Promise<void> {
    const event: PhaseErrorEvent = {
      type: PhaseEventType.PHASE_ERROR,
      keys: {
        run_id: runId,
        phase: this.phaseName
      },
      payload: {
        phase: this.phaseName,
        error: errorMessage,
        retryable,
        retry_count: retryCount
      }
    };

    await this.publishPhaseEvent(event);
  }

  /**
   * Publish phase event to event bus via dispatcher
   */
  private async publishPhaseEvent(event: PhaseEvent): Promise<void> {
    if (this.dispatcher) {
      try {
        await this.dispatcher.dispatch({
          topic: event.type as any,
          payload: event.payload,
          priority: 8,
          metadata: {
            ...event.keys,
            source: `${this.phaseName}Coordinator`,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error(
          `[${this.phaseName}Coordinator] Failed to publish phase event ${event.type}:`,
          error
        );
        // Don't throw - event emission failure shouldn't break phase execution
      }
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Retryable errors: network, timeout, rate limit
    const retryablePatterns = [
      /network/i,
      /timeout/i,
      /rate limit/i,
      /ECONNREFUSED/i,
      /ETIMEDOUT/i
    ];

    const errorMessage = error?.message || String(error);
    return retryablePatterns.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Run Knowledge Map generation using QAQ/QAA/QV triad
   * Pattern:
   * 1. FAN-OUT: Spawn QAQ + QAA agents in parallel
   * 2. FAN-IN: Collect questions and answers
   * 3. PAIR: Match questions with answers
   * 4. VALIDATE: Run QV validator on pairs (serial)
   * 5. PERSIST: Insert accepted bindings into Knowledge Map
   */
  protected async runKnowledgeMapGeneration(
    runId: string,
    phaseResult: PhaseOutput
  ): Promise<void> {
    const startTime = Date.now();

    console.log(`[${this.phaseName}Coordinator] Starting Knowledge Map generation...`);

    // Step 0: Load carry-over questions from previous phases
    let carryOverQuestions: any[] = [];
    if (this.carryOverManager) {
      try {
        carryOverQuestions = await this.carryOverManager.getCarryOverQuestions({
          currentPhase: this.phaseName,
          runId,
          maxQuestions: 50,
          minPriority: 0.5,
        });

        console.log(`[${this.phaseName}Coordinator] Loaded ${carryOverQuestions.length} carry-over questions`);
      } catch (error) {
        console.warn(`[${this.phaseName}Coordinator] Failed to load carry-over questions:`, error);
      }
    }

    // Step 1: FAN-OUT - Spawn phase-specific agents in parallel
    const [questionAgent, answerAgent] = [
      this.questionAgentHub.spawn(this.phaseName, runId),
      this.answerAgentHub.spawn(this.phaseName, runId),
    ];

    // Prepare input for question generation (based on phase artifacts)
    const qaqInput = {
      artifacts: phaseResult.artifacts,
      workflowRunId: runId,
      context: {
        phase: this.phaseName,
        priorQuestions: carryOverQuestions, // ✅ Pass carry-over questions
      },
    };

    // Step 2: Execute QAQ (generate questions) - this can be done in parallel with artifact preparation
    const questionsPromise = questionAgent.execute(qaqInput);

    // Wait for questions to be generated
    const qaqOutput = await questionsPromise;

    if (!qaqOutput.success || !qaqOutput.artifacts) {
      console.error(`[${this.phaseName}Coordinator] Question generation failed`);
      return;
    }

    // Extract questions from QAQ output
    const questionsArtifact = qaqOutput.artifacts.find((a) => a.type === 'questions');
    if (!questionsArtifact) {
      console.error(`[${this.phaseName}Coordinator] No questions artifact found`);
      return;
    }

    const questions = (questionsArtifact.content as any).questions || questionsArtifact.content;
    console.log(`[${this.phaseName}Coordinator] Generated ${questions.length} questions`);

    // Step 3: Execute QAA (answer questions)
    const qaaInput = {
      questions,
      artifacts: phaseResult.artifacts,
      workflowRunId: runId,
      context: {
        phase: this.phaseName,
      },
    };

    const qaaOutput = await answerAgent.execute(qaaInput);

    if (!qaaOutput.success || !qaaOutput.artifacts) {
      console.error(`[${this.phaseName}Coordinator] Answer generation failed`);
      return;
    }

    // Extract answers from QAA output
    const answersArtifact = qaaOutput.artifacts.find((a) => a.type === 'answers');
    if (!answersArtifact) {
      console.error(`[${this.phaseName}Coordinator] No answers artifact found`);
      return;
    }

    const answers = (answersArtifact.content as any).answers || answersArtifact.content;
    console.log(`[${this.phaseName}Coordinator] Generated ${answers.length} answers`);

    // Step 4: Pair questions with answers
    const pairs = questions.map((q: any, idx: number) => ({
      question_id: q.id,
      question: q,
      answer_id: answers[idx]?.answer_id || `A-${this.phaseName}-${idx + 1}`,
      answer: answers[idx],
    }));

    // Step 5: VALIDATE - Run QV validator (serial)
    const validator = this.validatorHub.spawn(this.phaseName, runId);

    const qvInput = {
      pairs,
      workflowRunId: runId,
      context: {
        phase: this.phaseName,
        dbPool: this.dbPool, // ✅ Pass dbPool for contradiction detection
      },
    };

    const qvOutput = await validator.execute(qvInput);

    if (!qvOutput.success || !qvOutput.artifacts) {
      console.error(`[${this.phaseName}Coordinator] Validation failed`);
      return;
    }

    // Extract bindings from QV output
    const bindingsArtifact = qvOutput.artifacts.find((a) => a.type === 'bindings');
    if (!bindingsArtifact) {
      console.error(`[${this.phaseName}Coordinator] No bindings artifact found`);
      return;
    }

    const bindings = (bindingsArtifact.content as any).bindings || bindingsArtifact.content;

    // Count accepted/rejected
    const acceptedCount = bindings.filter((b: any) => b.decision === 'accept').length;
    const rejectedCount = bindings.length - acceptedCount;

    console.log(
      `[${this.phaseName}Coordinator] Validation complete: ${acceptedCount} accepted, ${rejectedCount} rejected`
    );

    // Step 6: REFINERY - Post-process Q/A/V through 12-stage pipeline (if enabled)
    let refinedQuestions = questions;
    let refinedAnswers = answers;
    let refineryMetrics = null;

    if (this.enableRefinery && this.dbPool) {
      console.log(`[${this.phaseName}Coordinator] Running Refinery pipeline...`);

      const refineryClient = new RefineryClient({
        dbPool: this.dbPool,
        phase: this.phaseName,
        runId,
      });

      try {
        const refineryResult = await refineryClient.refine({
          questions: questions.map((q: any) => ({ id: q.id, text: q.text })),
          answers: answers.map((a: any) => ({
            id: a.answer_id || a.id,
            answer: a.answer,
            evidence: a.evidence_ids || [],
            confidence: a.confidence || 0.7,
          })),
        });

        if (refineryResult.success) {
          console.log(`[${this.phaseName}Coordinator] Refinery passed gate: fission=${refineryResult.metrics.fissionCoverage.toFixed(2)}, fusion=${refineryResult.metrics.fusionConsensus.toFixed(2)}`);

          // Adapt refined outputs to KM format
          refinedQuestions = RefineryAdapter.adaptQuestions(
            refineryResult.refined.questions,
            questions
          );

          // Create question mapping from clusters (needed for canonical answers)
          const questionMapping = new Map<string, string>();
          answers.forEach((a: any, idx: number) => {
            const questionId = questions[idx]?.id;
            if (questionId) {
              questionMapping.set(`CANONICAL-CLUSTER-${idx}`, questionId);
            }
          });

          refinedAnswers = RefineryAdapter.adaptAnswers(
            refineryResult.refined.answers,
            answers,
            questionMapping
          );

          refineryMetrics = refineryResult.metrics;
        } else {
          console.warn(`[${this.phaseName}Coordinator] Refinery gate failed, using original Q/A:`, refineryResult.gate.failures);
          // Fall back to original Q/A if Refinery fails
        }
      } catch (error) {
        console.error(`[${this.phaseName}Coordinator] Refinery failed, using original Q/A:`, error);
        // Fall back to original Q/A on error
      }
    }

    // Step 7: PERSIST - Insert into Knowledge Map
    await this.persistToKnowledgeMap(runId, refinedQuestions, refinedAnswers, bindings);

    // Step 8: UPDATE QUESTION STATUSES - Mark questions as resolved/partial/open
    if (this.carryOverManager) {
      try {
        const statusCounts = await this.carryOverManager.updatePhaseQuestionStatuses(
          this.phaseName,
          runId
        );

        console.log(
          `[${this.phaseName}Coordinator] Updated question statuses:`,
          statusCounts
        );

        // Mark carry-over questions that were addressed in this phase
        for (const carryOver of carryOverQuestions) {
          // Check if this carry-over question got answered in this phase
          const wasAnswered = refinedAnswers.some((a: any) => a.question_id === carryOver.id);

          if (wasAnswered) {
            await this.carryOverManager.markAsCarriedOver(
              carryOver.id,
              carryOver.originPhase,
              this.phaseName
            );
          }
        }
      } catch (error) {
        console.warn(`[${this.phaseName}Coordinator] Failed to update question statuses:`, error);
      }
    }

    const duration = Date.now() - startTime;

    // Record KM generation metrics
    const metadata: any = {
      questions_generated: questions.length,
      answers_generated: answers.length,
      bindings_accepted: acceptedCount,
      bindings_rejected: rejectedCount,
    };

    // Add Refinery metrics if pipeline ran
    if (refineryMetrics) {
      metadata.refinery = {
        fission_coverage: refineryMetrics.fissionCoverage,
        fusion_consensus: refineryMetrics.fusionConsensus,
        total_cost_usd: refineryMetrics.totalCostUsd,
        atomic_questions: refineryMetrics.stageResults.fission?.atomsGenerated || 0,
        canonical_answers: refineryMetrics.stageResults.fusion?.canonicalAnswers || 0,
      };
    }

    await this.recorder.recordStep({
      runId,
      phase: this.phaseName,
      step: 'knowledge_map.generation',
      actor: `Coordinator:${this.phaseName}`,
      cost: {
        usd: (qaqOutput.cost?.usd || 0) + (qaaOutput.cost?.usd || 0) + (qvOutput.cost?.usd || 0) + (refineryMetrics?.totalCostUsd || 0),
        tokens: (qaqOutput.cost?.tokens || 0) + (qaaOutput.cost?.tokens || 0) + (qvOutput.cost?.tokens || 0),
      },
      latency_ms: duration,
      status: 'succeeded',
      metadata,
    });

    console.log(`[${this.phaseName}Coordinator] Knowledge Map generation completed in ${duration}ms`);
  }

  /**
   * Persist questions, answers, and bindings to Knowledge Map database
   */
  protected async persistToKnowledgeMap(
    runId: string,
    questions: any[],
    answers: any[],
    bindings: any[]
  ): Promise<void> {
    if (!this.kmClient) {
      console.warn(`[${this.phaseName}Coordinator] KM Client not initialized, skipping persistence`);
      return;
    }

    console.log(
      `[${this.phaseName}Coordinator] Persisting to Knowledge Map: ${questions.length} questions, ${answers.length} answers, ${bindings.length} bindings`
    );

    try {
      // Step 1: Insert questions
      const kmQuestions: KMQuestion[] = questions.map((q: any) => ({
        id: q.id,
        phase: this.phaseName,
        run_id: runId,
        text: q.text,
        tags: q.tags || [],
        priority: q.priority || 0.5,
        depends_on: q.depends_on || [],
        status: 'open',
        generated_by: `QAQ-${this.phaseName}`,
      }));

      await this.kmClient.insertQuestions(kmQuestions);
      console.log(`[${this.phaseName}Coordinator] Inserted ${kmQuestions.length} questions`);

      // Step 2: Insert answers
      const kmAnswers: KMAnswer[] = answers.map((a: any) => ({
        id: a.answer_id || a.id,
        question_id: a.question_id,
        answer: a.answer,
        evidence_ids: a.evidence_ids || [],
        assumptions: a.assumptions || [],
        confidence: a.confidence || 0.7,
        generated_by: `QAA-${this.phaseName}`,
      }));

      await this.kmClient.insertAnswers(kmAnswers);
      console.log(`[${this.phaseName}Coordinator] Inserted ${kmAnswers.length} answers`);

      // Step 3: Insert bindings (this will automatically create KM nodes for accepted ones)
      const kmBindings: KMBinding[] = bindings.map((b: any) => ({
        question_id: b.question_id,
        answer_id: b.answer_id,
        score_grounding: b.scores?.grounding || 0,
        score_completeness: b.scores?.completeness || 0,
        score_specificity: b.scores?.specificity || 0,
        score_consistency: b.scores?.consistency || 0,
        decision: b.decision,
        reasons: b.reasons || [],
        hints: b.hints || [],
        validated_by: `QV-${this.phaseName}`,
      }));

      const acceptedCount = await this.kmClient.insertBindings(kmBindings);
      console.log(
        `[${this.phaseName}Coordinator] Inserted ${kmBindings.length} bindings (${acceptedCount} accepted, created ${acceptedCount} KM nodes)`
      );
    } catch (error) {
      console.error(`[${this.phaseName}Coordinator] Failed to persist to Knowledge Map:`, error);
      throw error;
    }
  }

  /**
   * Query Knowledge Map coverage metrics for gate evaluation
   * Returns metrics that can be added to gate input:
   * - km_coverage_ratio: % of priority themes with accepted answers (0-1)
   * - km_high_priority_open: Count of high-priority unanswered questions
   * - km_acceptance_rate: % of Q/A pairs that passed validation (0-1)
   * - km_critical_conflicts: Count of unresolved conflicts
   */
  protected async queryKnowledgeMapCoverage(runId: string): Promise<Record<string, number>> {
    if (!this.kmClient) {
      console.warn(`[${this.phaseName}Coordinator] KM Client not initialized, returning default metrics`);
      return {
        km_coverage_ratio: 0.0,
        km_high_priority_open: 0,
        km_acceptance_rate: 0.0,
        km_critical_conflicts: 0,
      };
    }

    console.log(`[${this.phaseName}Coordinator] Querying Knowledge Map coverage...`);

    try {
      const metrics = await this.kmClient.queryCoverageMetrics(this.phaseName, runId);

      return {
        km_coverage_ratio: metrics.coverage_ratio,
        km_high_priority_open: metrics.high_priority_open,
        km_acceptance_rate: metrics.acceptance_rate,
        km_critical_conflicts: metrics.critical_conflicts,
      };
    } catch (error) {
      console.error(`[${this.phaseName}Coordinator] Failed to query KM coverage:`, error);
      // Return default metrics on error
      return {
        km_coverage_ratio: 0.0,
        km_high_priority_open: 0,
        km_acceptance_rate: 0.0,
        km_critical_conflicts: 0,
      };
    }
  }

  /**
   * Add Knowledge Map metrics to gate input
   * Called by prepareGateInput() in subclasses
   */
  protected async enrichGateInputWithKMMetrics(
    gateMetrics: Record<string, number | boolean>
  ): Promise<Record<string, number | boolean>> {
    if (!this.enableKnowledgeMap) {
      return gateMetrics;
    }

    try {
      const kmMetrics = await this.queryKnowledgeMapCoverage(gateMetrics.runId as string);

      console.log(
        `[${this.phaseName}Coordinator] KM Coverage: ${(kmMetrics.km_coverage_ratio * 100).toFixed(1)}%, ` +
        `Acceptance: ${(kmMetrics.km_acceptance_rate * 100).toFixed(1)}%, ` +
        `High-priority open: ${kmMetrics.km_high_priority_open}`
      );

      return {
        ...gateMetrics,
        ...kmMetrics,
      };
    } catch (error) {
      console.error(`[${this.phaseName}Coordinator] Failed to query KM coverage:`, error);
      // Return original metrics if KM query fails
      return gateMetrics;
    }
  }

  /**
   * Autonomous Q/A/V Clarification Loop (Autonomy Layer)
   *
   * Enables 20-50 hour autonomous runs with NO user prompts by:
   * 1. Generating clarification questions (QAQ)
   * 2. Answering autonomously using artifacts + tools (QAA)
   * 3. Validating Q/A bindings (QV)
   * 4. Retrying rejected questions (max 3 iterations)
   * 5. Registering UNKNOWN answers as ASSUMPTIONS
   *
   * Spec References:
   * - orchestrator.txt:24-25, 61-63 (never the user)
   * - UNIFIED_IMPLEMENTATION_SPEC.md Section 2.3
   *
   * @param draft - Aggregated artifacts from fan-in
   * @param ctx - Phase context with rubrics and allowlisted tools
   * @param maxIterations - Maximum retry attempts (default: 3)
   */
  protected async runQAVLoop(
    draft: any,
    ctx: any,
    maxIterations: number = 3
  ): Promise<{
    questions: Question[];
    answers: Answer[];
    validations: ValidationResult[];
  }> {
    const startTime = Date.now();
    console.log(
      `[${this.phaseName}Coordinator] Starting autonomous Q/A/V clarification loop (max ${maxIterations} iterations)...`
    );

    if (!this.questionAgent || !this.answerAgent || !this.questionValidator) {
      console.warn('[${this.phaseName}Coordinator] Q/A/V agents not initialized, skipping clarification');
      return { questions: [], answers: [], validations: [] };
    }

    let iteration = 0;
    let allAccepted = false;

    let questions: Question[] = [];
    let answers: Answer[] = [];
    let validations: ValidationResult[] = [];

    while (!allAccepted && iteration < maxIterations) {
      console.log(`[${this.phaseName}Coordinator] Q/A/V iteration ${iteration + 1}/${maxIterations}`);

      try {
        // Step 1: QuestionAgent generates questions for gaps/ambiguities
        questions = await this.questionAgent.execute({
          phase: this.phaseName,
          artifacts: draft.artifacts || [],
          context: ctx.inputs || {},
          rubrics: ctx.rubrics || {},
          prior_questions: iteration > 0 ? questions : [], // Include prior questions for deduplication
        });

        // Early exit: No questions → artifacts are complete
        if (questions.length === 0) {
          console.log(
            `[${this.phaseName}Coordinator] No questions generated → artifacts complete`
          );
          allAccepted = true;
          break;
        }

        console.log(
          `[${this.phaseName}Coordinator] Generated ${questions.length} questions (iteration ${iteration + 1})`
        );

        // Step 2: AnswerAgent answers questions using artifacts + tools
        answers = await this.answerAgent.execute({
          questions,
          artifacts: draft.artifacts || [],
          allowlisted_tools: ctx.allowlisted_tools || [],
          phase: this.phaseName,
          context: ctx.inputs || {},
        });

        const unknownCount = answers.filter((a) => a.answer === 'UNKNOWN').length;
        console.log(
          `[${this.phaseName}Coordinator] Generated ${answers.length} answers (${unknownCount} UNKNOWN)`
        );

        // Step 3: QuestionValidator validates Q/A bindings
        const existingKMNodes = await this.loadExistingKMNodes(ctx.runId);

        const validationResults: ValidationResult[] = [];
        for (let i = 0; i < questions.length; i++) {
          const question = questions[i];
          const answer = answers[i];

          const validation = await this.questionValidator.validateBinding(
            question,
            answer,
            existingKMNodes
          );

          validationResults.push(validation);
        }

        validations = validationResults;

        // Step 4: Check if all accepted
        const acceptedCount = validations.filter((v) => v.accepted).length;
        const rejectedCount = validations.length - acceptedCount;

        console.log(
          `[${this.phaseName}Coordinator] Validation: ${acceptedCount} accepted, ${rejectedCount} rejected`
        );

        if (rejectedCount === 0) {
          allAccepted = true;
          console.log(`[${this.phaseName}Coordinator] All Q/A pairs accepted → exiting loop`);
        } else {
          // Prepare for retry: Filter rejected questions
          const rejectedQuestions = validations
            .filter((v) => !v.accepted)
            .map((v) => questions.find((q) => q.id === v.question_id)!)
            .filter((q) => q !== undefined);

          console.log(
            `[${this.phaseName}Coordinator] ${rejectedQuestions.length} questions will be retried with stricter prompts`
          );

          // For next iteration: retry rejected questions
          questions = rejectedQuestions;
          iteration++;
        }
      } catch (error) {
        console.error(
          `[${this.phaseName}Coordinator] Q/A/V iteration ${iteration + 1} failed:`,
          error
        );
        // Break loop on error (don't block phase execution)
        break;
      }
    }

    const durationMs = Date.now() - startTime;

    // Log final metrics
    const acceptedFinal = validations.filter((v) => v.accepted).length;
    const unknownFinal = answers.filter((a) => a.answer === 'UNKNOWN').length;

    console.log(
      `[${this.phaseName}Coordinator] Q/A/V loop complete in ${durationMs}ms: ` +
      `${questions.length} questions, ${acceptedFinal} accepted, ${unknownFinal} UNKNOWN (will become assumptions)`
    );

    // Record Q/A/V metrics
    await this.recorder.recordStep({
      runId: ctx.runId,
      phase: this.phaseName,
      step: 'qav.clarification',
      actor: `Coordinator:${this.phaseName}`,
      cost: { usd: 0, tokens: 0 }, // TODO: Track actual costs
      latency_ms: durationMs,
      status: 'succeeded',
      metadata: {
        iterations: iteration + 1,
        questions_generated: questions.length,
        answers_accepted: acceptedFinal,
        answers_unknown: unknownFinal,
        all_accepted: allAccepted,
      },
    });

    // Process Q/A/V bundle through Refinery Adapter
    if (this.refineryAdapter) {
      try {
        const refineryResult = await this.refineryAdapter.processQAVBundle({
          questions,
          answers,
          validations,
          phase: this.phaseName,
          run_id: ctx.runId,
        });

        console.log(
          `[${this.phaseName}Coordinator] Refinery processed Q/A/V: ` +
          `${refineryResult.metrics.frames_created} frames, ` +
          `${refineryResult.metrics.assumptions_created} assumptions`
        );
      } catch (error) {
        console.error(
          `[${this.phaseName}Coordinator] Refinery processing failed:`,
          error
        );
        // Don't throw - continue even if Refinery fails
      }
    }

    return { questions, answers, validations };
  }

  /**
   * Load existing KM nodes for consistency checking
   */
  private async loadExistingKMNodes(runId: string): Promise<any[]> {
    if (!this.kmClient) {
      return [];
    }

    try {
      return await this.kmClient.getExistingNodes(this.phaseName, runId, 100);
    } catch (error) {
      console.error(
        `[${this.phaseName}Coordinator] Failed to load existing KM nodes:`,
        error
      );
      return [];
    }
  }
}
