import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Infrastructure Component
 */
interface InfrastructureComponent {
  category: 'compute' | 'database' | 'storage' | 'networking' | 'security' | 'monitoring' | 'cicd';
  service: string;
  purpose: string;
  configuration: {
    instanceType?: string;
    count?: number;
    capacity?: string;
    region?: string;
    settings?: Record<string, any>;
  };
  costEstimate: {
    monthly: number;
    currency: string;
    breakdown?: string;
  };
  alternatives: {
    service: string;
    tradeoffs: string;
  }[];
}

/**
 * Auto-Scaling Configuration
 */
interface AutoScalingConfig {
  component: string;
  minCapacity: number;
  maxCapacity: number;
  targetMetric: string;
  targetValue: number;
  scaleUpPolicy: {
    threshold: number;
    cooldown: string;
    adjustment: string;
  };
  scaleDownPolicy: {
    threshold: number;
    cooldown: string;
    adjustment: string;
  };
}

/**
 * CI/CD Pipeline
 */
interface CICDPipeline {
  platform: string;
  stages: {
    name: string;
    steps: {
      name: string;
      action: string;
      tools: string[];
    }[];
    triggers: string[];
    artifacts: string[];
  }[];
  deploymentStrategy: 'blue-green' | 'canary' | 'rolling' | 'recreate';
  rollbackStrategy: string;
  approvalGates: {
    stage: string;
    approvers: string[];
    criteria: string;
  }[];
}

/**
 * Monitoring Configuration
 */
interface MonitoringConfig {
  metrics: {
    category: 'infrastructure' | 'application' | 'business' | 'security';
    metric: string;
    threshold: number;
    alerting: {
      severity: 'critical' | 'high' | 'medium' | 'low';
      channel: string;
      recipients: string[];
    };
  }[];
  logging: {
    aggregation: string;
    retention: string;
    searchable: boolean;
  };
  tracing: {
    enabled: boolean;
    samplingRate: number;
    backend: string;
  };
  dashboards: {
    name: string;
    purpose: string;
    widgets: string[];
  }[];
}

/**
 * Disaster Recovery Plan
 */
interface DisasterRecoveryPlan {
  rpo: string; // Recovery Point Objective
  rto: string; // Recovery Time Objective
  backupStrategy: {
    frequency: string;
    retention: string;
    storageLocation: string;
    encryption: boolean;
  };
  failoverStrategy: {
    type: 'active-passive' | 'active-active' | 'pilot-light' | 'warm-standby';
    regions: string[];
    automatedFailover: boolean;
    healthChecks: string[];
  };
  testingSchedule: string;
  runbooks: {
    scenario: string;
    steps: string[];
    estimatedDuration: string;
  }[];
}

/**
 * Infrastructure Plan
 */
interface InfrastructurePlan {
  overview: {
    cloudProvider: 'AWS' | 'Azure' | 'GCP' | 'Multi-Cloud' | 'On-Premise' | 'Hybrid';
    rationale: string;
    regions: {
      primary: string;
      secondary?: string;
      others?: string[];
    };
    estimatedMonthlyCost: {
      total: number;
      currency: string;
      breakdown: {
        category: string;
        cost: number;
      }[];
    };
  };
  components: InfrastructureComponent[];
  networking: {
    vpc: {
      cidr: string;
      subnets: {
        type: 'public' | 'private' | 'isolated';
        cidr: string;
        availabilityZone: string;
        purpose: string;
      }[];
    };
    loadBalancing: {
      type: 'application' | 'network' | 'gateway';
      healthChecks: string[];
      sslTermination: boolean;
    };
    cdn: {
      enabled: boolean;
      provider?: string;
      cacheStrategy?: string;
    };
    dns: {
      provider: string;
      zones: string[];
      recordTypes: string[];
    };
  };
  security: {
    firewall: {
      inboundRules: {
        port: number;
        protocol: string;
        source: string;
        description: string;
      }[];
      outboundRules: {
        port: number;
        protocol: string;
        destination: string;
        description: string;
      }[];
    };
    encryption: {
      atRest: {
        enabled: boolean;
        keyManagement: string;
        algorithm: string;
      };
      inTransit: {
        enabled: boolean;
        protocol: string;
        certificateProvider: string;
      };
    };
    identityAndAccess: {
      authenticationMethod: string;
      mfaRequired: boolean;
      roleBasedAccess: boolean;
      leastPrivilege: boolean;
    };
    secretsManagement: {
      provider: string;
      rotation: boolean;
      rotationPeriod?: string;
    };
    compliance: {
      standards: string[];
      auditing: boolean;
      penetrationTesting: string;
    };
  };
  autoScaling: AutoScalingConfig[];
  cicdPipeline: CICDPipeline;
  monitoring: MonitoringConfig;
  disasterRecovery: DisasterRecoveryPlan;
  costOptimization: {
    strategies: string[];
    reservedInstances: {
      component: string;
      term: '1-year' | '3-year';
      estimatedSavings: string;
    }[];
    spotInstances: {
      component: string;
      percentage: number;
      fallbackStrategy: string;
    }[];
  };
  containerOrchestration: {
    platform: 'Kubernetes' | 'ECS' | 'EKS' | 'AKS' | 'GKE' | 'Docker Swarm' | 'None';
    rationale?: string;
    clusterConfig?: {
      nodes: number;
      nodeType: string;
      namespaces: string[];
    };
    serviceMesh?: {
      enabled: boolean;
      provider?: string;
    };
  };
}

/**
 * InfrastructurePlannerAgent
 *
 * Designs comprehensive cloud infrastructure including:
 * - Cloud provider selection and multi-region strategy
 * - Infrastructure components (compute, database, storage, networking)
 * - Container orchestration (Kubernetes, ECS, etc.)
 * - CI/CD pipeline design with deployment strategies
 * - Monitoring, logging, and distributed tracing
 * - Security infrastructure (firewalls, encryption, IAM)
 * - Auto-scaling and load balancing
 * - Disaster recovery and high availability
 * - Cost estimation and optimization strategies
 *
 * Input: IdeaSpec + System Architecture + BIZDEV
 * Output: Complete infrastructure plan artifact
 */
export class InfrastructurePlannerAgent extends BaseAgent {
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
        'Select cloud provider based on requirements and constraints',
        'Design infrastructure components (compute, database, networking)',
        'Configure auto-scaling, monitoring, and security',
        'Estimate costs and create disaster recovery plan',
      ],
      estimatedTotalDurationMs: 12000, // ~12 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildInfrastructurePrompt(input);

      this.logger.info('Invoking LLM for infrastructure planning');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const infrastructurePlan = this.parseInfrastructurePlan(content);

      return {
        reasoning: `Designed ${infrastructurePlan.overview.cloudProvider} infrastructure with ${infrastructurePlan.components.length} components, estimated monthly cost: $${infrastructurePlan.overview.estimatedMonthlyCost.total}.`,
        confidence: 0.85,
        intermediate: {
          infrastructurePlan,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for infrastructure planning', { error });
      return this.fallback();
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const infrastructurePlan = result.intermediate?.infrastructurePlan;

    return [
      {
        type: 'infrastructure-plan',
        content: infrastructurePlan,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildInfrastructurePrompt(input: any): string {
    const { ideaSpec, previousArtifacts } = input;

    // Extract relevant context
    const systemArch = previousArtifacts?.find((a: any) => a.type === 'system-architecture')?.content;
    const bizdevComplete = previousArtifacts?.find((a: any) => a.type === 'bizdev-complete')?.content;

    const architectureStyle = systemArch?.overview?.architectureStyle || 'monolithic';
    const components = systemArch?.components || [];
    const scalingNeeds = systemArch?.scalabilityDesign || {};
    const budget = ideaSpec?.constraints?.budget || {};
    const complianceReqs = ideaSpec?.constraints?.complianceRequirements || [];
    const deploymentArch = systemArch?.deploymentArchitecture || {};

    return `You are a Senior Infrastructure Architect designing cloud infrastructure.

PROJECT CONTEXT:
Title: ${ideaSpec?.title || 'N/A'}
Description: ${ideaSpec?.description || 'N/A'}
Architecture Style: ${architectureStyle}

SYSTEM COMPONENTS (${components.length} total):
${components.map((c: any) => `- ${c.name} (${c.type}): ${c.scalingStrategy}`).join('\n') || 'None specified'}

SCALING REQUIREMENTS:
Current Capacity: ${scalingNeeds.currentCapacity?.users || 'N/A'} users, ${scalingNeeds.currentCapacity?.data || 'N/A'} data
Target Capacity: ${scalingNeeds.targetCapacity?.users || 'N/A'} users, ${scalingNeeds.targetCapacity?.data || 'N/A'} data

BUDGET CONSTRAINTS:
Budget Range: $${budget.min?.toLocaleString() || 'N/A'} - $${budget.max?.toLocaleString() || 'N/A'} ${budget.currency || 'USD'}

COMPLIANCE REQUIREMENTS:
${complianceReqs.map((req: string) => `- ${req}`).join('\n') || 'None specified'}

DISASTER RECOVERY:
RPO: ${deploymentArch.disasterRecovery?.rpo || 'Not specified'}
RTO: ${deploymentArch.disasterRecovery?.rto || 'Not specified'}

TASK:
Design a comprehensive cloud infrastructure plan. Your response MUST be valid JSON matching this structure:

{
  "overview": {
    "cloudProvider": "AWS|Azure|GCP|Multi-Cloud|On-Premise|Hybrid",
    "rationale": "Why this cloud provider was chosen (2-3 sentences)",
    "regions": {
      "primary": "us-east-1",
      "secondary": "us-west-2",
      "others": []
    },
    "estimatedMonthlyCost": {
      "total": 5000,
      "currency": "USD",
      "breakdown": [
        {
          "category": "Compute",
          "cost": 2000
        }
      ]
    }
  },
  "components": [
    {
      "category": "compute|database|storage|networking|security|monitoring|cicd",
      "service": "Service name (e.g., EC2, RDS, S3)",
      "purpose": "What this component does",
      "configuration": {
        "instanceType": "t3.medium",
        "count": 3,
        "capacity": "100GB",
        "region": "us-east-1",
        "settings": {}
      },
      "costEstimate": {
        "monthly": 500,
        "currency": "USD",
        "breakdown": "Details"
      },
      "alternatives": [
        {
          "service": "Alternative service",
          "tradeoffs": "Pros and cons"
        }
      ]
    }
  ],
  "networking": {
    "vpc": {
      "cidr": "10.0.0.0/16",
      "subnets": [
        {
          "type": "public|private|isolated",
          "cidr": "10.0.1.0/24",
          "availabilityZone": "us-east-1a",
          "purpose": "Web tier"
        }
      ]
    },
    "loadBalancing": {
      "type": "application|network|gateway",
      "healthChecks": ["/health", "/ready"],
      "sslTermination": true
    },
    "cdn": {
      "enabled": true,
      "provider": "CloudFront",
      "cacheStrategy": "Cache static assets"
    },
    "dns": {
      "provider": "Route 53",
      "zones": ["example.com"],
      "recordTypes": ["A", "CNAME", "TXT"]
    }
  },
  "security": {
    "firewall": {
      "inboundRules": [
        {
          "port": 443,
          "protocol": "TCP",
          "source": "0.0.0.0/0",
          "description": "HTTPS traffic"
        }
      ],
      "outboundRules": [
        {
          "port": 443,
          "protocol": "TCP",
          "destination": "0.0.0.0/0",
          "description": "Outbound HTTPS"
        }
      ]
    },
    "encryption": {
      "atRest": {
        "enabled": true,
        "keyManagement": "AWS KMS",
        "algorithm": "AES-256"
      },
      "inTransit": {
        "enabled": true,
        "protocol": "TLS 1.3",
        "certificateProvider": "ACM"
      }
    },
    "identityAndAccess": {
      "authenticationMethod": "OIDC",
      "mfaRequired": true,
      "roleBasedAccess": true,
      "leastPrivilege": true
    },
    "secretsManagement": {
      "provider": "AWS Secrets Manager",
      "rotation": true,
      "rotationPeriod": "90 days"
    },
    "compliance": {
      "standards": ["SOC2", "GDPR"],
      "auditing": true,
      "penetrationTesting": "Quarterly"
    }
  },
  "autoScaling": [
    {
      "component": "API Servers",
      "minCapacity": 2,
      "maxCapacity": 10,
      "targetMetric": "CPU Utilization",
      "targetValue": 70,
      "scaleUpPolicy": {
        "threshold": 80,
        "cooldown": "60 seconds",
        "adjustment": "+2 instances"
      },
      "scaleDownPolicy": {
        "threshold": 50,
        "cooldown": "300 seconds",
        "adjustment": "-1 instance"
      }
    }
  ],
  "cicdPipeline": {
    "platform": "GitHub Actions | Jenkins | GitLab CI | CircleCI",
    "stages": [
      {
        "name": "Build",
        "steps": [
          {
            "name": "Compile",
            "action": "npm run build",
            "tools": ["Node.js", "npm"]
          }
        ],
        "triggers": ["push to main"],
        "artifacts": ["build/"]
      }
    ],
    "deploymentStrategy": "blue-green|canary|rolling|recreate",
    "rollbackStrategy": "Automatic rollback on health check failure",
    "approvalGates": [
      {
        "stage": "Production",
        "approvers": ["DevOps Lead", "CTO"],
        "criteria": "All tests passed"
      }
    ]
  },
  "monitoring": {
    "metrics": [
      {
        "category": "infrastructure|application|business|security",
        "metric": "CPU Utilization",
        "threshold": 80,
        "alerting": {
          "severity": "critical|high|medium|low",
          "channel": "PagerDuty",
          "recipients": ["oncall@example.com"]
        }
      }
    ],
    "logging": {
      "aggregation": "CloudWatch Logs",
      "retention": "30 days",
      "searchable": true
    },
    "tracing": {
      "enabled": true,
      "samplingRate": 0.1,
      "backend": "X-Ray"
    },
    "dashboards": [
      {
        "name": "System Health",
        "purpose": "Monitor overall system health",
        "widgets": ["CPU", "Memory", "Disk", "Network"]
      }
    ]
  },
  "disasterRecovery": {
    "rpo": "1 hour",
    "rto": "4 hours",
    "backupStrategy": {
      "frequency": "daily",
      "retention": "30 days",
      "storageLocation": "S3 Glacier",
      "encryption": true
    },
    "failoverStrategy": {
      "type": "active-passive|active-active|pilot-light|warm-standby",
      "regions": ["us-east-1", "us-west-2"],
      "automatedFailover": true,
      "healthChecks": ["/health", "/db-health"]
    },
    "testingSchedule": "Quarterly",
    "runbooks": [
      {
        "scenario": "Database failure",
        "steps": ["Verify failure", "Promote replica", "Update DNS"],
        "estimatedDuration": "30 minutes"
      }
    ]
  },
  "costOptimization": {
    "strategies": ["Use reserved instances", "Right-size instances", "Implement auto-scaling"],
    "reservedInstances": [
      {
        "component": "Database",
        "term": "1-year|3-year",
        "estimatedSavings": "40%"
      }
    ],
    "spotInstances": [
      {
        "component": "Batch Processing",
        "percentage": 80,
        "fallbackStrategy": "On-demand instances"
      }
    ]
  },
  "containerOrchestration": {
    "platform": "Kubernetes|ECS|EKS|AKS|GKE|Docker Swarm|None",
    "rationale": "Why this platform was chosen",
    "clusterConfig": {
      "nodes": 5,
      "nodeType": "t3.medium",
      "namespaces": ["production", "staging"]
    },
    "serviceMesh": {
      "enabled": false,
      "provider": "Istio"
    }
  }
}

REQUIREMENTS:
- Design 8-15 infrastructure components across all categories
- Include detailed cost estimates for each component
- Configure networking with VPC, subnets, load balancing, and CDN
- Define comprehensive security (firewall, encryption, IAM, secrets)
- Create auto-scaling policies for scalable components
- Design CI/CD pipeline with 4-6 stages
- Configure monitoring with 10-15 key metrics
- Include disaster recovery plan meeting RPO/RTO requirements
- Address all compliance requirements
- Estimate total monthly infrastructure cost within budget constraints
- Consider container orchestration if applicable

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parseInfrastructurePlan(text: string): InfrastructurePlan {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Normalize cloud provider
      if (parsed.overview?.cloudProvider) {
        parsed.overview.cloudProvider = this.normalizeCloudProvider(parsed.overview.cloudProvider);
      }

      return parsed as InfrastructurePlan;
    } catch (error) {
      this.logger.error('Failed to parse infrastructure plan', { error });
      throw error;
    }
  }

  private normalizeCloudProvider(provider: string): 'AWS' | 'Azure' | 'GCP' | 'Multi-Cloud' | 'On-Premise' | 'Hybrid' {
    const lower = provider?.toLowerCase().trim() || '';
    if (lower.includes('aws') || lower.includes('amazon')) return 'AWS';
    if (lower.includes('azure') || lower.includes('microsoft')) return 'Azure';
    if (lower.includes('gcp') || lower.includes('google')) return 'GCP';
    if (lower.includes('multi')) return 'Multi-Cloud';
    if (lower.includes('on-premise') || lower.includes('on-prem')) return 'On-Premise';
    if (lower.includes('hybrid')) return 'Hybrid';
    return 'AWS';
  }

  private fallback(): ReasoningResult {
    this.logger.warn('Using fallback infrastructure plan');

    const infrastructurePlan: InfrastructurePlan = {
      overview: {
        cloudProvider: 'AWS',
        rationale: 'AWS chosen for its mature ecosystem, extensive services, and global reach.',
        regions: {
          primary: 'us-east-1',
          secondary: 'us-west-2',
        },
        estimatedMonthlyCost: {
          total: 2500,
          currency: 'USD',
          breakdown: [
            { category: 'Compute', cost: 1000 },
            { category: 'Database', cost: 800 },
            { category: 'Networking', cost: 400 },
            { category: 'Monitoring', cost: 300 },
          ],
        },
      },
      components: [
        {
          category: 'compute',
          service: 'EC2',
          purpose: 'Application servers',
          configuration: {
            instanceType: 't3.medium',
            count: 3,
            region: 'us-east-1',
          },
          costEstimate: {
            monthly: 1000,
            currency: 'USD',
            breakdown: '3 x t3.medium @ $0.0416/hr',
          },
          alternatives: [
            {
              service: 'ECS Fargate',
              tradeoffs: 'Serverless but potentially higher cost',
            },
          ],
        },
        {
          category: 'database',
          service: 'RDS PostgreSQL',
          purpose: 'Primary database',
          configuration: {
            instanceType: 'db.t3.medium',
            count: 1,
            capacity: '100GB',
            region: 'us-east-1',
          },
          costEstimate: {
            monthly: 800,
            currency: 'USD',
            breakdown: 'db.t3.medium + storage',
          },
          alternatives: [
            {
              service: 'Aurora Serverless',
              tradeoffs: 'Auto-scaling but higher cost per ACU',
            },
          ],
        },
      ],
      networking: {
        vpc: {
          cidr: '10.0.0.0/16',
          subnets: [
            {
              type: 'public',
              cidr: '10.0.1.0/24',
              availabilityZone: 'us-east-1a',
              purpose: 'Load balancers',
            },
            {
              type: 'private',
              cidr: '10.0.2.0/24',
              availabilityZone: 'us-east-1a',
              purpose: 'Application servers',
            },
          ],
        },
        loadBalancing: {
          type: 'application',
          healthChecks: ['/health'],
          sslTermination: true,
        },
        cdn: {
          enabled: true,
          provider: 'CloudFront',
          cacheStrategy: 'Cache static assets for 1 day',
        },
        dns: {
          provider: 'Route 53',
          zones: ['example.com'],
          recordTypes: ['A', 'CNAME'],
        },
      },
      security: {
        firewall: {
          inboundRules: [
            {
              port: 443,
              protocol: 'TCP',
              source: '0.0.0.0/0',
              description: 'HTTPS traffic',
            },
          ],
          outboundRules: [
            {
              port: 443,
              protocol: 'TCP',
              destination: '0.0.0.0/0',
              description: 'Outbound HTTPS',
            },
          ],
        },
        encryption: {
          atRest: {
            enabled: true,
            keyManagement: 'AWS KMS',
            algorithm: 'AES-256',
          },
          inTransit: {
            enabled: true,
            protocol: 'TLS 1.3',
            certificateProvider: 'ACM',
          },
        },
        identityAndAccess: {
          authenticationMethod: 'OIDC',
          mfaRequired: true,
          roleBasedAccess: true,
          leastPrivilege: true,
        },
        secretsManagement: {
          provider: 'AWS Secrets Manager',
          rotation: true,
          rotationPeriod: '90 days',
        },
        compliance: {
          standards: [],
          auditing: true,
          penetrationTesting: 'Quarterly',
        },
      },
      autoScaling: [
        {
          component: 'EC2 Instances',
          minCapacity: 2,
          maxCapacity: 10,
          targetMetric: 'CPU Utilization',
          targetValue: 70,
          scaleUpPolicy: {
            threshold: 80,
            cooldown: '60 seconds',
            adjustment: '+2 instances',
          },
          scaleDownPolicy: {
            threshold: 50,
            cooldown: '300 seconds',
            adjustment: '-1 instance',
          },
        },
      ],
      cicdPipeline: {
        platform: 'GitHub Actions',
        stages: [
          {
            name: 'Build',
            steps: [
              {
                name: 'Install dependencies',
                action: 'npm install',
                tools: ['Node.js'],
              },
              {
                name: 'Build',
                action: 'npm run build',
                tools: ['TypeScript'],
              },
            ],
            triggers: ['push to main'],
            artifacts: ['dist/'],
          },
          {
            name: 'Test',
            steps: [
              {
                name: 'Run tests',
                action: 'npm test',
                tools: ['Jest'],
              },
            ],
            triggers: [],
            artifacts: ['coverage/'],
          },
          {
            name: 'Deploy',
            steps: [
              {
                name: 'Deploy to production',
                action: 'aws deploy',
                tools: ['AWS CLI'],
              },
            ],
            triggers: ['manual approval'],
            artifacts: [],
          },
        ],
        deploymentStrategy: 'blue-green',
        rollbackStrategy: 'Automatic rollback on health check failure',
        approvalGates: [
          {
            stage: 'Production',
            approvers: ['DevOps Lead'],
            criteria: 'All tests passed',
          },
        ],
      },
      monitoring: {
        metrics: [
          {
            category: 'infrastructure',
            metric: 'CPU Utilization',
            threshold: 80,
            alerting: {
              severity: 'high',
              channel: 'Email',
              recipients: ['ops@example.com'],
            },
          },
        ],
        logging: {
          aggregation: 'CloudWatch Logs',
          retention: '30 days',
          searchable: true,
        },
        tracing: {
          enabled: true,
          samplingRate: 0.1,
          backend: 'X-Ray',
        },
        dashboards: [
          {
            name: 'System Health',
            purpose: 'Monitor overall system health',
            widgets: ['CPU', 'Memory', 'Request Count'],
          },
        ],
      },
      disasterRecovery: {
        rpo: '1 hour',
        rto: '4 hours',
        backupStrategy: {
          frequency: 'daily',
          retention: '30 days',
          storageLocation: 'S3',
          encryption: true,
        },
        failoverStrategy: {
          type: 'active-passive',
          regions: ['us-east-1', 'us-west-2'],
          automatedFailover: false,
          healthChecks: ['/health'],
        },
        testingSchedule: 'Quarterly',
        runbooks: [
          {
            scenario: 'Regional outage',
            steps: ['Verify outage', 'Initiate failover', 'Monitor new region'],
            estimatedDuration: '2 hours',
          },
        ],
      },
      costOptimization: {
        strategies: ['Use reserved instances for baseline capacity', 'Implement auto-scaling'],
        reservedInstances: [
          {
            component: 'Database',
            term: '1-year',
            estimatedSavings: '40%',
          },
        ],
        spotInstances: [],
      },
      containerOrchestration: {
        platform: 'ECS',
        rationale: 'ECS chosen for simplicity and AWS integration',
        clusterConfig: {
          nodes: 3,
          nodeType: 't3.medium',
          namespaces: ['production'],
        },
        serviceMesh: {
          enabled: false,
        },
      },
    };

    return {
      reasoning: 'Using fallback AWS infrastructure plan as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        infrastructurePlan,
      },
    };
  }
}
