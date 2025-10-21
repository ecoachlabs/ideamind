/**
 * Bug-Fix Event Schemas
 *
 * Spec: IdeaMine Autonomous Bug-Fix System Spec v1.0 Section 4
 *
 * Type-safe event schemas for bug lifecycle.
 * All events are stored in bug_events table.
 */

// ============================================================================
// Base Event Types
// ============================================================================

export interface BaseBugEvent {
  bugId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// ============================================================================
// Bug Lifecycle Events
// ============================================================================

/**
 * Event: bug.found
 *
 * Emitted when a new bug is detected from any source.
 */
export interface BugFoundEvent extends BaseBugEvent {
  type: 'bug.found';
  payload: {
    source: 'qa_e2e' | 'qa_load' | 'security_dast' | 'telemetry' | 'beta' | 'fuzzer' | 'story_loop_ci';
    title: string;
    severity?: 'P0' | 'P1' | 'P2' | 'P3';
    stackTrace?: string;
    logs?: string[];
    context?: Record<string, any>;
  };
}

/**
 * Event: bug.triaged
 *
 * Emitted after bug intake completes triage.
 */
export interface BugTriagedEvent extends BaseBugEvent {
  type: 'bug.triaged';
  payload: {
    severity: 'P0' | 'P1' | 'P2' | 'P3';
    area: string;
    type: 'functional' | 'performance' | 'security' | 'ux' | 'data';
    fingerprint: string;
    isDuplicate: boolean;
    duplicateOf?: string;
    slaDeadline: string; // ISO 8601
  };
}

/**
 * Event: bug.reproduced
 *
 * Emitted when minimal reproducible case (MRC) is created.
 */
export interface BugReproducedEvent extends BaseBugEvent {
  type: 'bug.reproduced';
  payload: {
    reproId: string;
    reproType: 'script' | 'test' | 'docker' | 'curl' | 'sql';
    determinismScore: number; // 0.0 to 1.0
    isDeterministic: boolean; // >= 0.9
    runs: {
      passed: number;
      failed: number;
      total: number;
    };
  };
}

/**
 * Event: bug.flake.detected
 *
 * Emitted when a test is identified as flaky (not a real bug).
 */
export interface BugFlakeDetectedEvent extends BaseBugEvent {
  type: 'bug.flake.detected';
  payload: {
    testPath: string;
    flakeRate: number; // 0.0 to 1.0
    totalRuns: number;
    failedRuns: number;
    quarantined: boolean;
    recommendation: string;
  };
}

/**
 * Event: bug.bisection.complete
 *
 * Emitted when git bisect finds first bad commit.
 */
export interface BugBisectionCompleteEvent extends BaseBugEvent {
  type: 'bug.bisection.complete';
  payload: {
    firstBadCommit: string; // Git SHA
    commitMessage: string;
    author: string;
    affectedFiles: string[];
    timestamp: string; // ISO 8601
  };
}

/**
 * Event: bug.rca.ready
 *
 * Emitted when root cause analysis is complete.
 */
export interface BugRCAReadyEvent extends BaseBugEvent {
  type: 'bug.rca.ready';
  payload: {
    rcaId: string;
    rootCause: string;
    causalChain: Array<{
      step: 'defect' | 'faulty_code' | 'trigger' | 'effect';
      artifact: string;
      reasoning: string;
    }>;
    confidence: number; // 0.0 to 1.0
    evidenceIds: string[];
  };
}

/**
 * Event: bug.patch.proposed
 *
 * Emitted when a fix patch/PR is generated.
 */
export interface BugPatchProposedEvent extends BaseBugEvent {
  type: 'bug.patch.proposed';
  payload: {
    patchId: string;
    prId: string;
    rationale: string;
    filesChanged: string[];
    linesAdded: number;
    linesRemoved: number;
  };
}

/**
 * Event: bug.tests.authored
 *
 * Emitted when regression tests are written.
 */
export interface BugTestsAuthoredEvent extends BaseBugEvent {
  type: 'bug.tests.authored';
  payload: {
    testCount: number;
    testPaths: string[];
    testKinds: Array<'unit' | 'property' | 'integration' | 'e2e' | 'mutation'>;
    mutationKillRate: number; // 0.0 to 1.0
    redToGreen: boolean;
  };
}

/**
 * Event: bug.verified
 *
 * Emitted when fix passes full verification suite.
 */
export interface BugVerifiedEvent extends BaseBugEvent {
  type: 'bug.verified';
  payload: {
    passed: boolean;
    checks: {
      lint: boolean;
      tests: boolean;
      security: boolean;
      performance: boolean;
      coverage: boolean;
    };
    failures?: string[];
  };
}

/**
 * Event: bug.gate.passed
 *
 * Emitted when fix passes acceptance gate.
 */
export interface BugGatePassedEvent extends BaseBugEvent {
  type: 'bug.gate.passed';
  payload: {
    overallScore: number; // 0-100
    threshold: number; // 70
    checks: {
      reproduction: { passed: boolean; score: number };
      tests: { passed: boolean; score: number };
      security: { passed: boolean; score: number };
      performance: { passed: boolean; score: number };
      coverage: { passed: boolean; score: number };
      flake: { passed: boolean; score: number };
      docs: { passed: boolean; score: number };
    };
  };
}

/**
 * Event: bug.gate.failed
 *
 * Emitted when fix fails acceptance gate.
 */
export interface BugGateFailedEvent extends BaseBugEvent {
  type: 'bug.gate.failed';
  payload: {
    overallScore: number;
    threshold: number;
    blockingViolations: string[];
    failedChecks: string[];
    recommendation: string;
  };
}

/**
 * Event: bug.canary.started
 *
 * Emitted when canary deployment begins.
 */
export interface BugCanaryStartedEvent extends BaseBugEvent {
  type: 'bug.canary.started';
  payload: {
    canaryId: string;
    featureFlag: string;
    initialTrafficPct: number;
    monitors: string[];
  };
}

/**
 * Event: bug.canary.ramping
 *
 * Emitted when canary traffic is ramped up.
 */
export interface BugCanaryRampingEvent extends BaseBugEvent {
  type: 'bug.canary.ramping';
  payload: {
    canaryId: string;
    fromPct: number;
    toPct: number;
    healthy: boolean;
    metrics?: Record<string, number>;
  };
}

/**
 * Event: bug.canary.complete
 *
 * Emitted when canary deployment completes successfully.
 */
export interface BugCanaryCompleteEvent extends BaseBugEvent {
  type: 'bug.canary.complete';
  payload: {
    canaryId: string;
    finalTrafficPct: number; // 100
    totalDuration: number; // milliseconds
  };
}

/**
 * Event: bug.canary.rolled_back
 *
 * Emitted when canary is rolled back due to issues.
 */
export interface BugCanaryRolledBackEvent extends BaseBugEvent {
  type: 'bug.canary.rolled_back';
  payload: {
    canaryId: string;
    trafficPctAtRollback: number;
    reason: string;
    violations: string[];
  };
}

/**
 * Event: bug.docs.updated
 *
 * Emitted when documentation is updated (changelog, runbook, BugFrame).
 */
export interface BugDocsUpdatedEvent extends BaseBugEvent {
  type: 'bug.docs.updated';
  payload: {
    changelogUpdated: boolean;
    runbookUpdated: boolean;
    bugFrameCreated: boolean;
    knowledgeFrameId?: string;
  };
}

/**
 * Event: bug.fixed
 *
 * Emitted when bug is fully fixed and deployed.
 */
export interface BugFixedEvent extends BaseBugEvent {
  type: 'bug.fixed';
  payload: {
    prId: string;
    canaryId?: string;
    fixDuration: number; // milliseconds from detection to fix
    slaStatus: 'met' | 'missed';
  };
}

/**
 * Event: bug.regressed
 *
 * Emitted when a fixed bug reoccurs.
 */
export interface BugRegressedEvent extends BaseBugEvent {
  type: 'bug.regressed';
  payload: {
    originalBugId: string;
    originalPrId: string;
    reason: string;
    regressedAt: string; // ISO 8601
  };
}

/**
 * Event: bug.needs_signal
 *
 * Emitted when bug requires more information/signal.
 */
export interface BugNeedsSignalEvent extends BaseBugEvent {
  type: 'bug.needs_signal';
  payload: {
    reason: string;
    requiredSignal: string[];
    waitingFor: string;
  };
}

// ============================================================================
// Union Type for All Bug Events
// ============================================================================

export type BugEvent =
  | BugFoundEvent
  | BugTriagedEvent
  | BugReproducedEvent
  | BugFlakeDetectedEvent
  | BugBisectionCompleteEvent
  | BugRCAReadyEvent
  | BugPatchProposedEvent
  | BugTestsAuthoredEvent
  | BugVerifiedEvent
  | BugGatePassedEvent
  | BugGateFailedEvent
  | BugCanaryStartedEvent
  | BugCanaryRampingEvent
  | BugCanaryCompleteEvent
  | BugCanaryRolledBackEvent
  | BugDocsUpdatedEvent
  | BugFixedEvent
  | BugRegressedEvent
  | BugNeedsSignalEvent;

// ============================================================================
// Event Emitter Interface
// ============================================================================

export interface BugEventEmitter {
  emit(event: BugEvent): Promise<void>;
  on(eventType: BugEvent['type'], handler: (event: BugEvent) => void): void;
}

// ============================================================================
// Event Store
// ============================================================================

import { Pool } from 'pg';
import { EventEmitter } from 'events';
import pino from 'pino';

const logger = pino({ name: 'bug-event-store' });

/**
 * Bug Event Store
 *
 * Persists bug events to database and emits to event bus.
 */
export class BugEventStore extends EventEmitter implements BugEventEmitter {
  constructor(private db: Pool) {
    super();
  }

  /**
   * Emit a bug event (persist + publish)
   */
  async emit(event: BugEvent): Promise<void> {
    logger.debug({ event }, 'Emitting bug event');

    // Persist to database
    await this.db.query(
      `
      INSERT INTO bug_events (bug_id, event_type, payload, timestamp, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `,
      [
        event.bugId,
        event.type,
        JSON.stringify(event.payload),
        event.timestamp || new Date(),
        JSON.stringify(event.metadata || {}),
      ]
    );

    // Publish to event bus (in-memory for now)
    super.emit(event.type, event);

    logger.info({ bugId: event.bugId, type: event.type }, 'Bug event emitted');
  }

  /**
   * Subscribe to bug events
   */
  on(eventType: BugEvent['type'], handler: (event: BugEvent) => void): this {
    return super.on(eventType, handler);
  }

  /**
   * Query events for a bug
   */
  async getEvents(bugId: string, eventType?: BugEvent['type']): Promise<BugEvent[]> {
    const query = eventType
      ? `SELECT * FROM bug_events WHERE bug_id = $1 AND event_type = $2 ORDER BY timestamp ASC`
      : `SELECT * FROM bug_events WHERE bug_id = $1 ORDER BY timestamp ASC`;

    const params = eventType ? [bugId, eventType] : [bugId];

    const result = await this.db.query(query, params);

    return result.rows.map((row) => ({
      bugId: row.bug_id,
      type: row.event_type,
      payload: row.payload,
      timestamp: row.timestamp,
      metadata: row.metadata,
    })) as BugEvent[];
  }

  /**
   * Get latest event for a bug
   */
  async getLatestEvent(bugId: string): Promise<BugEvent | null> {
    const result = await this.db.query(
      `SELECT * FROM bug_events WHERE bug_id = $1 ORDER BY timestamp DESC LIMIT 1`,
      [bugId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      bugId: row.bug_id,
      type: row.event_type,
      payload: row.payload,
      timestamp: row.timestamp,
      metadata: row.metadata,
    } as BugEvent;
  }

  /**
   * Stream events (for real-time dashboards)
   */
  async *streamEvents(
    fromTimestamp?: Date,
    eventTypes?: BugEvent['type'][]
  ): AsyncGenerator<BugEvent> {
    // TODO: Implement real-time streaming using PostgreSQL LISTEN/NOTIFY
    // For now, poll every second
    while (true) {
      const conditions = [];
      const params: any[] = [];

      if (fromTimestamp) {
        conditions.push(`timestamp > $${params.length + 1}`);
        params.push(fromTimestamp);
      }

      if (eventTypes && eventTypes.length > 0) {
        conditions.push(`event_type = ANY($${params.length + 1})`);
        params.push(eventTypes);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await this.db.query(
        `SELECT * FROM bug_events ${whereClause} ORDER BY timestamp ASC`,
        params
      );

      for (const row of result.rows) {
        yield {
          bugId: row.bug_id,
          type: row.event_type,
          payload: row.payload,
          timestamp: row.timestamp,
          metadata: row.metadata,
        } as BugEvent;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

// ============================================================================
// Event Factory
// ============================================================================

/**
 * Factory for creating type-safe bug events
 */
export class BugEventFactory {
  static found(bugId: string, payload: BugFoundEvent['payload']): BugFoundEvent {
    return {
      bugId,
      type: 'bug.found',
      payload,
      timestamp: new Date(),
    };
  }

  static triaged(bugId: string, payload: BugTriagedEvent['payload']): BugTriagedEvent {
    return {
      bugId,
      type: 'bug.triaged',
      payload,
      timestamp: new Date(),
    };
  }

  static reproduced(
    bugId: string,
    payload: BugReproducedEvent['payload']
  ): BugReproducedEvent {
    return {
      bugId,
      type: 'bug.reproduced',
      payload,
      timestamp: new Date(),
    };
  }

  static flakeDetected(
    bugId: string,
    payload: BugFlakeDetectedEvent['payload']
  ): BugFlakeDetectedEvent {
    return {
      bugId,
      type: 'bug.flake.detected',
      payload,
      timestamp: new Date(),
    };
  }

  static bisectionComplete(
    bugId: string,
    payload: BugBisectionCompleteEvent['payload']
  ): BugBisectionCompleteEvent {
    return {
      bugId,
      type: 'bug.bisection.complete',
      payload,
      timestamp: new Date(),
    };
  }

  static rcaReady(bugId: string, payload: BugRCAReadyEvent['payload']): BugRCAReadyEvent {
    return {
      bugId,
      type: 'bug.rca.ready',
      payload,
      timestamp: new Date(),
    };
  }

  static patchProposed(
    bugId: string,
    payload: BugPatchProposedEvent['payload']
  ): BugPatchProposedEvent {
    return {
      bugId,
      type: 'bug.patch.proposed',
      payload,
      timestamp: new Date(),
    };
  }

  static testsAuthored(
    bugId: string,
    payload: BugTestsAuthoredEvent['payload']
  ): BugTestsAuthoredEvent {
    return {
      bugId,
      type: 'bug.tests.authored',
      payload,
      timestamp: new Date(),
    };
  }

  static verified(
    bugId: string,
    payload: BugVerifiedEvent['payload']
  ): BugVerifiedEvent {
    return {
      bugId,
      type: 'bug.verified',
      payload,
      timestamp: new Date(),
    };
  }

  static gatePassed(
    bugId: string,
    payload: BugGatePassedEvent['payload']
  ): BugGatePassedEvent {
    return {
      bugId,
      type: 'bug.gate.passed',
      payload,
      timestamp: new Date(),
    };
  }

  static gateFailed(
    bugId: string,
    payload: BugGateFailedEvent['payload']
  ): BugGateFailedEvent {
    return {
      bugId,
      type: 'bug.gate.failed',
      payload,
      timestamp: new Date(),
    };
  }

  static canaryStarted(
    bugId: string,
    payload: BugCanaryStartedEvent['payload']
  ): BugCanaryStartedEvent {
    return {
      bugId,
      type: 'bug.canary.started',
      payload,
      timestamp: new Date(),
    };
  }

  static canaryRamping(
    bugId: string,
    payload: BugCanaryRampingEvent['payload']
  ): BugCanaryRampingEvent {
    return {
      bugId,
      type: 'bug.canary.ramping',
      payload,
      timestamp: new Date(),
    };
  }

  static canaryComplete(
    bugId: string,
    payload: BugCanaryCompleteEvent['payload']
  ): BugCanaryCompleteEvent {
    return {
      bugId,
      type: 'bug.canary.complete',
      payload,
      timestamp: new Date(),
    };
  }

  static canaryRolledBack(
    bugId: string,
    payload: BugCanaryRolledBackEvent['payload']
  ): BugCanaryRolledBackEvent {
    return {
      bugId,
      type: 'bug.canary.rolled_back',
      payload,
      timestamp: new Date(),
    };
  }

  static docsUpdated(
    bugId: string,
    payload: BugDocsUpdatedEvent['payload']
  ): BugDocsUpdatedEvent {
    return {
      bugId,
      type: 'bug.docs.updated',
      payload,
      timestamp: new Date(),
    };
  }

  static fixed(bugId: string, payload: BugFixedEvent['payload']): BugFixedEvent {
    return {
      bugId,
      type: 'bug.fixed',
      payload,
      timestamp: new Date(),
    };
  }

  static regressed(
    bugId: string,
    payload: BugRegressedEvent['payload']
  ): BugRegressedEvent {
    return {
      bugId,
      type: 'bug.regressed',
      payload,
      timestamp: new Date(),
    };
  }

  static needsSignal(
    bugId: string,
    payload: BugNeedsSignalEvent['payload']
  ): BugNeedsSignalEvent {
    return {
      bugId,
      type: 'bug.needs_signal',
      payload,
      timestamp: new Date(),
    };
  }
}
