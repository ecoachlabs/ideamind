/**
 * Anthropic LLM Provider (Claude)
 */
import { ILLMProvider, LLMRequest, LLMResponse, LLMProviderConfig } from './llm-provider';
export declare class AnthropicProvider implements ILLMProvider {
    readonly providerName = "anthropic";
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
     * CRITICAL FIX #7: Retry logic helper
     */
    private isRetryableError;
    /**
     * Sanitize error to prevent API key exposure
     * MEDIUM FIX: Error sanitization
     */
    private sanitizeError;
    /**
     * Enrich error with attempt information
     * CRITICAL FIX #7: Retry logic helper
     */
    private enrichError;
    /**
     * Sleep helper for retry delays
     * CRITICAL FIX #7: Retry logic helper
     */
    private sleep;
}
//# sourceMappingURL=anthropic-provider.d.ts.map