/**
 * guard.contradictionScan
 *
 * Detects contradictions between a new answer and existing Knowledge Map entries.
 *
 * Features:
 * - Queries existing accepted Q/A pairs from Knowledge Map
 * - Detects logical contradictions (e.g., conflicting values, opposite claims)
 * - Returns consistency score (0.0 = conflict detected, 1.0 = no conflicts)
 * - Provides conflict details for remediation
 */
import { Tool, ToolInput, ToolOutput, ToolMetadata } from '../../types';
export declare class ContradictionScanTool implements Tool {
    readonly metadata: ToolMetadata;
    private llm?;
    constructor(phase?: string);
    execute(input: ToolInput): Promise<ToolOutput>;
    /**
     * Query Knowledge Map for related Q/A pairs
     */
    private queryRelatedKnowledge;
    /**
     * Detect contradictions using LLM (semantic analysis)
     */
    private detectContradictionsWithLLM;
    /**
     * Build prompt for LLM contradiction detection
     */
    private buildContradictionPrompt;
    /**
     * Parse LLM response for contradictions
     */
    private parseContradictionResponse;
    /**
     * Rule-based contradiction detection (fallback)
     * Detects simple numeric value mismatches
     */
    private detectContradictionsRuleBased;
    /**
     * Extract numeric values from text
     */
    private extractNumbers;
    /**
     * Calculate Jaccard similarity between two strings
     */
    private calculateSimilarity;
    /**
     * Detect if numeric values conflict
     */
    private detectNumericConflict;
}
export declare function createContradictionScanTool(phase?: string): Tool;
//# sourceMappingURL=contradiction-scan.d.ts.map