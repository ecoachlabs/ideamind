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
import type { AgentInput, ExecutionPlan, ReasoningResult } from '../../../agent-sdk/src/types';
import type { Question, Answer, ValidationInput, ValidationResult } from './types';
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
export declare class QuestionValidator extends BaseAgent {
    private anthropic;
    private dbPool?;
    private thresholds;
    constructor(config?: any);
    /**
     * Main execution: Validate all Q/A pairs
     */
    execute(input: ValidationInput): Promise<ValidationResult[]>;
    /**
     * PLANNER: Create execution plan
     */
    protected plan(input: AgentInput): Promise<ExecutionPlan>;
    /**
     * REASONING: Initial reasoning without tools
     */
    protected reason(plan: ExecutionPlan, input: AgentInput): Promise<ReasoningResult>;
    /**
     * Generate artifacts (validations array)
     */
    protected generateArtifacts(result: ReasoningResult, input: AgentInput): Promise<Array<{
        type: string;
        content: unknown;
    }>>;
    /**
     * Validate a single Q/A binding
     */
    validateBinding(question: Question, answer: Answer, existingKMNodes?: any[]): Promise<ValidationResult>;
    /**
     * Score grounding (citation quality)
     * Returns 0-1 score based on:
     * - Number of citations
     * - Citation confidence
     * - Citation diversity (multiple sources)
     */
    private scoreGrounding;
    /**
     * Score completeness (question fully answered)
     * Uses LLM to judge if answer addresses all aspects of question
     */
    private scoreCompleteness;
    /**
     * Score specificity (not vague or generic)
     * Uses heuristics + LLM judgment
     */
    private scoreSpecificity;
    /**
     * Score consistency (no contradictions with existing knowledge)
     * Checks against existing KM nodes if available
     */
    private scoreConsistency;
}
//# sourceMappingURL=question-validator.d.ts.map