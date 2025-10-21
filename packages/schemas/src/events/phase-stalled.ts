/**
 * Phase Stalled Event Schema
 * 
 * Emitted when a phase execution stalls (no progress within threshold)
 * Spec: phase.txt:38
 */

export const PhaseStalledEventSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'PhaseStalledEvent',
  description: 'Event emitted when phase execution stalls',
  type: 'object',
  required: ['event', 'timestamp', 'runId', 'phase', 'stall_duration_ms', 'last_progress'],
  properties: {
    event: {
      type: 'string',
      const: 'phase.stalled',
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
    stall_duration_ms: {
      type: 'number',
      minimum: 0,
      description: 'Duration of stall in milliseconds',
    },
    stall_threshold_ms: {
      type: 'number',
      minimum: 0,
      description: 'Configured stall threshold in milliseconds',
    },
    last_progress: {
      type: 'object',
      required: ['timestamp', 'completed_tasks', 'total_tasks'],
      properties: {
        timestamp: {
          type: 'string',
          format: 'date-time',
          description: 'When last progress was made',
        },
        completed_tasks: {
          type: 'number',
          minimum: 0,
          description: 'Tasks completed at last progress',
        },
        total_tasks: {
          type: 'number',
          minimum: 0,
          description: 'Total tasks',
        },
        current_task: {
          type: 'string',
          description: 'Task that was executing',
        },
      },
      description: 'Last recorded progress state',
    },
    suspected_cause: {
      type: 'string',
      enum: ['hung-agent', 'resource-exhaustion', 'external-dependency', 'deadlock', 'infinite-loop', 'unknown'],
      description: 'Suspected cause of stall',
    },
    current_state: {
      type: 'object',
      properties: {
        active_tasks: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Currently active task IDs',
        },
        blocked_tasks: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Blocked task IDs',
        },
        resource_usage: {
          type: 'object',
          properties: {
            cpu_percent: {
              type: 'number',
              minimum: 0,
              maximum: 100,
            },
            memory_mb: {
              type: 'number',
              minimum: 0,
            },
          },
        },
      },
      description: 'Current execution state',
    },
    unsticker_action: {
      type: 'string',
      enum: ['kill-task', 'restart-agent', 'increase-timeout', 'skip-task', 'manual-intervention'],
      description: 'Action taken by Unsticker to resolve stall',
    },
    metadata: {
      type: 'object',
      additionalProperties: true,
      description: 'Additional metadata',
    },
  },
  additionalProperties: false,
};

export interface PhaseStalledEvent {
  event: 'phase.stalled';
  timestamp: string;
  runId: string;
  phase: string;
  stall_duration_ms: number;
  stall_threshold_ms?: number;
  last_progress: {
    timestamp: string;
    completed_tasks: number;
    total_tasks: number;
    current_task?: string;
  };
  suspected_cause?: 'hung-agent' | 'resource-exhaustion' | 'external-dependency' | 'deadlock' | 'infinite-loop' | 'unknown';
  current_state?: {
    active_tasks?: string[];
    blocked_tasks?: string[];
    resource_usage?: {
      cpu_percent?: number;
      memory_mb?: number;
    };
  };
  unsticker_action?: 'kill-task' | 'restart-agent' | 'increase-timeout' | 'skip-task' | 'manual-intervention';
  metadata?: Record<string, any>;
}
