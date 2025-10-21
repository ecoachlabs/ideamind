import { BaseAgent, AgentCapabilities, AgentResult } from '../base-agent';

/**
 * ReleaseAgent - Deployment and release planning
 *
 * Creates comprehensive release plans covering:
 * - Deployment strategy and procedures
 * - Release checklist and go/no-go criteria
 * - Rollback procedures
 * - Monitoring and observability setup
 * - Release communication plan
 * - Post-release activities
 */
export class ReleaseAgent extends BaseAgent {
  constructor(apiKey: string, model?: string) {
    super('ReleaseAgent', apiKey, model);
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: false,
      supportsBatching: false,
      supportsCheckpointing: true,
      maxInputSize: 80000,
      maxOutputSize: 100000,
    };
  }

  async execute(input: any, context: Record<string, any>): Promise<AgentResult> {
    const startTime = Date.now();

    this.logger.info({ input }, 'Executing Release Agent');

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

      const { text, tokensUsed } = await this.callClaude(prompt, 9000, systemPrompt);

      const releasePlan = this.parseJSON(text);

      return {
        success: true,
        output: releasePlan,
        metadata: {
          tokensUsed,
          duration_ms: Date.now() - startTime,
          model: this.model,
          checklist_items: releasePlan.release_checklist?.items?.length || 0,
        },
      };
    } catch (error: any) {
      this.logger.error({ error }, 'Release Agent execution failed');

      return {
        success: false,
        output: null,
        error: error.message,
      };
    }
  }

  private buildPrompt(input: any, context: Record<string, any>): string {
    return `You are a Release Agent that creates comprehensive deployment and release plans.

## Input:
${JSON.stringify(input, null, 2)}

## Context:
${JSON.stringify(context, null, 2)}

## Your Task:
Create a detailed release plan covering all aspects of deployment.

Include:
1. **Release Strategy**: Approach and methodology
2. **Deployment Plan**: Step-by-step deployment procedures
3. **Release Checklist**: All pre-release requirements
4. **Go/No-Go Criteria**: Decision points for proceeding
5. **Rollback Plan**: Procedures if things go wrong
6. **Monitoring**: What to watch during and after release
7. **Communication Plan**: Who to inform and when
8. **Post-Release**: Validation and follow-up activities
9. **Runbook**: Operational procedures
10. **Lessons Learned**: Capture for next release

Output as JSON:
{
  "release_overview": {
    "release_name": "v1.0.0",
    "release_date": "2025-11-15",
    "release_type": "major|minor|patch|hotfix",
    "deployment_strategy": "blue-green|canary|rolling|big-bang",
    "risk_level": "low|medium|high",
    "change_summary": "High-level summary of changes",
    "deployment_window": {
      "start": "2025-11-15T02:00:00Z",
      "end": "2025-11-15T06:00:00Z",
      "timezone": "UTC",
      "maintenance_required": false
    }
  },
  "release_strategy": {
    "approach": "blue-green|canary|rolling|phased",
    "rationale": "Why this approach",
    "phases": [
      {
        "phase": "Phase 1: Canary",
        "duration": "2 hours",
        "traffic_percentage": "5%",
        "success_criteria": ["Error rate < 0.1%", "Latency < 500ms"],
        "rollback_triggers": ["Error rate > 1%", "Latency > 2s"]
      },
      {
        "phase": "Phase 2: Gradual rollout",
        "duration": "6 hours",
        "traffic_percentage": "100%",
        "success_criteria": ["All metrics normal"],
        "rollback_triggers": ["Critical errors detected"]
      }
    ],
    "rollback_readiness": "Automated rollback configured",
    "downtime_expected": false
  },
  "deployment_plan": {
    "environments": ["staging", "production"],
    "deployment_steps": [
      {
        "step": 1,
        "environment": "staging",
        "action": "Deploy to staging",
        "commands": ["kubectl apply -f k8s/staging/", "kubectl rollout status deployment/app"],
        "estimated_duration": "10 minutes",
        "validation": "Run smoke tests",
        "rollback_procedure": "kubectl rollout undo deployment/app",
        "responsible": "DevOps team"
      },
      {
        "step": 2,
        "environment": "staging",
        "action": "Validate staging deployment",
        "commands": ["npm run test:e2e", "npm run test:smoke"],
        "estimated_duration": "30 minutes",
        "validation": "All tests pass",
        "rollback_procedure": "If tests fail, investigate before production",
        "responsible": "QA team"
      },
      {
        "step": 3,
        "environment": "production",
        "action": "Backup production database",
        "commands": ["pg_dump production > backup-$(date +%Y%m%d).sql"],
        "estimated_duration": "15 minutes",
        "validation": "Backup file created and verified",
        "rollback_procedure": "N/A - prerequisite step",
        "responsible": "DBA"
      },
      {
        "step": 4,
        "environment": "production",
        "action": "Deploy to production (canary)",
        "commands": ["kubectl set image deployment/app app=app:v1.0.0", "kubectl rollout status deployment/app"],
        "estimated_duration": "20 minutes",
        "validation": "5% traffic routed to new version, metrics normal",
        "rollback_procedure": "kubectl rollout undo deployment/app",
        "responsible": "DevOps team"
      },
      {
        "step": 5,
        "environment": "production",
        "action": "Monitor canary deployment",
        "commands": [],
        "estimated_duration": "2 hours",
        "validation": "Error rate < 0.1%, latency normal, no alerts",
        "rollback_procedure": "Rollback if metrics exceed thresholds",
        "responsible": "DevOps + Engineering on-call"
      },
      {
        "step": 6,
        "environment": "production",
        "action": "Promote to 100% traffic",
        "commands": ["kubectl scale deployment/app-canary --replicas=0", "kubectl scale deployment/app --replicas=10"],
        "estimated_duration": "30 minutes",
        "validation": "All traffic on new version, metrics stable",
        "rollback_procedure": "Scale up old version, scale down new version",
        "responsible": "DevOps team"
      }
    ],
    "dependencies": [
      {
        "dependency": "Database migrations",
        "status": "complete",
        "notes": "Migrations compatible with both versions"
      },
      {
        "dependency": "Third-party services",
        "status": "verified",
        "notes": "All external APIs operational"
      }
    ]
  },
  "release_checklist": {
    "categories": ["code", "testing", "infrastructure", "documentation", "communication"],
    "items": [
      {
        "id": "CHK-001",
        "category": "code",
        "item": "All code merged to release branch",
        "required": true,
        "status": "pending|in_progress|complete",
        "owner": "Tech lead",
        "verification": "Check git log"
      },
      {
        "id": "CHK-002",
        "category": "testing",
        "item": "All tests passing",
        "required": true,
        "status": "pending",
        "owner": "QA lead",
        "verification": "CI/CD green, manual test results"
      },
      {
        "id": "CHK-003",
        "category": "testing",
        "item": "Performance tests completed",
        "required": true,
        "status": "pending",
        "owner": "QA lead",
        "verification": "Load test report shows acceptable performance"
      },
      {
        "id": "CHK-004",
        "category": "testing",
        "item": "Security scan completed",
        "required": true,
        "status": "pending",
        "owner": "Security team",
        "verification": "No critical or high vulnerabilities"
      },
      {
        "id": "CHK-005",
        "category": "infrastructure",
        "item": "Production backup completed",
        "required": true,
        "status": "pending",
        "owner": "DevOps",
        "verification": "Backup file exists and verified"
      },
      {
        "id": "CHK-006",
        "category": "infrastructure",
        "item": "Monitoring and alerts configured",
        "required": true,
        "status": "pending",
        "owner": "DevOps",
        "verification": "Grafana dashboards updated, PagerDuty configured"
      },
      {
        "id": "CHK-007",
        "category": "documentation",
        "item": "Release notes published",
        "required": true,
        "status": "pending",
        "owner": "Product manager",
        "verification": "Release notes in docs site"
      },
      {
        "id": "CHK-008",
        "category": "documentation",
        "item": "API documentation updated",
        "required": true,
        "status": "pending",
        "owner": "Tech writer",
        "verification": "API docs reflect all changes"
      },
      {
        "id": "CHK-009",
        "category": "communication",
        "item": "Stakeholders notified",
        "required": true,
        "status": "pending",
        "owner": "Product manager",
        "verification": "Email sent to stakeholder list"
      },
      {
        "id": "CHK-010",
        "category": "communication",
        "item": "Support team briefed",
        "required": true,
        "status": "pending",
        "owner": "Support manager",
        "verification": "Training session completed"
      }
    ],
    "completion_status": "0/10 complete"
  },
  "go_no_go_criteria": {
    "go_criteria": [
      {
        "criterion": "All critical and high priority bugs resolved",
        "status": "pending|met",
        "evidence": "Jira query shows 0 critical/high bugs"
      },
      {
        "criterion": "Test coverage >= 80%",
        "status": "pending",
        "evidence": "Coverage report"
      },
      {
        "criterion": "Performance benchmarks met",
        "status": "pending",
        "evidence": "Load test results within SLA"
      },
      {
        "criterion": "Security scan clear",
        "status": "pending",
        "evidence": "No critical vulnerabilities"
      },
      {
        "criterion": "Staging validation successful",
        "status": "pending",
        "evidence": "All staging tests pass"
      },
      {
        "criterion": "Rollback plan tested",
        "status": "pending",
        "evidence": "Rollback rehearsal completed"
      },
      {
        "criterion": "On-call team ready",
        "status": "pending",
        "evidence": "On-call schedule confirmed"
      }
    ],
    "no_go_criteria": [
      {
        "criterion": "Critical bugs outstanding",
        "action": "Postpone release until resolved"
      },
      {
        "criterion": "Production incidents in progress",
        "action": "Postpone until system stable"
      },
      {
        "criterion": "Insufficient test coverage",
        "action": "Add tests before proceeding"
      }
    ],
    "decision_makers": ["CTO", "VP Engineering", "Product Manager"],
    "decision_meeting": {
      "scheduled": "2025-11-14T16:00:00Z",
      "duration": "30 minutes",
      "required_attendees": ["Tech lead", "QA lead", "DevOps lead", "Product manager"]
    }
  },
  "rollback_plan": {
    "triggers": [
      {
        "trigger": "Error rate > 1%",
        "severity": "critical",
        "action": "Immediate rollback"
      },
      {
        "trigger": "Latency > 2 seconds (p95)",
        "severity": "high",
        "action": "Investigate, rollback if not resolved in 15 min"
      },
      {
        "trigger": "Customer-reported critical bugs",
        "severity": "high",
        "action": "Assess severity, rollback if widespread"
      }
    ],
    "rollback_procedure": [
      {
        "step": 1,
        "action": "Declare rollback decision",
        "responsible": "Incident commander",
        "communication": "Announce in #incidents Slack channel"
      },
      {
        "step": 2,
        "action": "Execute automated rollback",
        "responsible": "DevOps on-call",
        "commands": ["kubectl rollout undo deployment/app"],
        "estimated_duration": "5 minutes"
      },
      {
        "step": 3,
        "action": "Verify rollback success",
        "responsible": "DevOps on-call",
        "validation": "Old version serving traffic, metrics returning to normal",
        "estimated_duration": "10 minutes"
      },
      {
        "step": 4,
        "action": "Restore database if needed",
        "responsible": "DBA",
        "commands": ["psql production < backup-$(date +%Y%m%d).sql"],
        "notes": "Only if database changes are problematic",
        "estimated_duration": "30 minutes"
      },
      {
        "step": 5,
        "action": "Post-mortem",
        "responsible": "Engineering manager",
        "timing": "Within 24 hours",
        "deliverable": "Post-mortem document with root cause and prevention"
      }
    ],
    "rollback_testing": {
      "tested": true,
      "test_date": "2025-11-10",
      "test_results": "Rollback completed successfully in 8 minutes",
      "notes": "Tested in staging environment"
    }
  },
  "monitoring_plan": {
    "pre_deployment": [
      {
        "metric": "Baseline error rate",
        "current_value": "0.05%",
        "threshold": "0.1%",
        "action_if_exceeded": "Do not proceed with deployment"
      }
    ],
    "during_deployment": [
      {
        "metric": "Error rate",
        "threshold": "< 0.1%",
        "check_frequency": "Every 5 minutes",
        "alert": "PagerDuty if threshold exceeded",
        "dashboard": "https://grafana.example.com/d/deployment"
      },
      {
        "metric": "Response time (p95)",
        "threshold": "< 500ms",
        "check_frequency": "Every 5 minutes",
        "alert": "PagerDuty if threshold exceeded",
        "dashboard": "https://grafana.example.com/d/deployment"
      },
      {
        "metric": "CPU utilization",
        "threshold": "< 70%",
        "check_frequency": "Every 5 minutes",
        "alert": "Slack if threshold exceeded",
        "dashboard": "https://grafana.example.com/d/infrastructure"
      },
      {
        "metric": "Memory utilization",
        "threshold": "< 80%",
        "check_frequency": "Every 5 minutes",
        "alert": "Slack if threshold exceeded",
        "dashboard": "https://grafana.example.com/d/infrastructure"
      }
    ],
    "post_deployment": [
      {
        "metric": "24-hour error rate",
        "target": "Same as pre-deployment baseline",
        "monitoring_duration": "7 days",
        "reporting": "Daily report to engineering team"
      },
      {
        "metric": "User-reported bugs",
        "target": "< 5 P1/P2 bugs",
        "monitoring_duration": "14 days",
        "reporting": "Track in Jira, report in weekly meeting"
      }
    ],
    "dashboards": [
      {
        "dashboard": "Deployment Dashboard",
        "url": "https://grafana.example.com/d/deployment",
        "metrics": ["Error rate", "Latency", "Throughput", "Success rate"]
      },
      {
        "dashboard": "Infrastructure Dashboard",
        "url": "https://grafana.example.com/d/infra",
        "metrics": ["CPU", "Memory", "Disk", "Network"]
      }
    ],
    "alerts": [
      {
        "alert": "High Error Rate",
        "condition": "Error rate > 1% for 5 minutes",
        "severity": "critical",
        "notification": "PagerDuty",
        "escalation": "Page engineering manager after 15 minutes"
      }
    ]
  },
  "communication_plan": {
    "pre_release": [
      {
        "audience": "Engineering team",
        "message": "Release v1.0.0 scheduled for Nov 15, 2am UTC",
        "channel": "Slack #engineering",
        "timing": "1 week before",
        "owner": "Tech lead"
      },
      {
        "audience": "Customer success",
        "message": "New features training and FAQ",
        "channel": "Training session + wiki",
        "timing": "3 days before",
        "owner": "Product manager"
      },
      {
        "audience": "Customers",
        "message": "Upcoming release announcement",
        "channel": "Email + in-app notification",
        "timing": "2 days before",
        "owner": "Marketing"
      }
    ],
    "during_release": [
      {
        "audience": "Internal teams",
        "message": "Deployment progress updates",
        "channel": "Slack #releases",
        "frequency": "Every 30 minutes",
        "owner": "DevOps on-call"
      }
    ],
    "post_release": [
      {
        "audience": "All company",
        "message": "Release complete and successful",
        "channel": "Slack #general + Email",
        "timing": "Within 1 hour of completion",
        "owner": "CTO"
      },
      {
        "audience": "Customers",
        "message": "New features available",
        "channel": "Email + blog post + in-app",
        "timing": "Same day",
        "owner": "Marketing + Product"
      },
      {
        "audience": "Engineering team",
        "message": "Post-deployment metrics and lessons learned",
        "channel": "Wiki + team meeting",
        "timing": "Within 3 days",
        "owner": "Tech lead"
      }
    ],
    "escalation_contacts": [
      {
        "role": "Engineering on-call",
        "contact": "PagerDuty",
        "availability": "24/7"
      },
      {
        "role": "Engineering manager",
        "contact": "Phone",
        "availability": "During deployment window"
      },
      {
        "role": "CTO",
        "contact": "Phone",
        "availability": "For critical escalations"
      }
    ]
  },
  "post_release_activities": {
    "immediate": [
      {
        "activity": "Monitor production metrics",
        "duration": "4 hours",
        "responsible": "DevOps on-call",
        "success_criteria": "All metrics within normal range"
      },
      {
        "activity": "Verify key user flows",
        "duration": "1 hour",
        "responsible": "QA lead",
        "success_criteria": "All critical paths working"
      }
    ],
    "first_24_hours": [
      {
        "activity": "Monitor error logs and user reports",
        "responsible": "Engineering on-call + Support",
        "action": "Triage and fix critical issues"
      },
      {
        "activity": "Gather initial feedback",
        "responsible": "Product manager",
        "action": "Reach out to beta users, monitor social media"
      }
    ],
    "first_week": [
      {
        "activity": "Post-deployment review",
        "timing": "3 days after release",
        "attendees": ["Engineering", "Product", "QA", "DevOps"],
        "agenda": ["Metrics review", "Issues encountered", "Process improvements"]
      },
      {
        "activity": "Feature adoption analysis",
        "responsible": "Product analytics",
        "deliverable": "Report on feature usage and adoption"
      }
    ],
    "lessons_learned": {
      "template": {
        "what_went_well": ["Success 1", "Success 2"],
        "what_went_wrong": ["Issue 1", "Issue 2"],
        "action_items": ["Action 1", "Action 2"],
        "process_improvements": ["Improvement 1"]
      },
      "due_date": "Within 1 week",
      "owner": "Engineering manager",
      "distribution": "Share with all teams"
    }
  },
  "runbook": {
    "common_issues": [
      {
        "issue": "Deployment stuck",
        "symptoms": ["Rollout not progressing", "Pods in CrashLoopBackOff"],
        "diagnosis": "Check pod logs: kubectl logs deployment/app",
        "resolution": "Fix configuration issue or rollback",
        "escalation": "Page DevOps lead if not resolved in 15 min"
      },
      {
        "issue": "High error rate post-deployment",
        "symptoms": ["Error rate > 1%", "Customer reports"],
        "diagnosis": "Check error logs and APM",
        "resolution": "Identify and fix issue or rollback",
        "escalation": "Page engineering manager for rollback decision"
      }
    ],
    "useful_commands": [
      {
        "command": "kubectl get pods",
        "purpose": "Check pod status"
      },
      {
        "command": "kubectl logs -f deployment/app",
        "purpose": "View application logs"
      },
      {
        "command": "kubectl rollout status deployment/app",
        "purpose": "Check deployment progress"
      },
      {
        "command": "kubectl rollout undo deployment/app",
        "purpose": "Rollback to previous version"
      }
    ],
    "emergency_contacts": [
      {
        "role": "DevOps on-call",
        "method": "PagerDuty",
        "response_time": "5 minutes"
      },
      {
        "role": "Engineering manager",
        "method": "Phone",
        "response_time": "15 minutes"
      }
    ]
  },
  "risks_and_mitigation": [
    {
      "risk": "Database migration fails",
      "probability": "low",
      "impact": "critical",
      "mitigation": "Test migrations in staging, have rollback migration ready",
      "contingency": "Rollback deployment and revert migration"
    },
    {
      "risk": "Performance degradation",
      "probability": "medium",
      "impact": "high",
      "mitigation": "Load testing before release, gradual rollout",
      "contingency": "Rollback if metrics exceed thresholds"
    },
    {
      "risk": "Third-party API outage",
      "probability": "low",
      "impact": "medium",
      "mitigation": "Check service status before deployment",
      "contingency": "Postpone deployment if critical services down"
    }
  ]
}`;
  }

  private getSystemPrompt(): string {
    return `You are a DevOps and release management expert specializing in:
- Deployment strategies (blue-green, canary, rolling)
- Release planning and coordination
- Production operations and monitoring
- Incident response and rollback procedures
- Risk management and mitigation
- Communication and stakeholder management
- Post-deployment validation

Create comprehensive, executable release plans that:
- Minimize deployment risk
- Enable rapid rollback if needed
- Ensure clear communication
- Include detailed monitoring and validation
- Account for edge cases and failures
- Follow industry best practices

Be specific with commands, scripts, and procedures.`;
  }
}
