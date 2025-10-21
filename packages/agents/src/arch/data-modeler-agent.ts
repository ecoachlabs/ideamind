import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Database Entity
 */
interface Entity {
  name: string;
  tableName: string;
  description: string;
  fields: {
    name: string;
    type: string;
    constraints: {
      primaryKey?: boolean;
      unique?: boolean;
      notNull?: boolean;
      default?: any;
      check?: string;
    };
    description: string;
  }[];
  indexes: {
    name: string;
    fields: string[];
    type: 'btree' | 'hash' | 'gin' | 'gist' | 'unique' | 'fulltext';
    rationale: string;
  }[];
  relationships: {
    name: string;
    type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
    targetEntity: string;
    foreignKey?: string;
    junctionTable?: string;
    cascadeDelete: boolean;
    rationale: string;
  }[];
}

/**
 * Data Validation Rule
 */
interface ValidationRule {
  entity: string;
  field: string;
  rule: string;
  errorMessage: string;
  level: 'database' | 'application' | 'both';
}

/**
 * Migration Strategy
 */
interface MigrationStrategy {
  approach: 'schema-first' | 'code-first' | 'database-first';
  versionControl: boolean;
  rollbackStrategy: string;
  seedData: {
    entity: string;
    description: string;
    sampleCount: number;
  }[];
  migrationSteps: {
    version: string;
    description: string;
    operations: string[];
    rollback: string[];
  }[];
}

/**
 * Query Optimization Guidance
 */
interface QueryOptimization {
  commonQueries: {
    description: string;
    query: string;
    indexRecommendation: string;
    estimatedFrequency: 'very-high' | 'high' | 'medium' | 'low';
  }[];
  performanceConsiderations: string[];
  caching Recommendations: {
    query: string;
    cacheKey: string;
    ttl: string;
    invalidationStrategy: string;
  }[];
}

/**
 * Data Model
 */
interface DataModel {
  overview: {
    databaseType: 'relational' | 'document' | 'graph' | 'key-value' | 'time-series' | 'hybrid';
    rationale: string;
    normalizationLevel: '1NF' | '2NF' | '3NF' | 'BCNF' | 'denormalized';
    designPrinciples: string[];
  };
  entities: Entity[];
  validationRules: ValidationRule[];
  migrationStrategy: MigrationStrategy;
  queryOptimization: QueryOptimization;
  dataGovernance: {
    retentionPolicies: {
      entity: string;
      retentionPeriod: string;
      archivalStrategy: string;
      deletionStrategy: string;
    }[];
    privacyControls: {
      entity: string;
      field: string;
      classification: 'public' | 'internal' | 'confidential' | 'restricted';
      encryption: boolean;
      masking: boolean;
      piiField: boolean;
    }[];
    auditLogging: {
      entity: string;
      operations: ('create' | 'read' | 'update' | 'delete')[];
      retentionPeriod: string;
    }[];
  };
  scalabilityConsiderations: {
    sharding: {
      enabled: boolean;
      strategy?: 'hash' | 'range' | 'geo' | 'custom';
      shardKey?: string;
      estimatedShards?: number;
    };
    partitioning: {
      entity: string;
      strategy: 'range' | 'list' | 'hash';
      partitionKey: string;
      rationale: string;
    }[];
    replication: {
      strategy: 'master-slave' | 'master-master' | 'multi-master';
      readReplicas: number;
      consistency: 'strong' | 'eventual';
    };
    archival: {
      entity: string;
      criteria: string;
      destination: 'cold-storage' | 'data-warehouse' | 'separate-db';
      frequency: string;
    }[];
  };
  backupAndRecovery: {
    backupFrequency: string;
    backupRetention: string;
    pointInTimeRecovery: boolean;
    testFrequency: string;
  };
}

/**
 * DataModelerAgent
 *
 * Designs comprehensive data models and database schemas including:
 * - Entity-Relationship (ER) diagrams
 * - Database schema with fields, constraints, and indexes
 * - Relationships (one-to-one, one-to-many, many-to-many)
 * - Data validation rules
 * - Migration strategies and version control
 * - Query optimization guidance
 * - Data governance (retention, privacy, audit logging)
 * - Scalability considerations (sharding, partitioning, replication)
 *
 * Input: IdeaSpec + PRD + System Architecture + API Design
 * Output: Complete data model artifact
 */
export class DataModelerAgent extends BaseAgent {
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
        'Analyze API resources and functional requirements',
        'Design entities with fields, constraints, and relationships',
        'Define indexes for query optimization',
        'Specify data governance and scalability strategies',
      ],
      estimatedTotalDurationMs: 12000, // ~12 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildDataModelPrompt(input);

      this.logger.info('Invoking LLM for data model design');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const dataModel = this.parseDataModel(content);

      return {
        reasoning: `Designed ${dataModel.overview.databaseType} data model with ${dataModel.entities.length} entities, ${this.countRelationships(dataModel)} relationships, and ${this.countIndexes(dataModel)} indexes.`,
        confidence: 0.85,
        intermediate: {
          dataModel,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for data model design', { error });
      return this.fallback();
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const dataModel = result.intermediate?.dataModel;

    return [
      {
        type: 'data-model',
        content: dataModel,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildDataModelPrompt(input: any): string {
    const { ideaSpec, previousArtifacts } = input;

    // Extract relevant context
    const prdComplete = previousArtifacts?.find((a: any) => a.type === 'prd-complete')?.content;
    const apiDesign = previousArtifacts?.find((a: any) => a.type === 'api-design')?.content;
    const systemArch = previousArtifacts?.find((a: any) => a.type === 'system-architecture')?.content;

    const functionalReqs = prdComplete?.prd?.functionalRequirements || [];
    const apiResources = apiDesign?.resources || [];
    const complianceReqs = ideaSpec?.constraints?.complianceRequirements || [];
    const scalingNeeds = systemArch?.scalabilityDesign || {};

    return `You are a Senior Database Architect designing a comprehensive data model.

PROJECT CONTEXT:
Title: ${ideaSpec?.title || 'N/A'}
Description: ${ideaSpec?.description || 'N/A'}

API RESOURCES (${apiResources.length} total):
${apiResources.map((r: any) => `- ${r.name}: ${r.description}`).join('\n') || 'None specified'}

FUNCTIONAL REQUIREMENTS (${functionalReqs.length} total):
${functionalReqs.slice(0, 10).map((req: any) => `- [${req.priority}] ${req.category}: ${req.requirement}`).join('\n')}
${functionalReqs.length > 10 ? `... and ${functionalReqs.length - 10} more` : ''}

COMPLIANCE REQUIREMENTS:
${complianceReqs.map((req: string) => `- ${req}`).join('\n') || 'None specified'}

SCALING EXPECTATIONS:
Target Users: ${scalingNeeds.targetCapacity?.users || 'Not specified'}
Target Data: ${scalingNeeds.targetCapacity?.data || 'Not specified'}

TASK:
Design a comprehensive data model that supports all API resources and functional requirements. Your response MUST be valid JSON matching this structure:

{
  "overview": {
    "databaseType": "relational|document|graph|key-value|time-series|hybrid",
    "rationale": "Why this database type was chosen (2-3 sentences)",
    "normalizationLevel": "1NF|2NF|3NF|BCNF|denormalized",
    "designPrinciples": ["principle 1", "principle 2", "principle 3", "principle 4"]
  },
  "entities": [
    {
      "name": "EntityName",
      "tableName": "entity_name",
      "description": "What this entity represents",
      "fields": [
        {
          "name": "id",
          "type": "UUID|INTEGER|SERIAL|VARCHAR|TEXT|TIMESTAMP|BOOLEAN|JSONB",
          "constraints": {
            "primaryKey": true,
            "unique": false,
            "notNull": true,
            "default": null,
            "check": null
          },
          "description": "Field description"
        }
      ],
      "indexes": [
        {
          "name": "idx_entity_field",
          "fields": ["field1", "field2"],
          "type": "btree|hash|gin|gist|unique|fulltext",
          "rationale": "Why this index is needed"
        }
      ],
      "relationships": [
        {
          "name": "relationshipName",
          "type": "one-to-one|one-to-many|many-to-one|many-to-many",
          "targetEntity": "TargetEntity",
          "foreignKey": "target_id",
          "junctionTable": "entity_target",
          "cascadeDelete": false,
          "rationale": "Why this relationship exists"
        }
      ]
    }
  ],
  "validationRules": [
    {
      "entity": "EntityName",
      "field": "fieldName",
      "rule": "Validation rule (e.g., length >= 8, regex pattern, range check)",
      "errorMessage": "Error message if validation fails",
      "level": "database|application|both"
    }
  ],
  "migrationStrategy": {
    "approach": "schema-first|code-first|database-first",
    "versionControl": true,
    "rollbackStrategy": "How to rollback migrations",
    "seedData": [
      {
        "entity": "EntityName",
        "description": "What seed data to include",
        "sampleCount": 10
      }
    ],
    "migrationSteps": [
      {
        "version": "001",
        "description": "Initial schema",
        "operations": ["CREATE TABLE ...", "CREATE INDEX ..."],
        "rollback": ["DROP INDEX ...", "DROP TABLE ..."]
      }
    ]
  },
  "queryOptimization": {
    "commonQueries": [
      {
        "description": "Query description",
        "query": "SELECT ... FROM ... WHERE ...",
        "indexRecommendation": "Which index to use",
        "estimatedFrequency": "very-high|high|medium|low"
      }
    ],
    "performanceConsiderations": ["consideration 1", "consideration 2"],
    "cachingRecommendations": [
      {
        "query": "Query to cache",
        "cacheKey": "Cache key pattern",
        "ttl": "5 minutes",
        "invalidationStrategy": "When to invalidate"
      }
    ]
  },
  "dataGovernance": {
    "retentionPolicies": [
      {
        "entity": "EntityName",
        "retentionPeriod": "7 years",
        "archivalStrategy": "How to archive",
        "deletionStrategy": "How to delete"
      }
    ],
    "privacyControls": [
      {
        "entity": "EntityName",
        "field": "fieldName",
        "classification": "public|internal|confidential|restricted",
        "encryption": true,
        "masking": false,
        "piiField": true
      }
    ],
    "auditLogging": [
      {
        "entity": "EntityName",
        "operations": ["create", "read", "update", "delete"],
        "retentionPeriod": "3 years"
      }
    ]
  },
  "scalabilityConsiderations": {
    "sharding": {
      "enabled": false,
      "strategy": "hash|range|geo|custom",
      "shardKey": "user_id",
      "estimatedShards": 10
    },
    "partitioning": [
      {
        "entity": "EntityName",
        "strategy": "range|list|hash",
        "partitionKey": "created_at",
        "rationale": "Why partitioning is needed"
      }
    ],
    "replication": {
      "strategy": "master-slave|master-master|multi-master",
      "readReplicas": 3,
      "consistency": "strong|eventual"
    },
    "archival": [
      {
        "entity": "EntityName",
        "criteria": "Records older than 2 years",
        "destination": "cold-storage|data-warehouse|separate-db",
        "frequency": "monthly"
      }
    ]
  },
  "backupAndRecovery": {
    "backupFrequency": "daily",
    "backupRetention": "30 days",
    "pointInTimeRecovery": true,
    "testFrequency": "quarterly"
  }
}

REQUIREMENTS:
- Design 5-12 entities based on API resources and functional requirements
- Each entity should have 5-15 fields with appropriate types and constraints
- Define primary keys, foreign keys, and unique constraints
- Create 2-5 indexes per entity for common queries
- Specify all entity relationships (one-to-one, one-to-many, many-to-many)
- Include validation rules for all entities
- Address compliance requirements (GDPR, HIPAA, etc.) with privacy controls
- Design for scalability (partitioning, replication, archival)
- Include 5-10 common query optimizations
- Specify migration strategy with rollback plans

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parseDataModel(text: string): DataModel {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Normalize database type
      if (parsed.overview?.databaseType) {
        parsed.overview.databaseType = this.normalizeDatabaseType(parsed.overview.databaseType);
      }

      // Normalize relationship types
      if (parsed.entities) {
        parsed.entities = parsed.entities.map((e: any) => ({
          ...e,
          relationships: e.relationships?.map((r: any) => ({
            ...r,
            type: this.normalizeRelationshipType(r.type),
          })) || [],
        }));
      }

      return parsed as DataModel;
    } catch (error) {
      this.logger.error('Failed to parse data model', { error });
      throw error;
    }
  }

  private normalizeDatabaseType(type: string): 'relational' | 'document' | 'graph' | 'key-value' | 'time-series' | 'hybrid' {
    const lower = type?.toLowerCase().trim() || '';
    if (lower.includes('document') || lower.includes('mongo')) return 'document';
    if (lower.includes('graph') || lower.includes('neo4j')) return 'graph';
    if (lower.includes('key-value') || lower.includes('redis') || lower.includes('dynamo')) return 'key-value';
    if (lower.includes('time-series') || lower.includes('influx')) return 'time-series';
    if (lower.includes('hybrid')) return 'hybrid';
    return 'relational';
  }

  private normalizeRelationshipType(type: string): 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many' {
    const lower = type?.toLowerCase().trim() || '';
    if (lower.includes('one-to-one') || lower === '1:1') return 'one-to-one';
    if (lower.includes('one-to-many') || lower === '1:n') return 'one-to-many';
    if (lower.includes('many-to-one') || lower === 'n:1') return 'many-to-one';
    if (lower.includes('many-to-many') || lower === 'n:m' || lower === 'm:n') return 'many-to-many';
    return 'one-to-many';
  }

  private countRelationships(dataModel: DataModel): number {
    return dataModel.entities.reduce((total, entity) => {
      return total + (entity.relationships?.length || 0);
    }, 0);
  }

  private countIndexes(dataModel: DataModel): number {
    return dataModel.entities.reduce((total, entity) => {
      return total + (entity.indexes?.length || 0);
    }, 0);
  }

  private fallback(): ReasoningResult {
    this.logger.warn('Using fallback data model');

    const dataModel: DataModel = {
      overview: {
        databaseType: 'relational',
        rationale: 'Relational database chosen for ACID guarantees and mature ecosystem.',
        normalizationLevel: '3NF',
        designPrinciples: [
          'Normalize to 3NF',
          'Use surrogate keys (UUIDs)',
          'Index foreign keys',
          'Avoid premature optimization',
        ],
      },
      entities: [
        {
          name: 'User',
          tableName: 'users',
          description: 'System users',
          fields: [
            {
              name: 'id',
              type: 'UUID',
              constraints: {
                primaryKey: true,
                notNull: true,
              },
              description: 'Unique user identifier',
            },
            {
              name: 'email',
              type: 'VARCHAR(255)',
              constraints: {
                unique: true,
                notNull: true,
              },
              description: 'User email address',
            },
            {
              name: 'created_at',
              type: 'TIMESTAMP',
              constraints: {
                notNull: true,
                default: 'CURRENT_TIMESTAMP',
              },
              description: 'Account creation timestamp',
            },
          ],
          indexes: [
            {
              name: 'idx_users_email',
              fields: ['email'],
              type: 'unique',
              rationale: 'Fast user lookup by email',
            },
          ],
          relationships: [],
        },
      ],
      validationRules: [
        {
          entity: 'User',
          field: 'email',
          rule: 'Valid email format',
          errorMessage: 'Invalid email address',
          level: 'both',
        },
      ],
      migrationStrategy: {
        approach: 'schema-first',
        versionControl: true,
        rollbackStrategy: 'Automated rollback using migration tool',
        seedData: [
          {
            entity: 'User',
            description: 'Test users for development',
            sampleCount: 10,
          },
        ],
        migrationSteps: [
          {
            version: '001',
            description: 'Initial schema',
            operations: ['CREATE TABLE users (...)'],
            rollback: ['DROP TABLE users'],
          },
        ],
      },
      queryOptimization: {
        commonQueries: [
          {
            description: 'Find user by email',
            query: 'SELECT * FROM users WHERE email = ?',
            indexRecommendation: 'idx_users_email',
            estimatedFrequency: 'very-high',
          },
        ],
        performanceConsiderations: [
          'Use connection pooling',
          'Implement query result caching',
        ],
        cachingRecommendations: [
          {
            query: 'SELECT * FROM users WHERE id = ?',
            cacheKey: 'user:{id}',
            ttl: '5 minutes',
            invalidationStrategy: 'On user update',
          },
        ],
      },
      dataGovernance: {
        retentionPolicies: [
          {
            entity: 'User',
            retentionPeriod: '7 years',
            archivalStrategy: 'Move to cold storage',
            deletionStrategy: 'Hard delete after archival',
          },
        ],
        privacyControls: [
          {
            entity: 'User',
            field: 'email',
            classification: 'confidential',
            encryption: true,
            masking: true,
            piiField: true,
          },
        ],
        auditLogging: [
          {
            entity: 'User',
            operations: ['create', 'update', 'delete'],
            retentionPeriod: '3 years',
          },
        ],
      },
      scalabilityConsiderations: {
        sharding: {
          enabled: false,
        },
        partitioning: [],
        replication: {
          strategy: 'master-slave',
          readReplicas: 2,
          consistency: 'eventual',
        },
        archival: [],
      },
      backupAndRecovery: {
        backupFrequency: 'daily',
        backupRetention: '30 days',
        pointInTimeRecovery: true,
        testFrequency: 'quarterly',
      },
    };

    return {
      reasoning: 'Using fallback relational data model as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        dataModel,
      },
    };
  }
}
