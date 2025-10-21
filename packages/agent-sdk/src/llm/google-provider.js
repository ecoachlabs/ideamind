"use strict";
/**
 * Google LLM Provider (Gemini)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleProvider = void 0;
const google_genai_1 = require("@langchain/google-genai");
class GoogleProvider {
    providerName = 'google';
    modelName;
    client;
    config;
    constructor(config) {
        this.config = config;
        this.modelName = config.model;
        this.client = new google_genai_1.ChatGoogleGenerativeAI({
            modelName: config.model,
            temperature: config.temperature,
            maxOutputTokens: config.maxTokens,
            topP: config.topP,
            apiKey: config.apiKey || process.env.GOOGLE_API_KEY,
        });
    }
    async invoke(request) {
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
            const costUsd = (inputTokens / 1_000_000) * pricing.inputCostPerMillion +
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
        }
        catch (error) {
            console.error('[GoogleProvider] Invocation failed:', error);
            throw error;
        }
    }
    async isAvailable() {
        const apiKey = this.config.apiKey || process.env.GOOGLE_API_KEY;
        return !!apiKey;
    }
    getPricing() {
        // Pricing as of Jan 2025 (update as needed)
        const pricingMap = {
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
    estimateTokens(text) {
        // Rough estimate: 1 token per 4 characters for Gemini
        return Math.ceil(text.length / 4);
    }
}
exports.GoogleProvider = GoogleProvider;
//# sourceMappingURL=google-provider.js.map