/**
 * Bug-Fix Guards
 *
 * Spec: IdeaMine Autonomous Bug-Fix System Spec v1.0 Section 6
 *
 * Guards validate specific quality criteria for bug fixes.
 */

import pino from 'pino';
import { Pool } from 'pg';

const logger = pino({ name: 'bugfix-guards' });

export interface GuardResult {
  passed: boolean;
  score: number;
  details: string;
  metadata?: Record<string, any>;
}

/**
 * Guard: Test Determinism
 *
 * Validates that a test produces consistent results across multiple runs.
 * Threshold: ≥0.9 determinism score (90% success rate)
 */
export class TestDeterminismGuard {
  constructor(private db: Pool) {}

  async check(testId: string, minRuns: number = 20): Promise<GuardResult> {
    logger.debug({ testId, minRuns }, 'Checking test determinism');

    const result = await this.db.query(
      `
      SELECT
        determinism_score,
        runs_passed,
        runs_failed,
        (runs_passed + runs_failed) as total_runs
      FROM bug_tests
      WHERE id = $1
    `,
      [testId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        score: 0,
        details: 'Test not found',
      };
    }

    const { determinism_score, runs_passed, runs_failed, total_runs } = result.rows[0];
    const score = parseFloat(determinism_score);
    const threshold = 0.9;

    const sufficientRuns = parseInt(total_runs) >= minRuns;
    const deterministic = score >= threshold;
    const passed = sufficientRuns && deterministic;

    let details = '';
    if (!sufficientRuns) {
      details = `Insufficient runs: ${total_runs} (need ${minRuns})`;
    } else if (!deterministic) {
      details = `Flaky test: ${score.toFixed(2)} determinism (<${threshold}) - ${runs_failed}/${total_runs} failures`;
    } else {
      details = `Deterministic: ${score.toFixed(2)} (${runs_passed}/${total_runs} passed)`;
    }

    return {
      passed,
      score,
      details,
      metadata: {
        runs_passed: parseInt(runs_passed),
        runs_failed: parseInt(runs_failed),
        total_runs: parseInt(total_runs),
      },
    };
  }

  /**
   * Check repro artifact determinism
   */
  async checkRepro(reproId: string, minRuns: number = 20): Promise<GuardResult> {
    logger.debug({ reproId, minRuns }, 'Checking repro determinism');

    const result = await this.db.query(
      `
      SELECT
        determinism_score,
        runs_passed,
        runs_failed,
        (runs_passed + runs_failed) as total_runs
      FROM repro_artifacts
      WHERE id = $1
    `,
      [reproId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        score: 0,
        details: 'Repro artifact not found',
      };
    }

    const { determinism_score, runs_passed, runs_failed, total_runs } = result.rows[0];
    const score = parseFloat(determinism_score);
    const threshold = 0.9;

    const sufficientRuns = parseInt(total_runs) >= minRuns;
    const deterministic = score >= threshold;
    const passed = sufficientRuns && deterministic;

    let details = '';
    if (!sufficientRuns) {
      details = `Insufficient runs: ${total_runs} (need ${minRuns})`;
    } else if (!deterministic) {
      details = `Non-deterministic repro: ${score.toFixed(2)} (<${threshold})`;
    } else {
      details = `Deterministic repro: ${score.toFixed(2)} (${total_runs} runs)`;
    }

    return {
      passed,
      score,
      details,
      metadata: {
        runs_passed: parseInt(runs_passed),
        runs_failed: parseInt(runs_failed),
        total_runs: parseInt(total_runs),
      },
    };
  }
}

/**
 * Guard: Mutation Score
 *
 * Validates that regression tests are strong enough to catch mutations.
 * Threshold: ≥0.6 mutation kill rate (60% of mutants killed)
 */
export class MutationScoreGuard {
  constructor(private db: Pool) {}

  async check(bugId: string): Promise<GuardResult> {
    logger.debug({ bugId }, 'Checking mutation score');

    const result = await this.db.query(
      `
      SELECT
        AVG(mutation_kill_rate) as avg_kill_rate,
        COUNT(*) as test_count,
        array_agg(path) as test_paths
      FROM bug_tests
      WHERE bug_id = $1 AND kind = 'mutation'
    `,
      [bugId]
    );

    if (result.rows.length === 0 || result.rows[0].test_count === null) {
      return {
        passed: false,
        score: 0,
        details: 'No mutation tests found',
      };
    }

    const { avg_kill_rate, test_count, test_paths } = result.rows[0];
    const score = parseFloat(avg_kill_rate || '0');
    const threshold = 0.6;

    const passed = score >= threshold;

    const details = passed
      ? `Strong tests: ${score.toFixed(2)} mutation kill rate (${test_count} mutation tests)`
      : `Weak tests: ${score.toFixed(2)} mutation kill rate (<${threshold}) - tests may miss regressions`;

    return {
      passed,
      score,
      details,
      metadata: {
        test_count: parseInt(test_count),
        test_paths,
        threshold,
      },
    };
  }
}

/**
 * Guard: Performance Budget
 *
 * Validates that fix does not introduce performance regressions.
 * Checks: p95, p99 latency, memory, CPU within budgets
 */
export class PerfBudgetGuard {
  constructor(private db: Pool) {}

  async check(patchId: string, budgets: PerfBudgets): Promise<GuardResult> {
    logger.debug({ patchId }, 'Checking performance budget');

    const result = await this.db.query(
      `SELECT metadata FROM patches WHERE id = $1`,
      [patchId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        score: 0,
        details: 'Patch not found',
      };
    }

    const perfMeta = result.rows[0].metadata?.performance || {};

    const checks: Record<string, boolean> = {};
    const violations: string[] = [];

    // Check p95 latency
    if (budgets.p95_ms !== undefined && perfMeta.p95_ms !== undefined) {
      checks.p95 = perfMeta.p95_ms <= budgets.p95_ms;
      if (!checks.p95) {
        violations.push(`p95: ${perfMeta.p95_ms}ms > ${budgets.p95_ms}ms budget`);
      }
    }

    // Check p99 latency
    if (budgets.p99_ms !== undefined && perfMeta.p99_ms !== undefined) {
      checks.p99 = perfMeta.p99_ms <= budgets.p99_ms;
      if (!checks.p99) {
        violations.push(`p99: ${perfMeta.p99_ms}ms > ${budgets.p99_ms}ms budget`);
      }
    }

    // Check memory
    if (budgets.memory_mb !== undefined && perfMeta.memory_mb !== undefined) {
      checks.memory = perfMeta.memory_mb <= budgets.memory_mb;
      if (!checks.memory) {
        violations.push(`memory: ${perfMeta.memory_mb}MB > ${budgets.memory_mb}MB budget`);
      }
    }

    // Check CPU
    if (budgets.cpu_pct !== undefined && perfMeta.cpu_pct !== undefined) {
      checks.cpu = perfMeta.cpu_pct <= budgets.cpu_pct;
      if (!checks.cpu) {
        violations.push(`CPU: ${perfMeta.cpu_pct}% > ${budgets.cpu_pct}% budget`);
      }
    }

    const totalChecks = Object.keys(checks).length;
    const passedChecks = Object.values(checks).filter((v) => v).length;
    const passed = violations.length === 0 && totalChecks > 0;
    const score = totalChecks > 0 ? passedChecks / totalChecks : 0;

    const details = passed
      ? `Performance within budgets (${passedChecks}/${totalChecks} checks passed)`
      : violations.length > 0
      ? violations.join('; ')
      : 'No performance data available';

    return {
      passed,
      score,
      details,
      metadata: {
        budgets,
        actual: perfMeta,
        violations,
      },
    };
  }
}

export interface PerfBudgets {
  p95_ms?: number;
  p99_ms?: number;
  memory_mb?: number;
  cpu_pct?: number;
}

/**
 * Guard: Security Delta
 *
 * Validates that fix introduces no new security vulnerabilities.
 * Threshold: 0 new critical vulnerabilities
 */
export class SecurityDeltaGuard {
  constructor(private db: Pool) {}

  async check(patchId: string): Promise<GuardResult> {
    logger.debug({ patchId }, 'Checking security delta');

    const result = await this.db.query(
      `SELECT metadata FROM patches WHERE id = $1`,
      [patchId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        score: 0,
        details: 'Patch not found',
      };
    }

    const secMeta = result.rows[0].metadata?.security || {};

    const newCriticals = secMeta.new_criticals || 0;
    const newHighs = secMeta.new_highs || 0;
    const newMediums = secMeta.new_mediums || 0;

    const passed = newCriticals === 0;

    const sastClean = secMeta.sast === 'clean';
    const scaClean = secMeta.sca === 'clean';
    const dastClean = secMeta.dast === 'clean';

    let details = '';
    if (!passed) {
      details = `New critical vulnerabilities: ${newCriticals}`;
    } else if (newHighs > 0) {
      details = `No new criticals, but ${newHighs} new high severity issues`;
    } else {
      const tools = [sastClean && 'SAST', scaClean && 'SCA', dastClean && 'DAST']
        .filter(Boolean)
        .join(', ');
      details = `No new vulnerabilities (${tools} clean)`;
    }

    // Score based on all severity levels
    const totalNew = newCriticals + newHighs + newMediums;
    const score = totalNew === 0 ? 1.0 : newCriticals === 0 ? 0.7 : 0;

    return {
      passed,
      score,
      details,
      metadata: {
        new_criticals: newCriticals,
        new_highs: newHighs,
        new_mediums: newMediums,
        sast: secMeta.sast,
        sca: secMeta.sca,
        dast: secMeta.dast,
      },
    };
  }
}

/**
 * Guard: Coverage Delta
 *
 * Validates that fix maintains or improves code coverage.
 * Threshold: No decrease; if baseline <60%, delta ≥+5%
 */
export class CoverageDeltaGuard {
  constructor(private db: Pool) {}

  async check(patchId: string): Promise<GuardResult> {
    logger.debug({ patchId }, 'Checking coverage delta');

    const result = await this.db.query(
      `SELECT metadata FROM patches WHERE id = $1`,
      [patchId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        score: 0,
        details: 'Patch not found',
      };
    }

    const covMeta = result.rows[0].metadata?.coverage || {};

    const baseline = covMeta.baseline || 0;
    const current = covMeta.current || 0;
    const delta = current - baseline;

    const lowBaselineThreshold = 60;
    const requiredDelta = 5;

    let passed = false;
    let details = '';

    if (baseline < lowBaselineThreshold) {
      // If baseline is low, require improvement
      passed = delta >= requiredDelta;
      details = passed
        ? `Coverage improved: ${current.toFixed(1)}% (+${delta.toFixed(1)}% from ${baseline.toFixed(1)}%)`
        : `Insufficient improvement: +${delta.toFixed(1)}% (need +${requiredDelta}% when baseline <${lowBaselineThreshold}%)`;
    } else {
      // If baseline is good, just maintain it
      passed = delta >= 0;
      details = passed
        ? `Coverage maintained: ${current.toFixed(1)}% (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%)`
        : `Coverage decreased: ${current.toFixed(1)}% (${delta.toFixed(1)}%)`;
    }

    const score = Math.max(0, Math.min(1, (current - baseline + 10) / 20)); // Normalize delta

    return {
      passed,
      score,
      details,
      metadata: {
        baseline,
        current,
        delta,
        files_changed: covMeta.files_changed || [],
      },
    };
  }
}

/**
 * Guard Registry
 *
 * Central registry for all bug-fix guards.
 */
export class BugFixGuardRegistry {
  private testDeterminism: TestDeterminismGuard;
  private mutationScore: MutationScoreGuard;
  private perfBudget: PerfBudgetGuard;
  private securityDelta: SecurityDeltaGuard;
  private coverageDelta: CoverageDeltaGuard;

  constructor(db: Pool) {
    this.testDeterminism = new TestDeterminismGuard(db);
    this.mutationScore = new MutationScoreGuard(db);
    this.perfBudget = new PerfBudgetGuard(db);
    this.securityDelta = new SecurityDeltaGuard(db);
    this.coverageDelta = new CoverageDeltaGuard(db);
  }

  getGuard(name: string): any {
    const guards: Record<string, any> = {
      testDeterminism: this.testDeterminism,
      mutationScore: this.mutationScore,
      perfBudget: this.perfBudget,
      securityDelta: this.securityDelta,
      coverageDelta: this.coverageDelta,
    };

    return guards[name];
  }

  getAllGuards() {
    return {
      testDeterminism: this.testDeterminism,
      mutationScore: this.mutationScore,
      perfBudget: this.perfBudget,
      securityDelta: this.securityDelta,
      coverageDelta: this.coverageDelta,
    };
  }
}
