/**
 * Validation schemas for /api/runs endpoints
 *
 * SECURITY FIX #11: Input validation schemas
 */

import { ValidationSchema } from '../middleware/validation';

/**
 * POST /api/runs - Create new run
 */
export const createRunSchema: ValidationSchema = {
  body: {
    runId: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 100,
      pattern: /^[a-zA-Z0-9_-]+$/,
      description: 'Unique identifier for the run',
    },
    phases: {
      type: 'array',
      required: true,
      minItems: 1,
      maxItems: 50,
      items: {
        type: 'string',
        enum: [
          'INTAKE',
          'IDEATION',
          'CRITIQUE',
          'PRD',
          'BIZDEV',
          'ARCH',
          'BUILD',
          'QA',
          'AESTHETIC',
          'RELEASE',
          'BETA',
          'FIX',
          'GA',
        ],
      },
      description: 'Array of phase names to execute',
    },
    initialContext: {
      type: 'object',
      required: true,
      properties: {
        ideaText: {
          type: 'string',
          required: true,
          minLength: 10,
          maxLength: 50000,
          description: 'The initial idea description',
        },
        userId: {
          type: 'string',
          required: true,
          maxLength: 100,
          description: 'User ID initiating the run',
        },
        projectId: {
          type: 'string',
          required: false,
          maxLength: 100,
          description: 'Optional project ID',
        },
      },
      description: 'Initial context for the workflow run',
    },
    budgets: {
      type: 'object',
      required: false,
      properties: {
        total_tokens: {
          type: 'number',
          required: false,
          min: 1000,
          max: 100000000,
          integer: true,
          description: 'Maximum tokens to use',
        },
        total_tools_minutes: {
          type: 'number',
          required: false,
          min: 1,
          max: 10000,
          integer: true,
          description: 'Maximum tool execution time in minutes',
        },
        total_wallclock_minutes: {
          type: 'number',
          required: false,
          min: 1,
          max: 100000,
          integer: true,
          description: 'Maximum wall clock time in minutes',
        },
      },
      description: 'Budget constraints for the run',
    },
    options: {
      type: 'object',
      required: false,
      properties: {
        auto_advance: {
          type: 'boolean',
          required: false,
          description: 'Automatically advance to next phase',
        },
        stop_on_gate_failure: {
          type: 'boolean',
          required: false,
          description: 'Stop execution if gate check fails',
        },
        enable_checkpoints: {
          type: 'boolean',
          required: false,
          description: 'Enable checkpoint saving',
        },
        checkpoint_interval_phases: {
          type: 'number',
          required: false,
          min: 1,
          max: 50,
          integer: true,
          description: 'Save checkpoint every N phases',
        },
      },
      description: 'Execution options',
    },
  },
};

/**
 * GET /api/runs/:runId - Get run details
 */
export const getRunSchema: ValidationSchema = {
  params: {
    runId: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 100,
      pattern: /^[a-zA-Z0-9_-]+$/,
      description: 'Run identifier',
    },
  },
};

/**
 * GET /api/runs - List runs
 */
export const listRunsSchema: ValidationSchema = {
  query: {
    status: {
      type: 'string',
      required: false,
      enum: ['created', 'running', 'paused', 'completed', 'failed', 'cancelled'],
      description: 'Filter by run status',
    },
    limit: {
      type: 'number',
      required: false,
      min: 1,
      max: 1000,
      integer: true,
      description: 'Maximum number of results',
    },
    offset: {
      type: 'number',
      required: false,
      min: 0,
      max: 1000000,
      integer: true,
      description: 'Number of results to skip',
    },
  },
};

/**
 * POST /api/runs/:runId/pause - Pause run
 */
export const pauseRunSchema: ValidationSchema = {
  params: {
    runId: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 100,
      pattern: /^[a-zA-Z0-9_-]+$/,
      description: 'Run identifier',
    },
  },
};

/**
 * POST /api/runs/:runId/resume - Resume run
 */
export const resumeRunSchema: ValidationSchema = {
  params: {
    runId: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 100,
      pattern: /^[a-zA-Z0-9_-]+$/,
      description: 'Run identifier',
    },
  },
};

/**
 * POST /api/runs/:runId/cancel - Cancel run
 */
export const cancelRunSchema: ValidationSchema = {
  params: {
    runId: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 100,
      pattern: /^[a-zA-Z0-9_-]+$/,
      description: 'Run identifier',
    },
  },
};
