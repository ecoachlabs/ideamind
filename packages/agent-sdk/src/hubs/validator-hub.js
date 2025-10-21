"use strict";
/**
 * Validator Hub (QV-Hub)
 *
 * Central hub that spawns phase-specific Validator agents (referees).
 * Each validator uses rubric scoring to accept/reject Q/A bindings.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Validator = exports.ValidatorHub = void 0;
const base_agent_1 = require("../base-agent");
const llm_1 = require("../llm");
const contradiction_scan_1 = require("../../../tool-sdk/src/tools/guard/contradiction-scan");
// ============================================================================
// VALIDATOR HUB
// ============================================================================
class ValidatorHub {
    phaseConfigs;
    constructor() {
        this.phaseConfigs = new Map();
        this.initializePhaseConfigs();
    }
    /**
     * Spawn a phase-specific Validator
     */
    spawn(phase, runId) {
        const config = this.phaseConfigs.get(phase.toUpperCase());
        if (!config) {
            throw new Error(`Unknown phase: ${phase}. Cannot spawn Validator.`);
        }
        return new Validator({
            agentId: `QV-${phase.toUpperCase()}-${Date.now()}`,
            agentType: 'validator',
            phase,
            toolPolicy: config.toolPolicy,
            llmConfig: {
                model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
                temperature: 0.3, // Low temperature for consistent scoring
                maxTokens: 4096,
            },
            systemPrompt: config.systemPrompt,
            rubric: config.rubric,
            runId,
        });
    }
    /**
     * Initialize phase-specific configurations
     */
    initializePhaseConfigs() {
        // Default rubric thresholds (same across all phases)
        const defaultRubric = {
            grounding: 0.85,
            completeness: 0.80,
            specificity: 0.75,
            consistency: 1.0, // Must be perfect - no conflicts
        };
        // All phases use the same rubric but different tools
        const phaseList = [
            'INTAKE', 'IDEATION', 'CRITIQUE', 'PRD', 'BIZDEV', 'ARCH',
            'BUILD', 'CODING', 'QA', 'AESTHETIC', 'RELEASE', 'BETA'
        ];
        phaseList.forEach((phase) => {
            this.phaseConfigs.set(phase, {
                systemPrompt: `You are the ${phase} Question Validator (Referee).
Bind questions to acceptable answers using rubric scores:

1. Grounding ≥ 0.85: Citations to approved artifacts/tools
2. Completeness ≥ 0.8: Fully addresses question, no hand-waving
3. Specificity ≥ 0.75: Concrete units/targets/examples
4. Consistency = 1.0: No conflicts with existing Knowledge Map

Decision:
- ACCEPT if all thresholds met
- REJECT with machine-readable reasons and fix hints

Output JSON only (schema: qna.bindings.v1)`,
                rubric: defaultRubric,
                toolPolicy: {
                    allowedTools: [
                        'guard.citationCheck', // Verify grounding score
                        'guard.contradictionScan', // Detect conflicts with KM
                        'guard.quantSanity', // Validate numeric answers
                        'tool.core.vectorsearch', // Search existing KM
                    ],
                    maxToolInvocations: 4,
                    voiThreshold: 0.2, // Lower threshold - validation is critical
                },
            });
        });
    }
}
exports.ValidatorHub = ValidatorHub;
// ============================================================================
// VALIDATOR (Phase-specific)
// ============================================================================
class Validator extends base_agent_1.BaseAgent {
    llm;
    systemPrompt;
    rubric;
    runId;
    contradictionTool;
    constructor(config) {
        super(config);
        this.systemPrompt = config.systemPrompt;
        this.rubric = config.rubric;
        this.runId = config.runId;
        // Create LLM provider from factory (supports OpenAI, Anthropic, Google)
        this.llm = llm_1.LLMFactory.createProvider(config.phase, 'validator');
        // Create contradiction scan tool
        this.contradictionTool = new contradiction_scan_1.ContradictionScanTool(config.phase);
    }
    async plan(input) {
        return {
            steps: [
                {
                    stepId: '1',
                    action: 'compute_grounding_score',
                    description: 'Use guard.citationCheck to verify evidence quality',
                },
                {
                    stepId: '2',
                    action: 'compute_completeness_score',
                    description: 'Assess if answer fully addresses question',
                },
                {
                    stepId: '3',
                    action: 'compute_specificity_score',
                    description: 'Check for concrete units/targets/examples',
                },
                {
                    stepId: '4',
                    action: 'check_consistency',
                    description: 'Use guard.contradictionScan to detect conflicts',
                },
                {
                    stepId: '5',
                    action: 'decide',
                    description: 'Accept/reject based on rubric thresholds',
                },
            ],
            estimatedCostUsd: 0.1,
            estimatedDurationMs: 30000,
        };
    }
    async reason(plan, input) {
        const questionAnswerPairs = input.pairs || [];
        const dbPool = input.context?.dbPool;
        // Step 1: Run contradiction detection on all pairs (if dbPool available)
        let contradictionResults = new Map();
        let contradictionCost = 0;
        if (dbPool) {
            console.log(`[Validator] Running contradiction detection on ${questionAnswerPairs.length} pairs...`);
            for (const pair of questionAnswerPairs) {
                try {
                    const toolResult = await this.contradictionTool.execute({
                        question: pair.question?.text || pair.question,
                        answer: pair.answer?.answer || pair.answer,
                        phase: this.config.phase,
                        runId: this.runId,
                        dbPool,
                        useLLM: true,
                    });
                    contradictionResults.set(pair.question_id, toolResult.result);
                    contradictionCost += toolResult.metadata.costUsd || 0;
                }
                catch (error) {
                    console.warn(`[Validator] Contradiction detection failed for ${pair.question_id}:`, error);
                    // Use permissive default (no conflicts)
                    contradictionResults.set(pair.question_id, {
                        consistencyScore: 1.0,
                        conflictsDetected: false,
                        conflictCount: 0,
                        conflicts: [],
                    });
                }
            }
        }
        // Step 2: Build validation prompt (include contradiction results)
        const prompt = this.buildValidationPrompt(questionAnswerPairs, contradictionResults);
        try {
            const response = await this.llm.invoke({
                prompt,
                systemPrompt: this.systemPrompt,
            });
            const bindings = this.parseBindings(response.content, questionAnswerPairs);
            // Step 3: Override consistency scores with contradiction tool results
            const enhancedBindings = bindings.map((binding) => {
                const contradictionResult = contradictionResults.get(binding.question_id);
                if (contradictionResult) {
                    // Override consistency score
                    binding.score_consistency = contradictionResult.consistencyScore;
                    // Add conflict details to reasons/hints if conflicts detected
                    if (contradictionResult.conflictsDetected) {
                        binding.reasons.push('consistency_conflicts_detected');
                        for (const conflict of contradictionResult.conflicts.slice(0, 3)) {
                            binding.hints.push(`Conflict with ${conflict.existingQuestionId}: ${conflict.conflictDescription}`);
                        }
                        // Force reject if consistency threshold not met
                        if (binding.score_consistency < this.rubric.consistency) {
                            binding.decision = 'reject';
                        }
                    }
                }
                return binding;
            });
            const acceptedCount = enhancedBindings.filter((b) => b.decision === 'accept').length;
            const needsImprovement = acceptedCount < questionAnswerPairs.length * 0.6; // Less than 60% acceptance
            return {
                content: JSON.stringify({ bindings: enhancedBindings }),
                confidence: 0.9,
                needsImprovement,
                reasoning: `Validated ${enhancedBindings.length} pairs using ${response.provider}/${response.model}: ${acceptedCount} accepted, ${enhancedBindings.length - acceptedCount} rejected. Contradiction detection: ${contradictionResults.size} pairs checked.`,
                costUsd: response.costUsd + contradictionCost,
                tokensUsed: response.tokensUsed.total,
            };
        }
        catch (error) {
            console.warn(`[Validator] LLM failed, using fallback:`, error);
            return this.fallbackValidation(questionAnswerPairs);
        }
    }
    /**
     * Build validation prompt
     */
    buildValidationPrompt(pairs, contradictionResults) {
        return `${this.systemPrompt}

**Phase**: ${this.config.phase.toUpperCase()}
**Run ID**: ${this.runId}

**Rubric Thresholds**:
- Grounding: ≥ ${this.rubric.grounding} (Citations to approved artifacts)
- Completeness: ≥ ${this.rubric.completeness} (Fully addresses question)
- Specificity: ≥ ${this.rubric.specificity} (Concrete units/targets/examples)
- Consistency: = ${this.rubric.consistency} (No conflicts with existing KM)

**Question-Answer Pairs to Validate**:
${pairs.map((pair, idx) => {
            const contradictionResult = contradictionResults?.get(pair.question_id);
            const conflictInfo = contradictionResult && contradictionResult.conflictsDetected
                ? `\n- ⚠️ CONFLICTS DETECTED: ${contradictionResult.conflictCount} conflicts found:\n${contradictionResult.conflicts.slice(0, 2).map((c) => `    • ${c.conflictDescription}`).join('\n')}`
                : '';
            return `
**Pair ${idx + 1}**:
- Question ID: ${pair.question_id}
- Question: ${pair.question}
- Answer ID: ${pair.answer_id}
- Answer: ${pair.answer}
- Evidence IDs: ${(pair.evidence_ids || []).join(', ') || 'None'}
- Assumptions: ${(pair.assumptions || []).join(', ') || 'None'}
- Confidence: ${pair.confidence || 'N/A'}${conflictInfo}
`;
        }).join('\n')}

**Your Task**:
For each Q/A pair, score the 4 dimensions (0.0-1.0) and decide ACCEPT/REJECT:

**Grounding** (0.0-1.0):
- 1.0: Every claim cited with evidence_id
- 0.8: Most claims cited, some assumptions marked
- 0.6: Some citations, many assumptions
- 0.0: No citations or evidence

**Completeness** (0.0-1.0):
- 1.0: Fully answers the question with no gaps
- 0.8: Mostly complete, minor aspects unaddressed
- 0.6: Partial answer, missing key points
- 0.0: Does not address the question

**Specificity** (0.0-1.0):
- 1.0: Concrete units, targets, examples (e.g., "< 200ms", "10K users")
- 0.8: Mostly specific with some vague statements
- 0.6: Some specifics, mostly general
- 0.0: Completely vague and hand-wavy

**Consistency** (0.0 or 1.0):
- 1.0: No conflicts detected with existing KM
- 0.0: Conflicts detected (e.g., different values for same question)

**Decision**:
- ACCEPT: All thresholds met
- REJECT: One or more thresholds NOT met

**Output Format** (JSON only):
{
  "bindings": [
    {
      "question_id": "Q-PRD-001",
      "answer_id": "A-PRD-001",
      "score_grounding": 0.90,
      "score_completeness": 0.85,
      "score_specificity": 0.80,
      "score_consistency": 1.0,
      "decision": "accept",
      "reasons": [],
      "hints": []
    },
    {
      "question_id": "Q-PRD-002",
      "answer_id": "A-PRD-002",
      "score_grounding": 0.60,
      "score_completeness": 0.75,
      "score_specificity": 0.70,
      "score_consistency": 1.0,
      "decision": "reject",
      "reasons": ["grounding_below_threshold"],
      "hints": ["Add citations to PRD artifacts. Current: 0.60, Required: ${this.rubric.grounding}"]
    }
  ]
}

If REJECT, provide machine-readable reasons and actionable hints for improvement.

Respond ONLY with JSON. No markdown, no explanation.`;
    }
    /**
     * Parse bindings from LLM response
     */
    parseBindings(responseText, pairs) {
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            const parsed = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed.bindings)) {
                throw new Error('Invalid format: bindings array not found');
            }
            return parsed.bindings.map((b) => ({
                question_id: b.question_id || 'unknown',
                answer_id: b.answer_id || 'unknown',
                score_grounding: this.clampScore(b.score_grounding),
                score_completeness: this.clampScore(b.score_completeness),
                score_specificity: this.clampScore(b.score_specificity),
                score_consistency: this.clampScore(b.score_consistency),
                decision: b.decision === 'accept' ? 'accept' : 'reject',
                reasons: Array.isArray(b.reasons) ? b.reasons.slice(0, 5) : [],
                hints: Array.isArray(b.hints) ? b.hints.slice(0, 5) : [],
            }));
        }
        catch (error) {
            console.warn('[Validator] Failed to parse bindings:', error);
            throw error;
        }
    }
    /**
     * Clamp score to 0-1 range
     */
    clampScore(score) {
        const num = typeof score === 'number' ? score : 0.5;
        return Math.max(0, Math.min(1, num));
    }
    /**
     * Fallback validation if LLM fails
     */
    fallbackValidation(pairs) {
        const fallbackBindings = pairs.map((pair) => ({
            question_id: pair.question_id,
            answer_id: pair.answer_id,
            score_grounding: 0.5,
            score_completeness: 0.5,
            score_specificity: 0.5,
            score_consistency: 0.0,
            decision: 'reject',
            reasons: ['llm_unavailable'],
            hints: ['Manual review required - LLM validation service unavailable'],
        }));
        return {
            content: JSON.stringify({ bindings: fallbackBindings }),
            confidence: 0.1,
            needsImprovement: true,
            reasoning: `Fallback validation (LLM unavailable)`,
            costUsd: 0,
            tokensUsed: 0,
        };
    }
    async generateArtifacts(result, input) {
        const bindings = JSON.parse(result.content).bindings;
        return [
            {
                type: 'bindings',
                content: bindings,
            },
        ];
    }
}
exports.Validator = Validator;
//# sourceMappingURL=validator-hub.js.map