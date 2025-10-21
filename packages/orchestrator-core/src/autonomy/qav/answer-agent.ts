import pino from 'pino';
import Anthropic from '@anthropic-ai/sdk';
import { Question } from './question-agent';

const logger = pino({ name: 'answer-agent' });

/**
 * Answer representation
 */
export interface Answer {
  question_id: string;
  text: string;
  source: 'human' | 'knowledge-refinery' | 'inference' | 'default';
  confidence: number; // 0.0 to 1.0
  evidence: string[];
  assumptions?: string[];
  created_at: string;
  metadata?: Record<string, any>;
}

/**
 * Knowledge source interface
 */
export interface KnowledgeSource {
  query(question: string, context: Record<string, any>): Promise<{
    answer: string;
    confidence: number;
    evidence: string[];
  } | null>;
}

/**
 * Answer Agent
 *
 * Provides answers to questions from Knowledge Refinery or other sources
 * Spec: phase.txt:196-204
 */
export class AnswerAgent {
  private anthropic: Anthropic;

  constructor(
    private apiKey: string,
    private knowledgeSource: KnowledgeSource | null = null,
    private model: string = 'claude-3-5-sonnet-20241022'
  ) {
    this.anthropic = new Anthropic({ apiKey });
  }

  /**
   * Answer a question
   *
   * @param question - Question to answer
   * @param context - Current phase context
   * @param kmap - Knowledge map
   * @param allowInference - Allow inferring answers when not found
   * @returns Answer or null if cannot be answered
   */
  async answerQuestion(
    question: Question,
    context: Record<string, any>,
    kmap: Record<string, any>,
    allowInference: boolean = true
  ): Promise<Answer | null> {
    logger.info(
      {
        question_id: question.id,
        question_text: question.text,
        priority: question.priority,
      },
      'Attempting to answer question'
    );

    // Try Knowledge Refinery first
    if (this.knowledgeSource) {
      try {
        const kmapResult = await this.knowledgeSource.query(question.text, {
          ...context,
          kmap,
        });

        if (kmapResult && kmapResult.confidence >= 0.7) {
          logger.info(
            {
              question_id: question.id,
              confidence: kmapResult.confidence,
            },
            'Answer found in Knowledge Refinery'
          );

          return {
            question_id: question.id,
            text: kmapResult.answer,
            source: 'knowledge-refinery',
            confidence: kmapResult.confidence,
            evidence: kmapResult.evidence,
            created_at: new Date().toISOString(),
          };
        }
      } catch (error) {
        logger.warn(
          { error, question_id: question.id },
          'Knowledge Refinery query failed'
        );
      }
    }

    // Try inference if allowed
    if (allowInference) {
      try {
        const inferredAnswer = await this.inferAnswer(question, context, kmap);
        if (inferredAnswer) {
          logger.info(
            {
              question_id: question.id,
              confidence: inferredAnswer.confidence,
            },
            'Answer inferred from context'
          );
          return inferredAnswer;
        }
      } catch (error) {
        logger.warn({ error, question_id: question.id }, 'Inference failed');
      }
    }

    // Cannot answer - requires human input
    logger.info(
      {
        question_id: question.id,
      },
      'Question requires human input'
    );

    return null;
  }

  /**
   * Answer multiple questions in batch
   */
  async answerQuestions(
    questions: Question[],
    context: Record<string, any>,
    kmap: Record<string, any>,
    allowInference: boolean = true
  ): Promise<{
    answers: Answer[];
    unanswered: Question[];
  }> {
    const answers: Answer[] = [];
    const unanswered: Question[] = [];

    for (const question of questions) {
      const answer = await this.answerQuestion(
        question,
        context,
        kmap,
        allowInference
      );

      if (answer) {
        answers.push(answer);
      } else {
        unanswered.push(question);
      }
    }

    logger.info(
      {
        total_questions: questions.length,
        answered: answers.length,
        unanswered: unanswered.length,
      },
      'Batch answering complete'
    );

    return { answers, unanswered };
  }

  /**
   * Infer answer from context using Claude
   */
  private async inferAnswer(
    question: Question,
    context: Record<string, any>,
    kmap: Record<string, any>
  ): Promise<Answer | null> {
    const prompt = `You are an Answer Agent analyzing context to answer a clarifying question.

## Question:
${question.text}

## Question Context:
${question.context}

## Phase Context:
${JSON.stringify(context, null, 2)}

## Knowledge Map:
${JSON.stringify(kmap, null, 2)}

## Your Task:
Based on the provided context and knowledge map, attempt to answer the question.

If you can infer a reasonable answer from the available information:
1. Provide the answer
2. Rate your confidence (0.0 to 1.0)
3. List the evidence/reasoning that supports your answer
4. Note any assumptions you're making

If you cannot confidently answer from the available context, respond with "CANNOT_ANSWER".

## Output Format:
{
  "answer": "The answer text or CANNOT_ANSWER",
  "confidence": 0.0 to 1.0,
  "evidence": ["Evidence point 1", "Evidence point 2"],
  "assumptions": ["Assumption 1", "Assumption 2"]
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

      if (
        parsed.answer === 'CANNOT_ANSWER' ||
        parsed.confidence < 0.6
      ) {
        return null;
      }

      return {
        question_id: question.id,
        text: parsed.answer,
        source: 'inference',
        confidence: parsed.confidence,
        evidence: parsed.evidence || [],
        assumptions: parsed.assumptions || [],
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ error, question_id: question.id }, 'Inference failed');
      return null;
    }
  }

  /**
   * Create answer from human input
   */
  createHumanAnswer(
    questionId: string,
    answerText: string,
    metadata?: Record<string, any>
  ): Answer {
    return {
      question_id: questionId,
      text: answerText,
      source: 'human',
      confidence: 1.0,
      evidence: ['Human provided'],
      created_at: new Date().toISOString(),
      metadata,
    };
  }

  /**
   * Create default answer (fallback)
   */
  createDefaultAnswer(
    questionId: string,
    defaultValue: string,
    rationale: string
  ): Answer {
    return {
      question_id: questionId,
      text: defaultValue,
      source: 'default',
      confidence: 0.5,
      evidence: [rationale],
      assumptions: ['Using default value due to insufficient information'],
      created_at: new Date().toISOString(),
    };
  }
}
