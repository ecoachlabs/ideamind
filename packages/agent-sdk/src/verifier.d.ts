import { AgentConfig, ReasoningResult, ToolInvocationResult, VerifierResult } from './types';
/**
 * Verifier: Compares tool output to baseline to determine if quality improved
 *
 * Uses multi-dimensional scoring:
 * - Completeness: Does output address all requirements?
 * - Accuracy: Is output factually correct?
 * - Clarity: Is output well-structured and understandable?
 * - Relevance: Does output stay on topic?
 */
export declare class Verifier {
    /**
     * Compare tool output to baseline reasoning result
     */
    compare(baseline: ReasoningResult, toolResult: ToolInvocationResult, config: AgentConfig): Promise<VerifierResult>;
    /**
     * Score content on multiple dimensions using LLM-as-judge
     *
     * Uses OpenAI API to evaluate quality across multiple dimensions:
     * - Completeness: Does output address all requirements?
     * - Accuracy: Is output factually correct?
     * - Clarity: Is output well-structured and understandable?
     * - Relevance: Does output stay on topic?
     */
    private scoreDimensions;
    /**
     * Score content using OpenAI LLM-as-judge
     */
    private scoreWithLLM;
    /**
     * Score content using heuristic rules (fallback)
     */
    private scoreWithHeuristics;
}
//# sourceMappingURL=verifier.d.ts.map