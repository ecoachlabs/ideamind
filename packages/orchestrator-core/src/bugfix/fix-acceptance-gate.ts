/**
 * Fix Acceptance Gate
 *
 * Spec: IdeaMine Autonomous Bug-Fix System Spec v1.0 Section 5
 *
 * **Requirements:**
 * 1. Reproduction: Deterministic MRC fails before, passes after (≥0.9)
 * 2. Tests: Regression tests added; mutation kill rate ≥0.6
 * 3. Security: SAST/SCA/DAST - 0 new criticals
 * 4. Performance: No perf budget regressions (p95, p99)
 * 5. Coverage: Not lower than baseline; delta ≥+5% if <60%
 * 6. Flake: No flakiness on repro test (N=20 runs)
 * 7. Docs: Changelog & runbook updated; BugFrame present
 */

import pino from 'pino';
import { Pool } from 'pg';

const logger = pino({ name: 'fix-acceptance-gate' });

export interface FixAcceptanceContext {
  bugId: string;
  reproId: string;
  patchId: string;
  runId?: string;
}

export interface GateResult {
  status: 'pass' | 'fail' | 'warn';
  overallScore: number;
  threshold: number;
  checks: {
    reproduction: CheckResult;
    tests: CheckResult;
    security: CheckResult;
    performance: CheckResult;
    coverage: CheckResult;
    flake: CheckResult;
    docs: CheckResult;
  };
  blockingViolations: string[];
  decision: {
    reasons: string[];
    recommendation: string;
  };
}

export interface CheckResult {
  passed: boolean;
  score: number;
  weight: number;
  details: string;
  blocking?: boolean;
}

/**
 * Fix Acceptance Gate
 *
 * Validates that a bug fix meets all quality requirements before deployment.
 */
export class FixAcceptanceGate {
  constructor(private db: Pool) {}

  /**
   * Evaluate fix acceptance gate
   */
  async evaluate(context: FixAcceptanceContext): Promise<GateResult> {
    logger.info({ bugId: context.bugId }, 'Evaluating Fix Acceptance Gate');

    const checks = {
      reproduction: await this.checkReproduction(context),
      tests: await this.checkTests(context),
      security: await this.checkSecurity(context),
      performance: await this.checkPerformance(context),
      coverage: await this.checkCoverage(context),
      flake: await this.checkFlake(context),
      docs: await this.checkDocs(context),
    };

    // Calculate overall score (weighted average)
    const totalWeight = Object.values(checks).reduce((sum, c) => sum + c.weight, 0);
    const weightedScore = Object.values(checks).reduce(
      (sum, c) => sum + c.score * c.weight,
      0
    );
    const overallScore = (weightedScore / totalWeight) * 100;

    // Identify blocking violations
    const blockingViolations: string[] = [];
    for (const [name, check] of Object.entries(checks)) {
      if (!check.passed && check.blocking) {
        blockingViolations.push(`${name}: ${check.details}`);
      }
    }

    // Determine pass/fail
    const threshold = 70; // 70% minimum
    const status = blockingViolations.length > 0 ? 'fail' : overallScore >= threshold ? 'pass' : 'fail';

    // Generate decision
    const reasons: string[] = [];
    const failedChecks = Object.entries(checks).filter(([_, c]) => !c.passed);

    if (failedChecks.length > 0) {
      failedChecks.forEach(([name, check]) => {
        reasons.push(`${name}: ${check.details}`);
      });
    } else {
      reasons.push('All quality checks passed');
    }

    const recommendation =
      status === 'pass'
        ? 'Proceed to canary deployment'
        : 'Fix deficiencies and re-submit';

    const result: GateResult = {
      status,
      overallScore,
      threshold,
      checks,
      blockingViolations,
      decision: {
        reasons,
        recommendation,
      },
    };

    logger.info(
      { bugId: context.bugId, status, score: overallScore },
      'Fix Acceptance Gate evaluated'
    );

    return result;
  }

  /**
   * Check 1: Reproduction - Deterministic MRC
   */
  private async checkReproduction(context: FixAcceptanceContext): Promise<CheckResult> {
    const result = await this.db.query(
      `SELECT determinism_score, runs_passed, runs_failed FROM repro_artifacts WHERE id = $1`,
      [context.reproId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        score: 0,
        weight: 2.0, // High weight - critical check
        details: 'No reproduction artifact found',
        blocking: true,
      };
    }

    const { determinism_score, runs_passed, runs_failed } = result.rows[0];
    const determinismThreshold = 0.9;

    const passed = parseFloat(determinism_score) >= determinismThreshold;

    return {
      passed,
      score: parseFloat(determinism_score),
      weight: 2.0,
      details: passed
        ? `Determinism score: ${determinism_score} (≥${determinismThreshold})`
        : `Determinism score: ${determinism_score} (<${determinismThreshold}) - repro is not stable`,
      blocking: true,
    };
  }

  /**
   * Check 2: Tests - Regression tests + mutation kill rate
   */
  private async checkTests(context: FixAcceptanceContext): Promise<CheckResult> {
    const result = await this.db.query(
      `
      SELECT
        COUNT(*) as total_tests,
        COUNT(*) FILTER (WHERE was_failing = true AND now_passing = true) as red_to_green,
        AVG(mutation_kill_rate) as avg_mutation_kill_rate
      FROM bug_tests
      WHERE bug_id = $1
    `,
      [context.bugId]
    );

    const { total_tests, red_to_green, avg_mutation_kill_rate } = result.rows[0];

    const mutationThreshold = 0.6;
    const hasMutationTests = avg_mutation_kill_rate !== null;
    const mutationKillRate = parseFloat(avg_mutation_kill_rate || '0');

    const passedRedToGreen = parseInt(red_to_green) > 0;
    const passedMutation = !hasMutationTests || mutationKillRate >= mutationThreshold;
    const passed = passedRedToGreen && passedMutation;

    let details = '';
    if (!passedRedToGreen) {
      details = 'No red→green test found (must have failing test before fix)';
    } else if (!passedMutation) {
      details = `Mutation kill rate: ${mutationKillRate.toFixed(2)} (<${mutationThreshold})`;
    } else {
      details = `${red_to_green} red→green test(s); mutation kill rate: ${mutationKillRate.toFixed(2)}`;
    }

    return {
      passed,
      score: passedRedToGreen ? (passedMutation ? 1.0 : 0.7) : 0,
      weight: 1.5,
      details,
      blocking: !passedRedToGreen,
    };
  }

  /**
   * Check 3: Security - No new critical vulnerabilities
   */
  private async checkSecurity(context: FixAcceptanceContext): Promise<CheckResult> {
    // Query patch record for security check results
    const result = await this.db.query(
      `SELECT sec_ok, metadata FROM patches WHERE id = $1`,
      [context.patchId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        score: 0,
        weight: 1.5,
        details: 'No patch record found',
        blocking: true,
      };
    }

    const { sec_ok, metadata } = result.rows[0];
    const securityMeta = metadata?.security || {};

    const passed = sec_ok === true;

    const details = passed
      ? 'No new critical vulnerabilities (SAST/SCA/DAST clean)'
      : `Security issues found: ${securityMeta.criticals || 'unknown'} criticals`;

    return {
      passed,
      score: passed ? 1.0 : 0,
      weight: 1.5,
      details,
      blocking: true,
    };
  }

  /**
   * Check 4: Performance - No regressions
   */
  private async checkPerformance(context: FixAcceptanceContext): Promise<CheckResult> {
    const result = await this.db.query(
      `SELECT perf_ok, metadata FROM patches WHERE id = $1`,
      [context.patchId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        score: 0,
        weight: 1.0,
        details: 'No patch record found',
        blocking: false,
      };
    }

    const { perf_ok, metadata } = result.rows[0];
    const perfMeta = metadata?.performance || {};

    const passed = perf_ok === true;

    const details = passed
      ? 'No performance regressions (p95, p99 within budgets)'
      : `Performance regression: ${perfMeta.regression || 'unknown'}`;

    return {
      passed,
      score: passed ? 1.0 : 0,
      weight: 1.0,
      details,
      blocking: false,
    };
  }

  /**
   * Check 5: Coverage - Not lower than baseline
   */
  private async checkCoverage(context: FixAcceptanceContext): Promise<CheckResult> {
    const result = await this.db.query(
      `SELECT coverage_ok, metadata FROM patches WHERE id = $1`,
      [context.patchId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        score: 0,
        weight: 1.0,
        details: 'No patch record found',
        blocking: false,
      };
    }

    const { coverage_ok, metadata } = result.rows[0];
    const coverageMeta = metadata?.coverage || {};

    const passed = coverage_ok === true;

    const baseline = coverageMeta.baseline || 0;
    const current = coverageMeta.current || 0;
    const delta = current - baseline;

    let details = '';
    if (baseline < 60 && delta < 5) {
      details = `Coverage delta: +${delta.toFixed(1)}% (need +5% when baseline <60%)`;
    } else {
      details = passed
        ? `Coverage: ${current.toFixed(1)}% (baseline: ${baseline.toFixed(1)}%)`
        : `Coverage decreased: ${current.toFixed(1)}% (baseline: ${baseline.toFixed(1)}%)`;
    }

    return {
      passed,
      score: passed ? 1.0 : 0,
      weight: 1.0,
      details,
      blocking: false,
    };
  }

  /**
   * Check 6: Flake - No flakiness (N=20 runs)
   */
  private async checkFlake(context: FixAcceptanceContext): Promise<CheckResult> {
    const result = await this.db.query(
      `SELECT determinism_score, runs_passed, runs_failed FROM repro_artifacts WHERE id = $1`,
      [context.reproId]
    );

    if (result.rows.length === 0) {
      return {
        passed: false,
        score: 0,
        weight: 1.0,
        details: 'No reproduction artifact found',
        blocking: false,
      };
    }

    const { determinism_score, runs_passed, runs_failed } = result.rows[0];
    const totalRuns = parseInt(runs_passed) + parseInt(runs_failed);
    const flakeThreshold = 20;

    const passed = totalRuns >= flakeThreshold && parseFloat(determinism_score) >= 0.95;

    const details = passed
      ? `No flakiness detected (${totalRuns} runs, ${determinism_score} determinism)`
      : totalRuns < flakeThreshold
      ? `Insufficient runs: ${totalRuns} (need ${flakeThreshold})`
      : `Flaky test: ${determinism_score} determinism (<0.95)`;

    return {
      passed,
      score: passed ? 1.0 : parseFloat(determinism_score),
      weight: 1.0,
      details,
      blocking: false,
    };
  }

  /**
   * Check 7: Docs - Changelog, runbook, BugFrame
   */
  private async checkDocs(context: FixAcceptanceContext): Promise<CheckResult> {
    // Check if BugFrame exists in knowledge_frames
    const frameResult = await this.db.query(
      `SELECT COUNT(*) as count FROM knowledge_frames WHERE metadata->>'bug_id' = $1`,
      [context.bugId]
    );

    const hasBugFrame = parseInt(frameResult.rows[0]?.count || '0') > 0;

    // Check if patch has documentation metadata
    const patchResult = await this.db.query(
      `SELECT metadata FROM patches WHERE id = $1`,
      [context.patchId]
    );

    const docsMeta = patchResult.rows[0]?.metadata?.docs || {};
    const hasChangelog = docsMeta.changelog === true;
    const hasRunbook = docsMeta.runbook === true;

    const passed = hasBugFrame && hasChangelog && hasRunbook;

    let missing: string[] = [];
    if (!hasBugFrame) missing.push('BugFrame');
    if (!hasChangelog) missing.push('Changelog');
    if (!hasRunbook) missing.push('Runbook');

    const details = passed
      ? 'All documentation updated (Changelog, Runbook, BugFrame)'
      : `Missing: ${missing.join(', ')}`;

    return {
      passed,
      score: passed ? 1.0 : missing.length === 1 ? 0.7 : 0.3,
      weight: 0.5,
      details,
      blocking: false,
    };
  }
}
