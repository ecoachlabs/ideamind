/**
 * Phase Completed Event Schema
 * 
 * Emitted when a phase fully completes (after passing gate)
 * Spec: phase.txt:38
 */

export const PhaseCompletedEventSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'PhaseCompletedEvent',
  description: 'Event emitted when a phase fully completes',
  type: 'object',
  required: ['event', 'timestamp', 'runId', 'phase', 'status', 'usage', 'duration_ms'],
  properties: {
    event: {
      type: 'string',
      const: 'phase.completed',
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
    status: {
      type: 'string',
      enum: ['success', 'failed', 'timeout', 'cancelled'],
      description: 'Completion status',
    },
    duration_ms: {
      type: 'number',
      minimum: 0,
      description: 'Total phase duration in milliseconds',
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
    artifacts: {
      type: 'array',
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
            description: 'Artifact type',
          },
          path: {
            type: 'string',
            description: 'Storage path or URL',
          },
        },
      },
      description: 'Final artifacts produced',
    },
    gate_score: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Final gate score',
    },
    attempts: {
      type: 'number',
      minimum: 1,
      description: 'Number of attempts needed to complete',
    },
    checkpoints_created: {
      type: 'number',
      minimum: 0,
      description: 'Number of checkpoints created',
    },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Error message',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'When error occurred',
          },
          recovered: {
            type: 'boolean',
            description: 'Whether error was recovered from',
          },
        },
      },
      description: 'Errors encountered during execution',
    },
    kmap_updates: {
      type: 'array',
      items: {
        type: 'string',
      },
      description: 'Knowledge map keys updated',
    },
    next_phase: {
      type: 'string',
      description: 'Next phase to execute (if success)',
    },
    metadata: {
      type: 'object',
      additionalProperties: true,
      description: 'Additional metadata',
    },
  },
  additionalProperties: false,
};

export interface PhaseCompletedEvent {
  event: 'phase.completed';
  timestamp: string;
  runId: string;
  phase: string;
  status: 'success' | 'failed' | 'timeout' | 'cancelled';
  duration_ms: number;
  usage: {
    tokens: number;
    tools_minutes: number;
    wallclock_ms: number;
    cost_usd?: number;
  };
  artifacts?: Array<{
    id: string;
    type: string;
    path?: string;
  }>;
  gate_score?: number;
  attempts?: number;
  checkpoints_created?: number;
  errors?: Array<{
    message?: string;
    timestamp?: string;
    recovered?: boolean;
  }>;
  kmap_updates?: string[];
  next_phase?: string;
  metadata?: Record<string, any>;
}
