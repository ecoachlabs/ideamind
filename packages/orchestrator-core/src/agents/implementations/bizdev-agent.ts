import { BaseAgent, AgentCapabilities, AgentResult } from '../base-agent';

/**
 * BizDevAgent - Business development and go-to-market planning
 *
 * Creates comprehensive business development strategy including:
 * - Market analysis and positioning
 * - Go-to-market strategy
 * - Revenue model and pricing
 * - Growth strategy and partnerships
 * - Financial projections
 */
export class BizDevAgent extends BaseAgent {
  constructor(apiKey: string, model?: string) {
    super('BizDevAgent', apiKey, model);
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: false,
      supportsBatching: false,
      supportsCheckpointing: true,
      maxInputSize: 70000,
      maxOutputSize: 100000,
    };
  }

  async execute(input: any, context: Record<string, any>): Promise<AgentResult> {
    const startTime = Date.now();

    this.logger.info({ input }, 'Executing BizDev Agent');

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

      const { text, tokensUsed } = await this.callClaude(prompt, 8000, systemPrompt);

      const bizdevPlan = this.parseJSON(text);

      return {
        success: true,
        output: bizdevPlan,
        metadata: {
          tokensUsed,
          duration_ms: Date.now() - startTime,
          model: this.model,
        },
      };
    } catch (error: any) {
      this.logger.error({ error }, 'BizDev Agent execution failed');

      return {
        success: false,
        output: null,
        error: error.message,
      };
    }
  }

  private buildPrompt(input: any, context: Record<string, any>): string {
    return `You are a Business Development Agent that creates comprehensive business strategies.

## Input:
${JSON.stringify(input, null, 2)}

## Context:
${JSON.stringify(context, null, 2)}

## Your Task:
Create a detailed business development plan covering all aspects of commercialization.

Include:
1. **Market Analysis**: Market size, segments, trends, competition
2. **Positioning**: Unique value proposition and differentiation
3. **Go-to-Market Strategy**: Launch approach and channels
4. **Revenue Model**: Monetization strategy and pricing
5. **Customer Acquisition**: Marketing and sales strategy
6. **Partnership Strategy**: Strategic partnerships and integrations
7. **Growth Strategy**: Scaling and expansion plans
8. **Financial Projections**: Revenue, costs, and profitability
9. **Metrics and KPIs**: Success measurement
10. **Roadmap**: Business milestones and timeline

Output as JSON:
{
  "market_analysis": {
    "market_size": {
      "tam": "Total addressable market estimate",
      "sam": "Serviceable addressable market",
      "som": "Serviceable obtainable market",
      "growth_rate": "Market growth rate"
    },
    "market_segments": [
      {
        "segment": "Segment name",
        "size": "Size estimate",
        "characteristics": ["char1", "char2"],
        "attractiveness": "low|medium|high",
        "priority": 1
      }
    ],
    "market_trends": ["trend1", "trend2"],
    "competitive_landscape": [
      {
        "competitor": "Competitor name",
        "market_share": "Share estimate",
        "strengths": ["strength1"],
        "weaknesses": ["weakness1"],
        "positioning": "How they position"
      }
    ],
    "market_opportunities": ["opportunity1"],
    "market_threats": ["threat1"]
  },
  "positioning": {
    "value_proposition": "Core value proposition",
    "differentiation": ["How we're different"],
    "target_customer": "Primary target description",
    "positioning_statement": "One-line positioning",
    "messaging": {
      "tagline": "Catchy tagline",
      "key_messages": ["message1", "message2"],
      "proof_points": ["proof1"]
    },
    "brand_personality": ["trait1", "trait2"]
  },
  "go_to_market_strategy": {
    "launch_strategy": "Big bang|phased|stealth|etc",
    "launch_phases": [
      {
        "phase": "Phase name",
        "timeline": "Duration",
        "activities": ["activity1"],
        "success_criteria": ["criteria1"]
      }
    ],
    "channels": [
      {
        "channel": "Direct sales|Partners|Online|etc",
        "priority": "primary|secondary|tertiary",
        "strategy": "Channel strategy",
        "investment_required": "Investment level"
      }
    ],
    "early_adopter_strategy": "How to attract early adopters",
    "beta_program": {
      "enabled": true,
      "target_participants": 100,
      "selection_criteria": ["criteria1"],
      "incentives": ["incentive1"]
    }
  },
  "revenue_model": {
    "monetization_strategy": "subscription|transaction|freemium|etc",
    "pricing_model": "tiered|usage-based|flat|hybrid",
    "pricing_tiers": [
      {
        "tier": "Tier name",
        "price": "Price point",
        "target_segment": "Who it's for",
        "features": ["feature1"],
        "positioning": "How positioned"
      }
    ],
    "pricing_rationale": "Why this pricing",
    "revenue_streams": [
      {
        "stream": "Revenue source",
        "contribution": "Percentage of total",
        "timeline": "When it kicks in"
      }
    ],
    "payment_terms": "Payment structure",
    "discounting_strategy": "Discount approach"
  },
  "customer_acquisition": {
    "acquisition_strategy": "Product-led|sales-led|marketing-led",
    "marketing_channels": [
      {
        "channel": "SEO|content|paid|social|etc",
        "objective": "Channel objective",
        "tactics": ["tactic1"],
        "budget_allocation": "Percentage",
        "expected_roi": "ROI estimate"
      }
    ],
    "sales_strategy": {
      "sales_model": "Self-serve|inside sales|field sales|hybrid",
      "sales_team_structure": "Team structure",
      "sales_process": ["step1", "step2"],
      "sales_tools": ["tool1"]
    },
    "customer_journey": [
      {
        "stage": "awareness|consideration|decision|retention",
        "touchpoints": ["touchpoint1"],
        "content": ["content type"],
        "metrics": ["metric1"]
      }
    ],
    "cac_target": "Customer acquisition cost target",
    "conversion_funnel": {
      "awareness_to_interest": "Conversion rate",
      "interest_to_trial": "Conversion rate",
      "trial_to_paid": "Conversion rate"
    }
  },
  "partnership_strategy": {
    "partnership_objectives": ["objective1"],
    "target_partners": [
      {
        "partner_type": "technology|distribution|integration|strategic",
        "partner_profile": "Ideal partner description",
        "value_exchange": "What each party gets",
        "priority": "high|medium|low"
      }
    ],
    "integration_opportunities": ["integration1"],
    "channel_partnerships": ["partner1"],
    "strategic_alliances": ["alliance1"]
  },
  "growth_strategy": {
    "growth_levers": ["lever1", "lever2"],
    "expansion_strategy": {
      "geographic": "Geographic expansion plan",
      "vertical": "Vertical expansion plan",
      "horizontal": "Horizontal expansion plan"
    },
    "product_roadmap_alignment": "How product evolves for growth",
    "scaling_milestones": [
      {
        "milestone": "Milestone description",
        "timeline": "When",
        "metrics": ["metric1"],
        "enablers": ["what's needed"]
      }
    ],
    "viral_mechanisms": ["mechanism1"],
    "retention_strategy": "How to keep customers"
  },
  "financial_projections": {
    "assumptions": ["assumption1", "assumption2"],
    "revenue_projections": [
      {
        "period": "Year 1|Q1|etc",
        "revenue": "Revenue estimate",
        "customers": "Customer count",
        "arpu": "Average revenue per user"
      }
    ],
    "cost_structure": {
      "cogs": "Cost of goods sold",
      "sales_marketing": "S&M costs",
      "rd": "R&D costs",
      "ga": "G&A costs"
    },
    "unit_economics": {
      "cac": "Customer acquisition cost",
      "ltv": "Lifetime value",
      "ltv_cac_ratio": "Ratio",
      "payback_period": "Months to payback CAC"
    },
    "break_even_analysis": "When break-even expected",
    "funding_requirements": "Capital needed"
  },
  "metrics_and_kpis": {
    "north_star_metric": "Primary success metric",
    "acquisition_metrics": ["metric1"],
    "activation_metrics": ["metric1"],
    "revenue_metrics": ["MRR", "ARR"],
    "retention_metrics": ["churn", "NRR"],
    "product_metrics": ["MAU", "DAU"],
    "efficiency_metrics": ["CAC payback"],
    "dashboard_kpis": [
      {
        "kpi": "KPI name",
        "definition": "How calculated",
        "target": "Target value",
        "frequency": "daily|weekly|monthly"
      }
    ]
  },
  "business_milestones": [
    {
      "milestone": "Milestone description",
      "timeline": "When expected",
      "success_criteria": ["criteria1"],
      "dependencies": ["dependency1"],
      "owner": "Who's responsible"
    }
  ],
  "risks_and_mitigation": [
    {
      "risk": "Risk description",
      "category": "market|execution|financial|competitive",
      "probability": "low|medium|high",
      "impact": "low|medium|high",
      "mitigation": "Mitigation strategy"
    }
  ]
}`;
  }

  private getSystemPrompt(): string {
    return `You are a seasoned business development executive specializing in:
- Market analysis and opportunity assessment
- Go-to-market strategy and execution
- Revenue model design and pricing strategy
- Growth hacking and scaling strategies
- Financial modeling and unit economics
- Partnership development and ecosystem building

Create actionable, data-driven business plans that balance ambition with realism.
Consider market dynamics, competitive landscape, and execution capacity.`;
  }
}
