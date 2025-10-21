/**
 * Phase Gate Passed Event Schema
 * 
 * Emitted when a phase passes its quality gate evaluation
 * Spec: phase.txt:38
 */

export const PhaseGatePassedEventSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'PhaseGatePassedEvent',
  description: 'Event emitted when a phase passes gate evaluation',
  type: 'object',
  required: ['event', 'timestamp', 'runId', 'phase', 'gate_score', 'guard_reports'],
  properties: {
    event: {
      type: 'string',
      const: 'phase.gate.passed',
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
            description: 'Issue severity if failed',
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
    next_phase: {
      type: 'string',
      description: 'Next phase to execute',
    },
    metadata: {
      type: 'object',
      additionalProperties: true,
      description: 'Additional metadata',
    },
  },
  additionalProperties: false,
};

export interface PhaseGatePassedEvent {
  event: 'phase.gate.passed';
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
  qav_summary?: {
    questions_count?: number;
    answered_count?: number;
    validated_count?: number;
    grounding_score?: number;
  };
  next_phase?: string;
  metadata?: Record<string, any>;
}
