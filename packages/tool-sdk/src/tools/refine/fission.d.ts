/**
 * refine.fission
 *
 * Decomposes compound questions into atomic units with dependency tree.
 *
 * Features:
 * - Detects compound vs atomic questions
 * - Decomposes into atomic questions with dependencies
 * - Builds fission tree (DAG structure)
 * - Calculates coverage metrics
 * - Idempotent (checks content_hash)
 */
import { Tool, ToolInput, ToolOutput, ToolMetadata } from '../../types';
export declare class FissionTool implements Tool {
    readonly metadata: ToolMetadata;
    execute(input: ToolInput): Promise<ToolOutput>;
    /**
     * Detect if question is atomic (single, focused question)
     */
    private detectIfAtomic;
    /**
     * Decompose compound question into atomic units
     */
    private decompose;
    /**
     * Calculate coverage metric: how well atoms cover original question
     */
    private calculateCoverage;
    /**
     * Extract key terms from question (nouns, verbs, important concepts)
     */
    private extractKeyTerms;
}
export interface FissionTree {
    id: string;
    rootQuestionId: string;
    atoms: AtomicQuestion[];
    edges: FissionEdge[];
    rationale?: string;
}
interface AtomicQuestion {
    id: string;
    type: 'factual' | 'analytical' | 'exploratory';
    text: string;
    priority: 'high' | 'medium' | 'low';
}
interface FissionEdge {
    from: string;
    to: string;
    relation: 'depends_on' | 'refines' | 'derived_from';
    description?: string;
}
export declare function createFissionTool(): Tool;
export {};
//# sourceMappingURL=fission.d.ts.map