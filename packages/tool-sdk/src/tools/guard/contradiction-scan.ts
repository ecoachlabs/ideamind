/**
 * guard.contradictionScan
 *
 * Detects contradictions between a new answer and existing Knowledge Map entries.
 *
 * Features:
 * - Queries existing accepted Q/A pairs from Knowledge Map
 * - Detects logical contradictions (e.g., conflicting values, opposite claims)
 * - Returns consistency score (0.0 = conflict detected, 1.0 = no conflicts)
 * - Provides conflict details for remediation
 */

import {
  Tool,
  ToolInput,
  ToolOutput,
  ToolMetadata,
  ToolCategory,
} from '../../types';
import { Pool } from 'pg';
import { ILLMProvider, LLMFactory } from '../../../agent-sdk/src/llm';

// ============================================================================
// CONTRADICTION SCAN TOOL
// ============================================================================

export class ContradictionScanTool implements Tool {
  readonly metadata: ToolMetadata = {
    name: 'guard.contradictionScan',
    description: 'Detect contradictions with existing Knowledge Map entries',
    category: ToolCategory.GUARD,
    version: '1.0.0',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question being answered',
        },
        answer: {
          type: 'string',
          description: 'The new answer to validate',
        },
        phase: {
          type: 'string',
          description: 'Current phase (for context)',
        },
        runId: {
          type: 'string',
          description: 'Workflow run ID',
        },
        dbPool: {
          type: 'object',
          description: 'PostgreSQL connection pool (required)',
        },
        useLLM: {
          type: 'boolean',
          description: 'Use LLM for semantic contradiction detection',
          default: true,
        },
      },
      required: ['question', 'answer', 'phase', 'dbPool'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        consistencyScore: {
          type: 'number',
          description: '0.0 = conflicts detected, 1.0 = no conflicts',
        },
        conflictsDetected: { type: 'boolean' },
        conflictCount: { type: 'number' },
        conflicts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              existingQuestionId: { type: 'string' },
              existingQuestion: { type: 'string' },
              existingAnswer: { type: 'string' },
              conflictType: { type: 'string' },
              conflictDescription: { type: 'string' },
              severity: { type: 'string' },
            },
          },
        },
      },
    },
    costUsd: 0.03, // Cost of LLM call for semantic analysis
  };

  private llm?: ILLMProvider;

  constructor(phase?: string) {
    // Initialize LLM for semantic contradiction detection
    if (phase) {
      this.llm = LLMFactory.createProvider(phase, 'validator');
    }
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    const startTime = Date.now();
    const {
      question,
      answer,
      phase,
      runId,
      dbPool,
      useLLM = true,
    } = input as ContradictionScanInput;

    try {
      // Step 1: Query existing Knowledge Map for related answers
      const existingKnowledge = await this.queryRelatedKnowledge(
        dbPool,
        question,
        phase,
        runId
      );

      console.log(
        `[ContradictionScan] Found ${existingKnowledge.length} existing K/A pairs to check`
      );

      // Step 2: Detect contradictions
      let conflicts: Conflict[] = [];
      let totalCost = 0;

      if (existingKnowledge.length === 0) {
        // No existing knowledge to contradict
        return {
          result: {
            consistencyScore: 1.0,
            conflictsDetected: false,
            conflictCount: 0,
            conflicts: [],
          },
          metadata: {
            toolName: this.metadata.name,
            toolVersion: this.metadata.version,
            executionTimeMs: Date.now() - startTime,
            costUsd: 0,
          },
        };
      }

      if (useLLM && this.llm) {
        // Use LLM for semantic contradiction detection
        const llmResult = await this.detectContradictionsWithLLM(
          question,
          answer,
          existingKnowledge
        );
        conflicts = llmResult.conflicts;
        totalCost = llmResult.cost;
      } else {
        // Fallback: Simple rule-based contradiction detection
        conflicts = this.detectContradictionsRuleBased(
          question,
          answer,
          existingKnowledge
        );
      }

      // Step 3: Calculate consistency score
      const consistencyScore = conflicts.length === 0 ? 1.0 : 0.0;

      console.log(
        `[ContradictionScan] Consistency: ${consistencyScore}, Conflicts: ${conflicts.length}`
      );

      return {
        result: {
          consistencyScore,
          conflictsDetected: conflicts.length > 0,
          conflictCount: conflicts.length,
          conflicts,
        },
        metadata: {
          toolName: this.metadata.name,
          toolVersion: this.metadata.version,
          executionTimeMs: Date.now() - startTime,
          costUsd: totalCost,
        },
      };
    } catch (error) {
      console.error('[ContradictionScan] Error:', error);

      // Return permissive result on error (assume no conflicts)
      return {
        result: {
          consistencyScore: 1.0,
          conflictsDetected: false,
          conflictCount: 0,
          conflicts: [],
          error: String(error),
        },
        metadata: {
          toolName: this.metadata.name,
          toolVersion: this.metadata.version,
          executionTimeMs: Date.now() - startTime,
          costUsd: 0,
        },
      };
    }
  }

  /**
   * Query Knowledge Map for related Q/A pairs
   */
  private async queryRelatedKnowledge(
    dbPool: Pool,
    question: string,
    phase: string,
    runId?: string
  ): Promise<ExistingKnowledge[]> {
    // Query for accepted Q/A pairs from this phase and previous phases
    // Use text similarity to find related questions
    const query = `
      SELECT
        q.id AS question_id,
        q.text AS question_text,
        a.answer AS answer_text,
        q.phase,
        b.score_grounding,
        b.score_completeness,
        b.created_at
      FROM questions q
      INNER JOIN answers a ON q.id = a.question_id
      INNER JOIN bindings b ON a.id = b.answer_id
      WHERE b.decision = 'accept'
        AND q.phase = $1
        AND ($2::text IS NULL OR q.run_id != $2)
      ORDER BY b.created_at DESC
      LIMIT 50
    `;

    const result = await dbPool.query(query, [phase, runId || null]);

    return result.rows.map((row) => ({
      questionId: row.question_id,
      question: row.question_text,
      answer: row.answer_text,
      phase: row.phase,
      grounding: parseFloat(row.score_grounding),
      createdAt: row.created_at,
    }));
  }

  /**
   * Detect contradictions using LLM (semantic analysis)
   */
  private async detectContradictionsWithLLM(
    newQuestion: string,
    newAnswer: string,
    existingKnowledge: ExistingKnowledge[]
  ): Promise<{ conflicts: Conflict[]; cost: number }> {
    if (!this.llm) {
      return { conflicts: [], cost: 0 };
    }

    const prompt = this.buildContradictionPrompt(
      newQuestion,
      newAnswer,
      existingKnowledge
    );

    try {
      const response = await this.llm.invoke({
        prompt,
        systemPrompt: `You are a logical consistency analyzer. Your task is to detect contradictions between a new answer and existing knowledge.

A contradiction exists when:
1. The new answer makes a claim that directly conflicts with an existing answer
2. The new answer provides a different value for the same metric/fact
3. The new answer contradicts a fundamental assumption in existing answers

Do NOT flag as contradiction:
- Different perspectives or opinions (both can be valid)
- Refinements or elaborations (new answer builds on existing)
- Different contexts (answers apply to different scenarios)

Be strict but fair. Only flag TRUE contradictions.`,
      });

      const conflicts = this.parseContradictionResponse(
        response.content,
        existingKnowledge
      );

      return {
        conflicts,
        cost: response.costUsd || 0.03,
      };
    } catch (error) {
      console.warn('[ContradictionScan] LLM detection failed, using rule-based fallback:', error);
      return {
        conflicts: this.detectContradictionsRuleBased(
          newQuestion,
          newAnswer,
          existingKnowledge
        ),
        cost: 0,
      };
    }
  }

  /**
   * Build prompt for LLM contradiction detection
   */
  private buildContradictionPrompt(
    newQuestion: string,
    newAnswer: string,
    existingKnowledge: ExistingKnowledge[]
  ): string {
    return `**New Q/A Pair to Validate**:

**Question**: ${newQuestion}
**Answer**: ${newAnswer}

**Existing Knowledge Map Entries** (accepted Q/A pairs):

${existingKnowledge
  .slice(0, 10) // Limit to 10 to keep prompt size reasonable
  .map(
    (k, idx) => `
${idx + 1}. **Q** (${k.questionId}): ${k.question}
   **A**: ${k.answer}
`
  )
  .join('\n')}

**Your Task**:
Analyze if the NEW answer contradicts any EXISTING answers.

For each contradiction found, provide:
1. **existing_question_id**: ID of contradicting question
2. **conflict_type**: One of: "value_mismatch", "logical_contradiction", "assumption_conflict"
3. **conflict_description**: Brief explanation of the conflict
4. **severity**: One of: "critical", "moderate", "minor"

**Output Format** (JSON only):
{
  "conflicts": [
    {
      "existing_question_id": "Q-PRD-001",
      "conflict_type": "value_mismatch",
      "conflict_description": "New answer states '< 100ms latency' but existing answer states '< 500ms latency'",
      "severity": "critical"
    }
  ]
}

If NO contradictions found, return:
{
  "conflicts": []
}

Respond ONLY with JSON. No markdown, no explanation.`;
  }

  /**
   * Parse LLM response for contradictions
   */
  private parseContradictionResponse(
    responseText: string,
    existingKnowledge: ExistingKnowledge[]
  ): Conflict[] {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!Array.isArray(parsed.conflicts)) {
        return [];
      }

      return parsed.conflicts.map((c: any) => {
        const existing = existingKnowledge.find(
          (k) => k.questionId === c.existing_question_id
        );

        return {
          existingQuestionId: c.existing_question_id || 'unknown',
          existingQuestion: existing?.question || 'Unknown question',
          existingAnswer: existing?.answer || 'Unknown answer',
          conflictType: c.conflict_type || 'logical_contradiction',
          conflictDescription: c.conflict_description || 'Contradiction detected',
          severity: c.severity || 'moderate',
        };
      });
    } catch (error) {
      console.warn('[ContradictionScan] Failed to parse LLM response:', error);
      return [];
    }
  }

  /**
   * Rule-based contradiction detection (fallback)
   * Detects simple numeric value mismatches
   */
  private detectContradictionsRuleBased(
    newQuestion: string,
    newAnswer: string,
    existingKnowledge: ExistingKnowledge[]
  ): Conflict[] {
    const conflicts: Conflict[] = [];

    // Extract numeric values from new answer
    const newNumbers = this.extractNumbers(newAnswer);

    for (const existing of existingKnowledge) {
      // Check if questions are similar (basic keyword overlap)
      const questionSimilarity = this.calculateSimilarity(
        newQuestion.toLowerCase(),
        existing.question.toLowerCase()
      );

      if (questionSimilarity < 0.5) {
        continue; // Skip unrelated questions
      }

      // Extract numeric values from existing answer
      const existingNumbers = this.extractNumbers(existing.answer);

      // Check for numeric mismatches
      if (newNumbers.length > 0 && existingNumbers.length > 0) {
        const hasConflict = this.detectNumericConflict(
          newNumbers,
          existingNumbers
        );

        if (hasConflict) {
          conflicts.push({
            existingQuestionId: existing.questionId,
            existingQuestion: existing.question,
            existingAnswer: existing.answer,
            conflictType: 'value_mismatch',
            conflictDescription: `Numeric values differ: new=[${newNumbers.join(', ')}], existing=[${existingNumbers.join(', ')}]`,
            severity: 'moderate',
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Extract numeric values from text
   */
  private extractNumbers(text: string): number[] {
    const matches = text.match(/\b\d+(?:\.\d+)?\b/g);
    return matches ? matches.map((m) => parseFloat(m)) : [];
  }

  /**
   * Calculate Jaccard similarity between two strings
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));

    const intersection = new Set(
      [...words1].filter((word) => words2.has(word))
    );
    const union = new Set([...words1, ...words2]);

    return intersection.size / Math.max(union.size, 1);
  }

  /**
   * Detect if numeric values conflict
   */
  private detectNumericConflict(
    newNumbers: number[],
    existingNumbers: number[]
  ): boolean {
    // If both have exactly one number and they differ significantly
    if (newNumbers.length === 1 && existingNumbers.length === 1) {
      const diff = Math.abs(newNumbers[0] - existingNumbers[0]);
      const avg = (newNumbers[0] + existingNumbers[0]) / 2;
      const percentDiff = avg > 0 ? (diff / avg) * 100 : 0;

      // Flag if difference > 50%
      return percentDiff > 50;
    }

    return false;
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface ContradictionScanInput {
  question: string;
  answer: string;
  phase: string;
  runId?: string;
  dbPool: Pool;
  useLLM?: boolean;
}

interface ContradictionScanOutput {
  consistencyScore: number;
  conflictsDetected: boolean;
  conflictCount: number;
  conflicts: Conflict[];
  error?: string;
}

interface Conflict {
  existingQuestionId: string;
  existingQuestion: string;
  existingAnswer: string;
  conflictType: 'value_mismatch' | 'logical_contradiction' | 'assumption_conflict';
  conflictDescription: string;
  severity: 'critical' | 'moderate' | 'minor';
}

interface ExistingKnowledge {
  questionId: string;
  question: string;
  answer: string;
  phase: string;
  grounding: number;
  createdAt: Date;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createContradictionScanTool(phase?: string): Tool {
  return new ContradictionScanTool(phase);
}
