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
 * Product strategy output
 */
interface ProductStrategy {
  vision: string;
  mission: string;
  coreValues: string[];
  productPillars: Array<{
    name: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  differentiators: string[];
  marketPosition: string;
  goToMarketApproach: string;
  successMetrics: Array<{
    metric: string;
    target: string;
    timeframe: string;
  }>;
  risks: Array<{
    risk: string;
    severity: 'high' | 'medium' | 'low';
    mitigation: string;
  }>;
}

/**
 * StrategyAgent
 *
 * Defines comprehensive product strategy and vision for the idea.
 * Analyzes the IdeaSpec and creates a strategic foundation including:
 * - Product vision and mission
 * - Core value propositions
 * - Market positioning
 * - Go-to-market approach
 * - Success metrics and KPIs
 *
 * Part of the IDEATION phase (runs in parallel with other ideation agents).
 */
export class StrategyAgent extends BaseAgent {
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
          stepId: 'analyze-idea',
          description: 'Analyze IdeaSpec to understand core concept',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
        {
          stepId: 'define-vision-mission',
          description: 'Define product vision and mission',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
        {
          stepId: 'identify-differentiators',
          description: 'Identify key differentiators and competitive advantages',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
        {
          stepId: 'define-metrics',
          description: 'Define success metrics and KPIs',
          estimatedDurationMs: 2000,
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

    const prompt = this.buildStrategyPrompt(ideaSpec);

    try {
      const response = await this.llm.invoke(prompt);
      const analysisText = response.content.toString();

      const strategy = this.parseStrategy(analysisText);

      return {
        reasoning: `Generated product strategy with ${strategy.productPillars.length} pillars and ${strategy.differentiators.length} differentiators`,
        confidence: 0.9,
        intermediate: {
          strategy,
        },
      };
    } catch (error) {
      console.warn('[StrategyAgent] LLM failed, using template-based strategy:', error);
      return this.fallbackStrategy(ideaSpec);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const strategy: ProductStrategy = result.intermediate.strategy;

    return [
      {
        type: 'product-strategy',
        version: '1.0.0',
        content: strategy,
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

  private buildStrategyPrompt(ideaSpec: any): string {
    return `You are a strategic product consultant. Create a comprehensive product strategy for the following idea.

**Idea Details:**
Title: ${ideaSpec.title || 'Untitled'}
Description: ${ideaSpec.description || 'No description'}
Target Users: ${ideaSpec.targetUsers?.join(', ') || 'Not specified'}
Problem Statement: ${ideaSpec.problemStatement || 'Not specified'}
Success Criteria: ${ideaSpec.successCriteria?.join(', ') || 'Not specified'}
Category: ${ideaSpec.metadata?.category || 'Not specified'}
Complexity: ${ideaSpec.metadata?.complexity || 'Not specified'}

Create a product strategy in the following JSON format:

{
  "vision": "<One-sentence inspiring vision for the product>",
  "mission": "<Clear mission statement explaining what the product does and for whom>",
  "coreValues": ["<value1>", "<value2>", "<value3>"],
  "productPillars": [
    {
      "name": "<Pillar name>",
      "description": "<Why this pillar is critical>",
      "priority": "high|medium|low"
    }
  ],
  "differentiators": [
    "<What makes this product unique vs competitors>",
    "<Key competitive advantage>"
  ],
  "marketPosition": "<How this product is positioned in the market>",
  "goToMarketApproach": "<High-level GTM strategy>",
  "successMetrics": [
    {
      "metric": "<Measurable metric>",
      "target": "<Target value>",
      "timeframe": "<When to achieve>"
    }
  ],
  "risks": [
    {
      "risk": "<Strategic risk>",
      "severity": "high|medium|low",
      "mitigation": "<How to address>"
    }
  ]
}

Guidelines:
- Vision: Inspirational, future-oriented (10-15 words)
- Mission: Clear, actionable (20-30 words)
- Core Values: 3-5 guiding principles
- Product Pillars: 3-5 main strategic areas (feature categories, not specific features)
- Differentiators: 3-5 unique competitive advantages
- Success Metrics: 3-5 measurable KPIs with targets
- Risks: 3-5 strategic risks with mitigations

Be specific, actionable, and realistic based on the idea's complexity and budget.

Respond ONLY with the JSON object, no additional text.`;
  }

  private parseStrategy(analysisText: string): ProductStrategy {
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        vision: parsed.vision || 'Create innovative solutions for users',
        mission: parsed.mission || 'Deliver value to our target users',
        coreValues: Array.isArray(parsed.coreValues)
          ? parsed.coreValues.slice(0, 5)
          : ['Innovation', 'Quality', 'User-centric'],
        productPillars: Array.isArray(parsed.productPillars)
          ? parsed.productPillars.slice(0, 5).map((p: any) => ({
              name: p.name || 'Core Feature',
              description: p.description || 'Essential functionality',
              priority: this.normalizePriority(p.priority),
            }))
          : [],
        differentiators: Array.isArray(parsed.differentiators)
          ? parsed.differentiators.slice(0, 5)
          : [],
        marketPosition: parsed.marketPosition || 'Competitive alternative in the market',
        goToMarketApproach:
          parsed.goToMarketApproach || 'Direct sales and digital marketing',
        successMetrics: Array.isArray(parsed.successMetrics)
          ? parsed.successMetrics.slice(0, 5).map((m: any) => ({
              metric: m.metric || 'User acquisition',
              target: m.target || '1000 users',
              timeframe: m.timeframe || '6 months',
            }))
          : [],
        risks: Array.isArray(parsed.risks)
          ? parsed.risks.slice(0, 5).map((r: any) => ({
              risk: r.risk || 'Market competition',
              severity: this.normalizeSeverity(r.severity),
              mitigation: r.mitigation || 'Monitor and adapt',
            }))
          : [],
      };
    } catch (error) {
      console.warn('[StrategyAgent] Failed to parse strategy:', error);
      throw error;
    }
  }

  private normalizePriority(priority: string): 'high' | 'medium' | 'low' {
    const normalized = priority?.toLowerCase();
    if (normalized === 'high') return 'high';
    if (normalized === 'low') return 'low';
    return 'medium';
  }

  private normalizeSeverity(severity: string): 'high' | 'medium' | 'low' {
    const normalized = severity?.toLowerCase();
    if (normalized === 'high') return 'high';
    if (normalized === 'low') return 'low';
    return 'medium';
  }

  private fallbackStrategy(ideaSpec: any): ReasoningResult {
    const strategy: ProductStrategy = {
      vision: `Transform how ${ideaSpec.targetUsers?.[0] || 'users'} ${ideaSpec.problemStatement?.slice(0, 50) || 'solve problems'}`,
      mission: `Build a ${ideaSpec.metadata?.category || 'innovative'} solution that ${ideaSpec.successCriteria?.[0] || 'delivers value'}`,
      coreValues: ['User-centric design', 'Innovation', 'Quality'],
      productPillars: [
        {
          name: 'Core Functionality',
          description: 'Essential features that solve the core problem',
          priority: 'high',
        },
        {
          name: 'User Experience',
          description: 'Intuitive and delightful user interface',
          priority: 'high',
        },
        {
          name: 'Scalability',
          description: 'Ability to grow with user demand',
          priority: 'medium',
        },
      ],
      differentiators: [
        'Focus on user experience',
        'Modern technology stack',
        'Competitive pricing',
      ],
      marketPosition: 'Innovative challenger in the market',
      goToMarketApproach: 'Digital-first with focus on organic growth',
      successMetrics: [
        {
          metric: 'User acquisition',
          target: '1000 active users',
          timeframe: '6 months',
        },
        {
          metric: 'User satisfaction',
          target: '4.5/5 rating',
          timeframe: '3 months',
        },
      ],
      risks: [
        {
          risk: 'Market competition',
          severity: 'medium',
          mitigation: 'Focus on unique differentiators',
        },
      ],
    };

    return {
      reasoning: 'Fallback strategy (LLM unavailable). Using template-based approach.',
      confidence: 0.6,
      intermediate: {
        strategy,
      },
    };
  }
}
