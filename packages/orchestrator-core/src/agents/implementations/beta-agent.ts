import { BaseAgent, AgentCapabilities, AgentResult } from '../base-agent';

/**
 * BetaAgent - Beta program management and feedback collection
 *
 * Creates comprehensive beta testing programs covering:
 * - Beta program strategy and goals
 * - Participant recruitment and selection
 * - Feedback collection mechanisms
 * - Success metrics and evaluation
 * - Iteration planning based on feedback
 * - Graduation criteria to production
 */
export class BetaAgent extends BaseAgent {
  constructor(apiKey: string, model?: string) {
    super('BetaAgent', apiKey, model);
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: false,
      supportsBatching: false,
      supportsCheckpointing: true,
      maxInputSize: 70000,
      maxOutputSize: 90000,
    };
  }

  async execute(input: any, context: Record<string, any>): Promise<AgentResult> {
    const startTime = Date.now();

    this.logger.info({ input }, 'Executing Beta Agent');

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

      const betaPlan = this.parseJSON(text);

      return {
        success: true,
        output: betaPlan,
        metadata: {
          tokensUsed,
          duration_ms: Date.now() - startTime,
          model: this.model,
          target_participants: betaPlan.recruitment?.target_count || 0,
        },
      };
    } catch (error: any) {
      this.logger.error({ error }, 'Beta Agent execution failed');

      return {
        success: false,
        output: null,
        error: error.message,
      };
    }
  }

  private buildPrompt(input: any, context: Record<string, any>): string {
    return `You are a Beta Agent that creates comprehensive beta testing programs.

## Input:
${JSON.stringify(input, null, 2)}

## Context:
${JSON.stringify(context, null, 2)}

## Your Task:
Create a detailed beta program plan covering all aspects of beta testing.

Include:
1. **Beta Strategy**: Goals, approach, and timeline
2. **Participant Recruitment**: How to find and select beta users
3. **Onboarding**: How to get beta users started
4. **Feedback Collection**: Mechanisms and processes
5. **Success Metrics**: How to measure beta program success
6. **Iteration Plan**: How to act on feedback
7. **Support**: How to help beta users
8. **Incentives**: What beta users get
9. **Graduation Criteria**: When to go to full release
10. **Risk Management**: What could go wrong

Output as JSON:
{
  "beta_program_overview": {
    "program_name": "Beta Program v1.0",
    "goals": [
      "Validate product-market fit",
      "Identify critical bugs before general release",
      "Gather feature feedback",
      "Build early user community"
    ],
    "duration": "8 weeks",
    "start_date": "2025-12-01",
    "end_date": "2026-01-26",
    "beta_type": "closed|open|invite-only",
    "target_participants": 100,
    "platforms": ["web", "iOS", "Android"]
  },
  "beta_strategy": {
    "approach": "Phased rollout with cohorts",
    "phases": [
      {
        "phase": "Phase 1: Alpha (Internal)",
        "duration": "1 week",
        "participants": "Internal team only (10 people)",
        "focus": "Critical bugs, basic functionality",
        "success_criteria": ["No showstopper bugs", "Core features work"]
      },
      {
        "phase": "Phase 2: Closed Beta (Invited)",
        "duration": "3 weeks",
        "participants": "50 invited users",
        "focus": "Feature validation, UX feedback, bug discovery",
        "success_criteria": ["NPS > 7", "< 10 critical bugs", "Key features used"]
      },
      {
        "phase": "Phase 3: Open Beta (Public)",
        "duration": "4 weeks",
        "participants": "Up to 500 users",
        "focus": "Scale testing, edge cases, final polish",
        "success_criteria": ["NPS > 8", "< 5 critical bugs", "Positive reviews"]
      }
    ],
    "cohort_strategy": {
      "cohort_size": 25,
      "cohort_frequency": "Weekly",
      "staggered_onboarding": "Reduce support burden and collect gradual feedback"
    }
  },
  "recruitment": {
    "target_count": 100,
    "target_profile": {
      "demographics": [
        "Early adopters",
        "Tech-savvy users",
        "Active on social media",
        "Provide constructive feedback"
      ],
      "user_segments": [
        {
          "segment": "Power users",
          "count": 30,
          "rationale": "Heavy usage provides best stress testing"
        },
        {
          "segment": "New users",
          "count": 50,
          "rationale": "Validate onboarding experience"
        },
        {
          "segment": "Edge case users",
          "count": 20,
          "rationale": "Test unusual configurations and use cases"
        }
      ],
      "exclusion_criteria": [
        "Competitors",
        "Users with history of abuse",
        "No clear use case for product"
      ]
    },
    "recruitment_channels": [
      {
        "channel": "Existing users (waitlist)",
        "target": 40,
        "message": "Thank you for signing up! You're invited to our exclusive beta.",
        "conversion_rate": "80%"
      },
      {
        "channel": "Social media (Twitter, LinkedIn)",
        "target": 30,
        "message": "Join our beta program and shape the future of [product]",
        "conversion_rate": "20%"
      },
      {
        "channel": "ProductHunt/BetaList",
        "target": 20,
        "message": "Early access to innovative [category] tool",
        "conversion_rate": "30%"
      },
      {
        "channel": "Email outreach to target users",
        "target": 10,
        "message": "Personalized invitation",
        "conversion_rate": "50%"
      }
    ],
    "application_process": {
      "required": true,
      "questions": [
        "What problem are you trying to solve?",
        "How would you use our product?",
        "How often would you use it?",
        "What similar tools do you currently use?",
        "Are you willing to provide feedback?"
      ],
      "selection_criteria": [
        "Clear use case",
        "Commitment to provide feedback",
        "Diverse user profiles",
        "Active and engaged"
      ],
      "approval_time": "Within 48 hours"
    }
  },
  "onboarding": {
    "welcome_sequence": [
      {
        "step": 1,
        "timing": "Immediately upon acceptance",
        "channel": "Email",
        "content": "Welcome to beta! Access link, getting started guide, support contact",
        "goal": "Set expectations and provide initial access"
      },
      {
        "step": 2,
        "timing": "Upon first login",
        "channel": "In-app",
        "content": "Interactive product tour highlighting key features",
        "goal": "Help users understand core functionality"
      },
      {
        "step": 3,
        "timing": "Day 3",
        "channel": "Email",
        "content": "Quick check-in: How's it going? Need help?",
        "goal": "Address early blockers"
      },
      {
        "step": 4,
        "timing": "Week 1",
        "channel": "Email + Slack invite",
        "content": "Join our beta community Slack, share feedback form",
        "goal": "Build community and encourage feedback"
      }
    ],
    "documentation": [
      {
        "doc": "Getting Started Guide",
        "format": "Interactive tutorial",
        "length": "5 minutes",
        "content": "Core features walkthrough"
      },
      {
        "doc": "Beta Program FAQ",
        "format": "Knowledge base article",
        "content": "Common questions about beta program"
      },
      {
        "doc": "Known Issues",
        "format": "Living document",
        "content": "Current bugs and workarounds",
        "update_frequency": "Weekly"
      }
    ],
    "beta_badge": {
      "display": "Beta user badge in profile",
      "purpose": "Recognition and status"
    }
  },
  "feedback_collection": {
    "mechanisms": [
      {
        "method": "In-app feedback widget",
        "trigger": "Always available (floating button)",
        "fields": ["Feedback type", "Description", "Screenshot", "Email"],
        "response_time": "Within 24 hours",
        "volume_expected": "High"
      },
      {
        "method": "Weekly surveys",
        "trigger": "Email every Friday",
        "questions": [
          "What features did you use this week?",
          "What frustrated you?",
          "What delighted you?",
          "On a scale 1-10, how likely are you to recommend us?"
        ],
        "completion_rate_target": "40%",
        "volume_expected": "Medium"
      },
      {
        "method": "User interviews",
        "trigger": "Reach out to engaged users",
        "frequency": "2-3 per week",
        "duration": "30 minutes",
        "compensation": "$50 gift card",
        "focus": "Deep dive into usage patterns and pain points",
        "volume_expected": "Low but high quality"
      },
      {
        "method": "Usage analytics",
        "trigger": "Continuous",
        "metrics": [
          "Daily active users",
          "Feature adoption",
          "User flows",
          "Drop-off points",
          "Session duration"
        ],
        "tools": ["Mixpanel", "Amplitude"],
        "volume_expected": "Automated"
      },
      {
        "method": "Beta Slack channel",
        "trigger": "Ongoing conversation",
        "moderation": "Community manager monitors",
        "purpose": "Community feedback, peer support, feature requests",
        "volume_expected": "Medium"
      }
    ],
    "feedback_categorization": {
      "categories": ["bug", "feature-request", "ux-issue", "documentation", "performance", "praise"],
      "prioritization": {
        "critical": "Blocks core functionality",
        "high": "Major usability issue",
        "medium": "Nice to have improvement",
        "low": "Minor polish"
      },
      "assignment": "Feedback routed to appropriate team via Jira"
    },
    "response_protocol": {
      "acknowledgment": "Within 24 hours",
      "bug_reports": "Triage within 48 hours, provide status update",
      "feature_requests": "Add to backlog, explain decision process",
      "praise": "Thank user, share with team"
    }
  },
  "success_metrics": {
    "quantitative": [
      {
        "metric": "Net Promoter Score (NPS)",
        "target": "> 50",
        "measurement": "Weekly survey",
        "current": "TBD"
      },
      {
        "metric": "Daily Active Users (DAU)",
        "target": "> 60% of beta users",
        "measurement": "Analytics",
        "current": "TBD"
      },
      {
        "metric": "Feature adoption",
        "target": "Core features used by 80% of users",
        "measurement": "Analytics",
        "current": "TBD"
      },
      {
        "metric": "Bug discovery rate",
        "target": "Decrease over time",
        "measurement": "Bug tracker",
        "current": "TBD"
      },
      {
        "metric": "Survey response rate",
        "target": "> 40%",
        "measurement": "Survey tool",
        "current": "TBD"
      },
      {
        "metric": "User retention (Week 2)",
        "target": "> 70%",
        "measurement": "Analytics",
        "current": "TBD"
      }
    ],
    "qualitative": [
      {
        "metric": "User satisfaction",
        "measurement": "Interview feedback, survey comments",
        "target": "Mostly positive sentiment"
      },
      {
        "metric": "Feature validation",
        "measurement": "Usage patterns and feedback",
        "target": "Confirm product-market fit"
      },
      {
        "metric": "Community health",
        "measurement": "Slack activity, peer support",
        "target": "Active, helpful community"
      }
    ],
    "reporting": {
      "frequency": "Weekly",
      "distribution": "Engineering, Product, Leadership",
      "format": "Dashboard + written summary",
      "key_insights": "Trends, top issues, user quotes"
    }
  },
  "iteration_plan": {
    "sprint_cadence": "2-week sprints",
    "prioritization": {
      "must_fix": [
        "Critical bugs (blocks core functionality)",
        "Data loss or security issues",
        "Widespread usability problems"
      ],
      "should_fix": [
        "High-impact feature requests",
        "Recurring user complaints",
        "Performance issues"
      ],
      "nice_to_have": [
        "Polish and refinement",
        "Edge case bugs",
        "Minor feature enhancements"
      ]
    },
    "release_frequency": "Weekly bug fix releases, bi-weekly feature releases",
    "communication": {
      "changelog": "Published every release",
      "beta_updates": "Weekly email with progress and new features",
      "transparency": "Share roadmap and decision rationale"
    },
    "feature_flags": {
      "usage": "Enable gradual feature rollout within beta",
      "testing": "A/B test variations with beta users",
      "rollback": "Quickly disable problematic features"
    }
  },
  "support": {
    "channels": [
      {
        "channel": "Email (beta@example.com)",
        "response_time": "Within 24 hours",
        "for": "General questions, bug reports"
      },
      {
        "channel": "Slack (private beta channel)",
        "response_time": "Best effort during business hours",
        "for": "Community discussion, quick questions"
      },
      {
        "channel": "Video calls",
        "availability": "By appointment",
        "for": "Complex issues, training"
      }
    ],
    "knowledge_base": {
      "articles": ["Getting started", "FAQ", "Known issues", "Feature guides"],
      "format": "Searchable help center",
      "maintenance": "Updated weekly"
    },
    "escalation": {
      "tier_1": "Community manager (first response)",
      "tier_2": "Product manager (complex questions)",
      "tier_3": "Engineering (technical issues)",
      "sla": "Critical issues escalated within 4 hours"
    },
    "beta_forum": {
      "platform": "Discourse or Circle",
      "moderation": "Community manager",
      "sections": ["Announcements", "Feedback", "Help", "Feature Requests"],
      "gamification": "Badges for helpful members"
    }
  },
  "incentives": {
    "participation_rewards": [
      {
        "incentive": "Free premium access",
        "duration": "6 months after launch",
        "value": "$300",
        "eligibility": "All active beta users"
      },
      {
        "incentive": "Beta user badge",
        "type": "Recognition",
        "display": "Profile badge 'Beta Pioneer'",
        "eligibility": "All beta users"
      },
      {
        "incentive": "Early access to new features",
        "type": "Exclusive access",
        "duration": "Ongoing",
        "eligibility": "Engaged beta users"
      },
      {
        "incentive": "Swag package",
        "type": "Physical goods",
        "items": ["T-shirt", "Stickers", "Thank you note"],
        "eligibility": "Users who provide 5+ pieces of feedback"
      }
    ],
    "top_contributor_rewards": [
      {
        "reward": "Lifetime free account",
        "criteria": "Top 10 contributors by feedback quality",
        "value": "Unlimited"
      },
      {
        "reward": "Product roadmap input",
        "criteria": "Top 5 contributors",
        "value": "Influence on product direction"
      },
      {
        "reward": "Case study feature",
        "criteria": "Interesting use case",
        "value": "Exposure and recognition"
      }
    ],
    "referral_program": {
      "enabled": true,
      "reward": "Extra 3 months premium for each referral",
      "limit": "Up to 5 referrals",
      "criteria": "Referred user must be active for 2 weeks"
    }
  },
  "graduation_criteria": {
    "must_meet": [
      {
        "criterion": "NPS > 50",
        "rationale": "Strong user satisfaction",
        "current_status": "TBD"
      },
      {
        "criterion": "< 5 critical bugs",
        "rationale": "Product stability",
        "current_status": "TBD"
      },
      {
        "criterion": "Core features used by 80% of users",
        "rationale": "Feature validation",
        "current_status": "TBD"
      },
      {
        "criterion": "70% Week 2 retention",
        "rationale": "User engagement",
        "current_status": "TBD"
      },
      {
        "criterion": "Positive product-market fit signals",
        "rationale": "Market validation",
        "current_status": "TBD"
      }
    ],
    "decision_process": {
      "review_frequency": "Bi-weekly",
      "decision_makers": ["Product", "Engineering", "CEO"],
      "go_no_go_meeting": "2 weeks before planned public launch",
      "criteria_documentation": "Scorecard tracking all graduation criteria"
    },
    "graduation_path": {
      "beta_to_public": "If all criteria met, proceed to public launch",
      "extended_beta": "If criteria not met, extend beta and iterate",
      "pivot": "If fundamental issues, consider product changes"
    }
  },
  "risk_management": {
    "risks": [
      {
        "risk": "Low beta sign-up rate",
        "probability": "medium",
        "impact": "high",
        "mitigation": "Multiple recruitment channels, compelling value prop",
        "contingency": "Lower target participant count or extend recruitment"
      },
      {
        "risk": "Inactive beta users",
        "probability": "medium",
        "impact": "medium",
        "mitigation": "Engaged onboarding, regular communication, incentives",
        "contingency": "Replace inactive users with new cohorts"
      },
      {
        "risk": "Negative feedback / bad reviews",
        "probability": "low",
        "impact": "high",
        "mitigation": "Set expectations, quick response to issues, transparency",
        "contingency": "Address concerns, offer refunds/compensation if needed"
      },
      {
        "risk": "Data breach or security issue",
        "probability": "low",
        "impact": "critical",
        "mitigation": "Security testing before beta, limited data collection",
        "contingency": "Incident response plan, transparent communication"
      },
      {
        "risk": "Competitor learns of plans",
        "probability": "medium",
        "impact": "medium",
        "mitigation": "NDA for sensitive features, focus on execution speed",
        "contingency": "Accelerate timeline, emphasize unique strengths"
      }
    ]
  },
  "timeline": {
    "milestones": [
      {
        "milestone": "Beta program launch",
        "date": "2025-12-01",
        "deliverables": ["Landing page", "Application form", "Docs ready"]
      },
      {
        "milestone": "First cohort onboarded",
        "date": "2025-12-08",
        "deliverables": ["25 users active", "Feedback mechanisms live"]
      },
      {
        "milestone": "Open beta begins",
        "date": "2025-12-22",
        "deliverables": ["Major bugs fixed", "Positive early feedback"]
      },
      {
        "milestone": "Graduation decision",
        "date": "2026-01-19",
        "deliverables": ["All criteria evaluated", "Go/no-go decision"]
      },
      {
        "milestone": "Public launch",
        "date": "2026-02-01",
        "deliverables": ["Product ready", "Marketing campaign", "Support scaled"]
      }
    ]
  },
  "team_responsibilities": {
    "roles": [
      {
        "role": "Beta Program Manager",
        "responsibilities": [
          "Overall program coordination",
          "Recruitment and onboarding",
          "Communication with beta users",
          "Metrics tracking"
        ],
        "time_commitment": "Full-time"
      },
      {
        "role": "Community Manager",
        "responsibilities": [
          "Slack moderation",
          "Support responses",
          "Community engagement",
          "Feedback triage"
        ],
        "time_commitment": "Part-time (20 hrs/week)"
      },
      {
        "role": "Product Manager",
        "responsibilities": [
          "Prioritize feedback",
          "Product roadmap",
          "User interviews",
          "Success metrics"
        ],
        "time_commitment": "50% of time"
      },
      {
        "role": "Engineering Team",
        "responsibilities": [
          "Bug fixes",
          "Feature development",
          "Technical support escalations"
        ],
        "time_commitment": "30% of sprint capacity"
      }
    ]
  }
}`;
  }

  private getSystemPrompt(): string {
    return `You are a product management and beta testing expert specializing in:
- Beta program strategy and planning
- User recruitment and community building
- Feedback collection and analysis
- Agile iteration based on user input
- Metrics-driven product validation
- User engagement and retention
- Go-to-market preparation

Create comprehensive beta programs that:
- Validate product-market fit
- Identify and fix critical issues
- Build early user community and advocates
- Gather actionable feedback
- De-risk public launch
- Set clear success criteria
- Balance structure with flexibility

Focus on practical, executable plans with clear metrics.`;
  }
}
