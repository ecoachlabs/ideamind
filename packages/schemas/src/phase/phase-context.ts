/**
 * PhaseContext JSON Schema
 * 
 * Defines the execution context for a phase
 * Spec: phase.txt:4-7
 */

export const PhaseContextSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ideamine.ai/schemas/phase-context.json',
  title: 'PhaseContext',
  description: 'Execution context for a phase',
  type: 'object',
  required: ['runId', 'phase', 'inputs', 'budgets'],
  properties: {
    runId: {
      type: 'string',
      format: 'uuid',
      description: 'Unique identifier for the run',
    },
    phase: {
      type: 'string',
      enum: [
        'intake',
        'ideation',
        'critique',
        'prd',
        'bizdev',
        'architecture',
        'build',
        'security',
        'story-loop',
        'qa',
        'aesthetic',
        'release',
        'beta',
      ],
      description: 'Phase identifier',
    },
    inputs: {
      type: 'object',
      description: 'Input data for the phase',
      additionalProperties: true,
    },
    budgets: {
      type: 'object',
      required: ['tokens', 'tools_minutes', 'wallclock_minutes'],
      properties: {
        tokens: {
          type: 'number',
          minimum: 0,
          description: 'Token budget for LLM calls',
        },
        tools_minutes: {
          type: 'number',
          minimum: 0,
          description: 'Tool usage time budget in minutes',
        },
        wallclock_minutes: {
          type: 'number',
          minimum: 0,
          description: 'Maximum wall-clock time in minutes',
        },
      },
    },
    artifacts: {
      type: 'array',
      description: 'Previous phase artifacts available as inputs',
      items: {
        type: 'object',
        required: ['id', 'type'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
          },
          type: {
            type: 'string',
          },
          content: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    kmap: {
      type: 'object',
      description: 'Knowledge map context',
      additionalProperties: true,
    },
    metadata: {
      type: 'object',
      description: 'Additional metadata',
      properties: {
        attemptNumber: {
          type: 'number',
          minimum: 1,
          description: 'Current attempt number (for retries)',
        },
        previousAttemptFailures: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              reason: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  },
  additionalProperties: false,
};

/**
 * TypeScript type derived from schema
 */
export interface PhaseContext {
  runId: string;
  phase: string;
  inputs: Record<string, any>;
  budgets: {
    tokens: number;
    tools_minutes: number;
    wallclock_minutes: number;
  };
  artifacts?: Array<{
    id: string;
    type: string;
    content?: Record<string, any>;
  }>;
  kmap?: Record<string, any>;
  metadata?: {
    attemptNumber?: number;
    previousAttemptFailures?: Array<{
      reason: string;
      timestamp: string;
    }>;
  };
}
