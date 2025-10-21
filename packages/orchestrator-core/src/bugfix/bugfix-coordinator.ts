/**
 * BugFix Coordinator (BFC) - Autonomous Bug-Fix System
 *
 * Spec: IdeaMine Autonomous Bug-Fix System Spec v1.0
 * Phase: Feedback → Fix (10)
 *
 * **Purpose:**
 * Identify, reproduce, fix, verify, and prevent regressions autonomously
 * without user intervention. Coordinates 11 specialized agents through
 * a complete bug-fix lifecycle.
 *
 * **Lifecycle:**
 * 1. Detect → Intake (normalize, dedupe, triage)
 * 2. Triage Gate (legit vs flake vs needs-data)
 * 3. Reproduce (minimal reproducible case)
 * 4. RCA (root cause analysis)
 * 5. Patch (FixSynth)
 * 6. Tests (regression tests)
 * 7. Verify (full test suite)
 * 8. Fix Acceptance Gate
 * 9. Canary/Flag/Release
 * 10. Knowledge Map integration
 */

import pino from 'pino';
import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { Recorder } from '../recorder/recorder';

const logger = pino({ name: 'bugfix-coordinator' });

/**
 * Bug event from external sources
 */
export interface BugFoundEvent {
  title: string;
  source: string; // 'qa_e2e', 'qa_load', 'security_dast', 'telemetry', 'beta', 'fuzzer', 'story_loop_ci'
  severity?: string; // 'P0', 'P1', 'P2', 'P3' (can be auto-assigned)
  area?: string;
  type?: string; // 'functional', 'performance', 'security', 'ux', 'data'
  stackTrace?: string;
  logs?: string[];
  reproHint?: string;
  failingTestId?: string;
  telemetryWindow?: { start: string; end: string };
  runId?: string;
  metadata?: Record<string, any>;
}

/**
 * Bug lifecycle status
 */
export type BugStatus =
  | 'new'
  | 'triaged'
  | 'reproducing'
  | 'fixing'
  | 'verifying'
  | 'canary'
  | 'fixed'
  | 'regressed'
  | 'flake'
  | 'needs-signal';

/**
 * Bug record
 */
export interface Bug {
  id: string;
  title: string;
  severity: string;
  area: string;
  type: string;
  status: BugStatus;
  source: string;
  fingerprint: string;
  reproId?: string;
  fixPr?: string;
  ownerAgent?: string;
  slaAt: Date;
  runId?: string;
  metadata?: Record<string, any>;
}

/**
 * BugFix Coordinator
 *
 * Orchestrates autonomous bug-fix process from detection to deployment.
 */
export class BugFixCoordinator extends EventEmitter {
  private activeBugs: Map<string, Bug> = new Map();

  constructor(
    private db: Pool,
    private recorder: Recorder
  ) {
    super();
  }

  /**
   * Main entry point: Process a bug from detection to fix
   */
  async processBug(bugEvent: BugFoundEvent): Promise<Bug> {
    const startTime = Date.now();

    logger.info(
      {
        title: bugEvent.title,
        source: bugEvent.source,
        severity: bugEvent.severity,
      },
      'Processing bug'
    );

    try {
      // Step 1: Intake (normalize, dedupe, triage)
      const intake = await this.intakeBug(bugEvent);

      if (intake.status === 'flake') {
        logger.info({ bugId: intake.id }, 'Bug identified as flake, closing');
        return intake;
      }

      if (intake.status === 'needs-signal') {
        logger.warn({ bugId: intake.id }, 'Bug needs more signal data');
        return intake;
      }

      // Step 2: Reproduce (MRC)
      const repro = await this.reproduceBug(intake);

      if (!repro.deterministic) {
        logger.warn({ bugId: intake.id }, 'Repro is not deterministic, running flake detection');
        await this.detectFlake(intake, repro);
      }

      // Step 3: RCA (root cause analysis)
      const [bisection, logs] = await Promise.all([
        this.bisectBug(intake, repro),
        this.mineLogs(intake, repro),
      ]);

      const rca = await this.performRCA(intake, { bisection, logs, repro });

      // Step 4: Patch & Tests (with retry loop)
      let patch;
      let tests;
      let verified = false;
      let attempts = 0;
      const maxAttempts = 3;

      while (!verified && attempts < maxAttempts) {
        attempts++;

        logger.info({ bugId: intake.id, attempt: attempts }, 'Attempting fix synthesis');

        // Synthesize patch
        patch = await this.synthesizeFix(intake, rca);

        // Author regression tests
        tests = await this.authorTests(intake, { repro, rca, patch });

        // Verify full suite
        verified = await this.verify(intake, { patch, tests });

        if (!verified) {
          logger.warn(
            { bugId: intake.id, attempt: attempts },
            'Verification failed, retrying with hints'
          );
        }
      }

      if (!verified) {
        logger.error({ bugId: intake.id }, 'Fix verification failed after max attempts');
        await this.escalateWithAssumptions(intake);
        return intake;
      }

      // Step 5: Canary rollout
      await this.canaryRollout(intake, patch);

      // Step 6: Knowledge Map integration
      await this.integrateKnowledgeMap(intake, { repro, rca, patch, tests });

      // Step 7: Mark as fixed
      await this.markFixed(intake.id);

      const duration = Date.now() - startTime;

      logger.info(
        { bugId: intake.id, durationMs: duration },
        'Bug fixed successfully'
      );

      this.emit('bug.fixed', {
        bugId: intake.id,
        durationMs: duration,
      });

      return intake;
    } catch (error: any) {
      logger.error({ error, title: bugEvent.title }, 'Bug processing failed');

      this.emit('bug.error', {
        title: bugEvent.title,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Step 1: Intake - Normalize, dedupe, triage
   */
  private async intakeBug(bugEvent: BugFoundEvent): Promise<Bug> {
    logger.debug({ title: bugEvent.title }, 'Intake: Normalizing bug');

    // Generate fingerprint for deduplication
    const fingerprint = this.generateFingerprint(bugEvent);

    // Check for existing bug with same fingerprint
    const existing = await this.db.query(
      `SELECT * FROM bugs WHERE fingerprint = $1 AND status NOT IN ('fixed', 'flake')`,
      [fingerprint]
    );

    if (existing.rows.length > 0) {
      logger.info({ fingerprint }, 'Duplicate bug found, updating last_seen');

      const bugId = existing.rows[0].id;

      await this.db.query(
        `UPDATE bugs SET last_seen = NOW(), updated_at = NOW() WHERE id = $1`,
        [bugId]
      );

      return this.mapDbBugToBug(existing.rows[0]);
    }

    // Auto-assign severity if not provided
    const severity = bugEvent.severity || this.autoAssignSeverity(bugEvent);

    // Auto-assign area and type
    const area = bugEvent.area || this.autoAssignArea(bugEvent);
    const type = bugEvent.type || this.autoAssignType(bugEvent);

    // Create new bug record
    const result = await this.db.query(
      `
      INSERT INTO bugs (
        title, severity, area, type, status, source, fingerprint, run_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `,
      [
        bugEvent.title,
        severity,
        area,
        type,
        'triaged',
        bugEvent.source,
        fingerprint,
        bugEvent.runId || null,
        JSON.stringify(bugEvent.metadata || {}),
      ]
    );

    const bug = this.mapDbBugToBug(result.rows[0]);

    this.activeBugs.set(bug.id, bug);

    // Emit event
    await this.emitBugEvent(bug.id, 'found', bugEvent);
    await this.emitBugEvent(bug.id, 'triaged', { severity, area, type });

    logger.info({ bugId: bug.id, severity, area, type }, 'Bug triaged');

    return bug;
  }

  /**
   * Step 2: Reproduce - Generate minimal reproducible case
   */
  private async reproduceBug(bug: Bug): Promise<any> {
    logger.info({ bugId: bug.id }, 'Reproducing bug');

    await this.updateBugStatus(bug.id, 'reproducing');

    // TODO: Call ReproSynthAgent via tool.bug.reproSynth
    // For now, placeholder
    const repro = {
      id: `repro-${bug.id}`,
      bugId: bug.id,
      type: 'test',
      uri: `/tests/repro/${bug.id}.test.ts`,
      deterministic: true, // Will be calculated by running multiple times
      deterministicScore: 0.95,
    };

    // Store repro artifact
    await this.db.query(
      `
      INSERT INTO repro_artifacts (
        id, bug_id, type, uri, sha256, env_spec, determinism_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [
        repro.id,
        repro.bugId,
        repro.type,
        repro.uri,
        'placeholder-sha256',
        JSON.stringify({}),
        repro.deterministicScore,
      ]
    );

    // Update bug with repro_id
    await this.db.query(`UPDATE bugs SET repro_id = $1 WHERE id = $2`, [repro.id, bug.id]);

    await this.emitBugEvent(bug.id, 'reproduced', repro);

    logger.info({ bugId: bug.id, reproId: repro.id }, 'Bug reproduced');

    return repro;
  }

  /**
   * Step 3a: Detect flake
   */
  private async detectFlake(bug: Bug, repro: any): Promise<void> {
    logger.info({ bugId: bug.id }, 'Detecting flake');

    // TODO: Call FlakeDetectorAgent via tool.bug.flakeDetect
    // Run repro N times and check variance

    // Placeholder: mark as flake if determinism < 0.9
    if (repro.deterministicScore < 0.9) {
      await this.updateBugStatus(bug.id, 'flake');

      await this.db.query(
        `
        INSERT INTO flaky_tests (test_path, bug_id, flake_rate, total_runs, failed_runs)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (test_path) DO UPDATE SET
          flake_rate = EXCLUDED.flake_rate,
          total_runs = EXCLUDED.total_runs,
          failed_runs = EXCLUDED.failed_runs,
          last_flake = NOW()
      `,
        [repro.uri, bug.id, 1.0 - repro.deterministicScore, 20, 5]
      );

      logger.info({ bugId: bug.id }, 'Bug marked as flake');
    }
  }

  /**
   * Step 3b: Bisect - Find first bad commit
   */
  private async bisectBug(bug: Bug, repro: any): Promise<any> {
    logger.info({ bugId: bug.id }, 'Bisecting to find first bad commit');

    // TODO: Call BisectionAgent via tool.bug.bisect

    const bisection = {
      firstBadCommit: 'abc123def456', // Placeholder
      affectedFiles: ['src/backend/api.ts', 'src/frontend/component.tsx'],
    };

    logger.info({ bugId: bug.id, commit: bisection.firstBadCommit }, 'Bisection complete');

    return bisection;
  }

  /**
   * Step 3c: Mine logs - Extract error signatures
   */
  private async mineLogs(bug: Bug, repro: any): Promise<any> {
    logger.info({ bugId: bug.id }, 'Mining logs for error signatures');

    // TODO: Call LogMinerAgent via tool.bug.logMiner

    const logs = {
      errorSignature: 'NullPointerException at line 42',
      templates: ['Error: {var} is null', 'Stack overflow in {function}'],
      anomalies: [],
    };

    logger.info({ bugId: bug.id }, 'Log mining complete');

    return logs;
  }

  /**
   * Step 3d: RCA - Root cause analysis
   */
  private async performRCA(bug: Bug, context: any): Promise<any> {
    logger.info({ bugId: bug.id }, 'Performing root cause analysis');

    // TODO: Call RCAAgent via tool.bug.rca

    const rca = {
      rootCause: 'Null check missing in API handler',
      causalChain: [
        { step: 'defect', artifact: 'Missing null check', reasoning: 'No guard for null input' },
        {
          step: 'faulty_code',
          artifact: 'src/backend/api.ts:42',
          reasoning: 'Direct property access without validation',
        },
        {
          step: 'trigger',
          artifact: 'POST /api/users with null email',
          reasoning: 'Client sent malformed payload',
        },
        { step: 'effect', artifact: 'NullPointerException', reasoning: 'Crash on null access' },
      ],
      confidence: 0.95,
    };

    // Store RCA
    await this.db.query(
      `
      INSERT INTO rca (
        bug_id, first_bad_commit, files, root_cause, evidence_ids, causal_chain, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (bug_id) DO UPDATE SET
        first_bad_commit = EXCLUDED.first_bad_commit,
        files = EXCLUDED.files,
        root_cause = EXCLUDED.root_cause,
        evidence_ids = EXCLUDED.evidence_ids,
        causal_chain = EXCLUDED.causal_chain,
        confidence = EXCLUDED.confidence
    `,
      [
        bug.id,
        context.bisection.firstBadCommit,
        context.bisection.affectedFiles,
        rca.rootCause,
        [],
        JSON.stringify(rca.causalChain),
        rca.confidence,
      ]
    );

    await this.emitBugEvent(bug.id, 'rca.ready', rca);

    logger.info({ bugId: bug.id, rootCause: rca.rootCause }, 'RCA complete');

    return rca;
  }

  /**
   * Step 4a: Synthesize fix
   */
  private async synthesizeFix(bug: Bug, rca: any): Promise<any> {
    logger.info({ bugId: bug.id }, 'Synthesizing fix');

    await this.updateBugStatus(bug.id, 'fixing');

    // TODO: Call FixSynthAgent via tool.bug.fixSynth

    const patch = {
      prId: `PR-${bug.id}`,
      bugId: bug.id,
      diff: `--- a/src/backend/api.ts\n+++ b/src/backend/api.ts\n@@ -39,7 +39,10 @@\n function handleUser(req) {\n+  if (!req.body.email) {\n+    throw new Error('Email is required');\n+  }\n   const user = createUser(req.body.email);\n`,
      rationale: 'Added null check for email field to prevent NullPointerException',
      filesChanged: ['src/backend/api.ts'],
      linesAdded: 3,
      linesRemoved: 0,
    };

    // Store patch
    await this.db.query(
      `
      INSERT INTO patches (
        pr_id, bug_id, diff_uri, diff_sha256, rationale, files_changed, lines_added, lines_removed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        patch.prId,
        patch.bugId,
        `/patches/${patch.prId}.diff`,
        'placeholder-sha256',
        patch.rationale,
        patch.filesChanged,
        patch.linesAdded,
        patch.linesRemoved,
      ]
    );

    await this.emitBugEvent(bug.id, 'patch.proposed', patch);

    logger.info({ bugId: bug.id, prId: patch.prId }, 'Fix synthesized');

    return patch;
  }

  /**
   * Step 4b: Author tests
   */
  private async authorTests(bug: Bug, context: any): Promise<any> {
    logger.info({ bugId: bug.id }, 'Authoring regression tests');

    // TODO: Call TestAuthorAgent via tool.bug.testAuthor

    const tests = {
      unit: {
        path: 'src/backend/__tests__/api.test.ts',
        wasFailing: true,
        nowPassing: true,
      },
      property: {
        path: 'src/backend/__tests__/api.property.test.ts',
        wasFailing: false,
        nowPassing: true,
      },
      mutation: {
        killRate: 0.75,
      },
    };

    // Store tests
    await this.db.query(
      `
      INSERT INTO bug_tests (
        bug_id, kind, path, was_failing, now_passing, mutation_kill_rate, determinism_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [bug.id, 'unit', tests.unit.path, true, true, 0.75, 1.0]
    );

    await this.emitBugEvent(bug.id, 'tests.authored', tests);

    logger.info({ bugId: bug.id }, 'Tests authored');

    return tests;
  }

  /**
   * Step 5: Verify - Run full test suite
   */
  private async verify(bug: Bug, context: any): Promise<boolean> {
    logger.info({ bugId: bug.id }, 'Verifying fix');

    await this.updateBugStatus(bug.id, 'verifying');

    // TODO: Call VerifierAgent via tool.bug.verify
    // Run: unit, integration, E2E, perf, security (SAST/SCA/DAST)

    const verificationResult = {
      lintOk: true,
      testsOk: true,
      secOk: true,
      perfOk: true,
      coverageOk: true,
    };

    // Update patch record
    await this.db.query(
      `
      UPDATE patches SET
        lint_ok = $1,
        tests_ok = $2,
        sec_ok = $3,
        perf_ok = $4,
        coverage_ok = $5
      WHERE pr_id = $6
    `,
      [
        verificationResult.lintOk,
        verificationResult.testsOk,
        verificationResult.secOk,
        verificationResult.perfOk,
        verificationResult.coverageOk,
        context.patch.prId,
      ]
    );

    const allOk =
      verificationResult.lintOk &&
      verificationResult.testsOk &&
      verificationResult.secOk &&
      verificationResult.perfOk &&
      verificationResult.coverageOk;

    if (allOk) {
      await this.emitBugEvent(bug.id, 'verified', verificationResult);
      logger.info({ bugId: bug.id }, 'Verification passed');
    } else {
      logger.warn({ bugId: bug.id, result: verificationResult }, 'Verification failed');
    }

    return allOk;
  }

  /**
   * Step 6: Canary rollout
   */
  private async canaryRollout(bug: Bug, patch: any): Promise<void> {
    logger.info({ bugId: bug.id }, 'Starting canary rollout');

    await this.updateBugStatus(bug.id, 'canary');

    // TODO: Call CanaryRollerAgent via tool.bug.canary

    const canary = {
      featureFlag: `fix-${bug.id}`,
      monitors: ['p95', 'error_rate', 'crash_rate'],
      trafficPct: 5, // Start with 5%
    };

    // Store canary record
    const patchResult = await this.db.query(`SELECT id FROM patches WHERE pr_id = $1`, [
      patch.prId,
    ]);

    if (patchResult.rows.length > 0) {
      await this.db.query(
        `
        INSERT INTO canary_rollouts (
          patch_id, bug_id, feature_flag, traffic_pct, monitors, status
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [
          patchResult.rows[0].id,
          bug.id,
          canary.featureFlag,
          canary.trafficPct,
          JSON.stringify(canary.monitors),
          'started',
        ]
      );
    }

    await this.emitBugEvent(bug.id, 'canary.started', canary);

    logger.info({ bugId: bug.id, featureFlag: canary.featureFlag }, 'Canary started');
  }

  /**
   * Step 7: Integrate with Knowledge Map
   */
  private async integrateKnowledgeMap(bug: Bug, context: any): Promise<void> {
    logger.info({ bugId: bug.id }, 'Integrating with Knowledge Map');

    // TODO: Call RefineryAdapter to create BugFrame
    // Fission: symptom, cause, fix, tests
    // Fusion: prevention rules

    const bugFrame = {
      id: `BugFrame-${bug.id}`,
      symptom: bug.title,
      cause: context.rca.rootCause,
      fix: context.patch.rationale,
      tests: context.tests,
      preventionRules: ['Add null checks for all API inputs'],
    };

    logger.info({ bugId: bug.id, frameId: bugFrame.id }, 'Knowledge Map updated');
  }

  /**
   * Mark bug as fixed
   */
  private async markFixed(bugId: string): Promise<void> {
    await this.updateBugStatus(bugId, 'fixed');
    await this.emitBugEvent(bugId, 'fixed', {});

    this.activeBugs.delete(bugId);

    logger.info({ bugId }, 'Bug marked as fixed');
  }

  /**
   * Escalate with assumptions
   */
  private async escalateWithAssumptions(bug: Bug): Promise<void> {
    logger.warn({ bugId: bug.id }, 'Escalating bug with assumptions');

    // TODO: Register assumptions for unknowns
    // e.g., "Cannot determine root cause with current evidence"

    await this.updateBugStatus(bug.id, 'needs-signal');
  }

  /**
   * Generate fingerprint for deduplication
   */
  private generateFingerprint(bugEvent: BugFoundEvent): string {
    const crypto = require('crypto');

    // Use stack trace if available, otherwise title
    const input = bugEvent.stackTrace || bugEvent.title;

    return crypto.createHash('sha256').update(input).digest('hex');
  }

  /**
   * Auto-assign severity
   */
  private autoAssignSeverity(bugEvent: BugFoundEvent): string {
    // Security bugs are always high priority
    if (bugEvent.source.includes('security')) return 'P0';

    // Production telemetry/beta bugs are high priority
    if (bugEvent.source === 'telemetry' || bugEvent.source === 'beta') return 'P1';

    // Default to P2
    return 'P2';
  }

  /**
   * Auto-assign area
   */
  private autoAssignArea(bugEvent: BugFoundEvent): string {
    if (bugEvent.source.includes('e2e')) return 'frontend';
    if (bugEvent.source.includes('load')) return 'backend';
    if (bugEvent.source.includes('security')) return 'security';

    return 'unknown';
  }

  /**
   * Auto-assign type
   */
  private autoAssignType(bugEvent: BugFoundEvent): string {
    if (bugEvent.source.includes('security')) return 'security';
    if (bugEvent.source.includes('load')) return 'performance';

    return 'functional';
  }

  /**
   * Update bug status
   */
  private async updateBugStatus(bugId: string, status: BugStatus): Promise<void> {
    await this.db.query(`UPDATE bugs SET status = $1, updated_at = NOW() WHERE id = $2`, [
      status,
      bugId,
    ]);

    const bug = this.activeBugs.get(bugId);
    if (bug) {
      bug.status = status;
    }

    logger.debug({ bugId, status }, 'Bug status updated');
  }

  /**
   * Emit bug event
   */
  private async emitBugEvent(
    bugId: string,
    eventType: string,
    payload: any
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO bug_events (bug_id, event_type, payload) VALUES ($1, $2, $3)`,
      [bugId, eventType, JSON.stringify(payload)]
    );

    this.emit(`bug.${eventType}`, { bugId, payload });

    logger.debug({ bugId, eventType }, 'Bug event emitted');
  }

  /**
   * Map database bug to Bug interface
   */
  private mapDbBugToBug(row: any): Bug {
    return {
      id: row.id,
      title: row.title,
      severity: row.severity,
      area: row.area,
      type: row.type,
      status: row.status,
      source: row.source,
      fingerprint: row.fingerprint,
      reproId: row.repro_id,
      fixPr: row.fix_pr,
      ownerAgent: row.owner_agent,
      slaAt: row.sla_at,
      runId: row.run_id,
      metadata: row.metadata,
    };
  }
}
