import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Dashboard Configuration
 */
interface DashboardConfig {
  name: string;
  purpose: string;
  audience: 'executives' | 'product-team' | 'engineering' | 'all';
  refreshFrequency: 'real-time' | 'hourly' | 'daily';
  widgets: {
    type: 'metric' | 'chart' | 'table' | 'funnel' | 'cohort';
    title: string;
    dataSource: string;
    visualization: string;
  }[];
}

/**
 * Report Schedule
 */
interface ReportSchedule {
  reportName: string;
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly';
  dayOfWeek?: string;
  recipients: string[];
  format: 'email' | 'pdf' | 'dashboard-link' | 'slack';
  sections: string[];
}

/**
 * Key Metric
 */
interface KeyMetric {
  metric: string;
  currentValue: number;
  target: number;
  trend: 'up' | 'down' | 'stable';
  change: number; // percentage
  status: 'on-track' | 'at-risk' | 'off-track';
  insight: string;
}

/**
 * Cohort Analysis
 */
interface CohortAnalysis {
  cohortName: string;
  definition: string;
  size: number;
  retentionRate: {
    day1: number;
    day7: number;
    day30: number;
  };
  engagementScore: number;
  topFeatures: string[];
  churnRisk: 'low' | 'medium' | 'high';
}

/**
 * Funnel Analysis
 */
interface FunnelAnalysis {
  funnelName: string;
  steps: {
    step: string;
    users: number;
    dropoffRate: number;
    avgTimeToNext: number; // seconds
  }[];
  overallConversion: number;
  bottlenecks: string[];
  recommendations: string[];
}

/**
 * Feature Performance
 */
interface FeaturePerformance {
  featureName: string;
  adoptionRate: number; // percentage
  dailyActiveUsers: number;
  avgUsagePerUser: number;
  userSatisfaction: number; // 1-5
  bugs: number;
  performance: {
    loadTime: number;
    errorRate: number;
  };
  verdict: 'success' | 'moderate' | 'needs-improvement';
}

/**
 * User Feedback Summary
 */
interface UserFeedbackSummary {
  totalResponses: number;
  averageRating: number;
  nps: number;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  topThemes: {
    theme: string;
    mentions: number;
    sentiment: 'positive' | 'neutral' | 'negative';
  }[];
  commonPainPoints: string[];
  featureRequests: {
    request: string;
    votes: number;
    feasibility: 'easy' | 'medium' | 'hard';
  }[];
}

/**
 * Beta Health Scorecard
 */
interface BetaHealthScorecard {
  overallScore: number; // 0-100
  dimensions: {
    engagement: number;
    stability: number;
    performance: number;
    satisfaction: number;
    growth: number;
  };
  status: 'healthy' | 'warning' | 'critical';
  alerts: {
    severity: 'critical' | 'warning' | 'info';
    message: string;
    metric: string;
    threshold: number;
    actual: number;
  }[];
}

/**
 * Insight
 */
interface Insight {
  type: 'opportunity' | 'risk' | 'trend' | 'anomaly';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  evidence: string[];
  impact: string;
  recommendations: string[];
  assignee?: string;
}

/**
 * Comparative Analysis
 */
interface ComparativeAnalysis {
  dimension: string;
  segments: {
    segment: string;
    value: number;
    percentile: number;
  }[];
  winner: string;
  insight: string;
}

/**
 * Analytics Report
 */
interface AnalyticsReport {
  summary: {
    reportDate: string;
    betaDuration: number; // days since start
    totalTesters: number;
    activeTesters: number;
    overallHealthScore: number;
    keyInsights: number;
    criticalAlerts: number;
  };
  dashboards: DashboardConfig[];
  reportSchedule: ReportSchedule[];
  keyMetrics: KeyMetric[];
  cohortAnalysis: CohortAnalysis[];
  funnelAnalysis: FunnelAnalysis[];
  featurePerformance: FeaturePerformance[];
  userFeedback: UserFeedbackSummary;
  healthScorecard: BetaHealthScorecard;
  insights: Insight[];
  comparative: ComparativeAnalysis[];
  predictions: {
    metric: string;
    currentTrajectory: string;
    projectedValue: number;
    projectedDate: string;
    confidence: number; // 0-100
  }[];
  actionItems: {
    priority: 'immediate' | 'high' | 'medium' | 'low';
    action: string;
    owner: string;
    deadline: string;
    impact: string;
  }[];
  successCriteria: {
    criterion: string;
    target: number;
    actual: number;
    met: boolean;
    progress: number; // percentage
  }[];
  recommendations: {
    priority: 'immediate' | 'high' | 'medium' | 'low';
    recommendation: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
    category: 'product' | 'marketing' | 'support' | 'technical';
  }[];
}

/**
 * AnalyticsReporterAgent
 *
 * Generates comprehensive analytics reports and insights for beta program:
 * - Real-time dashboards and visualizations
 * - Automated reporting schedules
 * - Key metrics tracking and trending
 * - Cohort and funnel analysis
 * - Feature performance evaluation
 * - User feedback synthesis
 * - Beta health scorecard
 * - Actionable insights generation
 * - Comparative analysis across segments
 * - Predictive analytics
 * - Success criteria tracking
 *
 * Provides data-driven insights for beta program optimization
 * and informed decision-making.
 *
 * Input: Telemetry plan + Beta distribution + Release notes
 * Output: Comprehensive analytics and reporting strategy
 */
export class AnalyticsReporterAgent extends BaseAgent {
  private llm: ChatAnthropic;

  constructor(config: AgentConfig) {
    super(config);

    this.llm = new ChatAnthropic({
      modelName: config.llm.model,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  protected async plan(input: any): Promise<ExecutionPlan> {
    return {
      steps: [
        'Design analytics dashboards',
        'Define key metrics and success criteria',
        'Create reporting schedules',
        'Generate actionable insights framework',
      ],
      estimatedTotalDurationMs: 13000, // ~13 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildAnalyticsPrompt(input);

      this.logger.info('Invoking LLM for analytics reporting strategy');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const analyticsReport = this.parseAnalyticsReport(content);

      return {
        reasoning: `Analytics strategy designed with ${analyticsReport.summary.totalTesters} testers tracked. Created ${analyticsReport.dashboards.length} dashboards and ${analyticsReport.insights.length} key insights. Beta health score framework: ${analyticsReport.summary.overallHealthScore}/100.`,
        confidence: 0.88,
        intermediate: {
          analyticsReport,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for analytics reporting', { error });
      return this.fallback(input);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const analyticsReport = result.intermediate?.analyticsReport;

    return [
      {
        type: 'analytics-report-plan',
        content: analyticsReport,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildAnalyticsPrompt(input: any): string {
    const { previousArtifacts, ideaSpec } = input;

    // Extract context
    const telemetryPlan = previousArtifacts?.find((a: any) => a.type === 'telemetry-collection-plan')?.content;
    const betaDistribution = previousArtifacts?.find((a: any) => a.type === 'beta-distribution-plan')?.content;
    const releaseNotes = previousArtifacts?.find((a: any) => a.type === 'release-notes')?.content;

    const projectTitle = ideaSpec?.title || 'Project';
    const totalTesters = betaDistribution?.summary?.totalTesters || 100;
    const betaDuration = betaDistribution?.summary?.betaDuration || 30;
    const trackedEvents = telemetryPlan?.summary?.totalEvents || 20;

    return `You are a Product Analytics Lead and Data Storytelling Specialist.

PROJECT CONTEXT:
Project: ${projectTitle}
Beta Testers: ${totalTesters}
Beta Duration: ${betaDuration} days
Tracked Events: ${trackedEvents}

BETA METRICS TRACKED:
${betaDistribution?.metrics?.slice(0, 5).map((m: any) => `- ${m.metric}: Target ${m.target}`).join('\n') || 'Standard metrics'}

TASK:
Design comprehensive analytics reporting and insights strategy. Your response MUST be valid JSON:

{
  "summary": {
    "reportDate": "2025-01-20",
    "betaDuration": 10,
    "totalTesters": 500,
    "activeTesters": 350,
    "overallHealthScore": 78,
    "keyInsights": 8,
    "criticalAlerts": 2
  },
  "dashboards": [
    {
      "name": "Beta Health Overview",
      "purpose": "Executive summary of beta program health",
      "audience": "executives",
      "refreshFrequency": "daily",
      "widgets": [
        {"type": "metric", "title": "Active Testers", "dataSource": "analytics", "visualization": "number-with-trend"},
        {"type": "metric", "title": "NPS Score", "dataSource": "surveys", "visualization": "gauge"},
        {"type": "chart", "title": "Daily Active Users Trend", "dataSource": "analytics", "visualization": "line-chart"},
        {"type": "metric", "title": "Critical Bugs", "dataSource": "error-tracking", "visualization": "number-with-alert"}
      ]
    },
    {
      "name": "Feature Performance",
      "purpose": "Track adoption and usage of key features",
      "audience": "product-team",
      "refreshFrequency": "real-time",
      "widgets": [
        {"type": "table", "title": "Feature Adoption Rates", "dataSource": "analytics", "visualization": "sortable-table"},
        {"type": "funnel", "title": "Onboarding Funnel", "dataSource": "analytics", "visualization": "funnel-chart"},
        {"type": "chart", "title": "Feature Usage Over Time", "dataSource": "analytics", "visualization": "multi-line-chart"}
      ]
    },
    {
      "name": "Technical Performance",
      "purpose": "Monitor app stability and performance",
      "audience": "engineering",
      "refreshFrequency": "real-time",
      "widgets": [
        {"type": "metric", "title": "Error Rate", "dataSource": "error-tracking", "visualization": "number-with-threshold"},
        {"type": "chart", "title": "Page Load Times (p95)", "dataSource": "performance", "visualization": "line-chart"},
        {"type": "chart", "title": "Crash-Free Sessions", "dataSource": "error-tracking", "visualization": "percentage-chart"}
      ]
    }
  ],
  "reportSchedule": [
    {
      "reportName": "Daily Beta Digest",
      "frequency": "daily",
      "recipients": ["product-team@company.com"],
      "format": "email",
      "sections": ["Active users", "New bugs", "Top feedback", "Key metrics"]
    },
    {
      "reportName": "Weekly Executive Summary",
      "frequency": "weekly",
      "dayOfWeek": "Monday",
      "recipients": ["executives@company.com"],
      "format": "pdf",
      "sections": ["Health scorecard", "Progress vs goals", "Key insights", "Action items"]
    },
    {
      "reportName": "Bi-weekly Product Review",
      "frequency": "bi-weekly",
      "recipients": ["product-team@company.com", "engineering@company.com"],
      "format": "dashboard-link",
      "sections": ["Feature performance", "User feedback", "Technical metrics", "Roadmap impact"]
    }
  ],
  "keyMetrics": [
    {
      "metric": "Daily Active Testers",
      "currentValue": 350,
      "target": 400,
      "trend": "up",
      "change": 12,
      "status": "on-track",
      "insight": "Strong growth in daily active users, trending towards target"
    },
    {
      "metric": "NPS Score",
      "currentValue": 42,
      "target": 40,
      "trend": "up",
      "change": 5,
      "status": "on-track",
      "insight": "User satisfaction exceeding expectations, positive word of mouth"
    },
    {
      "metric": "Crash-Free Rate",
      "currentValue": 98.5,
      "target": 99.0,
      "trend": "stable",
      "change": 0,
      "status": "at-risk",
      "insight": "Stability good but not meeting target, focus on remaining crashes"
    },
    {
      "metric": "Feature Adoption (New Features)",
      "currentValue": 65,
      "target": 80,
      "trend": "down",
      "change": -8,
      "status": "off-track",
      "insight": "New feature adoption declining, may need better onboarding"
    }
  ],
  "cohortAnalysis": [
    {
      "cohortName": "Week 1 Testers",
      "definition": "Users who joined in the first week",
      "size": 150,
      "retentionRate": {"day1": 95, "day7": 78, "day30": 62},
      "engagementScore": 8.2,
      "topFeatures": ["Dashboard", "Collaboration", "Export"],
      "churnRisk": "low"
    },
    {
      "cohortName": "Power Users",
      "definition": "Users with 50+ sessions",
      "size": 80,
      "retentionRate": {"day1": 100, "day7": 96, "day30": 88},
      "engagementScore": 9.5,
      "topFeatures": ["Advanced Search", "Bulk Actions", "API"],
      "churnRisk": "low"
    },
    {
      "cohortName": "Inactive Testers",
      "definition": "No activity in past 7 days",
      "size": 45,
      "retentionRate": {"day1": 80, "day7": 15, "day30": 0},
      "engagementScore": 2.1,
      "topFeatures": [],
      "churnRisk": "high"
    }
  ],
  "funnelAnalysis": [
    {
      "funnelName": "User Onboarding",
      "steps": [
        {"step": "Sign up", "users": 500, "dropoffRate": 0, "avgTimeToNext": 60},
        {"step": "Profile setup", "users": 450, "dropoffRate": 10, "avgTimeToNext": 180},
        {"step": "First feature use", "users": 380, "dropoffRate": 15.6, "avgTimeToNext": 300},
        {"step": "Complete onboarding", "users": 340, "dropoffRate": 10.5, "avgTimeToNext": 120}
      ],
      "overallConversion": 68,
      "bottlenecks": ["Profile setup", "First feature use"],
      "recommendations": [
        "Simplify profile setup with optional fields",
        "Add in-product tooltips for first feature",
        "Send reminder email after 24h of inactivity"
      ]
    }
  ],
  "featurePerformance": [
    {
      "featureName": "Real-time Collaboration",
      "adoptionRate": 72,
      "dailyActiveUsers": 252,
      "avgUsagePerUser": 3.5,
      "userSatisfaction": 4.6,
      "bugs": 2,
      "performance": {"loadTime": 850, "errorRate": 0.2},
      "verdict": "success"
    },
    {
      "featureName": "Advanced Search",
      "adoptionRate": 35,
      "dailyActiveUsers": 122,
      "avgUsagePerUser": 1.8,
      "userSatisfaction": 3.9,
      "bugs": 5,
      "performance": {"loadTime": 1200, "errorRate": 1.5},
      "verdict": "needs-improvement"
    }
  ],
  "userFeedback": {
    "totalResponses": 187,
    "averageRating": 4.2,
    "nps": 42,
    "sentiment": {"positive": 72, "neutral": 18, "negative": 10},
    "topThemes": [
      {"theme": "Ease of use", "mentions": 85, "sentiment": "positive"},
      {"theme": "Performance", "mentions": 62, "sentiment": "neutral"},
      {"theme": "Missing features", "mentions": 45, "sentiment": "negative"}
    ],
    "commonPainPoints": [
      "Mobile app occasionally slow to load",
      "Bulk actions UI is confusing",
      "Missing export to Excel feature"
    ],
    "featureRequests": [
      {"request": "Dark mode", "votes": 67, "feasibility": "easy"},
      {"request": "Offline mode", "votes": 52, "feasibility": "hard"},
      {"request": "Calendar integration", "votes": 38, "feasibility": "medium"}
    ]
  },
  "healthScorecard": {
    "overallScore": 78,
    "dimensions": {
      "engagement": 82,
      "stability": 76,
      "performance": 74,
      "satisfaction": 85,
      "growth": 73
    },
    "status": "healthy",
    "alerts": [
      {
        "severity": "critical",
        "message": "Feature adoption declining for 3 consecutive days",
        "metric": "New Feature Adoption",
        "threshold": 75,
        "actual": 65
      },
      {
        "severity": "warning",
        "message": "45 testers inactive for 7+ days",
        "metric": "Churn Risk",
        "threshold": 30,
        "actual": 45
      }
    ]
  },
  "insights": [
    {
      "type": "opportunity",
      "severity": "high",
      "title": "Power users love advanced features",
      "description": "Top 20% of users account for 60% of advanced feature usage",
      "evidence": ["80 power users with avg 9.5 engagement", "95% would recommend to colleagues"],
      "impact": "These users are potential advocates and case study candidates",
      "recommendations": [
        "Create power user advisory board",
        "Develop case studies with consent",
        "Offer referral program"
      ],
      "assignee": "Product Lead"
    },
    {
      "type": "risk",
      "severity": "critical",
      "title": "New feature onboarding causing friction",
      "description": "Users dropping off at 'first feature use' step in onboarding",
      "evidence": ["15.6% dropoff at first feature use", "Support tickets mentioning confusion"],
      "impact": "Losing potential active users early in journey",
      "recommendations": [
        "Add contextual help tooltips",
        "Create interactive tutorial",
        "Simplify initial feature set"
      ],
      "assignee": "UX Lead"
    },
    {
      "type": "trend",
      "severity": "medium",
      "title": "Mobile usage growing faster than web",
      "description": "Mobile sessions up 35% week-over-week vs 12% for web",
      "evidence": ["Mobile DAU growth rate 35%", "Average mobile session 8 min vs 12 min web"],
      "impact": "Mobile experience becoming critical to success",
      "recommendations": [
        "Prioritize mobile performance optimizations",
        "Consider mobile-first feature development",
        "Test mobile-specific workflows"
      ]
    },
    {
      "type": "anomaly",
      "severity": "low",
      "title": "Weekend usage spike unexplained",
      "description": "Seeing 40% higher usage on weekends vs weekdays",
      "evidence": ["Saturday/Sunday avg 420 DAU vs weekday 300 DAU"],
      "impact": "May indicate personal use case opportunity",
      "recommendations": [
        "Survey weekend users about use cases",
        "Consider weekend-specific features",
        "Adjust support coverage"
      ]
    }
  ],
  "comparative": [
    {
      "dimension": "Engagement by Segment",
      "segments": [
        {"segment": "Power Users", "value": 9.5, "percentile": 95},
        {"segment": "Active Users", "value": 7.2, "percentile": 70},
        {"segment": "Casual Users", "value": 4.1, "percentile": 40}
      ],
      "winner": "Power Users",
      "insight": "Clear engagement tier structure, opportunity to upgrade casual to active"
    }
  ],
  "predictions": [
    {
      "metric": "Total Active Testers",
      "currentTrajectory": "Linear growth at 5% per week",
      "projectedValue": 525,
      "projectedDate": "2025-02-10",
      "confidence": 75
    },
    {
      "metric": "NPS Score",
      "currentTrajectory": "Steady at current level",
      "projectedValue": 43,
      "projectedDate": "2025-02-10",
      "confidence": 68
    }
  ],
  "actionItems": [
    {
      "priority": "immediate",
      "action": "Fix critical bug causing crashes on Android",
      "owner": "Engineering Lead",
      "deadline": "2025-01-22",
      "impact": "Improve crash-free rate from 98.5% to 99.5%"
    },
    {
      "priority": "high",
      "action": "Improve onboarding for new feature adoption",
      "owner": "Product Manager",
      "deadline": "2025-01-27",
      "impact": "Increase feature adoption from 65% to 80%"
    },
    {
      "priority": "high",
      "action": "Re-engage 45 inactive testers",
      "owner": "Growth Lead",
      "deadline": "2025-01-25",
      "impact": "Reduce churn, increase active tester count"
    },
    {
      "priority": "medium",
      "action": "Create power user case studies",
      "owner": "Marketing Lead",
      "deadline": "2025-02-03",
      "impact": "Build social proof for GA launch"
    }
  ],
  "successCriteria": [
    {
      "criterion": "350+ Daily Active Testers",
      "target": 350,
      "actual": 350,
      "met": true,
      "progress": 100
    },
    {
      "criterion": "NPS Score >= 40",
      "target": 40,
      "actual": 42,
      "met": true,
      "progress": 105
    },
    {
      "criterion": "Crash-Free Rate >= 99%",
      "target": 99,
      "actual": 98.5,
      "met": false,
      "progress": 99.5
    },
    {
      "criterion": "80%+ Feature Adoption",
      "target": 80,
      "actual": 65,
      "met": false,
      "progress": 81.25
    },
    {
      "criterion": "<100 Critical Bugs",
      "target": 100,
      "actual": 23,
      "met": true,
      "progress": 100
    }
  ],
  "recommendations": [
    {
      "priority": "immediate",
      "recommendation": "Address declining feature adoption with improved onboarding",
      "impact": "Critical for meeting beta success criteria",
      "effort": "medium",
      "category": "product"
    },
    {
      "priority": "high",
      "recommendation": "Launch re-engagement campaign for inactive testers",
      "impact": "Increase beta participation and feedback volume",
      "effort": "low",
      "category": "marketing"
    },
    {
      "priority": "high",
      "recommendation": "Prioritize Android crash fixes",
      "impact": "Meet stability targets, improve user trust",
      "effort": "low",
      "category": "technical"
    },
    {
      "priority": "medium",
      "recommendation": "Develop power user advocacy program",
      "impact": "Build momentum for GA launch",
      "effort": "medium",
      "category": "marketing"
    }
  ]
}

REQUIREMENTS:
- Create 3-5 dashboards for different audiences
- Define automated reporting schedules (daily, weekly, monthly)
- Track 8-12 key metrics with targets
- Analyze 3-5 user cohorts
- Evaluate feature performance for all major features
- Synthesize user feedback with sentiment analysis
- Generate beta health scorecard (0-100 scale)
- Provide 5-8 actionable insights
- Include comparative analysis across segments
- Make predictions for key metrics
- Define clear action items with owners and deadlines
- Track success criteria progress

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parseAnalyticsReport(text: string): AnalyticsReport {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed as AnalyticsReport;
    } catch (error) {
      this.logger.error('Failed to parse analytics report', { error });
      throw error;
    }
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback analytics report');

    const analyticsReport: AnalyticsReport = {
      summary: {
        reportDate: new Date().toISOString().split('T')[0],
        betaDuration: 10,
        totalTesters: 100,
        activeTesters: 70,
        overallHealthScore: 75,
        keyInsights: 3,
        criticalAlerts: 0,
      },
      dashboards: [
        {
          name: 'Beta Overview',
          purpose: 'Track beta health',
          audience: 'product-team',
          refreshFrequency: 'daily',
          widgets: [
            { type: 'metric', title: 'Active Testers', dataSource: 'analytics', visualization: 'number' },
          ],
        },
      ],
      reportSchedule: [
        {
          reportName: 'Weekly Summary',
          frequency: 'weekly',
          recipients: ['team@company.com'],
          format: 'email',
          sections: ['Metrics', 'Feedback'],
        },
      ],
      keyMetrics: [
        {
          metric: 'Active Testers',
          currentValue: 70,
          target: 80,
          trend: 'stable',
          change: 0,
          status: 'at-risk',
          insight: 'Need to increase engagement',
        },
      ],
      cohortAnalysis: [],
      funnelAnalysis: [],
      featurePerformance: [],
      userFeedback: {
        totalResponses: 50,
        averageRating: 4.0,
        nps: 35,
        sentiment: { positive: 60, neutral: 30, negative: 10 },
        topThemes: [],
        commonPainPoints: [],
        featureRequests: [],
      },
      healthScorecard: {
        overallScore: 75,
        dimensions: {
          engagement: 70,
          stability: 80,
          performance: 75,
          satisfaction: 78,
          growth: 72,
        },
        status: 'healthy',
        alerts: [],
      },
      insights: [],
      comparative: [],
      predictions: [],
      actionItems: [],
      successCriteria: [],
      recommendations: [
        {
          priority: 'medium',
          recommendation: 'Increase tester engagement',
          impact: 'Better feedback',
          effort: 'medium',
          category: 'product',
        },
      ],
    };

    return {
      reasoning: 'Using fallback analytics report as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        analyticsReport,
      },
    };
  }
}
