"use strict";
/**
 * OpenAI LLM Provider (GPT-4, GPT-3.5)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
const openai_1 = require("@langchain/openai");
class OpenAIProvider {
    providerName = 'openai';
    modelName;
    client;
    config;
    constructor(config) {
        this.config = config;
        this.modelName = config.model;
        // CRITICAL FIX: API key validation
        const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OpenAI API key required. Set OPENAI_API_KEY environment variable or provide in config.');
        }
        // Basic format validation
        if (!apiKey.startsWith('sk-')) {
            throw new Error('Invalid OpenAI API key format. Key should start with "sk-"');
        }
        this.client = new openai_1.ChatOpenAI({
            modelName: config.model,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            topP: config.topP,
            openAIApiKey: apiKey,
            timeout: config.timeout || 60000, // MEDIUM FIX: Add timeout
        });
    }
    async invoke(request) {
        // CRITICAL FIX: Retry logic with exponential backoff
        const maxRetries = 3;
        const retryDelays = [1000, 2000, 4000]; // Exponential backoff
        let lastError;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const messages = [];
                if (request.systemPrompt) {
                    messages.push({
                        role: 'system',
                        content: request.systemPrompt,
                    });
                }
                messages.push({
                    role: 'user',
                    content: request.prompt,
                });
                const startTime = Date.now();
                const response = await this.client.invoke(messages);
                const latencyMs = Date.now() - startTime;
                const content = response.content.toString();
                // OpenAI provides token usage in response - prefer actual counts
                const inputTokens = response.response_metadata?.tokenUsage?.promptTokens || this.estimateTokens(request.prompt);
                const outputTokens = response.response_metadata?.tokenUsage?.completionTokens || this.estimateTokens(content);
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
                    metadata: {
                        attempt: attempt + 1,
                        latencyMs,
                    },
                };
            }
            catch (error) {
                lastError = error;
                const isRetryable = this.isRetryableError(error);
                // MEDIUM FIX: Sanitize error before logging (no API key exposure)
                const sanitizedError = this.sanitizeError(error);
                console.error(`[OpenAIProvider] Invocation failed (attempt ${attempt + 1}/${maxRetries}):`, sanitizedError);
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
        throw new Error(`LLM invocation failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
    }
    async isAvailable() {
        const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
        return !!apiKey;
    }
    getPricing() {
        // Pricing as of Jan 2025 (update as needed)
        const pricingMap = {
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
    estimateTokens(text) {
        // More accurate estimate: 1 token ≈ 3.5 characters for English text
        return Math.ceil(text.length / 3.5);
    }
    /**
     * Check if error is retryable
     * CRITICAL FIX: Retry logic helper
     */
    isRetryableError(error) {
        if (!(error instanceof Error))
            return false;
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
        return retryablePatterns.some(pattern => message.includes(pattern.toLowerCase()));
    }
    /**
     * Sanitize error to prevent API key exposure
     * MEDIUM FIX: Error sanitization
     */
    sanitizeError(error) {
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
    enrichError(error, attempt) {
        if (error instanceof Error) {
            error.message = `[Attempt ${attempt}] ${error.message}`;
        }
        return error;
    }
    /**
     * Sleep helper for retry delays
     * CRITICAL FIX: Retry logic helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.OpenAIProvider = OpenAIProvider;
//# sourceMappingURL=openai-provider.js.map