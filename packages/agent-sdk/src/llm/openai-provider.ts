/**
 * OpenAI LLM Provider (GPT-4, GPT-3.5)
 */

import { ChatOpenAI } from '@langchain/openai';
import { ILLMProvider, LLMRequest, LLMResponse, LLMProviderConfig } from './llm-provider';

export class OpenAIProvider implements ILLMProvider {
  readonly providerName = 'openai';
  readonly modelName: string;
  private client: ChatOpenAI;
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.modelName = config.model;

    // CRITICAL FIX: API key validation
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'OpenAI API key required. Set OPENAI_API_KEY environment variable or provide in config.'
      );
    }

    // Basic format validation
    if (!apiKey.startsWith('sk-')) {
      throw new Error(
        'Invalid OpenAI API key format. Key should start with "sk-"'
      );
    }

    this.client = new ChatOpenAI({
      modelName: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      openAIApiKey: apiKey,
      timeout: config.timeout || 60000, // MEDIUM FIX: Add timeout
    });
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    // CRITICAL FIX: Retry logic with exponential backoff
    const maxRetries = 3;
    const retryDelays = [1000, 2000, 4000]; // Exponential backoff
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const messages = [];

        if (request.systemPrompt) {
          messages.push({
            role: 'system' as const,
            content: request.systemPrompt,
          });
        }

        messages.push({
          role: 'user' as const,
          content: request.prompt,
        });

        const startTime = Date.now();
        const response = await this.client.invoke(messages as any);
        const latencyMs = Date.now() - startTime;

        const content = response.content.toString();

        // OpenAI provides token usage in response - prefer actual counts
        const inputTokens = (response as any).response_metadata?.tokenUsage?.promptTokens || this.estimateTokens(request.prompt);
        const outputTokens = (response as any).response_metadata?.tokenUsage?.completionTokens || this.estimateTokens(content);
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
          `[OpenAIProvider] Invocation failed (attempt ${attempt + 1}/${maxRetries}):`,
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
    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
    return !!apiKey;
  }

  getPricing(): { inputCostPerMillion: number; outputCostPerMillion: number } {
    // Pricing as of Jan 2025 (update as needed)
    const pricingMap: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 2.5, output: 10.0 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
      'gpt-4-turbo': { input: 10.0, output: 30.0 },
      'gpt-4': { input: 30.0, output: 60.0 },
      'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
      'o1-preview': { input: 15.0, output: 60.0 },
      'o1-mini': { input: 3.0, output: 12.0 },
    };

    const pricing = pricingMap[this.modelName] || { input: 2.5, output: 10.0 }; // Default to gpt-4o

    return {
      inputCostPerMillion: pricing.input,
      outputCostPerMillion: pricing.output,
    };
  }

  private estimateTokens(text: string): number {
    // More accurate estimate: 1 token ≈ 3.5 characters for English text
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Check if error is retryable
   * CRITICAL FIX: Retry logic helper
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

    // Redact sk-* patterns (OpenAI API keys)
    message = message.replace(/sk-[a-zA-Z0-9]{32,}/g, 'sk-***REDACTED***');

    // Remove stack traces in production
    if (process.env.NODE_ENV === 'production') {
      return message.split('\n')[0]; // First line only
    }

    return message;
  }

  /**
   * Enrich error with attempt information
   * CRITICAL FIX: Retry logic helper
   */
  private enrichError(error: unknown, attempt: number): Error {
    if (error instanceof Error) {
      error.message = `[Attempt ${attempt}] ${error.message}`;
    }
    return error as Error;
  }

  /**
   * Sleep helper for retry delays
   * CRITICAL FIX: Retry logic helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
