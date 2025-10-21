import { AgentInput, AgentOutput, AgentConfig, ExecutionPlan, ReasoningResult, VerifierResult, ToolInvocationResult } from './types';
import { Analyzer } from './analyzer';
import { ToolExecutor } from './executor';
import { Verifier } from './verifier';
import { Recorder } from './recorder';
/**
 * BaseAgent: Implements the Analyzer-inside-Agent pattern
 *
 * Execution flow:
 * 1. PLANNER: Draft execution plan
 * 2. REASONING: Initial attempt without tools
 * 3. ANALYZER LOOP: Decide if tools can improve result
 *    - If VoI high enough, invoke tool via EXECUTOR
 *    - VERIFIER compares tool output to baseline
 *    - Keep tool result if improved, discard otherwise
 *    - Repeat until no improvement or budget exhausted
 * 4. RECORDER: Log execution and publish events
 */
export declare abstract class BaseAgent {
    protected config: AgentConfig;
    protected analyzer: Analyzer;
    protected executor: ToolExecutor;
    protected verifier: Verifier;
    protected recorder: Recorder;
    protected checkpointCallback?: (token: string, data: Record<string, any>) => Promise<void>;
    protected lastCheckpointTime: number;
    constructor(config: AgentConfig);
    /**
     * Set checkpoint callback (called by Worker)
     * Enables checkpoint saving during long-running executions
     */
    setCheckpointCallback(callback: (token: string, data: Record<string, any>) => Promise<void>): void;
    /**
     * Main execution method - implements the Analyzer-inside-Agent pattern
     */
    execute(input: AgentInput): Promise<AgentOutput>;
    /**
     * PLANNER: Create execution plan
     * Override in subclasses for phase-specific planning
     */
    protected abstract plan(input: AgentInput): Promise<ExecutionPlan>;
    /**
     * REASONING: Initial reasoning without tools
     * Override in subclasses for phase-specific reasoning
     */
    protected abstract reason(plan: ExecutionPlan, input: AgentInput): Promise<ReasoningResult>;
    /**
     * Integrate tool output into current result
     * Override in subclasses for custom integration logic
     */
    protected integrateToolOutput(currentResult: ReasoningResult, toolResult: ToolInvocationResult, verification: VerifierResult): Promise<ReasoningResult>;
    /**
     * Generate final artifacts from reasoning result
     * Override in subclasses for phase-specific artifact generation
     */
    protected abstract generateArtifacts(result: ReasoningResult, input: AgentInput): Promise<Array<{
        type: string;
        content: unknown;
    }>>;
    /**
     * Check if budget exceeded
     */
    protected exceededBudget(input: AgentInput, currentCostUsd: number, currentTokens: number): boolean;
    /**
     * Save checkpoint (called by agents during long-running execution)
     *
     * Automatically throttles checkpoints to max 1 per 2 minutes
     *
     * @param token - Continuation token (e.g., 'step-2-complete')
     * @param data - Checkpoint state data
     */
    protected saveCheckpoint(token: string, data: Record<string, any>): Promise<void>;
    /**
     * Check if resuming from checkpoint
     *
     * @param input - Agent input (contains checkpoint token if resuming)
     * @returns Checkpoint token if resuming, null otherwise
     */
    protected getCheckpointToken(input: AgentInput): string | null;
    /**
     * Get checkpoint data
     *
     * @param input - Agent input (contains checkpoint data if resuming)
     * @returns Checkpoint data if resuming, null otherwise
     */
    protected getCheckpointData(input: AgentInput): Record<string, any> | null;
}
//# sourceMappingURL=base-agent.d.ts.map