import { ChatAnthropic } from '@langchain/anthropic';
import {
  BaseAgent,
  AgentInput,
  AgentOutput,
  ExecutionPlan,
  ReasoningResult,
  AgentConfig,
} from '@ideamine/agent-sdk';
import { EstimateComplexityTool } from '@ideamine/tools';
import { SearchSimilarIdeasTool } from '@ideamine/tools';

/**
 * Classification output metadata
 */
interface ClassificationMetadata {
  category: 'technical' | 'business' | 'creative' | 'hybrid';
  subcategories: string[];
  complexity: 'low' | 'medium' | 'high';
  estimatedAgents: string[];
  confidence: number;
  reasoning: string;
  complexityIndicators?: {
    featureCount: number;
    integrationCount: number;
    dataVolume: 'low' | 'medium' | 'high';
    userScale: 'low' | 'medium' | 'high';
    technicalComplexity: 'low' | 'medium' | 'high';
  };
  similarProjectsFound?: number;
}

/**
 * IntakeClassifierAgent
 *
 * First agent in the intake phase. Responsible for:
 * 1. Categorizing the idea (technical/business/creative/hybrid)
 * 2. Estimating project complexity
 * 3. Identifying which downstream agents will be needed
 * 4. Searching for similar past projects
 *
 * Extends BaseAgent with Analyzer-inside-Agent pattern.
 */
export class IntakeClassifierAgent extends BaseAgent {
  private llm: ChatAnthropic;
  private estimateComplexityTool: EstimateComplexityTool;
  private searchSimilarTool: SearchSimilarIdeasTool;

  constructor(config: AgentConfig) {
    super(config);

    // Initialize Claude LLM from config
    this.llm = new ChatAnthropic({
      modelName: config.llm.model,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
      topP: config.llm.topP,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Initialize tools
    this.estimateComplexityTool = new EstimateComplexityTool();
    this.searchSimilarTool = new SearchSimilarIdeasTool();

    // Register tools with the agent
    this.registerTool(this.estimateComplexityTool);
    this.registerTool(this.searchSimilarTool);
  }

  /**
   * STEP 1: PLANNER
   * Create execution plan for classification
   */
  protected async plan(input: AgentInput): Promise<ExecutionPlan> {
    const ideaText = this.extractIdeaText(input);

    return {
      agentId: this.config.id,
      steps: [
        {
          stepId: 'classify-category',
          description: 'Classify idea into category (technical/business/creative/hybrid)',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
        {
          stepId: 'estimate-complexity',
          description: 'Estimate project complexity using estimate-complexity tool',
          estimatedDurationMs: 2000,
          requiredTools: ['estimate-complexity'],
        },
        {
          stepId: 'search-similar',
          description: 'Search for similar past projects (optional)',
          estimatedDurationMs: 1500,
          requiredTools: ['search-similar-ideas'],
        },
        {
          stepId: 'identify-agents',
          description: 'Identify which downstream agents will be needed',
          estimatedDurationMs: 1000,
          requiredTools: [],
        },
      ],
      estimatedTotalDurationMs: 7500,
      confidence: 0.9,
    };
  }

  /**
   * STEP 2: REASONING
   * Perform initial classification using Claude
   */
  protected async reason(
    plan: ExecutionPlan,
    input: AgentInput
  ): Promise<ReasoningResult> {
    const ideaText = this.extractIdeaText(input);
    const title = this.extractTitle(input);

    // Construct classification prompt
    const prompt = this.buildClassificationPrompt(ideaText, title);

    try {
      // Call Claude for initial classification
      const response = await this.llm.invoke(prompt);
      const analysisText = response.content.toString();

      // Parse classification result
      const classification = this.parseClassification(analysisText);

      return {
        reasoning: classification.reasoning,
        confidence: classification.confidence,
        intermediate: {
          category: classification.category,
          subcategories: classification.subcategories,
          needsComplexityEstimation: classification.confidence < 0.8,
          needsSimilaritySearch: classification.confidence < 0.7,
        },
      };
    } catch (error) {
      // Fallback to heuristic classification
      console.warn('[IntakeClassifierAgent] LLM failed, using heuristic fallback:', error);
      return this.heuristicClassification(ideaText);
    }
  }

  /**
   * STEP 3: Generate classification artifacts
   */
  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const metadata: ClassificationMetadata = {
      category: result.intermediate.category,
      subcategories: result.intermediate.subcategories,
      complexity: result.intermediate.complexity || 'medium',
      estimatedAgents: this.determineRequiredAgents(result.intermediate.category),
      confidence: result.confidence,
      reasoning: result.reasoning,
    };

    // Add complexity indicators if available from tool execution
    if (result.intermediate.complexityIndicators) {
      metadata.complexityIndicators = result.intermediate.complexityIndicators;
    }

    // Add similar projects count if available
    if (result.intermediate.similarProjectsFound !== undefined) {
      metadata.similarProjectsFound = result.intermediate.similarProjectsFound;
    }

    return [
      {
        type: 'intake-classification',
        version: '1.0.0',
        content: metadata,
        generatedAt: new Date().toISOString(),
        agentId: this.config.id,
      },
    ];
  }

  /**
   * Extract idea text from input
   */
  private extractIdeaText(input: AgentInput): string {
    if (typeof input.data === 'string') {
      return input.data;
    }
    if (input.data && typeof input.data === 'object') {
      return (input.data as any).ideaText || (input.data as any).description || '';
    }
    return '';
  }

  /**
   * Extract title from input (if available)
   */
  private extractTitle(input: AgentInput): string | undefined {
    if (input.data && typeof input.data === 'object') {
      return (input.data as any).title;
    }
    return undefined;
  }

  /**
   * Build classification prompt for Claude
   */
  private buildClassificationPrompt(ideaText: string, title?: string): string {
    const titlePart = title ? `Title: ${title}\n` : '';

    return `You are an expert software project analyst. Classify the following software idea into one or more categories.

${titlePart}Idea Description:
${ideaText}

Analyze this idea and classify it into PRIMARY and SECONDARY categories:

**Categories:**
- **technical**: Software tools, APIs, developer platforms, infrastructure, algorithms
- **business**: SaaS products, marketplaces, CRM, analytics dashboards, e-commerce
- **creative**: Content creation tools, design platforms, media apps, social networks
- **hybrid**: Ideas spanning multiple categories

**Subcategories** (choose relevant ones):
Technical: web-app, mobile-app, api, cli-tool, library, infrastructure, data-pipeline, ml-model
Business: b2b-saas, b2c-saas, marketplace, crm, analytics, fintech, edtech, healthtech
Creative: content-creation, social-media, gaming, media-streaming, design-tool

Provide your analysis in the following JSON format:
{
  "category": "<primary category: technical|business|creative|hybrid>",
  "subcategories": ["<subcategory1>", "<subcategory2>"],
  "confidence": <confidence score 0.0-1.0>,
  "reasoning": "<brief explanation of classification>"
}

Guidelines:
- Choose "hybrid" if the idea significantly spans 2+ categories
- Confidence > 0.8 means clear classification
- Confidence 0.6-0.8 means mixed signals
- Confidence < 0.6 means unclear or ambiguous
- Be specific in reasoning (1-2 sentences)

Respond ONLY with the JSON object, no additional text.`;
  }

  /**
   * Parse classification from Claude response
   */
  private parseClassification(analysisText: string): {
    category: 'technical' | 'business' | 'creative' | 'hybrid';
    subcategories: string[];
    confidence: number;
    reasoning: string;
  } {
    try {
      // Extract JSON from response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize
      const category = this.normalizeCategory(parsed.category);
      const subcategories = Array.isArray(parsed.subcategories)
        ? parsed.subcategories.slice(0, 3)
        : [];
      const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.7));
      const reasoning = parsed.reasoning || 'Classification completed';

      return { category, subcategories, confidence, reasoning };
    } catch (error) {
      console.warn('[IntakeClassifierAgent] Failed to parse classification:', error);

      // Return defaults
      return {
        category: 'technical',
        subcategories: ['web-app'],
        confidence: 0.5,
        reasoning: 'Unable to parse detailed classification, using defaults',
      };
    }
  }

  /**
   * Normalize category to valid enum value
   */
  private normalizeCategory(
    category: string
  ): 'technical' | 'business' | 'creative' | 'hybrid' {
    const normalized = category?.toLowerCase();
    if (normalized === 'technical') return 'technical';
    if (normalized === 'business') return 'business';
    if (normalized === 'creative') return 'creative';
    if (normalized === 'hybrid') return 'hybrid';
    return 'technical'; // default
  }

  /**
   * Heuristic classification (fallback when LLM unavailable)
   */
  private heuristicClassification(ideaText: string): ReasoningResult {
    const text = ideaText.toLowerCase();

    // Keywords for each category
    const technicalKeywords = [
      'api',
      'sdk',
      'library',
      'framework',
      'cli',
      'infrastructure',
      'database',
      'algorithm',
    ];
    const businessKeywords = [
      'saas',
      'marketplace',
      'crm',
      'analytics',
      'dashboard',
      'subscription',
      'payment',
      'invoice',
    ];
    const creativeKeywords = [
      'content',
      'social',
      'media',
      'design',
      'video',
      'audio',
      'game',
      'creative',
    ];

    const technicalScore = technicalKeywords.filter((kw) => text.includes(kw)).length;
    const businessScore = businessKeywords.filter((kw) => text.includes(kw)).length;
    const creativeScore = creativeKeywords.filter((kw) => text.includes(kw)).length;

    let category: 'technical' | 'business' | 'creative' | 'hybrid' = 'technical';
    let subcategories: string[] = ['web-app'];

    const totalScore = technicalScore + businessScore + creativeScore;
    if (totalScore > 1) {
      category = 'hybrid';
      if (technicalScore > 0) subcategories.push('api');
      if (businessScore > 0) subcategories.push('b2b-saas');
      if (creativeScore > 0) subcategories.push('content-creation');
    } else if (businessScore > technicalScore && businessScore > creativeScore) {
      category = 'business';
      subcategories = ['b2b-saas'];
    } else if (creativeScore > technicalScore && creativeScore > businessScore) {
      category = 'creative';
      subcategories = ['content-creation'];
    }

    return {
      reasoning: 'Heuristic-based classification (LLM unavailable). Based on keyword analysis.',
      confidence: 0.6,
      intermediate: {
        category,
        subcategories: subcategories.slice(0, 3),
        needsComplexityEstimation: true,
        needsSimilaritySearch: false,
      },
    };
  }

  /**
   * Determine which downstream agents will be needed
   */
  private determineRequiredAgents(
    category: 'technical' | 'business' | 'creative' | 'hybrid'
  ): string[] {
    // All ideas go through: Expander -> Validator
    const baseAgents = ['intake-expander-agent', 'intake-validator-agent'];

    // Phase-specific agents based on category
    const phaseAgents: string[] = [];

    switch (category) {
      case 'technical':
        phaseAgents.push(
          'ideation-tech-agent',
          'architecture-design-agent',
          'build-scaffold-agent'
        );
        break;

      case 'business':
        phaseAgents.push(
          'ideation-biz-agent',
          'bizdev-market-agent',
          'prd-business-agent'
        );
        break;

      case 'creative':
        phaseAgents.push(
          'ideation-creative-agent',
          'aesthetic-design-agent',
          'prd-ux-agent'
        );
        break;

      case 'hybrid':
        // Hybrid gets agents from multiple tracks
        phaseAgents.push(
          'ideation-tech-agent',
          'ideation-biz-agent',
          'prd-hybrid-agent',
          'architecture-design-agent'
        );
        break;
    }

    return [...baseAgents, ...phaseAgents];
  }
}
