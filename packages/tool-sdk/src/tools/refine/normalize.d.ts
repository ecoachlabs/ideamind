/**
 * refine.normalize
 *
 * Canonicalizes text for idempotent Knowledge Map processing.
 *
 * Features:
 * - Text normalization (lowercase, trim, whitespace)
 * - Unit standardization (KB → bytes, ms → milliseconds)
 * - Alias resolution ("PM" → "Product Manager")
 * - Content hashing (SHA-256)
 */
import { Tool, ToolInput, ToolOutput, ToolMetadata } from '../../types';
export declare class NormalizeTool implements Tool {
    readonly metadata: ToolMetadata;
    execute(input: ToolInput): Promise<ToolOutput>;
    /**
     * Basic text normalization
     */
    private normalizeBasicText;
    /**
     * Normalize units to standard forms
     */
    private normalizeUnits;
    /**
     * Resolve common aliases to canonical forms
     */
    private resolveAliases;
    /**
     * Generate SHA-256 content hash for idempotence
     */
    private generateContentHash;
}
export declare function createNormalizeTool(): Tool;
//# sourceMappingURL=normalize.d.ts.map