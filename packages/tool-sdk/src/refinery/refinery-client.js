"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefineryGate = exports.RefineryClient = void 0;
const refinery_workflow_1 = require("./refinery-workflow");
// ============================================================================
// REFINERY CLIENT
// ============================================================================
class RefineryClient {
    workflow;
    phase;
    runId;
    constructor(config) {
        this.phase = config.phase;
        this.runId = config.runId;
        this.workflow = new refinery_workflow_1.RefineryWorkflow({
            dbPool: config.dbPool,
            phase: config.phase,
            runId: config.runId,
        });
    }
    /**
     * Refine raw Q/A/V outputs into polished Knowledge Map entries
     */
    async refine(input) {
        const startTime = Date.now();
        console.log(`[RefineryClient] Starting refinement for ${this.phase} phase`);
        console.log(`[RefineryClient] Input: ${input.questions.length} questions, ${input.answers.length} answers`);
        try {
            // Run full Refinery pipeline
            const output = await this.workflow.refine({
                questions: input.questions,
                answers: input.answers,
            });
            // Check gate thresholds
            const gateResult = this.evaluateGate(output);
            const result = {
                success: gateResult.passed,
                refined: output.refined,
                metrics: output.metrics,
                gate: gateResult,
                durationMs: Date.now() - startTime,
            };
            if (!gateResult.passed) {
                console.warn(`[RefineryClient] Gate FAILED:`, gateResult.failures);
            }
            else {
                console.log(`[RefineryClient] Gate PASSED - quality metrics met`);
            }
            return result;
        }
        catch (error) {
            console.error('[RefineryClient] Refinement failed:', error);
            throw error;
        }
    }
    /**
     * Evaluate gate thresholds
     */
    evaluateGate(output) {
        const failures = [];
        // Gate 1: Fission coverage ≥ 0.85
        if (output.metrics.fissionCoverage < 0.85) {
            failures.push(`fission_coverage_low: ${output.metrics.fissionCoverage.toFixed(2)} < 0.85`);
        }
        // Gate 2: Fusion consensus ≥ 0.75
        if (output.metrics.fusionConsensus < 0.75) {
            failures.push(`fusion_consensus_low: ${output.metrics.fusionConsensus.toFixed(2)} < 0.75`);
        }
        // Gate 3: At least 60% of inputs accepted
        const acceptanceRate = output.metrics.acceptedCount / output.metrics.inputCount;
        if (acceptanceRate < 0.6) {
            failures.push(`acceptance_rate_low: ${(acceptanceRate * 100).toFixed(0)}% < 60%`);
        }
        return {
            passed: failures.length === 0,
            failures,
            metrics: {
                fissionCoverage: output.metrics.fissionCoverage,
                fusionConsensus: output.metrics.fusionConsensus,
                acceptanceRate,
            },
        };
    }
    /**
     * Get refinery metrics for a run
     */
    async getMetrics(runId) {
        const query = `
      SELECT
        input_count,
        accepted_count,
        rejected_count,
        fission_coverage,
        fusion_consensus,
        total_cost_usd,
        stage_results
      FROM refinery_runs
      WHERE run_id = $1
    `;
        const result = await this.workflow['db'].query(query, [runId]);
        if (result.rows.length === 0) {
            return null;
        }
        const row = result.rows[0];
        return {
            inputCount: row.input_count,
            acceptedCount: row.accepted_count,
            rejectedCount: row.rejected_count,
            fissionCoverage: row.fission_coverage,
            fusionConsensus: row.fusion_consensus,
            totalCostUsd: row.total_cost_usd,
            stageResults: row.stage_results,
        };
    }
    /**
     * Get fission tree for a question
     */
    async getFissionTree(questionId) {
        const query = `
      SELECT
        id,
        root_question_id,
        phase,
        run_id,
        atoms,
        edges,
        coverage,
        atom_count,
        tool_id,
        created_at
      FROM fission_trees
      WHERE root_question_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
        const result = await this.workflow['db'].query(query, [questionId]);
        if (result.rows.length === 0) {
            return null;
        }
        const row = result.rows[0];
        return {
            id: row.id,
            rootQuestionId: row.root_question_id,
            phase: row.phase,
            runId: row.run_id,
            atoms: row.atoms,
            edges: row.edges,
            coverage: row.coverage,
            atomCount: row.atom_count,
            toolId: row.tool_id,
            createdAt: row.created_at,
        };
    }
    /**
     * Get fusion cluster for a topic
     */
    async getFusionCluster(clusterId) {
        const query = `
      SELECT
        id,
        topic,
        phase,
        run_id,
        canonical_answer_id,
        contributor_ids,
        consensus_confidence,
        fusion_compression_rate,
        cluster_purity,
        conflict_count,
        conflicts,
        tool_id,
        created_at
      FROM fusion_clusters
      WHERE id = $1
    `;
        const result = await this.workflow['db'].query(query, [clusterId]);
        if (result.rows.length === 0) {
            return null;
        }
        const row = result.rows[0];
        return {
            id: row.id,
            topic: row.topic,
            phase: row.phase,
            runId: row.run_id,
            canonicalAnswerId: row.canonical_answer_id,
            contributorIds: row.contributor_ids,
            consensusConfidence: row.consensus_confidence,
            fusionCompressionRate: row.fusion_compression_rate,
            clusterPurity: row.cluster_purity,
            conflictCount: row.conflict_count,
            conflicts: row.conflicts,
            toolId: row.tool_id,
            createdAt: row.created_at,
        };
    }
    /**
     * Get knowledge frame for a canonical answer
     */
    async getKnowledgeFrame(frameId) {
        const query = `
      SELECT
        id,
        canonical_answer_id,
        topic,
        entities,
        relations,
        claims,
        confidence,
        phase,
        run_id,
        tool_id,
        created_at
      FROM knowledge_frames
      WHERE id = $1
    `;
        const result = await this.workflow['db'].query(query, [frameId]);
        if (result.rows.length === 0) {
            return null;
        }
        const row = result.rows[0];
        return {
            id: row.id,
            canonicalAnswerId: row.canonical_answer_id,
            topic: row.topic,
            entities: row.entities,
            relations: row.relations,
            claims: row.claims,
            confidence: row.confidence,
            phase: row.phase,
            runId: row.run_id,
            toolId: row.tool_id,
            createdAt: row.created_at,
        };
    }
}
exports.RefineryClient = RefineryClient;
// ============================================================================
// REFINERY GATE
// ============================================================================
/**
 * Standalone gate evaluation (for testing)
 */
class RefineryGate {
    thresholds;
    constructor(thresholds) {
        this.thresholds = {
            fissionCoverage: thresholds?.fissionCoverage ?? 0.85,
            fusionConsensus: thresholds?.fusionConsensus ?? 0.75,
            acceptanceRate: thresholds?.acceptanceRate ?? 0.6,
        };
    }
    /**
     * Evaluate metrics against thresholds
     */
    evaluate(metrics) {
        const failures = [];
        if (metrics.fissionCoverage < this.thresholds.fissionCoverage) {
            failures.push(`fission_coverage_low: ${metrics.fissionCoverage.toFixed(2)} < ${this.thresholds.fissionCoverage}`);
        }
        if (metrics.fusionConsensus < this.thresholds.fusionConsensus) {
            failures.push(`fusion_consensus_low: ${metrics.fusionConsensus.toFixed(2)} < ${this.thresholds.fusionConsensus}`);
        }
        if (metrics.acceptanceRate < this.thresholds.acceptanceRate) {
            failures.push(`acceptance_rate_low: ${(metrics.acceptanceRate * 100).toFixed(0)}% < ${(this.thresholds.acceptanceRate * 100).toFixed(0)}%`);
        }
        return {
            passed: failures.length === 0,
            failures,
            metrics,
        };
    }
}
exports.RefineryGate = RefineryGate;
//# sourceMappingURL=refinery-client.js.map