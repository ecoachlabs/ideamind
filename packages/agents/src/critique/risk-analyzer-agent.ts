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
 * Risk item
 */
interface Risk {
  id: string;
  category: 'technical' | 'business' | 'operational' | 'security' | 'compliance' | 'market';
  risk: string;
  probability: 'very-high' | 'high' | 'medium' | 'low' | 'very-low';
  impact: 'critical' | 'high' | 'medium' | 'low';
  riskScore: number; // probability × impact (0-100)
  mitigation: string;
  contingency: string;
  owner: string; // Who should manage this risk
}

/**
 * Risk analysis output
 */
interface RiskAnalysis {
  risks: Risk[];
  riskSummary: {
    totalRisks: number;
    criticalRisks: number;
    highRisks: number;
    mediumRisks: number;
    lowRisks: number;
    overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  topRisks: Risk[]; // Top 5 by risk score
  riskMitigationPlan: string;
  budgetImpact: {
    estimatedContingency: string;
    reasoning: string;
  };
  timelineImpact: {
    estimatedDelay: string;
    reasoning: string;
  };
}

/**
 * RiskAnalyzerAgent
 *
 * Systematically identifies and categorizes risks across all dimensions:
 * - Technical: Architecture, scalability, tech debt
 * - Business: Revenue, market, competition
 * - Operational: Team, process, dependencies
 * - Security: Data protection, vulnerabilities
 * - Compliance: Legal, regulatory, privacy
 * - Market: Timing, adoption, competitive response
 *
 * Provides probability × impact scoring and mitigation strategies.
 *
 * Part of the CRITIQUE phase (runs in parallel).
 */
export class RiskAnalyzerAgent extends BaseAgent {
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
          stepId: 'identify-technical-risks',
          description: 'Identify technical and architectural risks',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
        {
          stepId: 'identify-business-risks',
          description: 'Identify business and market risks',
          estimatedDurationMs: 2500,
          requiredTools: [],
        },
        {
          stepId: 'identify-operational-risks',
          description: 'Identify operational and security risks',
          estimatedDurationMs: 2500,
          requiredTools: [],
        },
        {
          stepId: 'score-and-prioritize',
          description: 'Score risks and create mitigation plan',
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

    const prompt = this.buildRiskPrompt(ideaSpec, strategy, competitive, techStack);

    try {
      const response = await this.llm.invoke(prompt);
      const analysisText = response.content.toString();

      const analysis = this.parseAnalysis(analysisText);

      return {
        reasoning: `Identified ${analysis.risks.length} risks (${analysis.riskSummary.criticalRisks} critical, ${analysis.riskSummary.highRisks} high)`,
        confidence: 0.87,
        intermediate: {
          analysis,
        },
      };
    } catch (error) {
      console.warn('[RiskAnalyzerAgent] LLM failed, using fallback:', error);
      return this.fallbackAnalysis();
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const analysis: RiskAnalysis = result.intermediate.analysis;

    return [
      {
        type: 'risk-analysis',
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

  private buildRiskPrompt(ideaSpec: any, strategy: any, competitive: any, techStack: any): string {
    return `You are a risk management analyst. Systematically identify ALL risks for this project across all dimensions.

**Project Details:**
Title: ${ideaSpec?.title || 'N/A'}
Complexity: ${ideaSpec?.metadata?.complexity || 'N/A'}
Budget: $${ideaSpec?.constraints?.budget?.max || 'N/A'}
Timeline: ${ideaSpec?.constraints?.timeline?.max || 'N/A'} days
Compliance: ${ideaSpec?.constraints?.complianceRequirements?.join(', ') || 'None'}

**Strategy:**
${JSON.stringify(strategy, null, 2)}

**Tech Stack:**
Frontend: ${techStack?.frontend?.framework || 'N/A'}
Backend: ${techStack?.backend?.framework || 'N/A'}
Database: ${techStack?.database?.primary || 'N/A'}

Identify risks in JSON format:

{
  "risks": [
    {
      "id": "R1",
      "category": "technical|business|operational|security|compliance|market",
      "risk": "<Clear description of the risk>",
      "probability": "very-high|high|medium|low|very-low",
      "impact": "critical|high|medium|low",
      "riskScore": <probability (1-5) × impact (1-4) × 5, range 5-100>,
      "mitigation": "<How to prevent or reduce this risk>",
      "contingency": "<What to do if it happens>",
      "owner": "<Who should manage this: founder|tech-lead|pm|legal|security>"
    }
  ],
  "riskMitigationPlan": "<Overall 2-3 sentence mitigation strategy>",
  "budgetImpact": {
    "estimatedContingency": "<Budget buffer needed, e.g., +20%>",
    "reasoning": "<Why this contingency>"
  },
  "timelineImpact": {
    "estimatedDelay": "<Potential delay, e.g., +2 weeks>",
    "reasoning": "<Why delays might occur>"
  }
}

**Risk Scoring:**
Probability: very-high=5, high=4, medium=3, low=2, very-low=1
Impact: critical=4, high=3, medium=2, low=1
RiskScore = probability × impact × 5 (range: 5-100)

**Categories to Cover:**
- Technical: Architecture flaws, tech debt, scalability, dependencies
- Business: Revenue model, market timing, competition, funding
- Operational: Team skills, process, vendors, third-party dependencies
- Security: Data breaches, vulnerabilities, auth/authz issues
- Compliance: GDPR, SOC2, HIPAA, industry regulations
- Market: Adoption risk, competitive response, timing

Guidelines:
- Identify 10-20 risks across ALL categories
- Be specific and realistic
- Focus on PREVENTABLE risks (not generic "what ifs")
- Provide actionable mitigations
- Critical/High impact risks MUST have solid mitigations

Respond ONLY with JSON.`;
  }

  private parseAnalysis(analysisText: string): RiskAnalysis {
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const risks: Risk[] = Array.isArray(parsed.risks)
        ? parsed.risks.slice(0, 20).map((r: any, index: number) => ({
            id: r.id || `R${index + 1}`,
            category: this.normalizeCategory(r.category),
            risk: r.risk || 'Risk identified',
            probability: this.normalizeProbability(r.probability),
            impact: this.normalizeImpact(r.impact),
            riskScore: Math.max(5, Math.min(100, r.riskScore || this.calculateRiskScore(r.probability, r.impact))),
            mitigation: r.mitigation || 'Mitigation needed',
            contingency: r.contingency || 'Contingency plan needed',
            owner: this.normalizeOwner(r.owner),
          }))
        : [];

      // Sort by risk score
      risks.sort((a, b) => b.riskScore - a.riskScore);

      // Count by impact
      const criticalRisks = risks.filter(r => r.impact === 'critical').length;
      const highRisks = risks.filter(r => r.impact === 'high').length;
      const mediumRisks = risks.filter(r => r.impact === 'medium').length;
      const lowRisks = risks.filter(r => r.impact === 'low').length;

      // Determine overall risk level
      let overallRiskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium';
      if (criticalRisks > 0) overallRiskLevel = 'critical';
      else if (highRisks >= 5) overallRiskLevel = 'high';
      else if (highRisks <= 2 && criticalRisks === 0) overallRiskLevel = 'low';

      return {
        risks,
        riskSummary: {
          totalRisks: risks.length,
          criticalRisks,
          highRisks,
          mediumRisks,
          lowRisks,
          overallRiskLevel,
        },
        topRisks: risks.slice(0, 5),
        riskMitigationPlan: parsed.riskMitigationPlan || 'Mitigation plan needed',
        budgetImpact: {
          estimatedContingency: parsed.budgetImpact?.estimatedContingency || '+15-20%',
          reasoning: parsed.budgetImpact?.reasoning || 'Standard contingency for identified risks',
        },
        timelineImpact: {
          estimatedDelay: parsed.timelineImpact?.estimatedDelay || '+1-2 weeks',
          reasoning: parsed.timelineImpact?.reasoning || 'Buffer for risk mitigation',
        },
      };
    } catch (error) {
      console.warn('[RiskAnalyzerAgent] Failed to parse:', error);
      throw error;
    }
  }

  private normalizeCategory(cat: string): Risk['category'] {
    const normalized = cat?.toLowerCase();
    if (normalized === 'technical') return 'technical';
    if (normalized === 'business') return 'business';
    if (normalized === 'operational') return 'operational';
    if (normalized === 'security') return 'security';
    if (normalized === 'compliance') return 'compliance';
    if (normalized === 'market') return 'market';
    return 'technical';
  }

  private normalizeProbability(prob: string): Risk['probability'] {
    const normalized = prob?.toLowerCase();
    if (normalized?.includes('very') && normalized?.includes('high')) return 'very-high';
    if (normalized?.includes('high')) return 'high';
    if (normalized?.includes('low') && normalized?.includes('very')) return 'very-low';
    if (normalized?.includes('low')) return 'low';
    return 'medium';
  }

  private normalizeImpact(impact: string): Risk['impact'] {
    const normalized = impact?.toLowerCase();
    if (normalized === 'critical') return 'critical';
    if (normalized === 'high') return 'high';
    if (normalized === 'low') return 'low';
    return 'medium';
  }

  private normalizeOwner(owner: string): string {
    const normalized = owner?.toLowerCase();
    if (normalized?.includes('founder')) return 'founder';
    if (normalized?.includes('tech') || normalized?.includes('cto')) return 'tech-lead';
    if (normalized?.includes('pm') || normalized?.includes('product')) return 'pm';
    if (normalized?.includes('legal')) return 'legal';
    if (normalized?.includes('security')) return 'security';
    return 'founder';
  }

  private calculateRiskScore(probability: string, impact: string): number {
    const probMap = { 'very-high': 5, 'high': 4, 'medium': 3, 'low': 2, 'very-low': 1 };
    const impactMap = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };

    const prob = probMap[this.normalizeProbability(probability)] || 3;
    const imp = impactMap[this.normalizeImpact(impact)] || 2;

    return prob * imp * 5;
  }

  private fallbackAnalysis(): ReasoningResult {
    const analysis: RiskAnalysis = {
      risks: [
        {
          id: 'R1',
          category: 'technical',
          risk: 'Technology stack unfamiliarity',
          probability: 'medium',
          impact: 'high',
          riskScore: 45,
          mitigation: 'Training and proof-of-concept development',
          contingency: 'Hire experienced developers or switch to familiar stack',
          owner: 'tech-lead',
        },
        {
          id: 'R2',
          category: 'market',
          risk: 'Market adoption slower than expected',
          probability: 'medium',
          impact: 'high',
          riskScore: 45,
          mitigation: 'Early customer validation and beta testing',
          contingency: 'Pivot to different market segment',
          owner: 'founder',
        },
      ],
      riskSummary: {
        totalRisks: 2,
        criticalRisks: 0,
        highRisks: 2,
        mediumRisks: 0,
        lowRisks: 0,
        overallRiskLevel: 'medium',
      },
      topRisks: [],
      riskMitigationPlan: 'Focus on early validation and technical prototyping',
      budgetImpact: {
        estimatedContingency: '+20%',
        reasoning: 'Buffer for unforeseen technical challenges',
      },
      timelineImpact: {
        estimatedDelay: '+2 weeks',
        reasoning: 'Time for risk mitigation activities',
      },
    };

    analysis.topRisks = analysis.risks.slice(0, 5);

    return {
      reasoning: 'Fallback risk analysis (LLM unavailable)',
      confidence: 0.5,
      intermediate: { analysis },
    };
  }
}
