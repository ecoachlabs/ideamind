/**
 * LLM Factory
 *
 * Creates the appropriate LLM provider based on configuration.
 * Supports phase-specific provider selection.
 */
import { ILLMProvider, LLMProviderConfig } from './llm-provider';
/**
 * Phase-specific LLM configuration
 */
export interface PhaseLLMConfig {
    phase: string;
    agentType: 'question-agent' | 'answer-agent' | 'validator';
    provider: LLMProviderConfig;
}
/**
 * LLM Factory - creates provider instances
 */
export declare class LLMFactory {
    private static phaseConfigs;
    private static defaultConfig;
    /**
     * Load phase-specific LLM configurations
     */
    static loadConfigurations(configs: PhaseLLMConfig[]): void;
    /**
     * Set default LLM configuration (fallback)
     */
    static setDefaultConfig(config: LLMProviderConfig): void;
    /**
     * Create LLM provider for a specific phase and agent type
     */
    static createProvider(phase: string, agentType: 'question-agent' | 'answer-agent' | 'validator'): ILLMProvider;
    /**
     * Create provider from configuration
     */
    static createProviderFromConfig(config: LLMProviderConfig): ILLMProvider;
    /**
     * Get configuration for a phase
     */
    static getConfig(phase: string, agentType: 'question-agent' | 'answer-agent' | 'validator'): LLMProviderConfig;
    /**
     * Check if a provider is available
     */
    static checkProviderAvailability(provider: 'openai' | 'anthropic' | 'google'): Promise<boolean>;
    /**
     * List all configured phases
     */
    static listPhaseConfigs(): Array<{
        phase: string;
        agentType: string;
        provider: string;
        model: string;
    }>;
}
//# sourceMappingURL=llm-factory.d.ts.map