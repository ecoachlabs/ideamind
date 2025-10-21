/**
 * Question Agent (QAQ) - Autonomous Clarification Component
 *
 * Analyzes artifacts for gaps/ambiguities and generates decision-changing questions.
 * Part of the Q/A/V Triad that enables 20-50 hour autonomous runs with NO user prompts.
 *
 * Spec References:
 * - orchestrator.txt:24-25 (mid-run clarifications use Q/A/V, never user)
 * - orchestrator.txt:172-175 (QAQ generates questions)
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
  QuestionGenerationInput,
  Gap,
  QuestionPriority,
  QuestionCategory,
  DecisionImpact,
} from './types';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';

/**
 * QuestionAgent - Generates high-quality clarification questions
 *
 * Algorithm:
 * 1. Analyze artifacts against rubrics to identify gaps
 * 2. Generate questions targeting each gap
 * 3. Prioritize questions by decision impact
 * 4. Filter out low-value questions
 * 5. Return ranked Question[] array
 */
export class QuestionAgent extends BaseAgent {
  private anthropic: Anthropic;

  constructor(config?: any) {
    super({
      agentId: 'question-agent-qaq',
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
  }

  /**
   * Main execution: Generate questions from artifacts
   */
  async execute(input: QuestionGenerationInput): Promise<Question[]> {
    const startTime = Date.now();
    console.log(`[QAQ] Starting question generation for phase ${input.phase}`);

    try {
      // Step 1: Analyze gaps in artifacts
      const gaps = await this.analyzeGaps(input.artifacts, input.rubrics, input.context);
      console.log(`[QAQ] Identified ${gaps.length} gaps`);

      // Step 2: Generate questions for each gap
      const questions: Question[] = [];
      for (const gap of gaps) {
        const question = await this.generateQuestionForGap(gap, input.phase, input.context);
        if (question) {
          questions.push(question);
        }
      }

      // Step 3: Deduplicate similar questions
      const deduplicatedQuestions = this.deduplicateQuestions(questions, input.prior_questions);

      // Step 4: Sort by priority (high → medium → low)
      const priorityOrder: Record<QuestionPriority, number> = {
        high: 0,
        medium: 1,
        low: 2,
      };
      deduplicatedQuestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      const durationMs = Date.now() - startTime;
      console.log(
        `[QAQ] Generated ${deduplicatedQuestions.length} questions in ${durationMs}ms`
      );

      return deduplicatedQuestions;
    } catch (error) {
      console.error('[QAQ] Question generation failed:', error);
      throw error;
    }
  }

  /**
   * PLANNER: Create execution plan
   */
  protected async plan(input: AgentInput): Promise<ExecutionPlan> {
    return {
      steps: [
        { id: 'analyze_gaps', description: 'Analyze artifacts for gaps' },
        { id: 'generate_questions', description: 'Generate questions for gaps' },
        { id: 'prioritize', description: 'Prioritize questions by impact' },
      ],
      estimatedDurationMs: 30000, // 30s
      estimatedCostUsd: 0.05,
    };
  }

  /**
   * REASONING: Initial reasoning without tools
   */
  protected async reason(plan: ExecutionPlan, input: AgentInput): Promise<ReasoningResult> {
    // Question generation happens in execute() method
    return {
      content: 'Question generation complete',
      confidence: 0.9,
      needsImprovement: false,
    };
  }

  /**
   * Generate artifacts (questions array)
   */
  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<Array<{ type: string; content: unknown }>> {
    return [
      {
        type: 'questions',
        content: { questions: [] }, // Populated in execute()
      },
    ];
  }

  /**
   * Analyze artifacts for gaps using rubrics
   */
  private async analyzeGaps(
    artifacts: any[],
    rubrics: Record<string, any>,
    context: Record<string, any>
  ): Promise<Gap[]> {
    const gaps: Gap[] = [];

    try {
      // Prepare artifacts summary for LLM
      const artifactsSummary = artifacts
        .map((a, idx) => {
          return `Artifact ${idx + 1} (${a.type || 'unknown'}):\n${this.summarizeArtifact(a)}`;
        })
        .join('\n\n');

      // Prepare rubrics summary
      const rubricsSummary = Object.entries(rubrics)
        .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
        .join('\n');

      // LLM prompt for gap analysis
      const prompt = `You are analyzing artifacts from a software development phase to identify gaps, ambiguities, and missing information.

ARTIFACTS:
${artifactsSummary}

RUBRICS (quality criteria):
${rubricsSummary}

CONTEXT:
${JSON.stringify(context, null, 2)}

Analyze the artifacts and identify gaps in the following categories:
1. MISSING_DATA: Critical information that's completely absent
2. AMBIGUITY: Unclear or vague statements that need clarification
3. CONTRADICTION: Conflicting information across artifacts
4. ASSUMPTION: Implicit assumptions that should be validated
5. RISK: Potential risks or edge cases not addressed

For each gap, provide:
- type: One of the categories above
- severity: high | medium | low
- description: Clear description of the gap
- artifact_ids: Which artifacts are affected (use indices if IDs not available)
- suggested_question: A specific question to address this gap
- priority: 0.0-1.0 score for ranking

Return a JSON array of gaps. Focus on gaps that would change architectural or implementation decisions.
Limit to the 10 most critical gaps.`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        temperature: 0.7,
        system: 'You are an expert software architect analyzing requirements for gaps.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        // Parse JSON response
        const jsonMatch = content.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const gapsData = JSON.parse(jsonMatch[0]);
          gaps.push(...gapsData);
        }
      }
    } catch (error) {
      console.error('[QAQ] Gap analysis failed:', error);
      // Return empty gaps on error - don't block execution
    }

    return gaps;
  }

  /**
   * Generate a question for a specific gap
   */
  private async generateQuestionForGap(
    gap: Gap,
    phase: string,
    context: Record<string, any>
  ): Promise<Question | null> {
    try {
      // Map gap type to question category
      const categoryMap: Record<string, QuestionCategory> = {
        missing_data: 'completeness',
        ambiguity: 'clarification',
        contradiction: 'consistency',
        assumption: 'assumption',
        risk: 'risk',
      };

      const category = categoryMap[gap.type] || 'clarification';

      // Map severity to priority
      const priorityMap: Record<string, QuestionPriority> = {
        high: 'high',
        medium: 'medium',
        low: 'low',
      };

      const priority = priorityMap[gap.severity] || 'medium';

      // Determine decision impact based on priority and gap type
      const decisionImpact: DecisionImpact =
        priority === 'high' && (gap.type === 'contradiction' || gap.type === 'assumption')
          ? 'high'
          : priority === 'high'
          ? 'medium'
          : 'low';

      // Generate unique question ID
      const questionId = `Q-${phase}-${crypto.randomBytes(8).toString('hex')}`;

      const question: Question = {
        id: questionId,
        text: gap.suggested_question,
        category,
        priority,
        decision_impact: decisionImpact,
        context: {
          phase,
          artifact_ids: gap.artifact_ids,
          gap_type: gap.type,
        },
        tags: [gap.type, phase.toLowerCase()],
      };

      return question;
    } catch (error) {
      console.error('[QAQ] Question generation for gap failed:', error);
      return null;
    }
  }

  /**
   * Summarize artifact for LLM analysis
   */
  private summarizeArtifact(artifact: any): string {
    if (typeof artifact === 'string') {
      return artifact.substring(0, 500); // First 500 chars
    }

    if (artifact.content) {
      const content =
        typeof artifact.content === 'string'
          ? artifact.content
          : JSON.stringify(artifact.content);
      return content.substring(0, 500);
    }

    return JSON.stringify(artifact).substring(0, 500);
  }

  /**
   * Deduplicate questions (remove similar questions from prior iterations)
   */
  private deduplicateQuestions(
    newQuestions: Question[],
    priorQuestions?: Question[]
  ): Question[] {
    if (!priorQuestions || priorQuestions.length === 0) {
      return newQuestions;
    }

    // Simple deduplication: remove questions with very similar text
    const deduplicated: Question[] = [];

    for (const newQ of newQuestions) {
      const isDuplicate = priorQuestions.some(
        (priorQ) => this.calculateSimilarity(newQ.text, priorQ.text) > 0.85
      );

      if (!isDuplicate) {
        deduplicated.push(newQ);
      } else {
        console.log(`[QAQ] Skipping duplicate question: ${newQ.text.substring(0, 50)}...`);
      }
    }

    return deduplicated;
  }

  /**
   * Calculate text similarity (simple Jaccard similarity on words)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}
