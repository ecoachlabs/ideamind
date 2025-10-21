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
 * Revenue stream
 */
interface RevenueStream {
  type:
    | 'subscription'
    | 'transaction-fee'
    | 'advertising'
    | 'data-monetization'
    | 'affiliate'
    | 'licensing'
    | 'marketplace'
    | 'premium-features';
  description: string;
  priority: 'primary' | 'secondary' | 'future';
  revenueModel: string;
  targetRevenue: {
    year1: number;
    year2: number;
    year3: number;
  };
  implementationComplexity: 'low' | 'medium' | 'high';
  timeToImplement: string;
  risks: string[];
  opportunities: string[];
}

/**
 * Monetization opportunity
 */
interface MonetizationOpportunity {
  opportunity: string;
  description: string;
  potentialRevenue: string;
  implementationEffort: 'low' | 'medium' | 'high';
  timeframe: 'immediate' | 'short-term' | 'medium-term' | 'long-term';
  prerequisites: string[];
  keyMetrics: string[];
}

/**
 * Revenue optimization strategy
 */
interface RevenueOptimization {
  strategy: string;
  description: string;
  expectedImpact: string;
  implementation: string[];
  metrics: string[];
  priority: 'high' | 'medium' | 'low';
}

/**
 * Monetization strategy
 */
interface MonetizationStrategy {
  overallStrategy: {
    primaryModel: string;
    diversification: 'single-stream' | 'dual-stream' | 'multi-stream';
    rationale: string;
    riskMitigation: string[];
  };
  revenueStreams: RevenueStream[];
  monetizationOpportunities: MonetizationOpportunity[];
  revenueOptimization: RevenueOptimization[];
  longTermGrowth: {
    strategy: string;
    milestones: {
      milestone: string;
      timeline: string;
      revenueTarget: string;
    }[];
    scalingStrategies: string[];
  };
  complianceConsiderations: {
    area: 'data-privacy' | 'payment-processing' | 'advertising' | 'marketplace' | 'other';
    requirement: string;
    impact: string;
  }[];
}

/**
 * MonetizationAdvisorAgent
 *
 * Provides comprehensive monetization strategy:
 * - Revenue stream diversification
 * - Monetization opportunities (ads, data, transactions, etc.)
 * - Revenue optimization strategies
 * - Long-term growth plan
 * - Compliance considerations
 * - Risk mitigation strategies
 *
 * Part of the BIZDEV phase (runs in parallel with other BIZDEV agents).
 */
export class MonetizationAdvisorAgent extends BaseAgent {
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
          stepId: 'identify-revenue-streams',
          description: 'Identify potential revenue streams',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
        {
          stepId: 'find-opportunities',
          description: 'Find additional monetization opportunities',
          estimatedDurationMs: 2500,
          requiredTools: [],
        },
        {
          stepId: 'optimize-revenue',
          description: 'Develop revenue optimization strategies',
          estimatedDurationMs: 2500,
          requiredTools: [],
        },
        {
          stepId: 'plan-growth',
          description: 'Plan long-term revenue growth',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
      ],
      estimatedTotalDurationMs: 10000,
      confidence: 0.87,
    };
  }

  protected async reason(
    plan: ExecutionPlan,
    input: AgentInput
  ): Promise<ReasoningResult> {
    const ideaSpec = this.extractData(input, 'ideaSpec');
    const strategy = this.extractData(input, 'strategy');
    const prd = this.extractData(input, 'prd');
    const pricing = this.extractData(input, 'pricing');

    const prompt = this.buildMonetizationPrompt(ideaSpec, strategy, prd, pricing);

    try {
      const response = await this.llm.invoke(prompt);
      const monetizationText = response.content.toString();

      const monetizationStrategy = this.parseMonetizationStrategy(monetizationText);

      return {
        reasoning: `Identified ${monetizationStrategy.revenueStreams.length} revenue streams, ${monetizationStrategy.monetizationOpportunities.length} opportunities`,
        confidence: 0.88,
        intermediate: {
          monetizationStrategy,
        },
      };
    } catch (error) {
      console.warn('[MonetizationAdvisorAgent] LLM failed, using fallback:', error);
      return this.fallbackMonetization();
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const monetizationStrategy: MonetizationStrategy = result.intermediate.monetizationStrategy;

    return [
      {
        type: 'monetization-strategy',
        version: '1.0.0',
        content: monetizationStrategy,
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

  private buildMonetizationPrompt(
    ideaSpec: any,
    strategy: any,
    prd: any,
    pricing: any
  ): string {
    return `You are a monetization strategist developing revenue strategies.

**Product:**
Title: ${ideaSpec?.title || 'N/A'}
Category: ${ideaSpec?.metadata?.category || 'N/A'}
Target Users: ${ideaSpec?.targetUsers?.join(', ') || 'N/A'}

**Strategy:**
Vision: ${strategy?.vision || 'N/A'}
Success Metrics: ${strategy?.successMetrics?.map((m: any) => m.metric).join(', ') || 'N/A'}

**Features:**
${prd?.functionalRequirements?.slice(0, 10).map((fr: any) => `- ${fr.requirement}`).join('\n') || 'N/A'}

**Current Pricing:**
Model: ${pricing?.strategy?.model || 'N/A'}
Tiers: ${pricing?.tiers?.length || 0}

Create a monetization strategy in JSON format:

{
  "overallStrategy": {
    "primaryModel": "<Primary monetization model>",
    "diversification": "single-stream|dual-stream|multi-stream",
    "rationale": "<Why this approach>",
    "riskMitigation": ["<Risk mitigation strategy>"]
  },
  "revenueStreams": [
    {
      "type": "subscription|transaction-fee|advertising|data-monetization|affiliate|licensing|marketplace|premium-features",
      "description": "<How this generates revenue>",
      "priority": "primary|secondary|future",
      "revenueModel": "<Specific model details>",
      "targetRevenue": {
        "year1": <Revenue estimate>,
        "year2": <Revenue estimate>,
        "year3": <Revenue estimate>
      },
      "implementationComplexity": "low|medium|high",
      "timeToImplement": "<Timeline>",
      "risks": ["<Risk>"],
      "opportunities": ["<Opportunity>"]
    }
  ],
  "monetizationOpportunities": [
    {
      "opportunity": "<Opportunity name>",
      "description": "<What it is>",
      "potentialRevenue": "<Revenue potential>",
      "implementationEffort": "low|medium|high",
      "timeframe": "immediate|short-term|medium-term|long-term",
      "prerequisites": ["<What's needed first>"],
      "keyMetrics": ["<Metric to track>"]
    }
  ],
  "revenueOptimization": [
    {
      "strategy": "<Optimization strategy>",
      "description": "<What it does>",
      "expectedImpact": "<Expected impact>",
      "implementation": ["<Implementation step>"],
      "metrics": ["<Metric to track>"],
      "priority": "high|medium|low"
    }
  ],
  "longTermGrowth": {
    "strategy": "<Long-term growth strategy>",
    "milestones": [
      {
        "milestone": "<Milestone name>",
        "timeline": "<When>",
        "revenueTarget": "<Revenue at this milestone>"
      }
    ],
    "scalingStrategies": ["<Scaling strategy>"]
  },
  "complianceConsiderations": [
    {
      "area": "data-privacy|payment-processing|advertising|marketplace|other",
      "requirement": "<Compliance requirement>",
      "impact": "<Impact on monetization>"
    }
  ]
}

**Guidelines:**
- Identify 2-4 revenue streams (primary + diversification)
- Find 5-10 monetization opportunities
- Provide 5-8 revenue optimization strategies
- Consider regulatory compliance (GDPR, payment processing, etc.)
- Balance short-term revenue with long-term growth
- Assess implementation complexity realistically
- Identify risks and mitigation strategies

Respond ONLY with JSON.`;
  }

  private parseMonetizationStrategy(monetizationText: string): MonetizationStrategy {
    try {
      const jsonMatch = monetizationText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        overallStrategy: {
          primaryModel: parsed.overallStrategy?.primaryModel || 'Subscription',
          diversification: this.normalizeDiversification(
            parsed.overallStrategy?.diversification
          ),
          rationale: parsed.overallStrategy?.rationale || 'Strategy rationale TBD',
          riskMitigation: Array.isArray(parsed.overallStrategy?.riskMitigation)
            ? parsed.overallStrategy.riskMitigation.slice(0, 5)
            : [],
        },
        revenueStreams: Array.isArray(parsed.revenueStreams)
          ? parsed.revenueStreams.slice(0, 4).map((stream: any) => ({
              type: this.normalizeStreamType(stream.type),
              description: stream.description || 'Description TBD',
              priority: this.normalizeStreamPriority(stream.priority),
              revenueModel: stream.revenueModel || 'Model TBD',
              targetRevenue: {
                year1: stream.targetRevenue?.year1 || 0,
                year2: stream.targetRevenue?.year2 || 0,
                year3: stream.targetRevenue?.year3 || 0,
              },
              implementationComplexity: this.normalizeComplexity(
                stream.implementationComplexity
              ),
              timeToImplement: stream.timeToImplement || 'TBD',
              risks: Array.isArray(stream.risks) ? stream.risks.slice(0, 5) : [],
              opportunities: Array.isArray(stream.opportunities)
                ? stream.opportunities.slice(0, 5)
                : [],
            }))
          : [],
        monetizationOpportunities: Array.isArray(parsed.monetizationOpportunities)
          ? parsed.monetizationOpportunities.slice(0, 10).map((opp: any) => ({
              opportunity: opp.opportunity || 'Opportunity',
              description: opp.description || 'Description TBD',
              potentialRevenue: opp.potentialRevenue || 'TBD',
              implementationEffort: this.normalizeComplexity(opp.implementationEffort),
              timeframe: this.normalizeTimeframe(opp.timeframe),
              prerequisites: Array.isArray(opp.prerequisites) ? opp.prerequisites.slice(0, 5) : [],
              keyMetrics: Array.isArray(opp.keyMetrics) ? opp.keyMetrics.slice(0, 3) : [],
            }))
          : [],
        revenueOptimization: Array.isArray(parsed.revenueOptimization)
          ? parsed.revenueOptimization.slice(0, 8).map((opt: any) => ({
              strategy: opt.strategy || 'Strategy',
              description: opt.description || 'Description TBD',
              expectedImpact: opt.expectedImpact || 'TBD',
              implementation: Array.isArray(opt.implementation)
                ? opt.implementation.slice(0, 5)
                : [],
              metrics: Array.isArray(opt.metrics) ? opt.metrics.slice(0, 3) : [],
              priority: this.normalizeOptimizationPriority(opt.priority),
            }))
          : [],
        longTermGrowth: {
          strategy: parsed.longTermGrowth?.strategy || 'Growth strategy TBD',
          milestones: Array.isArray(parsed.longTermGrowth?.milestones)
            ? parsed.longTermGrowth.milestones.slice(0, 5).map((m: any) => ({
                milestone: m.milestone || 'Milestone',
                timeline: m.timeline || 'TBD',
                revenueTarget: m.revenueTarget || 'TBD',
              }))
            : [],
          scalingStrategies: Array.isArray(parsed.longTermGrowth?.scalingStrategies)
            ? parsed.longTermGrowth.scalingStrategies.slice(0, 5)
            : [],
        },
        complianceConsiderations: Array.isArray(parsed.complianceConsiderations)
          ? parsed.complianceConsiderations.slice(0, 5).map((comp: any) => ({
              area: this.normalizeComplianceArea(comp.area),
              requirement: comp.requirement || 'Requirement TBD',
              impact: comp.impact || 'Impact TBD',
            }))
          : [],
      };
    } catch (error) {
      console.warn('[MonetizationAdvisorAgent] Failed to parse:', error);
      throw error;
    }
  }

  private normalizeDiversification(
    div: string
  ): 'single-stream' | 'dual-stream' | 'multi-stream' {
    const normalized = div?.toLowerCase();
    if (normalized?.includes('single')) return 'single-stream';
    if (normalized?.includes('dual')) return 'dual-stream';
    return 'multi-stream';
  }

  private normalizeStreamType(
    type: string
  ):
    | 'subscription'
    | 'transaction-fee'
    | 'advertising'
    | 'data-monetization'
    | 'affiliate'
    | 'licensing'
    | 'marketplace'
    | 'premium-features' {
    const normalized = type?.toLowerCase();
    if (normalized?.includes('subscription')) return 'subscription';
    if (normalized?.includes('transaction')) return 'transaction-fee';
    if (normalized?.includes('ad')) return 'advertising';
    if (normalized?.includes('data')) return 'data-monetization';
    if (normalized?.includes('affiliate')) return 'affiliate';
    if (normalized?.includes('license')) return 'licensing';
    if (normalized?.includes('marketplace')) return 'marketplace';
    return 'premium-features';
  }

  private normalizeStreamPriority(priority: string): 'primary' | 'secondary' | 'future' {
    const normalized = priority?.toLowerCase();
    if (normalized?.includes('primary')) return 'primary';
    if (normalized?.includes('future')) return 'future';
    return 'secondary';
  }

  private normalizeComplexity(complexity: string): 'low' | 'medium' | 'high' {
    const normalized = complexity?.toLowerCase();
    if (normalized === 'low') return 'low';
    if (normalized === 'high') return 'high';
    return 'medium';
  }

  private normalizeTimeframe(
    timeframe: string
  ): 'immediate' | 'short-term' | 'medium-term' | 'long-term' {
    const normalized = timeframe?.toLowerCase();
    if (normalized?.includes('immediate')) return 'immediate';
    if (normalized?.includes('short')) return 'short-term';
    if (normalized?.includes('long')) return 'long-term';
    return 'medium-term';
  }

  private normalizeOptimizationPriority(priority: string): 'high' | 'medium' | 'low' {
    const normalized = priority?.toLowerCase();
    if (normalized === 'high') return 'high';
    if (normalized === 'low') return 'low';
    return 'medium';
  }

  private normalizeComplianceArea(
    area: string
  ): 'data-privacy' | 'payment-processing' | 'advertising' | 'marketplace' | 'other' {
    const normalized = area?.toLowerCase();
    if (normalized?.includes('privacy') || normalized?.includes('data')) return 'data-privacy';
    if (normalized?.includes('payment')) return 'payment-processing';
    if (normalized?.includes('ad')) return 'advertising';
    if (normalized?.includes('marketplace')) return 'marketplace';
    return 'other';
  }

  private fallbackMonetization(): ReasoningResult {
    const monetizationStrategy: MonetizationStrategy = {
      overallStrategy: {
        primaryModel: 'Subscription',
        diversification: 'dual-stream',
        rationale: 'Subscription provides predictable recurring revenue, supplemented by usage-based fees',
        riskMitigation: [
          'Diversify revenue streams',
          'Monitor churn closely',
          'Build switching costs',
        ],
      },
      revenueStreams: [
        {
          type: 'subscription',
          description: 'Monthly/annual subscription fees',
          priority: 'primary',
          revenueModel: 'Tiered subscription with usage limits',
          targetRevenue: {
            year1: 100000,
            year2: 400000,
            year3: 1000000,
          },
          implementationComplexity: 'medium',
          timeToImplement: '2-3 months',
          risks: ['Customer churn', 'Market saturation'],
          opportunities: ['Annual prepay discounts', 'Enterprise contracts'],
        },
        {
          type: 'premium-features',
          description: 'Add-ons and premium capabilities',
          priority: 'secondary',
          revenueModel: 'One-time or recurring add-on purchases',
          targetRevenue: {
            year1: 20000,
            year2: 80000,
            year3: 200000,
          },
          implementationComplexity: 'low',
          timeToImplement: '1-2 months',
          risks: ['Low adoption rate'],
          opportunities: ['Upsell to existing customers', 'Bundle discounts'],
        },
      ],
      monetizationOpportunities: [
        {
          opportunity: 'API Access',
          description: 'Monetize API for third-party integrations',
          potentialRevenue: '$50K-100K annually',
          implementationEffort: 'medium',
          timeframe: 'medium-term',
          prerequisites: ['Stable API', 'Documentation', 'Developer portal'],
          keyMetrics: ['API calls', 'API revenue', 'Partner count'],
        },
        {
          opportunity: 'White-label Solution',
          description: 'License platform to other companies',
          potentialRevenue: '$100K-500K annually',
          implementationEffort: 'high',
          timeframe: 'long-term',
          prerequisites: ['Multi-tenant architecture', 'Branding customization'],
          keyMetrics: ['White-label customers', 'License revenue'],
        },
      ],
      revenueOptimization: [
        {
          strategy: 'Reduce Churn',
          description: 'Implement retention programs to reduce monthly churn',
          expectedImpact: '20% churn reduction = 20% revenue increase',
          implementation: ['Customer success program', 'Usage analytics', 'Proactive support'],
          metrics: ['Monthly churn rate', 'Customer lifetime'],
          priority: 'high',
        },
        {
          strategy: 'Increase ARPU',
          description: 'Increase average revenue per user through upsells',
          expectedImpact: '15% ARPU increase',
          implementation: ['Feature upsells', 'Usage-based pricing', 'Annual contracts'],
          metrics: ['ARPU', 'Upsell rate', 'Plan distribution'],
          priority: 'high',
        },
      ],
      longTermGrowth: {
        strategy: 'Expand market, add enterprise tier, international expansion',
        milestones: [
          {
            milestone: '$1M ARR',
            timeline: 'Year 2',
            revenueTarget: '$1,000,000',
          },
          {
            milestone: '$5M ARR',
            timeline: 'Year 3',
            revenueTarget: '$5,000,000',
          },
        ],
        scalingStrategies: [
          'Enterprise sales motion',
          'Channel partnerships',
          'International markets',
        ],
      },
      complianceConsiderations: [
        {
          area: 'payment-processing',
          requirement: 'PCI DSS compliance for payment processing',
          impact: 'Required for subscription billing',
        },
        {
          area: 'data-privacy',
          requirement: 'GDPR compliance for EU customers',
          impact: 'Required for international expansion',
        },
      ],
    };

    return {
      reasoning: 'Fallback monetization strategy (LLM unavailable)',
      confidence: 0.5,
      intermediate: { monetizationStrategy },
    };
  }
}
