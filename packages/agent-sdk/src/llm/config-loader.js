"use strict";
/**
 * LLM Configuration Loader
 *
 * Loads phase-specific LLM provider configurations from JSON file.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMConfigLoader = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const llm_factory_1 = require("./llm-factory");
class LLMConfigLoader {
    /**
     * Load configuration from JSON file
     */
    static loadFromFile(configPath) {
        const defaultPath = path.join(process.cwd(), 'config', 'llm-providers.json');
        const filePath = configPath || process.env.LLM_CONFIG_PATH || defaultPath;
        try {
            if (!fs.existsSync(filePath)) {
                console.warn(`[LLMConfigLoader] Config file not found at ${filePath}, using defaults`);
                this.loadDefaults();
                return;
            }
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const config = JSON.parse(fileContent);
            // Set default provider
            if (config.defaultProvider) {
                llm_factory_1.LLMFactory.setDefaultConfig(config.defaultProvider);
            }
            // Load phase-specific configs
            if (config.phaseConfigs && config.phaseConfigs.length > 0) {
                llm_factory_1.LLMFactory.loadConfigurations(config.phaseConfigs);
                console.log(`[LLMConfigLoader] Loaded ${config.phaseConfigs.length} phase configurations from ${filePath}`);
            }
            else {
                console.warn(`[LLMConfigLoader] No phase configurations found in ${filePath}`);
            }
        }
        catch (error) {
            console.error(`[LLMConfigLoader] Failed to load config from ${filePath}:`, error);
            this.loadDefaults();
        }
    }
    /**
     * Load default configurations (fallback)
     */
    static loadDefaults() {
        const defaultConfig = {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
            temperature: 0.7,
            maxTokens: 4096,
        };
        llm_factory_1.LLMFactory.setDefaultConfig(defaultConfig);
        console.log('[LLMConfigLoader] Using default Anthropic configuration');
    }
    /**
     * Load from environment variables (for containerized deployments)
     */
    static loadFromEnv() {
        const configs = [];
        // Example env var format:
        // LLM_PRD_QUESTION=openai:gpt-4o:0.7:4096
        // LLM_PRD_ANSWER=anthropic:claude-3-5-sonnet-20241022:0.5:8192
        // LLM_PRD_VALIDATOR=anthropic:claude-3-5-haiku-20241022:0.3:4096
        const phases = [
            'INTAKE',
            'IDEATION',
            'CRITIQUE',
            'PRD',
            'BIZDEV',
            'ARCH',
            'BUILD',
            'CODING',
            'QA',
            'AESTHETIC',
            'RELEASE',
            'BETA',
        ];
        const agentTypes = [
            'question-agent',
            'answer-agent',
            'validator',
        ];
        phases.forEach((phase) => {
            agentTypes.forEach((agentType) => {
                const envKey = `LLM_${phase}_${agentType.toUpperCase().replace('-', '_')}`;
                const envValue = process.env[envKey];
                if (envValue) {
                    try {
                        const [provider, model, temperature, maxTokens] = envValue.split(':');
                        const providerConfig = {
                            provider: provider,
                            model: model,
                            temperature: parseFloat(temperature || '0.7'),
                            maxTokens: parseInt(maxTokens || '4096'),
                        };
                        configs.push({
                            phase,
                            agentType,
                            provider: providerConfig,
                        });
                    }
                    catch (error) {
                        console.warn(`[LLMConfigLoader] Invalid format for ${envKey}: ${envValue}`);
                    }
                }
            });
        });
        if (configs.length > 0) {
            llm_factory_1.LLMFactory.loadConfigurations(configs);
            console.log(`[LLMConfigLoader] Loaded ${configs.length} configurations from environment variables`);
        }
        else {
            console.log('[LLMConfigLoader] No environment variable configurations found');
        }
    }
    /**
     * Validate configuration
     */
    static async validateConfig() {
        const errors = [];
        const warnings = [];
        // Check if at least one provider is available
        const providers = ['openai', 'anthropic', 'google'];
        const availableProviders = [];
        for (const provider of providers) {
            const isAvailable = await llm_factory_1.LLMFactory.checkProviderAvailability(provider);
            if (isAvailable) {
                availableProviders.push(provider);
            }
            else {
                warnings.push(`Provider ${provider} is not available (missing API key)`);
            }
        }
        if (availableProviders.length === 0) {
            errors.push('No LLM providers are available. Set at least one API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY)');
        }
        // Check if all configured phases use available providers
        const phaseConfigs = llm_factory_1.LLMFactory.listPhaseConfigs();
        phaseConfigs.forEach((config) => {
            if (!availableProviders.includes(config.provider)) {
                warnings.push(`Phase ${config.phase} ${config.agentType} is configured to use ${config.provider}, but this provider is not available`);
            }
        });
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    /**
     * Print configuration summary
     */
    static printSummary() {
        console.log('\n=== LLM Provider Configuration ===');
        const configs = llm_factory_1.LLMFactory.listPhaseConfigs();
        if (configs.length === 0) {
            console.log('No phase-specific configurations loaded. Using defaults.');
            return;
        }
        const grouped = configs.reduce((acc, config) => {
            if (!acc[config.phase]) {
                acc[config.phase] = [];
            }
            acc[config.phase].push(config);
            return {};
        }, {});
        Object.entries(grouped).forEach(([phase, phaseConfigs]) => {
            console.log(`\n${phase}:`);
            phaseConfigs.forEach((config) => {
                console.log(`  ${config.agentType}: ${config.provider}/${config.model}`);
            });
        });
        console.log('\n===================================\n');
    }
}
exports.LLMConfigLoader = LLMConfigLoader;
//# sourceMappingURL=config-loader.js.map