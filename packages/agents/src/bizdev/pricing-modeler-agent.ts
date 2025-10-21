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
 * Pricing tier
 */
interface PricingTier {
  name: string;
  description: string;
  price: {
    amount: number;
    currency: string;
    billing: 'monthly' | 'annually' | 'one-time' | 'usage-based';
    discount?: string; // For annual billing
  };
  features: string[];
  limits: {
    metric: string;
    limit: string;
  }[];
  targetSegment: string;
  positioning: string;
}

/**
 * Pricing strategy
 */
interface PricingStrategy {
  model: 'freemium' | 'subscription' | 'usage-based' | 'tiered' | 'hybrid' | 'enterprise';
  rationale: string;
  competitivePositioning: 'premium' | 'value' | 'penetration' | 'economy';
  psychologyTactics: string[];
  upsellStrategy: string[];
}

/**
 * Revenue projection
 */
interface RevenueProjection {
  tier: string;
  assumptions: {
    customerCount: number;
    conversionRate: number;
    churnRate: number;
  };
  revenue: {
    monthly: number;
    annually: number;
  };
  contribution: number; // Percentage of total revenue
}

/**
 * Pricing model output
 */
interface PricingModel {
  strategy: PricingStrategy;
  tiers: PricingTier[];
  freeTier?: {
    name: string;
    features: string[];
    limits: {
      metric: string;
      limit: string;
    }[];
    conversionGoal: string;
  };
  addOns: {
    name: string;
    description: string;
    price: number;
    targetTiers: string[];
  }[];
  competitiveComparison: {
    competitor: string;
    ourPrice: string;
    theirPrice: string;
    positioning: string;
  }[];
  revenueProjections: RevenueProjection[];
  pricingTests: {
    hypothesis: string;
    test: string;
    metrics: string[];
  }[];
}

/**
 * PricingModelerAgent
 *
 * Creates comprehensive pricing model and strategy:
 * - Pricing model selection (freemium, subscription, usage-based, etc.)
 * - Pricing tiers with features and limits
 * - Competitive pricing analysis
 * - Pricing psychology and positioning
 * - Revenue projections by tier
 * - Upsell and cross-sell strategy
 * - Pricing experimentation plan
 *
 * Part of the BIZDEV phase (runs in parallel with other BIZDEV agents).
 */
export class PricingModelerAgent extends BaseAgent {
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
          stepId: 'select-pricing-model',
          description: 'Select optimal pricing model',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
        {
          stepId: 'design-tiers',
          description: 'Design pricing tiers with features',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
        {
          stepId: 'analyze-competition',
          description: 'Analyze competitive pricing',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
        {
          stepId: 'project-revenue',
          description: 'Project revenue by tier',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
      ],
      estimatedTotalDurationMs: 10000,
      confidence: 0.86,
    };
  }

  protected async reason(
    plan: ExecutionPlan,
    input: AgentInput
  ): Promise<ReasoningResult> {
    const ideaSpec = this.extractData(input, 'ideaSpec');
    const competitive = this.extractData(input, 'competitive');
    const personas = this.extractData(input, 'personas');
    const prd = this.extractData(input, 'prd');

    const prompt = this.buildPricingPrompt(ideaSpec, competitive, personas, prd);

    try {
      const response = await this.llm.invoke(prompt);
      const pricingText = response.content.toString();

      const pricingModel = this.parsePricingModel(pricingText);

      return {
        reasoning: `Created ${pricingModel.strategy.model} pricing model with ${pricingModel.tiers.length} tiers`,
        confidence: 0.87,
        intermediate: {
          pricingModel,
        },
      };
    } catch (error) {
      console.warn('[PricingModelerAgent] LLM failed, using fallback:', error);
      return this.fallbackPricing();
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const pricingModel: PricingModel = result.intermediate.pricingModel;

    return [
      {
        type: 'pricing-model',
        version: '1.0.0',
        content: pricingModel,
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

  private buildPricingPrompt(
    ideaSpec: any,
    competitive: any,
    personas: any,
    prd: any
  ): string {
    return `You are a pricing strategist designing a pricing model.

**Product:**
Title: ${ideaSpec?.title || 'N/A'}
Category: ${ideaSpec?.metadata?.category || 'N/A'}
Target Users: ${ideaSpec?.targetUsers?.join(', ') || 'N/A'}

**Competitors:**
${competitive?.competitors?.map((c: any) => `- ${c.name}: ${c.strengths?.join(', ')}`).join('\n') || 'N/A'}

**User Personas:**
${personas?.personas?.map((p: any) => `- ${p.name}: ${p.psychographics?.motivations?.join(', ')}`).join('\n') || 'N/A'}

**Features:**
${prd?.functionalRequirements?.slice(0, 10).map((fr: any) => `- ${fr.requirement}`).join('\n') || 'N/A'}

Create a pricing model in JSON format:

{
  "strategy": {
    "model": "freemium|subscription|usage-based|tiered|hybrid|enterprise",
    "rationale": "<Why this model>",
    "competitivePositioning": "premium|value|penetration|economy",
    "psychologyTactics": ["<Pricing psychology tactic>"],
    "upsellStrategy": ["<Upsell approach>"]
  },
  "tiers": [
    {
      "name": "<Tier name>",
      "description": "<Who it's for>",
      "price": {
        "amount": <Price>,
        "currency": "USD",
        "billing": "monthly|annually|one-time|usage-based",
        "discount": "<Annual discount if applicable>"
      },
      "features": ["<Feature included>"],
      "limits": [
        {
          "metric": "<What's limited>",
          "limit": "<Limit value>"
        }
      ],
      "targetSegment": "<Target customer segment>",
      "positioning": "<How positioned>"
    }
  ],
  "freeTier": {
    "name": "Free",
    "features": ["<Free feature>"],
    "limits": [
      {
        "metric": "<What's limited>",
        "limit": "<Limit value>"
      }
    ],
    "conversionGoal": "<Goal %>"
  },
  "addOns": [
    {
      "name": "<Add-on name>",
      "description": "<What it does>",
      "price": <Price>,
      "targetTiers": ["<Which tiers can buy>"]
    }
  ],
  "competitiveComparison": [
    {
      "competitor": "<Competitor name>",
      "ourPrice": "<Our price>",
      "theirPrice": "<Their price>",
      "positioning": "<How we compare>"
    }
  ],
  "revenueProjections": [
    {
      "tier": "<Tier name>",
      "assumptions": {
        "customerCount": <Projected customers>,
        "conversionRate": <% conversion>,
        "churnRate": <% monthly churn>
      },
      "revenue": {
        "monthly": <MRR>,
        "annually": <ARR>
      },
      "contribution": <% of total revenue>
    }
  ],
  "pricingTests": [
    {
      "hypothesis": "<Test hypothesis>",
      "test": "<How to test>",
      "metrics": ["<Metric to track>"]
    }
  ]
}

**Guidelines:**
- Design 2-4 paid tiers (+ optional free tier)
- Price based on value delivered, not cost
- Use psychological pricing ($99 vs $100)
- Consider annual discounts (15-20%)
- Create clear differentiation between tiers
- Base pricing on competitive positioning
- Project realistic revenue (not overly optimistic)
- Include A/B testing recommendations

Respond ONLY with JSON.`;
  }

  private parsePricingModel(pricingText: string): PricingModel {
    try {
      const jsonMatch = pricingText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        strategy: {
          model: this.normalizePricingModel(parsed.strategy?.model),
          rationale: parsed.strategy?.rationale || 'Pricing rationale TBD',
          competitivePositioning: this.normalizePositioning(
            parsed.strategy?.competitivePositioning
          ),
          psychologyTactics: Array.isArray(parsed.strategy?.psychologyTactics)
            ? parsed.strategy.psychologyTactics.slice(0, 5)
            : [],
          upsellStrategy: Array.isArray(parsed.strategy?.upsellStrategy)
            ? parsed.strategy.upsellStrategy.slice(0, 5)
            : [],
        },
        tiers: Array.isArray(parsed.tiers)
          ? parsed.tiers.slice(0, 4).map((tier: any) => ({
              name: tier.name || 'Tier',
              description: tier.description || 'Description TBD',
              price: {
                amount: tier.price?.amount || 0,
                currency: tier.price?.currency || 'USD',
                billing: this.normalizeBilling(tier.price?.billing),
                discount: tier.price?.discount,
              },
              features: Array.isArray(tier.features) ? tier.features.slice(0, 15) : [],
              limits: Array.isArray(tier.limits)
                ? tier.limits.slice(0, 5).map((l: any) => ({
                    metric: l.metric || 'Metric',
                    limit: l.limit || 'Unlimited',
                  }))
                : [],
              targetSegment: tier.targetSegment || 'General users',
              positioning: tier.positioning || 'Positioning TBD',
            }))
          : [],
        freeTier: parsed.freeTier
          ? {
              name: parsed.freeTier.name || 'Free',
              features: Array.isArray(parsed.freeTier.features)
                ? parsed.freeTier.features.slice(0, 10)
                : [],
              limits: Array.isArray(parsed.freeTier.limits)
                ? parsed.freeTier.limits.slice(0, 5).map((l: any) => ({
                    metric: l.metric || 'Metric',
                    limit: l.limit || '0',
                  }))
                : [],
              conversionGoal: parsed.freeTier.conversionGoal || '5-10%',
            }
          : undefined,
        addOns: Array.isArray(parsed.addOns)
          ? parsed.addOns.slice(0, 5).map((addon: any) => ({
              name: addon.name || 'Add-on',
              description: addon.description || 'Description TBD',
              price: addon.price || 0,
              targetTiers: Array.isArray(addon.targetTiers) ? addon.targetTiers : [],
            }))
          : [],
        competitiveComparison: Array.isArray(parsed.competitiveComparison)
          ? parsed.competitiveComparison.slice(0, 5).map((comp: any) => ({
              competitor: comp.competitor || 'Competitor',
              ourPrice: comp.ourPrice || 'TBD',
              theirPrice: comp.theirPrice || 'TBD',
              positioning: comp.positioning || 'Positioning TBD',
            }))
          : [],
        revenueProjections: Array.isArray(parsed.revenueProjections)
          ? parsed.revenueProjections.slice(0, 5).map((proj: any) => ({
              tier: proj.tier || 'Tier',
              assumptions: {
                customerCount: proj.assumptions?.customerCount || 0,
                conversionRate: proj.assumptions?.conversionRate || 0,
                churnRate: proj.assumptions?.churnRate || 5,
              },
              revenue: {
                monthly: proj.revenue?.monthly || 0,
                annually: proj.revenue?.annually || 0,
              },
              contribution: proj.contribution || 0,
            }))
          : [],
        pricingTests: Array.isArray(parsed.pricingTests)
          ? parsed.pricingTests.slice(0, 5).map((test: any) => ({
              hypothesis: test.hypothesis || 'Hypothesis TBD',
              test: test.test || 'Test TBD',
              metrics: Array.isArray(test.metrics) ? test.metrics.slice(0, 3) : [],
            }))
          : [],
      };
    } catch (error) {
      console.warn('[PricingModelerAgent] Failed to parse:', error);
      throw error;
    }
  }

  private normalizePricingModel(
    model: string
  ): 'freemium' | 'subscription' | 'usage-based' | 'tiered' | 'hybrid' | 'enterprise' {
    const normalized = model?.toLowerCase();
    if (normalized?.includes('freemium')) return 'freemium';
    if (normalized?.includes('usage')) return 'usage-based';
    if (normalized?.includes('tiered')) return 'tiered';
    if (normalized?.includes('hybrid')) return 'hybrid';
    if (normalized?.includes('enterprise')) return 'enterprise';
    return 'subscription';
  }

  private normalizePositioning(
    positioning: string
  ): 'premium' | 'value' | 'penetration' | 'economy' {
    const normalized = positioning?.toLowerCase();
    if (normalized?.includes('premium')) return 'premium';
    if (normalized?.includes('penetration')) return 'penetration';
    if (normalized?.includes('economy')) return 'economy';
    return 'value';
  }

  private normalizeBilling(
    billing: string
  ): 'monthly' | 'annually' | 'one-time' | 'usage-based' {
    const normalized = billing?.toLowerCase();
    if (normalized?.includes('annual')) return 'annually';
    if (normalized?.includes('one')) return 'one-time';
    if (normalized?.includes('usage')) return 'usage-based';
    return 'monthly';
  }

  private fallbackPricing(): ReasoningResult {
    const pricingModel: PricingModel = {
      strategy: {
        model: 'freemium',
        rationale: 'Lower barrier to entry, maximize adoption',
        competitivePositioning: 'value',
        psychologyTactics: ['Charm pricing ($99)', 'Annual discounts'],
        upsellStrategy: ['Feature-gating', 'Usage limits', 'Support tiers'],
      },
      tiers: [
        {
          name: 'Professional',
          description: 'For individuals and small teams',
          price: {
            amount: 29,
            currency: 'USD',
            billing: 'monthly',
            discount: '20% off annually ($278/year)',
          },
          features: ['All basic features', 'Email support', 'Up to 10 users'],
          limits: [
            { metric: 'Users', limit: '10' },
            { metric: 'Projects', limit: '50' },
          ],
          targetSegment: 'Small teams',
          positioning: 'Entry-level paid tier',
        },
        {
          name: 'Business',
          description: 'For growing teams',
          price: {
            amount: 99,
            currency: 'USD',
            billing: 'monthly',
            discount: '20% off annually ($950/year)',
          },
          features: ['All Pro features', 'Priority support', 'Up to 50 users', 'Advanced analytics'],
          limits: [
            { metric: 'Users', limit: '50' },
            { metric: 'Projects', limit: 'Unlimited' },
          ],
          targetSegment: 'Medium teams',
          positioning: 'Most popular tier',
        },
      ],
      freeTier: {
        name: 'Free',
        features: ['Basic features', 'Community support'],
        limits: [
          { metric: 'Users', limit: '3' },
          { metric: 'Projects', limit: '5' },
        ],
        conversionGoal: '10-15%',
      },
      addOns: [
        {
          name: 'Premium Support',
          description: '24/7 priority support with SLA',
          price: 199,
          targetTiers: ['Professional', 'Business'],
        },
      ],
      competitiveComparison: [
        {
          competitor: 'Competitor A',
          ourPrice: '$29/mo',
          theirPrice: '$49/mo',
          positioning: '40% less expensive',
        },
      ],
      revenueProjections: [
        {
          tier: 'Professional',
          assumptions: {
            customerCount: 200,
            conversionRate: 10,
            churnRate: 5,
          },
          revenue: {
            monthly: 5800,
            annually: 69600,
          },
          contribution: 60,
        },
        {
          tier: 'Business',
          assumptions: {
            customerCount: 50,
            conversionRate: 3,
            churnRate: 3,
          },
          revenue: {
            monthly: 4950,
            annually: 59400,
          },
          contribution: 40,
        },
      ],
      pricingTests: [
        {
          hypothesis: 'Price sensitivity at $29 vs $39',
          test: 'A/B test Professional tier pricing',
          metrics: ['Conversion rate', 'Revenue per user'],
        },
      ],
    };

    return {
      reasoning: 'Fallback pricing model (LLM unavailable)',
      confidence: 0.5,
      intermediate: { pricingModel },
    };
  }
}
