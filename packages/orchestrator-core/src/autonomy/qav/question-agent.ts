import pino from 'pino';
import Anthropic from '@anthropic-ai/sdk';

const logger = pino({ name: 'question-agent' });

/**
 * Question representation
 */
export interface Question {
  id: string;
  text: string;
  context: string;
  priority: 'high' | 'medium' | 'low';
  category: 'requirements' | 'constraints' | 'assumptions' | 'clarification' | 'validation';
  required: boolean;
  suggested_sources?: string[];
  created_at: string;
}

/**
 * Question Agent
 *
 * Analyzes phase context and generates clarifying questions when information is insufficient
 * Spec: phase.txt:186-195
 */
export class QuestionAgent {
  private anthropic: Anthropic;

  constructor(
    private apiKey: string,
    private model: string = 'claude-3-5-sonnet-20241022'
  ) {
    this.anthropic = new Anthropic({ apiKey });
  }

  /**
   * Generate questions from phase context
   *
   * @param phase - Phase name
   * @param context - Current phase context
   * @param artifacts - Existing artifacts
   * @param maxQuestions - Maximum questions to generate
   * @returns Generated questions
   */
  async generateQuestions(
    phase: string,
    context: Record<string, any>,
    artifacts: Array<{ id: string; type: string; content?: any }>,
    maxQuestions: number = 15
  ): Promise<Question[]> {
    logger.info(
      {
        phase,
        artifacts_count: artifacts.length,
        max_questions: maxQuestions,
      },
      'Generating questions'
    );

    // Build analysis prompt
    const prompt = this.buildPrompt(phase, context, artifacts, maxQuestions);

    try {
      // Call Claude to analyze context and generate questions
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Parse response
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Expected text response from Claude');
      }

      const questions = this.parseQuestions(content.text);

      logger.info(
        {
          phase,
          questions_generated: questions.length,
        },
        'Questions generated'
      );

      return questions;
    } catch (error) {
      logger.error({ error, phase }, 'Failed to generate questions');
      throw error;
    }
  }

  /**
   * Build prompt for question generation
   */
  private buildPrompt(
    phase: string,
    context: Record<string, any>,
    artifacts: Array<{ id: string; type: string; content?: any }>,
    maxQuestions: number
  ): string {
    return `You are a Question Agent analyzing the "${phase}" phase of a software development orchestration system.

Your task is to identify gaps, ambiguities, and missing information in the current context that would prevent high-quality execution of this phase.

## Current Context:
${JSON.stringify(context, null, 2)}

## Existing Artifacts:
${artifacts.map((a) => `- ${a.type} (${a.id})`).join('\n')}

## Your Task:
Analyze the context and artifacts, then generate up to ${maxQuestions} clarifying questions that would help improve the quality and completeness of this phase's execution.

For each question, consider:
1. Is this information critical for success?
2. Can we reasonably infer or assume this, or must it be explicitly provided?
3. What are the risks of proceeding without this information?

## Output Format:
Return a JSON array of questions with this structure:
[
  {
    "text": "The question text",
    "context": "Why this question matters",
    "priority": "high|medium|low",
    "category": "requirements|constraints|assumptions|clarification|validation",
    "required": true/false,
    "suggested_sources": ["where to find the answer"]
  }
]

Focus on:
- Missing requirements or acceptance criteria
- Ambiguous or contradictory information
- Implicit assumptions that should be validated
- Technical constraints or limitations
- Dependencies on external systems or data

Generate questions that are:
- Specific and actionable
- Relevant to the "${phase}" phase
- Answerable by a human or knowledge base
- Not already covered by existing context

Return ONLY the JSON array, no additional text.`;
  }

  /**
   * Parse questions from Claude response
   */
  private parseQuestions(response: string): Question[] {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonText = response.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonText);

      // Add IDs and timestamps
      const questions: Question[] = parsed.map((q: any, index: number) => ({
        id: `q-${Date.now()}-${index}`,
        text: q.text,
        context: q.context,
        priority: q.priority || 'medium',
        category: q.category || 'clarification',
        required: q.required !== false,
        suggested_sources: q.suggested_sources || [],
        created_at: new Date().toISOString(),
      }));

      return questions;
    } catch (error) {
      logger.error({ error, response }, 'Failed to parse questions');
      throw new Error('Failed to parse questions from response');
    }
  }

  /**
   * Score questions by priority
   *
   * @param questions - Questions to score
   * @returns Scored questions sorted by priority
   */
  scoreQuestions(questions: Question[]): Question[] {
    const priorityScore = {
      high: 3,
      medium: 2,
      low: 1,
    };

    return questions.sort((a, b) => {
      // First by priority
      const scoreDiff = priorityScore[b.priority] - priorityScore[a.priority];
      if (scoreDiff !== 0) return scoreDiff;

      // Then by required flag
      if (a.required !== b.required) {
        return a.required ? -1 : 1;
      }

      // Finally by creation time (newer first)
      return b.created_at.localeCompare(a.created_at);
    });
  }

  /**
   * Filter questions by category
   */
  filterByCategory(
    questions: Question[],
    categories: Question['category'][]
  ): Question[] {
    return questions.filter((q) => categories.includes(q.category));
  }

  /**
   * Get required questions only
   */
  getRequiredQuestions(questions: Question[]): Question[] {
    return questions.filter((q) => q.required);
  }
}
