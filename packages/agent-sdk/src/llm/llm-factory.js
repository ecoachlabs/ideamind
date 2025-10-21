"use strict";
/**
 * LLM Factory
 *
 * Creates the appropriate LLM provider based on configuration.
 * Supports phase-specific provider selection.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMFactory = void 0;
const anthropic_provider_1 = require("./anthropic-provider");
const openai_provider_1 = require("./openai-provider");
const google_provider_1 = require("./google-provider");
/**
 * LLM Factory - creates provider instances
 */
class LLMFactory {
    static phaseConfigs = new Map();
    static defaultConfig = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 4096,
    };
    /**
     * Load phase-specific LLM configurations
     */
    static loadConfigurations(configs) {
        this.phaseConfigs.clear();
        configs.forEach((config) => {
            const key = `${config.phase}:${config.agentType}`;
            this.phaseConfigs.set(key, config);
        });
    }
    /**
     * Set default LLM configuration (fallback)
     */
    static setDefaultConfig(config) {
        this.defaultConfig = config;
    }
    /**
     * Create LLM provider for a specific phase and agent type
     */
    static createProvider(phase, agentType) {
        const key = `${phase.toUpperCase()}:${agentType}`;
        const phaseConfig = this.phaseConfigs.get(key);
        const providerConfig = phaseConfig?.provider || this.defaultConfig;
        return this.createProviderFromConfig(providerConfig);
    }
    /**
     * Create provider from configuration
     */
    static createProviderFromConfig(config) {
        switch (config.provider) {
            case 'anthropic':
                return new anthropic_provider_1.AnthropicProvider(config);
            case 'openai':
                return new openai_provider_1.OpenAIProvider(config);
            case 'google':
                return new google_provider_1.GoogleProvider(config);
            default:
                throw new Error(`Unknown LLM provider: ${config.provider}`);
        }
    }
    /**
     * Get configuration for a phase
     */
    static getConfig(phase, agentType) {
        const key = `${phase.toUpperCase()}:${agentType}`;
        const phaseConfig = this.phaseConfigs.get(key);
        return phaseConfig?.provider || this.defaultConfig;
    }
    /**
     * Check if a provider is available
     */
    static async checkProviderAvailability(provider) {
        const testConfig = {
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
    static listPhaseConfigs() {
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
exports.LLMFactory = LLMFactory;
//# sourceMappingURL=llm-factory.js.map