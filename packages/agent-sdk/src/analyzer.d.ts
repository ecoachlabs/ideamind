import { AgentInput, AgentConfig, ExecutionPlan, ReasoningResult, AnalyzerDecision } from './types';
/**
 * Analyzer: Decides if invoking a tool would improve the result
 *
 * Uses Value-of-Information (VoI) scoring to determine if tool invocation
 * is worth the cost. VoI considers:
 * - Current confidence level
 * - Estimated improvement from tool
 * - Cost of tool invocation
 * - Remaining budget
 */
export declare class Analyzer {
    private config;
    private registryClient;
    constructor(config: AgentConfig);
    /**
     * Analyze current result and decide if tool should be invoked
     */
    analyze(plan: ExecutionPlan, currentResult: ReasoningResult, input: AgentInput): Promise<AnalyzerDecision>;
    /**
     * Identify candidate tools that could improve the result
     *
     * Queries tool registry for tools matching the phase and task,
     * filters by agent's tool policy, and estimates improvement potential.
     */
    private identifyCandidateTools;
    /**
     * Check if tool category is relevant for current task
     */
    private isToolRelevantForTask;
    /**
     * Estimate improvement potential of tool
     */
    private estimateToolImprovement;
    /**
     * Build tool input from current context
     */
    private buildToolInput;
    /**
     * Calculate Value-of-Information (VoI) score
     *
     * VoI = (EstimatedImprovement * RemainingBudget) / EstimatedCost
     *
     * Where:
     * - EstimatedImprovement: How much the tool is expected to improve quality (0-1)
     * - RemainingBudget: How much budget is left (normalized 0-1)
     * - EstimatedCost: Cost of tool invocation
     */
    private calculateVoI;
    /**
     * Check if tool is allowed by agent policy
     */
    private isToolAllowed;
}
//# sourceMappingURL=analyzer.d.ts.map