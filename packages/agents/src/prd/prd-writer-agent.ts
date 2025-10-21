import { ChatAnthropic } from '@langchain/anthropic';
import {
  BaseAgent,
  AgentInput,
  AgentOutput,
  ExecutionPlan,
  ReasoningResult,
  AgentConfig,
} from '@ideamine/agent-sdk';

/**
 * Product Requirements Document structure
 */
interface ProductRequirementsDocument {
  overview: {
    productName: string;
    version: string;
    lastUpdated: string;
    author: string;
    stakeholders: string[];
  };
  executiveSummary: {
    vision: string;
    objectives: string[];
    successMetrics: string[];
    targetMarket: string;
  };
  productScope: {
    inScope: string[];
    outOfScope: string[];
    futureConsiderations: string[];
  };
  functionalRequirements: {
    id: string;
    category: string;
    requirement: string;
    priority: 'must-have' | 'should-have' | 'nice-to-have';
    rationale: string;
  }[];
  nonFunctionalRequirements: {
    performance: string[];
    security: string[];
    scalability: string[];
    reliability: string[];
    usability: string[];
    compliance: string[];
  };
  userJourneys: {
    persona: string;
    scenario: string;
    steps: string[];
    successCriteria: string[];
  }[];
  technicalConstraints: {
    constraints: string[];
    assumptions: string[];
    dependencies: string[];
  };
  releaseStrategy: {
    phases: {
      name: string;
      timeline: string;
      scope: string[];
      deliverables: string[];
    }[];
  };
}

/**
 * PRDWriterAgent
 *
 * Generates comprehensive Product Requirements Document (PRD) based on
 * previous phases' outputs (IdeaSpec, Strategy, Competitive Analysis, Personas, Critique).
 *
 * Creates:
 * - Executive summary and vision
 * - Product scope (in/out of scope)
 * - Functional requirements (prioritized)
 * - Non-functional requirements (NFRs)
 * - User journeys mapped to personas
 * - Technical constraints and assumptions
 * - Release strategy with phased approach
 *
 * Part of the PRD phase (runs in parallel with other PRD agents).
 */
export class PRDWriterAgent extends BaseAgent {
  private llm: ChatAnthropic;

  constructor(config: AgentConfig) {
    super(config);

    this.llm = new ChatAnthropic({
      modelName: config.llm.model,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
      topP: config.llm.topP,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  protected async plan(input: AgentInput): Promise<ExecutionPlan> {
    return {
      agentId: this.config.id,
      steps: [
        {
          stepId: 'extract-context',
          description: 'Extract context from previous phases',
          estimatedDurationMs: 1000,
          requiredTools: [],
        },
        {
          stepId: 'write-executive-summary',
          description: 'Write executive summary and vision',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
        {
          stepId: 'define-scope',
          description: 'Define product scope boundaries',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
        {
          stepId: 'write-requirements',
          description: 'Write functional and non-functional requirements',
          estimatedDurationMs: 4000,
          requiredTools: [],
        },
        {
          stepId: 'create-user-journeys',
          description: 'Create user journeys for key personas',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
      ],
      estimatedTotalDurationMs: 12000,
      confidence: 0.88,
    };
  }

  protected async reason(
    plan: ExecutionPlan,
    input: AgentInput
  ): Promise<ReasoningResult> {
    const ideaSpec = this.extractData(input, 'ideaSpec');
    const strategy = this.extractData(input, 'strategy');
    const competitive = this.extractData(input, 'competitive');
    const personas = this.extractData(input, 'personas');
    const critique = this.extractData(input, 'critique');

    const prompt = this.buildPRDPrompt(ideaSpec, strategy, competitive, personas, critique);

    try {
      const response = await this.llm.invoke(prompt);
      const prdText = response.content.toString();

      const prd = this.parsePRD(prdText);

      return {
        reasoning: `Generated PRD with ${prd.functionalRequirements.length} functional requirements, ${prd.userJourneys.length} user journeys`,
        confidence: 0.89,
        intermediate: {
          prd,
        },
      };
    } catch (error) {
      console.warn('[PRDWriterAgent] LLM failed, using fallback:', error);
      return this.fallbackPRD();
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const prd: ProductRequirementsDocument = result.intermediate.prd;

    return [
      {
        type: 'product-requirements-document',
        version: '1.0.0',
        content: prd,
        generatedAt: new Date().toISOString(),
        agentId: this.config.id,
      },
    ];
  }

  private extractData(input: AgentInput, key: string): any {
    if (input.data && typeof input.data === 'object') {
      return (input.data as any)[key];
    }
    return null;
  }

  private buildPRDPrompt(
    ideaSpec: any,
    strategy: any,
    competitive: any,
    personas: any,
    critique: any
  ): string {
    return `You are a product manager writing a comprehensive Product Requirements Document (PRD).

**Product Overview:**
Title: ${ideaSpec?.title || 'N/A'}
Description: ${ideaSpec?.description || 'N/A'}
Problem: ${ideaSpec?.problemStatement || 'N/A'}

**Strategy:**
Vision: ${strategy?.vision || 'N/A'}
Differentiators: ${strategy?.differentiators?.join(', ') || 'N/A'}

**Market:**
TAM: ${competitive?.marketSize?.tam || 'N/A'}
Competitors: ${competitive?.competitors?.map((c: any) => c.name).join(', ') || 'N/A'}

**Personas:**
${personas?.personas?.map((p: any) => `- ${p.name}: ${p.quote}`).join('\n') || 'N/A'}

**Critique Summary:**
Overall Recommendation: ${critique?.summary?.overallRecommendation || 'N/A'}
Critical Findings: ${critique?.summary?.criticalFindings || 0}
Risk Level: ${critique?.summary?.riskLevel || 'N/A'}

Generate a comprehensive PRD in JSON format:

{
  "overview": {
    "productName": "${ideaSpec?.title || 'Product'}",
    "version": "1.0.0",
    "lastUpdated": "${new Date().toISOString()}",
    "author": "IdeaMine AI",
    "stakeholders": ["<List key stakeholders>"]
  },
  "executiveSummary": {
    "vision": "<Product vision statement>",
    "objectives": ["<Objective 1>", "<Objective 2>"],
    "successMetrics": ["<Metric 1>", "<Metric 2>"],
    "targetMarket": "<Target market description>"
  },
  "productScope": {
    "inScope": ["<Feature/capability in scope>"],
    "outOfScope": ["<Explicitly excluded>"],
    "futureConsiderations": ["<Future phase ideas>"]
  },
  "functionalRequirements": [
    {
      "id": "FR-001",
      "category": "authentication|core-features|integrations|admin|...",
      "requirement": "<Clear, testable requirement>",
      "priority": "must-have|should-have|nice-to-have",
      "rationale": "<Why this requirement exists>"
    }
  ],
  "nonFunctionalRequirements": {
    "performance": ["<Performance requirement>"],
    "security": ["<Security requirement>"],
    "scalability": ["<Scalability requirement>"],
    "reliability": ["<Reliability requirement>"],
    "usability": ["<Usability requirement>"],
    "compliance": ["<Compliance requirement>"]
  },
  "userJourneys": [
    {
      "persona": "<Persona name>",
      "scenario": "<What user is trying to do>",
      "steps": ["<Step 1>", "<Step 2>"],
      "successCriteria": ["<How we know it succeeded>"]
    }
  ],
  "technicalConstraints": {
    "constraints": ["<Technical constraint>"],
    "assumptions": ["<Technical assumption>"],
    "dependencies": ["<External dependency>"]
  },
  "releaseStrategy": {
    "phases": [
      {
        "name": "MVP|Beta|V1.0|...",
        "timeline": "<Duration estimate>",
        "scope": ["<Feature included in this phase>"],
        "deliverables": ["<Specific deliverable>"]
      }
    ]
  }
}

**Guidelines:**
- Write 20-40 functional requirements across all categories
- Prioritize: 50% must-have, 30% should-have, 20% nice-to-have
- Include all NFR categories (performance, security, scalability, reliability, usability, compliance)
- Create 3-5 user journeys for primary personas
- Define 3-4 release phases (MVP → Beta → V1.0 → Future)
- Be specific and actionable
- Reference critique findings to address risks

Respond ONLY with JSON.`;
  }

  private parsePRD(prdText: string): ProductRequirementsDocument {
    try {
      const jsonMatch = prdText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        overview: {
          productName: parsed.overview?.productName || 'Product',
          version: parsed.overview?.version || '1.0.0',
          lastUpdated: parsed.overview?.lastUpdated || new Date().toISOString(),
          author: parsed.overview?.author || 'IdeaMine AI',
          stakeholders: Array.isArray(parsed.overview?.stakeholders)
            ? parsed.overview.stakeholders.slice(0, 10)
            : [],
        },
        executiveSummary: {
          vision: parsed.executiveSummary?.vision || 'Vision not specified',
          objectives: Array.isArray(parsed.executiveSummary?.objectives)
            ? parsed.executiveSummary.objectives.slice(0, 5)
            : [],
          successMetrics: Array.isArray(parsed.executiveSummary?.successMetrics)
            ? parsed.executiveSummary.successMetrics.slice(0, 5)
            : [],
          targetMarket: parsed.executiveSummary?.targetMarket || 'Target market not specified',
        },
        productScope: {
          inScope: Array.isArray(parsed.productScope?.inScope)
            ? parsed.productScope.inScope.slice(0, 20)
            : [],
          outOfScope: Array.isArray(parsed.productScope?.outOfScope)
            ? parsed.productScope.outOfScope.slice(0, 10)
            : [],
          futureConsiderations: Array.isArray(parsed.productScope?.futureConsiderations)
            ? parsed.productScope.futureConsiderations.slice(0, 10)
            : [],
        },
        functionalRequirements: Array.isArray(parsed.functionalRequirements)
          ? parsed.functionalRequirements.slice(0, 40).map((fr: any, index: number) => ({
              id: fr.id || `FR-${String(index + 1).padStart(3, '0')}`,
              category: fr.category || 'core-features',
              requirement: fr.requirement || 'Requirement not specified',
              priority: this.normalizePriority(fr.priority),
              rationale: fr.rationale || 'Rationale not specified',
            }))
          : [],
        nonFunctionalRequirements: {
          performance: Array.isArray(parsed.nonFunctionalRequirements?.performance)
            ? parsed.nonFunctionalRequirements.performance.slice(0, 5)
            : [],
          security: Array.isArray(parsed.nonFunctionalRequirements?.security)
            ? parsed.nonFunctionalRequirements.security.slice(0, 5)
            : [],
          scalability: Array.isArray(parsed.nonFunctionalRequirements?.scalability)
            ? parsed.nonFunctionalRequirements.scalability.slice(0, 5)
            : [],
          reliability: Array.isArray(parsed.nonFunctionalRequirements?.reliability)
            ? parsed.nonFunctionalRequirements.reliability.slice(0, 5)
            : [],
          usability: Array.isArray(parsed.nonFunctionalRequirements?.usability)
            ? parsed.nonFunctionalRequirements.usability.slice(0, 5)
            : [],
          compliance: Array.isArray(parsed.nonFunctionalRequirements?.compliance)
            ? parsed.nonFunctionalRequirements.compliance.slice(0, 5)
            : [],
        },
        userJourneys: Array.isArray(parsed.userJourneys)
          ? parsed.userJourneys.slice(0, 5).map((uj: any) => ({
              persona: uj.persona || 'User',
              scenario: uj.scenario || 'Scenario not specified',
              steps: Array.isArray(uj.steps) ? uj.steps.slice(0, 10) : [],
              successCriteria: Array.isArray(uj.successCriteria)
                ? uj.successCriteria.slice(0, 5)
                : [],
            }))
          : [],
        technicalConstraints: {
          constraints: Array.isArray(parsed.technicalConstraints?.constraints)
            ? parsed.technicalConstraints.constraints.slice(0, 10)
            : [],
          assumptions: Array.isArray(parsed.technicalConstraints?.assumptions)
            ? parsed.technicalConstraints.assumptions.slice(0, 10)
            : [],
          dependencies: Array.isArray(parsed.technicalConstraints?.dependencies)
            ? parsed.technicalConstraints.dependencies.slice(0, 10)
            : [],
        },
        releaseStrategy: {
          phases: Array.isArray(parsed.releaseStrategy?.phases)
            ? parsed.releaseStrategy.phases.slice(0, 4).map((phase: any) => ({
                name: phase.name || 'Phase',
                timeline: phase.timeline || 'TBD',
                scope: Array.isArray(phase.scope) ? phase.scope.slice(0, 10) : [],
                deliverables: Array.isArray(phase.deliverables)
                  ? phase.deliverables.slice(0, 10)
                  : [],
              }))
            : [],
        },
      };
    } catch (error) {
      console.warn('[PRDWriterAgent] Failed to parse:', error);
      throw error;
    }
  }

  private normalizePriority(priority: string): 'must-have' | 'should-have' | 'nice-to-have' {
    const normalized = priority?.toLowerCase();
    if (normalized?.includes('must')) return 'must-have';
    if (normalized?.includes('should')) return 'should-have';
    return 'nice-to-have';
  }

  private fallbackPRD(): ReasoningResult {
    const prd: ProductRequirementsDocument = {
      overview: {
        productName: 'Product',
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        author: 'IdeaMine AI',
        stakeholders: ['Product Owner', 'Engineering Lead', 'Design Lead'],
      },
      executiveSummary: {
        vision: 'Build a product that solves the identified problem',
        objectives: ['Deliver MVP in first quarter', 'Achieve product-market fit'],
        successMetrics: ['User adoption', 'Customer satisfaction'],
        targetMarket: 'Target users as identified',
      },
      productScope: {
        inScope: ['Core features', 'Basic user management'],
        outOfScope: ['Advanced analytics', 'Third-party integrations'],
        futureConsiderations: ['Mobile apps', 'API platform'],
      },
      functionalRequirements: [
        {
          id: 'FR-001',
          category: 'authentication',
          requirement: 'Users must be able to register and login',
          priority: 'must-have',
          rationale: 'Required for user identification',
        },
        {
          id: 'FR-002',
          category: 'core-features',
          requirement: 'Users must be able to access core functionality',
          priority: 'must-have',
          rationale: 'Primary value proposition',
        },
      ],
      nonFunctionalRequirements: {
        performance: ['Page load time < 2 seconds'],
        security: ['HTTPS encryption', 'Secure authentication'],
        scalability: ['Support 10K concurrent users'],
        reliability: ['99.9% uptime'],
        usability: ['Mobile responsive design'],
        compliance: ['GDPR compliant'],
      },
      userJourneys: [
        {
          persona: 'Primary User',
          scenario: 'First-time user onboarding',
          steps: ['Visit landing page', 'Sign up', 'Complete profile', 'Access main features'],
          successCriteria: ['User completes onboarding in < 5 minutes'],
        },
      ],
      technicalConstraints: {
        constraints: ['Must support modern browsers'],
        assumptions: ['Users have internet connectivity'],
        dependencies: ['Cloud hosting provider'],
      },
      releaseStrategy: {
        phases: [
          {
            name: 'MVP',
            timeline: '3 months',
            scope: ['Core features', 'Basic authentication'],
            deliverables: ['Working application', 'User documentation'],
          },
        ],
      },
    };

    return {
      reasoning: 'Fallback PRD (LLM unavailable)',
      confidence: 0.5,
      intermediate: { prd },
    };
  }
}
