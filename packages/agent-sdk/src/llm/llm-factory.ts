/**
 * LLM Factory
 *
 * Creates the appropriate LLM provider based on configuration.
 * Supports phase-specific provider selection.
 */

import { ILLMProvider, LLMProviderConfig } from './llm-provider';
import { AnthropicProvider } from './anthropic-provider';
import { OpenAIProvider } from './openai-provider';
import { GoogleProvider } from './google-provider';

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
export class LLMFactory {
  private static phaseConfigs: Map<string, PhaseLLMConfig> = new Map();
  private static defaultConfig: LLMProviderConfig = {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    maxTokens: 4096,
  };

  /**
   * Load phase-specific LLM configurations
   */
  static loadConfigurations(configs: PhaseLLMConfig[]): void {
    this.phaseConfigs.clear();
    configs.forEach((config) => {
      const key = `${config.phase}:${config.agentType}`;
      this.phaseConfigs.set(key, config);
    });
  }

  /**
   * Set default LLM configuration (fallback)
   */
  static setDefaultConfig(config: LLMProviderConfig): void {
    this.defaultConfig = config;
  }

  /**
   * Create LLM provider for a specific phase and agent type
   */
  static createProvider(
    phase: string,
    agentType: 'question-agent' | 'answer-agent' | 'validator'
  ): ILLMProvider {
    const key = `${phase.toUpperCase()}:${agentType}`;
    const phaseConfig = this.phaseConfigs.get(key);

    const providerConfig = phaseConfig?.provider || this.defaultConfig;

    return this.createProviderFromConfig(providerConfig);
  }

  /**
   * Create provider from configuration
   */
  static createProviderFromConfig(config: LLMProviderConfig): ILLMProvider {
    switch (config.provider) {
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'openai':
        return new OpenAIProvider(config);
      case 'google':
        return new GoogleProvider(config);
      default:
        throw new Error(`Unknown LLM provider: ${config.provider}`);
    }
  }

  /**
   * Get configuration for a phase
   */
  static getConfig(
    phase: string,
    agentType: 'question-agent' | 'answer-agent' | 'validator'
  ): LLMProviderConfig {
    const key = `${phase.toUpperCase()}:${agentType}`;
    const phaseConfig = this.phaseConfigs.get(key);
    return phaseConfig?.provider || this.defaultConfig;
  }

  /**
   * Check if a provider is available
   */
  static async checkProviderAvailability(
    provider: 'openai' | 'anthropic' | 'google'
  ): Promise<boolean> {
    const testConfig: LLMProviderConfig = {
      provider,
      model: 'test',
      temperature: 0.7,
      maxTokens: 100,
    };

    const testProvider = this.createProviderFromConfig(testConfig);
    return await testProvider.isAvailable();
  }

  /**
   * List all configured phases
   */
  static listPhaseConfigs(): Array<{ phase: string; agentType: string; provider: string; model: string }> {
    return Array.from(this.phaseConfigs.entries()).map(([key, config]) => {
      const [phase, agentType] = key.split(':');
      return {
        phase,
        agentType,
        provider: config.provider.provider,
        model: config.provider.model,
      };
    });
  }
}
