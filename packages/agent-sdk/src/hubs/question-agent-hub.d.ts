/**
 * Question Agent Hub (QAQ-Hub)
 *
 * Central hub that spawns phase-specific Question Agents.
 * Each phase gets a specialized QAQ agent with phase-appropriate prompts and tools.
 */
import { AgentConfig, AgentInput, ExecutionPlan, ReasoningResult } from '../types';
import { BaseAgent } from '../base-agent';
export declare class QuestionAgentHub {
    private phaseConfigs;
    constructor();
    /**
     * Spawn a phase-specific Question Agent
     */
    spawn(phase: string, runId: string): QuestionAgent;
    /**
     * Initialize phase-specific configurations
     */
    private initializePhaseConfigs;
}
declare class QuestionAgent extends BaseAgent {
    private llm;
    private systemPrompt;
    private priorityThemes;
    private runId;
    constructor(config: AgentConfig & {
        systemPrompt: string;
        priorityThemes: string[];
        runId: string;
    });
    /**
     * Plan: Determine question generation strategy
     */
    protected plan(input: AgentInput): Promise<ExecutionPlan>;
    /**
     * Reason: Generate questions using LLM
     */
    protected reason(plan: ExecutionPlan, input: AgentInput): Promise<ReasoningResult>;
    /**
     * Extract artifacts content from input
     */
    private extractArtifactsContent;
    /**
     * Build question generation prompt
     */
    private buildQuestionPrompt;
    /**
     * Parse questions from LLM response
     */
    private parseQuestions;
    /**
     * Fallback questions if LLM fails
     */
    private fallbackQuestions;
    /**
     * Generate artifacts: Return questions in standard format
     */
    protected generateArtifacts(result: ReasoningResult, input: AgentInput): Promise<Array<{
        type: string;
        content: unknown;
    }>>;
}
export { QuestionAgent };
//# sourceMappingURL=question-agent-hub.d.ts.map