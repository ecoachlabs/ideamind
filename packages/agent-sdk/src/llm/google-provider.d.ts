/**
 * Google LLM Provider (Gemini)
 */
import { ILLMProvider, LLMRequest, LLMResponse, LLMProviderConfig } from './llm-provider';
export declare class GoogleProvider implements ILLMProvider {
    readonly providerName = "google";
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
}
//# sourceMappingURL=google-provider.d.ts.map