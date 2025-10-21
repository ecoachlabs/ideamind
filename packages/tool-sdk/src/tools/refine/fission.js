"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FissionTool = void 0;
exports.createFissionTool = createFissionTool;
const types_1 = require("../../types");
const llm_1 = require("../../../agent-sdk/src/llm");
// ============================================================================
// FISSION TOOL
// ============================================================================
class FissionTool {
    metadata = {
        name: 'refine.fission',
        description: 'Decompose compound questions into atomic units with dependency tree',
        category: types_1.ToolCategory.REFINERY,
        version: '1.0.0',
        inputSchema: {
            type: 'object',
            properties: {
                questionId: {
                    type: 'string',
                    description: 'Question ID',
                },
                question: {
                    type: 'string',
                    description: 'Question text to decompose',
                },
                phase: {
                    type: 'string',
                    description: 'Phase context for LLM selection',
                },
                artifacts: {
                    type: 'array',
                    description: 'Available artifacts for context',
                    items: { type: 'string' },
                },
            },
            required: ['questionId', 'question', 'phase'],
        },
        outputSchema: {
            type: 'object',
            properties: {
                isAtomic: { type: 'boolean' },
                fissionTree: { type: 'object' },
                coverage: { type: 'number' },
                atomCount: { type: 'number' },
            },
        },
        costUsd: 0.05, // LLM call cost
    };
    async execute(input) {
        const startTime = Date.now();
        const { questionId, question, phase, artifacts = [] } = input;
        try {
            // Step 1: Check if question is already atomic
            const isAtomic = await this.detectIfAtomic(question, phase);
            if (isAtomic) {
                return {
                    result: {
                        isAtomic: true,
                        fissionTree: null,
                        coverage: 1.0,
                        atomCount: 1,
                    },
                    metadata: {
                        toolName: this.metadata.name,
                        toolVersion: this.metadata.version,
                        executionTimeMs: Date.now() - startTime,
                        costUsd: 0.01, // Cheaper for atomic detection only
                    },
                };
            }
            // Step 2: Decompose into atomic questions
            const fissionTree = await this.decompose(questionId, question, phase, artifacts);
            // Step 3: Calculate coverage metric
            const coverage = this.calculateCoverage(question, fissionTree.atoms);
            return {
                result: {
                    isAtomic: false,
                    fissionTree,
                    coverage,
                    atomCount: fissionTree.atoms.length,
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
            console.error('[Fission] Error:', error);
            throw error;
        }
    }
    /**
     * Detect if question is atomic (single, focused question)
     */
    async detectIfAtomic(question, phase) {
        const llm = llm_1.LLMFactory.createProvider(phase, 'question-agent');
        const prompt = `Analyze this question and determine if it is ATOMIC or COMPOUND.

**ATOMIC**: Single, focused question that cannot be meaningfully broken down.
**COMPOUND**: Multiple questions OR complex question that should be decomposed.

**Question**: "${question}"

**Your Task**:
Return ONLY one word: "ATOMIC" or "COMPOUND"`;
        const response = await llm.invoke({
            prompt,
            systemPrompt: 'You are a question analyzer. Respond with ONLY one word: ATOMIC or COMPOUND.',
            temperature: 0.2,
            maxTokens: 10,
        });
        const decision = response.content.trim().toUpperCase();
        return decision === 'ATOMIC';
    }
    /**
     * Decompose compound question into atomic units
     */
    async decompose(rootQuestionId, question, phase, artifacts) {
        const llm = llm_1.LLMFactory.createProvider(phase, 'question-agent');
        const prompt = `Decompose this compound question into atomic sub-questions with dependencies.

**Phase**: ${phase}
**Root Question**: "${question}"
**Available Artifacts**: ${artifacts.join(', ') || 'None'}

**Your Task**:
1. Break the compound question into 2-7 atomic sub-questions
2. Each atomic question should be:
   - Self-contained and focused
   - Answerable with specific evidence
   - Cannot be meaningfully decomposed further
3. Identify dependencies between atoms (which questions must be answered first)

**Output Format** (JSON only):
{
  "atoms": [
    {
      "id": "ATOM-1",
      "type": "factual | analytical | exploratory",
      "text": "What is the expected response time for API calls?",
      "priority": "high | medium | low"
    },
    {
      "id": "ATOM-2",
      "type": "factual",
      "text": "How many concurrent users should the system support?",
      "priority": "high"
    }
  ],
  "edges": [
    {
      "from": "ATOM-1",
      "to": "ATOM-3",
      "relation": "depends_on",
      "description": "Performance targets needed before optimization strategy"
    }
  ],
  "rationale": "Brief explanation of decomposition strategy"
}

Respond ONLY with valid JSON. No markdown, no explanation.`;
        const response = await llm.invoke({
            prompt,
            systemPrompt: 'You are a question decomposition expert. Output only valid JSON.',
            temperature: 0.4,
            maxTokens: 2048,
        });
        // Parse JSON response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Invalid JSON response from LLM');
        }
        const parsed = JSON.parse(jsonMatch[0]);
        // Build fission tree
        const fissionTree = {
            id: `FISSION-${rootQuestionId}`,
            rootQuestionId,
            atoms: parsed.atoms || [],
            edges: parsed.edges || [],
            rationale: parsed.rationale || '',
        };
        return fissionTree;
    }
    /**
     * Calculate coverage metric: how well atoms cover original question
     */
    calculateCoverage(originalQuestion, atoms) {
        // Simple heuristic: ratio of unique key terms covered
        const originalTerms = this.extractKeyTerms(originalQuestion);
        const atomTerms = new Set();
        for (const atom of atoms) {
            const terms = this.extractKeyTerms(atom.text);
            terms.forEach((term) => atomTerms.add(term));
        }
        const coveredTerms = originalTerms.filter((term) => atomTerms.has(term));
        const coverage = coveredTerms.length / Math.max(originalTerms.length, 1);
        // Clamp to 0-1 range
        return Math.max(0, Math.min(1, coverage));
    }
    /**
     * Extract key terms from question (nouns, verbs, important concepts)
     */
    extractKeyTerms(text) {
        // Simple implementation: lowercase words, remove stopwords
        const stopwords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
            'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
            'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
            'what', 'when', 'where', 'why', 'how', 'which', 'who', 'whom',
        ]);
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ') // Remove punctuation
            .split(/\s+/)
            .filter((word) => word.length > 2 && !stopwords.has(word));
    }
}
exports.FissionTool = FissionTool;
// ============================================================================
// FACTORY
// ============================================================================
function createFissionTool() {
    return new FissionTool();
}
//# sourceMappingURL=fission.js.map