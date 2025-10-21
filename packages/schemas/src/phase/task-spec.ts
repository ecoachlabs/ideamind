/**
 * TaskSpec JSON Schema
 * 
 * Defines a task to be executed (agent or tool invocation)
 * Spec: phase.txt:9-16
 */

export const TaskSpecSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ideamine.ai/schemas/task-spec.json',
  title: 'TaskSpec',
  description: 'Specification for a task execution',
  type: 'object',
  required: ['id', 'phase', 'type', 'target', 'input'],
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description: 'Unique task identifier',
    },
    phase: {
      type: 'string',
      description: 'Phase this task belongs to',
    },
    type: {
      type: 'string',
      enum: ['agent', 'tool'],
      description: 'Task type: agent or tool invocation',
    },
    target: {
      type: 'string',
      description: 'Agent or tool name to invoke',
    },
    input: {
      type: 'object',
      description: 'Input data for the task',
      additionalProperties: true,
    },
    budgets: {
      type: 'object',
      properties: {
        tokens: {
          type: 'number',
          minimum: 0,
        },
        tools_minutes: {
          type: 'number',
          minimum: 0,
        },
        wallclock_minutes: {
          type: 'number',
          minimum: 0,
        },
      },
    },
    dependencies: {
      type: 'array',
      description: 'Task IDs that must complete before this task',
      items: {
        type: 'string',
        format: 'uuid',
      },
    },
    retry_policy: {
      type: 'object',
      properties: {
        max_attempts: {
          type: 'number',
          minimum: 1,
          default: 3,
        },
        strategy: {
          type: 'string',
          enum: ['exponential', 'linear', 'constant'],
          default: 'exponential',
        },
        base_delay_ms: {
          type: 'number',
          minimum: 0,
          default: 1000,
        },
      },
    },
    checkpointable: {
      type: 'boolean',
      default: true,
      description: 'Whether this task supports checkpointing',
    },
    idempotence_key: {
      type: 'string',
      description: 'Key for idempotent execution',
    },
    metadata: {
      type: 'object',
      description: 'Additional task metadata',
      additionalProperties: true,
    },
  },
  additionalProperties: false,
};

/**
 * TypeScript type derived from schema
 */
export interface TaskSpec {
  id: string;
  phase: string;
  type: 'agent' | 'tool';
  target: string;
  input: Record<string, any>;
  budgets?: {
    tokens?: number;
    tools_minutes?: number;
    wallclock_minutes?: number;
  };
  dependencies?: string[];
  retry_policy?: {
    max_attempts?: number;
    strategy?: 'exponential' | 'linear' | 'constant';
    base_delay_ms?: number;
  };
  checkpointable?: boolean;
  idempotence_key?: string;
  metadata?: Record<string, any>;
}
