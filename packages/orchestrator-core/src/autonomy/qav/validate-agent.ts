import pino from 'pino';
import Anthropic from '@anthropic-ai/sdk';
import { Question } from './question-agent';
import { Answer } from './answer-agent';

const logger = pino({ name: 'validate-agent' });

/**
 * Validated binding
 */
export interface ValidatedBinding {
  key: string;
  value: any;
  confidence: number;
  grounding_score: number;
  evidence: string[];
  assumptions: string[];
  source_question?: string;
  source_answer?: string;
  validated_at: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  grounding_score: number;
  bindings: ValidatedBinding[];
  conflicts: Array<{
    description: string;
    severity: 'low' | 'medium' | 'high';
    affected_bindings: string[];
  }>;
  summary: {
    questions_count: number;
    answered_count: number;
    validated_count: number;
    avg_confidence: number;
    avg_grounding: number;
  };
}

/**
 * Validate Agent
 *
 * Validates answers against evidence and produces grounded bindings
 * Spec: phase.txt:205-207
 */
export class ValidateAgent {
  private anthropic: Anthropic;

  constructor(
    private apiKey: string,
    private minGroundingScore: number = 0.85,
    private model: string = 'claude-3-5-sonnet-20241022'
  ) {
    this.anthropic = new Anthropic({ apiKey });
  }

  /**
   * Validate answers and produce bindings
   *
   * @param questions - Original questions
   * @param answers - Answers to validate
   * @param context - Current phase context
   * @param artifacts - Existing artifacts for evidence
   * @returns Validation result with bindings
   */
  async validate(
    questions: Question[],
    answers: Answer[],
    context: Record<string, any>,
    artifacts: Array<{ id: string; type: string; content?: any }>
  ): Promise<ValidationResult> {
    logger.info(
      {
        questions_count: questions.length,
        answers_count: answers.length,
      },
      'Starting validation'
    );

    // Create question map for lookup
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    // Validate each answer
    const validatedBindings: ValidatedBinding[] = [];
    const conflicts: ValidationResult['conflicts'] = [];

    for (const answer of answers) {
      const question = questionMap.get(answer.question_id);
      if (!question) {
        logger.warn(
          { answer_id: answer.question_id },
          'Answer has no matching question'
        );
        continue;
      }

      try {
        const binding = await this.validateAnswer(
          question,
          answer,
          context,
          artifacts
        );

        if (binding) {
          validatedBindings.push(binding);
        }
      } catch (error) {
        logger.error(
          { error, question_id: question.id },
          'Validation failed'
        );
      }
    }

    // Check for conflicts
    const detectedConflicts = this.detectConflicts(validatedBindings);
    conflicts.push(...detectedConflicts);

    // Calculate grounding score
    const groundingScore = this.calculateGroundingScore(
      validatedBindings,
      conflicts
    );

    // Build summary
    const summary = {
      questions_count: questions.length,
      answered_count: answers.length,
      validated_count: validatedBindings.length,
      avg_confidence:
        validatedBindings.reduce((sum, b) => sum + b.confidence, 0) /
        Math.max(1, validatedBindings.length),
      avg_grounding:
        validatedBindings.reduce((sum, b) => sum + b.grounding_score, 0) /
        Math.max(1, validatedBindings.length),
    };

    const result: ValidationResult = {
      valid: groundingScore >= this.minGroundingScore && conflicts.length === 0,
      grounding_score: groundingScore,
      bindings: validatedBindings,
      conflicts,
      summary,
    };

    logger.info(
      {
        valid: result.valid,
        grounding_score: groundingScore,
        bindings_count: validatedBindings.length,
        conflicts_count: conflicts.length,
      },
      'Validation complete'
    );

    return result;
  }

  /**
   * Validate a single answer
   */
  private async validateAnswer(
    question: Question,
    answer: Answer,
    context: Record<string, any>,
    artifacts: Array<{ id: string; type: string; content?: any }>
  ): Promise<ValidatedBinding | null> {
    const prompt = `You are a Validate Agent checking if an answer is properly grounded in evidence.

## Question:
${question.text}

## Answer:
${answer.text}

## Answer Source: ${answer.source}
## Answer Confidence: ${answer.confidence}

## Evidence Provided:
${answer.evidence.join('\n')}

## Context:
${JSON.stringify(context, null, 2)}

## Available Artifacts:
${artifacts.map((a) => `- ${a.type} (${a.id})`).join('\n')}

## Your Task:
Validate this answer by:
1. Checking if the evidence supports the answer
2. Verifying consistency with existing context and artifacts
3. Identifying any assumptions being made
4. Assigning a grounding score (0.0 to 1.0)

A well-grounded answer should:
- Be directly supported by evidence
- Not contradict existing information
- Make minimal assumptions
- Be specific and actionable

## Output Format:
{
  "valid": true/false,
  "grounding_score": 0.0 to 1.0,
  "key": "binding_key_name",
  "value": "binding_value",
  "evidence": ["Supporting evidence"],
  "assumptions": ["Any assumptions made"],
  "reasoning": "Why this is or isn't well-grounded"
}

Return ONLY the JSON object, no additional text.`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return null;
      }

      // Parse response
      let jsonText = content.text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonText);

      if (!parsed.valid || parsed.grounding_score < 0.6) {
        logger.warn(
          {
            question_id: question.id,
            grounding_score: parsed.grounding_score,
            reasoning: parsed.reasoning,
          },
          'Answer not well-grounded'
        );
        return null;
      }

      return {
        key: parsed.key,
        value: parsed.value,
        confidence: answer.confidence,
        grounding_score: parsed.grounding_score,
        evidence: parsed.evidence || answer.evidence,
        assumptions: parsed.assumptions || answer.assumptions || [],
        source_question: question.text,
        source_answer: answer.text,
        validated_at: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ error, question_id: question.id }, 'Validation failed');
      return null;
    }
  }

  /**
   * Detect conflicts between bindings
   */
  private detectConflicts(
    bindings: ValidatedBinding[]
  ): ValidationResult['conflicts'] {
    const conflicts: ValidationResult['conflicts'] = [];
    const keyMap = new Map<string, ValidatedBinding[]>();

    // Group by key
    for (const binding of bindings) {
      const existing = keyMap.get(binding.key) || [];
      existing.push(binding);
      keyMap.set(binding.key, existing);
    }

    // Check for conflicts
    for (const [key, bindingsForKey] of keyMap.entries()) {
      if (bindingsForKey.length > 1) {
        // Multiple bindings for same key - check if values match
        const values = new Set(
          bindingsForKey.map((b) => JSON.stringify(b.value))
        );

        if (values.size > 1) {
          conflicts.push({
            description: `Conflicting values for key "${key}"`,
            severity: 'high',
            affected_bindings: bindingsForKey.map((b) => b.key),
          });
        }
      }

      // Check for low confidence bindings
      const lowConfidence = bindingsForKey.filter((b) => b.confidence < 0.7);
      if (lowConfidence.length > 0) {
        conflicts.push({
          description: `Low confidence binding for key "${key}"`,
          severity: 'medium',
          affected_bindings: [key],
        });
      }

      // Check for low grounding
      const lowGrounding = bindingsForKey.filter(
        (b) => b.grounding_score < 0.7
      );
      if (lowGrounding.length > 0) {
        conflicts.push({
          description: `Low grounding score for key "${key}"`,
          severity: 'high',
          affected_bindings: [key],
        });
      }
    }

    return conflicts;
  }

  /**
   * Calculate overall grounding score
   */
  private calculateGroundingScore(
    bindings: ValidatedBinding[],
    conflicts: ValidationResult['conflicts']
  ): number {
    if (bindings.length === 0) {
      return 0;
    }

    // Average grounding score of all bindings
    const avgGrounding =
      bindings.reduce((sum, b) => sum + b.grounding_score, 0) / bindings.length;

    // Penalty for conflicts
    const conflictPenalty = conflicts.reduce((penalty, c) => {
      switch (c.severity) {
        case 'high':
          return penalty + 0.2;
        case 'medium':
          return penalty + 0.1;
        case 'low':
          return penalty + 0.05;
        default:
          return penalty;
      }
    }, 0);

    return Math.max(0, Math.min(1, avgGrounding - conflictPenalty));
  }

  /**
   * Apply bindings to knowledge map
   */
  applyBindings(
    kmap: Record<string, any>,
    bindings: ValidatedBinding[]
  ): Record<string, any> {
    const updated = { ...kmap };

    for (const binding of bindings) {
      // Store binding with metadata
      updated[binding.key] = {
        value: binding.value,
        confidence: binding.confidence,
        grounding_score: binding.grounding_score,
        evidence: binding.evidence,
        assumptions: binding.assumptions,
        validated_at: binding.validated_at,
      };
    }

    return updated;
  }

  /**
   * Get high-confidence bindings only
   */
  getHighConfidenceBindings(
    bindings: ValidatedBinding[],
    minConfidence: number = 0.8
  ): ValidatedBinding[] {
    return bindings.filter((b) => b.confidence >= minConfidence);
  }
}
