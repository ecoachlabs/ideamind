/**
 * Metric Guard
 *
 * Roadmap: M6 - Synthetic Cohorts & Experimentation
 *
 * Guard: guard.metricGuard
 *
 * Statistical guards with anti p-hacking.
 */

import pino from 'pino';

const logger = pino({ name: 'metric-guard' });

export interface MetricGuardResult {
  passed: boolean;
  violations: string[];
  adjustedPValue?: number;
  multipleTesting: boolean;
}

export class MetricGuard {
  checkMultipleTesting(numTests: number, pValues: number[]): MetricGuardResult {
    const violations: string[] = [];
    let passed = true;

    // Bonferroni correction
    const adjustedAlpha = 0.05 / numTests;

    const significantResults = pValues.filter(p => p < adjustedAlpha);

    if (significantResults.length !== pValues.filter(p => p < 0.05).length) {
      violations.push('Multiple testing detected - use Bonferroni correction');
      passed = false;
    }

    return {
      passed,
      violations,
      adjustedPValue: adjustedAlpha,
      multipleTesting: numTests > 1,
    };
  }

  checkSampleSize(sampleSize: number, minSize: number = 100): MetricGuardResult {
    const violations: string[] = [];

    if (sampleSize < minSize) {
      violations.push(`Sample size ${sampleSize} < minimum ${minSize}`);
    }

    return {
      passed: violations.length === 0,
      violations,
      multipleTesting: false,
    };
  }

  checkPeekingBias(currentPValue: number, numPeeks: number): MetricGuardResult {
    const violations: string[] = [];

    if (numPeeks > 5) {
      violations.push('Too many interim analyses - peeking bias risk');
    }

    return {
      passed: violations.length === 0,
      violations,
      multipleTesting: false,
    };
  }
}

export const METRIC_GUARD_MIGRATION = `
CREATE TABLE IF NOT EXISTS metric_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id VARCHAR(100),
  violation_type VARCHAR(100) NOT NULL,
  details JSONB NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);
`;
