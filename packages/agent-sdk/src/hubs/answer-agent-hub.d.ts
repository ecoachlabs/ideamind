/**
 * Answer Agent Hub (QAA-Hub)
 *
 * Central hub that spawns phase-specific Answer Agents.
 * Each phase gets a specialized QAA agent that answers questions with evidence.
 */
import { AgentConfig, AgentInput, ExecutionPlan, ReasoningResult } from '../types';
import { BaseAgent } from '../base-agent';
export declare class AnswerAgentHub {
    private phaseConfigs;
    constructor();
    /**
     * Spawn a phase-specific Answer Agent
     */
    spawn(phase: string, runId: string): AnswerAgent;
    /**
     * Initialize phase-specific configurations
     */
    private initializePhaseConfigs;
}
declare class AnswerAgent extends BaseAgent {
    private llm;
    private systemPrompt;
    private evidenceSources;
    private runId;
    constructor(config: AgentConfig & {
        systemPrompt: string;
        evidenceSources: string[];
        runId: string;
    });
    protected plan(input: AgentInput): Promise<ExecutionPlan>;
    protected reason(plan: ExecutionPlan, input: AgentInput): Promise<ReasoningResult>;
    /**
     * Extract artifacts content from input
     */
    private extractArtifactsContent;
    /**
     * Build answer generation prompt
     */
    private buildAnswerPrompt;
    /**
     * Parse answers from LLM response
     */
    private parseAnswers;
    /**
     * Check if answers need improvement (guards tools should be invoked)
     */
    private checkGrounding;
    /**
     * Fallback answers if LLM fails
     */
    private fallbackAnswers;
    protected generateArtifacts(result: ReasoningResult, input: AgentInput): Promise<Array<{
        type: string;
        content: unknown;
    }>>;
}
export { AnswerAgent };
//# sourceMappingURL=answer-agent-hub.d.ts.map