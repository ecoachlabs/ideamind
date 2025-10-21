import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Distribution Channel
 */
interface DistributionChannel {
  platform: 'testflight' | 'play-beta' | 'firebase' | 'github-releases' | 'netlify-preview' | 'vercel-preview' | 'custom';
  name: string;
  targetAudience: 'internal' | 'closed-beta' | 'open-beta' | 'public-preview';
  capacity: number; // max testers
  setup: {
    configured: boolean;
    steps: string[];
    credentials: string[];
  };
  distributionUrl?: string;
}

/**
 * Beta Tester Segment
 */
interface BetaTesterSegment {
  id: string;
  name: string;
  description: string;
  size: number;
  criteria: string[];
  priority: 'high' | 'medium' | 'low';
  accessLevel: 'full' | 'limited' | 'preview';
}

/**
 * Beta Release Schedule
 */
interface BetaReleaseSchedule {
  phase: string;
  startDate: string;
  duration: number; // days
  testerCount: number;
  features: string[];
  goals: string[];
  successCriteria: string[];
}

/**
 * Onboarding Material
 */
interface OnboardingMaterial {
  type: 'welcome-email' | 'guide' | 'video' | 'faq' | 'changelog';
  title: string;
  description: string;
  content: string;
  audience: string[];
}

/**
 * Feedback Channel
 */
interface FeedbackChannel {
  channel: 'in-app' | 'email' | 'discord' | 'slack' | 'github-issues' | 'typeform' | 'uservoice';
  name: string;
  purpose: string;
  setup: string[];
  automated: boolean;
}

/**
 * Access Control
 */
interface AccessControl {
  method: 'email-whitelist' | 'invite-code' | 'oauth' | 'domain-restriction' | 'manual-approval';
  configuration: {
    [key: string]: any;
  };
  automationLevel: 'fully-automated' | 'semi-automated' | 'manual';
}

/**
 * Beta Metrics
 */
interface BetaMetrics {
  metric: string;
  target: number;
  measurement: string;
  frequency: 'real-time' | 'daily' | 'weekly';
  alertThreshold?: number;
}

/**
 * Communication Plan
 */
interface CommunicationPlan {
  milestone: string;
  timing: string;
  channel: string[];
  message: string;
  recipients: string[];
}

/**
 * Beta Distribution Report
 */
interface BetaDistributionReport {
  summary: {
    totalChannels: number;
    totalTesters: number;
    estimatedReach: number;
    betaDuration: number; // days
    readyForDistribution: boolean;
  };
  channels: DistributionChannel[];
  testerSegments: BetaTesterSegment[];
  schedule: BetaReleaseSchedule[];
  onboarding: {
    materials: OnboardingMaterial[];
    automationLevel: number; // 0-100
    estimatedOnboardingTime: number; // minutes per tester
  };
  feedback: {
    channels: FeedbackChannel[];
    expectedResponseRate: number; // percentage
    incentives: {
      type: string;
      description: string;
      eligibility: string;
    }[];
  };
  accessControl: AccessControl;
  recruitment: {
    strategy: string;
    channels: string[];
    messaging: string;
    targetRecruitment: number;
    timeline: number; // days
  };
  metrics: BetaMetrics[];
  communication: CommunicationPlan[];
  legal: {
    nda: boolean;
    termsOfService: boolean;
    privacyPolicy: boolean;
    dataRetention: string;
    gdprCompliant: boolean;
  };
  riskMitigation: {
    risk: string;
    likelihood: 'high' | 'medium' | 'low';
    impact: 'high' | 'medium' | 'low';
    mitigation: string;
  }[];
  recommendations: {
    priority: 'immediate' | 'high' | 'medium' | 'low';
    recommendation: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
    category: 'distribution' | 'engagement' | 'feedback' | 'legal';
  }[];
}

/**
 * BetaDistributorAgent
 *
 * Manages beta program distribution and tester engagement:
 * - Distribution channel setup (TestFlight, Play Console, etc.)
 * - Beta tester recruitment and segmentation
 * - Access control and permissions management
 * - Onboarding materials and documentation
 * - Feedback collection mechanisms
 * - Beta release scheduling and phasing
 * - Communication plans for testers
 * - Legal compliance (NDAs, privacy, GDPR)
 * - Risk mitigation strategies
 * - Engagement and retention tactics
 *
 * Provides comprehensive beta distribution strategy for successful
 * beta program execution and valuable user feedback.
 *
 * Input: Release complete + Deployment plan + Release notes
 * Output: Beta distribution strategy with tester management plan
 */
export class BetaDistributorAgent extends BaseAgent {
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
        'Identify appropriate distribution channels',
        'Design beta tester segmentation strategy',
        'Create onboarding and feedback collection plan',
        'Generate communication and legal compliance framework',
      ],
      estimatedTotalDurationMs: 14000, // ~14 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildDistributionPrompt(input);

      this.logger.info('Invoking LLM for beta distribution strategy');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const distributionReport = this.parseDistributionReport(content);

      return {
        reasoning: `Beta distribution strategy designed for ${distributionReport.summary.totalTesters} testers across ${distributionReport.summary.totalChannels} channels. Beta duration: ${distributionReport.summary.betaDuration} days. Distribution ready: ${distributionReport.summary.readyForDistribution}.`,
        confidence: 0.86,
        intermediate: {
          distributionReport,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for beta distribution', { error });
      return this.fallback(input);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const distributionReport = result.intermediate?.distributionReport;

    return [
      {
        type: 'beta-distribution-plan',
        content: distributionReport,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildDistributionPrompt(input: any): string {
    const { previousArtifacts, ideaSpec } = input;

    // Extract context
    const releaseComplete = previousArtifacts?.find((a: any) => a.type === 'release-complete')?.content;
    const deploymentPlan = previousArtifacts?.find((a: any) => a.type === 'deployment-plan')?.content;
    const releaseNotes = previousArtifacts?.find((a: any) => a.type === 'release-notes')?.content;
    const repoBlueprint = previousArtifacts?.find((a: any) => a.type === 'repository-blueprint')?.content;

    const projectTitle = ideaSpec?.title || 'Project';
    const targetUsers = ideaSpec?.targetUsers?.join(', ') || 'users';
    const framework = repoBlueprint?.overview?.framework || 'React';
    const releaseVersion = releaseNotes?.version || '1.0.0-beta';

    return `You are a Product Launch Manager and Beta Program Specialist.

PROJECT CONTEXT:
Project: ${projectTitle}
Release Version: ${releaseVersion}
Framework: ${framework}
Target Users: ${targetUsers}
Breaking Changes: ${releaseNotes?.summary?.breakingChanges || 0}

RELEASE SUMMARY:
Features: ${releaseNotes?.summary?.features || 0}
Improvements: ${releaseNotes?.summary?.improvements || 0}
Total Changes: ${releaseNotes?.summary?.totalChanges || 0}

TASK:
Design comprehensive beta distribution and tester management strategy. Your response MUST be valid JSON:

{
  "summary": {
    "totalChannels": 3,
    "totalTesters": 500,
    "estimatedReach": 2000,
    "betaDuration": 30,
    "readyForDistribution": true
  },
  "channels": [
    {
      "platform": "testflight",
      "name": "iOS TestFlight",
      "targetAudience": "closed-beta",
      "capacity": 10000,
      "setup": {
        "configured": true,
        "steps": [
          "Create App Store Connect app",
          "Upload beta build",
          "Add tester emails",
          "Send invitations"
        ],
        "credentials": ["Apple Developer Account", "App Store Connect API Key"]
      },
      "distributionUrl": "https://testflight.apple.com/join/ABC123"
    },
    {
      "platform": "play-beta",
      "name": "Google Play Beta",
      "targetAudience": "closed-beta",
      "capacity": 20000,
      "setup": {
        "configured": true,
        "steps": [
          "Create beta track in Play Console",
          "Upload APK/AAB",
          "Add tester emails or create opt-in URL",
          "Publish to beta track"
        ],
        "credentials": ["Google Play Developer Account"]
      },
      "distributionUrl": "https://play.google.com/apps/testing/com.example.app"
    },
    {
      "platform": "netlify-preview",
      "name": "Web Preview",
      "targetAudience": "open-beta",
      "capacity": 999999,
      "setup": {
        "configured": true,
        "steps": [
          "Deploy to Netlify",
          "Configure preview URL",
          "Set up password protection (optional)",
          "Share preview link"
        ],
        "credentials": ["Netlify Account"]
      },
      "distributionUrl": "https://beta.example.com"
    }
  ],
  "testerSegments": [
    {
      "id": "segment-001",
      "name": "Internal Team",
      "description": "Company employees and contractors",
      "size": 50,
      "criteria": ["@company.com email", "NDA signed"],
      "priority": "high",
      "accessLevel": "full"
    },
    {
      "id": "segment-002",
      "name": "Power Users",
      "description": "Existing customers who are heavy users",
      "size": 200,
      "criteria": ["Active for 6+ months", "High engagement score", "Opted into beta"],
      "priority": "high",
      "accessLevel": "full"
    },
    {
      "id": "segment-003",
      "name": "Early Adopters",
      "description": "New users excited about trying beta features",
      "size": 250,
      "criteria": ["Signed up for beta waitlist", "Email verified"],
      "priority": "medium",
      "accessLevel": "limited"
    }
  ],
  "schedule": [
    {
      "phase": "Internal Alpha",
      "startDate": "2025-01-20",
      "duration": 7,
      "testerCount": 50,
      "features": ["All features", "Debug tools enabled"],
      "goals": ["Find critical bugs", "Test core functionality", "Validate user flows"],
      "successCriteria": ["Zero critical bugs", "All user journeys complete", "Performance targets met"]
    },
    {
      "phase": "Closed Beta",
      "startDate": "2025-01-27",
      "duration": 14,
      "testerCount": 200,
      "features": ["All features", "Analytics enabled"],
      "goals": ["Validate with power users", "Collect detailed feedback", "Test under load"],
      "successCriteria": ["<5 high-priority bugs", "80% positive feedback", "95% uptime"]
    },
    {
      "phase": "Open Beta",
      "startDate": "2025-02-10",
      "duration": 14,
      "testerCount": 500,
      "features": ["All production features"],
      "goals": ["Scale testing", "Final bug fixes", "Marketing buzz"],
      "successCriteria": ["Production-ready quality", "90% positive feedback", "Media coverage"]
    }
  ],
  "onboarding": {
    "materials": [
      {
        "type": "welcome-email",
        "title": "Welcome to Beta!",
        "description": "Initial email sent to beta testers",
        "content": "Thank you for joining our beta program! Here's what to expect...",
        "audience": ["All testers"]
      },
      {
        "type": "guide",
        "title": "Beta Tester Guide",
        "description": "Comprehensive guide for beta testers",
        "content": "1. How to access the beta\\n2. What to test\\n3. How to report bugs\\n4. FAQ",
        "audience": ["All testers"]
      },
      {
        "type": "video",
        "title": "Beta Walkthrough",
        "description": "5-minute video showing new features",
        "content": "Video URL: https://youtu.be/example",
        "audience": ["All testers"]
      },
      {
        "type": "faq",
        "title": "Beta FAQ",
        "description": "Frequently asked questions",
        "content": "Q: How long is the beta?\\nA: 30 days\\n\\nQ: Will my data be saved?\\nA: Yes...",
        "audience": ["All testers"]
      }
    ],
    "automationLevel": 85,
    "estimatedOnboardingTime": 10
  },
  "feedback": {
    "channels": [
      {
        "channel": "in-app",
        "name": "In-App Feedback Widget",
        "purpose": "Quick feedback and bug reports from within the app",
        "setup": ["Integrate feedback SDK", "Configure submission endpoint", "Set up notifications"],
        "automated": true
      },
      {
        "channel": "discord",
        "name": "Beta Discord Server",
        "purpose": "Community discussion and real-time support",
        "setup": ["Create Discord server", "Set up channels", "Invite testers", "Moderate discussions"],
        "automated": false
      },
      {
        "channel": "typeform",
        "name": "Weekly Survey",
        "purpose": "Structured feedback collection",
        "setup": ["Create Typeform surveys", "Schedule automated emails", "Analyze responses"],
        "automated": true
      }
    ],
    "expectedResponseRate": 35,
    "incentives": [
      {
        "type": "Early Access",
        "description": "First to use new features",
        "eligibility": "All beta testers"
      },
      {
        "type": "Swag",
        "description": "Beta tester t-shirt and stickers",
        "eligibility": "Testers who submit 5+ bug reports"
      },
      {
        "type": "Credit",
        "description": "$50 account credit on GA launch",
        "eligibility": "Active testers (20+ sessions during beta)"
      }
    ]
  },
  "accessControl": {
    "method": "email-whitelist",
    "configuration": {
      "whitelistSource": "beta-signups database",
      "verificationRequired": true,
      "approvalWorkflow": "automatic",
      "maxUsersPerEmail": 1
    },
    "automationLevel": "fully-automated"
  },
  "recruitment": {
    "strategy": "Invite existing users + public sign-up",
    "channels": ["Email to existing users", "Social media (Twitter, LinkedIn)", "Product Hunt", "Blog announcement"],
    "messaging": "Be among the first to try our revolutionary new features! Join our exclusive beta program.",
    "targetRecruitment": 500,
    "timeline": 14
  },
  "metrics": [
    {
      "metric": "Active Testers",
      "target": 350,
      "measurement": "Daily active users",
      "frequency": "daily",
      "alertThreshold": 250
    },
    {
      "metric": "Bug Reports",
      "target": 100,
      "measurement": "Total unique bugs reported",
      "frequency": "daily"
    },
    {
      "metric": "Crash Rate",
      "target": 1,
      "measurement": "Crashes per 100 sessions",
      "frequency": "real-time",
      "alertThreshold": 5
    },
    {
      "metric": "Feature Adoption",
      "target": 80,
      "measurement": "% testers who used new features",
      "frequency": "weekly"
    },
    {
      "metric": "Net Promoter Score",
      "target": 40,
      "measurement": "NPS from survey",
      "frequency": "weekly"
    }
  ],
  "communication": [
    {
      "milestone": "Beta launch",
      "timing": "Day 0",
      "channel": ["email", "discord"],
      "message": "Beta is now live! Download and start testing.",
      "recipients": ["All invited testers"]
    },
    {
      "milestone": "Week 1 check-in",
      "timing": "Day 7",
      "channel": ["email"],
      "message": "How's your beta experience? Take our quick survey.",
      "recipients": ["Active testers"]
    },
    {
      "milestone": "Major update",
      "timing": "As needed",
      "channel": ["email", "discord", "in-app"],
      "message": "New beta build available with bug fixes and improvements.",
      "recipients": ["All testers"]
    },
    {
      "milestone": "Beta conclusion",
      "timing": "Day 30",
      "channel": ["email"],
      "message": "Thank you for beta testing! Here's what's next...",
      "recipients": ["All testers"]
    }
  ],
  "legal": {
    "nda": false,
    "termsOfService": true,
    "privacyPolicy": true,
    "dataRetention": "Beta data retained for 90 days post-GA",
    "gdprCompliant": true
  },
  "riskMitigation": [
    {
      "risk": "Low tester engagement",
      "likelihood": "medium",
      "impact": "high",
      "mitigation": "Gamification, incentives, regular communication, easy feedback channels"
    },
    {
      "risk": "Data breach during beta",
      "likelihood": "low",
      "impact": "high",
      "mitigation": "Use synthetic data, encrypt all communications, security audit before beta"
    },
    {
      "risk": "Negative public perception",
      "likelihood": "medium",
      "impact": "medium",
      "mitigation": "Clear beta expectations, proactive bug fixes, transparent communication"
    },
    {
      "risk": "Critical bug in production",
      "likelihood": "medium",
      "impact": "high",
      "mitigation": "Phased rollout, monitoring, instant rollback capability"
    }
  ],
  "recommendations": [
    {
      "priority": "high",
      "recommendation": "Set up automated crash reporting before beta launch",
      "impact": "Catch critical bugs immediately",
      "effort": "low",
      "category": "distribution"
    },
    {
      "priority": "high",
      "recommendation": "Create Discord community for real-time tester engagement",
      "impact": "Builds community, increases feedback quality",
      "effort": "medium",
      "category": "engagement"
    },
    {
      "priority": "medium",
      "recommendation": "Implement feature flags for gradual rollout",
      "impact": "Reduce risk, test features independently",
      "effort": "medium",
      "category": "distribution"
    },
    {
      "priority": "medium",
      "recommendation": "Offer referral bonuses for tester recruitment",
      "impact": "Accelerate tester acquisition",
      "effort": "low",
      "category": "engagement"
    }
  ]
}

REQUIREMENTS:
- Design for 2-4 distribution channels based on platform
- Plan for 3 tester segments (internal, closed, open)
- Create 3-phase rollout schedule (alpha, closed beta, open beta)
- Provide comprehensive onboarding materials
- Set up multiple feedback channels
- Include engagement incentives
- Define clear metrics and success criteria
- Address legal compliance (GDPR, privacy, ToS)
- Provide risk mitigation strategies
- Recommend beta program optimizations

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parseDistributionReport(text: string): BetaDistributionReport {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed as BetaDistributionReport;
    } catch (error) {
      this.logger.error('Failed to parse beta distribution report', { error });
      throw error;
    }
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback beta distribution report');

    const distributionReport: BetaDistributionReport = {
      summary: {
        totalChannels: 2,
        totalTesters: 100,
        estimatedReach: 500,
        betaDuration: 30,
        readyForDistribution: true,
      },
      channels: [
        {
          platform: 'netlify-preview',
          name: 'Web Preview',
          targetAudience: 'closed-beta',
          capacity: 999999,
          setup: {
            configured: true,
            steps: ['Deploy to preview environment'],
            credentials: ['Hosting credentials'],
          },
        },
      ],
      testerSegments: [
        {
          id: 'segment-001',
          name: 'Internal Team',
          description: 'Internal testers',
          size: 50,
          criteria: ['Internal employees'],
          priority: 'high',
          accessLevel: 'full',
        },
        {
          id: 'segment-002',
          name: 'Beta Users',
          description: 'External beta testers',
          size: 50,
          criteria: ['Signed up for beta'],
          priority: 'medium',
          accessLevel: 'full',
        },
      ],
      schedule: [
        {
          phase: 'Closed Beta',
          startDate: new Date().toISOString().split('T')[0],
          duration: 30,
          testerCount: 100,
          features: ['All features'],
          goals: ['Collect feedback', 'Find bugs'],
          successCriteria: ['Positive feedback'],
        },
      ],
      onboarding: {
        materials: [
          {
            type: 'welcome-email',
            title: 'Welcome to Beta',
            description: 'Welcome email',
            content: 'Thank you for joining beta',
            audience: ['All testers'],
          },
        ],
        automationLevel: 50,
        estimatedOnboardingTime: 15,
      },
      feedback: {
        channels: [
          {
            channel: 'email',
            name: 'Email Feedback',
            purpose: 'Collect feedback via email',
            setup: ['Set up email'],
            automated: false,
          },
        ],
        expectedResponseRate: 25,
        incentives: [],
      },
      accessControl: {
        method: 'email-whitelist',
        configuration: {},
        automationLevel: 'semi-automated',
      },
      recruitment: {
        strategy: 'Email invitation',
        channels: ['Email'],
        messaging: 'Join our beta program',
        targetRecruitment: 100,
        timeline: 14,
      },
      metrics: [
        {
          metric: 'Active Testers',
          target: 70,
          measurement: 'Daily active users',
          frequency: 'daily',
        },
      ],
      communication: [],
      legal: {
        nda: false,
        termsOfService: true,
        privacyPolicy: true,
        dataRetention: '90 days',
        gdprCompliant: true,
      },
      riskMitigation: [],
      recommendations: [
        {
          priority: 'medium',
          recommendation: 'Set up feedback collection',
          impact: 'Better insights',
          effort: 'low',
          category: 'feedback',
        },
      ],
    };

    return {
      reasoning: 'Using fallback beta distribution report as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        distributionReport,
      },
    };
  }
}
