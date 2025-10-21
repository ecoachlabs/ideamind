/**
 * Phase Started Event Schema
 * 
 * Emitted when a phase begins execution
 * Spec: phase.txt:35
 */

export const PhaseStartedEventSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'PhaseStartedEvent',
  description: 'Event emitted when a phase starts execution',
  type: 'object',
  required: ['event', 'timestamp', 'runId', 'phase', 'budgets'],
  properties: {
    event: {
      type: 'string',
      const: 'phase.started',
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
      description: 'Phase name (e.g., intake, ideation, prd)',
    },
    budgets: {
      type: 'object',
      required: ['tokens', 'tools_minutes', 'wallclock_minutes'],
      properties: {
        tokens: {
          type: 'number',
          minimum: 0,
          description: 'Token budget allocated',
        },
        tools_minutes: {
          type: 'number',
          minimum: 0,
          description: 'Tool usage budget in minutes',
        },
        wallclock_minutes: {
          type: 'number',
          minimum: 0,
          description: 'Wall-clock time budget in minutes',
        },
      },
    },
    agents: {
      type: 'array',
      items: {
        type: 'string',
      },
      description: 'List of agents configured for this phase',
    },
    parallelism: {
      type: 'string',
      enum: ['sequential', 'parallel', 'partial', 'iterative'],
      description: 'Parallelism strategy for this phase',
    },
    metadata: {
      type: 'object',
      additionalProperties: true,
      description: 'Additional metadata',
    },
  },
  additionalProperties: false,
};

export interface PhaseStartedEvent {
  event: 'phase.started';
  timestamp: string;
  runId: string;
  phase: string;
  budgets: {
    tokens: number;
    tools_minutes: number;
    wallclock_minutes: number;
  };
  agents?: string[];
  parallelism?: 'sequential' | 'parallel' | 'partial' | 'iterative';
  metadata?: Record<string, any>;
}
