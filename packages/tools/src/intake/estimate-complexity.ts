import { z } from 'zod';
import { ChatAnthropic } from '@langchain/anthropic';
import { BaseTool, ToolContext, ToolMetadata } from '../base/tool-base';

/**
 * Input schema for estimateComplexity tool
 */
const EstimateComplexityInputSchema = z.object({
  ideaText: z.string().min(50).describe('Idea description to analyze'),
  title: z.string().optional().describe('Idea title (if available)'),
  targetUsers: z.array(z.string()).optional().describe('Target user groups'),
});

type EstimateComplexityInput = z.infer<typeof EstimateComplexityInputSchema>;

/**
 * Complexity indicators from analysis
 */
const ComplexityIndicatorsSchema = z.object({
  featureCount: z.number().describe('Estimated number of features'),
  integrationCount: z.number().describe('Estimated number of third-party integrations'),
  dataVolume: z.enum(['low', 'medium', 'high']).describe('Estimated data volume'),
  userScale: z.enum(['low', 'medium', 'high']).describe('Estimated user scale'),
  technicalComplexity: z.enum(['low', 'medium', 'high']).describe('Technical complexity level'),
});

type ComplexityIndicators = z.infer<typeof ComplexityIndicatorsSchema>;

/**
 * Output schema for estimateComplexity tool
 */
const EstimateComplexityOutputSchema = z.object({
  complexity: z.enum(['low', 'medium', 'high']).describe('Overall complexity assessment'),
  confidence: z.number().min(0).max(1).describe('Confidence score of assessment'),
  indicators: ComplexityIndicatorsSchema,
  reasoning: z.string().describe('Explanation of complexity assessment'),
  recommendedBudget: z.number().describe('Recommended budget in USD'),
  recommendedTimeline: z.number().describe('Recommended timeline in days'),
});

type EstimateComplexityOutput = z.infer<typeof EstimateComplexityOutputSchema>;

/**
 * Complexity estimation heuristics
 */
const COMPLEXITY_HEURISTICS = {
  low: {
    featureCount: { min: 0, max: 10 },
    integrationCount: { min: 0, max: 2 },
    budget: 200,
    timeline: 7,
  },
  medium: {
    featureCount: { min: 10, max: 30 },
    integrationCount: { min: 2, max: 5 },
    budget: 500,
    timeline: 14,
  },
  high: {
    featureCount: { min: 30, max: 100 },
    integrationCount: { min: 5, max: 20 },
    budget: 2000,
    timeline: 30,
  },
};

/**
 * EstimateComplexity Tool
 *
 * Analyzes idea text to estimate project complexity using Claude Sonnet.
 * Considers feature count, integrations, data volume, user scale, and technical complexity.
 *
 * @category analysis
 * @cost $0.05
 * @avgDuration 2000ms
 */
export class EstimateComplexityTool extends BaseTool<
  EstimateComplexityInput,
  EstimateComplexityOutput
> {
  private llm: ChatAnthropic;

  constructor(config?: { anthropicApiKey?: string }) {
    const metadata: ToolMetadata = {
      id: 'estimate-complexity',
      name: 'estimateComplexity',
      description:
        'Analyze idea text to estimate project complexity. Returns complexity level (low/medium/high), confidence score, indicators, and recommended budget/timeline.',
      version: '1.0.0',
      category: 'analysis',
      costEstimate: 0.05,
      avgDurationMs: 2000,
      requiresApproval: false,
      resourceLimits: {
        maxDurationMs: 10000, // 10 seconds max
      },
    };

    super(metadata, EstimateComplexityInputSchema, EstimateComplexityOutputSchema);

    // Initialize Claude LLM
    this.llm = new ChatAnthropic({
      modelName: 'claude-3-7-sonnet-20250219',
      temperature: 0.3,
      maxTokens: 2000,
      anthropicApiKey: config?.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Execute complexity estimation
   */
  protected async executeImpl(
    input: EstimateComplexityInput,
    context: ToolContext
  ): Promise<EstimateComplexityOutput> {
    // Construct analysis prompt
    const prompt = this.constructPrompt(input);

    try {
      // Call Claude for analysis
      const response = await this.llm.invoke(prompt);
      const analysisText = response.content.toString();

      // Parse structured output from Claude
      const analysis = this.parseAnalysis(analysisText);

      // Determine overall complexity
      const complexity = this.determineComplexity(analysis.indicators);

      // Calculate recommendations
      const { recommendedBudget, recommendedTimeline } = this.calculateRecommendations(
        complexity,
        analysis.indicators
      );

      return {
        complexity,
        confidence: analysis.confidence,
        indicators: analysis.indicators,
        reasoning: analysis.reasoning,
        recommendedBudget,
        recommendedTimeline,
      };
    } catch (error) {
      // Fallback to heuristic-based estimation if LLM fails
      console.warn('[EstimateComplexity] LLM failed, using heuristic fallback:', error);
      return this.heuristicEstimation(input);
    }
  }

  /**
   * Construct analysis prompt for Claude
   */
  private constructPrompt(input: EstimateComplexityInput): string {
    const titlePart = input.title ? `Title: ${input.title}\n` : '';
    const targetUsersPart = input.targetUsers
      ? `Target Users: ${input.targetUsers.join(', ')}\n`
      : '';

    return `You are a technical project analyst. Analyze the following software idea and estimate its complexity.

${titlePart}${targetUsersPart}Idea Description:
${input.ideaText}

Provide a structured analysis in the following JSON format:
{
  "featureCount": <estimated number of features, 1-100>,
  "integrationCount": <estimated number of third-party integrations, 0-20>,
  "dataVolume": "<low|medium|high>",
  "userScale": "<low|medium|high>",
  "technicalComplexity": "<low|medium|high>",
  "confidence": <confidence score 0.0-1.0>,
  "reasoning": "<brief explanation of complexity assessment>"
}

Guidelines:
- Feature Count: Count distinct user-facing features mentioned or implied
- Integration Count: Third-party APIs, services, or platforms needed
- Data Volume:
  - Low: Simple records, <10K entries
  - Medium: Moderate data, 10K-1M entries
  - High: Big data, >1M entries, real-time processing
- User Scale:
  - Low: <1,000 users
  - Medium: 1,000-100,000 users
  - High: >100,000 users
- Technical Complexity:
  - Low: CRUD operations, basic business logic
  - Medium: Complex workflows, integrations, real-time features
  - High: ML/AI, blockchain, complex algorithms, distributed systems

Respond ONLY with the JSON object, no additional text.`;
  }

  /**
   * Parse analysis from Claude response
   */
  private parseAnalysis(analysisText: string): {
    indicators: ComplexityIndicators;
    confidence: number;
    reasoning: string;
  } {
    try {
      // Extract JSON from response (Claude sometimes adds markdown formatting)
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize
      const indicators: ComplexityIndicators = {
        featureCount: Math.max(1, Math.min(100, parsed.featureCount || 10)),
        integrationCount: Math.max(0, Math.min(20, parsed.integrationCount || 2)),
        dataVolume: this.normalizeLevel(parsed.dataVolume),
        userScale: this.normalizeLevel(parsed.userScale),
        technicalComplexity: this.normalizeLevel(parsed.technicalComplexity),
      };

      const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.7));
      const reasoning = parsed.reasoning || 'Analysis completed';

      return { indicators, confidence, reasoning };
    } catch (error) {
      console.warn('[EstimateComplexity] Failed to parse analysis, using defaults:', error);

      // Fallback defaults
      return {
        indicators: {
          featureCount: 10,
          integrationCount: 2,
          dataVolume: 'medium',
          userScale: 'medium',
          technicalComplexity: 'medium',
        },
        confidence: 0.5,
        reasoning: 'Unable to parse detailed analysis, using default estimates',
      };
    }
  }

  /**
   * Normalize complexity level to enum
   */
  private normalizeLevel(level: string): 'low' | 'medium' | 'high' {
    const normalized = level?.toLowerCase();
    if (normalized === 'low') return 'low';
    if (normalized === 'high') return 'high';
    return 'medium';
  }

  /**
   * Determine overall complexity from indicators
   */
  private determineComplexity(
    indicators: ComplexityIndicators
  ): 'low' | 'medium' | 'high' {
    // Score each indicator (0-2)
    const scores = {
      featureCount: this.scoreFeatureCount(indicators.featureCount),
      integrationCount: this.scoreIntegrationCount(indicators.integrationCount),
      dataVolume: this.scoreLevelIndicator(indicators.dataVolume),
      userScale: this.scoreLevelIndicator(indicators.userScale),
      technicalComplexity: this.scoreLevelIndicator(indicators.technicalComplexity),
    };

    // Calculate average score
    const avgScore =
      (scores.featureCount +
        scores.integrationCount +
        scores.dataVolume +
        scores.userScale +
        scores.technicalComplexity) /
      5;

    // Map to complexity level
    if (avgScore < 0.7) return 'low';
    if (avgScore < 1.5) return 'medium';
    return 'high';
  }

  /**
   * Score feature count (0-2)
   */
  private scoreFeatureCount(count: number): number {
    if (count <= 10) return 0;
    if (count <= 30) return 1;
    return 2;
  }

  /**
   * Score integration count (0-2)
   */
  private scoreIntegrationCount(count: number): number {
    if (count <= 2) return 0;
    if (count <= 5) return 1;
    return 2;
  }

  /**
   * Score level indicator (0-2)
   */
  private scoreLevelIndicator(level: 'low' | 'medium' | 'high'): number {
    if (level === 'low') return 0;
    if (level === 'medium') return 1;
    return 2;
  }

  /**
   * Calculate budget and timeline recommendations
   */
  private calculateRecommendations(
    complexity: 'low' | 'medium' | 'high',
    indicators: ComplexityIndicators
  ): { recommendedBudget: number; recommendedTimeline: number } {
    const base = COMPLEXITY_HEURISTICS[complexity];

    // Apply multipliers based on specific indicators
    let budgetMultiplier = 1.0;
    let timelineMultiplier = 1.0;

    // High data volume increases costs
    if (indicators.dataVolume === 'high') {
      budgetMultiplier *= 1.5;
      timelineMultiplier *= 1.3;
    }

    // High user scale increases costs
    if (indicators.userScale === 'high') {
      budgetMultiplier *= 1.4;
      timelineMultiplier *= 1.2;
    }

    // High technical complexity significantly increases both
    if (indicators.technicalComplexity === 'high') {
      budgetMultiplier *= 1.8;
      timelineMultiplier *= 1.5;
    }

    // Many integrations increase timeline more than budget
    if (indicators.integrationCount > 5) {
      budgetMultiplier *= 1.2;
      timelineMultiplier *= 1.4;
    }

    const recommendedBudget = Math.round(base.budget * budgetMultiplier);
    const recommendedTimeline = Math.round(base.timeline * timelineMultiplier);

    return {
      recommendedBudget: Math.min(10000, Math.max(100, recommendedBudget)),
      recommendedTimeline: Math.min(90, Math.max(3, recommendedTimeline)),
    };
  }

  /**
   * Heuristic-based estimation (fallback when LLM unavailable)
   */
  private heuristicEstimation(input: EstimateComplexityInput): EstimateComplexityOutput {
    const text = input.ideaText.toLowerCase();

    // Simple keyword-based heuristics
    let complexity: 'low' | 'medium' | 'high' = 'medium';
    let featureCount = 10;
    let integrationCount = 2;

    // High complexity keywords
    const highComplexityKeywords = [
      'machine learning',
      'ml',
      'ai',
      'blockchain',
      'real-time',
      'distributed',
      'scalable',
      'big data',
      'analytics',
      'recommendation',
      'search engine',
    ];

    // Low complexity keywords
    const lowComplexityKeywords = ['simple', 'basic', 'crud', 'form', 'landing page'];

    const hasHighKeywords = highComplexityKeywords.some((kw) => text.includes(kw));
    const hasLowKeywords = lowComplexityKeywords.some((kw) => text.includes(kw));

    if (hasHighKeywords) {
      complexity = 'high';
      featureCount = 40;
      integrationCount = 6;
    } else if (hasLowKeywords) {
      complexity = 'low';
      featureCount = 5;
      integrationCount = 1;
    }

    // Estimate integrations by counting "api", "integration", "connect"
    const integrationKeywords = ['api', 'integration', 'connect', 'sync', 'import'];
    const integrationMentions = integrationKeywords.filter((kw) => text.includes(kw)).length;
    integrationCount = Math.max(integrationCount, integrationMentions);

    const indicators: ComplexityIndicators = {
      featureCount,
      integrationCount,
      dataVolume: complexity === 'high' ? 'high' : complexity === 'low' ? 'low' : 'medium',
      userScale: complexity === 'high' ? 'high' : complexity === 'low' ? 'low' : 'medium',
      technicalComplexity: complexity,
    };

    const { recommendedBudget, recommendedTimeline } = this.calculateRecommendations(
      complexity,
      indicators
    );

    return {
      complexity,
      confidence: 0.6, // Lower confidence for heuristic estimation
      indicators,
      reasoning: 'Heuristic-based estimation (LLM unavailable). Based on keyword analysis.',
      recommendedBudget,
      recommendedTimeline,
    };
  }
}
