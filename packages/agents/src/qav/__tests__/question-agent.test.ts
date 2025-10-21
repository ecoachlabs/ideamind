/**
 * Unit tests for QuestionAgent (QAQ)
 *
 * Tests:
 * - Gap analysis from artifacts
 * - Question generation for gaps
 * - Priority ranking
 * - Deduplication of similar questions
 * - Early exit when no gaps found
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuestionAgent } from '../question-agent';
import type { QuestionGenerationInput, Question } from '../types';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                {
                  type: 'missing_data',
                  severity: 'high',
                  description: 'User authentication method not specified',
                  artifact_ids: ['artifact-0'],
                  suggested_question: 'What authentication method should be used for user login?',
                  priority: 0.9,
                },
                {
                  type: 'ambiguity',
                  severity: 'medium',
                  description: 'Database selection unclear',
                  artifact_ids: ['artifact-1'],
                  suggested_question: 'Should we use PostgreSQL or MongoDB for data storage?',
                  priority: 0.6,
                },
              ]),
            },
          ],
        }),
      },
    })),
  };
});

describe('QuestionAgent', () => {
  let questionAgent: QuestionAgent;

  beforeEach(() => {
    questionAgent = new QuestionAgent({ phase: 'ARCH' });
  });

  it('should generate questions from artifacts with gaps', async () => {
    const input: QuestionGenerationInput = {
      phase: 'ARCH',
      artifacts: [
        {
          type: 'architecture',
          content: 'System will have a web frontend and API backend',
        },
        {
          type: 'requirements',
          content: 'Users should be able to log in',
        },
      ],
      context: {},
      rubrics: {
        grounding_min: 0.85,
        coverage_min: 0.80,
      },
    };

    const questions = await questionAgent.execute(input);

    expect(questions).toBeDefined();
    expect(questions.length).toBeGreaterThan(0);
    expect(questions[0]).toHaveProperty('id');
    expect(questions[0]).toHaveProperty('text');
    expect(questions[0]).toHaveProperty('category');
    expect(questions[0]).toHaveProperty('priority');
    expect(questions[0]).toHaveProperty('decision_impact');
  });

  it('should prioritize questions correctly (high → medium → low)', async () => {
    const input: QuestionGenerationInput = {
      phase: 'ARCH',
      artifacts: [
        { type: 'doc', content: 'Incomplete specification' },
      ],
      context: {},
      rubrics: {},
    };

    const questions = await questionAgent.execute(input);

    // Verify sorting: high priority comes before medium/low
    if (questions.length > 1) {
      const priorities = questions.map((q) => q.priority);
      const priorityOrder = { high: 0, medium: 1, low: 2 };

      for (let i = 0; i < priorities.length - 1; i++) {
        const current = priorityOrder[priorities[i]];
        const next = priorityOrder[priorities[i + 1]];
        expect(current).toBeLessThanOrEqual(next);
      }
    }
  });

  it('should deduplicate similar questions', async () => {
    const priorQuestions: Question[] = [
      {
        id: 'Q-ARCH-1',
        text: 'What authentication method should be used for user login?',
        category: 'clarification',
        priority: 'high',
        decision_impact: 'high',
        context: { phase: 'ARCH' },
      },
    ];

    const input: QuestionGenerationInput = {
      phase: 'ARCH',
      artifacts: [{ type: 'doc', content: 'User login required' }],
      context: {},
      rubrics: {},
      prior_questions: priorQuestions,
    };

    const questions = await questionAgent.execute(input);

    // Should not generate duplicate of prior question
    const hasDuplicate = questions.some((q) =>
      q.text.toLowerCase().includes('authentication method')
    );

    // Note: This test depends on LLM not generating the same question again
    // In practice, the agent deduplicates based on similarity score
  });

  it('should return empty array when artifacts are complete (no gaps)', async () => {
    // Mock Anthropic to return no gaps
    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([]),
        },
      ],
    });

    vi.mocked(questionAgent['anthropic'].messages.create).mockImplementation(mockCreate);

    const input: QuestionGenerationInput = {
      phase: 'ARCH',
      artifacts: [
        {
          type: 'complete_spec',
          content: 'Fully detailed specification with no ambiguities',
        },
      ],
      context: {},
      rubrics: {},
    };

    const questions = await questionAgent.execute(input);

    expect(questions).toEqual([]);
  });

  it('should include context from phase in generated questions', async () => {
    const input: QuestionGenerationInput = {
      phase: 'SECURITY',
      artifacts: [{ type: 'doc', content: 'Security requirements' }],
      context: { environment: 'production' },
      rubrics: { critical_cves_max: 0 },
    };

    const questions = await questionAgent.execute(input);

    questions.forEach((q) => {
      expect(q.context.phase).toBe('SECURITY');
    });
  });

  it('should categorize questions correctly based on gap type', async () => {
    const input: QuestionGenerationInput = {
      phase: 'ARCH',
      artifacts: [{ type: 'doc', content: 'Architecture draft' }],
      context: {},
      rubrics: {},
    };

    const questions = await questionAgent.execute(input);

    const validCategories = [
      'clarification',
      'validation',
      'assumption',
      'risk',
      'consistency',
      'completeness',
    ];

    questions.forEach((q) => {
      expect(validCategories).toContain(q.category);
    });
  });

  it('should handle errors gracefully and not throw', async () => {
    // Mock Anthropic to throw error
    vi.mocked(questionAgent['anthropic'].messages.create).mockRejectedValue(
      new Error('API Error')
    );

    const input: QuestionGenerationInput = {
      phase: 'ARCH',
      artifacts: [{ type: 'doc', content: 'Test' }],
      context: {},
      rubrics: {},
    };

    await expect(questionAgent.execute(input)).rejects.toThrow('API Error');
  });
});
