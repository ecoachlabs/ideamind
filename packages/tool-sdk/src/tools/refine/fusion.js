"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FusionTool = void 0;
exports.createFusionTool = createFusionTool;
const types_1 = require("../../types");
const llm_1 = require("../../../agent-sdk/src/llm");
// ============================================================================
// FUSION TOOL
// ============================================================================
class FusionTool {
    metadata = {
        name: 'refine.fusion',
        description: 'Synthesize multiple answers into canonical answer',
        category: types_1.ToolCategory.REFINERY,
        version: '1.0.0',
        inputSchema: {
            type: 'object',
            properties: {
                clusterId: {
                    type: 'string',
                    description: 'Cluster ID',
                },
                topic: {
                    type: 'string',
                    description: 'Cluster topic',
                },
                answers: {
                    type: 'array',
                    description: 'Answers to fuse',
                    items: {
                        type: 'object',
                        properties: {
                            answerId: { type: 'string' },
                            answer: { type: 'string' },
                            evidence: { type: 'array', items: { type: 'string' } },
                            confidence: { type: 'number' },
                        },
                    },
                },
                phase: {
                    type: 'string',
                    description: 'Phase context',
                },
            },
            required: ['clusterId', 'topic', 'answers', 'phase'],
        },
        outputSchema: {
            type: 'object',
            properties: {
                canonicalAnswer: { type: 'string' },
                consensusConfidence: { type: 'number' },
                compressionRate: { type: 'number' },
                conflicts: { type: 'array' },
                knowledgeFrame: { type: 'object' },
                lineage: { type: 'object' },
            },
        },
        costUsd: 0.08, // LLM call for synthesis
    };
    async execute(input) {
        const startTime = Date.now();
        const { clusterId, topic, answers, phase } = input;
        try {
            // Step 1: Detect conflicts
            const conflicts = await this.detectConflicts(answers, phase);
            // Step 2: Synthesize canonical answer
            const synthesis = await this.synthesizeAnswer(topic, answers, conflicts, phase);
            // Step 3: Generate Knowledge Frame
            const knowledgeFrame = await this.generateKnowledgeFrame(synthesis.canonicalAnswer, answers, phase);
            // Step 4: Calculate metrics
            const compressionRate = answers.length / 1; // N answers → 1 canonical
            const consensusConfidence = this.calculateConsensusConfidence(answers, conflicts);
            // Step 5: Build lineage
            const lineage = {
                contributorIds: answers.map((a) => a.answerId),
                sourceCount: answers.length,
                conflictCount: conflicts.length,
                fusionStrategy: conflicts.length > 0 ? 'conflict_resolution' : 'consensus',
            };
            return {
                result: {
                    canonicalAnswer: synthesis.canonicalAnswer,
                    consensusConfidence,
                    compressionRate,
                    conflicts,
                    knowledgeFrame,
                    lineage,
                    evidenceIds: synthesis.evidenceIds,
                },
                metadata: {
                    toolName: this.metadata.name,
                    toolVersion: this.metadata.version,
                    executionTimeMs: Date.now() - startTime,
                    costUsd: this.metadata.costUsd,
                },
            };
        }
        catch (error) {
            console.error('[Fusion] Error:', error);
            throw error;
        }
    }
    /**
     * Detect conflicts between answers
     */
    async detectConflicts(answers, phase) {
        if (answers.length < 2)
            return [];
        const llm = llm_1.LLMFactory.createProvider(phase, 'validator');
        const prompt = `Analyze these answers and detect conflicts (contradictory information).

**Answers**:
${answers.map((a, idx) => `\n**Answer ${idx + 1}** (${a.answerId}):\n${a.answer}`).join('\n')}

**Your Task**:
Identify conflicts where answers provide contradictory information (e.g., different numbers, opposite conclusions, incompatible approaches).

**Output Format** (JSON only):
{
  "conflicts": [
    {
      "answerIds": ["A-001", "A-003"],
      "description": "Conflicting response time: A-001 says <200ms, A-003 says <500ms",
      "severity": "high | medium | low"
    }
  ]
}

If NO conflicts, return: {"conflicts": []}

Respond ONLY with valid JSON. No markdown, no explanation.`;
        try {
            const response = await llm.invoke({
                prompt,
                systemPrompt: 'You are a conflict detection expert. Output only valid JSON.',
                temperature: 0.2,
                maxTokens: 1024,
            });
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return [];
            }
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed.conflicts || [];
        }
        catch (error) {
            console.warn('[Fusion] Conflict detection failed:', error);
            return [];
        }
    }
    /**
     * Synthesize canonical answer from multiple answers
     */
    async synthesizeAnswer(topic, answers, conflicts, phase) {
        const llm = llm_1.LLMFactory.createProvider(phase, 'answer-agent');
        const conflictContext = conflicts.length > 0
            ? `\n**CONFLICTS DETECTED**:\n${conflicts.map((c) => `- ${c.description} (${c.severity} severity)`).join('\n')}\n\nResolve conflicts by:\n1. Using highest-confidence answer\n2. Noting disagreement explicitly if unresolvable\n3. Citing all evidence sources`
            : '';
        const prompt = `Synthesize these ${answers.length} answers into ONE canonical answer.

**Topic**: ${topic}
**Phase**: ${phase}

**Answers to Fuse**:
${answers.map((a, idx) => `\n**Source ${idx + 1}** (${a.answerId}, confidence: ${a.confidence || 'N/A'}):\n${a.answer}\n**Evidence**: ${(a.evidence || []).join(', ') || 'None'}`).join('\n')}
${conflictContext}

**Your Task**:
Create a SINGLE canonical answer that:
1. **Synthesizes**: Combines all non-conflicting information
2. **Cites**: References ALL evidence sources
3. **Resolves**: Addresses conflicts explicitly if present
4. **Preserves**: Keeps specific units, targets, examples from sources
5. **Comprehensive**: Fully addresses the topic

**Output Format** (JSON only):
{
  "canonical_answer": "The synthesized canonical answer with [evidence:A-001] citations...",
  "evidence_ids": ["A-001", "A-002"],
  "synthesis_notes": "Brief note on how conflicts were resolved (if any)"
}

Respond ONLY with valid JSON. No markdown, no explanation.`;
        const response = await llm.invoke({
            prompt,
            systemPrompt: 'You are a knowledge synthesis expert. Output only valid JSON.',
            temperature: 0.4,
            maxTokens: 4096,
        });
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Invalid JSON response from LLM');
        }
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            canonicalAnswer: parsed.canonical_answer || 'Synthesis failed',
            evidenceIds: parsed.evidence_ids || [],
        };
    }
    /**
     * Generate Knowledge Frame (Who/What/When/Where/Why/How)
     */
    async generateKnowledgeFrame(canonicalAnswer, answers, phase) {
        const llm = llm_1.LLMFactory.createProvider(phase, 'answer-agent');
        const prompt = `Extract structured knowledge from this canonical answer.

**Canonical Answer**:
${canonicalAnswer}

**Your Task**:
Extract information into structured slots (fill ONLY if explicitly stated):

**Output Format** (JSON only):
{
  "who": "Actor/role responsible (e.g., 'Product Manager', 'System')",
  "what": "Core action/concept (e.g., 'API response time requirement')",
  "when": "Timing/deadlines (e.g., 'Sprint 3', 'Q2 2024')",
  "where": "Location/component (e.g., 'Backend API', 'User Dashboard')",
  "why": "Purpose/rationale (e.g., 'To meet SLA requirements')",
  "how": "Method/approach (e.g., 'Using Redis caching')",
  "metrics": ["< 200ms p95 latency", "99.9% uptime"],
  "caveats": ["Excludes third-party API calls"],
  "exceptions": ["Batch operations may take longer"]
}

Leave fields empty ("") if not mentioned. Only include what's EXPLICITLY stated.

Respond ONLY with valid JSON. No markdown, no explanation.`;
        try {
            const response = await llm.invoke({
                prompt,
                systemPrompt: 'You are a knowledge extraction expert. Output only valid JSON.',
                temperature: 0.2,
                maxTokens: 1024,
            });
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return this.emptyKnowledgeFrame();
            }
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                who: parsed.who || '',
                what: parsed.what || '',
                when: parsed.when || '',
                where: parsed.where || '',
                why: parsed.why || '',
                how: parsed.how || '',
                metrics: parsed.metrics || [],
                caveats: parsed.caveats || [],
                exceptions: parsed.exceptions || [],
            };
        }
        catch (error) {
            console.warn('[Fusion] Knowledge frame generation failed:', error);
            return this.emptyKnowledgeFrame();
        }
    }
    /**
     * Calculate consensus confidence
     */
    calculateConsensusConfidence(answers, conflicts) {
        // Start with average answer confidence
        const avgConfidence = answers.reduce((sum, a) => sum + (a.confidence || 0.5), 0) / answers.length;
        // Penalize for conflicts
        const conflictPenalty = Math.min(conflicts.length * 0.1, 0.5);
        // Boost for agreement (multiple answers, low conflicts)
        const agreementBoost = answers.length > 3 && conflicts.length === 0 ? 0.1 : 0;
        const consensus = Math.max(0, Math.min(1, avgConfidence - conflictPenalty + agreementBoost));
        return Math.round(consensus * 100) / 100; // Round to 2 decimals
    }
    /**
     * Empty knowledge frame
     */
    emptyKnowledgeFrame() {
        return {
            who: '',
            what: '',
            when: '',
            where: '',
            why: '',
            how: '',
            metrics: [],
            caveats: [],
            exceptions: [],
        };
    }
}
exports.FusionTool = FusionTool;
// ============================================================================
// FACTORY
// ============================================================================
function createFusionTool() {
    return new FusionTool();
}
//# sourceMappingURL=fusion.js.map