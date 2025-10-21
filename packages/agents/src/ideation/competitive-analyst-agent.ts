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
 * Competitive analysis output
 */
interface CompetitiveAnalysis {
  marketSize: {
    tam: string; // Total Addressable Market
    sam: string; // Serviceable Addressable Market
    som: string; // Serviceable Obtainable Market
  };
  competitors: Array<{
    name: string;
    type: 'direct' | 'indirect' | 'substitute';
    strengths: string[];
    weaknesses: string[];
    marketShare?: string;
    pricing?: string;
  }>;
  marketTrends: string[];
  opportunities: string[];
  threats: string[];
  competitiveAdvantages: string[];
  barriersToDifferentiateEntry: string[];
}

/**
 * CompetitiveAnalystAgent
 *
 * Analyzes market landscape and competitive positioning.
 * Provides insights on:
 * - Market size and opportunity
 * - Direct and indirect competitors
 * - Market trends
 * - Competitive advantages
 * - Entry barriers
 *
 * Part of the IDEATION phase (runs in parallel).
 */
export class CompetitiveAnalystAgent extends BaseAgent {
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
          stepId: 'estimate-market-size',
          description: 'Estimate TAM, SAM, SOM',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
        {
          stepId: 'identify-competitors',
          description: 'Identify direct, indirect, and substitute competitors',
          estimatedDurationMs: 4000,
          requiredTools: [],
        },
        {
          stepId: 'analyze-trends',
          description: 'Analyze market trends and opportunities',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
      ],
      estimatedTotalDurationMs: 10000,
      confidence: 0.8,
    };
  }

  protected async reason(
    plan: ExecutionPlan,
    input: AgentInput
  ): Promise<ReasoningResult> {
    const ideaSpec = this.extractIdeaSpec(input);

    const prompt = this.buildCompetitivePrompt(ideaSpec);

    try {
      const response = await this.llm.invoke(prompt);
      const analysisText = response.content.toString();

      const analysis = this.parseAnalysis(analysisText);

      return {
        reasoning: `Analyzed market with ${analysis.competitors.length} competitors and ${analysis.opportunities.length} opportunities`,
        confidence: 0.85,
        intermediate: {
          analysis,
        },
      };
    } catch (error) {
      console.warn('[CompetitiveAnalystAgent] LLM failed, using fallback:', error);
      return this.fallbackAnalysis(ideaSpec);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const analysis: CompetitiveAnalysis = result.intermediate.analysis;

    return [
      {
        type: 'competitive-analysis',
        version: '1.0.0',
        content: analysis,
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

  private buildCompetitivePrompt(ideaSpec: any): string {
    return `You are a competitive market analyst. Analyze the competitive landscape for this product idea.

**Idea Details:**
Title: ${ideaSpec.title || 'Untitled'}
Description: ${ideaSpec.description || 'No description'}
Target Users: ${ideaSpec.targetUsers?.join(', ') || 'Not specified'}
Category: ${ideaSpec.metadata?.category || 'Not specified'}

Provide competitive analysis in JSON format:

{
  "marketSize": {
    "tam": "<Total Addressable Market estimate with reasoning>",
    "sam": "<Serviceable Addressable Market estimate>",
    "som": "<Serviceable Obtainable Market for first 12 months>"
  },
  "competitors": [
    {
      "name": "<Competitor name>",
      "type": "direct|indirect|substitute",
      "strengths": ["<strength1>", "<strength2>"],
      "weaknesses": ["<weakness1>", "<weakness2>"],
      "marketShare": "<Estimated share if known>",
      "pricing": "<Pricing model if known>"
    }
  ],
  "marketTrends": [
    "<Current trend affecting this market>",
    "<Emerging trend>"
  ],
  "opportunities": [
    "<Market gap or opportunity>",
    "<Underserved segment>"
  ],
  "threats": [
    "<Competitive threat>",
    "<Market risk>"
  ],
  "competitiveAdvantages": [
    "<How this product can differentiate>",
    "<Potential competitive moat>"
  ],
  "barriersToEntry": [
    "<Barrier to entering this market>",
    "<Challenge for new entrants>"
  ]
}

Guidelines:
- Market Size: Provide realistic estimates with reasoning
- Competitors: List 3-7 key competitors (mix of direct/indirect)
- Each competitor: 2-3 strengths, 2-3 weaknesses
- Market Trends: 3-5 current and emerging trends
- Opportunities: 3-5 specific market gaps
- Threats: 3-5 competitive or market threats
- Be specific and realistic

Respond ONLY with JSON.`;
  }

  private parseAnalysis(analysisText: string): CompetitiveAnalysis {
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        marketSize: {
          tam: parsed.marketSize?.tam || 'Market size not estimated',
          sam: parsed.marketSize?.sam || 'SAM not estimated',
          som: parsed.marketSize?.som || 'SOM not estimated',
        },
        competitors: Array.isArray(parsed.competitors)
          ? parsed.competitors.slice(0, 7).map((c: any) => ({
              name: c.name || 'Unknown Competitor',
              type: this.normalizeCompetitorType(c.type),
              strengths: Array.isArray(c.strengths) ? c.strengths.slice(0, 3) : [],
              weaknesses: Array.isArray(c.weaknesses) ? c.weaknesses.slice(0, 3) : [],
              marketShare: c.marketShare,
              pricing: c.pricing,
            }))
          : [],
        marketTrends: Array.isArray(parsed.marketTrends)
          ? parsed.marketTrends.slice(0, 5)
          : [],
        opportunities: Array.isArray(parsed.opportunities)
          ? parsed.opportunities.slice(0, 5)
          : [],
        threats: Array.isArray(parsed.threats) ? parsed.threats.slice(0, 5) : [],
        competitiveAdvantages: Array.isArray(parsed.competitiveAdvantages)
          ? parsed.competitiveAdvantages.slice(0, 5)
          : [],
        barriersToDifferentiateEntry: Array.isArray(parsed.barriersToEntry)
          ? parsed.barriersToEntry.slice(0, 5)
          : [],
      };
    } catch (error) {
      console.warn('[CompetitiveAnalystAgent] Failed to parse:', error);
      throw error;
    }
  }

  private normalizeCompetitorType(type: string): 'direct' | 'indirect' | 'substitute' {
    const normalized = type?.toLowerCase();
    if (normalized === 'direct') return 'direct';
    if (normalized === 'substitute') return 'substitute';
    return 'indirect';
  }

  private fallbackAnalysis(ideaSpec: any): ReasoningResult {
    const analysis: CompetitiveAnalysis = {
      marketSize: {
        tam: 'Market sizing requires additional research',
        sam: 'Serviceable market to be determined',
        som: 'Target 1-5% of SAM in first year',
      },
      competitors: [
        {
          name: 'Established players',
          type: 'direct',
          strengths: ['Brand recognition', 'Market share'],
          weaknesses: ['Legacy technology', 'Slow to innovate'],
        },
      ],
      marketTrends: ['Digital transformation', 'User experience focus'],
      opportunities: ['Underserved segments', 'Modern alternatives'],
      threats: ['Market saturation', 'Competition'],
      competitiveAdvantages: ['Modern tech stack', 'User-centric design'],
      barriersToDifferentiateEntry: ['Brand building', 'User acquisition costs'],
    };

    return {
      reasoning: 'Fallback analysis (LLM unavailable)',
      confidence: 0.5,
      intermediate: { analysis },
    };
  }
}
