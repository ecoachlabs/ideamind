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
 * Financial projections
 */
interface FinancialProjections {
  revenue: {
    year1: number;
    year2: number;
    year3: number;
    assumptions: string[];
  };
  costs: {
    development: number;
    operations: number;
    marketing: number;
    total: number;
    breakdown: string[];
  };
  profitability: {
    breakEvenMonth: number;
    grossMargin: number; // Percentage
    netMargin: number; // Percentage
    roi: number; // Return on investment percentage
  };
}

/**
 * Market viability assessment
 */
interface MarketViability {
  marketSize: {
    tam: string;
    sam: string;
    som: string;
    reachability: 'high' | 'medium' | 'low';
  };
  demandValidation: {
    level: 'validated' | 'assumed' | 'uncertain';
    evidence: string[];
    risks: string[];
  };
  competitivePosition: {
    strength: 'strong' | 'moderate' | 'weak';
    advantages: string[];
    threats: string[];
  };
}

/**
 * Unit economics
 */
interface UnitEconomics {
  ltv: number; // Lifetime value per customer
  cac: number; // Customer acquisition cost
  ltvCacRatio: number; // LTV:CAC ratio (target: >= 3.0)
  paybackPeriod: number; // Months to recover CAC
  churnRate: number; // Monthly churn percentage
  calculations: {
    avgRevenuePerUser: number;
    avgCustomerLifespan: number; // Months
    grossMarginPerCustomer: number;
  };
}

/**
 * Viability analysis output
 */
interface ViabilityAnalysis {
  overallViability: 'highly-viable' | 'viable' | 'marginally-viable' | 'not-viable';
  viabilityScore: number; // 0-100
  financialProjections: FinancialProjections;
  marketViability: MarketViability;
  unitEconomics: UnitEconomics;
  keyMetrics: {
    metric: string;
    value: string;
    target: string;
    status: 'exceeds' | 'meets' | 'below';
  }[];
  goNoGoRecommendation: {
    decision: 'go' | 'go-with-conditions' | 'no-go';
    reasoning: string;
    conditions?: string[];
  };
  risks: {
    financial: string[];
    market: string[];
    execution: string[];
  };
}

/**
 * ViabilityAnalyzerAgent
 *
 * Analyzes business viability across multiple dimensions:
 * - Financial viability: Revenue projections, costs, profitability, breakeven
 * - Market viability: TAM/SAM/SOM, demand validation, competitive position
 * - Unit economics: LTV, CAC, LTV:CAC ratio, payback period, churn
 * - Strategic viability: Alignment with goals, resource requirements
 *
 * Provides go/no-go recommendation based on comprehensive analysis.
 *
 * Part of the BIZDEV phase (runs in parallel with other BIZDEV agents).
 */
export class ViabilityAnalyzerAgent extends BaseAgent {
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
          stepId: 'analyze-financials',
          description: 'Analyze financial projections and profitability',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
        {
          stepId: 'assess-market',
          description: 'Assess market viability and competitive position',
          estimatedDurationMs: 2500,
          requiredTools: [],
        },
        {
          stepId: 'calculate-unit-economics',
          description: 'Calculate unit economics and key metrics',
          estimatedDurationMs: 2500,
          requiredTools: [],
        },
        {
          stepId: 'make-recommendation',
          description: 'Synthesize analysis and make go/no-go recommendation',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
      ],
      estimatedTotalDurationMs: 10000,
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
    const prd = this.extractData(input, 'prd');

    const prompt = this.buildViabilityPrompt(ideaSpec, strategy, competitive, prd);

    try {
      const response = await this.llm.invoke(prompt);
      const analysisText = response.content.toString();

      const analysis = this.parseAnalysis(analysisText);

      return {
        reasoning: `Viability analysis: ${analysis.overallViability} (score: ${analysis.viabilityScore}/100), LTV:CAC ratio: ${analysis.unitEconomics.ltvCacRatio}`,
        confidence: 0.89,
        intermediate: {
          analysis,
        },
      };
    } catch (error) {
      console.warn('[ViabilityAnalyzerAgent] LLM failed, using fallback:', error);
      return this.fallbackAnalysis();
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const analysis: ViabilityAnalysis = result.intermediate.analysis;

    return [
      {
        type: 'viability-analysis',
        version: '1.0.0',
        content: analysis,
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

  private buildViabilityPrompt(
    ideaSpec: any,
    strategy: any,
    competitive: any,
    prd: any
  ): string {
    return `You are a business analyst conducting a viability analysis.

**Product:**
Title: ${ideaSpec?.title || 'N/A'}
Category: ${ideaSpec?.metadata?.category || 'N/A'}
Budget: $${ideaSpec?.constraints?.budget?.min || 0}-${ideaSpec?.constraints?.budget?.max || 0}
Timeline: ${ideaSpec?.constraints?.timeline?.max || 0} days

**Strategy:**
Vision: ${strategy?.vision || 'N/A'}
Success Metrics: ${strategy?.successMetrics?.map((m: any) => m.metric).join(', ') || 'N/A'}

**Market:**
TAM: ${competitive?.marketSize?.tam || 'N/A'}
SAM: ${competitive?.marketSize?.sam || 'N/A'}
SOM: ${competitive?.marketSize?.som || 'N/A'}
Competitors: ${competitive?.competitors?.length || 0}

**PRD:**
Functional Requirements: ${prd?.functionalRequirements?.length || 0}
Release Phases: ${prd?.releaseStrategy?.phases?.length || 0}

Analyze business viability in JSON format:

{
  "overallViability": "highly-viable|viable|marginally-viable|not-viable",
  "viabilityScore": <0-100>,
  "financialProjections": {
    "revenue": {
      "year1": <Annual revenue estimate>,
      "year2": <Year 2 revenue>,
      "year3": <Year 3 revenue>,
      "assumptions": ["<Revenue assumption>"]
    },
    "costs": {
      "development": <One-time dev costs>,
      "operations": <Annual operating costs>,
      "marketing": <Annual marketing costs>,
      "total": <Total annual costs>,
      "breakdown": ["<Cost breakdown>"]
    },
    "profitability": {
      "breakEvenMonth": <Months to breakeven>,
      "grossMargin": <Percentage>,
      "netMargin": <Percentage>,
      "roi": <Return on investment %>
    }
  },
  "marketViability": {
    "marketSize": {
      "tam": "<Total addressable market>",
      "sam": "<Serviceable addressable market>",
      "som": "<Serviceable obtainable market>",
      "reachability": "high|medium|low"
    },
    "demandValidation": {
      "level": "validated|assumed|uncertain",
      "evidence": ["<Evidence of demand>"],
      "risks": ["<Demand risk>"]
    },
    "competitivePosition": {
      "strength": "strong|moderate|weak",
      "advantages": ["<Competitive advantage>"],
      "threats": ["<Competitive threat>"]
    }
  },
  "unitEconomics": {
    "ltv": <Lifetime value per customer>,
    "cac": <Customer acquisition cost>,
    "ltvCacRatio": <LTV/CAC ratio, target >= 3.0>,
    "paybackPeriod": <Months to recover CAC>,
    "churnRate": <Monthly churn %>,
    "calculations": {
      "avgRevenuePerUser": <ARPU>,
      "avgCustomerLifespan": <Months>,
      "grossMarginPerCustomer": <Margin per customer>
    }
  },
  "keyMetrics": [
    {
      "metric": "<Metric name>",
      "value": "<Current/projected value>",
      "target": "<Target value>",
      "status": "exceeds|meets|below"
    }
  ],
  "goNoGoRecommendation": {
    "decision": "go|go-with-conditions|no-go",
    "reasoning": "<Why this decision>",
    "conditions": ["<Condition if go-with-conditions>"]
  },
  "risks": {
    "financial": ["<Financial risk>"],
    "market": ["<Market risk>"],
    "execution": ["<Execution risk>"]
  }
}

**Guidelines:**
- Be realistic with financial projections (avoid over-optimism)
- LTV:CAC ratio should be >= 3.0 for healthy business
- Payback period should be <= 12 months
- Breakeven within 18-24 months is reasonable
- Consider market saturation and competition
- Factor in customer acquisition challenges
- Account for churn and retention costs

Respond ONLY with JSON.`;
  }

  private parseAnalysis(analysisText: string): ViabilityAnalysis {
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        overallViability: this.normalizeViability(parsed.overallViability),
        viabilityScore: Math.max(0, Math.min(100, parsed.viabilityScore || 50)),
        financialProjections: {
          revenue: {
            year1: parsed.financialProjections?.revenue?.year1 || 0,
            year2: parsed.financialProjections?.revenue?.year2 || 0,
            year3: parsed.financialProjections?.revenue?.year3 || 0,
            assumptions: Array.isArray(parsed.financialProjections?.revenue?.assumptions)
              ? parsed.financialProjections.revenue.assumptions.slice(0, 5)
              : [],
          },
          costs: {
            development: parsed.financialProjections?.costs?.development || 0,
            operations: parsed.financialProjections?.costs?.operations || 0,
            marketing: parsed.financialProjections?.costs?.marketing || 0,
            total: parsed.financialProjections?.costs?.total || 0,
            breakdown: Array.isArray(parsed.financialProjections?.costs?.breakdown)
              ? parsed.financialProjections.costs.breakdown.slice(0, 10)
              : [],
          },
          profitability: {
            breakEvenMonth: parsed.financialProjections?.profitability?.breakEvenMonth || 18,
            grossMargin: parsed.financialProjections?.profitability?.grossMargin || 50,
            netMargin: parsed.financialProjections?.profitability?.netMargin || 10,
            roi: parsed.financialProjections?.profitability?.roi || 0,
          },
        },
        marketViability: {
          marketSize: {
            tam: parsed.marketViability?.marketSize?.tam || 'Unknown',
            sam: parsed.marketViability?.marketSize?.sam || 'Unknown',
            som: parsed.marketViability?.marketSize?.som || 'Unknown',
            reachability: this.normalizeReachability(
              parsed.marketViability?.marketSize?.reachability
            ),
          },
          demandValidation: {
            level: this.normalizeDemandLevel(parsed.marketViability?.demandValidation?.level),
            evidence: Array.isArray(parsed.marketViability?.demandValidation?.evidence)
              ? parsed.marketViability.demandValidation.evidence.slice(0, 5)
              : [],
            risks: Array.isArray(parsed.marketViability?.demandValidation?.risks)
              ? parsed.marketViability.demandValidation.risks.slice(0, 5)
              : [],
          },
          competitivePosition: {
            strength: this.normalizeStrength(
              parsed.marketViability?.competitivePosition?.strength
            ),
            advantages: Array.isArray(parsed.marketViability?.competitivePosition?.advantages)
              ? parsed.marketViability.competitivePosition.advantages.slice(0, 5)
              : [],
            threats: Array.isArray(parsed.marketViability?.competitivePosition?.threats)
              ? parsed.marketViability.competitivePosition.threats.slice(0, 5)
              : [],
          },
        },
        unitEconomics: {
          ltv: parsed.unitEconomics?.ltv || 0,
          cac: parsed.unitEconomics?.cac || 0,
          ltvCacRatio: parsed.unitEconomics?.ltvCacRatio || 0,
          paybackPeriod: parsed.unitEconomics?.paybackPeriod || 12,
          churnRate: parsed.unitEconomics?.churnRate || 5,
          calculations: {
            avgRevenuePerUser: parsed.unitEconomics?.calculations?.avgRevenuePerUser || 0,
            avgCustomerLifespan: parsed.unitEconomics?.calculations?.avgCustomerLifespan || 12,
            grossMarginPerCustomer:
              parsed.unitEconomics?.calculations?.grossMarginPerCustomer || 0,
          },
        },
        keyMetrics: Array.isArray(parsed.keyMetrics)
          ? parsed.keyMetrics.slice(0, 10).map((m: any) => ({
              metric: m.metric || 'Metric',
              value: m.value || 'N/A',
              target: m.target || 'N/A',
              status: this.normalizeStatus(m.status),
            }))
          : [],
        goNoGoRecommendation: {
          decision: this.normalizeDecision(parsed.goNoGoRecommendation?.decision),
          reasoning: parsed.goNoGoRecommendation?.reasoning || 'Analysis provided',
          conditions: Array.isArray(parsed.goNoGoRecommendation?.conditions)
            ? parsed.goNoGoRecommendation.conditions.slice(0, 5)
            : undefined,
        },
        risks: {
          financial: Array.isArray(parsed.risks?.financial)
            ? parsed.risks.financial.slice(0, 5)
            : [],
          market: Array.isArray(parsed.risks?.market) ? parsed.risks.market.slice(0, 5) : [],
          execution: Array.isArray(parsed.risks?.execution)
            ? parsed.risks.execution.slice(0, 5)
            : [],
        },
      };
    } catch (error) {
      console.warn('[ViabilityAnalyzerAgent] Failed to parse:', error);
      throw error;
    }
  }

  private normalizeViability(
    viability: string
  ): 'highly-viable' | 'viable' | 'marginally-viable' | 'not-viable' {
    const normalized = viability?.toLowerCase();
    if (normalized?.includes('highly')) return 'highly-viable';
    if (normalized?.includes('marginal')) return 'marginally-viable';
    if (normalized?.includes('not')) return 'not-viable';
    return 'viable';
  }

  private normalizeReachability(reach: string): 'high' | 'medium' | 'low' {
    const normalized = reach?.toLowerCase();
    if (normalized === 'high') return 'high';
    if (normalized === 'low') return 'low';
    return 'medium';
  }

  private normalizeDemandLevel(level: string): 'validated' | 'assumed' | 'uncertain' {
    const normalized = level?.toLowerCase();
    if (normalized?.includes('validated')) return 'validated';
    if (normalized?.includes('uncertain')) return 'uncertain';
    return 'assumed';
  }

  private normalizeStrength(strength: string): 'strong' | 'moderate' | 'weak' {
    const normalized = strength?.toLowerCase();
    if (normalized === 'strong') return 'strong';
    if (normalized === 'weak') return 'weak';
    return 'moderate';
  }

  private normalizeStatus(status: string): 'exceeds' | 'meets' | 'below' {
    const normalized = status?.toLowerCase();
    if (normalized?.includes('exceed')) return 'exceeds';
    if (normalized?.includes('below')) return 'below';
    return 'meets';
  }

  private normalizeDecision(decision: string): 'go' | 'go-with-conditions' | 'no-go' {
    const normalized = decision?.toLowerCase();
    if (normalized?.includes('no')) return 'no-go';
    if (normalized?.includes('condition')) return 'go-with-conditions';
    return 'go';
  }

  private fallbackAnalysis(): ReasoningResult {
    const analysis: ViabilityAnalysis = {
      overallViability: 'viable',
      viabilityScore: 65,
      financialProjections: {
        revenue: {
          year1: 100000,
          year2: 300000,
          year3: 750000,
          assumptions: ['Initial customer acquisition', 'Market growth'],
        },
        costs: {
          development: 25000,
          operations: 50000,
          marketing: 30000,
          total: 105000,
          breakdown: ['Development: $25K', 'Operations: $50K', 'Marketing: $30K'],
        },
        profitability: {
          breakEvenMonth: 18,
          grossMargin: 60,
          netMargin: 15,
          roi: 150,
        },
      },
      marketViability: {
        marketSize: {
          tam: '$1B',
          sam: '$100M',
          som: '$10M',
          reachability: 'medium',
        },
        demandValidation: {
          level: 'assumed',
          evidence: ['Similar products exist'],
          risks: ['Unvalidated demand'],
        },
        competitivePosition: {
          strength: 'moderate',
          advantages: ['Differentiated approach'],
          threats: ['Established competitors'],
        },
      },
      unitEconomics: {
        ltv: 1200,
        cac: 300,
        ltvCacRatio: 4.0,
        paybackPeriod: 8,
        churnRate: 5,
        calculations: {
          avgRevenuePerUser: 50,
          avgCustomerLifespan: 24,
          grossMarginPerCustomer: 720,
        },
      },
      keyMetrics: [
        {
          metric: 'LTV:CAC Ratio',
          value: '4.0',
          target: '>= 3.0',
          status: 'exceeds',
        },
      ],
      goNoGoRecommendation: {
        decision: 'go-with-conditions',
        reasoning: 'Viable with demand validation',
        conditions: ['Validate demand', 'Secure initial customers'],
      },
      risks: {
        financial: ['Revenue assumptions unvalidated'],
        market: ['Competitive pressure'],
        execution: ['Team capacity'],
      },
    };

    return {
      reasoning: 'Fallback viability analysis (LLM unavailable)',
      confidence: 0.5,
      intermediate: { analysis },
    };
  }
}
