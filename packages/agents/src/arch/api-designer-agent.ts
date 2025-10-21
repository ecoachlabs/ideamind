import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * API Endpoint
 */
interface APIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  description: string;
  authentication: 'public' | 'authenticated' | 'admin';
  requestSchema: {
    parameters?: {
      name: string;
      in: 'path' | 'query' | 'header';
      required: boolean;
      type: string;
      description: string;
    }[];
    body?: {
      contentType: string;
      schema: any;
    };
  };
  responseSchema: {
    success: {
      statusCode: number;
      schema: any;
    };
    errors: {
      statusCode: number;
      description: string;
      schema?: any;
    }[];
  };
  rateLimit: {
    requests: number;
    window: string;
  };
  cacheable: boolean;
  idempotent: boolean;
}

/**
 * API Resource
 */
interface APIResource {
  name: string;
  description: string;
  endpoints: APIEndpoint[];
  relationships: {
    resource: string;
    type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  }[];
}

/**
 * Error Response Standard
 */
interface ErrorResponseStandard {
  format: {
    error: {
      code: string;
      message: string;
      details?: any;
      timestamp: string;
      traceId: string;
    };
  };
  commonErrors: {
    code: string;
    statusCode: number;
    message: string;
    description: string;
  }[];
}

/**
 * API Design
 */
interface APIDesign {
  overview: {
    apiStyle: 'REST' | 'GraphQL' | 'gRPC' | 'Hybrid';
    baseUrl: string;
    version: string;
    versioningStrategy: 'url' | 'header' | 'query' | 'content-negotiation';
    rationale: string;
  };
  authentication: {
    mechanisms: {
      type: 'jwt' | 'oauth2' | 'api-key' | 'basic' | 'bearer';
      description: string;
      usage: string;
    }[];
    authorizationModel: 'rbac' | 'abac' | 'custom';
    tokenExpiry: {
      accessToken: string;
      refreshToken: string;
    };
  };
  resources: APIResource[];
  errorHandling: ErrorResponseStandard;
  pagination: {
    strategy: 'offset' | 'cursor' | 'page';
    defaultLimit: number;
    maxLimit: number;
    responseFormat: {
      data: any[];
      pagination: {
        total?: number;
        limit: number;
        offset?: number;
        cursor?: string;
        nextCursor?: string;
        hasMore: boolean;
      };
    };
  };
  filtering: {
    supportedOperators: string[];
    syntax: string;
    examples: {
      description: string;
      query: string;
    }[];
  };
  sorting: {
    syntax: string;
    multiSort: boolean;
    examples: {
      description: string;
      query: string;
    }[];
  };
  rateLimiting: {
    global: {
      requests: number;
      window: string;
    };
    perUser: {
      requests: number;
      window: string;
    };
    headers: {
      limit: string;
      remaining: string;
      reset: string;
    };
  };
  webhooks: {
    supported: boolean;
    events: {
      event: string;
      description: string;
      payload: any;
    }[];
    security: {
      signatureHeader: string;
      algorithm: string;
    };
  };
  documentation: {
    standard: 'OpenAPI 3.0' | 'GraphQL Schema' | 'gRPC Proto' | 'Custom';
    interactiveExplorer: boolean;
    codeExamples: {
      language: string;
      library: string;
    }[];
  };
  versioning: {
    strategy: string;
    deprecationPolicy: string;
    sunsetPeriod: string;
    migrationGuides: boolean;
  };
  crossCuttingConcerns: {
    cors: {
      allowedOrigins: string[];
      allowedMethods: string[];
      allowedHeaders: string[];
      credentials: boolean;
    };
    compression: {
      enabled: boolean;
      algorithms: string[];
    };
    caching: {
      strategy: 'client' | 'server' | 'both';
      headers: string[];
      cdnIntegration: boolean;
    };
    monitoring: {
      metricsCollected: string[];
      loggingLevel: 'debug' | 'info' | 'warn' | 'error';
      distributed Tracing: boolean;
    };
  };
}

/**
 * APIDesignerAgent
 *
 * Designs comprehensive API contracts including:
 * - RESTful or GraphQL API design
 * - Endpoint specifications with request/response schemas
 * - Authentication and authorization models
 * - API versioning and deprecation strategies
 * - Rate limiting and throttling
 * - Error handling standards
 * - Pagination, filtering, and sorting
 * - Webhook specifications
 * - API documentation standards (OpenAPI/GraphQL Schema)
 *
 * Input: IdeaSpec + PRD + System Architecture
 * Output: Complete API design artifact
 */
export class APIDesignerAgent extends BaseAgent {
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
        'Analyze functional requirements and user stories from PRD',
        'Design API resources and endpoints',
        'Define authentication and authorization models',
        'Specify error handling, pagination, and versioning strategies',
      ],
      estimatedTotalDurationMs: 12000, // ~12 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildAPIDesignPrompt(input);

      this.logger.info('Invoking LLM for API design');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const apiDesign = this.parseAPIDesign(content);

      return {
        reasoning: `Designed ${apiDesign.overview.apiStyle} API with ${apiDesign.resources.length} resources and ${this.countEndpoints(apiDesign)} total endpoints.`,
        confidence: 0.85,
        intermediate: {
          apiDesign,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for API design', { error });
      return this.fallback();
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const apiDesign = result.intermediate?.apiDesign;

    return [
      {
        type: 'api-design',
        content: apiDesign,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildAPIDesignPrompt(input: any): string {
    const { ideaSpec, previousArtifacts } = input;

    // Extract relevant context
    const prdComplete = previousArtifacts?.find((a: any) => a.type === 'prd-complete')?.content;
    const systemArch = previousArtifacts?.find((a: any) => a.type === 'system-architecture')?.content;

    const functionalReqs = prdComplete?.prd?.functionalRequirements || [];
    const userJourneys = prdComplete?.prd?.userJourneys || [];
    const architectureStyle = systemArch?.overview?.architectureStyle || 'REST';
    const complianceReqs = ideaSpec?.constraints?.complianceRequirements || [];

    return `You are a Senior API Designer creating comprehensive API specifications.

PROJECT CONTEXT:
Title: ${ideaSpec?.title || 'N/A'}
Description: ${ideaSpec?.description || 'N/A'}
Architecture Style: ${architectureStyle}

FUNCTIONAL REQUIREMENTS (${functionalReqs.length} total):
${functionalReqs.slice(0, 15).map((req: any) => `- [${req.priority}] ${req.category}: ${req.requirement}`).join('\n')}
${functionalReqs.length > 15 ? `... and ${functionalReqs.length - 15} more` : ''}

USER JOURNEYS (${userJourneys.length} total):
${userJourneys.slice(0, 5).map((j: any) => `- ${j.persona}: ${j.scenario}`).join('\n')}
${userJourneys.length > 5 ? `... and ${userJourneys.length - 5} more` : ''}

COMPLIANCE REQUIREMENTS:
${complianceReqs.map((req: string) => `- ${req}`).join('\n') || 'None specified'}

TASK:
Design a comprehensive API that addresses all functional requirements and user journeys. Your response MUST be valid JSON matching this structure:

{
  "overview": {
    "apiStyle": "REST|GraphQL|gRPC|Hybrid",
    "baseUrl": "https://api.example.com",
    "version": "v1",
    "versioningStrategy": "url|header|query|content-negotiation",
    "rationale": "Why this API style was chosen (2-3 sentences)"
  },
  "authentication": {
    "mechanisms": [
      {
        "type": "jwt|oauth2|api-key|basic|bearer",
        "description": "Description of auth mechanism",
        "usage": "How to use it"
      }
    ],
    "authorizationModel": "rbac|abac|custom",
    "tokenExpiry": {
      "accessToken": "15 minutes",
      "refreshToken": "7 days"
    }
  },
  "resources": [
    {
      "name": "ResourceName",
      "description": "What this resource represents",
      "endpoints": [
        {
          "method": "GET|POST|PUT|PATCH|DELETE",
          "path": "/api/v1/resource/{id}",
          "summary": "Brief endpoint summary",
          "description": "Detailed description",
          "authentication": "public|authenticated|admin",
          "requestSchema": {
            "parameters": [
              {
                "name": "parameter-name",
                "in": "path|query|header",
                "required": true,
                "type": "string|number|boolean",
                "description": "Parameter description"
              }
            ],
            "body": {
              "contentType": "application/json",
              "schema": {
                "type": "object",
                "properties": {},
                "required": []
              }
            }
          },
          "responseSchema": {
            "success": {
              "statusCode": 200,
              "schema": {}
            },
            "errors": [
              {
                "statusCode": 400,
                "description": "Bad Request",
                "schema": {}
              }
            ]
          },
          "rateLimit": {
            "requests": 100,
            "window": "1 minute"
          },
          "cacheable": false,
          "idempotent": true
        }
      ],
      "relationships": [
        {
          "resource": "OtherResource",
          "type": "one-to-one|one-to-many|many-to-many"
        }
      ]
    }
  ],
  "errorHandling": {
    "format": {
      "error": {
        "code": "ERROR_CODE",
        "message": "Human-readable message",
        "details": {},
        "timestamp": "ISO 8601 timestamp",
        "traceId": "unique-trace-id"
      }
    },
    "commonErrors": [
      {
        "code": "VALIDATION_ERROR",
        "statusCode": 400,
        "message": "Request validation failed",
        "description": "When request doesn't pass validation"
      }
    ]
  },
  "pagination": {
    "strategy": "offset|cursor|page",
    "defaultLimit": 20,
    "maxLimit": 100,
    "responseFormat": {
      "data": [],
      "pagination": {
        "total": 0,
        "limit": 20,
        "offset": 0,
        "hasMore": false
      }
    }
  },
  "filtering": {
    "supportedOperators": ["eq", "ne", "gt", "lt", "in", "contains"],
    "syntax": "?filter[field][operator]=value",
    "examples": [
      {
        "description": "Filter by status",
        "query": "?filter[status][eq]=active"
      }
    ]
  },
  "sorting": {
    "syntax": "?sort=field1,-field2",
    "multiSort": true,
    "examples": [
      {
        "description": "Sort by created date descending",
        "query": "?sort=-createdAt"
      }
    ]
  },
  "rateLimiting": {
    "global": {
      "requests": 1000,
      "window": "1 hour"
    },
    "perUser": {
      "requests": 100,
      "window": "1 hour"
    },
    "headers": {
      "limit": "X-RateLimit-Limit",
      "remaining": "X-RateLimit-Remaining",
      "reset": "X-RateLimit-Reset"
    }
  },
  "webhooks": {
    "supported": true,
    "events": [
      {
        "event": "resource.created",
        "description": "Triggered when a resource is created",
        "payload": {}
      }
    ],
    "security": {
      "signatureHeader": "X-Webhook-Signature",
      "algorithm": "HMAC-SHA256"
    }
  },
  "documentation": {
    "standard": "OpenAPI 3.0|GraphQL Schema|gRPC Proto|Custom",
    "interactiveExplorer": true,
    "codeExamples": [
      {
        "language": "JavaScript",
        "library": "fetch"
      }
    ]
  },
  "versioning": {
    "strategy": "URL-based versioning (/v1, /v2)",
    "deprecationPolicy": "6 months notice before deprecation",
    "sunsetPeriod": "12 months",
    "migrationGuides": true
  },
  "crossCuttingConcerns": {
    "cors": {
      "allowedOrigins": ["https://app.example.com"],
      "allowedMethods": ["GET", "POST", "PUT", "DELETE"],
      "allowedHeaders": ["Content-Type", "Authorization"],
      "credentials": true
    },
    "compression": {
      "enabled": true,
      "algorithms": ["gzip", "br"]
    },
    "caching": {
      "strategy": "client|server|both",
      "headers": ["Cache-Control", "ETag"],
      "cdnIntegration": false
    },
    "monitoring": {
      "metricsCollected": ["request-count", "response-time", "error-rate"],
      "loggingLevel": "info",
      "distributedTracing": true
    }
  }
}

REQUIREMENTS:
- Design 5-10 API resources based on functional requirements
- Each resource should have 3-7 endpoints (CRUD + custom actions)
- Include proper request/response schemas for all endpoints
- Define 10-15 common error codes
- Specify rate limiting for all endpoints
- Include webhook support if applicable
- Design for the compliance requirements
- Use RESTful conventions (or GraphQL schema if that style is chosen)
- Include proper authentication/authorization for all endpoints

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parseAPIDesign(text: string): APIDesign {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Normalize API style
      if (parsed.overview?.apiStyle) {
        parsed.overview.apiStyle = this.normalizeAPIStyle(parsed.overview.apiStyle);
      }

      // Normalize HTTP methods
      if (parsed.resources) {
        parsed.resources = parsed.resources.map((r: any) => ({
          ...r,
          endpoints: r.endpoints?.map((e: any) => ({
            ...e,
            method: this.normalizeHTTPMethod(e.method),
            authentication: this.normalizeAuthLevel(e.authentication),
          })) || [],
        }));
      }

      return parsed as APIDesign;
    } catch (error) {
      this.logger.error('Failed to parse API design', { error });
      throw error;
    }
  }

  private normalizeAPIStyle(style: string): 'REST' | 'GraphQL' | 'gRPC' | 'Hybrid' {
    const lower = style?.toLowerCase().trim() || '';
    if (lower.includes('graphql')) return 'GraphQL';
    if (lower.includes('grpc')) return 'gRPC';
    if (lower.includes('hybrid')) return 'Hybrid';
    return 'REST';
  }

  private normalizeHTTPMethod(method: string): 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' {
    const upper = method?.toUpperCase().trim() || 'GET';
    if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(upper)) {
      return upper as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    }
    return 'GET';
  }

  private normalizeAuthLevel(level: string): 'public' | 'authenticated' | 'admin' {
    const lower = level?.toLowerCase().trim() || '';
    if (lower.includes('public') || lower.includes('anonymous')) return 'public';
    if (lower.includes('admin') || lower.includes('super')) return 'admin';
    return 'authenticated';
  }

  private countEndpoints(apiDesign: APIDesign): number {
    return apiDesign.resources.reduce((total, resource) => {
      return total + (resource.endpoints?.length || 0);
    }, 0);
  }

  private fallback(): ReasoningResult {
    this.logger.warn('Using fallback API design');

    const apiDesign: APIDesign = {
      overview: {
        apiStyle: 'REST',
        baseUrl: 'https://api.example.com',
        version: 'v1',
        versioningStrategy: 'url',
        rationale: 'RESTful API design chosen for simplicity and wide ecosystem support.',
      },
      authentication: {
        mechanisms: [
          {
            type: 'jwt',
            description: 'JSON Web Token authentication',
            usage: 'Include JWT in Authorization header: Bearer <token>',
          },
        ],
        authorizationModel: 'rbac',
        tokenExpiry: {
          accessToken: '15 minutes',
          refreshToken: '7 days',
        },
      },
      resources: [
        {
          name: 'Users',
          description: 'User management',
          endpoints: [
            {
              method: 'GET',
              path: '/api/v1/users/{id}',
              summary: 'Get user by ID',
              description: 'Retrieve a single user by their unique identifier',
              authentication: 'authenticated',
              requestSchema: {
                parameters: [
                  {
                    name: 'id',
                    in: 'path',
                    required: true,
                    type: 'string',
                    description: 'User ID',
                  },
                ],
              },
              responseSchema: {
                success: {
                  statusCode: 200,
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      email: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                },
                errors: [
                  {
                    statusCode: 404,
                    description: 'User not found',
                  },
                ],
              },
              rateLimit: {
                requests: 100,
                window: '1 minute',
              },
              cacheable: true,
              idempotent: true,
            },
          ],
          relationships: [],
        },
      ],
      errorHandling: {
        format: {
          error: {
            code: 'ERROR_CODE',
            message: 'Human-readable error message',
            details: {},
            timestamp: new Date().toISOString(),
            traceId: 'unique-trace-id',
          },
        },
        commonErrors: [
          {
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            message: 'Request validation failed',
            description: 'The request did not pass validation',
          },
          {
            code: 'UNAUTHORIZED',
            statusCode: 401,
            message: 'Authentication required',
            description: 'Valid authentication credentials are required',
          },
        ],
      },
      pagination: {
        strategy: 'offset',
        defaultLimit: 20,
        maxLimit: 100,
        responseFormat: {
          data: [],
          pagination: {
            total: 0,
            limit: 20,
            offset: 0,
            hasMore: false,
          },
        },
      },
      filtering: {
        supportedOperators: ['eq', 'ne', 'gt', 'lt', 'in'],
        syntax: '?filter[field][operator]=value',
        examples: [
          {
            description: 'Filter by status',
            query: '?filter[status][eq]=active',
          },
        ],
      },
      sorting: {
        syntax: '?sort=field1,-field2',
        multiSort: true,
        examples: [
          {
            description: 'Sort by creation date descending',
            query: '?sort=-createdAt',
          },
        ],
      },
      rateLimiting: {
        global: {
          requests: 1000,
          window: '1 hour',
        },
        perUser: {
          requests: 100,
          window: '1 hour',
        },
        headers: {
          limit: 'X-RateLimit-Limit',
          remaining: 'X-RateLimit-Remaining',
          reset: 'X-RateLimit-Reset',
        },
      },
      webhooks: {
        supported: false,
        events: [],
        security: {
          signatureHeader: 'X-Webhook-Signature',
          algorithm: 'HMAC-SHA256',
        },
      },
      documentation: {
        standard: 'OpenAPI 3.0',
        interactiveExplorer: true,
        codeExamples: [
          { language: 'JavaScript', library: 'fetch' },
          { language: 'Python', library: 'requests' },
        ],
      },
      versioning: {
        strategy: 'URL-based versioning',
        deprecationPolicy: '6 months notice',
        sunsetPeriod: '12 months',
        migrationGuides: true,
      },
      crossCuttingConcerns: {
        cors: {
          allowedOrigins: ['*'],
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
          allowedHeaders: ['Content-Type', 'Authorization'],
          credentials: true,
        },
        compression: {
          enabled: true,
          algorithms: ['gzip', 'br'],
        },
        caching: {
          strategy: 'both',
          headers: ['Cache-Control', 'ETag'],
          cdnIntegration: false,
        },
        monitoring: {
          metricsCollected: ['request-count', 'response-time', 'error-rate'],
          loggingLevel: 'info',
          distributedTracing: true,
        },
      },
    };

    return {
      reasoning: 'Using fallback REST API design as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        apiDesign,
      },
    };
  }
}
