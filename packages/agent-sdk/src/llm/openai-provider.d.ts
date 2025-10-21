/**
 * OpenAI LLM Provider (GPT-4, GPT-3.5)
 */
import { ILLMProvider, LLMRequest, LLMResponse, LLMProviderConfig } from './llm-provider';
export declare class OpenAIProvider implements ILLMProvider {
    readonly providerName = "openai";
    readonly modelName: string;
    private client;
    private config;
    constructor(config: LLMProviderConfig);
    invoke(request: LLMRequest): Promise<LLMResponse>;
    isAvailable(): Promise<boolean>;
    getPricing(): {
        inputCostPerMillion: number;
        outputCostPerMillion: number;
    };
    private estimateTokens;
    /**
     * Check if error is retryable
     * CRITICAL FIX: Retry logic helper
     */
    private isRetryableError;
    /**
     * Sanitize error to prevent API key exposure
     * MEDIUM FIX: Error sanitization
     */
    private sanitizeError;
    /**
     * Enrich error with attempt information
     * CRITICAL FIX: Retry logic helper
     */
    private enrichError;
    /**
     * Sleep helper for retry delays
     * CRITICAL FIX: Retry logic helper
     */
    private sleep;
}
//# sourceMappingURL=openai-provider.d.ts.map