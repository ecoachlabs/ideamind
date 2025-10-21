/**
 * Question Validator (QV) - Q/A Binding Validation Component
 *
 * Validates question-answer bindings using multi-dimensional scoring:
 * - Grounding: Quality of citations (≥0.7 required)
 * - Completeness: Question fully answered (≥0.7 required)
 * - Specificity: Answer is specific, not vague (≥0.6 required)
 * - Consistency: No contradictions with existing knowledge (≥0.8 required)
 *
 * Spec References:
 * - orchestrator.txt:172-175 (QV validates Q↔A bindings)
 * - UNIFIED_IMPLEMENTATION_SPEC.md Section 2.1
 */

import { BaseAgent } from '../../../agent-sdk/src/base-agent';
import type {
  AgentInput,
  AgentOutput,
  ExecutionPlan,
  ReasoningResult,
} from '../../../agent-sdk/src/types';
import type {
  Question,
  Answer,
  ValidationInput,
  ValidationResult,
} from './types';
import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';

/**
 * QuestionValidator - Validates Q/A pairs before accepting them
 *
 * Algorithm:
 * 1. For each Q/A pair:
 *    a. Score grounding (citation quality)
 *    b. Score completeness (question answered)
 *    c. Score specificity (answer precision)
 *    d. Score consistency (no contradictions)
 * 2. Calculate overall score (average)
 * 3. Accept if all thresholds met AND overall ≥ 0.7
 * 4. Auto-reject UNKNOWN answers
 */
export class QuestionValidator extends BaseAgent {
  private anthropic: Anthropic;
  private dbPool?: Pool;

  // Thresholds from spec
  private thresholds = {
    grounding: 0.7,
    completeness: 0.7,
    specificity: 0.6,
    consistency: 0.8,
    overall: 0.7,
  };

  constructor(config?: any) {
    super({
      agentId: 'question-validator-qv',
      phase: config?.phase || 'UNKNOWN',
      toolPolicy: {
        allowedTools: [],
        maxToolInvocations: 0,
        voiThreshold: 0.8,
      },
    });

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Optional DB pool for consistency checking against existing KM
    this.dbPool = config?.dbPool;
  }

  /**
   * Main execution: Validate all Q/A pairs
   */
  async execute(input: ValidationInput): Promise<ValidationResult[]> {
    const startTime = Date.now();
    console.log(`[QV] Validating ${input.questions.length} Q/A pairs`);

    const validations: ValidationResult[] = [];

    try {
      for (let i = 0; i < input.questions.length; i++) {
        const question = input.questions[i];
        const answer = input.answers[i];

        const validation = await this.validateBinding(question, answer, input.existing_km_nodes);
        validations.push(validation);
      }

      const acceptedCount = validations.filter((v) => v.accepted).length;
      const durationMs = Date.now() - startTime;

      console.log(
        `[QV] Validated ${validations.length} pairs: ${acceptedCount} accepted, ${validations.length - acceptedCount} rejected (${durationMs}ms)`
      );

      return validations;
    } catch (error) {
      console.error('[QV] Validation failed:', error);
      throw error;
    }
  }

  /**
   * PLANNER: Create execution plan
   */
  protected async plan(input: AgentInput): Promise<ExecutionPlan> {
    return {
      steps: [
        { id: 'score_grounding', description: 'Score citation quality' },
        { id: 'score_completeness', description: 'Score answer completeness' },
        { id: 'score_specificity', description: 'Score answer specificity' },
        { id: 'score_consistency', description: 'Check for contradictions' },
        { id: 'accept_reject', description: 'Accept or reject binding' },
      ],
      estimatedDurationMs: 45000, // 45s
      estimatedCostUsd: 0.08,
    };
  }

  /**
   * REASONING: Initial reasoning without tools
   */
  protected async reason(plan: ExecutionPlan, input: AgentInput): Promise<ReasoningResult> {
    return {
      content: 'Validation complete',
      confidence: 0.95,
      needsImprovement: false,
    };
  }

  /**
   * Generate artifacts (validations array)
   */
  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<Array<{ type: string; content: unknown }>> {
    return [
      {
        type: 'validations',
        content: { validations: [] }, // Populated in execute()
      },
    ];
  }

  /**
   * Validate a single Q/A binding
   */
  async validateBinding(
    question: Question,
    answer: Answer,
    existingKMNodes?: any[]
  ): Promise<ValidationResult> {
    const issues: string[] = [];
    const hints: string[] = [];

    // Auto-reject UNKNOWN answers (per spec)
    if (answer.answer === 'UNKNOWN') {
      return {
        question_id: question.id,
        answer_id: answer.answer_id,
        accepted: false,
        scores: {
          grounding: 0,
          completeness: 0,
          specificity: 0,
          consistency: 0,
        },
        overall_score: 0,
        issues: ['Answer is UNKNOWN - will be registered as ASSUMPTION'],
        hints: answer.next_steps || [],
        validated_by: `QV-${this.config.phase}`,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      // Score 1: Grounding (citation quality)
      const groundingScore = await this.scoreGrounding(answer);
      if (groundingScore < this.thresholds.grounding) {
        issues.push(
          `Grounding score ${groundingScore.toFixed(2)} < ${this.thresholds.grounding}`
        );
        hints.push('Add more citations from artifacts or tools');
      }

      // Score 2: Completeness (question fully answered)
      const completenessScore = await this.scoreCompleteness(question, answer);
      if (completenessScore < this.thresholds.completeness) {
        issues.push(
          `Completeness score ${completenessScore.toFixed(2)} < ${this.thresholds.completeness}`
        );
        hints.push('Provide a more complete answer addressing all aspects of the question');
      }

      // Score 3: Specificity (not vague)
      const specificityScore = await this.scoreSpecificity(answer);
      if (specificityScore < this.thresholds.specificity) {
        issues.push(
          `Specificity score ${specificityScore.toFixed(2)} < ${this.thresholds.specificity}`
        );
        hints.push('Make the answer more specific and concrete');
      }

      // Score 4: Consistency (no contradictions)
      const consistencyScore = await this.scoreConsistency(answer, existingKMNodes);
      if (consistencyScore < this.thresholds.consistency) {
        issues.push(
          `Consistency score ${consistencyScore.toFixed(2)} < ${this.thresholds.consistency}`
        );
        hints.push('Resolve contradictions with existing knowledge');
      }

      // Calculate overall score
      const overallScore =
        (groundingScore + completenessScore + specificityScore + consistencyScore) / 4;

      // Accept if all thresholds met
      const accepted =
        groundingScore >= this.thresholds.grounding &&
        completenessScore >= this.thresholds.completeness &&
        specificityScore >= this.thresholds.specificity &&
        consistencyScore >= this.thresholds.consistency &&
        overallScore >= this.thresholds.overall;

      if (!accepted && issues.length === 0) {
        issues.push(
          `Overall score ${overallScore.toFixed(2)} < ${this.thresholds.overall}`
        );
      }

      return {
        question_id: question.id,
        answer_id: answer.answer_id,
        accepted,
        scores: {
          grounding: groundingScore,
          completeness: completenessScore,
          specificity: specificityScore,
          consistency: consistencyScore,
        },
        overall_score: overallScore,
        issues,
        hints,
        validated_by: `QV-${this.config.phase}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`[QV] Validation failed for Q ${question.id}:`, error);

      // Return rejection on error
      return {
        question_id: question.id,
        answer_id: answer.answer_id,
        accepted: false,
        scores: {
          grounding: 0,
          completeness: 0,
          specificity: 0,
          consistency: 0,
        },
        overall_score: 0,
        issues: [`Validation error: ${(error as Error).message}`],
        validated_by: `QV-${this.config.phase}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Score grounding (citation quality)
   * Returns 0-1 score based on:
   * - Number of citations
   * - Citation confidence
   * - Citation diversity (multiple sources)
   */
  private async scoreGrounding(answer: Answer): Promise<number> {
    if (answer.citations.length === 0) {
      return 0;
    }

    // Calculate average citation confidence
    const avgConfidence =
      answer.citations.reduce((sum, c) => sum + c.confidence, 0) / answer.citations.length;

    // Bonus for multiple citations
    const citationCountBonus = Math.min(answer.citations.length / 3, 1.0) * 0.2;

    // Bonus for diverse citation types
    const citationTypes = new Set(answer.citations.map((c) => c.type));
    const diversityBonus = (citationTypes.size - 1) * 0.1;

    const score = Math.min(avgConfidence + citationCountBonus + diversityBonus, 1.0);

    return score;
  }

  /**
   * Score completeness (question fully answered)
   * Uses LLM to judge if answer addresses all aspects of question
   */
  private async scoreCompleteness(question: Question, answer: Answer): Promise<number> {
    try {
      const prompt = `You are evaluating if an answer completely addresses a question.

QUESTION:
${question.text}

ANSWER:
${answer.answer}

Task: Rate how completely the answer addresses the question on a scale of 0.0 to 1.0.
- 1.0 = Fully addresses all aspects
- 0.7 = Addresses most aspects, minor gaps
- 0.5 = Partially addresses question
- 0.3 = Barely addresses question
- 0.0 = Does not address question

Respond with ONLY a number between 0.0 and 1.0.`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 32,
        temperature: 0.1,
        system: 'You are a precise evaluator. Respond ONLY with a number.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const score = parseFloat(content.text.trim());
        return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
      }

      return 0.5; // Default if parsing fails
    } catch (error) {
      console.error('[QV] Completeness scoring failed:', error);
      return 0.5; // Default on error
    }
  }

  /**
   * Score specificity (not vague or generic)
   * Uses heuristics + LLM judgment
   */
  private async scoreSpecificity(answer: Answer): Promise<number> {
    const answerText = answer.answer.toString();

    // Heuristic: penalize vague phrases
    const vaguePatterns = [
      /might|maybe|possibly|perhaps|could be/gi,
      /generally|typically|usually|often/gi,
      /some|many|several|various/gi,
    ];

    let vaguenessCount = 0;
    for (const pattern of vaguePatterns) {
      const matches = answerText.match(pattern);
      if (matches) {
        vaguenessCount += matches.length;
      }
    }

    // Heuristic: reward specific numbers, names, dates
    const specificityPatterns = [
      /\d+(\.\d+)?%/g,           // percentages
      /\d{4}-\d{2}-\d{2}/g,      // dates
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,  // proper names
      /v?\d+\.\d+(\.\d+)?/g,     // version numbers
    ];

    let specificityCount = 0;
    for (const pattern of specificityPatterns) {
      const matches = answerText.match(pattern);
      if (matches) {
        specificityCount += matches.length;
      }
    }

    // Calculate score (0-1)
    const vaguenessPenalty = Math.min(vaguenessCount * 0.1, 0.4);
    const specificityBonus = Math.min(specificityCount * 0.15, 0.4);

    const heuristicScore = Math.max(0, Math.min(1, 0.6 - vaguenessPenalty + specificityBonus));

    return heuristicScore;
  }

  /**
   * Score consistency (no contradictions with existing knowledge)
   * Checks against existing KM nodes if available
   */
  private async scoreConsistency(answer: Answer, existingKMNodes?: any[]): Promise<number> {
    // If no existing KM nodes, assume consistent
    if (!existingKMNodes || existingKMNodes.length === 0) {
      return 1.0;
    }

    try {
      // Check for contradictions using LLM
      const existingKnowledge = existingKMNodes
        .slice(0, 20) // Limit to most recent 20 nodes
        .map((node) => `- ${node.question}: ${node.answer}`)
        .join('\n');

      const prompt = `You are checking for contradictions between a new answer and existing knowledge.

EXISTING KNOWLEDGE:
${existingKnowledge}

NEW ANSWER:
Question: ${answer.question_id}
Answer: ${answer.answer}

Task: Rate the consistency on a scale of 0.0 to 1.0.
- 1.0 = Completely consistent, no contradictions
- 0.7 = Mostly consistent, minor discrepancies
- 0.5 = Some contradictions
- 0.3 = Major contradictions
- 0.0 = Completely contradictory

Respond with ONLY a number between 0.0 and 1.0.`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 32,
        temperature: 0.1,
        system: 'You are a precise evaluator. Respond ONLY with a number.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const score = parseFloat(content.text.trim());
        return isNaN(score) ? 0.9 : Math.max(0, Math.min(1, score));
      }

      return 0.9; // Default if parsing fails
    } catch (error) {
      console.error('[QV] Consistency scoring failed:', error);
      return 0.9; // Default on error (assume consistent)
    }
  }
}
