import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Deployment Target
 */
interface DeploymentTarget {
  id: string;
  name: string;
  provider: 'aws' | 'azure' | 'gcp' | 'vercel' | 'netlify' | 'heroku' | 'digitalocean' | 'kubernetes';
  environment: 'development' | 'staging' | 'production';
  region: string;
  url?: string;
  status: 'planned' | 'provisioning' | 'ready' | 'deployed' | 'failed';
}

/**
 * Infrastructure Specification
 */
interface InfrastructureSpec {
  compute: {
    type: 'container' | 'serverless' | 'vm' | 'kubernetes';
    service: string;
    instances: number;
    cpu: string;
    memory: string;
    autoscaling: {
      enabled: boolean;
      min?: number;
      max?: number;
      targetCPU?: number;
    };
  };
  networking: {
    vpc?: string;
    subnets?: string[];
    loadBalancer?: {
      type: 'alb' | 'nlb' | 'cloudflare';
      ssl: boolean;
      healthCheck: string;
    };
    cdn?: {
      provider: string;
      caching: boolean;
      edgeLocations: number;
    };
  };
  storage: {
    database?: {
      type: 'postgres' | 'mysql' | 'mongodb' | 'dynamodb';
      size: string;
      backup: boolean;
      multiAZ: boolean;
    };
    objectStorage?: {
      provider: string;
      buckets: string[];
      publicAccess: boolean;
    };
    cache?: {
      type: 'redis' | 'memcached';
      size: string;
    };
  };
  monitoring: {
    logging: {
      provider: string;
      retention: number; // days
    };
    metrics: {
      provider: string;
      dashboards: string[];
    };
    alerting: {
      enabled: boolean;
      channels: string[];
    };
  };
}

/**
 * Deployment Strategy
 */
interface DeploymentStrategy {
  type: 'rolling' | 'blue-green' | 'canary' | 'recreate';
  rollbackOnFailure: boolean;
  healthCheckGracePeriod: number; // seconds
  stages?: {
    name: string;
    percentage: number; // traffic percentage
    duration: number; // minutes
    successCriteria: string[];
  }[];
}

/**
 * CI/CD Pipeline
 */
interface CICDPipeline {
  provider: 'github-actions' | 'gitlab-ci' | 'circleci' | 'jenkins' | 'azure-devops';
  triggers: string[];
  stages: {
    name: string;
    steps: string[];
    duration: number; // estimated seconds
    dependencies?: string[];
  }[];
  secrets: string[];
  environments: {
    name: string;
    approvalRequired: boolean;
    protectedBranches: string[];
  }[];
}

/**
 * Rollback Plan
 */
interface RollbackPlan {
  automatic: boolean;
  triggers: string[];
  steps: string[];
  estimatedTime: number; // seconds
  dataRecovery: {
    required: boolean;
    backupLocation?: string;
    procedure?: string;
  };
}

/**
 * Cost Estimate
 */
interface CostEstimate {
  monthly: {
    compute: number;
    storage: number;
    networking: number;
    monitoring: number;
    other: number;
    total: number;
  };
  currency: string;
  assumptions: string[];
  scalingImpact: {
    users: number;
    estimatedCost: number;
  }[];
}

/**
 * Security Configuration
 */
interface SecurityConfiguration {
  encryption: {
    atRest: boolean;
    inTransit: boolean;
    keyManagement: string;
  };
  accessControl: {
    iam: boolean;
    rbac: boolean;
    mfa: boolean;
  };
  compliance: {
    standards: string[];
    certifications: string[];
  };
  secrets: {
    management: string;
    rotation: boolean;
  };
  networking: {
    firewall: boolean;
    ddosProtection: boolean;
    waf: boolean;
  };
}

/**
 * Deployment Report
 */
interface DeploymentReport {
  summary: {
    totalTargets: number;
    readyTargets: number;
    estimatedDeploymentTime: number; // seconds
    estimatedMonthlyCost: number;
    deploymentStatus: 'planned' | 'in-progress' | 'completed' | 'failed';
  };
  targets: DeploymentTarget[];
  infrastructure: InfrastructureSpec;
  strategy: DeploymentStrategy;
  cicd: CICDPipeline;
  rollback: RollbackPlan;
  costEstimate: CostEstimate;
  security: SecurityConfiguration;
  dns: {
    provider: string;
    records: {
      type: string;
      name: string;
      value: string;
    }[];
  };
  ssl: {
    provider: string;
    certificates: string[];
    autoRenewal: boolean;
  };
  monitoring: {
    uptime: {
      provider: string;
      checkInterval: number;
      locations: string[];
    };
    performance: {
      apm: string;
      errorTracking: string;
      logAggregation: string;
    };
    alerts: {
      critical: string[];
      warning: string[];
      channels: string[];
    };
  };
  documentation: {
    runbooks: string[];
    diagrams: string[];
    troubleshooting: string[];
  };
  recommendations: {
    priority: 'immediate' | 'high' | 'medium' | 'low';
    recommendation: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
    category: 'cost' | 'performance' | 'security' | 'reliability';
  }[];
}

/**
 * DeployerAgent
 *
 * Designs and executes deployment strategies for various platforms:
 * - Cloud infrastructure provisioning (AWS, Azure, GCP)
 * - Platform-as-a-Service deployments (Vercel, Netlify, Heroku)
 * - Kubernetes cluster configuration
 * - CI/CD pipeline setup (GitHub Actions, GitLab CI, CircleCI)
 * - Blue-green and canary deployment strategies
 * - Infrastructure-as-Code generation (Terraform, CloudFormation)
 * - DNS and SSL certificate configuration
 * - Monitoring and alerting setup
 * - Cost estimation and optimization
 * - Rollback procedures and disaster recovery
 *
 * Provides comprehensive deployment plans optimized for reliability,
 * performance, and cost-effectiveness.
 *
 * Input: Packaging report + Infrastructure plan + Architecture spec
 * Output: Complete deployment strategy with IaC templates
 */
export class DeployerAgent extends BaseAgent {
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
        'Analyze infrastructure requirements',
        'Design deployment strategy and target platforms',
        'Generate CI/CD pipeline configuration',
        'Create monitoring and rollback procedures',
      ],
      estimatedTotalDurationMs: 15000, // ~15 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildDeploymentPrompt(input);

      this.logger.info('Invoking LLM for deployment strategy');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const deploymentReport = this.parseDeploymentReport(content);

      return {
        reasoning: `Deployment strategy designed for ${deploymentReport.summary.totalTargets} target environments. Estimated monthly cost: $${deploymentReport.summary.estimatedMonthlyCost}. Deployment time: ~${Math.round(deploymentReport.summary.estimatedDeploymentTime / 60)} minutes.`,
        confidence: 0.87,
        intermediate: {
          deploymentReport,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for deployment strategy', { error });
      return this.fallback(input);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const deploymentReport = result.intermediate?.deploymentReport;

    return [
      {
        type: 'deployment-plan',
        content: deploymentReport,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildDeploymentPrompt(input: any): string {
    const { previousArtifacts } = input;

    // Extract context
    const packagingReport = previousArtifacts?.find((a: any) => a.type === 'packaging-report')?.content;
    const infrastructurePlan = previousArtifacts?.find((a: any) => a.type === 'infrastructure-plan')?.content;
    const systemArchitecture = previousArtifacts?.find((a: any) => a.type === 'system-architecture')?.content;
    const repoBlueprint = previousArtifacts?.find((a: any) => a.type === 'repository-blueprint')?.content;

    const framework = repoBlueprint?.overview?.framework || 'React';
    const architectureStyle = systemArchitecture?.overview?.architectureStyle || 'monolithic';
    const totalPackages = packagingReport?.summary?.totalPackages || 1;
    const cloudProvider = infrastructurePlan?.infrastructure?.cloudProvider || 'AWS';

    return `You are a Senior DevOps Architect and Cloud Infrastructure Specialist.

PROJECT CONTEXT:
Framework: ${framework}
Architecture: ${architectureStyle}
Total Packages: ${totalPackages}
Preferred Cloud Provider: ${cloudProvider}

PACKAGING SUMMARY:
${packagingReport?.packages?.map((p: any) => `- ${p.name} (${p.type}): ${Math.round(p.size / 1024 / 1024)}MB`).join('\n') || 'Standard packages'}

TASK:
Design comprehensive deployment strategy and infrastructure configuration. Your response MUST be valid JSON:

{
  "summary": {
    "totalTargets": 3,
    "readyTargets": 3,
    "estimatedDeploymentTime": 900,
    "estimatedMonthlyCost": 450,
    "deploymentStatus": "planned"
  },
  "targets": [
    {
      "id": "target-dev",
      "name": "Development",
      "provider": "aws",
      "environment": "development",
      "region": "us-east-1",
      "url": "https://dev.example.com",
      "status": "ready"
    },
    {
      "id": "target-staging",
      "name": "Staging",
      "provider": "aws",
      "environment": "staging",
      "region": "us-east-1",
      "url": "https://staging.example.com",
      "status": "ready"
    },
    {
      "id": "target-prod",
      "name": "Production",
      "provider": "aws",
      "environment": "production",
      "region": "us-east-1",
      "url": "https://example.com",
      "status": "ready"
    }
  ],
  "infrastructure": {
    "compute": {
      "type": "container",
      "service": "AWS ECS Fargate",
      "instances": 3,
      "cpu": "1 vCPU",
      "memory": "2 GB",
      "autoscaling": {
        "enabled": true,
        "min": 2,
        "max": 10,
        "targetCPU": 70
      }
    },
    "networking": {
      "vpc": "vpc-12345678",
      "subnets": ["subnet-abc", "subnet-def", "subnet-ghi"],
      "loadBalancer": {
        "type": "alb",
        "ssl": true,
        "healthCheck": "/health"
      },
      "cdn": {
        "provider": "CloudFront",
        "caching": true,
        "edgeLocations": 200
      }
    },
    "storage": {
      "database": {
        "type": "postgres",
        "size": "db.t3.medium",
        "backup": true,
        "multiAZ": true
      },
      "objectStorage": {
        "provider": "S3",
        "buckets": ["uploads", "static-assets", "backups"],
        "publicAccess": false
      },
      "cache": {
        "type": "redis",
        "size": "cache.t3.micro"
      }
    },
    "monitoring": {
      "logging": {
        "provider": "CloudWatch",
        "retention": 30
      },
      "metrics": {
        "provider": "CloudWatch",
        "dashboards": ["Application", "Infrastructure", "Business"]
      },
      "alerting": {
        "enabled": true,
        "channels": ["email", "slack", "pagerduty"]
      }
    }
  },
  "strategy": {
    "type": "blue-green",
    "rollbackOnFailure": true,
    "healthCheckGracePeriod": 300,
    "stages": [
      {
        "name": "Deploy to green environment",
        "percentage": 0,
        "duration": 5,
        "successCriteria": ["Health checks passing", "No errors in logs"]
      },
      {
        "name": "Route 10% traffic to green",
        "percentage": 10,
        "duration": 15,
        "successCriteria": ["Error rate < 0.1%", "Latency p95 < 500ms"]
      },
      {
        "name": "Route 50% traffic to green",
        "percentage": 50,
        "duration": 30,
        "successCriteria": ["Error rate < 0.1%", "Latency p95 < 500ms"]
      },
      {
        "name": "Route 100% traffic to green",
        "percentage": 100,
        "duration": 0,
        "successCriteria": ["Error rate < 0.1%", "Latency p95 < 500ms"]
      }
    ]
  },
  "cicd": {
    "provider": "github-actions",
    "triggers": ["push to main", "pull request", "manual"],
    "stages": [
      {
        "name": "Build",
        "steps": ["Checkout code", "Install dependencies", "Run tests", "Build artifacts"],
        "duration": 180,
        "dependencies": []
      },
      {
        "name": "Test",
        "steps": ["Unit tests", "Integration tests", "E2E tests", "Security scan"],
        "duration": 300,
        "dependencies": ["Build"]
      },
      {
        "name": "Deploy to Staging",
        "steps": ["Push to ECR", "Update ECS task", "Run smoke tests"],
        "duration": 240,
        "dependencies": ["Test"]
      },
      {
        "name": "Deploy to Production",
        "steps": ["Manual approval", "Blue-green deployment", "Monitor metrics"],
        "duration": 600,
        "dependencies": ["Deploy to Staging"]
      }
    ],
    "secrets": ["AWS_ACCESS_KEY", "AWS_SECRET_KEY", "DATABASE_URL", "API_KEYS"],
    "environments": [
      {
        "name": "staging",
        "approvalRequired": false,
        "protectedBranches": ["main"]
      },
      {
        "name": "production",
        "approvalRequired": true,
        "protectedBranches": ["main"]
      }
    ]
  },
  "rollback": {
    "automatic": true,
    "triggers": ["Error rate > 1%", "Latency p95 > 2000ms", "Health check failures > 3"],
    "steps": [
      "Route traffic back to blue environment",
      "Scale down green environment",
      "Verify metrics return to normal",
      "Generate incident report"
    ],
    "estimatedTime": 60,
    "dataRecovery": {
      "required": false
    }
  },
  "costEstimate": {
    "monthly": {
      "compute": 150,
      "storage": 80,
      "networking": 120,
      "monitoring": 50,
      "other": 50,
      "total": 450
    },
    "currency": "USD",
    "assumptions": [
      "3 ECS tasks running 24/7",
      "100GB data transfer per month",
      "1TB S3 storage",
      "RDS db.t3.medium instance"
    ],
    "scalingImpact": [
      {"users": 1000, "estimatedCost": 450},
      {"users": 10000, "estimatedCost": 850},
      {"users": 100000, "estimatedCost": 2500}
    ]
  },
  "security": {
    "encryption": {
      "atRest": true,
      "inTransit": true,
      "keyManagement": "AWS KMS"
    },
    "accessControl": {
      "iam": true,
      "rbac": true,
      "mfa": true
    },
    "compliance": {
      "standards": ["SOC 2", "GDPR"],
      "certifications": []
    },
    "secrets": {
      "management": "AWS Secrets Manager",
      "rotation": true
    },
    "networking": {
      "firewall": true,
      "ddosProtection": true,
      "waf": true
    }
  },
  "dns": {
    "provider": "Route 53",
    "records": [
      {"type": "A", "name": "example.com", "value": "ALB DNS"},
      {"type": "CNAME", "name": "www.example.com", "value": "example.com"},
      {"type": "CNAME", "name": "api.example.com", "value": "ALB DNS"}
    ]
  },
  "ssl": {
    "provider": "AWS Certificate Manager",
    "certificates": ["*.example.com"],
    "autoRenewal": true
  },
  "monitoring": {
    "uptime": {
      "provider": "StatusCake",
      "checkInterval": 60,
      "locations": ["US-East", "EU-West", "AP-Southeast"]
    },
    "performance": {
      "apm": "New Relic",
      "errorTracking": "Sentry",
      "logAggregation": "CloudWatch Logs"
    },
    "alerts": {
      "critical": [
        "Service downtime > 5 minutes",
        "Error rate > 5%",
        "Database connection failures"
      ],
      "warning": [
        "CPU usage > 80%",
        "Memory usage > 85%",
        "Disk usage > 90%"
      ],
      "channels": ["email", "slack", "pagerduty"]
    }
  },
  "documentation": {
    "runbooks": [
      "deployment-process.md",
      "rollback-procedure.md",
      "incident-response.md",
      "scaling-guide.md"
    ],
    "diagrams": [
      "architecture-diagram.png",
      "network-topology.png",
      "ci-cd-pipeline.png"
    ],
    "troubleshooting": [
      "common-deployment-issues.md",
      "performance-debugging.md",
      "database-recovery.md"
    ]
  },
  "recommendations": [
    {
      "priority": "high",
      "recommendation": "Implement database read replicas for scaling",
      "impact": "Improves read performance by 3x, reduces primary DB load",
      "effort": "medium",
      "category": "performance"
    },
    {
      "priority": "high",
      "recommendation": "Enable AWS WAF for DDoS protection",
      "impact": "Protects against common web attacks",
      "effort": "low",
      "category": "security"
    },
    {
      "priority": "medium",
      "recommendation": "Set up multi-region failover",
      "impact": "Increases availability to 99.99%",
      "effort": "high",
      "category": "reliability"
    },
    {
      "priority": "medium",
      "recommendation": "Implement reserved instances for cost savings",
      "impact": "Reduces compute costs by ~40%",
      "effort": "low",
      "category": "cost"
    }
  ]
}

REQUIREMENTS:
- Design for 3 environments (dev, staging, production)
- Choose appropriate cloud services based on architecture
- Include comprehensive monitoring and alerting
- Provide detailed cost estimates
- Design blue-green or canary deployment strategy
- Include CI/CD pipeline configuration
- Provide rollback procedures
- Include security best practices
- Generate infrastructure-as-code approach
- Recommend cost optimizations

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parseDeploymentReport(text: string): DeploymentReport {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed as DeploymentReport;
    } catch (error) {
      this.logger.error('Failed to parse deployment report', { error });
      throw error;
    }
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback deployment report');

    const deploymentReport: DeploymentReport = {
      summary: {
        totalTargets: 2,
        readyTargets: 2,
        estimatedDeploymentTime: 600,
        estimatedMonthlyCost: 300,
        deploymentStatus: 'planned',
      },
      targets: [
        {
          id: 'target-staging',
          name: 'Staging',
          provider: 'aws',
          environment: 'staging',
          region: 'us-east-1',
          status: 'ready',
        },
        {
          id: 'target-prod',
          name: 'Production',
          provider: 'aws',
          environment: 'production',
          region: 'us-east-1',
          status: 'ready',
        },
      ],
      infrastructure: {
        compute: {
          type: 'container',
          service: 'ECS',
          instances: 2,
          cpu: '1 vCPU',
          memory: '2 GB',
          autoscaling: {
            enabled: true,
            min: 2,
            max: 5,
            targetCPU: 70,
          },
        },
        networking: {
          loadBalancer: {
            type: 'alb',
            ssl: true,
            healthCheck: '/health',
          },
        },
        storage: {},
        monitoring: {
          logging: {
            provider: 'CloudWatch',
            retention: 30,
          },
          metrics: {
            provider: 'CloudWatch',
            dashboards: ['Application'],
          },
          alerting: {
            enabled: true,
            channels: ['email'],
          },
        },
      },
      strategy: {
        type: 'rolling',
        rollbackOnFailure: true,
        healthCheckGracePeriod: 300,
      },
      cicd: {
        provider: 'github-actions',
        triggers: ['push to main'],
        stages: [
          {
            name: 'Build',
            steps: ['Build', 'Test'],
            duration: 180,
          },
          {
            name: 'Deploy',
            steps: ['Deploy'],
            duration: 300,
          },
        ],
        secrets: ['AWS_ACCESS_KEY'],
        environments: [
          {
            name: 'production',
            approvalRequired: true,
            protectedBranches: ['main'],
          },
        ],
      },
      rollback: {
        automatic: false,
        triggers: [],
        steps: ['Revert deployment'],
        estimatedTime: 120,
        dataRecovery: {
          required: false,
        },
      },
      costEstimate: {
        monthly: {
          compute: 150,
          storage: 50,
          networking: 50,
          monitoring: 25,
          other: 25,
          total: 300,
        },
        currency: 'USD',
        assumptions: ['Basic infrastructure'],
        scalingImpact: [],
      },
      security: {
        encryption: {
          atRest: true,
          inTransit: true,
          keyManagement: 'AWS KMS',
        },
        accessControl: {
          iam: true,
          rbac: false,
          mfa: false,
        },
        compliance: {
          standards: [],
          certifications: [],
        },
        secrets: {
          management: 'Environment variables',
          rotation: false,
        },
        networking: {
          firewall: true,
          ddosProtection: false,
          waf: false,
        },
      },
      dns: {
        provider: 'Route 53',
        records: [],
      },
      ssl: {
        provider: 'AWS ACM',
        certificates: [],
        autoRenewal: true,
      },
      monitoring: {
        uptime: {
          provider: 'CloudWatch',
          checkInterval: 300,
          locations: ['us-east-1'],
        },
        performance: {
          apm: 'CloudWatch',
          errorTracking: 'CloudWatch',
          logAggregation: 'CloudWatch',
        },
        alerts: {
          critical: ['Service down'],
          warning: ['High CPU'],
          channels: ['email'],
        },
      },
      documentation: {
        runbooks: [],
        diagrams: [],
        troubleshooting: [],
      },
      recommendations: [
        {
          priority: 'medium',
          recommendation: 'Enable autoscaling',
          impact: 'Better resource utilization',
          effort: 'low',
          category: 'performance',
        },
      ],
    };

    return {
      reasoning: 'Using fallback deployment report as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        deploymentReport,
      },
    };
  }
}
