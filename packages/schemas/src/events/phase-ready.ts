/**
 * Phase Ready Event Schema
 * 
 * Emitted when a phase completes execution and produces artifacts ready for gate evaluation
 * Spec: phase.txt:37
 */

export const PhaseReadyEventSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'PhaseReadyEvent',
  description: 'Event emitted when phase execution completes and is ready for gate evaluation',
  type: 'object',
  required: ['event', 'timestamp', 'runId', 'phase', 'artifacts', 'usage'],
  properties: {
    event: {
      type: 'string',
      const: 'phase.ready',
      description: 'Event type identifier',
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
      description: 'ISO 8601 timestamp of event',
    },
    runId: {
      type: 'string',
      description: 'Unique run identifier',
    },
    phase: {
      type: 'string',
      description: 'Phase name',
    },
    artifacts: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'type'],
        properties: {
          id: {
            type: 'string',
            description: 'Artifact unique identifier',
          },
          type: {
            type: 'string',
            description: 'Artifact type (e.g., IdeaSpec, PRD, API)',
          },
          path: {
            type: 'string',
            description: 'Storage path or URL',
          },
          size_bytes: {
            type: 'number',
            minimum: 0,
            description: 'Artifact size in bytes',
          },
          checksum: {
            type: 'string',
            description: 'Content checksum (e.g., SHA256)',
          },
        },
      },
      description: 'Artifacts produced by the phase',
    },
    usage: {
      type: 'object',
      required: ['tokens', 'tools_minutes', 'wallclock_ms'],
      properties: {
        tokens: {
          type: 'number',
          minimum: 0,
          description: 'Total tokens consumed',
        },
        tools_minutes: {
          type: 'number',
          minimum: 0,
          description: 'Total tool time used in minutes',
        },
        wallclock_ms: {
          type: 'number',
          minimum: 0,
          description: 'Total wall-clock time in milliseconds',
        },
        cost_usd: {
          type: 'number',
          minimum: 0,
          description: 'Estimated cost in USD',
        },
      },
    },
    kmap_refs: {
      type: 'array',
      items: {
        type: 'string',
      },
      description: 'Knowledge map references used',
    },
    metadata: {
      type: 'object',
      additionalProperties: true,
      description: 'Additional metadata',
    },
  },
  additionalProperties: false,
};

export interface PhaseReadyEvent {
  event: 'phase.ready';
  timestamp: string;
  runId: string;
  phase: string;
  artifacts: Array<{
    id: string;
    type: string;
    path?: string;
    size_bytes?: number;
    checksum?: string;
  }>;
  usage: {
    tokens: number;
    tools_minutes: number;
    wallclock_ms: number;
    cost_usd?: number;
  };
  kmap_refs?: string[];
  metadata?: Record<string, any>;
}
