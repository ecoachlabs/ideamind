/**
 * Refinery Workflow
 *
 * Orchestrates the 12-stage Knowledge Refinery pipeline:
 * 1. Normalization
 * 2. PII Redaction
 * 3. Content Hashing
 * 4. Deduplication
 * 5. Fission (question decomposition)
 * 6. Entity Linking
 * 7. Embedding Generation
 * 8. Clustering
 * 9. Fusion (answer synthesis)
 * 10. Knowledge Frame Extraction
 * 11. Version Management
 * 12. Delta Publishing
 */
import { Pool } from 'pg';
import { KnowledgeFrame } from '../tools/refine/fusion';
export declare class RefineryWorkflow {
    private db;
    private runId;
    private phase;
    private normalizeTool;
    private piiRedactor;
    private dedupTool;
    private dedupHandler;
    private fissionTool;
    private ontologyTool;
    private embedTool;
    private batchEmbedTool;
    private clusterTool;
    private fusionTool;
    private metrics;
    constructor(config: RefineryConfig);
    /**
     * Run full Refinery pipeline
     */
    refine(input: RefineryInput): Promise<RefineryOutput>;
    /**
     * Stage 1-4: Pre-processing pipeline
     */
    private preprocess;
    /**
     * Preprocess single text item
     */
    private preprocessText;
    /**
     * Stage 5: Fission (question decomposition)
     */
    private runFission;
    /**
     * Stage 6: Entity Linking
     */
    private runEntityLinking;
    /**
     * Stage 7: Embedding Generation
     */
    private runEmbedding;
    /**
     * Stage 8: Clustering
     */
    private runClustering;
    /**
     * Stage 9-10: Fusion + Knowledge Frame Extraction
     */
    private runFusion;
    /**
     * Stage 11: Version Management
     */
    private runVersionManagement;
    /**
     * Stage 12: Delta Publishing
     */
    private publishDeltas;
    /**
     * Helper: Get answers for cluster
     */
    private getAnswersForCluster;
    /**
     * Helper: Fetch evidence bindings for an answer
     */
    private fetchEvidence;
    /**
     * Helper: Store fission tree
     */
    private storeFissionTree;
    /**
     * Helper: Store embedding
     */
    private storeEmbedding;
    /**
     * Helper: Store fusion cluster
     */
    private storeFusionCluster;
    /**
     * Calculate final metrics
     */
    private calculateFinalMetrics;
    /**
     * Helper: Find existing version of canonical answer
     */
    private findExistingVersion;
    /**
     * Helper: Hash content for versioning
     */
    private hashContent;
    /**
     * Helper: Create supersedes edge in knowledge map
     */
    private createSupersedesEdge;
    /**
     * Helper: Store canonical answer with version info
     */
    private storeCanonicalAnswer;
    /**
     * Helper: Publish event to message bus
     */
    private publishEvent;
}
export interface RefineryConfig {
    dbPool: Pool;
    runId: string;
    phase: string;
}
export interface RefineryInput {
    questions: Array<{
        id: string;
        text: string;
    }>;
    answers: Array<{
        id: string;
        answer: string;
        evidence?: string[];
        confidence?: number;
    }>;
}
export interface RefineryOutput {
    runId: string;
    phase: string;
    refined: {
        questions: AtomicQuestion[];
        answers: CanonicalAnswer[];
        knowledgeFrames: KnowledgeFrame[];
    };
    metrics: RefineryMetrics;
    durationMs: number;
}
interface AtomicQuestion {
    id: string;
    text: string;
    type: string;
    priority: string;
    parentQuestionId?: string;
}
interface CanonicalAnswer {
    id: string;
    answer: string;
    consensusConfidence: number;
    evidenceIds: string[];
    lineage: any;
}
interface RefineryMetrics {
    inputCount: number;
    acceptedCount: number;
    rejectedCount: number;
    fissionCoverage: number;
    fusionConsensus: number;
    totalCostUsd: number;
    stageResults: Record<string, any>;
}
export {};
//# sourceMappingURL=refinery-workflow.d.ts.map