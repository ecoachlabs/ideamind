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
 * Red team finding
 */
interface RedTeamFinding {
  id: string;
  category: 'strategy' | 'market' | 'technical' | 'ux' | 'business-model';
  severity: 'critical' | 'high' | 'medium' | 'low';
  finding: string;
  impact: string;
  likelihood: 'very-likely' | 'likely' | 'possible' | 'unlikely';
  recommendation: string;
}

/**
 * Red team analysis output
 */
interface RedTeamAnalysis {
  findings: RedTeamFinding[];
  overallAssessment: {
    viabilityScore: number; // 0-100
    strengthScore: number; // 0-100
    readinessScore: number; // 0-100
    recommendation: 'proceed' | 'proceed-with-caution' | 'major-revisions-needed' | 'stop';
    reasoning: string;
  };
  competitiveThreatLevel: 'low' | 'medium' | 'high' | 'critical';
  marketFitConcerns: string[];
  alternativeApproaches: string[];
}

/**
 * RedTeamAgent
 *
 * Takes an adversarial perspective to identify weaknesses, flaws, and risks
 * in the product strategy and ideation. Acts as a critical reviewer to
 * challenge assumptions and find blind spots.
 *
 * Analyzes:
 * - Strategic weaknesses
 * - Market positioning flaws
 * - Technical feasibility concerns
 * - UX/product gaps
 * - Business model vulnerabilities
 *
 * Part of the CRITIQUE phase (runs in parallel with risk analyzer and assumption challenger).
 */
export class RedTeamAgent extends BaseAgent {
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
          stepId: 'analyze-strategy',
          description: 'Critically analyze product strategy for weaknesses',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
        {
          stepId: 'challenge-market-fit',
          description: 'Challenge market positioning and competitive analysis',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
        {
          stepId: 'identify-technical-risks',
          description: 'Identify technical feasibility concerns',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
        {
          stepId: 'assess-overall',
          description: 'Provide overall assessment and recommendation',
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
    const ideaSpec = this.extractData(input, 'ideaSpec');
    const strategy = this.extractData(input, 'strategy');
    const competitive = this.extractData(input, 'competitive');
    const techStack = this.extractData(input, 'techStack');
    const personas = this.extractData(input, 'personas');

    const prompt = this.buildRedTeamPrompt(ideaSpec, strategy, competitive, techStack, personas);

    try {
      const response = await this.llm.invoke(prompt);
      const analysisText = response.content.toString();

      const analysis = this.parseAnalysis(analysisText);

      return {
        reasoning: `Red team analysis identified ${analysis.findings.length} findings (${analysis.findings.filter(f => f.severity === 'critical' || f.severity === 'high').length} high/critical)`,
        confidence: 0.88,
        intermediate: {
          analysis,
        },
      };
    } catch (error) {
      console.warn('[RedTeamAgent] LLM failed, using fallback:', error);
      return this.fallbackAnalysis();
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const analysis: RedTeamAnalysis = result.intermediate.analysis;

    return [
      {
        type: 'redteam-analysis',
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

  private buildRedTeamPrompt(
    ideaSpec: any,
    strategy: any,
    competitive: any,
    techStack: any,
    personas: any
  ): string {
    return `You are a critical red team analyst. Your job is to find weaknesses, flaws, and risks in this product plan. Be adversarial and skeptical.

**Product Overview:**
Title: ${ideaSpec?.title || 'N/A'}
Description: ${ideaSpec?.description || 'N/A'}
Category: ${ideaSpec?.metadata?.category || 'N/A'}
Complexity: ${ideaSpec?.metadata?.complexity || 'N/A'}

**Strategy:**
Vision: ${strategy?.vision || 'N/A'}
Differentiators: ${strategy?.differentiators?.join(', ') || 'N/A'}

**Market:**
TAM: ${competitive?.marketSize?.tam || 'N/A'}
Competitors: ${competitive?.competitors?.map((c: any) => c.name).join(', ') || 'N/A'}

**Tech Stack:**
Frontend: ${techStack?.frontend?.framework || 'N/A'}
Backend: ${techStack?.backend?.framework || 'N/A'}

Provide critical analysis in JSON format:

{
  "findings": [
    {
      "id": "F1",
      "category": "strategy|market|technical|ux|business-model",
      "severity": "critical|high|medium|low",
      "finding": "<What's wrong or risky>",
      "impact": "<What happens if this isn't addressed>",
      "likelihood": "very-likely|likely|possible|unlikely",
      "recommendation": "<How to fix or mitigate>"
    }
  ],
  "overallAssessment": {
    "viabilityScore": <0-100>,
    "strengthScore": <0-100>,
    "readinessScore": <0-100>,
    "recommendation": "proceed|proceed-with-caution|major-revisions-needed|stop",
    "reasoning": "<Overall assessment>"
  },
  "competitiveThreatLevel": "low|medium|high|critical",
  "marketFitConcerns": [
    "<Concern about product-market fit>",
    "<Concern about target market>"
  ],
  "alternativeApproaches": [
    "<Alternative strategy to consider>",
    "<Different approach that might work better>"
  ]
}

Guidelines:
- Be CRITICAL and SKEPTICAL
- Find 5-15 findings across all categories
- Identify real risks and weaknesses
- Don't be afraid to recommend "stop" if truly flawed
- Suggest concrete alternatives
- Critical/High severity: Must be addressed before proceeding
- Medium severity: Should be addressed during development
- Low severity: Nice to fix but not blocking

Respond ONLY with JSON.`;
  }

  private parseAnalysis(analysisText: string): RedTeamAnalysis {
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        findings: Array.isArray(parsed.findings)
          ? parsed.findings.slice(0, 15).map((f: any, index: number) => ({
              id: f.id || `F${index + 1}`,
              category: this.normalizeCategory(f.category),
              severity: this.normalizeSeverity(f.severity),
              finding: f.finding || 'Issue identified',
              impact: f.impact || 'Impact not specified',
              likelihood: this.normalizeLikelihood(f.likelihood),
              recommendation: f.recommendation || 'Recommendation needed',
            }))
          : [],
        overallAssessment: {
          viabilityScore: Math.max(0, Math.min(100, parsed.overallAssessment?.viabilityScore || 60)),
          strengthScore: Math.max(0, Math.min(100, parsed.overallAssessment?.strengthScore || 60)),
          readinessScore: Math.max(0, Math.min(100, parsed.overallAssessment?.readinessScore || 50)),
          recommendation: this.normalizeRecommendation(parsed.overallAssessment?.recommendation),
          reasoning: parsed.overallAssessment?.reasoning || 'Assessment provided',
        },
        competitiveThreatLevel: this.normalizeThreatLevel(parsed.competitiveThreatLevel),
        marketFitConcerns: Array.isArray(parsed.marketFitConcerns)
          ? parsed.marketFitConcerns.slice(0, 5)
          : [],
        alternativeApproaches: Array.isArray(parsed.alternativeApproaches)
          ? parsed.alternativeApproaches.slice(0, 3)
          : [],
      };
    } catch (error) {
      console.warn('[RedTeamAgent] Failed to parse:', error);
      throw error;
    }
  }

  private normalizeCategory(cat: string): 'strategy' | 'market' | 'technical' | 'ux' | 'business-model' {
    const normalized = cat?.toLowerCase();
    if (normalized === 'strategy') return 'strategy';
    if (normalized === 'market') return 'market';
    if (normalized === 'technical') return 'technical';
    if (normalized === 'ux') return 'ux';
    if (normalized === 'business-model') return 'business-model';
    return 'strategy';
  }

  private normalizeSeverity(sev: string): 'critical' | 'high' | 'medium' | 'low' {
    const normalized = sev?.toLowerCase();
    if (normalized === 'critical') return 'critical';
    if (normalized === 'high') return 'high';
    if (normalized === 'low') return 'low';
    return 'medium';
  }

  private normalizeLikelihood(like: string): 'very-likely' | 'likely' | 'possible' | 'unlikely' {
    const normalized = like?.toLowerCase();
    if (normalized?.includes('very')) return 'very-likely';
    if (normalized?.includes('likely')) return 'likely';
    if (normalized?.includes('unlikely')) return 'unlikely';
    return 'possible';
  }

  private normalizeRecommendation(rec: string): 'proceed' | 'proceed-with-caution' | 'major-revisions-needed' | 'stop' {
    const normalized = rec?.toLowerCase();
    if (normalized?.includes('stop')) return 'stop';
    if (normalized?.includes('major') || normalized?.includes('revision')) return 'major-revisions-needed';
    if (normalized?.includes('caution')) return 'proceed-with-caution';
    return 'proceed';
  }

  private normalizeThreatLevel(level: string): 'low' | 'medium' | 'high' | 'critical' {
    const normalized = level?.toLowerCase();
    if (normalized === 'critical') return 'critical';
    if (normalized === 'high') return 'high';
    if (normalized === 'low') return 'low';
    return 'medium';
  }

  private fallbackAnalysis(): ReasoningResult {
    const analysis: RedTeamAnalysis = {
      findings: [
        {
          id: 'F1',
          category: 'market',
          severity: 'medium',
          finding: 'Market validation needed',
          impact: 'May target wrong customer segment',
          likelihood: 'possible',
          recommendation: 'Conduct customer interviews',
        },
        {
          id: 'F2',
          category: 'technical',
          severity: 'medium',
          finding: 'Technical complexity may exceed estimate',
          impact: 'Timeline and budget overruns',
          likelihood: 'likely',
          recommendation: 'Build prototype to validate feasibility',
        },
      ],
      overallAssessment: {
        viabilityScore: 65,
        strengthScore: 60,
        readinessScore: 55,
        recommendation: 'proceed-with-caution',
        reasoning: 'Concept has merit but requires validation and risk mitigation',
      },
      competitiveThreatLevel: 'medium',
      marketFitConcerns: [
        'Target market size unclear',
        'Value proposition needs refinement',
      ],
      alternativeApproaches: [
        'Start with MVP focused on single use case',
        'Partner with established player for distribution',
      ],
    };

    return {
      reasoning: 'Fallback red team analysis (LLM unavailable)',
      confidence: 0.5,
      intermediate: { analysis },
    };
  }
}
