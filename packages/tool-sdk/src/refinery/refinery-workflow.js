"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefineryWorkflow = void 0;
const normalize_1 = require("../tools/refine/normalize");
const fission_1 = require("../tools/refine/fission");
const embed_1 = require("../tools/refine/embed");
const cluster_1 = require("../tools/refine/cluster");
const fusion_1 = require("../tools/refine/fusion");
const ontologyLink_1 = require("../tools/refine/ontologyLink");
const dedup_1 = require("../tools/refine/dedup");
const pii_redactor_1 = require("../tools/guard/pii-redactor");
// ============================================================================
// REFINERY WORKFLOW
// ============================================================================
class RefineryWorkflow {
    db;
    runId;
    phase;
    // Tools
    normalizeTool;
    piiRedactor;
    dedupTool;
    dedupHandler;
    fissionTool;
    ontologyTool;
    embedTool;
    batchEmbedTool;
    clusterTool;
    fusionTool;
    // Metrics
    metrics = {
        inputCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        fissionCoverage: 0,
        fusionConsensus: 0,
        totalCostUsd: 0,
        stageResults: {},
    };
    constructor(config) {
        this.db = config.dbPool;
        this.runId = config.runId;
        this.phase = config.phase;
        // Initialize tools
        this.normalizeTool = new normalize_1.NormalizeTool();
        this.piiRedactor = new pii_redactor_1.PIIRedactorTool();
        this.dedupTool = new dedup_1.DedupTool(this.db);
        this.dedupHandler = new dedup_1.DedupHandler(this.db);
        this.fissionTool = new fission_1.FissionTool();
        this.ontologyTool = new ontologyLink_1.OntologyLinkTool(this.db);
        this.embedTool = new embed_1.EmbedTool();
        this.batchEmbedTool = new embed_1.BatchEmbedTool();
        this.clusterTool = new cluster_1.ClusterTool();
        this.fusionTool = new fusion_1.FusionTool();
    }
    /**
     * Run full Refinery pipeline
     */
    async refine(input) {
        const startTime = Date.now();
        console.log(`[Refinery] Starting run ${this.runId} for phase ${this.phase}`);
        console.log(`[Refinery] Input: ${input.questions.length} questions, ${input.answers.length} answers`);
        this.metrics.inputCount = input.questions.length + input.answers.length;
        try {
            // Stage 1-4: Pre-processing (normalize, redact, hash, dedup)
            const preprocessed = await this.preprocess(input);
            // Stage 5: Fission (question decomposition)
            const fissioned = await this.runFission(preprocessed.questions);
            // Stage 6: Entity Linking
            const entitiesLinked = await this.runEntityLinking([
                ...preprocessed.questions,
                ...preprocessed.answers,
            ]);
            // Stage 7: Embedding Generation
            const embeddings = await this.runEmbedding([
                ...preprocessed.questions,
                ...preprocessed.answers,
            ]);
            // Stage 8: Clustering (group similar answers)
            const clusters = await this.runClustering(preprocessed.answers, embeddings);
            // Stage 9-10: Fusion + Knowledge Frame Extraction
            const fused = await this.runFusion(clusters);
            // Stage 11: Version Management
            await this.runVersionManagement(fused);
            // Stage 12: Delta Publishing
            await this.publishDeltas(fused);
            // Calculate final metrics
            this.calculateFinalMetrics(fissioned, fused);
            const output = {
                runId: this.runId,
                phase: this.phase,
                refined: {
                    questions: fissioned.atomicQuestions,
                    answers: fused.canonicalAnswers,
                    knowledgeFrames: fused.knowledgeFrames,
                },
                metrics: this.metrics,
                durationMs: Date.now() - startTime,
            };
            console.log(`[Refinery] Completed in ${output.durationMs}ms`);
            console.log(`[Refinery] Metrics:`, this.metrics);
            return output;
        }
        catch (error) {
            console.error('[Refinery] Pipeline failed:', error);
            throw error;
        }
    }
    /**
     * Stage 1-4: Pre-processing pipeline
     */
    async preprocess(input) {
        console.log('[Refinery] Stage 1-4: Pre-processing');
        const questions = [];
        const answers = [];
        // Process questions
        for (const q of input.questions) {
            const processed = await this.preprocessText(q.id, 'question', q.text);
            questions.push({
                id: q.id,
                text: processed.text,
                contentHash: processed.contentHash,
                isDuplicate: processed.isDuplicate,
            });
        }
        // Process answers
        for (const a of input.answers) {
            const processed = await this.preprocessText(a.id, 'answer', a.answer);
            answers.push({
                id: a.id,
                answer: processed.text,
                contentHash: processed.contentHash,
                isDuplicate: processed.isDuplicate,
                evidence: a.evidence,
                confidence: a.confidence,
            });
        }
        this.metrics.stageResults.preprocess = {
            duplicatesDetected: [...questions, ...answers].filter((x) => x.isDuplicate).length,
        };
        return { questions, answers };
    }
    /**
     * Preprocess single text item
     */
    async preprocessText(id, type, text) {
        // Stage 1: Normalize
        const normalized = await this.normalizeTool.execute({ text });
        let processedText = normalized.result.normalized;
        const contentHash = normalized.result.contentHash;
        // Stage 2: PII Redaction
        const redacted = await this.piiRedactor.execute({
            text: processedText,
            redactMode: 'partial',
            sensitivityLevel: 'strict',
        });
        processedText = redacted.result.redactedText;
        if (redacted.result.piiDetected) {
            console.warn(`[Refinery] PII detected in ${type} ${id}: ${redacted.result.redactionCount} redactions`);
        }
        // Stage 3-4: Deduplication
        const dedupResult = await this.dedupTool.execute({
            entityId: id,
            entityType: type,
            text: processedText,
            contentHash,
        });
        let isDuplicate = false;
        if (dedupResult.result.isDuplicate) {
            console.log(`[Refinery] Duplicate detected: ${id} -> ${dedupResult.result.duplicateOf}`);
            await this.dedupHandler.markAsDuplicate(id, dedupResult.result.duplicateOf, type);
            isDuplicate = true;
        }
        return { text: processedText, contentHash, isDuplicate };
    }
    /**
     * Stage 5: Fission (question decomposition)
     */
    async runFission(questions) {
        console.log('[Refinery] Stage 5: Fission');
        const atomicQuestions = [];
        const trees = [];
        let totalCoverage = 0;
        let treeCount = 0;
        for (const q of questions) {
            if (q.isDuplicate)
                continue; // Skip duplicates
            const result = await this.fissionTool.execute({
                questionId: q.id,
                question: q.text,
                phase: this.phase,
            });
            if (result.result.isAtomic) {
                // Already atomic - no decomposition needed
                atomicQuestions.push({
                    id: q.id,
                    text: q.text,
                    type: 'factual',
                    priority: 'high',
                });
            }
            else {
                // Decomposed into atoms
                const tree = result.result.fissionTree;
                trees.push(tree);
                // Add atomic questions
                for (const atom of tree.atoms) {
                    atomicQuestions.push({
                        id: atom.id,
                        text: atom.text,
                        type: atom.type,
                        priority: atom.priority,
                        parentQuestionId: q.id,
                    });
                }
                totalCoverage += result.result.coverage;
                treeCount++;
                // Store fission tree in database
                await this.storeFissionTree(q.id, tree, result.result.coverage);
            }
        }
        const avgCoverage = treeCount > 0 ? totalCoverage / treeCount : 1.0;
        this.metrics.fissionCoverage = avgCoverage;
        this.metrics.stageResults.fission = {
            treesCreated: treeCount,
            atomsGenerated: atomicQuestions.length,
            avgCoverage,
        };
        console.log(`[Refinery] Fission complete: ${atomicQuestions.length} atoms, avg coverage ${avgCoverage.toFixed(2)}`);
        return { atomicQuestions, trees };
    }
    /**
     * Stage 6: Entity Linking
     */
    async runEntityLinking(items) {
        console.log('[Refinery] Stage 6: Entity Linking');
        let totalEntities = 0;
        let totalNew = 0;
        let totalAliases = 0;
        for (const item of items) {
            const text = item.text || item.answer || '';
            const type = item.text ? 'question' : 'answer';
            const result = await this.ontologyTool.execute({
                entityId: item.id,
                entityType: type,
                text,
                phase: this.phase,
            });
            totalEntities += result.result.entities.length;
            totalNew += result.result.newEntities;
            totalAliases += result.result.resolvedAliases;
        }
        this.metrics.stageResults.entityLinking = {
            entitiesLinked: totalEntities,
            newEntities: totalNew,
            aliasesResolved: totalAliases,
        };
        console.log(`[Refinery] Entity linking complete: ${totalEntities} entities, ${totalNew} new, ${totalAliases} aliases`);
    }
    /**
     * Stage 7: Embedding Generation
     */
    async runEmbedding(items) {
        console.log('[Refinery] Stage 7: Embedding Generation');
        const embeddings = new Map();
        const batchItems = items.map((item) => ({
            entityId: item.id,
            entityType: item.text ? 'question' : 'answer',
            text: item.text || item.answer || '',
        }));
        const result = await this.batchEmbedTool.execute({
            items: batchItems,
            model: 'openai-small',
        });
        for (const emb of result.result.embeddings) {
            embeddings.set(emb.vectorId, emb.vector);
            // Store embedding metadata in database
            await this.storeEmbedding(emb);
        }
        this.metrics.totalCostUsd += result.metadata.costUsd;
        this.metrics.stageResults.embedding = {
            embeddingsGenerated: embeddings.size,
            totalCost: result.metadata.costUsd,
        };
        console.log(`[Refinery] Embeddings complete: ${embeddings.size} vectors`);
        return embeddings;
    }
    /**
     * Stage 8: Clustering
     */
    async runClustering(answers, embeddings) {
        console.log('[Refinery] Stage 8: Clustering');
        // Build answer list with embeddings
        const answersWithEmbeddings = answers
            .filter((a) => !a.isDuplicate)
            .map((a) => ({
            answerId: a.id,
            text: a.answer,
            embedding: embeddings.get(`VEC-ANSWER-${a.id}`) || [],
        }))
            .filter((a) => a.embedding.length > 0);
        if (answersWithEmbeddings.length < 2) {
            console.log('[Refinery] Not enough answers for clustering');
            return [];
        }
        const result = await this.clusterTool.execute({
            answers: answersWithEmbeddings,
            phase: this.phase,
            minClusterSize: 2,
            similarityThreshold: 0.75,
        });
        this.metrics.stageResults.clustering = {
            clustersCreated: result.result.clusterCount,
            avgPurity: result.result.avgPurity,
        };
        console.log(`[Refinery] Clustering complete: ${result.result.clusterCount} clusters`);
        return result.result.clusters;
    }
    /**
     * Stage 9-10: Fusion + Knowledge Frame Extraction
     */
    async runFusion(clusters) {
        console.log('[Refinery] Stage 9-10: Fusion + Knowledge Frame Extraction');
        const canonicalAnswers = [];
        const knowledgeFrames = [];
        let totalConsensus = 0;
        for (const cluster of clusters) {
            // Get full answer objects
            const answers = await this.getAnswersForCluster(cluster.answerIds);
            const result = await this.fusionTool.execute({
                clusterId: cluster.id,
                topic: cluster.topic,
                answers,
                phase: this.phase,
            });
            const canonicalAnswer = {
                id: `CANONICAL-${cluster.id}`,
                answer: result.result.canonicalAnswer,
                consensusConfidence: result.result.consensusConfidence,
                evidenceIds: result.result.evidenceIds,
                lineage: result.result.lineage,
            };
            canonicalAnswers.push(canonicalAnswer);
            knowledgeFrames.push(result.result.knowledgeFrame);
            totalConsensus += result.result.consensusConfidence;
            // Store fusion cluster in database
            await this.storeFusionCluster(cluster, result.result);
            this.metrics.totalCostUsd += result.metadata.costUsd;
        }
        const avgConsensus = clusters.length > 0 ? totalConsensus / clusters.length : 0;
        this.metrics.fusionConsensus = avgConsensus;
        this.metrics.stageResults.fusion = {
            clustersProcessed: clusters.length,
            canonicalAnswers: canonicalAnswers.length,
            avgConsensus,
        };
        console.log(`[Refinery] Fusion complete: ${canonicalAnswers.length} canonical answers`);
        return { canonicalAnswers, knowledgeFrames };
    }
    /**
     * Stage 11: Version Management
     */
    async runVersionManagement(fused) {
        console.log('[Refinery] Stage 11: Version Management');
        let versionUpdates = 0;
        let newVersions = 0;
        // Check for supersedes relationships
        // For each canonical answer, check if it supersedes previous versions
        for (const canonical of fused.canonicalAnswers) {
            // Extract base ID from canonical answer ID (e.g., CANONICAL-CLUSTER-123 -> CLUSTER-123)
            const baseId = canonical.id.replace('CANONICAL-', '');
            // Check for existing version
            const existingVersion = await this.findExistingVersion(baseId);
            if (existingVersion) {
                // Compare content hashes
                const currentHash = this.hashContent(canonical.answer);
                if (currentHash !== existingVersion.contentHash) {
                    // Content changed - create new version
                    const newVersion = existingVersion.version + 1;
                    // Create supersedes edge
                    await this.createSupersedesEdge(existingVersion.id, canonical.id, newVersion, `Content updated: consensus ${canonical.consensusConfidence.toFixed(2)}`);
                    // Update canonical answer with version info
                    await this.storeCanonicalAnswer(canonical, newVersion, currentHash);
                    versionUpdates++;
                    console.log(`[Refinery] Version update: ${canonical.id} v${existingVersion.version} -> v${newVersion}`);
                }
                else {
                    // Content unchanged - keep existing version
                    await this.storeCanonicalAnswer(canonical, existingVersion.version, currentHash);
                }
            }
            else {
                // New canonical answer - version 1
                const contentHash = this.hashContent(canonical.answer);
                await this.storeCanonicalAnswer(canonical, 1, contentHash);
                newVersions++;
                console.log(`[Refinery] New canonical answer: ${canonical.id} v1`);
            }
        }
        this.metrics.stageResults.versioning = {
            versionUpdates,
            newVersions,
        };
        console.log(`[Refinery] Versioning complete: ${newVersions} new, ${versionUpdates} updates`);
    }
    /**
     * Stage 12: Delta Publishing
     */
    async publishDeltas(fused) {
        console.log('[Refinery] Stage 12: Delta Publishing');
        let eventsPublished = 0;
        // Publish delta events for canonical answers
        for (const canonical of fused.canonicalAnswers) {
            const event = {
                eventType: 'kmap.delta.created',
                timestamp: new Date().toISOString(),
                runId: this.runId,
                phase: this.phase,
                entityType: 'canonical_answer',
                entityId: canonical.id,
                data: {
                    answer: canonical.answer,
                    consensusConfidence: canonical.consensusConfidence,
                    evidenceIds: canonical.evidenceIds,
                },
            };
            await this.publishEvent(event);
            eventsPublished++;
        }
        // Publish delta events for knowledge frames
        for (const frame of fused.knowledgeFrames) {
            const event = {
                eventType: 'kmap.delta.created',
                timestamp: new Date().toISOString(),
                runId: this.runId,
                phase: this.phase,
                entityType: 'knowledge_frame',
                entityId: frame.id,
                data: {
                    topic: frame.topic,
                    entities: frame.entities,
                    relations: frame.relations,
                    claims: frame.claims,
                },
            };
            await this.publishEvent(event);
            eventsPublished++;
        }
        this.metrics.stageResults.deltaPublishing = {
            eventsPublished,
        };
        console.log(`[Refinery] Delta publishing complete: ${eventsPublished} events`);
    }
    /**
     * Helper: Get answers for cluster
     */
    async getAnswersForCluster(answerIds) {
        const query = `
      SELECT id, answer, confidence
      FROM answers
      WHERE id = ANY($1)
    `;
        const result = await this.db.query(query, [answerIds]);
        // Fetch evidence for each answer
        const answersWithEvidence = await Promise.all(result.rows.map(async (row) => {
            const evidence = await this.fetchEvidence(row.id);
            return {
                answerId: row.id,
                answer: row.answer,
                confidence: row.confidence || 0.5,
                evidence,
            };
        }));
        return answersWithEvidence;
    }
    /**
     * Helper: Fetch evidence bindings for an answer
     */
    async fetchEvidence(answerId) {
        const query = `
      SELECT eb.evidence_id, e.content, e.source_url, e.confidence
      FROM evidence_bindings eb
      JOIN evidence e ON e.id = eb.evidence_id
      WHERE eb.entity_id = $1
        AND eb.entity_type = 'answer'
      ORDER BY e.confidence DESC, eb.created_at DESC
      LIMIT 10
    `;
        try {
            const result = await this.db.query(query, [answerId]);
            return result.rows.map((row) => {
                // Format evidence as citation string
                const source = row.source_url ? ` (${row.source_url})` : '';
                const conf = row.confidence ? ` [conf: ${row.confidence.toFixed(2)}]` : '';
                return `${row.content}${source}${conf}`;
            });
        }
        catch (error) {
            console.warn(`[Refinery] Failed to fetch evidence for answer ${answerId}:`, error);
            return [];
        }
    }
    /**
     * Helper: Store fission tree
     */
    async storeFissionTree(questionId, tree, coverage) {
        const query = `
      INSERT INTO fission_trees (
        id, root_question_id, phase, run_id, atoms, edges, coverage, atom_count, tool_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING
    `;
        await this.db.query(query, [
            tree.id,
            questionId,
            this.phase,
            this.runId,
            JSON.stringify(tree.atoms),
            JSON.stringify(tree.edges),
            coverage,
            tree.atoms.length,
            'refine.fission@1.0.0',
        ]);
    }
    /**
     * Helper: Store embedding
     */
    async storeEmbedding(embedding) {
        const query = `
      INSERT INTO embeddings (
        id, entity_type, entity_id, phase, embedding_model, embedding_dim,
        vector_db, vector_id, content_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (entity_type, entity_id) DO UPDATE
        SET embedding_model = EXCLUDED.embedding_model,
            embedding_dim = EXCLUDED.embedding_dim,
            vector_id = EXCLUDED.vector_id,
            content_hash = EXCLUDED.content_hash,
            updated_at = NOW()
    `;
        const [, entityType, entityId] = embedding.vectorId.split('-');
        await this.db.query(query, [
            embedding.vectorId,
            entityType.toLowerCase(),
            entityId,
            this.phase,
            embedding.embeddingModel,
            embedding.embeddingDim,
            'local', // Placeholder - would be qdrant/weaviate in production
            embedding.vectorId,
            embedding.contentHash,
        ]);
    }
    /**
     * Helper: Store fusion cluster
     */
    async storeFusionCluster(cluster, fusionResult) {
        const query = `
      INSERT INTO fusion_clusters (
        id, topic, phase, run_id, canonical_answer_id, contributor_ids,
        consensus_confidence, fusion_compression_rate, cluster_purity,
        conflict_count, conflicts, tool_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO NOTHING
    `;
        await this.db.query(query, [
            cluster.id,
            cluster.topic,
            this.phase,
            this.runId,
            null, // Would link to canonical answer after creation
            cluster.answerIds,
            fusionResult.consensusConfidence,
            fusionResult.compressionRate,
            cluster.purity,
            fusionResult.conflicts.length,
            JSON.stringify(fusionResult.conflicts),
            'refine.fusion@1.0.0',
        ]);
    }
    /**
     * Calculate final metrics
     */
    calculateFinalMetrics(fission, fusion) {
        this.metrics.acceptedCount = fusion.canonicalAnswers.length;
        this.metrics.rejectedCount = this.metrics.inputCount - this.metrics.acceptedCount;
    }
    /**
     * Helper: Find existing version of canonical answer
     */
    async findExistingVersion(baseId) {
        const query = `
      SELECT id, version, content_hash as "contentHash"
      FROM canonical_answers
      WHERE id LIKE $1
      ORDER BY version DESC
      LIMIT 1
    `;
        const result = await this.db.query(query, [`%${baseId}%`]);
        if (result.rows.length === 0) {
            return null;
        }
        return result.rows[0];
    }
    /**
     * Helper: Hash content for versioning
     */
    hashContent(content) {
        // Simple hash function - in production use crypto.createHash
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(16);
    }
    /**
     * Helper: Create supersedes edge in knowledge map
     */
    async createSupersedesEdge(oldId, newId, version, reason) {
        const query = `
      INSERT INTO kmap_edges (
        id, from_id, to_id, edge_type, phase, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING
    `;
        const edgeId = `EDGE-SUPERSEDES-${version}-${Date.now()}`;
        const metadata = {
            version,
            reason,
            timestamp: new Date().toISOString(),
        };
        await this.db.query(query, [
            edgeId,
            oldId,
            newId,
            'supersedes',
            this.phase,
            JSON.stringify(metadata),
        ]);
    }
    /**
     * Helper: Store canonical answer with version info
     */
    async storeCanonicalAnswer(canonical, version, contentHash) {
        const query = `
      INSERT INTO canonical_answers (
        id, answer, version, content_hash, consensus_confidence,
        evidence_ids, phase, run_id, lineage
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id, version) DO UPDATE
        SET answer = EXCLUDED.answer,
            consensus_confidence = EXCLUDED.consensus_confidence,
            evidence_ids = EXCLUDED.evidence_ids,
            updated_at = NOW()
    `;
        await this.db.query(query, [
            canonical.id,
            canonical.answer,
            version,
            contentHash,
            canonical.consensusConfidence,
            canonical.evidenceIds,
            this.phase,
            this.runId,
            JSON.stringify(canonical.lineage),
        ]);
    }
    /**
     * Helper: Publish event to message bus
     */
    async publishEvent(event) {
        // Use NATS if configured, otherwise log
        const natsUrl = process.env.NATS_URL;
        if (natsUrl) {
            try {
                const { connect, StringCodec } = await Promise.resolve().then(() => __importStar(require('nats')));
                const nc = await connect({ servers: natsUrl.split(',') });
                const sc = StringCodec();
                nc.publish(event.eventType, sc.encode(JSON.stringify(event)));
                await nc.drain();
            }
            catch (error) {
                console.warn('[Refinery] Failed to publish to NATS, logging to console:', error);
                console.log('[Refinery] Delta event:', JSON.stringify(event, null, 2));
            }
        }
        else {
            // Fallback to console logging
            if (process.env.LOG_LEVEL === 'debug') {
                console.log('[Refinery] Delta event:', JSON.stringify(event, null, 2));
            }
        }
    }
}
exports.RefineryWorkflow = RefineryWorkflow;
//# sourceMappingURL=refinery-workflow.js.map