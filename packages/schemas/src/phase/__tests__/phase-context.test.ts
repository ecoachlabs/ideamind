/**
 * Tests for PhaseContext schema validation
 */

import {
  PhaseContextSchema,
  validatePhaseContext,
  isValidPhaseContext,
  assertPhaseContext,
  type PhaseContext,
} from '../phase-context';

describe('PhaseContext Schema', () => {
  test('validates correct PhaseContext', () => {
    const validContext: PhaseContext = {
      phase: 'INTAKE',
      inputs: { idea: 'Build a todo app' },
      budgets: {
        tokens: 700000,
        tools_minutes: 60
      },
      rubrics: {
        grounding_min: 0.85,
        contradictions_max: 0
      },
      timebox: 'PT1H'
    };

    expect(isValidPhaseContext(validContext)).toBe(true);
    expect(() => assertPhaseContext(validContext)).not.toThrow();
  });

  test('rejects invalid phase name', () => {
    const invalid = {
      phase: 'INVALID_PHASE',
      inputs: {},
      budgets: { tokens: 100000, tools_minutes: 60 },
      rubrics: {},
      timebox: 'PT1H'
    };

    expect(isValidPhaseContext(invalid)).toBe(false);
  });

  test('rejects missing required fields', () => {
    const invalid = {
      phase: 'INTAKE',
      inputs: {}
      // Missing budgets, rubrics, timebox
    };

    expect(isValidPhaseContext(invalid)).toBe(false);
  });

  test('rejects invalid timebox format', () => {
    const invalid = {
      phase: 'INTAKE',
      inputs: {},
      budgets: { tokens: 100000, tools_minutes: 60 },
      rubrics: {},
      timebox: '2 hours' // Invalid format
    };

    expect(isValidPhaseContext(invalid)).toBe(false);
  });

  test('accepts valid ISO8601 timebox formats', () => {
    const formats = ['PT1H', 'PT2H30M', 'PT45M', 'PT1H15M30S'];

    formats.forEach(timebox => {
      const context = {
        phase: 'INTAKE',
        inputs: {},
        budgets: { tokens: 100000, tools_minutes: 60 },
        rubrics: {},
        timebox
      };

      expect(isValidPhaseContext(context)).toBe(true);
    });
  });

  test('assertPhaseContext throws on invalid data', () => {
    const invalid = { phase: 'INVALID' };

    expect(() => assertPhaseContext(invalid)).toThrow('Invalid PhaseContext');
  });
});
