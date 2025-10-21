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
 * Challenged assumption
 */
interface ChallengedAssumption {
  id: string;
  assumption: string;
  category: 'market' | 'user' | 'technical' | 'business' | 'competitive';
  validity: 'likely-false' | 'questionable' | 'needs-validation' | 'likely-true';
  evidence: {
    supporting: string[];
    contradicting: string[];
  };
  validationMethod: string; // How to test this assumption
  consequenceIfWrong: string;
  alternativeHypothesis: string;
}

/**
 * Assumption analysis output
 */
interface AssumptionAnalysis {
  challengedAssumptions: ChallengedAssumption[];
  criticalAssumptions: ChallengedAssumption[]; // Top 5 most critical
  assumptionHealthScore: number; // 0-100, higher is better
  validationPlan: {
    priority: 'high' | 'medium' | 'low';
    method: string;
    estimatedCost: string;
    estimatedTime: string;
    assumptions: string[]; // assumption IDs
  }[];
  blindSpots: string[]; // Things likely not considered
  recommendedActions: string[];
}

/**
 * AssumptionChallengerAgent
 *
 * Questions underlying assumptions in the product strategy, market analysis,
 * and technical approach. Identifies implicit beliefs that may be incorrect
 * and suggests validation methods.
 *
 * Challenges assumptions about:
 * - Market: Size, demand, willingness to pay
 * - Users: Behaviors, needs, preferences
 * - Technical: Feasibility, performance, scalability
 * - Business: Revenue model, costs, competition
 * - Competitive: Responses, barriers to entry
 *
 * Part of the CRITIQUE phase (runs in parallel).
 */
export class AssumptionChallengerAgent extends BaseAgent {
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
          stepId: 'extract-assumptions',
          description: 'Extract implicit and explicit assumptions',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
        {
          stepId: 'challenge-assumptions',
          description: 'Challenge each assumption with evidence',
          estimatedDurationMs: 4000,
          requiredTools: [],
        },
        {
          stepId: 'identify-blindspots',
          description: 'Identify overlooked considerations',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
        {
          stepId: 'create-validation-plan',
          description: 'Create plan to validate critical assumptions',
          estimatedDurationMs: 1000,
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
    const ideaSpec = this.extractData(input, 'ideaSpec');
    const strategy = this.extractData(input, 'strategy');
    const competitive = this.extractData(input, 'competitive');
    const personas = this.extractData(input, 'personas');

    const prompt = this.buildAssumptionPrompt(ideaSpec, strategy, competitive, personas);

    try {
      const response = await this.llm.invoke(prompt);
      const analysisText = response.content.toString();

      const analysis = this.parseAnalysis(analysisText);

      return {
        reasoning: `Challenged ${analysis.challengedAssumptions.length} assumptions, identified ${analysis.criticalAssumptions.length} critical ones`,
        confidence: 0.86,
        intermediate: {
          analysis,
        },
      };
    } catch (error) {
      console.warn('[AssumptionChallengerAgent] LLM failed, using fallback:', error);
      return this.fallbackAnalysis();
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const analysis: AssumptionAnalysis = result.intermediate.analysis;

    return [
      {
        type: 'assumption-analysis',
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

  private buildAssumptionPrompt(
    ideaSpec: any,
    strategy: any,
    competitive: any,
    personas: any
  ): string {
    return `You are an assumption challenger. Your job is to identify and question ALL assumptions (implicit and explicit) in this product plan.

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
${personas?.personas?.map((p: any) => `- ${p.name}: ${p.quote}`).join('\n') || 'N/A'}

Extract and challenge assumptions in JSON format:

{
  "challengedAssumptions": [
    {
      "id": "A1",
      "assumption": "<The implicit or explicit assumption>",
      "category": "market|user|technical|business|competitive",
      "validity": "likely-false|questionable|needs-validation|likely-true",
      "evidence": {
        "supporting": ["<Evidence that supports this assumption>"],
        "contradicting": ["<Evidence that contradicts this assumption>"]
      },
      "validationMethod": "<How to test if this is true>",
      "consequenceIfWrong": "<What happens if we're wrong>",
      "alternativeHypothesis": "<Alternative belief to consider>"
    }
  ],
  "assumptionHealthScore": <0-100, higher means assumptions are well-founded>,
  "blindSpots": [
    "<Thing likely not considered>",
    "<Overlooked factor>"
  ],
  "recommendedActions": [
    "<Action to validate critical assumptions>",
    "<Research needed>"
  ]
}

**Find Assumptions Like:**
- "Users will pay for this" → Validate willingness to pay
- "Market is $XB" → Validate TAM/SAM estimates
- "Tech stack can scale" → Validate performance at scale
- "We can build in X days" → Validate timeline estimates
- "Competitors won't respond" → Validate competitive dynamics

Guidelines:
- Identify 8-15 assumptions across all categories
- Question EVERYTHING - even "obvious" things
- Provide specific validation methods (surveys, prototypes, research)
- Mark "likely-false" if strong contradicting evidence
- Mark "questionable" if validity is uncertain
- Mark "needs-validation" if testable but unproven
- Mark "likely-true" if strong supporting evidence
- Be critical but fair

Respond ONLY with JSON.`;
  }

  private parseAnalysis(analysisText: string): AssumptionAnalysis {
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const assumptions: ChallengedAssumption[] = Array.isArray(parsed.challengedAssumptions)
        ? parsed.challengedAssumptions.slice(0, 15).map((a: any, index: number) => ({
            id: a.id || `A${index + 1}`,
            assumption: a.assumption || 'Assumption identified',
            category: this.normalizeCategory(a.category),
            validity: this.normalizeValidity(a.validity),
            evidence: {
              supporting: Array.isArray(a.evidence?.supporting)
                ? a.evidence.supporting.slice(0, 3)
                : [],
              contradicting: Array.isArray(a.evidence?.contradicting)
                ? a.evidence.contradicting.slice(0, 3)
                : [],
            },
            validationMethod: a.validationMethod || 'Validation method needed',
            consequenceIfWrong: a.consequenceIfWrong || 'Impact not specified',
            alternativeHypothesis: a.alternativeHypothesis || 'Alternative not provided',
          }))
        : [];

      // Identify critical assumptions (likely-false or questionable)
      const criticalAssumptions = assumptions
        .filter(a => a.validity === 'likely-false' || a.validity === 'questionable')
        .slice(0, 5);

      // Calculate health score
      const validityScores = {
        'likely-true': 100,
        'needs-validation': 60,
        'questionable': 30,
        'likely-false': 0,
      };
      const avgScore = assumptions.length > 0
        ? assumptions.reduce((sum, a) => sum + validityScores[a.validity], 0) / assumptions.length
        : 60;

      // Create validation plan
      const validationPlan = this.createValidationPlan(criticalAssumptions);

      return {
        challengedAssumptions: assumptions,
        criticalAssumptions,
        assumptionHealthScore: Math.round(avgScore),
        validationPlan,
        blindSpots: Array.isArray(parsed.blindSpots) ? parsed.blindSpots.slice(0, 5) : [],
        recommendedActions: Array.isArray(parsed.recommendedActions)
          ? parsed.recommendedActions.slice(0, 5)
          : [],
      };
    } catch (error) {
      console.warn('[AssumptionChallengerAgent] Failed to parse:', error);
      throw error;
    }
  }

  private normalizeCategory(cat: string): ChallengedAssumption['category'] {
    const normalized = cat?.toLowerCase();
    if (normalized === 'market') return 'market';
    if (normalized === 'user') return 'user';
    if (normalized === 'technical') return 'technical';
    if (normalized === 'business') return 'business';
    if (normalized === 'competitive') return 'competitive';
    return 'market';
  }

  private normalizeValidity(val: string): ChallengedAssumption['validity'] {
    const normalized = val?.toLowerCase();
    if (normalized?.includes('false')) return 'likely-false';
    if (normalized?.includes('question')) return 'questionable';
    if (normalized?.includes('true')) return 'likely-true';
    return 'needs-validation';
  }

  private createValidationPlan(critical: ChallengedAssumption[]): AssumptionAnalysis['validationPlan'] {
    const plan: AssumptionAnalysis['validationPlan'] = [];

    if (critical.length === 0) return plan;

    // Group by validation method similarity
    const highPriority = critical.slice(0, 3);
    if (highPriority.length > 0) {
      plan.push({
        priority: 'high',
        method: 'Customer interviews and surveys',
        estimatedCost: '$500-1000',
        estimatedTime: '1-2 weeks',
        assumptions: highPriority.map(a => a.id),
      });
    }

    const mediumPriority = critical.slice(3, 5);
    if (mediumPriority.length > 0) {
      plan.push({
        priority: 'medium',
        method: 'Market research and competitive analysis',
        estimatedCost: '$200-500',
        estimatedTime: '1 week',
        assumptions: mediumPriority.map(a => a.id),
      });
    }

    return plan;
  }

  private fallbackAnalysis(): ReasoningResult {
    const analysis: AssumptionAnalysis = {
      challengedAssumptions: [
        {
          id: 'A1',
          assumption: 'Users will pay the proposed price',
          category: 'business',
          validity: 'needs-validation',
          evidence: {
            supporting: ['Similar products charge similar prices'],
            contradicting: ['No direct price validation with target users'],
          },
          validationMethod: 'Pricing surveys and willingness-to-pay studies',
          consequenceIfWrong: 'Revenue projections fail, need to adjust pricing',
          alternativeHypothesis: 'Users may need freemium model first',
        },
        {
          id: 'A2',
          assumption: 'Target market size is accurate',
          category: 'market',
          validity: 'questionable',
          evidence: {
            supporting: ['Industry reports suggest large market'],
            contradicting: ['TAM/SAM/SOM not validated with research'],
          },
          validationMethod: 'Bottom-up market sizing with customer interviews',
          consequenceIfWrong: 'Addressable market smaller than expected',
          alternativeHypothesis: 'Niche market may be more realistic starting point',
        },
      ],
      criticalAssumptions: [],
      assumptionHealthScore: 55,
      validationPlan: [
        {
          priority: 'high',
          method: 'Customer discovery interviews',
          estimatedCost: '$500',
          estimatedTime: '2 weeks',
          assumptions: ['A1', 'A2'],
        },
      ],
      blindSpots: [
        'Regulatory changes in target market',
        'Seasonal demand variations',
      ],
      recommendedActions: [
        'Conduct 20+ customer interviews',
        'Build landing page for demand validation',
      ],
    };

    analysis.criticalAssumptions = analysis.challengedAssumptions.slice(0, 5);

    return {
      reasoning: 'Fallback assumption analysis (LLM unavailable)',
      confidence: 0.5,
      intermediate: { analysis },
    };
  }
}
