import { BaseAgent, AgentCapabilities, AgentResult } from '../base-agent';

/**
 * CritiqueAgent - Evaluates ideas for feasibility and quality
 *
 * Provides critical analysis of ideas, identifying strengths, weaknesses,
 * risks, and opportunities. Offers constructive feedback and recommendations.
 */
export class CritiqueAgent extends BaseAgent {
  constructor(apiKey: string, model?: string) {
    super('CritiqueAgent', apiKey, model);
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: false,
      supportsBatching: true,
      supportsCheckpointing: true,
      maxInputSize: 60000,
      maxOutputSize: 80000,
    };
  }

  async execute(input: any, context: Record<string, any>): Promise<AgentResult> {
    const startTime = Date.now();

    this.logger.info({ input }, 'Executing Critique Agent');

    if (!this.validateInput(input)) {
      return {
        success: false,
        output: null,
        error: 'Invalid input',
      };
    }

    try {
      const prompt = this.buildPrompt(input, context);
      const systemPrompt = this.getSystemPrompt();

      const { text, tokensUsed } = await this.callClaude(prompt, 7000, systemPrompt);

      const critique = this.parseJSON(text);

      return {
        success: true,
        output: critique,
        metadata: {
          tokensUsed,
          duration_ms: Date.now() - startTime,
          model: this.model,
          overall_score: critique.overall_assessment?.score || 0,
          risk_count: critique.risks?.length || 0,
        },
      };
    } catch (error: any) {
      this.logger.error({ error }, 'Critique Agent execution failed');

      return {
        success: false,
        output: null,
        error: error.message,
      };
    }
  }

  private buildPrompt(input: any, context: Record<string, any>): string {
    return `You are a Critique Agent that provides thorough, constructive evaluation of ideas.

## Input:
${JSON.stringify(input, null, 2)}

## Context:
${JSON.stringify(context, null, 2)}

## Your Task:
Provide comprehensive critique across multiple dimensions.

Evaluate:
1. **Technical Feasibility**: Can this be built? Technical challenges?
2. **Market Viability**: Is there demand? Competition analysis?
3. **User Experience**: Will users love it? Usability concerns?
4. **Business Model**: Can it sustain itself? Revenue potential?
5. **Resource Requirements**: Realistic effort estimates?
6. **Risk Assessment**: What could go wrong?
7. **Innovation**: How novel is it? Competitive advantages?
8. **Scalability**: Can it grow?

For each dimension, provide:
- Score (0-10)
- Strengths
- Weaknesses
- Recommendations

Output as JSON:
{
  "technical_feasibility": {
    "score": 8,
    "strengths": ["strength1", "strength2"],
    "weaknesses": ["weakness1", "weakness2"],
    "challenges": [
      {
        "challenge": "Challenge description",
        "severity": "low|medium|high|critical",
        "mitigation": "How to address"
      }
    ],
    "tech_stack_concerns": ["concern1"],
    "recommendations": ["rec1", "rec2"]
  },
  "market_viability": {
    "score": 7,
    "strengths": ["strength1"],
    "weaknesses": ["weakness1"],
    "market_size": "Estimate or 'unknown'",
    "competition": [
      {
        "competitor": "Name",
        "similarity": "How similar",
        "differentiation": "How we differ"
      }
    ],
    "target_audience_clarity": "Assessment",
    "recommendations": ["rec1"]
  },
  "user_experience": {
    "score": 8,
    "strengths": ["strength1"],
    "weaknesses": ["weakness1"],
    "usability_concerns": ["concern1"],
    "accessibility_notes": ["note1"],
    "recommendations": ["rec1"]
  },
  "business_model": {
    "score": 6,
    "strengths": ["strength1"],
    "weaknesses": ["weakness1"],
    "monetization_clarity": "clear|unclear|missing",
    "revenue_potential": "low|medium|high",
    "sustainability_concerns": ["concern1"],
    "recommendations": ["rec1"]
  },
  "resource_requirements": {
    "score": 5,
    "realism_assessment": "Assessment of estimates",
    "team_size_needed": "Estimate",
    "timeline_feasibility": "Realistic timeline",
    "budget_concerns": ["concern1"],
    "recommendations": ["rec1"]
  },
  "risks": [
    {
      "category": "technical|market|legal|financial|operational",
      "risk": "Risk description",
      "probability": "low|medium|high",
      "impact": "low|medium|high|critical",
      "severity": "low|medium|high|critical",
      "mitigation_strategy": "How to mitigate",
      "contingency_plan": "Plan B"
    }
  ],
  "innovation_assessment": {
    "score": 7,
    "novelty": "incremental|moderate|breakthrough",
    "competitive_advantages": ["advantage1"],
    "differentiation_strength": "weak|moderate|strong",
    "moat_potential": "Assessment of defensibility",
    "recommendations": ["rec1"]
  },
  "scalability": {
    "score": 7,
    "technical_scalability": "Assessment",
    "business_scalability": "Assessment",
    "bottlenecks": ["bottleneck1"],
    "growth_path": "Clear path or concerns",
    "recommendations": ["rec1"]
  },
  "overall_assessment": {
    "score": 7.0,
    "verdict": "strong-go|go|conditional-go|pause|no-go",
    "key_strengths": ["strength1", "strength2"],
    "critical_weaknesses": ["weakness1"],
    "must_address": ["item1", "item2"],
    "nice_to_have": ["item1"],
    "recommendation": "Overall recommendation",
    "confidence_level": "low|medium|high"
  },
  "improvement_priorities": [
    {
      "priority": 1,
      "area": "Area to improve",
      "action": "What to do",
      "impact": "Expected impact",
      "effort": "low|medium|high"
    }
  ]
}`;
  }

  private getSystemPrompt(): string {
    return `You are an expert critic and evaluator specializing in:
- Identifying weaknesses and risks objectively
- Providing constructive, actionable feedback
- Balancing skepticism with encouragement
- Recognizing both strengths and areas for improvement
- Prioritizing concerns by severity and impact

Be thorough, honest, and balanced. Critique should strengthen ideas, not kill them.`;
  }
}
