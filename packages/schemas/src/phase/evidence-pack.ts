/**
 * EvidencePack JSON Schema
 * 
 * Package of evidence for gate evaluation
 * Spec: phase.txt:18-23
 */

export const EvidencePackSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ideamine.ai/schemas/evidence-pack.json',
  title: 'EvidencePack',
  description: 'Evidence package for gate evaluation',
  type: 'object',
  required: ['artifacts', 'guard_reports', 'metrics'],
  properties: {
    artifacts: {
      type: 'array',
      description: 'Artifact IDs produced in this phase',
      items: {
        type: 'string',
        format: 'uuid',
      },
      minItems: 1,
    },
    guard_reports: {
      type: 'array',
      description: 'Results from guard evaluations',
      items: {
        type: 'object',
        required: ['type', 'pass', 'timestamp'],
        properties: {
          type: {
            type: 'string',
            description: 'Guard type (e.g., completeness, contradictions, security)',
          },
          pass: {
            type: 'boolean',
            description: 'Whether guard passed',
          },
          score: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Numeric score (0-1)',
          },
          reasons: {
            type: 'array',
            items: { type: 'string' },
            description: 'Reasons for pass/fail',
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          metadata: {
            type: 'object',
            additionalProperties: true,
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
    },
    qav_summary: {
      type: 'object',
      description: 'Q/A/V Triad summary',
      properties: {
        questions_count: {
          type: 'number',
          minimum: 0,
        },
        answered_count: {
          type: 'number',
          minimum: 0,
        },
        validated_count: {
          type: 'number',
          minimum: 0,
        },
        grounding_score: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Average grounding score',
        },
        assumptions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              assumption: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              mitigation: { type: 'string' },
            },
          },
        },
      },
    },
    kmap_refs: {
      type: 'array',
      description: 'Knowledge map frame references',
      items: {
        type: 'string',
      },
    },
    metrics: {
      type: 'object',
      required: ['duration_ms', 'tokens_used', 'tools_minutes_used', 'cost_usd'],
      properties: {
        duration_ms: {
          type: 'number',
          minimum: 0,
          description: 'Phase duration in milliseconds',
        },
        tokens_used: {
          type: 'number',
          minimum: 0,
          description: 'Total tokens consumed',
        },
        tools_minutes_used: {
          type: 'number',
          minimum: 0,
          description: 'Total tool usage time',
        },
        cost_usd: {
          type: 'number',
          minimum: 0,
          description: 'Total cost in USD',
        },
        agents_executed: {
          type: 'number',
          minimum: 0,
        },
        agents_succeeded: {
          type: 'number',
          minimum: 0,
        },
        agents_failed: {
          type: 'number',
          minimum: 0,
        },
      },
    },
    provenance: {
      type: 'object',
      description: 'Provenance information',
      properties: {
        phase_coordinator_version: { type: 'string' },
        created_at: { type: 'string', format: 'date-time' },
        input_artifacts: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
        },
      },
    },
  },
  additionalProperties: false,
};

/**
 * TypeScript type derived from schema
 */
export interface EvidencePack {
  artifacts: string[];
  guard_reports: Array<{
    type: string;
    pass: boolean;
    score?: number;
    reasons?: string[];
    severity?: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Record<string, any>;
    timestamp: string;
  }>;
  qav_summary?: {
    questions_count?: number;
    answered_count?: number;
    validated_count?: number;
    grounding_score?: number;
    assumptions?: Array<{
      assumption: string;
      confidence: number;
      mitigation?: string;
    }>;
  };
  kmap_refs?: string[];
  metrics: {
    duration_ms: number;
    tokens_used: number;
    tools_minutes_used: number;
    cost_usd: number;
    agents_executed?: number;
    agents_succeeded?: number;
    agents_failed?: number;
  };
  provenance?: {
    phase_coordinator_version?: string;
    created_at?: string;
    input_artifacts?: string[];
  };
}
