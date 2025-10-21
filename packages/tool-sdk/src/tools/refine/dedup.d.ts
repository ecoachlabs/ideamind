/**
 * refine.dedup
 *
 * Detects and handles duplicate questions/answers using content hashing.
 *
 * Features:
 * - SHA-256 content hashing
 * - Exact duplicate detection
 * - Near-duplicate detection (fuzzy matching)
 * - Supersedes edge creation
 * - Duplicate merging
 */
import { Tool, ToolInput, ToolOutput, ToolMetadata } from '../../types';
import { Pool } from 'pg';
export declare class DedupTool implements Tool {
    readonly metadata: ToolMetadata;
    private db;
    constructor(dbPool: Pool);
    execute(input: ToolInput): Promise<ToolOutput>;
    /**
     * Generate SHA-256 content hash
     */
    private generateContentHash;
    /**
     * Find exact duplicate by content hash
     */
    private findExactDuplicate;
    /**
     * Find near-duplicate using fuzzy text matching
     */
    private findNearDuplicate;
    /**
     * Fallback fuzzy matching (without pg_trgm)
     */
    private fallbackFuzzyMatch;
    /**
     * Calculate text similarity (Jaccard index)
     */
    private calculateSimilarity;
    /**
     * Tokenize text into words
     */
    private tokenize;
}
/**
 * Handles duplicate entities by creating supersedes edges
 */
export declare class DedupHandler {
    private db;
    constructor(dbPool: Pool);
    /**
     * Mark entity as duplicate and create supersedes edge
     */
    markAsDuplicate(duplicateId: string, originalId: string, entityType: 'question' | 'answer'): Promise<void>;
}
export declare function createDedupTool(dbPool: Pool): Tool;
export declare function createDedupHandler(dbPool: Pool): DedupHandler;
//# sourceMappingURL=dedup.d.ts.map