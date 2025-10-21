/**
 * Google LLM Provider (Gemini)
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ILLMProvider, LLMRequest, LLMResponse, LLMProviderConfig } from './llm-provider';

export class GoogleProvider implements ILLMProvider {
  readonly providerName = 'google';
  readonly modelName: string;
  private client: ChatGoogleGenerativeAI;
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.modelName = config.model;

    this.client = new ChatGoogleGenerativeAI({
      modelName: config.model,
      temperature: config.temperature,
      maxOutputTokens: config.maxTokens,
      topP: config.topP,
      apiKey: config.apiKey || process.env.GOOGLE_API_KEY,
    });
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    try {
      const prompt = request.systemPrompt
        ? `${request.systemPrompt}\n\n${request.prompt}`
        : request.prompt;

      const response = await this.client.invoke(prompt);
      const content = response.content.toString();

      // Estimate token usage (Gemini API may not always return exact counts)
      const inputTokens = this.estimateTokens(prompt);
      const outputTokens = this.estimateTokens(content);
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
      };
    } catch (error) {
      console.error('[GoogleProvider] Invocation failed:', error);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = this.config.apiKey || process.env.GOOGLE_API_KEY;
    return !!apiKey;
  }

  getPricing(): { inputCostPerMillion: number; outputCostPerMillion: number } {
    // Pricing as of Jan 2025 (update as needed)
    const pricingMap: Record<string, { input: number; output: number }> = {
      'gemini-2.0-flash-exp': { input: 0.0, output: 0.0 }, // Free tier
      'gemini-1.5-pro': { input: 1.25, output: 5.0 },
      'gemini-1.5-flash': { input: 0.075, output: 0.3 },
      'gemini-1.0-pro': { input: 0.5, output: 1.5 },
    };

    const pricing = pricingMap[this.modelName] || { input: 1.25, output: 5.0 }; // Default to Pro

    return {
      inputCostPerMillion: pricing.input,
      outputCostPerMillion: pricing.output,
    };
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 1 token per 4 characters for Gemini
    return Math.ceil(text.length / 4);
  }
}
