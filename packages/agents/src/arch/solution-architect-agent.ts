import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Architecture Decision Record
 */
interface ADR {
  id: string;
  title: string;
  status: 'proposed' | 'accepted' | 'superseded' | 'deprecated';
  context: string;
  decision: string;
  consequences: {
    positive: string[];
    negative: string[];
    risks: string[];
  };
  alternatives: {
    option: string;
    rationale: string;
  }[];
}

/**
 * System Component
 */
interface SystemComponent {
  name: string;
  type: 'frontend' | 'backend' | 'database' | 'cache' | 'queue' | 'storage' | 'external';
  description: string;
  technologies: string[];
  responsibilities: string[];
  dependencies: string[];
  scalingStrategy: 'horizontal' | 'vertical' | 'both' | 'none';
  deploymentUnit: 'monolith' | 'service' | 'serverless' | 'container';
}

/**
 * Integration Pattern
 */
interface IntegrationPattern {
  pattern: 'rest' | 'graphql' | 'grpc' | 'websocket' | 'event-driven' | 'batch';
  useCase: string;
  components: string[];
  rationale: string;
  considerations: string[];
}

/**
 * Security Control
 */
interface SecurityControl {
  category: 'authentication' | 'authorization' | 'encryption' | 'network' | 'data' | 'monitoring';
  control: string;
  implementation: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * System Architecture
 */
interface SystemArchitecture {
  overview: {
    architectureStyle: 'monolithic' | 'microservices' | 'serverless' | 'hybrid' | 'event-driven';
    rationale: string;
    designPrinciples: string[];
    qualityAttributes: {
      attribute: 'performance' | 'scalability' | 'reliability' | 'security' | 'maintainability' | 'cost-efficiency';
      priority: 'critical' | 'high' | 'medium' | 'low';
      targetMetric: string;
    }[];
  };
  components: SystemComponent[];
  integrationPatterns: IntegrationPattern[];
  securityArchitecture: {
    overview: string;
    controls: SecurityControl[];
    complianceRequirements: string[];
    threatModel: {
      threat: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      mitigation: string;
    }[];
  };
  scalabilityDesign: {
    currentCapacity: {
      users: string;
      requests: string;
      data: string;
    };
    targetCapacity: {
      users: string;
      requests: string;
      data: string;
    };
    scalingStrategies: {
      component: string;
      strategy: string;
      triggers: string[];
    }[];
    bottlenecks: {
      component: string;
      issue: string;
      solution: string;
    }[];
  };
  architectureDecisionRecords: ADR[];
  technologyStack: {
    layer: 'frontend' | 'backend' | 'database' | 'infrastructure' | 'devops' | 'monitoring';
    technologies: {
      name: string;
      version: string;
      purpose: string;
      justification: string;
    }[];
  }[];
  deploymentArchitecture: {
    environments: {
      name: 'development' | 'staging' | 'production';
      configuration: string;
      resources: string;
    }[];
    cicdPipeline: string;
    disasterRecovery: {
      rpo: string; // Recovery Point Objective
      rto: string; // Recovery Time Objective
      backupStrategy: string;
    };
  };
}

/**
 * SolutionArchitectAgent
 *
 * Designs comprehensive system architecture including:
 * - Architecture style selection (monolithic, microservices, serverless, hybrid)
 * - System component design and dependencies
 * - Architecture Decision Records (ADRs)
 * - Technology stack validation and selection
 * - Scalability and performance architecture
 * - Security architecture and threat modeling
 * - Integration patterns and communication protocols
 * - Deployment architecture and disaster recovery
 *
 * Input: IdeaSpec + previous artifacts (PRD, BIZDEV)
 * Output: Comprehensive system architecture artifact
 */
export class SolutionArchitectAgent extends BaseAgent {
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
        'Analyze requirements from PRD and business constraints',
        'Select appropriate architecture style and design principles',
        'Design system components and integration patterns',
        'Create Architecture Decision Records (ADRs) for key decisions',
      ],
      estimatedTotalDurationMs: 15000, // ~15 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildArchitecturePrompt(input);

      this.logger.info('Invoking LLM for system architecture design');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const architecture = this.parseArchitecture(content);

      return {
        reasoning: `Designed ${architecture.overview.architectureStyle} architecture with ${architecture.components.length} components, ${architecture.architectureDecisionRecords.length} ADRs, and comprehensive security controls.`,
        confidence: 0.85,
        intermediate: {
          architecture,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for architecture design', { error });
      return this.fallback();
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const architecture = result.intermediate?.architecture;

    return [
      {
        type: 'system-architecture',
        content: architecture,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildArchitecturePrompt(input: any): string {
    const { ideaSpec, previousArtifacts } = input;

    // Extract relevant context
    const prdComplete = previousArtifacts?.find((a: any) => a.type === 'prd-complete')?.content;
    const bizdevComplete = previousArtifacts?.find((a: any) => a.type === 'bizdev-complete')?.content;

    const functionalReqs = prdComplete?.prd?.functionalRequirements || [];
    const nonFunctionalReqs = prdComplete?.prd?.nonFunctionalRequirements || {};
    const techPreferences = ideaSpec?.constraints?.technicalPreferences || [];
    const complianceReqs = ideaSpec?.constraints?.complianceRequirements || [];
    const scalingNeeds = bizdevComplete?.viability?.financialProjections?.revenue || {};

    return `You are a Senior Solution Architect designing a comprehensive system architecture.

PROJECT CONTEXT:
Title: ${ideaSpec?.title || 'N/A'}
Description: ${ideaSpec?.description || 'N/A'}
Target Users: ${ideaSpec?.targetUsers?.join(', ') || 'N/A'}
Problem: ${ideaSpec?.problemStatement || 'N/A'}

FUNCTIONAL REQUIREMENTS (${functionalReqs.length} total):
${functionalReqs.slice(0, 10).map((req: any) => `- [${req.priority}] ${req.requirement}`).join('\n')}
${functionalReqs.length > 10 ? `... and ${functionalReqs.length - 10} more` : ''}

NON-FUNCTIONAL REQUIREMENTS:
Performance: ${nonFunctionalReqs.performance || 'Not specified'}
Security: ${nonFunctionalReqs.security || 'Not specified'}
Scalability: ${nonFunctionalReqs.scalability || 'Not specified'}
Reliability: ${nonFunctionalReqs.reliability || 'Not specified'}

TECHNICAL PREFERENCES:
${techPreferences.map((tech: string) => `- ${tech}`).join('\n') || 'None specified'}

COMPLIANCE REQUIREMENTS:
${complianceReqs.map((req: string) => `- ${req}`).join('\n') || 'None specified'}

SCALING EXPECTATIONS:
Year 1 Revenue Target: $${scalingNeeds.year1?.toLocaleString() || 'N/A'}
Expected User Growth: ${ideaSpec?.successCriteria?.join(', ') || 'N/A'}

TASK:
Design a comprehensive system architecture that addresses all requirements. Your response MUST be valid JSON matching this structure:

{
  "overview": {
    "architectureStyle": "monolithic|microservices|serverless|hybrid|event-driven",
    "rationale": "Why this architecture style was chosen (2-3 sentences)",
    "designPrinciples": ["principle 1", "principle 2", "principle 3", "principle 4", "principle 5"],
    "qualityAttributes": [
      {
        "attribute": "performance|scalability|reliability|security|maintainability|cost-efficiency",
        "priority": "critical|high|medium|low",
        "targetMetric": "Specific measurable target"
      }
    ]
  },
  "components": [
    {
      "name": "Component Name",
      "type": "frontend|backend|database|cache|queue|storage|external",
      "description": "What this component does",
      "technologies": ["tech1", "tech2"],
      "responsibilities": ["responsibility 1", "responsibility 2"],
      "dependencies": ["component1", "component2"],
      "scalingStrategy": "horizontal|vertical|both|none",
      "deploymentUnit": "monolith|service|serverless|container"
    }
  ],
  "integrationPatterns": [
    {
      "pattern": "rest|graphql|grpc|websocket|event-driven|batch",
      "useCase": "What this pattern is used for",
      "components": ["component1", "component2"],
      "rationale": "Why this pattern was chosen",
      "considerations": ["consideration1", "consideration2"]
    }
  ],
  "securityArchitecture": {
    "overview": "High-level security approach (2-3 sentences)",
    "controls": [
      {
        "category": "authentication|authorization|encryption|network|data|monitoring",
        "control": "Security control name",
        "implementation": "How it will be implemented",
        "priority": "critical|high|medium|low"
      }
    ],
    "complianceRequirements": ["requirement1", "requirement2"],
    "threatModel": [
      {
        "threat": "Description of threat",
        "severity": "critical|high|medium|low",
        "mitigation": "How threat is mitigated"
      }
    ]
  },
  "scalabilityDesign": {
    "currentCapacity": {
      "users": "e.g., 1,000 concurrent users",
      "requests": "e.g., 100 req/sec",
      "data": "e.g., 10 GB"
    },
    "targetCapacity": {
      "users": "e.g., 100,000 concurrent users",
      "requests": "e.g., 10,000 req/sec",
      "data": "e.g., 10 TB"
    },
    "scalingStrategies": [
      {
        "component": "Component name",
        "strategy": "How it scales",
        "triggers": ["trigger1", "trigger2"]
      }
    ],
    "bottlenecks": [
      {
        "component": "Component name",
        "issue": "Bottleneck description",
        "solution": "How to address it"
      }
    ]
  },
  "architectureDecisionRecords": [
    {
      "id": "ADR-001",
      "title": "Decision title",
      "status": "proposed|accepted|superseded|deprecated",
      "context": "Why this decision was needed (2-3 sentences)",
      "decision": "What was decided (2-3 sentences)",
      "consequences": {
        "positive": ["benefit1", "benefit2"],
        "negative": ["tradeoff1", "tradeoff2"],
        "risks": ["risk1", "risk2"]
      },
      "alternatives": [
        {
          "option": "Alternative option",
          "rationale": "Why it was rejected"
        }
      ]
    }
  ],
  "technologyStack": [
    {
      "layer": "frontend|backend|database|infrastructure|devops|monitoring",
      "technologies": [
        {
          "name": "Technology name",
          "version": "Version or 'latest'",
          "purpose": "What it's used for",
          "justification": "Why it was chosen"
        }
      ]
    }
  ],
  "deploymentArchitecture": {
    "environments": [
      {
        "name": "development|staging|production",
        "configuration": "Environment configuration",
        "resources": "Resource allocation"
      }
    ],
    "cicdPipeline": "CI/CD pipeline description",
    "disasterRecovery": {
      "rpo": "Recovery Point Objective (e.g., 1 hour)",
      "rto": "Recovery Time Objective (e.g., 4 hours)",
      "backupStrategy": "Backup and recovery strategy"
    }
  }
}

REQUIREMENTS:
- Design 4-8 system components with clear responsibilities
- Create 5-8 Architecture Decision Records (ADRs) for key architectural choices
- Include 3-5 integration patterns
- Define 8-12 security controls across all categories
- Specify scalability strategies for each component
- Validate technology choices against technical preferences
- Address all compliance requirements
- Include threat modeling with 5-10 threats
- Design for the target scale in business projections

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parseArchitecture(text: string): SystemArchitecture {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Normalize architecture style
      if (parsed.overview?.architectureStyle) {
        const normalized = this.normalizeArchitectureStyle(parsed.overview.architectureStyle);
        parsed.overview.architectureStyle = normalized;
      }

      // Normalize component types
      if (parsed.components) {
        parsed.components = parsed.components.map((c: any) => ({
          ...c,
          type: this.normalizeComponentType(c.type),
          scalingStrategy: this.normalizeScalingStrategy(c.scalingStrategy),
          deploymentUnit: this.normalizeDeploymentUnit(c.deploymentUnit),
        }));
      }

      // Normalize integration patterns
      if (parsed.integrationPatterns) {
        parsed.integrationPatterns = parsed.integrationPatterns.map((p: any) => ({
          ...p,
          pattern: this.normalizeIntegrationPattern(p.pattern),
        }));
      }

      // Normalize security controls
      if (parsed.securityArchitecture?.controls) {
        parsed.securityArchitecture.controls = parsed.securityArchitecture.controls.map((c: any) => ({
          ...c,
          category: this.normalizeSecurityCategory(c.category),
          priority: this.normalizePriority(c.priority),
        }));
      }

      // Normalize ADR status
      if (parsed.architectureDecisionRecords) {
        parsed.architectureDecisionRecords = parsed.architectureDecisionRecords.map((adr: any) => ({
          ...adr,
          status: this.normalizeADRStatus(adr.status),
        }));
      }

      return parsed as SystemArchitecture;
    } catch (error) {
      this.logger.error('Failed to parse architecture', { error });
      throw error;
    }
  }

  private normalizeArchitectureStyle(style: string): 'monolithic' | 'microservices' | 'serverless' | 'hybrid' | 'event-driven' {
    const lower = style?.toLowerCase().trim() || '';
    if (lower.includes('microservice')) return 'microservices';
    if (lower.includes('serverless') || lower.includes('faas')) return 'serverless';
    if (lower.includes('event') || lower.includes('eda')) return 'event-driven';
    if (lower.includes('hybrid')) return 'hybrid';
    return 'monolithic';
  }

  private normalizeComponentType(type: string): 'frontend' | 'backend' | 'database' | 'cache' | 'queue' | 'storage' | 'external' {
    const lower = type?.toLowerCase().trim() || '';
    if (lower.includes('front') || lower.includes('ui') || lower.includes('client')) return 'frontend';
    if (lower.includes('back') || lower.includes('api') || lower.includes('server')) return 'backend';
    if (lower.includes('db') || lower.includes('database')) return 'database';
    if (lower.includes('cache') || lower.includes('redis')) return 'cache';
    if (lower.includes('queue') || lower.includes('message')) return 'queue';
    if (lower.includes('storage') || lower.includes('blob') || lower.includes('s3')) return 'storage';
    if (lower.includes('external') || lower.includes('third')) return 'external';
    return 'backend';
  }

  private normalizeScalingStrategy(strategy: string): 'horizontal' | 'vertical' | 'both' | 'none' {
    const lower = strategy?.toLowerCase().trim() || '';
    if (lower.includes('horizontal') || lower.includes('scale out')) return 'horizontal';
    if (lower.includes('vertical') || lower.includes('scale up')) return 'vertical';
    if (lower.includes('both')) return 'both';
    return 'none';
  }

  private normalizeDeploymentUnit(unit: string): 'monolith' | 'service' | 'serverless' | 'container' {
    const lower = unit?.toLowerCase().trim() || '';
    if (lower.includes('serverless') || lower.includes('lambda') || lower.includes('function')) return 'serverless';
    if (lower.includes('container') || lower.includes('docker') || lower.includes('k8s')) return 'container';
    if (lower.includes('service') || lower.includes('micro')) return 'service';
    return 'monolith';
  }

  private normalizeIntegrationPattern(pattern: string): 'rest' | 'graphql' | 'grpc' | 'websocket' | 'event-driven' | 'batch' {
    const lower = pattern?.toLowerCase().trim() || '';
    if (lower.includes('graphql')) return 'graphql';
    if (lower.includes('grpc')) return 'grpc';
    if (lower.includes('websocket') || lower.includes('ws')) return 'websocket';
    if (lower.includes('event') || lower.includes('async') || lower.includes('message')) return 'event-driven';
    if (lower.includes('batch')) return 'batch';
    return 'rest';
  }

  private normalizeSecurityCategory(category: string): 'authentication' | 'authorization' | 'encryption' | 'network' | 'data' | 'monitoring' {
    const lower = category?.toLowerCase().trim() || '';
    if (lower.includes('authn') || lower.includes('authentication')) return 'authentication';
    if (lower.includes('authz') || lower.includes('authorization')) return 'authorization';
    if (lower.includes('encrypt') || lower.includes('crypto')) return 'encryption';
    if (lower.includes('network') || lower.includes('firewall')) return 'network';
    if (lower.includes('data') || lower.includes('privacy')) return 'data';
    if (lower.includes('monitor') || lower.includes('logging') || lower.includes('audit')) return 'monitoring';
    return 'authentication';
  }

  private normalizePriority(priority: string): 'critical' | 'high' | 'medium' | 'low' {
    const lower = priority?.toLowerCase().trim() || '';
    if (lower.includes('critical') || lower.includes('p0')) return 'critical';
    if (lower.includes('high') || lower.includes('p1')) return 'high';
    if (lower.includes('medium') || lower.includes('p2')) return 'medium';
    return 'low';
  }

  private normalizeADRStatus(status: string): 'proposed' | 'accepted' | 'superseded' | 'deprecated' {
    const lower = status?.toLowerCase().trim() || '';
    if (lower.includes('accept')) return 'accepted';
    if (lower.includes('supersed') || lower.includes('replaced')) return 'superseded';
    if (lower.includes('deprecat')) return 'deprecated';
    return 'proposed';
  }

  private fallback(): ReasoningResult {
    this.logger.warn('Using fallback architecture');

    const architecture: SystemArchitecture = {
      overview: {
        architectureStyle: 'monolithic',
        rationale: 'Starting with a monolithic architecture for faster initial development and simpler deployment.',
        designPrinciples: [
          'Separation of concerns',
          'Single responsibility',
          'DRY (Don\'t Repeat Yourself)',
          'KISS (Keep It Simple, Stupid)',
          'YAGNI (You Aren\'t Gonna Need It)',
        ],
        qualityAttributes: [
          { attribute: 'performance', priority: 'high', targetMetric: '< 500ms response time' },
          { attribute: 'security', priority: 'critical', targetMetric: 'Zero critical vulnerabilities' },
          { attribute: 'scalability', priority: 'medium', targetMetric: 'Support 10K concurrent users' },
        ],
      },
      components: [
        {
          name: 'Web Application',
          type: 'frontend',
          description: 'User-facing web interface',
          technologies: ['React', 'TypeScript'],
          responsibilities: ['User interface', 'Client-side routing', 'State management'],
          dependencies: ['API Server'],
          scalingStrategy: 'horizontal',
          deploymentUnit: 'container',
        },
        {
          name: 'API Server',
          type: 'backend',
          description: 'REST API server',
          technologies: ['Node.js', 'Express'],
          responsibilities: ['Business logic', 'Request validation', 'Authentication'],
          dependencies: ['Database', 'Cache'],
          scalingStrategy: 'horizontal',
          deploymentUnit: 'container',
        },
        {
          name: 'Database',
          type: 'database',
          description: 'Primary data storage',
          technologies: ['PostgreSQL'],
          responsibilities: ['Data persistence', 'ACID transactions'],
          dependencies: [],
          scalingStrategy: 'vertical',
          deploymentUnit: 'service',
        },
        {
          name: 'Cache',
          type: 'cache',
          description: 'In-memory caching',
          technologies: ['Redis'],
          responsibilities: ['Session storage', 'Query caching'],
          dependencies: [],
          scalingStrategy: 'horizontal',
          deploymentUnit: 'service',
        },
      ],
      integrationPatterns: [
        {
          pattern: 'rest',
          useCase: 'Client-server communication',
          components: ['Web Application', 'API Server'],
          rationale: 'RESTful APIs are well-understood and widely supported',
          considerations: ['Use proper HTTP verbs', 'Version the API', 'Implement rate limiting'],
        },
      ],
      securityArchitecture: {
        overview: 'Defense-in-depth approach with multiple security layers',
        controls: [
          {
            category: 'authentication',
            control: 'JWT-based authentication',
            implementation: 'OAuth 2.0 with JWT tokens',
            priority: 'critical',
          },
          {
            category: 'authorization',
            control: 'Role-based access control (RBAC)',
            implementation: 'Permission checks at API layer',
            priority: 'critical',
          },
          {
            category: 'encryption',
            control: 'TLS 1.3 for data in transit',
            implementation: 'HTTPS everywhere',
            priority: 'critical',
          },
        ],
        complianceRequirements: [],
        threatModel: [
          {
            threat: 'SQL injection',
            severity: 'high',
            mitigation: 'Parameterized queries and ORM usage',
          },
        ],
      },
      scalabilityDesign: {
        currentCapacity: {
          users: '1,000 concurrent users',
          requests: '100 req/sec',
          data: '10 GB',
        },
        targetCapacity: {
          users: '10,000 concurrent users',
          requests: '1,000 req/sec',
          data: '1 TB',
        },
        scalingStrategies: [
          {
            component: 'API Server',
            strategy: 'Horizontal scaling with load balancer',
            triggers: ['CPU > 70%', 'Request queue length > 100'],
          },
        ],
        bottlenecks: [],
      },
      architectureDecisionRecords: [
        {
          id: 'ADR-001',
          title: 'Use Monolithic Architecture',
          status: 'accepted',
          context: 'Need to choose between monolithic and microservices architecture',
          decision: 'Start with a monolithic architecture',
          consequences: {
            positive: ['Faster development', 'Simpler deployment'],
            negative: ['Harder to scale individual components'],
            risks: ['May need to refactor to microservices later'],
          },
          alternatives: [
            {
              option: 'Microservices',
              rationale: 'Too complex for initial MVP',
            },
          ],
        },
      ],
      technologyStack: [
        {
          layer: 'frontend',
          technologies: [
            { name: 'React', version: '18.x', purpose: 'UI framework', justification: 'Industry standard' },
          ],
        },
        {
          layer: 'backend',
          technologies: [
            { name: 'Node.js', version: '20.x', purpose: 'Runtime', justification: 'JavaScript everywhere' },
          ],
        },
      ],
      deploymentArchitecture: {
        environments: [
          {
            name: 'production',
            configuration: 'High availability',
            resources: 'Auto-scaling',
          },
        ],
        cicdPipeline: 'GitHub Actions with automated testing and deployment',
        disasterRecovery: {
          rpo: '1 hour',
          rto: '4 hours',
          backupStrategy: 'Daily automated backups with point-in-time recovery',
        },
      },
    };

    return {
      reasoning: 'Using fallback monolithic architecture as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        architecture,
      },
    };
  }
}
