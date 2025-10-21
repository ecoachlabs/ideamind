/**
 * Phase Gate Failed Event Schema
 * 
 * Emitted when a phase fails its quality gate evaluation
 * Spec: phase.txt:38
 */

export const PhaseGateFailedEventSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'PhaseGateFailedEvent',
  description: 'Event emitted when a phase fails gate evaluation',
  type: 'object',
  required: ['event', 'timestamp', 'runId', 'phase', 'gate_score', 'guard_reports', 'failure_reasons'],
  properties: {
    event: {
      type: 'string',
      const: 'phase.gate.failed',
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
    gate_score: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Overall gate score (0.0 to 1.0)',
    },
    pass_threshold: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Required threshold for passing',
    },
    guard_reports: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['type', 'pass', 'score', 'timestamp'],
        properties: {
          type: {
            type: 'string',
            description: 'Guard type (e.g., completeness, contradictions)',
          },
          pass: {
            type: 'boolean',
            description: 'Whether this guard passed',
          },
          score: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Guard score',
          },
          reasons: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Reasons for pass/fail',
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            description: 'Issue severity',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'When guard was evaluated',
          },
        },
      },
      description: 'Individual guard evaluation results',
    },
    failure_reasons: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['category', 'description'],
        properties: {
          category: {
            type: 'string',
            enum: ['completeness', 'contradictions', 'coverage', 'quality', 'security', 'performance', 'other'],
            description: 'Failure category',
          },
          description: {
            type: 'string',
            description: 'Human-readable failure description',
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            description: 'Issue severity',
          },
          suggestion: {
            type: 'string',
            description: 'Suggested fix or improvement',
          },
        },
      },
      description: 'Detailed failure reasons',
    },
    attempt_number: {
      type: 'number',
      minimum: 1,
      description: 'Current attempt number',
    },
    max_attempts: {
      type: 'number',
      minimum: 1,
      description: 'Maximum attempts allowed',
    },
    auto_fix_strategy: {
      type: 'string',
      enum: ['rerun-qav', 'add-missing-agents', 'rerun-security', 'stricter-validation', 'reduce-scope', 'manual-intervention'],
      description: 'Auto-fix strategy to be applied',
    },
    qav_summary: {
      type: 'object',
      properties: {
        questions_count: {
          type: 'number',
          minimum: 0,
          description: 'Total questions asked',
        },
        answered_count: {
          type: 'number',
          minimum: 0,
          description: 'Questions answered',
        },
        validated_count: {
          type: 'number',
          minimum: 0,
          description: 'Questions validated',
        },
        grounding_score: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Overall grounding score',
        },
      },
      description: 'Q/A/V Triad summary',
    },
    metadata: {
      type: 'object',
      additionalProperties: true,
      description: 'Additional metadata',
    },
  },
  additionalProperties: false,
};

export interface PhaseGateFailedEvent {
  event: 'phase.gate.failed';
  timestamp: string;
  runId: string;
  phase: string;
  gate_score: number;
  pass_threshold?: number;
  guard_reports: Array<{
    type: string;
    pass: boolean;
    score: number;
    reasons?: string[];
    severity?: 'low' | 'medium' | 'high' | 'critical';
    timestamp: string;
  }>;
  failure_reasons: Array<{
    category: 'completeness' | 'contradictions' | 'coverage' | 'quality' | 'security' | 'performance' | 'other';
    description: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    suggestion?: string;
  }>;
  attempt_number?: number;
  max_attempts?: number;
  auto_fix_strategy?: 'rerun-qav' | 'add-missing-agents' | 'rerun-security' | 'stricter-validation' | 'reduce-scope' | 'manual-intervention';
  qav_summary?: {
    questions_count?: number;
    answered_count?: number;
    validated_count?: number;
    grounding_score?: number;
  };
  metadata?: Record<string, any>;
}
