# IdeaMine Autonomous Bug-Fix System

**Spec Version:** v1.0
**Status:** Implementation Complete

## Overview

The Autonomous Bug-Fix System is a fully automated workflow that detects, reproduces, analyzes, fixes, and deploys bug fixes without human intervention. It operates through a 10-step lifecycle managed by the BugFix Coordinator (BFC), which orchestrates 11 specialized agents.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BugFix Coordinator (BFC)                  │
│                     Mini-Orchestrator                        │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    ┌────▼────┐            ┌────▼────┐
    │ Agents  │            │  Tools  │
    │ (11)    │◄───────────│  (10)   │
    └────┬────┘            └─────────┘
         │
    ┌────▼────┐
    │ Guards  │
    │  (5)    │
    └─────────┘
```

## Components

### 1. BugFix Coordinator (BFC)
**File:** `bugfix-coordinator.ts`

Main orchestrator that manages the entire bug-fix lifecycle:

1. **Intake** - Normalize, dedupe, triage
2. **Reproduce** - Generate MRC (≥0.9 determinism)
3. **RCA** - Bisect + log mining + causal chain
4. **Patch** - Synthesize fix with rationale
5. **Tests** - Author regression tests (red→green)
6. **Verify** - Full suite (lint/tests/sec/perf/coverage)
7. **Gate** - 7-check acceptance gate (≥70% score)
8. **Canary** - Gradual rollout with monitoring
9. **Knowledge** - BugFrame + prevention rules
10. **Fixed** - Mark complete

```typescript
import { BugFixCoordinator } from './bugfix';

const coordinator = new BugFixCoordinator(db, eventBus);

// Process a bug
const bug = await coordinator.processBug({
  bugId: 'bug-123',
  type: 'bug.found',
  payload: {
    source: 'qa_e2e',
    title: 'API returns 500 on /users endpoint',
    stackTrace: '...',
  },
  timestamp: new Date(),
});
```

### 2. Agents (11 Total)
**File:** `agents.ts`

Specialized agents for each step:

| Agent | Purpose | Output |
|-------|---------|--------|
| **BugIntakeAgent** | Normalize, dedupe, triage | bugId, fingerprint, severity |
| **ReproSynthAgent** | Generate MRC | reproId, determinismScore |
| **FlakeDetectorAgent** | Detect flaky tests | isFlaky, quarantined |
| **BisectionAgent** | Git bisect | firstBadCommit, files |
| **LogMinerAgent** | Extract error signatures | errorSignature, templates |
| **RCAAgent** | Root cause analysis | causalChain, confidence |
| **FixSynthAgent** | Synthesize patch | patchId, diff, rationale |
| **TestAuthorAgent** | Write regression tests | testIds, mutationKillRate |
| **VerifierAgent** | Run full test battery | lint_ok, tests_ok, sec_ok |
| **CanaryRollerAgent** | Canary deployment | canaryId, healthy |
| **DocUpdaterAgent** | Update docs | changelogUpdated, bugFrame |

```typescript
import { BugIntakeAgent } from './bugfix';

const agent = new BugIntakeAgent(db);

const result = await agent.execute(
  { bugId: 'bug-123', runId: 'run-456' },
  {
    source: 'qa_e2e',
    title: 'API returns 500',
    stackTrace: '...',
  }
);
// { bugId, fingerprint, severity, isDuplicate, ... }
```

### 3. Tools (10 Total)
**File:** `tools.ts`

Low-level tools used by agents:

- **BugIntakeTool** - Fingerprinting, deduplication
- **ReproSynthTool** - MRC generation, determinism measurement
- **FlakeDetectTool** - Variance analysis, quarantine
- **BisectTool** - Git bisect automation
- **LogMinerTool** - Template extraction, anomaly detection
- **RCATool** - Causal chain builder
- **FixSynthTool** - AST-aware patch generation
- **TestAuthorTool** - Test generation + mutation testing
- **VerifyTool** - Full suite orchestration
- **CanaryTool** - Feature flags + monitoring

### 4. Guards (5 Total)
**File:** `guards.ts`

Quality validators:

| Guard | Threshold | Checks |
|-------|-----------|--------|
| **TestDeterminismGuard** | ≥0.9 | Test stability across N runs |
| **MutationScoreGuard** | ≥0.6 | Mutation kill rate |
| **PerfBudgetGuard** | Custom | p95, p99, memory, CPU |
| **SecurityDeltaGuard** | 0 | New critical vulnerabilities |
| **CoverageDeltaGuard** | ≥0 (or +5%) | Code coverage delta |

```typescript
import { TestDeterminismGuard } from './bugfix';

const guard = new TestDeterminismGuard(db);

const result = await guard.check('test-123', 20);
// { passed: true, score: 0.95, details: '...' }
```

### 5. Fix Acceptance Gate
**File:** `fix-acceptance-gate.ts`

7-check quality gate (≥70% weighted score):

| Check | Weight | Blocking | Criteria |
|-------|--------|----------|----------|
| **Reproduction** | 2.0 | ✅ | Determinism ≥0.9 |
| **Tests** | 1.5 | ✅ | Red→green + mutation ≥0.6 |
| **Security** | 1.5 | ✅ | 0 new criticals |
| **Performance** | 1.0 | ❌ | No regressions |
| **Coverage** | 1.0 | ❌ | Maintained or +5% |
| **Flake** | 1.0 | ❌ | No flakiness (N=20) |
| **Docs** | 0.5 | ❌ | Changelog + BugFrame |

```typescript
import { FixAcceptanceGate } from './bugfix';

const gate = new FixAcceptanceGate(db);

const result = await gate.evaluate({
  bugId: 'bug-123',
  reproId: 'repro-456',
  patchId: 'patch-789',
});

if (result.status === 'pass') {
  // Proceed to canary
} else {
  // Fix deficiencies
  console.log(result.blockingViolations);
}
```

### 6. Event System
**File:** `events.ts`

Type-safe event schemas for bug lifecycle:

- `bug.found` - New bug detected
- `bug.triaged` - Triage complete
- `bug.reproduced` - MRC created
- `bug.flake.detected` - Flaky test found
- `bug.bisection.complete` - First bad commit found
- `bug.rca.ready` - Root cause identified
- `bug.patch.proposed` - Fix generated
- `bug.tests.authored` - Regression tests written
- `bug.verified` - Verification complete
- `bug.gate.passed` / `bug.gate.failed` - Gate result
- `bug.canary.started` / `bug.canary.complete` - Canary events
- `bug.fixed` - Bug fully fixed
- `bug.regressed` - Bug reoccurred

```typescript
import { BugEventStore, BugEventFactory } from './bugfix';

const eventStore = new BugEventStore(db);

// Emit event
await eventStore.emit(
  BugEventFactory.triaged('bug-123', {
    severity: 'P1',
    area: 'backend',
    type: 'functional',
    fingerprint: 'abc123...',
    isDuplicate: false,
    slaDeadline: new Date().toISOString(),
  })
);

// Subscribe to events
eventStore.on('bug.fixed', (event) => {
  console.log(`Bug ${event.bugId} fixed!`);
});

// Query events
const events = await eventStore.getEvents('bug-123');
```

## Database Schema

**Migration:** `migrations/021_bugfix_system.sql`

Tables:
- `bugs` - Main bug tracking
- `repro_artifacts` - Minimal reproducible cases
- `rca` - Root cause analysis
- `patches` - Fix patches/PRs
- `bug_tests` - Regression tests
- `bug_events` - Event stream
- `flaky_tests` - Flaky test quarantine
- `canary_rollouts` - Canary deployments

## Workflows

### Example: E2E Bug Fix

```typescript
import { BugFixCoordinator, BugEventFactory } from './bugfix';
import { Pool } from 'pg';

const db = new Pool({ /* ... */ });
const coordinator = new BugFixCoordinator(db);

// 1. Bug detected from QA E2E test
const bugEvent = BugEventFactory.found('bug-new-123', {
  source: 'qa_e2e',
  title: 'Payment processing fails for amounts >$1000',
  stackTrace: 'TypeError: Cannot read property "amount"...',
  logs: ['[ERROR] Payment gateway timeout...'],
});

// 2. Process bug autonomously
const bug = await coordinator.processBug(bugEvent);

// BFC automatically:
// - Normalizes & triages (severity: P0, area: backend)
// - Generates MRC with 0.95 determinism
// - Bisects to commit abc123
// - Analyzes root cause: "Missing null check in PaymentService"
// - Synthesizes patch with rationale
// - Authors 3 regression tests (mutation kill rate: 0.75)
// - Verifies: lint ✓, tests ✓, sec ✓, perf ✓, coverage ✓
// - Passes gate (score: 85/100)
// - Canary rollout: 5% → 25% → 50% → 100%
// - Creates BugFrame with prevention rules
// - Marks as fixed

console.log(bug.status); // 'fixed'
console.log(bug.fix_pr); // 'PR-12345'
```

### Example: Flake Detection

```typescript
import { FlakeDetectorAgent } from './bugfix';

const agent = new FlakeDetectorAgent(db);

const result = await agent.execute(
  { bugId: 'bug-456' },
  { testPath: 'tests/e2e/checkout.spec.ts' }
);

if (result.isFlaky) {
  // Test quarantined automatically
  console.log(`Flake rate: ${result.flakeRate}`);
  // Bug status → 'flake'
}
```

## SLA Tracking

Automatic SLA calculation based on severity:

| Severity | SLA | Auto-set on bug creation |
|----------|-----|--------------------------|
| P0 | 4 hours | ✅ |
| P1 | 24 hours | ✅ |
| P2 | 7 days | ✅ |
| P3 | 30 days | ✅ |

Query bugs missing SLA:

```sql
SELECT * FROM bugs
WHERE status != 'fixed' AND sla_at < NOW()
ORDER BY sla_at ASC;
```

## Metrics & Dashboards

Built-in views:

```sql
-- Bug fix funnel
SELECT * FROM bug_fix_funnel;

-- MTTR by severity
SELECT
  severity,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600) as mttr_hours
FROM bugs
WHERE status = 'fixed'
GROUP BY severity;

-- Flake rate
SELECT
  COUNT(*) FILTER (WHERE status = 'flake') * 100.0 / COUNT(*) as flake_rate_pct
FROM bugs;

-- Canary success rate
SELECT
  COUNT(*) FILTER (WHERE status = 'complete') * 100.0 / COUNT(*) as success_rate_pct
FROM canary_rollouts;
```

## Integration Points

### 1. QA System
```typescript
// Emit bug from QA test failure
await eventStore.emit(
  BugEventFactory.found('bug-qa-001', {
    source: 'qa_e2e',
    title: 'Login fails after password reset',
    stackTrace: testFailure.stack,
  })
);
```

### 2. Telemetry System
```typescript
// Emit bug from production error spike
await eventStore.emit(
  BugEventFactory.found('bug-prod-001', {
    source: 'telemetry',
    title: '5xx spike on /api/checkout',
    logs: recentErrors,
    context: { p95: 5000, errorRate: 0.15 },
  })
);
```

### 3. Security Scanner
```typescript
// Emit bug from DAST findings
await eventStore.emit(
  BugEventFactory.found('bug-sec-001', {
    source: 'security_dast',
    title: 'SQL injection in search endpoint',
    context: { cwe: 'CWE-89', cvss: 8.5 },
  })
);
```

## Status

✅ **Complete Implementation:**
- [x] Database schema (8 tables, views, triggers)
- [x] BugFix Coordinator (10-step lifecycle)
- [x] 11 Agents (all implemented)
- [x] 10 Tools (all implemented)
- [x] 5 Guards (all implemented)
- [x] Fix Acceptance Gate (7 checks)
- [x] Event system (19 event types)
- [x] Type-safe schemas

🔜 **TODO:**
- [ ] LLM integration for agents (marked with TODO)
- [ ] Real-time event streaming (PostgreSQL LISTEN/NOTIFY)
- [ ] Mutation testing integration (Stryker)
- [ ] Feature flag system integration
- [ ] CI/CD pipeline integration

## References

- **Spec:** IdeaMine Autonomous Bug-Fix System Spec v1.0
- **Database:** `migrations/021_bugfix_system.sql`
- **Coordinator:** `bugfix-coordinator.ts`
- **Agents:** `agents.ts`
- **Tools:** `tools.ts`
- **Guards:** `guards.ts`
- **Gate:** `fix-acceptance-gate.ts`
- **Events:** `events.ts`
