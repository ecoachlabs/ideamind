/**
 * LLM Configuration Loader
 *
 * Loads phase-specific LLM provider configurations from JSON file.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LLMFactory, PhaseLLMConfig } from './llm-factory';
import { LLMProviderConfig } from './llm-provider';

interface LLMConfigFile {
  defaultProvider: LLMProviderConfig;
  phaseConfigs: PhaseLLMConfig[];
  notes?: Record<string, any>;
}

export class LLMConfigLoader {
  /**
   * Load configuration from JSON file
   */
  static loadFromFile(configPath?: string): void {
    const defaultPath = path.join(process.cwd(), 'config', 'llm-providers.json');
    const filePath = configPath || process.env.LLM_CONFIG_PATH || defaultPath;

    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`[LLMConfigLoader] Config file not found at ${filePath}, using defaults`);
        this.loadDefaults();
        return;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const config: LLMConfigFile = JSON.parse(fileContent);

      // Set default provider
      if (config.defaultProvider) {
        LLMFactory.setDefaultConfig(config.defaultProvider);
      }

      // Load phase-specific configs
      if (config.phaseConfigs && config.phaseConfigs.length > 0) {
        LLMFactory.loadConfigurations(config.phaseConfigs);
        console.log(`[LLMConfigLoader] Loaded ${config.phaseConfigs.length} phase configurations from ${filePath}`);
      } else {
        console.warn(`[LLMConfigLoader] No phase configurations found in ${filePath}`);
      }
    } catch (error) {
      console.error(`[LLMConfigLoader] Failed to load config from ${filePath}:`, error);
      this.loadDefaults();
    }
  }

  /**
   * Load default configurations (fallback)
   */
  private static loadDefaults(): void {
    const defaultConfig: LLMProviderConfig = {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.7,
      maxTokens: 4096,
    };

    LLMFactory.setDefaultConfig(defaultConfig);
    console.log('[LLMConfigLoader] Using default Anthropic configuration');
  }

  /**
   * Load from environment variables (for containerized deployments)
   */
  static loadFromEnv(): void {
    const configs: PhaseLLMConfig[] = [];

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

    const agentTypes: Array<'question-agent' | 'answer-agent' | 'validator'> = [
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

            const providerConfig: LLMProviderConfig = {
              provider: provider as 'openai' | 'anthropic' | 'google',
              model: model,
              temperature: parseFloat(temperature || '0.7'),
              maxTokens: parseInt(maxTokens || '4096'),
            };

            configs.push({
              phase,
              agentType,
              provider: providerConfig,
            });
          } catch (error) {
            console.warn(`[LLMConfigLoader] Invalid format for ${envKey}: ${envValue}`);
          }
        }
      });
    });

    if (configs.length > 0) {
      LLMFactory.loadConfigurations(configs);
      console.log(`[LLMConfigLoader] Loaded ${configs.length} configurations from environment variables`);
    } else {
      console.log('[LLMConfigLoader] No environment variable configurations found');
    }
  }

  /**
   * Validate configuration
   */
  static async validateConfig(): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if at least one provider is available
    const providers: Array<'openai' | 'anthropic' | 'google'> = ['openai', 'anthropic', 'google'];
    const availableProviders: string[] = [];

    for (const provider of providers) {
      const isAvailable = await LLMFactory.checkProviderAvailability(provider);
      if (isAvailable) {
        availableProviders.push(provider);
      } else {
        warnings.push(`Provider ${provider} is not available (missing API key)`);
      }
    }

    if (availableProviders.length === 0) {
      errors.push('No LLM providers are available. Set at least one API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY)');
    }

    // Check if all configured phases use available providers
    const phaseConfigs = LLMFactory.listPhaseConfigs();
    phaseConfigs.forEach((config) => {
      if (!availableProviders.includes(config.provider)) {
        warnings.push(
          `Phase ${config.phase} ${config.agentType} is configured to use ${config.provider}, but this provider is not available`
        );
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
  static printSummary(): void {
    console.log('\n=== LLM Provider Configuration ===');
    const configs = LLMFactory.listPhaseConfigs();

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
    }, {} as Record<string, typeof configs>);

    Object.entries(grouped).forEach(([phase, phaseConfigs]) => {
      console.log(`\n${phase}:`);
      phaseConfigs.forEach((config) => {
        console.log(`  ${config.agentType}: ${config.provider}/${config.model}`);
      });
    });

    console.log('\n===================================\n');
  }
}
