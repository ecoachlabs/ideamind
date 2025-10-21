import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Telemetry Event
 */
interface TelemetryEvent {
  category: 'user-action' | 'performance' | 'error' | 'business' | 'system';
  name: string;
  description: string;
  properties: {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object';
    required: boolean;
    description: string;
  }[];
  frequency: 'high' | 'medium' | 'low';
  privacy: {
    pii: boolean;
    anonymized: boolean;
    retention: number; // days
  };
}

/**
 * Analytics Platform
 */
interface AnalyticsPlatform {
  platform: 'mixpanel' | 'amplitude' | 'segment' | 'google-analytics' | 'posthog' | 'custom';
  name: string;
  purpose: string;
  events: string[];
  setup: {
    sdk: string;
    apiKey: string;
    configuration: { [key: string]: any };
  };
  cost: {
    tier: 'free' | 'paid';
    estimatedMonthlyCost: number;
  };
}

/**
 * Performance Metrics
 */
interface PerformanceMetrics {
  metric: string;
  target: number;
  unit: string;
  measurement: string;
  frequency: 'real-time' | 'minutely' | 'hourly';
  alerting: {
    enabled: boolean;
    threshold: number;
    severity: 'critical' | 'warning';
  };
}

/**
 * Error Tracking
 */
interface ErrorTracking {
  platform: 'sentry' | 'bugsnag' | 'rollbar' | 'raygun' | 'custom';
  configuration: {
    environment: string;
    sampleRate: number; // 0-1
    beforeSend: string;
    ignoreErrors: string[];
  };
  alerting: {
    criticalErrors: string[];
    notifications: string[];
  };
  sourceMapUploading: boolean;
}

/**
 * User Behavior Tracking
 */
interface UserBehaviorTracking {
  featureName: string;
  trackingMethod: 'event' | 'pageview' | 'session' | 'heatmap';
  events: string[];
  funnels: {
    name: string;
    steps: string[];
    expectedConversion: number; // percentage
  }[];
  cohorts: {
    name: string;
    definition: string;
    size: number;
  }[];
}

/**
 * Data Pipeline
 */
interface DataPipeline {
  source: string;
  destination: string;
  transformations: string[];
  schedule: string;
  retentionPolicy: {
    rawData: number; // days
    aggregated: number; // days
    backups: boolean;
  };
}

/**
 * Privacy Configuration
 */
interface PrivacyConfiguration {
  gdprCompliant: boolean;
  ccpaCompliant: boolean;
  dataMinimization: boolean;
  anonymization: {
    ipAddresses: boolean;
    userIds: boolean;
    sensitiveFields: string[];
  };
  userConsent: {
    required: boolean;
    granular: boolean;
    optOut: boolean;
  };
  dataRetention: {
    policy: string;
    automaticDeletion: boolean;
    exportCapability: boolean;
  };
}

/**
 * Custom Metrics
 */
interface CustomMetric {
  name: string;
  calculation: string;
  unit: string;
  category: 'product' | 'business' | 'technical';
  dashboard: string;
  alertThreshold?: number;
}

/**
 * A/B Testing Configuration
 */
interface ABTestingConfig {
  platform: 'optimizely' | 'launchdarkly' | 'split' | 'growthbook' | 'custom';
  experiments: {
    name: string;
    hypothesis: string;
    variants: string[];
    targetAudience: string;
    successMetric: string;
    duration: number; // days
  }[];
  featureFlags: {
    flag: string;
    purpose: string;
    rolloutStrategy: string;
  }[];
}

/**
 * Telemetry Collection Report
 */
interface TelemetryCollectionReport {
  summary: {
    totalEvents: number;
    totalPlatforms: number;
    estimatedDataVolume: number; // MB per day
    privacyCompliant: boolean;
    setupComplexity: 'low' | 'medium' | 'high';
  };
  events: TelemetryEvent[];
  platforms: AnalyticsPlatform[];
  performance: {
    metrics: PerformanceMetrics[];
    monitoring: {
      tool: string;
      dashboards: string[];
      alerts: number;
    };
  };
  errorTracking: ErrorTracking;
  userBehavior: UserBehaviorTracking[];
  dataPipeline: DataPipeline[];
  privacy: PrivacyConfiguration;
  customMetrics: CustomMetric[];
  abTesting: ABTestingConfig;
  implementation: {
    sdks: {
      platform: string;
      package: string;
      version: string;
      integration: string[];
    }[];
    backendIntegration: {
      required: boolean;
      endpoints: string[];
      authentication: string;
    };
    mobileIntegration: {
      ios: boolean;
      android: boolean;
      crossPlatform: boolean;
    };
  };
  dataGovernance: {
    dataOwner: string;
    accessControl: string;
    auditLog: boolean;
    complianceReview: boolean;
  };
  recommendations: {
    priority: 'immediate' | 'high' | 'medium' | 'low';
    recommendation: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
    category: 'data-quality' | 'privacy' | 'performance' | 'cost';
  }[];
}

/**
 * TelemetryCollectorAgent
 *
 * Designs comprehensive telemetry and analytics collection strategy:
 * - Event tracking schema design
 * - Analytics platform selection and setup
 * - Performance metrics collection
 * - Error and crash tracking configuration
 * - User behavior analytics
 * - Data pipeline architecture
 * - Privacy-compliant data collection
 * - Custom metrics and KPIs
 * - A/B testing infrastructure
 * - Data governance policies
 *
 * Provides privacy-respecting, actionable telemetry strategy for
 * beta program success measurement and product insights.
 *
 * Input: Beta distribution plan + Release complete + PRD
 * Output: Comprehensive telemetry collection strategy
 */
export class TelemetryCollectorAgent extends BaseAgent {
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
        'Design event tracking schema',
        'Select analytics platforms and tools',
        'Configure privacy-compliant data collection',
        'Set up monitoring and alerting',
      ],
      estimatedTotalDurationMs: 13000, // ~13 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildTelemetryPrompt(input);

      this.logger.info('Invoking LLM for telemetry collection strategy');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const telemetryReport = this.parseTelemetryReport(content);

      return {
        reasoning: `Telemetry strategy designed with ${telemetryReport.summary.totalEvents} tracked events across ${telemetryReport.summary.totalPlatforms} platforms. Estimated data volume: ${telemetryReport.summary.estimatedDataVolume}MB/day. Privacy compliant: ${telemetryReport.summary.privacyCompliant}.`,
        confidence: 0.87,
        intermediate: {
          telemetryReport,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for telemetry collection', { error });
      return this.fallback(input);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const telemetryReport = result.intermediate?.telemetryReport;

    return [
      {
        type: 'telemetry-collection-plan',
        content: telemetryReport,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildTelemetryPrompt(input: any): string {
    const { previousArtifacts, ideaSpec } = input;

    // Extract context
    const betaDistribution = previousArtifacts?.find((a: any) => a.type === 'beta-distribution-plan')?.content;
    const releaseComplete = previousArtifacts?.find((a: any) => a.type === 'release-complete')?.content;
    const prdComplete = previousArtifacts?.find((a: any) => a.type === 'prd-complete')?.content;

    const projectTitle = ideaSpec?.title || 'Project';
    const totalTesters = betaDistribution?.summary?.totalTesters || 100;
    const complianceReqs = ideaSpec?.constraints?.complianceRequirements || [];

    return `You are a Data Engineer and Product Analytics Specialist.

PROJECT CONTEXT:
Project: ${projectTitle}
Beta Testers: ${totalTesters}
Compliance Requirements: ${complianceReqs.join(', ') || 'None'}

BETA METRICS TO TRACK:
${betaDistribution?.metrics?.slice(0, 5).map((m: any) => `- ${m.metric}: Target ${m.target}`).join('\n') || 'Standard metrics'}

TASK:
Design comprehensive telemetry and analytics collection strategy. Your response MUST be valid JSON:

{
  "summary": {
    "totalEvents": 45,
    "totalPlatforms": 3,
    "estimatedDataVolume": 150,
    "privacyCompliant": true,
    "setupComplexity": "medium"
  },
  "events": [
    {
      "category": "user-action",
      "name": "feature_used",
      "description": "User interacts with a key feature",
      "properties": [
        {"name": "feature_name", "type": "string", "required": true, "description": "Name of the feature"},
        {"name": "duration_seconds", "type": "number", "required": false, "description": "How long feature was used"},
        {"name": "success", "type": "boolean", "required": true, "description": "Whether action completed successfully"}
      ],
      "frequency": "high",
      "privacy": {"pii": false, "anonymized": true, "retention": 90}
    },
    {
      "category": "performance",
      "name": "page_load_time",
      "description": "Time taken to load a page",
      "properties": [
        {"name": "page", "type": "string", "required": true, "description": "Page identifier"},
        {"name": "load_time_ms", "type": "number", "required": true, "description": "Load time in milliseconds"},
        {"name": "cached", "type": "boolean", "required": false, "description": "Whether page was cached"}
      ],
      "frequency": "high",
      "privacy": {"pii": false, "anonymized": true, "retention": 30}
    },
    {
      "category": "error",
      "name": "error_occurred",
      "description": "Application error or exception",
      "properties": [
        {"name": "error_type", "type": "string", "required": true, "description": "Type of error"},
        {"name": "error_message", "type": "string", "required": true, "description": "Error message"},
        {"name": "stack_trace", "type": "string", "required": false, "description": "Stack trace (sanitized)"},
        {"name": "user_affected", "type": "boolean", "required": true, "description": "Whether user saw error"}
      ],
      "frequency": "low",
      "privacy": {"pii": false, "anonymized": true, "retention": 90}
    },
    {
      "category": "business",
      "name": "conversion_event",
      "description": "User completes important action",
      "properties": [
        {"name": "event_type", "type": "string", "required": true, "description": "Type of conversion"},
        {"name": "value", "type": "number", "required": false, "description": "Monetary value if applicable"}
      ],
      "frequency": "low",
      "privacy": {"pii": false, "anonymized": true, "retention": 365}
    }
  ],
  "platforms": [
    {
      "platform": "mixpanel",
      "name": "Mixpanel Product Analytics",
      "purpose": "User behavior and funnel tracking",
      "events": ["feature_used", "conversion_event", "user_journey"],
      "setup": {
        "sdk": "@mixpanel/mixpanel-js",
        "apiKey": "MIXPANEL_PROJECT_TOKEN",
        "configuration": {
          "track_pageview": true,
          "persistence": "localStorage",
          "ip": false,
          "property_blacklist": ["$email", "$phone"]
        }
      },
      "cost": {"tier": "free", "estimatedMonthlyCost": 0}
    },
    {
      "platform": "sentry",
      "name": "Sentry Error Tracking",
      "purpose": "Error and crash monitoring",
      "events": ["error_occurred", "crash"],
      "setup": {
        "sdk": "@sentry/browser",
        "apiKey": "SENTRY_DSN",
        "configuration": {
          "environment": "beta",
          "sampleRate": 1.0,
          "tracesSampleRate": 0.1
        }
      },
      "cost": {"tier": "paid", "estimatedMonthlyCost": 26}
    },
    {
      "platform": "google-analytics",
      "name": "Google Analytics 4",
      "purpose": "Web analytics and traffic analysis",
      "events": ["page_view", "session_start", "conversion_event"],
      "setup": {
        "sdk": "gtag.js",
        "apiKey": "GA_MEASUREMENT_ID",
        "configuration": {
          "anonymize_ip": true,
          "cookie_flags": "SameSite=None;Secure"
        }
      },
      "cost": {"tier": "free", "estimatedMonthlyCost": 0}
    }
  ],
  "performance": {
    "metrics": [
      {
        "metric": "Page Load Time (p95)",
        "target": 2000,
        "unit": "milliseconds",
        "measurement": "Real User Monitoring",
        "frequency": "real-time",
        "alerting": {"enabled": true, "threshold": 5000, "severity": "warning"}
      },
      {
        "metric": "Time to Interactive",
        "target": 3000,
        "unit": "milliseconds",
        "measurement": "Lighthouse API",
        "frequency": "hourly",
        "alerting": {"enabled": true, "threshold": 8000, "severity": "warning"}
      },
      {
        "metric": "API Response Time (p95)",
        "target": 500,
        "unit": "milliseconds",
        "measurement": "APM",
        "frequency": "real-time",
        "alerting": {"enabled": true, "threshold": 2000, "severity": "critical"}
      },
      {
        "metric": "Error Rate",
        "target": 0.1,
        "unit": "percentage",
        "measurement": "Error tracking",
        "frequency": "real-time",
        "alerting": {"enabled": true, "threshold": 1.0, "severity": "critical"}
      }
    ],
    "monitoring": {
      "tool": "New Relic",
      "dashboards": ["Performance Overview", "Error Analysis", "User Sessions"],
      "alerts": 8
    }
  },
  "errorTracking": {
    "platform": "sentry",
    "configuration": {
      "environment": "beta",
      "sampleRate": 1.0,
      "beforeSend": "sanitizeErrorData",
      "ignoreErrors": ["ResizeObserver loop limit exceeded", "Non-Error promise rejection"]
    },
    "alerting": {
      "criticalErrors": ["DatabaseConnectionError", "AuthenticationFailure", "PaymentProcessingError"],
      "notifications": ["email", "slack", "pagerduty"]
    },
    "sourceMapUploading": true
  },
  "userBehavior": [
    {
      "featureName": "Onboarding Flow",
      "trackingMethod": "funnel",
      "events": ["onboarding_started", "profile_completed", "first_action", "onboarding_completed"],
      "funnels": [
        {
          "name": "User Onboarding",
          "steps": ["Sign up", "Profile creation", "First feature use", "Complete onboarding"],
          "expectedConversion": 70
        }
      ],
      "cohorts": [
        {
          "name": "Day 1 Users",
          "definition": "Users who signed up today",
          "size": 50
        }
      ]
    },
    {
      "featureName": "Core Product Feature",
      "trackingMethod": "event",
      "events": ["feature_discovered", "feature_used", "feature_shared"],
      "funnels": [
        {
          "name": "Feature Adoption",
          "steps": ["Feature viewed", "Feature activated", "Feature used 3+ times"],
          "expectedConversion": 60
        }
      ],
      "cohorts": []
    }
  ],
  "dataPipeline": [
    {
      "source": "Mixpanel Events",
      "destination": "Data Warehouse (BigQuery)",
      "transformations": ["Deduplication", "PII removal", "Event normalization"],
      "schedule": "Hourly",
      "retentionPolicy": {"rawData": 90, "aggregated": 730, "backups": true}
    },
    {
      "source": "Sentry Errors",
      "destination": "Error Dashboard",
      "transformations": ["Grouping by error type", "Stack trace sanitization"],
      "schedule": "Real-time",
      "retentionPolicy": {"rawData": 90, "aggregated": 365, "backups": true}
    }
  ],
  "privacy": {
    "gdprCompliant": true,
    "ccpaCompliant": true,
    "dataMinimization": true,
    "anonymization": {
      "ipAddresses": true,
      "userIds": true,
      "sensitiveFields": ["email", "phone", "address"]
    },
    "userConsent": {
      "required": true,
      "granular": true,
      "optOut": true
    },
    "dataRetention": {
      "policy": "Delete after 90 days, aggregated data retained for 2 years",
      "automaticDeletion": true,
      "exportCapability": true
    }
  },
  "customMetrics": [
    {
      "name": "Daily Active Beta Testers",
      "calculation": "COUNT(DISTINCT user_id WHERE last_active_date = TODAY)",
      "unit": "users",
      "category": "product",
      "dashboard": "Beta Health",
      "alertThreshold": 250
    },
    {
      "name": "Feature Adoption Rate",
      "calculation": "(users_who_used_feature / total_active_users) * 100",
      "unit": "percentage",
      "category": "product",
      "dashboard": "Feature Analytics"
    },
    {
      "name": "Beta Feedback Score",
      "calculation": "AVG(feedback_rating) WHERE feedback_date >= beta_start",
      "unit": "score (1-5)",
      "category": "business",
      "dashboard": "Beta Health",
      "alertThreshold": 3.5
    }
  ],
  "abTesting": {
    "platform": "launchdarkly",
    "experiments": [
      {
        "name": "New Onboarding Flow",
        "hypothesis": "Guided onboarding increases feature adoption by 20%",
        "variants": ["control", "guided_onboarding"],
        "targetAudience": "New beta users",
        "successMetric": "features_used_in_first_week",
        "duration": 14
      }
    ],
    "featureFlags": [
      {
        "flag": "enable_advanced_features",
        "purpose": "Gradual rollout of advanced features to beta users",
        "rolloutStrategy": "Percentage-based (start 10%, increase 20% weekly)"
      }
    ]
  },
  "implementation": {
    "sdks": [
      {"platform": "Web", "package": "@mixpanel/mixpanel-js", "version": "2.47.0", "integration": ["React hooks", "Redux middleware"]},
      {"platform": "Web", "package": "@sentry/browser", "version": "7.80.0", "integration": ["Error boundary", "Performance monitoring"]},
      {"platform": "iOS", "package": "Mixpanel-swift", "version": "4.0.0", "integration": ["SwiftUI", "App lifecycle"]},
      {"platform": "Android", "package": "mixpanel-android", "version": "7.3.0", "integration": ["Jetpack Compose", "App lifecycle"]}
    ],
    "backendIntegration": {
      "required": true,
      "endpoints": ["/api/telemetry/events", "/api/telemetry/performance"],
      "authentication": "JWT token"
    },
    "mobileIntegration": {
      "ios": true,
      "android": true,
      "crossPlatform": false
    }
  },
  "dataGovernance": {
    "dataOwner": "Product Team",
    "accessControl": "Role-based (Admin, Analyst, Viewer)",
    "auditLog": true,
    "complianceReview": true
  },
  "recommendations": [
    {
      "priority": "high",
      "recommendation": "Implement consent management for GDPR compliance",
      "impact": "Legal compliance, user trust",
      "effort": "medium",
      "category": "privacy"
    },
    {
      "priority": "high",
      "recommendation": "Set up real-time alerting for critical errors",
      "impact": "Faster bug response, better UX",
      "effort": "low",
      "category": "performance"
    },
    {
      "priority": "medium",
      "recommendation": "Create data pipeline for long-term analytics",
      "impact": "Better insights, historical analysis",
      "effort": "high",
      "category": "data-quality"
    },
    {
      "priority": "medium",
      "recommendation": "Implement session replay for debugging",
      "impact": "Faster bug reproduction, better UX understanding",
      "effort": "medium",
      "category": "data-quality"
    }
  ]
}

REQUIREMENTS:
- Design 30-50 tracked events covering user actions, performance, errors
- Select 2-3 analytics platforms based on needs
- Configure comprehensive performance monitoring
- Set up error and crash tracking
- Define user behavior funnels and cohorts
- Ensure full GDPR/CCPA privacy compliance
- Design data pipeline for long-term storage
- Include custom metrics for beta success
- Provide A/B testing infrastructure
- Give implementation guidance for all platforms

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parseTelemetryReport(text: string): TelemetryCollectionReport {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed as TelemetryCollectionReport;
    } catch (error) {
      this.logger.error('Failed to parse telemetry collection report', { error });
      throw error;
    }
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback telemetry collection report');

    const telemetryReport: TelemetryCollectionReport = {
      summary: {
        totalEvents: 20,
        totalPlatforms: 2,
        estimatedDataVolume: 50,
        privacyCompliant: true,
        setupComplexity: 'medium',
      },
      events: [
        {
          category: 'user-action',
          name: 'feature_used',
          description: 'User uses a feature',
          properties: [
            { name: 'feature', type: 'string', required: true, description: 'Feature name' },
          ],
          frequency: 'high',
          privacy: { pii: false, anonymized: true, retention: 90 },
        },
      ],
      platforms: [
        {
          platform: 'google-analytics',
          name: 'Google Analytics',
          purpose: 'Web analytics',
          events: ['pageview'],
          setup: {
            sdk: 'gtag.js',
            apiKey: 'GA_ID',
            configuration: {},
          },
          cost: { tier: 'free', estimatedMonthlyCost: 0 },
        },
      ],
      performance: {
        metrics: [
          {
            metric: 'Page Load Time',
            target: 2000,
            unit: 'ms',
            measurement: 'Browser timing',
            frequency: 'real-time',
            alerting: { enabled: true, threshold: 5000, severity: 'warning' },
          },
        ],
        monitoring: {
          tool: 'Browser DevTools',
          dashboards: ['Performance'],
          alerts: 1,
        },
      },
      errorTracking: {
        platform: 'sentry',
        configuration: {
          environment: 'beta',
          sampleRate: 1.0,
          beforeSend: 'sanitize',
          ignoreErrors: [],
        },
        alerting: {
          criticalErrors: [],
          notifications: ['email'],
        },
        sourceMapUploading: false,
      },
      userBehavior: [],
      dataPipeline: [],
      privacy: {
        gdprCompliant: true,
        ccpaCompliant: false,
        dataMinimization: true,
        anonymization: {
          ipAddresses: true,
          userIds: false,
          sensitiveFields: [],
        },
        userConsent: {
          required: false,
          granular: false,
          optOut: true,
        },
        dataRetention: {
          policy: '90 days',
          automaticDeletion: false,
          exportCapability: false,
        },
      },
      customMetrics: [],
      abTesting: {
        platform: 'custom',
        experiments: [],
        featureFlags: [],
      },
      implementation: {
        sdks: [],
        backendIntegration: {
          required: false,
          endpoints: [],
          authentication: 'none',
        },
        mobileIntegration: {
          ios: false,
          android: false,
          crossPlatform: false,
        },
      },
      dataGovernance: {
        dataOwner: 'Product Team',
        accessControl: 'Open',
        auditLog: false,
        complianceReview: false,
      },
      recommendations: [
        {
          priority: 'medium',
          recommendation: 'Set up basic analytics',
          impact: 'Better insights',
          effort: 'low',
          category: 'data-quality',
        },
      ],
    };

    return {
      reasoning: 'Using fallback telemetry collection report as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        telemetryReport,
      },
    };
  }
}
