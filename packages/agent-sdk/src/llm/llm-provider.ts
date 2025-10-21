/**
 * LLM Provider Abstraction
 *
 * Unified interface for different LLM providers (OpenAI, Anthropic, Gemini).
 * Allows easy switching between providers per phase without affecting functionality.
 */

/**
 * LLM Request configuration
 */
export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

/**
 * LLM Response
 */
export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  costUsd: number;
  finishReason: 'complete' | 'length' | 'stop' | 'error';
}

/**
 * LLM Provider interface - all providers must implement this
 */
export interface ILLMProvider {
  /**
   * Provider name (openai, anthropic, google)
   */
  readonly providerName: string;

  /**
   * Model identifier (e.g., gpt-4, claude-3-5-sonnet-20241022, gemini-pro)
   */
  readonly modelName: string;

  /**
   * Invoke the LLM with a request
   */
  invoke(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Check if provider is available (API key set, etc.)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get provider-specific pricing info
   */
  getPricing(): {
    inputCostPerMillion: number;
    outputCostPerMillion: number;
  };
}

/**
 * LLM Provider configuration
 */
export interface LLMProviderConfig {
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  apiKey?: string; // Optional override, otherwise uses env var
}
