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
 * Tech stack recommendation
 */
interface TechStackRecommendation {
  frontend: {
    framework: string;
    reasoning: string;
    alternatives: string[];
  };
  backend: {
    language: string;
    framework: string;
    reasoning: string;
    alternatives: string[];
  };
  database: {
    primary: string;
    type: 'sql' | 'nosql' | 'hybrid';
    reasoning: string;
    alternatives: string[];
  };
  infrastructure: {
    hosting: string;
    cicd: string;
    monitoring: string;
    reasoning: string;
  };
  additionalServices: Array<{
    service: string;
    purpose: string;
    provider: string;
  }>;
  estimatedCosts: {
    development: string;
    monthly: string;
    scaling: string;
  };
  considerations: string[];
}

/**
 * TechStackRecommenderAgent
 *
 * Recommends optimal technology stack based on:
 * - Project requirements and constraints
 * - Scalability needs
 * - Budget limitations
 * - Team expertise (if known)
 * - Time to market
 *
 * Part of the IDEATION phase (runs in parallel).
 */
export class TechStackRecommenderAgent extends BaseAgent {
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
          stepId: 'analyze-requirements',
          description: 'Analyze technical requirements from IdeaSpec',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
        {
          stepId: 'recommend-stack',
          description: 'Recommend frontend, backend, database, infrastructure',
          estimatedDurationMs: 5000,
          requiredTools: [],
        },
        {
          stepId: 'estimate-costs',
          description: 'Estimate development and hosting costs',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
      ],
      estimatedTotalDurationMs: 10000,
      confidence: 0.85,
    };
  }

  protected async reason(
    plan: ExecutionPlan,
    input: AgentInput
  ): Promise<ReasoningResult> {
    const ideaSpec = this.extractIdeaSpec(input);

    const prompt = this.buildTechStackPrompt(ideaSpec);

    try {
      const response = await this.llm.invoke(prompt);
      const analysisText = response.content.toString();

      const recommendation = this.parseRecommendation(analysisText);

      return {
        reasoning: `Recommended ${recommendation.frontend.framework} + ${recommendation.backend.framework} stack`,
        confidence: 0.88,
        intermediate: {
          recommendation,
        },
      };
    } catch (error) {
      console.warn('[TechStackRecommenderAgent] LLM failed, using fallback:', error);
      return this.fallbackRecommendation(ideaSpec);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const recommendation: TechStackRecommendation = result.intermediate.recommendation;

    return [
      {
        type: 'tech-stack-recommendation',
        version: '1.0.0',
        content: recommendation,
        generatedAt: new Date().toISOString(),
        agentId: this.config.id,
      },
    ];
  }

  private extractIdeaSpec(input: AgentInput): any {
    if (input.data && typeof input.data === 'object') {
      return (input.data as any).ideaSpec || input.data;
    }
    return {};
  }

  private buildTechStackPrompt(ideaSpec: any): string {
    return `You are a technical architect. Recommend an optimal technology stack for this product.

**Idea Details:**
Title: ${ideaSpec.title || 'Untitled'}
Description: ${ideaSpec.description || 'No description'}
Category: ${ideaSpec.metadata?.category || 'Not specified'}
Complexity: ${ideaSpec.metadata?.complexity || 'Not specified'}
Budget: $${ideaSpec.constraints?.budget?.max || 500}
Timeline: ${ideaSpec.constraints?.timeline?.max || 14} days
Tech Preferences: ${ideaSpec.constraints?.technicalPreferences?.join(', ') || 'None specified'}
Compliance: ${ideaSpec.constraints?.complianceRequirements?.join(', ') || 'None'}

Recommend a tech stack in JSON format:

{
  "frontend": {
    "framework": "<Primary framework>",
    "reasoning": "<Why this choice>",
    "alternatives": ["<Alt1>", "<Alt2>"]
  },
  "backend": {
    "language": "<Programming language>",
    "framework": "<Backend framework>",
    "reasoning": "<Why this choice>",
    "alternatives": ["<Alt1>", "<Alt2>"]
  },
  "database": {
    "primary": "<Database name>",
    "type": "sql|nosql|hybrid",
    "reasoning": "<Why this choice>",
    "alternatives": ["<Alt1>", "<Alt2>"]
  },
  "infrastructure": {
    "hosting": "<Cloud provider or hosting>",
    "cicd": "<CI/CD tool>",
    "monitoring": "<Monitoring/observability>",
    "reasoning": "<Why these choices>"
  },
  "additionalServices": [
    {
      "service": "<Service name>",
      "purpose": "<What it does>",
      "provider": "<Provider name>"
    }
  ],
  "estimatedCosts": {
    "development": "<Dev cost estimate>",
    "monthly": "<Monthly hosting estimate>",
    "scaling": "<Cost at scale estimate>"
  },
  "considerations": [
    "<Important consideration>",
    "<Trade-off to note>"
  ]
}

Guidelines:
- Prioritize: time to market, budget, scalability, team skills
- Consider compliance requirements
- Recommend modern, well-supported technologies
- Provide 2-3 alternatives for each major decision
- Be specific with versions/tools where relevant
- Estimate realistic costs
- Note 3-5 key considerations/trade-offs

Respond ONLY with JSON.`;
  }

  private parseRecommendation(analysisText: string): TechStackRecommendation {
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        frontend: {
          framework: parsed.frontend?.framework || 'React',
          reasoning: parsed.frontend?.reasoning || 'Popular and well-supported',
          alternatives: Array.isArray(parsed.frontend?.alternatives)
            ? parsed.frontend.alternatives.slice(0, 3)
            : [],
        },
        backend: {
          language: parsed.backend?.language || 'TypeScript',
          framework: parsed.backend?.framework || 'Node.js/Express',
          reasoning: parsed.backend?.reasoning || 'Fast development, wide ecosystem',
          alternatives: Array.isArray(parsed.backend?.alternatives)
            ? parsed.backend.alternatives.slice(0, 3)
            : [],
        },
        database: {
          primary: parsed.database?.primary || 'PostgreSQL',
          type: this.normalizeDbType(parsed.database?.type),
          reasoning: parsed.database?.reasoning || 'Reliable and scalable',
          alternatives: Array.isArray(parsed.database?.alternatives)
            ? parsed.database.alternatives.slice(0, 3)
            : [],
        },
        infrastructure: {
          hosting: parsed.infrastructure?.hosting || 'AWS/Vercel',
          cicd: parsed.infrastructure?.cicd || 'GitHub Actions',
          monitoring: parsed.infrastructure?.monitoring || 'Sentry + Datadog',
          reasoning: parsed.infrastructure?.reasoning || 'Industry standard tools',
        },
        additionalServices: Array.isArray(parsed.additionalServices)
          ? parsed.additionalServices.slice(0, 5).map((s: any) => ({
              service: s.service || 'Unknown',
              purpose: s.purpose || 'Supporting functionality',
              provider: s.provider || 'TBD',
            }))
          : [],
        estimatedCosts: {
          development: parsed.estimatedCosts?.development || 'Within project budget',
          monthly: parsed.estimatedCosts?.monthly || '$50-200/month',
          scaling: parsed.estimatedCosts?.scaling || 'Scales with usage',
        },
        considerations: Array.isArray(parsed.considerations)
          ? parsed.considerations.slice(0, 5)
          : [],
      };
    } catch (error) {
      console.warn('[TechStackRecommenderAgent] Failed to parse:', error);
      throw error;
    }
  }

  private normalizeDbType(type: string): 'sql' | 'nosql' | 'hybrid' {
    const normalized = type?.toLowerCase();
    if (normalized === 'sql') return 'sql';
    if (normalized === 'nosql') return 'nosql';
    if (normalized === 'hybrid') return 'hybrid';
    return 'sql'; // default
  }

  private fallbackRecommendation(ideaSpec: any): ReasoningResult {
    const isWebApp = ideaSpec.metadata?.category === 'technical';
    const isBusiness = ideaSpec.metadata?.category === 'business';

    const recommendation: TechStackRecommendation = {
      frontend: {
        framework: isWebApp ? 'React' : isBusiness ? 'Next.js' : 'React',
        reasoning: 'Most popular, excellent ecosystem, strong community support',
        alternatives: ['Vue.js', 'Svelte'],
      },
      backend: {
        language: 'TypeScript',
        framework: 'Node.js + Express',
        reasoning: 'Fast development, familiar to frontend devs, large ecosystem',
        alternatives: ['Python + FastAPI', 'Go + Gin'],
      },
      database: {
        primary: 'PostgreSQL',
        type: 'sql',
        reasoning: 'Reliable, ACID compliant, excellent for structured data',
        alternatives: ['MongoDB', 'MySQL'],
      },
      infrastructure: {
        hosting: 'Vercel (frontend) + AWS (backend)',
        cicd: 'GitHub Actions',
        monitoring: 'Sentry + Datadog',
        reasoning: 'Easy deployment, auto-scaling, good free tiers',
      },
      additionalServices: [
        { service: 'Auth0', purpose: 'Authentication', provider: 'Auth0' },
        { service: 'Stripe', purpose: 'Payments', provider: 'Stripe' },
      ],
      estimatedCosts: {
        development: 'Mostly open-source, low cost',
        monthly: '$50-150/month (small scale)',
        scaling: '$500-2000/month (at scale)',
      },
      considerations: [
        'TypeScript provides type safety',
        'PostgreSQL scales well vertically',
        'Vercel has generous free tier',
      ],
    };

    return {
      reasoning: 'Fallback recommendation (LLM unavailable)',
      confidence: 0.65,
      intermediate: { recommendation },
    };
  }
}
