/**
 * Refinery Client
 *
 * Clean interface for EnhancedPhaseCoordinator to integrate Knowledge Refinery.
 *
 * Usage:
 * ```typescript
 * const client = new RefineryClient({ dbPool, phase: 'PRD', runId });
 * const result = await client.refine({ questions, answers });
 * ```
 */
import { Pool } from 'pg';
export declare class RefineryClient {
    private workflow;
    private phase;
    private runId;
    constructor(config: RefineryClientConfig);
    /**
     * Refine raw Q/A/V outputs into polished Knowledge Map entries
     */
    refine(input: RefineRequest): Promise<RefineResult>;
    /**
     * Evaluate gate thresholds
     */
    private evaluateGate;
    /**
     * Get refinery metrics for a run
     */
    getMetrics(runId: string): Promise<RefineryMetrics | null>;
    /**
     * Get fission tree for a question
     */
    getFissionTree(questionId: string): Promise<any | null>;
    /**
     * Get fusion cluster for a topic
     */
    getFusionCluster(clusterId: string): Promise<any | null>;
    /**
     * Get knowledge frame for a canonical answer
     */
    getKnowledgeFrame(frameId: string): Promise<any | null>;
}
/**
 * Standalone gate evaluation (for testing)
 */
export declare class RefineryGate {
    private thresholds;
    constructor(thresholds?: Partial<GateThresholds>);
    /**
     * Evaluate metrics against thresholds
     */
    evaluate(metrics: {
        fissionCoverage: number;
        fusionConsensus: number;
        acceptanceRate: number;
    }): GateResult;
}
export interface RefineryClientConfig {
    dbPool: Pool;
    phase: string;
    runId: string;
}
export interface RefineRequest {
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
export interface RefineResult {
    success: boolean;
    refined: {
        questions: any[];
        answers: any[];
        knowledgeFrames: any[];
    };
    metrics: RefineryMetrics;
    gate: GateResult;
    durationMs: number;
}
export interface RefineryMetrics {
    inputCount: number;
    acceptedCount: number;
    rejectedCount: number;
    fissionCoverage: number;
    fusionConsensus: number;
    totalCostUsd: number;
    stageResults: Record<string, any>;
}
export interface GateResult {
    passed: boolean;
    failures: string[];
    metrics: {
        fissionCoverage: number;
        fusionConsensus: number;
        acceptanceRate: number;
    };
}
export interface GateThresholds {
    fissionCoverage: number;
    fusionConsensus: number;
    acceptanceRate: number;
}
//# sourceMappingURL=refinery-client.d.ts.map