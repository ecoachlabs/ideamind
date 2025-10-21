/**
 * Validator Hub (QV-Hub)
 *
 * Central hub that spawns phase-specific Validator agents (referees).
 * Each validator uses rubric scoring to accept/reject Q/A bindings.
 */
import { AgentConfig, AgentInput, ExecutionPlan, ReasoningResult } from '../types';
import { BaseAgent } from '../base-agent';
export declare class ValidatorHub {
    private phaseConfigs;
    constructor();
    /**
     * Spawn a phase-specific Validator
     */
    spawn(phase: string, runId: string): Validator;
    /**
     * Initialize phase-specific configurations
     */
    private initializePhaseConfigs;
}
interface RubricThresholds {
    grounding: number;
    completeness: number;
    specificity: number;
    consistency: number;
}
declare class Validator extends BaseAgent {
    private llm;
    private systemPrompt;
    private rubric;
    private runId;
    private contradictionTool;
    constructor(config: AgentConfig & {
        systemPrompt: string;
        rubric: RubricThresholds;
        runId: string;
    });
    protected plan(input: AgentInput): Promise<ExecutionPlan>;
    protected reason(plan: ExecutionPlan, input: AgentInput): Promise<ReasoningResult>;
    /**
     * Build validation prompt
     */
    private buildValidationPrompt;
    /**
     * Parse bindings from LLM response
     */
    private parseBindings;
    /**
     * Clamp score to 0-1 range
     */
    private clampScore;
    /**
     * Fallback validation if LLM fails
     */
    private fallbackValidation;
    protected generateArtifacts(result: ReasoningResult, input: AgentInput): Promise<Array<{
        type: string;
        content: unknown;
    }>>;
}
export { Validator, RubricThresholds };
//# sourceMappingURL=validator-hub.d.ts.map