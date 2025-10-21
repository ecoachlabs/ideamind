/**
 * Anthropic LLM Provider (Claude)
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { ILLMProvider, LLMRequest, LLMResponse, LLMProviderConfig } from './llm-provider';

export class AnthropicProvider implements ILLMProvider {
  readonly providerName = 'anthropic';
  readonly modelName: string;
  private client: ChatAnthropic;
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.modelName = config.model;

    // HIGH PRIORITY FIX #12: API key validation
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Anthropic API key required. Set ANTHROPIC_API_KEY environment variable or provide in config.'
      );
    }

    // Basic format validation
    if (!apiKey.startsWith('sk-ant-')) {
      throw new Error(
        'Invalid Anthropic API key format. Key should start with "sk-ant-"'
      );
    }

    this.client = new ChatAnthropic({
      modelName: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      anthropicApiKey: apiKey,
    });
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    // CRITICAL FIX #7: Retry logic with exponential backoff
    const maxRetries = 3;
    const retryDelays = [1000, 2000, 4000]; // Exponential backoff
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const prompt = request.systemPrompt
          ? `${request.systemPrompt}\n\n${request.prompt}`
          : request.prompt;

        const startTime = Date.now();
        const response = await this.client.invoke(prompt);
        const latencyMs = Date.now() - startTime;

        const content = response.content.toString();

        // HIGH PRIORITY FIX #13: Prefer actual token counts if available
        const inputTokens = (response as any).usage?.input_tokens ??
                           this.estimateTokens(prompt);
        const outputTokens = (response as any).usage?.output_tokens ??
                            this.estimateTokens(content);
        const totalTokens = inputTokens + outputTokens;

        const pricing = this.getPricing();
        const costUsd =
          (inputTokens / 1_000_000) * pricing.inputCostPerMillion +
          (outputTokens / 1_000_000) * pricing.outputCostPerMillion;

        return {
          content,
          model: this.modelName,
          provider: this.providerName,
          tokensUsed: {
            input: inputTokens,
            output: outputTokens,
            total: totalTokens,
          },
          costUsd,
          finishReason: 'complete',
          metadata: {
            attempt: attempt + 1,
            latencyMs,
          },
        };
      } catch (error) {
        lastError = error as Error;
        const isRetryable = this.isRetryableError(error);

        // MEDIUM FIX: Sanitize error before logging (no API key exposure)
        const sanitizedError = this.sanitizeError(error);
        console.error(
          `[AnthropicProvider] Invocation failed (attempt ${attempt + 1}/${maxRetries}):`,
          sanitizedError
        );

        // Don't retry non-retryable errors (validation, auth, etc.)
        if (!isRetryable) {
          throw this.enrichError(error, attempt + 1);
        }

        // Retry with exponential backoff
        if (attempt < maxRetries - 1) {
          await this.sleep(retryDelays[attempt]);
        }
      }
    }

    // All retries exhausted
    throw new Error(
      `LLM invocation failed after ${maxRetries} attempts. Last error: ${lastError?.message}`
    );
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
    return !!apiKey;
  }

  getPricing(): { inputCostPerMillion: number; outputCostPerMillion: number } {
    // Pricing as of Jan 2025 (update as needed)
    const pricingMap: Record<string, { input: number; output: number }> = {
      'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
      'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
      'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
      'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
    };

    const pricing = pricingMap[this.modelName] || { input: 3.0, output: 15.0 }; // Default to Sonnet

    return {
      inputCostPerMillion: pricing.input,
      outputCostPerMillion: pricing.output,
    };
  }

  private estimateTokens(text: string): number {
    // HIGH PRIORITY FIX #13: More accurate estimation
    // Average: 1 token ≈ 3.5 characters for English text
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Check if error is retryable
   * CRITICAL FIX #7: Retry logic helper
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();

    // Retry on rate limits, timeouts, 5xx errors
    const retryablePatterns = [
      'rate limit',
      'timeout',
      'ECONNRESET',
      'ETIMEDOUT',
      '500',
      '502',
      '503',
      '504',
      'overloaded',
    ];

    return retryablePatterns.some(pattern =>
      message.includes(pattern.toLowerCase())
    );
  }

  /**
   * Sanitize error to prevent API key exposure
   * MEDIUM FIX: Error sanitization
   */
  private sanitizeError(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'Unknown error';
    }

    // Remove any potential API keys from error messages
    let message = error.message;

    // Redact sk-ant-* patterns (Anthropic API keys)
    message = message.replace(/sk-ant-[a-zA-Z0-9_-]{95,}/g, 'sk-ant-***REDACTED***');

    // Remove stack traces in production
    if (process.env.NODE_ENV === 'production') {
      return message.split('\n')[0]; // First line only
    }

    return message;
  }

  /**
   * Enrich error with attempt information
   * CRITICAL FIX #7: Retry logic helper
   */
  private enrichError(error: unknown, attempt: number): Error {
    if (error instanceof Error) {
      error.message = `[Attempt ${attempt}] ${error.message}`;
    }
    return error as Error;
  }

  /**
   * Sleep helper for retry delays
   * CRITICAL FIX #7: Retry logic helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
