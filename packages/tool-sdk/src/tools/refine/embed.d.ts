/**
 * refine.embed
 *
 * Generates vector embeddings for questions and answers.
 *
 * Features:
 * - OpenAI text-embedding-3-small (1536 dims, $0.02/1M tokens)
 * - Cohere embed-english-v3.0 (1024 dims, $0.10/1M tokens)
 * - Batch processing support
 * - Idempotent (checks content_hash)
 */
import { Tool, ToolInput, ToolOutput, ToolMetadata } from '../../types';
export declare class EmbedTool implements Tool {
    readonly metadata: ToolMetadata;
    private embeddings;
    execute(input: ToolInput): Promise<ToolOutput>;
    /**
     * Get or create embedding model instance
     */
    private getEmbeddingModel;
    /**
     * Get model configuration
     */
    private getModelConfig;
    /**
     * Get model info for metadata
     */
    private getModelInfo;
    /**
     * Calculate embedding cost
     */
    private calculateCost;
    /**
     * Generate SHA-256 content hash
     */
    private generateContentHash;
}
/**
 * Batch version for efficient bulk embedding
 */
export declare class BatchEmbedTool implements Tool {
    readonly metadata: ToolMetadata;
    private embedTool;
    execute(input: ToolInput): Promise<ToolOutput>;
}
export declare function createEmbedTool(): Tool;
export declare function createBatchEmbedTool(): Tool;
//# sourceMappingURL=embed.d.ts.map