"use strict";
/**
 * Answer Agent Hub (QAA-Hub)
 *
 * Central hub that spawns phase-specific Answer Agents.
 * Each phase gets a specialized QAA agent that answers questions with evidence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnswerAgent = exports.AnswerAgentHub = void 0;
const base_agent_1 = require("../base-agent");
const llm_1 = require("../llm");
// ============================================================================
// ANSWER AGENT HUB
// ============================================================================
class AnswerAgentHub {
    phaseConfigs;
    constructor() {
        this.phaseConfigs = new Map();
        this.initializePhaseConfigs();
    }
    /**
     * Spawn a phase-specific Answer Agent
     */
    spawn(phase, runId) {
        const config = this.phaseConfigs.get(phase.toUpperCase());
        if (!config) {
            throw new Error(`Unknown phase: ${phase}. Cannot spawn Answer Agent.`);
        }
        return new AnswerAgent({
            agentId: `QAA-${phase.toUpperCase()}-${Date.now()}`,
            agentType: 'answer-agent',
            phase,
            toolPolicy: config.toolPolicy,
            llmConfig: {
                model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
                temperature: 0.5, // Lower temperature for fact-based answers
                maxTokens: 8192,
            },
            systemPrompt: config.systemPrompt,
            evidenceSources: config.evidenceSources,
            runId,
        });
    }
    /**
     * Initialize phase-specific configurations
     */
    initializePhaseConfigs() {
        // INTAKE phase answers
        this.phaseConfigs.set('INTAKE', {
            systemPrompt: `You are the INTAKE Answer Agent.
Answer questions with evidence from:
- IdeaSpec document
- Market research
- User interviews
- Prior art analysis

Rules:
1. Every claim must cite evidence_id from approved artifacts
2. If evidence is insufficient, mark as ASSUMPTION or UNKNOWN and propose how to obtain it
3. Be precise and measurable (units, targets, examples)
4. Output JSON only (schema: qna.answers.v1)`,
            evidenceSources: ['IdeaSpec', 'MarketResearch', 'UserInterview'],
            toolPolicy: {
                allowedTools: [
                    'tool.core.vectorsearch', // RAG over artifacts
                    'guard.claimMiner', // Extract claims
                    'guard.sourceTagger', // Tag evidence
                    'guard.citationCheck', // Verify grounding
                ],
                maxToolInvocations: 4,
                voiThreshold: 0.3,
            },
        });
        // PRD phase answers
        this.phaseConfigs.set('PRD', {
            systemPrompt: `You are the PRD Answer Agent.
Answer questions with evidence from:
- PRD document
- User stories
- Acceptance criteria
- NFR specifications
- Traceability matrix

Every answer must be traceable to specific requirements.`,
            evidenceSources: ['PRD', 'UserStory', 'AcceptanceCriteria', 'NFR', 'TraceabilityMatrix'],
            toolPolicy: {
                allowedTools: [
                    'tool.core.vectorsearch',
                    'tool.prd.traceMatrix',
                    'guard.claimMiner',
                    'guard.sourceTagger',
                    'guard.citationCheck',
                    'guard.AC_lint',
                ],
                maxToolInvocations: 5,
                voiThreshold: 0.3,
            },
        });
        // QA phase answers
        this.phaseConfigs.set('QA', {
            systemPrompt: `You are the QA Answer Agent.
Answer questions with evidence from:
- Test specifications
- Test execution results
- Coverage reports
- Performance benchmarks
- Security scan results

Provide concrete metrics and pass/fail criteria.`,
            evidenceSources: ['TestSpec', 'TestResults', 'CoverageReport', 'PerformanceReport', 'SecurityScan'],
            toolPolicy: {
                allowedTools: [
                    'tool.core.vectorsearch',
                    'tool.qa.coverageMerge',
                    'tool.qa.flakyTriager',
                    'guard.claimMiner',
                    'guard.citationCheck',
                ],
                maxToolInvocations: 4,
                voiThreshold: 0.3,
            },
        });
        // IDEATION phase answers
        this.phaseConfigs.set('IDEATION', {
            systemPrompt: `You are the IDEATION Answer Agent.
Answer questions with evidence from:
- Use case documents
- User journey maps
- Value proposition canvas
- Success metrics definitions
- Competitive analysis

Ground all claims in concrete examples and data.`,
            evidenceSources: ['UseCase', 'UserJourney', 'ValueProp', 'SuccessMetrics', 'CompetitiveAnalysis'],
            toolPolicy: {
                allowedTools: [
                    'tool.core.vectorsearch',
                    'tool.ideation.analogy',
                    'guard.claimMiner',
                    'guard.sourceTagger',
                    'guard.citationCheck',
                ],
                maxToolInvocations: 4,
                voiThreshold: 0.3,
            },
        });
        // CRITIQUE phase answers
        this.phaseConfigs.set('CRITIQUE', {
            systemPrompt: `You are the CRITIQUE Answer Agent.
Answer adversarial questions with evidence from:
- Risk assessments
- Threat models
- Premortem analysis
- Assumption logs
- Failure mode analysis

Be honest about risks and unknowns. Mark unverified assumptions clearly.`,
            evidenceSources: ['RiskAssessment', 'ThreatModel', 'Premortem', 'AssumptionLog', 'FailureModeAnalysis'],
            toolPolicy: {
                allowedTools: [
                    'tool.core.vectorsearch',
                    'tool.critique.premortem',
                    'tool.critique.attackTree',
                    'guard.claimMiner',
                    'guard.citationCheck',
                ],
                maxToolInvocations: 5,
                voiThreshold: 0.3,
            },
        });
        // BIZDEV phase answers
        this.phaseConfigs.set('BIZDEV', {
            systemPrompt: `You are the BIZDEV Answer Agent.
Answer questions with evidence from:
- Market research reports
- Pricing models
- Go-to-market strategy
- Competitive positioning
- Partnership agreements
- Revenue projections

Provide data-backed business insights.`,
            evidenceSources: ['MarketResearch', 'PricingModel', 'GTMStrategy', 'CompetitivePosition', 'Partnerships', 'RevenueProjections'],
            toolPolicy: {
                allowedTools: [
                    'tool.core.vectorsearch',
                    'tool.bizdev.marketSize',
                    'tool.bizdev.compAnalysis',
                    'guard.claimMiner',
                    'guard.citationCheck',
                    'guard.quantSanity',
                ],
                maxToolInvocations: 4,
                voiThreshold: 0.3,
            },
        });
        // ARCH phase answers
        this.phaseConfigs.set('ARCH', {
            systemPrompt: `You are the ARCH Answer Agent.
Answer questions with evidence from:
- Architecture diagrams
- Component specifications
- API design documents
- Data models
- Security architecture
- Technology stack decisions

Reference specific architectural components and patterns.`,
            evidenceSources: ['ArchDiagram', 'ComponentSpec', 'APIDesign', 'DataModel', 'SecurityArch', 'TechStack'],
            toolPolicy: {
                allowedTools: [
                    'tool.core.vectorsearch',
                    'tool.arch.dependencyGraph',
                    'tool.arch.threatModel',
                    'guard.claimMiner',
                    'guard.citationCheck',
                ],
                maxToolInvocations: 5,
                voiThreshold: 0.3,
            },
        });
        // BUILD phase answers
        this.phaseConfigs.set('BUILD', {
            systemPrompt: `You are the BUILD Answer Agent.
Answer questions with evidence from:
- Build configuration files
- CI/CD pipeline definitions
- Dependency manifests
- Environment configurations
- Build logs and metrics

Provide concrete configuration examples and build metrics.`,
            evidenceSources: ['BuildConfig', 'CIPipeline', 'Dependencies', 'EnvConfig', 'BuildMetrics'],
            toolPolicy: {
                allowedTools: [
                    'tool.core.vectorsearch',
                    'tool.build.depAudit',
                    'tool.build.cacheAnalyze',
                    'guard.claimMiner',
                    'guard.citationCheck',
                ],
                maxToolInvocations: 4,
                voiThreshold: 0.3,
            },
        });
        // CODING phase answers
        this.phaseConfigs.set('CODING', {
            systemPrompt: `You are the CODING Answer Agent.
Answer questions with evidence from:
- Source code
- Code review comments
- API documentation
- Design pattern implementations
- Linter and static analysis reports

Reference specific code locations and patterns.`,
            evidenceSources: ['SourceCode', 'CodeReview', 'APIDocs', 'DesignPatterns', 'StaticAnalysis'],
            toolPolicy: {
                allowedTools: [
                    'tool.core.vectorsearch',
                    'tool.coding.linter',
                    'tool.coding.complexityCheck',
                    'guard.claimMiner',
                    'guard.citationCheck',
                ],
                maxToolInvocations: 4,
                voiThreshold: 0.3,
            },
        });
        // AESTHETIC phase answers
        this.phaseConfigs.set('AESTHETIC', {
            systemPrompt: `You are the AESTHETIC Answer Agent.
Answer questions with evidence from:
- Design system documentation
- UI component library
- Accessibility audit reports
- Visual regression test results
- User testing feedback

Provide specific design tokens and component references.`,
            evidenceSources: ['DesignSystem', 'ComponentLibrary', 'AccessibilityAudit', 'VisualTests', 'UserFeedback'],
            toolPolicy: {
                allowedTools: [
                    'tool.core.vectorsearch',
                    'tool.aesthetic.a11yCheck',
                    'tool.aesthetic.designLint',
                    'guard.claimMiner',
                    'guard.citationCheck',
                ],
                maxToolInvocations: 4,
                voiThreshold: 0.3,
            },
        });
        // RELEASE phase answers
        this.phaseConfigs.set('RELEASE', {
            systemPrompt: `You are the RELEASE Answer Agent.
Answer questions with evidence from:
- Deployment documentation
- Runbooks and playbooks
- Rollback procedures
- Monitoring dashboards
- Release checklist
- Migration plans

Provide operational specifics and contingency procedures.`,
            evidenceSources: ['DeploymentDocs', 'Runbooks', 'RollbackPlan', 'MonitoringDashboard', 'ReleaseChecklist', 'MigrationPlan'],
            toolPolicy: {
                allowedTools: [
                    'tool.core.vectorsearch',
                    'tool.release.rollbackPlan',
                    'tool.release.canaryRules',
                    'guard.claimMiner',
                    'guard.citationCheck',
                ],
                maxToolInvocations: 4,
                voiThreshold: 0.3,
            },
        });
        // BETA phase answers
        this.phaseConfigs.set('BETA', {
            systemPrompt: `You are the BETA Answer Agent.
Answer questions with evidence from:
- Beta program plans
- Feedback collection data
- Usage analytics
- Issue tracking metrics
- Feature flag configurations
- Experiment results

Ground answers in actual beta program data and metrics.`,
            evidenceSources: ['BetaPlan', 'FeedbackData', 'UsageAnalytics', 'IssueMetrics', 'FeatureFlags', 'ExperimentResults'],
            toolPolicy: {
                allowedTools: [
                    'tool.core.vectorsearch',
                    'tool.beta.feedbackAnalyze',
                    'tool.beta.cohortSegment',
                    'guard.claimMiner',
                    'guard.citationCheck',
                    'guard.quantSanity',
                ],
                maxToolInvocations: 4,
                voiThreshold: 0.3,
            },
        });
    }
}
exports.AnswerAgentHub = AnswerAgentHub;
// ============================================================================
// ANSWER AGENT (Phase-specific)
// ============================================================================
class AnswerAgent extends base_agent_1.BaseAgent {
    llm;
    systemPrompt;
    evidenceSources;
    runId;
    constructor(config) {
        super(config);
        this.systemPrompt = config.systemPrompt;
        this.evidenceSources = config.evidenceSources;
        this.runId = config.runId;
        // Create LLM provider from factory (supports OpenAI, Anthropic, Google)
        this.llm = llm_1.LLMFactory.createProvider(config.phase, 'answer-agent');
    }
    async plan(input) {
        return {
            steps: [
                {
                    stepId: '1',
                    action: 'retrieve_artifacts',
                    description: 'Retrieve relevant artifacts for evidence',
                },
                {
                    stepId: '2',
                    action: 'extract_claims',
                    description: 'Extract claims using guard.claimMiner',
                },
                {
                    stepId: '3',
                    action: 'answer_questions',
                    description: 'Answer each question with cited evidence',
                },
                {
                    stepId: '4',
                    action: 'validate_grounding',
                    description: 'Verify all claims are grounded with guard.citationCheck',
                },
            ],
            estimatedCostUsd: 0.15,
            estimatedDurationMs: 45000,
        };
    }
    async reason(plan, input) {
        const questions = input.questions || [];
        const artifacts = this.extractArtifactsContent(input);
        const prompt = this.buildAnswerPrompt(questions, artifacts);
        try {
            const response = await this.llm.invoke({
                prompt,
                systemPrompt: this.systemPrompt,
            });
            const answers = this.parseAnswers(response.content, questions);
            // Check if answers are well-grounded
            const needsImprovement = this.checkGrounding(answers);
            return {
                content: JSON.stringify({ answers }),
                confidence: answers.length >= questions.length ? 0.85 : 0.7,
                needsImprovement, // If true, analyzer will invoke guard tools
                reasoning: `Generated ${answers.length} answers for ${questions.length} questions using ${response.provider}/${response.model}`,
                costUsd: response.costUsd,
                tokensUsed: response.tokensUsed.total,
            };
        }
        catch (error) {
            console.warn(`[AnswerAgent] LLM failed, using fallback:`, error);
            return this.fallbackAnswers(questions);
        }
    }
    /**
     * Extract artifacts content from input
     */
    extractArtifactsContent(input) {
        if (!input.artifacts || input.artifacts.length === 0) {
            return 'No artifacts available';
        }
        // Filter for relevant evidence sources
        const relevantArtifacts = input.artifacts.filter((artifact) => this.evidenceSources.some((source) => artifact.type.toLowerCase().includes(source.toLowerCase())));
        if (relevantArtifacts.length === 0) {
            // If no filtered artifacts, use all
            return input.artifacts
                .map((artifact, idx) => {
                const content = typeof artifact.content === 'string'
                    ? artifact.content
                    : JSON.stringify(artifact.content, null, 2);
                return `**Artifact ${idx + 1} (${artifact.type}, ID: ${artifact.id || 'N/A'})**:\n${content}`;
            })
                .join('\n\n');
        }
        return relevantArtifacts
            .map((artifact, idx) => {
            const content = typeof artifact.content === 'string'
                ? artifact.content
                : JSON.stringify(artifact.content, null, 2);
            return `**Evidence Source ${idx + 1} (${artifact.type}, ID: ${artifact.id || 'N/A'})**:\n${content}`;
        })
            .join('\n\n');
    }
    /**
     * Build answer generation prompt
     */
    buildAnswerPrompt(questions, artifactsContent) {
        return `${this.systemPrompt}

**Phase**: ${this.config.phase.toUpperCase()}
**Run ID**: ${this.runId}
**Evidence Sources**: ${this.evidenceSources.join(', ')}

**Available Artifacts**:
${artifactsContent}

**Questions to Answer**:
${questions.map((q, idx) => `${idx + 1}. [${q.id}] ${q.text}`).join('\n')}

**Your Task**:
Answer each question with evidence from the artifacts above. For each answer:
1. **Cite specific evidence_ids** (use artifact IDs or create references like "${this.config.phase}-artifact-1")
2. **If evidence is insufficient**: Mark as ASSUMPTION or UNKNOWN and explain what additional evidence is needed
3. **Be precise and measurable**: Include units, targets, specific examples
4. **List assumptions explicitly** if you're making educated guesses
5. **Assign confidence**: 0.0-1.0 based on evidence quality

**Output Format** (JSON only):
{
  "answers": [
    {
      "question_id": "Q-PRD-001",
      "answer": "The specific answer with concrete details...",
      "evidence_ids": ["prd-artifact-1", "user-story-5"],
      "assumptions": ["Assumption 1 if any", "Assumption 2 if any"],
      "confidence": 0.85
    }
  ]
}

**Grounding Rules**:
- Every factual claim MUST cite evidence_id
- If you cannot cite evidence, mark as ASSUMPTION or UNKNOWN
- Confidence < 0.6 for assumptions
- Confidence >= 0.8 for well-evidenced answers

Respond ONLY with JSON. No markdown, no explanation.`;
    }
    /**
     * Parse answers from LLM response
     */
    parseAnswers(responseText, questions) {
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            const parsed = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed.answers)) {
                throw new Error('Invalid format: answers array not found');
            }
            return parsed.answers.map((a) => ({
                question_id: a.question_id || 'unknown',
                answer: a.answer || 'Answer not provided',
                evidence_ids: Array.isArray(a.evidence_ids) ? a.evidence_ids.slice(0, 10) : [],
                assumptions: Array.isArray(a.assumptions) ? a.assumptions.slice(0, 5) : [],
                confidence: typeof a.confidence === 'number' ? Math.max(0, Math.min(1, a.confidence)) : 0.5,
            }));
        }
        catch (error) {
            console.warn('[AnswerAgent] Failed to parse answers:', error);
            throw error;
        }
    }
    /**
     * Check if answers need improvement (guards tools should be invoked)
     */
    checkGrounding(answers) {
        // Need improvement if:
        // 1. Any answer has no evidence_ids
        // 2. Any answer has low confidence
        // 3. Many assumptions
        const poorlyGrounded = answers.filter((a) => a.evidence_ids.length === 0 || a.confidence < 0.6);
        return poorlyGrounded.length > answers.length * 0.3; // More than 30% need improvement
    }
    /**
     * Fallback answers if LLM fails
     */
    fallbackAnswers(questions) {
        const fallbackAnswers = questions.map((q) => ({
            question_id: q.id,
            answer: `Answer pending - LLM unavailable. Evidence needed from ${this.evidenceSources[0]}.`,
            evidence_ids: [],
            assumptions: ['LLM service unavailable, manual review required'],
            confidence: 0.1,
        }));
        return {
            content: JSON.stringify({ answers: fallbackAnswers }),
            confidence: 0.2,
            needsImprovement: true,
            reasoning: `Fallback answers (LLM unavailable)`,
            costUsd: 0,
            tokensUsed: 0,
        };
    }
    async generateArtifacts(result, input) {
        const answers = JSON.parse(result.content).answers;
        return [
            {
                type: 'answers',
                content: answers,
            },
        ];
    }
}
exports.AnswerAgent = AnswerAgent;
//# sourceMappingURL=answer-agent-hub.js.map