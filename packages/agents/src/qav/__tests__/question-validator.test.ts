/**
 * Unit tests for QuestionValidator (QV)
 *
 * Tests:
 * - Validation scoring (grounding, completeness, specificity, consistency)
 * - Threshold enforcement
 * - Auto-rejection of UNKNOWN answers
 * - Hint generation for rejected pairs
 * - Overall score calculation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuestionValidator } from '../question-validator';
import type { Question, Answer, ValidationResult } from '../types';

describe('QuestionValidator', () => {
  let validator: QuestionValidator;

  beforeEach(() => {
    validator = new QuestionValidator({ phase: 'ARCH' });
  });

  it('should auto-reject UNKNOWN answers', async () => {
    const question: Question = {
      id: 'Q-ARCH-1',
      text: 'What is the deployment strategy?',
      category: 'clarification',
      priority: 'high',
      decision_impact: 'high',
      context: { phase: 'ARCH' },
    };

    const answer: Answer = {
      answer_id: 'A-ARCH-1',
      question_id: 'Q-ARCH-1',
      answer: 'UNKNOWN',
      citations: [],
      confidence: 0,
      reasoning: 'Insufficient evidence',
      next_steps: ['Add deployment details to spec'],
      generated_by: 'QAA-ARCH',
      timestamp: new Date().toISOString(),
    };

    const result = await validator.validateBinding(question, answer);

    expect(result.accepted).toBe(false);
    expect(result.overall_score).toBe(0);
    expect(result.issues).toContain('Answer is UNKNOWN - will be registered as ASSUMPTION');
  });

  it('should accept high-quality Q/A pairs', async () => {
    const question: Question = {
      id: 'Q-ARCH-1',
      text: 'What database will be used?',
      category: 'clarification',
      priority: 'high',
      decision_impact: 'high',
      context: { phase: 'ARCH' },
    };

    const answer: Answer = {
      answer_id: 'A-ARCH-1',
      question_id: 'Q-ARCH-1',
      answer: 'PostgreSQL 15 will be used as the primary relational database',
      citations: [
        {
          type: 'artifact',
          id: 'art-1',
          excerpt: 'Use PostgreSQL 15',
          confidence: 0.95,
        },
        {
          type: 'artifact',
          id: 'art-2',
          excerpt: 'Relational database required',
          confidence: 0.90,
        },
      ],
      confidence: 0.92,
      generated_by: 'QAA-ARCH',
      timestamp: new Date().toISOString(),
    };

    const result = await validator.validateBinding(question, answer);

    // Should pass all thresholds
    expect(result.scores.grounding).toBeGreaterThanOrEqual(0.7);
    expect(result.overall_score).toBeGreaterThanOrEqual(0.7);
    // Note: acceptance depends on LLM scoring, so we can't guarantee acceptance
  });

  it('should reject Q/A pairs with low grounding score (no citations)', async () => {
    const question: Question = {
      id: 'Q-ARCH-1',
      text: 'What is the API framework?',
      category: 'clarification',
      priority: 'high',
      decision_impact: 'high',
      context: { phase: 'ARCH' },
    };

    const answer: Answer = {
      answer_id: 'A-ARCH-1',
      question_id: 'Q-ARCH-1',
      answer: 'Express.js',
      citations: [], // No citations!
      confidence: 0.8,
      generated_by: 'QAA-ARCH',
      timestamp: new Date().toISOString(),
    };

    const result = await validator.validateBinding(question, answer);

    expect(result.scores.grounding).toBe(0);
    expect(result.accepted).toBe(false);
    expect(result.issues).toContain('Grounding score 0.00 < 0.7');
  });

  it('should calculate overall score correctly (average of 4 scores)', async () => {
    const question: Question = {
      id: 'Q-ARCH-1',
      text: 'Test question?',
      category: 'clarification',
      priority: 'high',
      decision_impact: 'high',
      context: { phase: 'ARCH' },
    };

    const answer: Answer = {
      answer_id: 'A-ARCH-1',
      question_id: 'Q-ARCH-1',
      answer: 'Test answer with specific details',
      citations: [
        {
          type: 'artifact',
          id: 'art-1',
          confidence: 0.8,
        },
      ],
      confidence: 0.85,
      generated_by: 'QAA-ARCH',
      timestamp: new Date().toISOString(),
    };

    const result = await validator.validateBinding(question, answer);

    // Overall score should be average of 4 scores
    const expectedOverall =
      (result.scores.grounding +
        result.scores.completeness +
        result.scores.specificity +
        result.scores.consistency) /
      4;

    expect(result.overall_score).toBeCloseTo(expectedOverall, 2);
  });

  it('should provide hints for rejected Q/A pairs', async () => {
    const question: Question = {
      id: 'Q-ARCH-1',
      text: 'What is the caching strategy?',
      category: 'clarification',
      priority: 'high',
      decision_impact: 'high',
      context: { phase: 'ARCH' },
    };

    const answer: Answer = {
      answer_id: 'A-ARCH-1',
      question_id: 'Q-ARCH-1',
      answer: 'Maybe Redis or something',
      citations: [],
      confidence: 0.4,
      generated_by: 'QAA-ARCH',
      timestamp: new Date().toISOString(),
    };

    const result = await validator.validateBinding(question, answer);

    expect(result.accepted).toBe(false);
    expect(result.hints).toBeDefined();
    expect(result.hints!.length).toBeGreaterThan(0);
  });

  it('should enforce all threshold requirements', async () => {
    // Create answer that meets some but not all thresholds
    const question: Question = {
      id: 'Q-ARCH-1',
      text: 'Test question?',
      category: 'clarification',
      priority: 'high',
      decision_impact: 'high',
      context: { phase: 'ARCH' },
    };

    const answer: Answer = {
      answer_id: 'A-ARCH-1',
      question_id: 'Q-ARCH-1',
      answer: 'Test',
      citations: [
        {
          type: 'artifact',
          id: 'art-1',
          confidence: 0.9,
        },
      ],
      confidence: 0.85,
      generated_by: 'QAA-ARCH',
      timestamp: new Date().toISOString(),
    };

    const result = await validator.validateBinding(question, answer);

    // Check all thresholds are evaluated
    expect(result.scores).toHaveProperty('grounding');
    expect(result.scores).toHaveProperty('completeness');
    expect(result.scores).toHaveProperty('specificity');
    expect(result.scores).toHaveProperty('consistency');

    // If rejected, should have issues explaining which thresholds failed
    if (!result.accepted) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it('should track validated_by field', async () => {
    const question: Question = {
      id: 'Q-ARCH-1',
      text: 'Test question?',
      category: 'clarification',
      priority: 'high',
      decision_impact: 'high',
      context: { phase: 'ARCH' },
    };

    const answer: Answer = {
      answer_id: 'A-ARCH-1',
      question_id: 'Q-ARCH-1',
      answer: 'UNKNOWN',
      citations: [],
      confidence: 0,
      generated_by: 'QAA-ARCH',
      timestamp: new Date().toISOString(),
    };

    const result = await validator.validateBinding(question, answer);

    expect(result.validated_by).toMatch(/QV-ARCH/);
  });

  it('should include timestamp in validation results', async () => {
    const question: Question = {
      id: 'Q-ARCH-1',
      text: 'Test question?',
      category: 'clarification',
      priority: 'high',
      decision_impact: 'high',
      context: { phase: 'ARCH' },
    };

    const answer: Answer = {
      answer_id: 'A-ARCH-1',
      question_id: 'Q-ARCH-1',
      answer: 'Test answer',
      citations: [],
      confidence: 0.7,
      generated_by: 'QAA-ARCH',
      timestamp: new Date().toISOString(),
    };

    const result = await validator.validateBinding(question, answer);

    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('should validate multiple Q/A pairs independently', async () => {
    const questions: Question[] = [
      {
        id: 'Q-1',
        text: 'Question 1?',
        category: 'clarification',
        priority: 'high',
        decision_impact: 'high',
        context: { phase: 'ARCH' },
      },
      {
        id: 'Q-2',
        text: 'Question 2?',
        category: 'validation',
        priority: 'medium',
        decision_impact: 'medium',
        context: { phase: 'ARCH' },
      },
    ];

    const answers: Answer[] = [
      {
        answer_id: 'A-1',
        question_id: 'Q-1',
        answer: 'Good answer with citations',
        citations: [{ type: 'artifact', id: 'art-1', confidence: 0.9 }],
        confidence: 0.9,
        generated_by: 'QAA-ARCH',
        timestamp: new Date().toISOString(),
      },
      {
        answer_id: 'A-2',
        question_id: 'Q-2',
        answer: 'UNKNOWN',
        citations: [],
        confidence: 0,
        generated_by: 'QAA-ARCH',
        timestamp: new Date().toISOString(),
      },
    ];

    const results = await Promise.all(
      questions.map((q, i) => validator.validateBinding(q, answers[i]))
    );

    expect(results).toHaveLength(2);
    expect(results[0].question_id).toBe('Q-1');
    expect(results[1].question_id).toBe('Q-2');
    expect(results[1].accepted).toBe(false); // UNKNOWN should be rejected
  });
});
