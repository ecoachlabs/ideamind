/**
 * Unit tests for AnswerAgent (QAA)
 *
 * Tests:
 * - Answering questions using artifacts
 * - Returning UNKNOWN when confidence < 0.6
 * - Citation generation
 * - Tool invocation (when implemented)
 * - Next steps for UNKNOWN answers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnswerAgent } from '../answer-agent';
import type { AnswerGenerationInput, Question, Answer } from '../types';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk');

describe('AnswerAgent', () => {
  let answerAgent: AnswerAgent;

  beforeEach(() => {
    answerAgent = new AnswerAgent({ phase: 'ARCH', allowlisted_tools: [] });
  });

  it('should answer questions using artifacts', async () => {
    const questions: Question[] = [
      {
        id: 'Q-ARCH-1',
        text: 'What database should be used?',
        category: 'clarification',
        priority: 'high',
        decision_impact: 'high',
        context: { phase: 'ARCH' },
      },
    ];

    const input: AnswerGenerationInput = {
      questions,
      artifacts: [
        {
          id: 'art-1',
          type: 'architecture',
          content: 'The system will use PostgreSQL as the primary database',
        },
      ],
      allowlisted_tools: [],
      phase: 'ARCH',
    };

    const answers = await answerAgent.execute(input);

    expect(answers).toHaveLength(1);
    expect(answers[0]).toHaveProperty('answer_id');
    expect(answers[0]).toHaveProperty('question_id', 'Q-ARCH-1');
    expect(answers[0]).toHaveProperty('answer');
    expect(answers[0].answer).not.toBe('UNKNOWN');
  });

  it('should return UNKNOWN when confidence < 0.6', async () => {
    // Mock low confidence response
    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            relevant_artifacts: [],
            synthesis: 'No relevant information found',
            confidence: 0.3,
          }),
        },
      ],
    });

    vi.spyOn(answerAgent['anthropic'].messages, 'create').mockImplementation(mockCreate);

    const questions: Question[] = [
      {
        id: 'Q-ARCH-1',
        text: 'What is the deployment strategy?',
        category: 'clarification',
        priority: 'high',
        decision_impact: 'high',
        context: { phase: 'ARCH' },
      },
    ];

    const input: AnswerGenerationInput = {
      questions,
      artifacts: [
        {
          id: 'art-1',
          content: 'Basic architecture diagram',
        },
      ],
      allowlisted_tools: [],
      phase: 'ARCH',
    };

    const answers = await answerAgent.execute(input);

    expect(answers[0].answer).toBe('UNKNOWN');
    expect(answers[0].confidence).toBeLessThan(0.6);
    expect(answers[0].reasoning).toBeDefined();
    expect(answers[0].next_steps).toBeDefined();
    expect(answers[0].next_steps!.length).toBeGreaterThan(0);
  });

  it('should include citations in answers', async () => {
    const questions: Question[] = [
      {
        id: 'Q-ARCH-1',
        text: 'What framework is used?',
        category: 'clarification',
        priority: 'high',
        decision_impact: 'high',
        context: { phase: 'ARCH' },
      },
    ];

    const input: AnswerGenerationInput = {
      questions,
      artifacts: [
        {
          id: 'art-1',
          content: 'Frontend will use React 18 with TypeScript',
        },
      ],
      allowlisted_tools: [],
      phase: 'ARCH',
    };

    const answers = await answerAgent.execute(input);

    expect(answers[0].citations).toBeDefined();
    expect(Array.isArray(answers[0].citations)).toBe(true);

    if (answers[0].citations.length > 0) {
      const citation = answers[0].citations[0];
      expect(citation).toHaveProperty('type');
      expect(citation).toHaveProperty('id');
      expect(citation).toHaveProperty('confidence');
      expect(['artifact', 'tool_result', 'km_node', 'assumption']).toContain(citation.type);
    }
  });

  it('should suggest next steps for UNKNOWN answers', async () => {
    // Force UNKNOWN answer
    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            relevant_artifacts: [],
            synthesis: '',
            confidence: 0.2,
          }),
        },
      ],
    });

    vi.spyOn(answerAgent['anthropic'].messages, 'create').mockImplementation(mockCreate);

    const questions: Question[] = [
      {
        id: 'Q-ARCH-1',
        text: 'What is the scalability target?',
        category: 'assumption',
        priority: 'high',
        decision_impact: 'high',
        context: { phase: 'ARCH' },
      },
    ];

    const input: AnswerGenerationInput = {
      questions,
      artifacts: [],
      allowlisted_tools: [],
      phase: 'ARCH',
    };

    const answers = await answerAgent.execute(input);

    expect(answers[0].answer).toBe('UNKNOWN');
    expect(answers[0].next_steps).toBeDefined();
    expect(answers[0].next_steps!.length).toBeGreaterThan(0);

    // Verify next steps are category-specific
    const nextSteps = answers[0].next_steps!.join(' ');
    expect(nextSteps.toLowerCase()).toContain('assumption');
  });

  it('should handle multiple questions in parallel', async () => {
    const questions: Question[] = [
      {
        id: 'Q-ARCH-1',
        text: 'Question 1?',
        category: 'clarification',
        priority: 'high',
        decision_impact: 'high',
        context: { phase: 'ARCH' },
      },
      {
        id: 'Q-ARCH-2',
        text: 'Question 2?',
        category: 'validation',
        priority: 'medium',
        decision_impact: 'medium',
        context: { phase: 'ARCH' },
      },
      {
        id: 'Q-ARCH-3',
        text: 'Question 3?',
        category: 'risk',
        priority: 'low',
        decision_impact: 'low',
        context: { phase: 'ARCH' },
      },
    ];

    const input: AnswerGenerationInput = {
      questions,
      artifacts: [{ id: 'art-1', content: 'Test artifact' }],
      allowlisted_tools: [],
      phase: 'ARCH',
    };

    const answers = await answerAgent.execute(input);

    expect(answers).toHaveLength(3);
    expect(answers.map((a) => a.question_id)).toEqual(['Q-ARCH-1', 'Q-ARCH-2', 'Q-ARCH-3']);
  });

  it('should track generated_by field', async () => {
    const questions: Question[] = [
      {
        id: 'Q-ARCH-1',
        text: 'Test question?',
        category: 'clarification',
        priority: 'high',
        decision_impact: 'high',
        context: { phase: 'ARCH' },
      },
    ];

    const input: AnswerGenerationInput = {
      questions,
      artifacts: [],
      allowlisted_tools: [],
      phase: 'ARCH',
    };

    const answers = await answerAgent.execute(input);

    expect(answers[0].generated_by).toMatch(/QAA-ARCH/);
  });

  it('should include timestamp in answers', async () => {
    const questions: Question[] = [
      {
        id: 'Q-ARCH-1',
        text: 'Test question?',
        category: 'clarification',
        priority: 'high',
        decision_impact: 'high',
        context: { phase: 'ARCH' },
      },
    ];

    const input: AnswerGenerationInput = {
      questions,
      artifacts: [],
      allowlisted_tools: [],
      phase: 'ARCH',
    };

    const answers = await answerAgent.execute(input);

    expect(answers[0].timestamp).toBeDefined();
    expect(new Date(answers[0].timestamp).getTime()).toBeGreaterThan(0);
  });
});
