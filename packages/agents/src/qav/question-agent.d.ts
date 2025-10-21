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
import type { AgentInput, ExecutionPlan, ReasoningResult } from '../../../agent-sdk/src/types';
import type { Question, QuestionGenerationInput } from './types';
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
export declare class QuestionAgent extends BaseAgent {
    private anthropic;
    constructor(config?: any);
    /**
     * Main execution: Generate questions from artifacts
     */
    execute(input: QuestionGenerationInput): Promise<Question[]>;
    /**
     * PLANNER: Create execution plan
     */
    protected plan(input: AgentInput): Promise<ExecutionPlan>;
    /**
     * REASONING: Initial reasoning without tools
     */
    protected reason(plan: ExecutionPlan, input: AgentInput): Promise<ReasoningResult>;
    /**
     * Generate artifacts (questions array)
     */
    protected generateArtifacts(result: ReasoningResult, input: AgentInput): Promise<Array<{
        type: string;
        content: unknown;
    }>>;
    /**
     * Analyze artifacts for gaps using rubrics
     */
    private analyzeGaps;
    /**
     * Generate a question for a specific gap
     */
    private generateQuestionForGap;
    /**
     * Summarize artifact for LLM analysis
     */
    private summarizeArtifact;
    /**
     * Deduplicate questions (remove similar questions from prior iterations)
     */
    private deduplicateQuestions;
    /**
     * Calculate text similarity (simple Jaccard similarity on words)
     */
    private calculateSimilarity;
}
//# sourceMappingURL=question-agent.d.ts.map