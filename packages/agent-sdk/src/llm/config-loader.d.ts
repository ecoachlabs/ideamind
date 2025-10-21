/**
 * LLM Configuration Loader
 *
 * Loads phase-specific LLM provider configurations from JSON file.
 */
export declare class LLMConfigLoader {
    /**
     * Load configuration from JSON file
     */
    static loadFromFile(configPath?: string): void;
    /**
     * Load default configurations (fallback)
     */
    private static loadDefaults;
    /**
     * Load from environment variables (for containerized deployments)
     */
    static loadFromEnv(): void;
    /**
     * Validate configuration
     */
    static validateConfig(): Promise<{
        valid: boolean;
        errors: string[];
        warnings: string[];
    }>;
    /**
     * Print configuration summary
     */
    static printSummary(): void;
}
//# sourceMappingURL=config-loader.d.ts.map