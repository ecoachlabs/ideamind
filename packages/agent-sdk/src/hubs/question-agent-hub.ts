/**
 * Question Agent Hub (QAQ-Hub)
 *
 * Central hub that spawns phase-specific Question Agents.
 * Each phase gets a specialized QAQ agent with phase-appropriate prompts and tools.
 */

import {
  AgentConfig,
  AgentInput,
  AgentOutput,
  ExecutionPlan,
  ReasoningResult,
} from '../types';
import { BaseAgent } from '../base-agent';
import { ILLMProvider, LLMFactory } from '../llm';

// ============================================================================
// QUESTION AGENT HUB
// ============================================================================

export class QuestionAgentHub {
  private phaseConfigs: Map<string, PhaseQuestionConfig>;

  constructor() {
    this.phaseConfigs = new Map();
    this.initializePhaseConfigs();
  }

  /**
   * Spawn a phase-specific Question Agent
   */
  spawn(phase: string, runId: string): QuestionAgent {
    const config = this.phaseConfigs.get(phase.toUpperCase());

    if (!config) {
      throw new Error(`Unknown phase: ${phase}. Cannot spawn Question Agent.`);
    }

    return new QuestionAgent({
      agentId: `QAQ-${phase.toUpperCase()}-${Date.now()}`,
      agentType: 'question-agent',
      phase,
      toolPolicy: config.toolPolicy,
      llmConfig: {
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 4096,
      },
      systemPrompt: config.systemPrompt,
      priorityThemes: config.priorityThemes,
      runId,
    });
  }

  /**
   * Initialize phase-specific configurations
   */
  private initializePhaseConfigs(): void {
    // INTAKE phase questions
    this.phaseConfigs.set('INTAKE', {
      systemPrompt: `You are the INTAKE Question Agent.
Generate high-impact questions about:
- User personas and target audience
- Problem clarity and market validation
- Scope boundaries and constraints
- Feasibility and resource requirements
- Compliance and regulatory considerations

Focus on questions that would materially change the project direction if answered differently.`,

      priorityThemes: ['user', 'scope', 'feasibility', 'compliance'],

      toolPolicy: {
        allowedTools: [
          'tool.core.vectorsearch',  // RAG over past projects
          'tool.intake.priorart',    // Find similar prior work
        ],
        maxToolInvocations: 2,
        voiThreshold: 0.4,
      },
    });

    // IDEATION phase questions
    this.phaseConfigs.set('IDEATION', {
      systemPrompt: `You are the IDEATION Question Agent.
Generate high-impact questions about:
- Use cases and user journeys
- Value propositions and differentiation
- Edge cases and failure modes
- Success metrics and KPIs
- Adoption barriers and change management

Challenge assumptions and probe for hidden complexity.`,

      priorityThemes: ['use-cases', 'kpis', 'edge-cases', 'adoption'],

      toolPolicy: {
        allowedTools: [
          'tool.core.vectorsearch',
          'tool.ideation.analogy',  // Find patterns from other domains
        ],
        maxToolInvocations: 2,
        voiThreshold: 0.4,
      },
    });

    // CRITIQUE phase questions
    this.phaseConfigs.set('CRITIQUE', {
      systemPrompt: `You are the CRITIQUE Question Agent.
Generate adversarial questions that stress-test assumptions:
- What could go catastrophically wrong?
- Which assumptions are fragile or unverified?
- What are we blindspots and biases?
- How might competitors clone or surpass this?
- What are the unintended consequences?

Be sharply critical and look for weak points.`,

      priorityThemes: ['risks', 'assumptions', 'threats', 'failure-modes'],

      toolPolicy: {
        allowedTools: [
          'tool.core.vectorsearch',
          'tool.critique.premortem',
          'tool.critique.attackTree',
        ],
        maxToolInvocations: 3,
        voiThreshold: 0.3,
      },
    });

    // PRD phase questions
    this.phaseConfigs.set('PRD', {
      systemPrompt: `You are the PRD Question Agent.
Generate questions about:
- Requirements completeness and traceability
- Acceptance criteria clarity and testability
- NFRs and quality attributes
- Stakeholder alignment and sign-off
- Design decisions and trade-offs

Ensure every requirement is traceable, measurable, and testable.`,

      priorityThemes: ['requirements', 'acceptance-criteria', 'nfrs', 'traceability'],

      toolPolicy: {
        allowedTools: [
          'tool.core.vectorsearch',
          'tool.prd.traceMatrix',
          'guard.AC_lint',
        ],
        maxToolInvocations: 3,
        voiThreshold: 0.4,
      },
    });

    // QA phase questions
    this.phaseConfigs.set('QA', {
      systemPrompt: `You are the QA Question Agent.
Generate questions about:
- Test coverage and adequacy
- Edge cases and error handling
- Performance and scalability
- Security and vulnerability testing
- Regression and flaky test management

Probe for untested scenarios and quality risks.`,

      priorityThemes: ['test-coverage', 'edge-cases', 'performance', 'security'],

      toolPolicy: {
        allowedTools: [
          'tool.core.vectorsearch',
          'tool.qa.coverageMerge',
          'tool.qa.flakyTriager',
        ],
        maxToolInvocations: 3,
        voiThreshold: 0.3,
      },
    });

    // RELEASE phase questions
    this.phaseConfigs.set('RELEASE', {
      systemPrompt: `You are the RELEASE Question Agent.
Generate questions about:
- Deployment readiness and rollback plans
- Monitoring and observability
- Documentation and runbooks
- Migration and backward compatibility
- Success criteria and rollout strategy

Ensure nothing is missed before production release.`,

      priorityThemes: ['deployment', 'monitoring', 'rollback', 'migration'],

      toolPolicy: {
        allowedTools: [
          'tool.core.vectorsearch',
          'tool.release.rollbackPlan',
          'tool.release.canaryRules',
        ],
        maxToolInvocations: 2,
        voiThreshold: 0.4,
      },
    });

    // BIZDEV phase questions
    this.phaseConfigs.set('BIZDEV', {
      systemPrompt: `You are the BIZDEV Question Agent.
Generate high-impact questions about:
- Market positioning and go-to-market strategy
- Pricing models and monetization
- Partnership and channel opportunities
- Competitive differentiation and moats
- Sales enablement and customer acquisition

Focus on business viability and revenue generation.`,

      priorityThemes: ['market', 'pricing', 'partnerships', 'competition'],

      toolPolicy: {
        allowedTools: [
          'tool.core.vectorsearch',
          'tool.bizdev.marketSize',
          'tool.bizdev.compAnalysis',
        ],
        maxToolInvocations: 3,
        voiThreshold: 0.4,
      },
    });

    // ARCH phase questions
    this.phaseConfigs.set('ARCH', {
      systemPrompt: `You are the ARCH Question Agent.
Generate high-impact questions about:
- System architecture and component design
- Technology stack and framework choices
- Scalability and performance requirements
- Security architecture and threat modeling
- Integration patterns and API design
- Data architecture and storage strategy

Challenge design decisions and probe for architectural risks.`,

      priorityThemes: ['architecture', 'scalability', 'security', 'integration'],

      toolPolicy: {
        allowedTools: [
          'tool.core.vectorsearch',
          'tool.arch.dependencyGraph',
          'tool.arch.threatModel',
        ],
        maxToolInvocations: 3,
        voiThreshold: 0.3,
      },
    });

    // BUILD phase questions
    this.phaseConfigs.set('BUILD', {
      systemPrompt: `You are the BUILD Question Agent.
Generate high-impact questions about:
- Build system and toolchain setup
- Dependency management and versioning
- CI/CD pipeline configuration
- Environment configuration and secrets management
- Build optimization and caching strategies
- Artifact generation and distribution

Ensure build process is reproducible and efficient.`,

      priorityThemes: ['build', 'ci-cd', 'dependencies', 'optimization'],

      toolPolicy: {
        allowedTools: [
          'tool.core.vectorsearch',
          'tool.build.depAudit',
          'tool.build.cacheAnalyze',
        ],
        maxToolInvocations: 2,
        voiThreshold: 0.4,
      },
    });

    // CODING phase questions
    this.phaseConfigs.set('CODING', {
      systemPrompt: `You are the CODING Question Agent.
Generate high-impact questions about:
- Code structure and module organization
- Design patterns and best practices
- Error handling and edge case coverage
- Code quality and maintainability
- Technical debt and refactoring needs
- API contracts and interface design

Probe for code smells and maintainability risks.`,

      priorityThemes: ['code-quality', 'patterns', 'maintainability', 'interfaces'],

      toolPolicy: {
        allowedTools: [
          'tool.core.vectorsearch',
          'tool.coding.linter',
          'tool.coding.complexityCheck',
        ],
        maxToolInvocations: 3,
        voiThreshold: 0.3,
      },
    });

    // AESTHETIC phase questions
    this.phaseConfigs.set('AESTHETIC', {
      systemPrompt: `You are the AESTHETIC Question Agent.
Generate high-impact questions about:
- UI/UX design consistency and accessibility
- Visual design system and component library
- Responsive design and cross-platform support
- User interaction patterns and micro-interactions
- Performance perception and loading states
- Brand alignment and visual identity

Focus on user experience and visual quality.`,

      priorityThemes: ['ui-ux', 'accessibility', 'design-system', 'responsiveness'],

      toolPolicy: {
        allowedTools: [
          'tool.core.vectorsearch',
          'tool.aesthetic.a11yCheck',
          'tool.aesthetic.designLint',
        ],
        maxToolInvocations: 3,
        voiThreshold: 0.4,
      },
    });

    // BETA phase questions
    this.phaseConfigs.set('BETA', {
      systemPrompt: `You are the BETA Question Agent.
Generate high-impact questions about:
- Beta user recruitment and selection
- Feedback collection mechanisms
- Success metrics and experiment tracking
- Issue triage and bug prioritization
- Feature flag management and rollout
- User onboarding and documentation

Ensure beta program yields actionable insights.`,

      priorityThemes: ['beta-testing', 'feedback', 'metrics', 'experiments'],

      toolPolicy: {
        allowedTools: [
          'tool.core.vectorsearch',
          'tool.beta.feedbackAnalyze',
          'tool.beta.cohortSegment',
        ],
        maxToolInvocations: 2,
        voiThreshold: 0.4,
      },
    });
  }
}

// ============================================================================
// PHASE QUESTION CONFIG
// ============================================================================

interface PhaseQuestionConfig {
  systemPrompt: string;
  priorityThemes: string[];
  toolPolicy: {
    allowedTools: string[];
    maxToolInvocations: number;
    voiThreshold: number;
  };
}

// ============================================================================
// QUESTION AGENT (Phase-specific)
// ============================================================================

class QuestionAgent extends BaseAgent {
  private llm: ILLMProvider;
  private systemPrompt: string;
  private priorityThemes: string[];
  private runId: string;

  constructor(
    config: AgentConfig & { systemPrompt: string; priorityThemes: string[]; runId: string }
  ) {
    super(config);
    this.systemPrompt = config.systemPrompt;
    this.priorityThemes = config.priorityThemes;
    this.runId = config.runId;

    // Create LLM provider from factory (supports OpenAI, Anthropic, Google)
    this.llm = LLMFactory.createProvider(config.phase, 'question-agent');
  }

  /**
   * Plan: Determine question generation strategy
   */
  protected async plan(input: AgentInput): Promise<ExecutionPlan> {
    return {
      steps: [
        {
          stepId: '1',
          action: 'analyze_artifacts',
          description: 'Analyze phase artifacts to identify question themes',
        },
        {
          stepId: '2',
          action: 'generate_questions',
          description: 'Generate high-impact, non-overlapping questions',
        },
        {
          stepId: '3',
          action: 'prioritize',
          description: 'Assign priority scores based on impact and urgency',
        },
        {
          stepId: '4',
          action: 'deduplicate',
          description: 'Remove duplicate or low-value questions',
        },
      ],
      estimatedCostUsd: 0.1,
      estimatedDurationMs: 30000,
    };
  }

  /**
   * Reason: Generate questions using LLM
   */
  protected async reason(plan: ExecutionPlan, input: AgentInput): Promise<ReasoningResult> {
    const artifacts = this.extractArtifactsContent(input);
    const prompt = this.buildQuestionPrompt(artifacts);

    try {
      const response = await this.llm.invoke({
        prompt,
        systemPrompt: this.systemPrompt,
      });

      const questions = this.parseQuestions(response.content);

      return {
        content: JSON.stringify({ questions }),
        confidence: questions.length >= 10 ? 0.85 : 0.7,
        needsImprovement: questions.length < 10,
        reasoning: `Generated ${questions.length} questions for ${this.config.phase} phase using ${response.provider}/${response.model}`,
        costUsd: response.costUsd,
        tokensUsed: response.tokensUsed.total,
      };
    } catch (error) {
      console.warn(`[QuestionAgent] LLM failed, using fallback:`, error);
      return this.fallbackQuestions();
    }
  }

  /**
   * Extract artifacts content from input
   */
  private extractArtifactsContent(input: AgentInput): string {
    if (!input.artifacts || input.artifacts.length === 0) {
      return 'No artifacts available';
    }

    return input.artifacts
      .map((artifact) => {
        const content =
          typeof artifact.content === 'string'
            ? artifact.content
            : JSON.stringify(artifact.content, null, 2);
        return `**${artifact.type}**:\n${content}`;
      })
      .join('\n\n');
  }

  /**
   * Build question generation prompt
   */
  private buildQuestionPrompt(artifactsContent: string): string {
    return `${this.systemPrompt}

**Phase**: ${this.config.phase.toUpperCase()}
**Run ID**: ${this.runId}

**Artifacts from this phase**:
${artifactsContent}

**Your Task**:
Generate 15-20 high-impact questions about this phase's artifacts. These questions should:
1. Challenge assumptions and probe for hidden complexity
2. Identify gaps, ambiguities, or inconsistencies
3. Focus on themes: ${this.priorityThemes.join(', ')}
4. Be decision-changing (if answered differently, would materially alter the direction)
5. Be non-overlapping and specific
6. Include dependencies where questions build on each other

**Output Format** (JSON only):
{
  "questions": [
    {
      "id": "Q-${this.config.phase.toUpperCase()}-001",
      "text": "The question text",
      "tags": ["tag1", "tag2"],
      "priority": 0.85,
      "depends_on": []
    }
  ]
}

**Priority Guidelines**:
- 0.90-1.00: Critical, blocking (must answer before proceeding)
- 0.75-0.89: High priority (important for quality)
- 0.60-0.74: Medium priority (nice to clarify)
- Below 0.60: Low priority (can defer)

Respond ONLY with JSON. No markdown, no explanation.`;
  }

  /**
   * Parse questions from LLM response
   */
  private parseQuestions(responseText: string): Array<{
    id: string;
    text: string;
    tags: string[];
    priority: number;
    depends_on: string[];
  }> {
    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!Array.isArray(parsed.questions)) {
        throw new Error('Invalid format: questions array not found');
      }

      return parsed.questions.slice(0, 20).map((q: any, index: number) => ({
        id: q.id || `Q-${this.config.phase.toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
        text: q.text || 'Question text missing',
        tags: Array.isArray(q.tags) ? q.tags.slice(0, 5) : this.priorityThemes.slice(0, 2),
        priority: typeof q.priority === 'number' ? Math.max(0, Math.min(1, q.priority)) : 0.7,
        depends_on: Array.isArray(q.depends_on) ? q.depends_on.slice(0, 3) : [],
      }));
    } catch (error) {
      console.warn('[QuestionAgent] Failed to parse questions:', error);
      throw error;
    }
  }

  /**
   * Fallback questions if LLM fails
   */
  private fallbackQuestions(): ReasoningResult {
    const fallbackQuestions = [
      {
        id: `Q-${this.config.phase.toUpperCase()}-001`,
        text: `What are the critical success criteria for ${this.config.phase} phase?`,
        tags: ['success-criteria', this.priorityThemes[0]],
        priority: 0.85,
        depends_on: [],
      },
      {
        id: `Q-${this.config.phase.toUpperCase()}-002`,
        text: `What assumptions are we making about ${this.priorityThemes[0]}?`,
        tags: ['assumptions', this.priorityThemes[0]],
        priority: 0.8,
        depends_on: [],
      },
      {
        id: `Q-${this.config.phase.toUpperCase()}-003`,
        text: `What are the risks if ${this.priorityThemes[1]} is not addressed?`,
        tags: ['risks', this.priorityThemes[1]],
        priority: 0.75,
        depends_on: [],
      },
    ];

    return {
      content: JSON.stringify({ questions: fallbackQuestions }),
      confidence: 0.5,
      needsImprovement: true,
      reasoning: `Fallback questions (LLM unavailable)`,
      costUsd: 0,
      tokensUsed: 0,
    };
  }


  /**
   * Generate artifacts: Return questions in standard format
   */
  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<Array<{ type: string; content: unknown }>> {
    const questions = JSON.parse(result.content).questions;

    return [
      {
        type: 'questions',
        content: questions,
      },
    ];
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { QuestionAgent };
