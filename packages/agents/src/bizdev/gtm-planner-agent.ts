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
 * Target customer segment
 */
interface CustomerSegment {
  name: string;
  description: string;
  size: string;
  priority: 'primary' | 'secondary' | 'tertiary';
  characteristics: string[];
  painPoints: string[];
  channels: string[]; // How to reach them
}

/**
 * Marketing channel
 */
interface MarketingChannel {
  channel: string;
  type: 'owned' | 'earned' | 'paid';
  priority: 'high' | 'medium' | 'low';
  tactics: string[];
  estimatedCost: string;
  expectedROI: string;
  timeline: string;
}

/**
 * Launch phase
 */
interface LaunchPhase {
  phase: string; // Beta, Soft Launch, Public Launch, etc.
  timeline: string;
  objectives: string[];
  activities: string[];
  successMetrics: string[];
  budget: string;
}

/**
 * GTM Plan
 */
interface GTMPlan {
  positioning: {
    valueProposition: string;
    tagline: string;
    messagingPillars: string[];
    competitiveDifferentiation: string[];
  };
  targetSegments: CustomerSegment[];
  marketingChannels: MarketingChannel[];
  salesStrategy: {
    model: 'self-serve' | 'sales-assisted' | 'enterprise-sales' | 'hybrid';
    process: string[];
    enablement: string[];
    targets: {
      metric: string;
      target: string;
      timeframe: string;
    }[];
  };
  launchPlan: {
    phases: LaunchPhase[];
    overallTimeline: string;
    criticalMilestones: {
      milestone: string;
      date: string;
      deliverables: string[];
    }[];
  };
  partnerships: {
    type: 'distribution' | 'technology' | 'marketing' | 'strategic';
    partner: string;
    rationale: string;
    priority: 'high' | 'medium' | 'low';
  }[];
  metrics: {
    category: 'awareness' | 'acquisition' | 'activation' | 'retention' | 'revenue';
    metric: string;
    target: string;
    measurement: string;
  }[];
}

/**
 * GTMPlannerAgent
 *
 * Creates comprehensive Go-To-Market (GTM) plan including:
 * - Market positioning and messaging
 * - Target customer segments
 * - Marketing channels and tactics (owned, earned, paid)
 * - Sales strategy and process
 * - Launch plan with phases (beta, soft launch, public launch)
 * - Partnership strategy
 * - Success metrics and KPIs
 *
 * Part of the BIZDEV phase (runs in parallel with other BIZDEV agents).
 */
export class GTMPlannerAgent extends BaseAgent {
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
          stepId: 'define-positioning',
          description: 'Define market positioning and messaging',
          estimatedDurationMs: 2500,
          requiredTools: [],
        },
        {
          stepId: 'identify-segments',
          description: 'Identify target customer segments',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
        {
          stepId: 'plan-channels',
          description: 'Plan marketing channels and tactics',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
        {
          stepId: 'design-launch',
          description: 'Design phased launch plan',
          estimatedDurationMs: 2500,
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
    const competitive = this.extractData(input, 'competitive');
    const personas = this.extractData(input, 'personas');

    const prompt = this.buildGTMPrompt(ideaSpec, strategy, competitive, personas);

    try {
      const response = await this.llm.invoke(prompt);
      const gtmText = response.content.toString();

      const gtmPlan = this.parseGTMPlan(gtmText);

      return {
        reasoning: `Generated GTM plan with ${gtmPlan.targetSegments.length} segments, ${gtmPlan.marketingChannels.length} channels, ${gtmPlan.launchPlan.phases.length} launch phases`,
        confidence: 0.88,
        intermediate: {
          gtmPlan,
        },
      };
    } catch (error) {
      console.warn('[GTMPlannerAgent] LLM failed, using fallback:', error);
      return this.fallbackGTMPlan();
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const gtmPlan: GTMPlan = result.intermediate.gtmPlan;

    return [
      {
        type: 'gtm-plan',
        version: '1.0.0',
        content: gtmPlan,
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

  private buildGTMPrompt(
    ideaSpec: any,
    strategy: any,
    competitive: any,
    personas: any
  ): string {
    return `You are a go-to-market strategist creating a comprehensive GTM plan.

**Product:**
Title: ${ideaSpec?.title || 'N/A'}
Problem: ${ideaSpec?.problemStatement || 'N/A'}
Target Users: ${ideaSpec?.targetUsers?.join(', ') || 'N/A'}

**Strategy:**
Vision: ${strategy?.vision || 'N/A'}
Differentiators: ${strategy?.differentiators?.join(', ') || 'N/A'}

**Market:**
TAM: ${competitive?.marketSize?.tam || 'N/A'}
Competitors: ${competitive?.competitors?.map((c: any) => c.name).join(', ') || 'N/A'}

**Personas:**
${personas?.personas?.map((p: any) => `- ${p.name} (${p.type}): ${p.quote}`).join('\n') || 'N/A'}

Create a GTM plan in JSON format:

{
  "positioning": {
    "valueProposition": "<Clear value proposition in one sentence>",
    "tagline": "<Memorable tagline>",
    "messagingPillars": ["<Key message 1>", "<Key message 2>", "<Key message 3>"],
    "competitiveDifferentiation": ["<How we're different>"]
  },
  "targetSegments": [
    {
      "name": "<Segment name>",
      "description": "<Who they are>",
      "size": "<Market size estimate>",
      "priority": "primary|secondary|tertiary",
      "characteristics": ["<Characteristic>"],
      "painPoints": ["<Pain point>"],
      "channels": ["<How to reach them>"]
    }
  ],
  "marketingChannels": [
    {
      "channel": "<Channel name>",
      "type": "owned|earned|paid",
      "priority": "high|medium|low",
      "tactics": ["<Specific tactic>"],
      "estimatedCost": "<Cost estimate>",
      "expectedROI": "<Expected return>",
      "timeline": "<When to activate>"
    }
  ],
  "salesStrategy": {
    "model": "self-serve|sales-assisted|enterprise-sales|hybrid",
    "process": ["<Sales step 1>", "<Sales step 2>"],
    "enablement": ["<Enablement need>"],
    "targets": [
      {
        "metric": "<Sales metric>",
        "target": "<Target value>",
        "timeframe": "<Timeline>"
      }
    ]
  },
  "launchPlan": {
    "phases": [
      {
        "phase": "Beta|Soft Launch|Public Launch|...",
        "timeline": "<Duration>",
        "objectives": ["<Objective>"],
        "activities": ["<Activity>"],
        "successMetrics": ["<Success metric>"],
        "budget": "<Budget estimate>"
      }
    ],
    "overallTimeline": "<Total timeline>",
    "criticalMilestones": [
      {
        "milestone": "<Milestone name>",
        "date": "<Relative date>",
        "deliverables": ["<Deliverable>"]
      }
    ]
  },
  "partnerships": [
    {
      "type": "distribution|technology|marketing|strategic",
      "partner": "<Partner type or name>",
      "rationale": "<Why this partnership>",
      "priority": "high|medium|low"
    }
  ],
  "metrics": [
    {
      "category": "awareness|acquisition|activation|retention|revenue",
      "metric": "<Metric name>",
      "target": "<Target value>",
      "measurement": "<How to measure>"
    }
  ]
}

**Guidelines:**
- Define 2-4 customer segments (prioritize primary)
- Include 5-10 marketing channels across owned/earned/paid
- Create 3-4 launch phases (beta → soft launch → public launch → growth)
- Define 10-15 key metrics across AARRR funnel
- Be specific with tactics and timelines
- Consider budget constraints
- Align with product differentiators

Respond ONLY with JSON.`;
  }

  private parseGTMPlan(gtmText: string): GTMPlan {
    try {
      const jsonMatch = gtmText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        positioning: {
          valueProposition: parsed.positioning?.valueProposition || 'Value proposition TBD',
          tagline: parsed.positioning?.tagline || 'Tagline TBD',
          messagingPillars: Array.isArray(parsed.positioning?.messagingPillars)
            ? parsed.positioning.messagingPillars.slice(0, 5)
            : [],
          competitiveDifferentiation: Array.isArray(
            parsed.positioning?.competitiveDifferentiation
          )
            ? parsed.positioning.competitiveDifferentiation.slice(0, 5)
            : [],
        },
        targetSegments: Array.isArray(parsed.targetSegments)
          ? parsed.targetSegments.slice(0, 4).map((seg: any) => ({
              name: seg.name || 'Segment',
              description: seg.description || 'Description TBD',
              size: seg.size || 'Unknown',
              priority: this.normalizePriority(seg.priority),
              characteristics: Array.isArray(seg.characteristics)
                ? seg.characteristics.slice(0, 5)
                : [],
              painPoints: Array.isArray(seg.painPoints) ? seg.painPoints.slice(0, 5) : [],
              channels: Array.isArray(seg.channels) ? seg.channels.slice(0, 5) : [],
            }))
          : [],
        marketingChannels: Array.isArray(parsed.marketingChannels)
          ? parsed.marketingChannels.slice(0, 10).map((ch: any) => ({
              channel: ch.channel || 'Channel',
              type: this.normalizeChannelType(ch.type),
              priority: this.normalizeChannelPriority(ch.priority),
              tactics: Array.isArray(ch.tactics) ? ch.tactics.slice(0, 5) : [],
              estimatedCost: ch.estimatedCost || 'TBD',
              expectedROI: ch.expectedROI || 'TBD',
              timeline: ch.timeline || 'TBD',
            }))
          : [],
        salesStrategy: {
          model: this.normalizeSalesModel(parsed.salesStrategy?.model),
          process: Array.isArray(parsed.salesStrategy?.process)
            ? parsed.salesStrategy.process.slice(0, 10)
            : [],
          enablement: Array.isArray(parsed.salesStrategy?.enablement)
            ? parsed.salesStrategy.enablement.slice(0, 5)
            : [],
          targets: Array.isArray(parsed.salesStrategy?.targets)
            ? parsed.salesStrategy.targets.slice(0, 5).map((t: any) => ({
                metric: t.metric || 'Metric',
                target: t.target || 'TBD',
                timeframe: t.timeframe || 'TBD',
              }))
            : [],
        },
        launchPlan: {
          phases: Array.isArray(parsed.launchPlan?.phases)
            ? parsed.launchPlan.phases.slice(0, 4).map((phase: any) => ({
                phase: phase.phase || 'Phase',
                timeline: phase.timeline || 'TBD',
                objectives: Array.isArray(phase.objectives) ? phase.objectives.slice(0, 5) : [],
                activities: Array.isArray(phase.activities) ? phase.activities.slice(0, 10) : [],
                successMetrics: Array.isArray(phase.successMetrics)
                  ? phase.successMetrics.slice(0, 5)
                  : [],
                budget: phase.budget || 'TBD',
              }))
            : [],
          overallTimeline: parsed.launchPlan?.overallTimeline || 'TBD',
          criticalMilestones: Array.isArray(parsed.launchPlan?.criticalMilestones)
            ? parsed.launchPlan.criticalMilestones.slice(0, 10).map((m: any) => ({
                milestone: m.milestone || 'Milestone',
                date: m.date || 'TBD',
                deliverables: Array.isArray(m.deliverables) ? m.deliverables.slice(0, 5) : [],
              }))
            : [],
        },
        partnerships: Array.isArray(parsed.partnerships)
          ? parsed.partnerships.slice(0, 5).map((p: any) => ({
              type: this.normalizePartnershipType(p.type),
              partner: p.partner || 'Partner TBD',
              rationale: p.rationale || 'Rationale TBD',
              priority: this.normalizeChannelPriority(p.priority),
            }))
          : [],
        metrics: Array.isArray(parsed.metrics)
          ? parsed.metrics.slice(0, 15).map((m: any) => ({
              category: this.normalizeMetricCategory(m.category),
              metric: m.metric || 'Metric',
              target: m.target || 'TBD',
              measurement: m.measurement || 'TBD',
            }))
          : [],
      };
    } catch (error) {
      console.warn('[GTMPlannerAgent] Failed to parse:', error);
      throw error;
    }
  }

  private normalizePriority(priority: string): 'primary' | 'secondary' | 'tertiary' {
    const normalized = priority?.toLowerCase();
    if (normalized === 'primary') return 'primary';
    if (normalized === 'tertiary') return 'tertiary';
    return 'secondary';
  }

  private normalizeChannelType(type: string): 'owned' | 'earned' | 'paid' {
    const normalized = type?.toLowerCase();
    if (normalized === 'owned') return 'owned';
    if (normalized === 'earned') return 'earned';
    return 'paid';
  }

  private normalizeChannelPriority(priority: string): 'high' | 'medium' | 'low' {
    const normalized = priority?.toLowerCase();
    if (normalized === 'high') return 'high';
    if (normalized === 'low') return 'low';
    return 'medium';
  }

  private normalizeSalesModel(
    model: string
  ): 'self-serve' | 'sales-assisted' | 'enterprise-sales' | 'hybrid' {
    const normalized = model?.toLowerCase();
    if (normalized?.includes('self')) return 'self-serve';
    if (normalized?.includes('enterprise')) return 'enterprise-sales';
    if (normalized?.includes('assisted')) return 'sales-assisted';
    return 'hybrid';
  }

  private normalizePartnershipType(
    type: string
  ): 'distribution' | 'technology' | 'marketing' | 'strategic' {
    const normalized = type?.toLowerCase();
    if (normalized === 'distribution') return 'distribution';
    if (normalized === 'technology') return 'technology';
    if (normalized === 'marketing') return 'marketing';
    return 'strategic';
  }

  private normalizeMetricCategory(
    category: string
  ): 'awareness' | 'acquisition' | 'activation' | 'retention' | 'revenue' {
    const normalized = category?.toLowerCase();
    if (normalized?.includes('aware')) return 'awareness';
    if (normalized?.includes('acqui')) return 'acquisition';
    if (normalized?.includes('activ')) return 'activation';
    if (normalized?.includes('reten')) return 'retention';
    return 'revenue';
  }

  private fallbackGTMPlan(): ReasoningResult {
    const gtmPlan: GTMPlan = {
      positioning: {
        valueProposition: 'Solving key customer problems efficiently',
        tagline: 'Your solution, simplified',
        messagingPillars: ['Easy to use', 'Powerful features', 'Great value'],
        competitiveDifferentiation: ['Better UX', 'Lower cost', 'Faster implementation'],
      },
      targetSegments: [
        {
          name: 'Primary Users',
          description: 'Core target audience',
          size: 'TBD',
          priority: 'primary',
          characteristics: ['Tech-savvy', 'Cost-conscious'],
          painPoints: ['Current solutions too complex'],
          channels: ['Online search', 'Social media'],
        },
      ],
      marketingChannels: [
        {
          channel: 'Content Marketing',
          type: 'owned',
          priority: 'high',
          tactics: ['Blog', 'SEO', 'Email'],
          estimatedCost: '$2K/month',
          expectedROI: '3:1',
          timeline: 'Month 1+',
        },
        {
          channel: 'Social Media',
          type: 'owned',
          priority: 'high',
          tactics: ['LinkedIn', 'Twitter'],
          estimatedCost: '$1K/month',
          expectedROI: '2:1',
          timeline: 'Month 1+',
        },
      ],
      salesStrategy: {
        model: 'self-serve',
        process: ['Sign up', 'Onboarding', 'Activation', 'Conversion'],
        enablement: ['Documentation', 'Tutorials', 'Support'],
        targets: [
          { metric: 'Signups', target: '100/month', timeframe: 'Month 3' },
          { metric: 'Conversions', target: '20/month', timeframe: 'Month 3' },
        ],
      },
      launchPlan: {
        phases: [
          {
            phase: 'Beta',
            timeline: 'Month 1-2',
            objectives: ['Validate product', 'Gather feedback'],
            activities: ['Recruit beta users', 'Iterate on feedback'],
            successMetrics: ['20 active beta users', '4.0+ satisfaction'],
            budget: '$5K',
          },
          {
            phase: 'Public Launch',
            timeline: 'Month 3',
            objectives: ['Public availability', 'Initial traction'],
            activities: ['Press release', 'Launch campaign'],
            successMetrics: ['100 signups', 'Media coverage'],
            budget: '$10K',
          },
        ],
        overallTimeline: '3 months',
        criticalMilestones: [
          {
            milestone: 'Beta launch',
            date: 'Month 1',
            deliverables: ['Beta product', 'Documentation'],
          },
        ],
      },
      partnerships: [
        {
          type: 'distribution',
          partner: 'Integration partners',
          rationale: 'Expand reach',
          priority: 'medium',
        },
      ],
      metrics: [
        {
          category: 'acquisition',
          metric: 'Website visitors',
          target: '1000/month',
          measurement: 'Google Analytics',
        },
        {
          category: 'activation',
          metric: 'Activation rate',
          target: '40%',
          measurement: 'Product analytics',
        },
      ],
    };

    return {
      reasoning: 'Fallback GTM plan (LLM unavailable)',
      confidence: 0.5,
      intermediate: { gtmPlan },
    };
  }
}
