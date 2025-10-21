import { BaseAgent, AgentCapabilities, AgentResult } from '../base-agent';

/**
 * ArchitectureAgent - Designs technical architecture
 *
 * Creates comprehensive system architecture including:
 * - System components and their interactions
 * - Technology stack recommendations
 * - Data models and schemas
 * - Infrastructure and deployment design
 * - Security and scalability considerations
 */
export class ArchitectureAgent extends BaseAgent {
  constructor(apiKey: string, model?: string) {
    super('ArchitectureAgent', apiKey, model);
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: false,
      supportsBatching: false,
      supportsCheckpointing: true,
      maxInputSize: 80000,
      maxOutputSize: 120000,
    };
  }

  async execute(input: any, context: Record<string, any>): Promise<AgentResult> {
    const startTime = Date.now();

    this.logger.info({ input }, 'Executing Architecture Agent');

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

      const { text, tokensUsed } = await this.callClaude(prompt, 10000, systemPrompt);

      const architecture = this.parseJSON(text);

      return {
        success: true,
        output: architecture,
        metadata: {
          tokensUsed,
          duration_ms: Date.now() - startTime,
          model: this.model,
          components_count: architecture.system_components?.length || 0,
        },
      };
    } catch (error: any) {
      this.logger.error({ error }, 'Architecture Agent execution failed');

      return {
        success: false,
        output: null,
        error: error.message,
      };
    }
  }

  private buildPrompt(input: any, context: Record<string, any>): string {
    return `You are an Architecture Agent that designs comprehensive system architectures.

## Input:
${JSON.stringify(input, null, 2)}

## Context:
${JSON.stringify(context, null, 2)}

## Your Task:
Design a complete technical architecture for this system.

Include:
1. **System Overview**: High-level architecture pattern
2. **Components**: All major system components and their responsibilities
3. **Technology Stack**: Recommended technologies with rationale
4. **Data Architecture**: Data models, storage, and flow
5. **API Design**: Endpoints, protocols, and contracts
6. **Infrastructure**: Deployment architecture
7. **Security**: Security design and considerations
8. **Scalability**: How the system scales
9. **Integration Points**: External systems and APIs
10. **Development Approach**: Build strategy

Output as JSON:
{
  "architecture_overview": {
    "pattern": "microservices|monolith|serverless|hybrid",
    "rationale": "Why this pattern",
    "key_principles": ["principle1", "principle2"],
    "architecture_style": "event-driven|REST|GraphQL|etc"
  },
  "system_components": [
    {
      "name": "Component name",
      "type": "frontend|backend|database|service|gateway|etc",
      "responsibility": "What it does",
      "technologies": ["tech1", "tech2"],
      "interfaces": ["API", "EventBus"],
      "dependencies": ["component1"],
      "scalability": "stateless|stateful|distributed",
      "criticality": "low|medium|high|critical"
    }
  ],
  "technology_stack": {
    "frontend": {
      "framework": "React|Vue|Angular|etc",
      "rationale": "Why chosen",
      "alternatives_considered": ["alt1"],
      "key_libraries": ["lib1", "lib2"]
    },
    "backend": {
      "language": "TypeScript|Python|Go|etc",
      "framework": "Express|FastAPI|etc",
      "rationale": "Why chosen",
      "alternatives_considered": ["alt1"]
    },
    "database": {
      "primary": "PostgreSQL|MongoDB|etc",
      "rationale": "Why chosen",
      "caching": "Redis|Memcached|etc",
      "search": "Elasticsearch|etc or null"
    },
    "infrastructure": {
      "hosting": "AWS|GCP|Azure|etc",
      "containers": "Docker|Kubernetes",
      "ci_cd": "GitHub Actions|etc",
      "monitoring": "Prometheus|Datadog|etc"
    },
    "third_party_services": [
      {
        "service": "Service name",
        "purpose": "What it provides",
        "alternatives": ["alt1"]
      }
    ]
  },
  "data_architecture": {
    "data_models": [
      {
        "entity": "Entity name",
        "description": "What it represents",
        "key_attributes": ["attr1", "attr2"],
        "relationships": [
          {
            "type": "one-to-many|many-to-many|etc",
            "entity": "Related entity"
          }
        ],
        "storage": "Database choice",
        "indexes": ["index1"],
        "estimated_volume": "Volume estimate"
      }
    ],
    "data_flow": [
      {
        "flow": "Flow description",
        "source": "Source component",
        "destination": "Destination component",
        "protocol": "HTTP|gRPC|EventBus|etc",
        "data_format": "JSON|Protocol Buffers|etc"
      }
    ],
    "caching_strategy": "Strategy description",
    "backup_strategy": "Backup approach"
  },
  "api_design": {
    "style": "REST|GraphQL|gRPC|hybrid",
    "versioning": "Versioning strategy",
    "authentication": "JWT|OAuth2|API Keys|etc",
    "rate_limiting": "Rate limit strategy",
    "endpoints": [
      {
        "path": "/api/v1/resource",
        "method": "GET|POST|PUT|DELETE",
        "purpose": "What it does",
        "request_schema": "Schema description",
        "response_schema": "Schema description",
        "authentication_required": true
      }
    ],
    "websocket_support": "If real-time needed",
    "documentation": "OpenAPI|etc"
  },
  "infrastructure_design": {
    "deployment_model": "cloud-native|hybrid|on-premise",
    "environments": ["dev", "staging", "production"],
    "container_orchestration": "Kubernetes|ECS|etc",
    "load_balancing": "Strategy",
    "auto_scaling": {
      "enabled": true,
      "metrics": ["CPU", "memory", "request-rate"],
      "min_instances": 2,
      "max_instances": 10
    },
    "disaster_recovery": "DR strategy",
    "regions": ["us-east-1", "eu-west-1"]
  },
  "security_design": {
    "authentication_methods": ["method1"],
    "authorization_model": "RBAC|ABAC|etc",
    "data_encryption": {
      "at_rest": "Encryption method",
      "in_transit": "TLS 1.3"
    },
    "secrets_management": "Vault|AWS Secrets Manager|etc",
    "security_measures": [
      {
        "area": "API|Database|Network|etc",
        "measure": "Security measure",
        "implementation": "How to implement"
      }
    ],
    "compliance": ["GDPR", "SOC2", "etc"],
    "vulnerability_scanning": "Tool/approach"
  },
  "scalability_design": {
    "horizontal_scaling": "How components scale horizontally",
    "vertical_scaling": "When to scale vertically",
    "database_scaling": "Sharding|Read replicas|etc",
    "caching_layers": ["layer1", "layer2"],
    "cdn_strategy": "CDN usage",
    "bottlenecks": [
      {
        "component": "Component name",
        "bottleneck": "Description",
        "mitigation": "How to address"
      }
    ],
    "capacity_planning": "Planning approach"
  },
  "integration_points": [
    {
      "external_system": "System name",
      "integration_type": "API|webhook|event|batch",
      "purpose": "Why integrate",
      "protocol": "REST|SOAP|etc",
      "authentication": "Auth method",
      "error_handling": "Error strategy"
    }
  ],
  "development_approach": {
    "project_structure": "Monorepo|multirepo|etc",
    "branching_strategy": "GitFlow|trunk-based|etc",
    "testing_strategy": {
      "unit_tests": "Framework and coverage target",
      "integration_tests": "Approach",
      "e2e_tests": "Tool and approach"
    },
    "ci_cd_pipeline": "Pipeline stages",
    "code_quality": ["linting", "type-checking", "etc"],
    "documentation": "Strategy"
  },
  "architecture_decisions": [
    {
      "decision": "Key decision made",
      "rationale": "Why this decision",
      "alternatives": ["alt1", "alt2"],
      "trade_offs": "Trade-offs involved",
      "implications": "What this means for development"
    }
  ],
  "risks_and_considerations": [
    {
      "area": "Area of concern",
      "risk": "Risk description",
      "mitigation": "How to mitigate"
    }
  ],
  "implementation_phases": [
    {
      "phase": "Phase 1",
      "focus": "What to build",
      "components": ["component1", "component2"],
      "duration_estimate": "Estimate",
      "success_criteria": ["criteria1"]
    }
  ]
}`;
  }

  private getSystemPrompt(): string {
    return `You are a senior software architect specializing in:
- Designing scalable, maintainable systems
- Making pragmatic technology choices
- Balancing complexity with functionality
- Anticipating future growth and changes
- Creating clear, actionable architecture documents

Consider:
- Current best practices and industry standards
- Total cost of ownership
- Team capabilities and learning curve
- Maintenance and operational overhead
- Security and compliance requirements

Be thorough yet practical. Focus on decisions that matter.`;
  }
}
