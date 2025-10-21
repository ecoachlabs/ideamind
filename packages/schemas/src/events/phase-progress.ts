/**
 * Phase Progress Event Schema
 * 
 * Emitted periodically during phase execution to report progress
 * Spec: phase.txt:36
 */

export const PhaseProgressEventSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'PhaseProgressEvent',
  description: 'Event emitted to report phase execution progress',
  type: 'object',
  required: ['event', 'timestamp', 'runId', 'phase', 'progress', 'usage'],
  properties: {
    event: {
      type: 'string',
      const: 'phase.progress',
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
    progress: {
      type: 'object',
      required: ['completed_tasks', 'total_tasks', 'percent'],
      properties: {
        completed_tasks: {
          type: 'number',
          minimum: 0,
          description: 'Number of completed tasks',
        },
        total_tasks: {
          type: 'number',
          minimum: 0,
          description: 'Total number of tasks',
        },
        percent: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Progress percentage',
        },
        current_task: {
          type: 'string',
          description: 'Currently executing task ID',
        },
      },
    },
    usage: {
      type: 'object',
      required: ['tokens', 'tools_minutes', 'wallclock_ms'],
      properties: {
        tokens: {
          type: 'number',
          minimum: 0,
          description: 'Tokens consumed so far',
        },
        tools_minutes: {
          type: 'number',
          minimum: 0,
          description: 'Tool time used in minutes',
        },
        wallclock_ms: {
          type: 'number',
          minimum: 0,
          description: 'Wall-clock time elapsed in milliseconds',
        },
      },
    },
    artifacts_produced: {
      type: 'array',
      items: {
        type: 'string',
      },
      description: 'Artifact IDs produced so far',
    },
    metadata: {
      type: 'object',
      additionalProperties: true,
      description: 'Additional metadata',
    },
  },
  additionalProperties: false,
};

export interface PhaseProgressEvent {
  event: 'phase.progress';
  timestamp: string;
  runId: string;
  phase: string;
  progress: {
    completed_tasks: number;
    total_tasks: number;
    percent: number;
    current_task?: string;
  };
  usage: {
    tokens: number;
    tools_minutes: number;
    wallclock_ms: number;
  };
  artifacts_produced?: string[];
  metadata?: Record<string, any>;
}
