/**
 * refine.fusion
 *
 * Synthesizes multiple answers into a canonical answer.
 *
 * Features:
 * - Multi-answer synthesis with evidence tracking
 * - Conflict detection and resolution
 * - Consensus confidence scoring
 * - Knowledge Frame generation (Who/What/When/Where/Why/How)
 * - Lineage tracking (which answers contributed)
 */
import { Tool, ToolInput, ToolOutput, ToolMetadata } from '../../types';
export declare class FusionTool implements Tool {
    readonly metadata: ToolMetadata;
    execute(input: ToolInput): Promise<ToolOutput>;
    /**
     * Detect conflicts between answers
     */
    private detectConflicts;
    /**
     * Synthesize canonical answer from multiple answers
     */
    private synthesizeAnswer;
    /**
     * Generate Knowledge Frame (Who/What/When/Where/Why/How)
     */
    private generateKnowledgeFrame;
    /**
     * Calculate consensus confidence
     */
    private calculateConsensusConfidence;
    /**
     * Empty knowledge frame
     */
    private emptyKnowledgeFrame;
}
export interface KnowledgeFrame {
    who: string;
    what: string;
    when: string;
    where: string;
    why: string;
    how: string;
    metrics: string[];
    caveats: string[];
    exceptions: string[];
}
export declare function createFusionTool(): Tool;
//# sourceMappingURL=fusion.d.ts.map