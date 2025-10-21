/**
 * Answer Agent (QAA) - Autonomous Answering Component
 *
 * Answers questions using artifacts, Knowledge Map, and allowlisted tools.
 * Returns 'UNKNOWN' when confidence < 0.6 (becomes ASSUMPTION).
 *
 * Spec References:
 * - orchestrator.txt:24-25 (autonomous clarification, never user)
 * - orchestrator.txt:172-175 (QAA answers questions)
 * - UNIFIED_IMPLEMENTATION_SPEC.md Section 2.1
 */
import { BaseAgent } from '../../../agent-sdk/src/base-agent';
import type { AgentInput, ExecutionPlan, ReasoningResult } from '../../../agent-sdk/src/types';
import type { Answer, AnswerGenerationInput } from './types';
/**
 * AnswerAgent - Generates evidence-based answers to questions
 *
 * Algorithm:
 * 1. For each question:
 *    a. Search artifacts for relevant information (RAG)
 *    b. If insufficient, try allowlisted tools
 *    c. If still insufficient, return UNKNOWN
 * 2. Generate answer with citations
 * 3. Score confidence (0-1)
 * 4. Return Answer (or UNKNOWN if confidence < 0.6)
 */
export declare class AnswerAgent extends BaseAgent {
    private anthropic;
    private confidenceThreshold;
    constructor(config?: any);
    /**
     * Main execution: Answer questions using artifacts + tools
     */
    execute(input: AnswerGenerationInput): Promise<Answer[]>;
    /**
     * PLANNER: Create execution plan
     */
    protected plan(input: AgentInput): Promise<ExecutionPlan>;
    /**
     * REASONING: Initial reasoning without tools
     */
    protected reason(plan: ExecutionPlan, input: AgentInput): Promise<ReasoningResult>;
    /**
     * Generate artifacts (answers array)
     */
    protected generateArtifacts(result: ReasoningResult, input: AgentInput): Promise<Array<{
        type: string;
        content: unknown;
    }>>;
    /**
     * Answer a single question using artifacts + tools
     */
    private answerQuestion;
    /**
     * Search artifacts for relevant information (simple RAG)
     */
    private searchArtifacts;
    /**
     * Search using allowlisted tools
     */
    private searchWithTools;
    /**
     * Generate answer from evidence
     */
    private generateAnswerFromEvidence;
    /**
     * Generate UNKNOWN answer when confidence too low
     */
    private generateUnknownAnswer;
    /**
     * Suggest next steps for UNKNOWN answers
     */
    private suggestNextSteps;
    /**
     * Extract content from artifact
     */
    private extractArtifactContent;
}
//# sourceMappingURL=answer-agent.d.ts.map