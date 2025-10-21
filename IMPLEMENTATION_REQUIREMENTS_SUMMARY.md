# IdeaMine Implementation Requirements - Complete Summary

**Generated:** 2025-10-20
**Source Documents:**
- UNIFIED_IMPLEMENTATION_SPEC.md (3,306 lines)
- UNIFIED_IMPLEMENTATION_SPEC_PART2.md (1,739 lines)

**Status:** Comprehensive requirements extraction for gap analysis

---

## Executive Summary

**Total Implementation Scope:**
- **71 files to create**
- **75 files to modify**
- **13 database tables** to create/enhance
- **55 days effort** (11 weeks)
- **MVP delivery:** 30 days (after Execution Layer)
- **Full compliance:** 55 days

**Implementation organized in 6 layers:**
1. Foundation Layer (Week 1-2) - 10 days
2. Autonomy Layer (Week 3-4) - 8 days
3. Execution Layer (Week 5-6) - 12 days
4. Resilience Layer (Week 7-8) - 8 days
5. Observability Layer (Week 9-10) - 8 days
6. Production Hardening (Week 11) - 9 days

---

## 1. MAJOR COMPONENTS/SYSTEMS

### 1.1 Mothership Orchestrator (Enhanced)

**Components:**
- **Run Planner** - Generates execution plans (RunPlan + PhasePlan)
- **DAG Executor** - Parallel phase execution with topological ordering
- **Self-Exec Mode (SEM)** - Autonomous execution mode
- **Auto-Doer Creator** - Automated task generation
- **Loop-Until-Pass Gate** - Automatic retry with fixes until gates pass

**Files:**
- `packages/orchestrator-core/src/planning/run-planner.ts` (CREATE)
- `packages/orchestrator-core/src/dag/dag-executor.ts` (CREATE)
- `packages/orchestrator-core/src/enhanced-orchestrator.ts` (MODIFY)

### 1.2 Phase Coordinator (Enhanced - 12 Phases)

**13 Phase Types:**
1. Intake
2. Ideation
3. Critique
4. PRD
5. BizDev
6. Architecture
7. Build
8. Security (Phase 6a)
9. Story Loop
10. QA
11. Aesthetic
12. Release
13. Beta

**Internal Stages (6 per coordinator):**
1. **Plan** - Derive phase execution plan
2. **Dispatch** - Fan-out to agents
3. **Guard** - Run validation guards
4. **Heal** - Auto-fix issues
5. **Clarify** - Q/A/V Triad processing
6. **Handoff** - Gate evaluation + evidence pack

**Files:**
- `packages/orchestrator-core/src/base/enhanced-phase-coordinator.ts` (CREATE)
- `packages/orchestrator-core/src/base/refinery-adapter.ts` (CREATE)

### 1.3 Q/A/V Triad (Autonomy System)

**Three Agents:**
- **Question Agent** - Generates questions for unsupported claims
- **Answer Agent** - Answers questions using tools
- **Question Validator** - Validates answers (ACCEPT/REJECT/UNKNOWN)

**Capabilities:**
- Autonomous clarification without human input
- Grounding score calculation
- Assumption tracking
- Knowledge Map integration (fission/fusion)

**Files:**
- `packages/agents/src/qav/question-agent.ts` (CREATE)
- `packages/agents/src/qav/answer-agent.ts` (CREATE)
- `packages/agents/src/qav/question-validator.ts` (CREATE)
- `packages/agents/src/qav/index.ts` (CREATE)

### 1.4 Knowledge Refinery Integration

**Operations:**
- **Fission** - Break down claims into knowledge frames
- **Fusion** - Merge frames with consensus checking
- **Coverage** - Track knowledge completeness (fission_min_coverage: 0.90)
- **Consensus** - Validate agreement (fusion_min_consensus: 0.85)

**Events:**
- `kmap.delta.created` - New knowledge frames
- `kmap.fusion.complete` - Merged knowledge

**Files:**
- Enhanced Q/A/V integration with refinery (in base/refinery-adapter.ts)

### 1.5 Infrastructure Services Layer (10 Components)

#### Job Queue (Redis Streams)
- Persistent task queue
- Priority-based scheduling
- Worker acknowledgment
- Dead letter queue

**Files:**
- `packages/orchestrator-core/src/queue/queue.ts` (CREATE)

#### WorkerPool
- Sandboxed execution environments
- Heartbeat monitoring
- Graceful shutdown
- Worker health tracking

**Files:**
- `packages/orchestrator-core/src/worker/worker.ts` (CREATE)
- `packages/orchestrator-core/src/worker/worker-pool.ts` (CREATE)

#### Scheduler Service
- TaskSpec distribution
- Sharding support
- Load balancing
- Priority queuing

**Files:**
- `packages/orchestrator-core/src/scheduler/scheduler.ts` (CREATE)

#### Timer Service
- Durable timers (DB-backed)
- Retry scheduling
- Timeout enforcement
- Poller with 1-second precision

**Files:**
- `packages/orchestrator-core/src/timer/timer-service.ts` (CREATE)

#### Checkpoint System
- Resume-from-checkpoint capability
- Token-based resumption
- Database persistence
- Worker crash recovery

**Files:**
- `packages/orchestrator-core/src/checkpoint/checkpoint-manager.ts` (CREATE)
- `packages/orchestrator-core/src/checkpoint/checkpoint-repository.ts` (CREATE)

#### Event Bus
- Topic-based pub/sub
- 7 structured phase events
- Run lifecycle events
- Integration events (kmap.delta, etc.)

**Files:**
- `packages/event-schemas/src/phase-events.ts` (CREATE)

#### Recorder (Run Ledger)
- Immutable append-only timeline
- 6 entry types: task, gate, decision, artifact, cost, signature
- Provenance tracking
- Query interface

**Files:**
- `packages/orchestrator-core/src/ledger/run-ledger.ts` (CREATE)

#### Gatekeeper
- Rubric evaluation
- Evidence pack validation
- Pass/fail decisions
- Waiver support

**Logic integrated in enhanced-phase-coordinator.ts**

#### Supervisor (Unsticker)
- Heartbeat monitoring
- Stall detection (3 missed heartbeats)
- Auto-unsticking routines
- Strategy selection

**Files:**
- `packages/orchestrator-core/src/supervisor/supervisor.ts` (MODIFY)
- `packages/orchestrator-core/src/heal/heartbeatGuard.ts` (CREATE)
- `packages/orchestrator-core/src/heal/slopeMonitor.ts` (CREATE)
- `packages/orchestrator-core/src/heal/fallbackLadder.ts` (CREATE)
- `packages/orchestrator-core/src/heal/chunker.ts` (CREATE)

#### Dispatcher
- Routing logic
- Agent selection
- Tool invocation
- Fan-out orchestration

**Files:**
- `packages/orchestrator-core/src/runners/fanout.ts` (CREATE)

---

## 2. ALL FEATURES AND CAPABILITIES

### 2.1 Foundation Layer Features

#### Phase Configuration System
- **12+ YAML configuration files** (one per phase)
- Dynamic agent assignment without code changes
- Parallelism modes: sequential, 2, 3, 4, partial, iterative
- Budget controls: tokens, tools_minutes, gpu_hours
- Quality rubrics per phase
- Tool allowlisting for security
- Heartbeat configuration
- Timebox enforcement (ISO8601 durations)

**Files:**
```
config/intake.yaml
config/ideation.yaml
config/critique.yaml
config/prd.yaml
config/bizdev.yaml
config/architecture.yaml
config/build.yaml
config/security.yaml
config/story-loop.yaml
config/qa.yaml
config/aesthetic.yaml
config/release.yaml
config/beta.yaml
```

#### JSON Schema Contracts
- **PhaseContext** - Input contract for all coordinators
- **TaskSpec** - Individual task specifications
- **EvidencePack** - Gate evaluation evidence (generalized)
- **RunPlan** - Orchestrator execution plan
- **PhasePlan** - Individual phase execution plan

**Validation:**
- AJV-based schema validation
- Strict type checking
- Additional properties blocked

#### Structured Event System
**7 Phase Events:**
1. `phase.started` - Phase begins
2. `phase.progress` - Progress updates (% complete)
3. `phase.agent.complete` - Individual agent finished
4. `phase.ready` - Waiting for gate evaluation
5. `phase.gate.passed` - Gate approved
6. `phase.gate.failed` - Gate rejected (with reasons)
7. `phase.complete` - Phase fully done

#### Budget Tracking
- Real-time budget monitoring
- Per-phase budget enforcement
- Multi-resource tracking (tokens, tools_minutes, gpu_hours, cost_usd)
- Budget alerts and blocking
- Usage aggregation

**Files:**
- `packages/orchestrator-core/src/budget/budget-tracker.ts` (CREATE)

### 2.2 Autonomy Layer Features

#### Q/A/V Triad Loop
- Autonomous claim extraction
- Question generation from unsupported claims
- Tool-based answer discovery
- 3-state validation (ACCEPT/REJECT/UNKNOWN)
- Grounding score calculation
- Assumption tracking
- No human intervention required

#### Knowledge Refinery Integration
- Fission: Break claims into frames
- Fusion: Merge frames with consensus
- Coverage tracking (min 90%)
- Consensus validation (min 85%)
- Knowledge Map delta events
- Frame ID tracking in evidence packs

#### Autonomous Clarification Loop
- Detect ambiguity in phase outputs
- Generate clarification questions
- Self-answer using tools/context
- Iterate until clarity threshold met
- Track clarifications in evidence

**Files:**
- Logic integrated in `enhanced-phase-coordinator.ts`

### 2.3 Execution Layer Features

#### Job Queue (Redis Streams)
- Persistent task queuing
- Stream-based architecture
- Consumer groups
- Automatic acknowledgment
- Dead letter queue for failures
- Priority support via multiple streams

#### Checkpoint System
- Token-based resumption
- Automatic checkpoint saving
- Worker crash recovery
- Resume from last checkpoint
- Idempotence via checkpoint tokens

#### WorkerPool Management
- Dynamic worker spawning
- Sandboxed execution (Docker containers)
- Heartbeat monitoring every 60 seconds
- Graceful shutdown
- Worker health tracking
- Auto-restart on failures

#### Scheduler Service
- TaskSpec-based scheduling
- Sharding for distributed execution
- Load balancing across workers
- Priority queuing
- Worker assignment optimization

#### Timer Service (Durable)
- Database-backed timers
- Retry scheduling
- Timeout enforcement
- Poller with 1-second resolution
- Action types: retry, timeout
- Timer persistence across restarts

#### State Store
- Phase execution state
- Task status tracking
- Checkpoint persistence
- Event log
- Timer records

### 2.4 Resilience Layer Features

#### Heartbeat Monitoring
- 60-second heartbeat intervals
- 3 missed heartbeats = stall detection
- Worker health tracking
- Automatic alerts
- Stall events emitted

**Files:**
- `packages/orchestrator-core/src/runners/heartbeat.ts` (CREATE)

#### Unsticker Routines (4 Strategies)
1. **HeartbeatGuard** - Detect stalls, escalate to supervisor
2. **SlopeMonitor** - Detect progress stalls (no output change)
3. **FallbackLadder** - Try smaller models (gpt-4 → gpt-3.5)
4. **Chunker** - Split large inputs into smaller batches

**Triggers:**
- No heartbeat for 3 intervals (180 seconds)
- Progress < 5% in 2 heartbeat intervals
- Repeated failures

#### Retry Policy Engine
- Exponential backoff
- Jitter addition
- Max attempts configuration
- Retry reasons tracking
- Idempotence key enforcement
- Circuit breaker pattern

**Files:**
- `packages/orchestrator-core/src/utils/retries.ts` (CREATE)
- `packages/orchestrator-core/src/utils/idempotence.ts` (CREATE)

#### Enhanced Supervisor
- Stall detection
- Unsticker strategy selection
- Worker health monitoring
- Automatic recovery orchestration
- Escalation to human when needed

### 2.5 Observability Layer Features

#### Run Ledger (Immutable Timeline)
**6 Entry Types:**
1. **task** - Task executions with cost
2. **gate** - Gate evaluations
3. **decision** - Orchestrator decisions
4. **artifact** - Artifact creation
5. **cost** - Resource usage
6. **signature** - Cryptographic signatures

**Capabilities:**
- Append-only (immutable)
- Provenance tracking (who, when, inputs)
- Query by type, time range
- Complete audit trail
- Tool version tracking

#### Metrics Collection
**Phase Metrics:**
- Duration (ms)
- Gate pass/fail with retries
- Agent success/failure counts
- Resource usage (tokens, tools_minutes, cost)
- Quality metrics (test pass %, coverage %, CVEs)

**Aggregate Metrics:**
- Total run duration
- Total cost
- Phase completion rate
- Gate pass rate
- P95 latency per phase

**Files:**
- `packages/orchestrator-core/src/metrics/metrics-collector.ts` (CREATE)

#### Provenance Tracking
- Artifact lineage (recursive ancestry)
- Source agent/tool identification
- Input artifact tracking
- Tool version recording
- Cost attribution per artifact
- Hash-based integrity

**Enhancement to artifacts table with provenance column**

#### OpenTelemetry Integration
**Tracing:**
- Run spans
- Phase spans
- Task spans (agent/tool)
- Tool invocation spans
- Event correlation

**Export:**
- Jaeger exporter
- Distributed tracing
- Span attributes (run_id, phase, task_id, etc.)
- Error recording
- Success/failure status

**Files:**
- `packages/orchestrator-core/src/tracing/otel.ts` (CREATE)

#### Evidence Pack Generalization
- Used by ALL phases (not just Security)
- Contains: artifacts, guard_reports, qav_summary, kmap_refs, metrics
- Enables consistent gate evaluation
- Provenance ready

### 2.6 Production Hardening Features

#### DAG Execution Engine
- Topological sorting of phases
- Parallel execution of independent phases
- Example: Security + Story Loop run in parallel
- Dependency-based scheduling
- Level-by-level execution

#### Fan-Out/Fan-In Pattern
**Fan-Out Modes:**
- `sequential` - One agent at a time
- `2`, `3`, `4` - Fixed parallelism
- `partial` - Dependency-based parallelism
- `iterative` - Loop pattern (Story Loop)

**Fan-In Strategies:**
- `merge` - Object merging with conflict resolution
- `concat` - Array concatenation
- `vote` - Consensus/majority voting
- `custom` - Custom aggregation logic

**Determinism:**
- Schema-constrained outputs
- Sorted keys for JSON determinism
- Reproducible aggregation

#### Loop-Until-Pass Gate Pattern
- Max 5 retry attempts per phase
- Auto-fix based on gate failure reasons
- Issues → Fix strategies:
  - Grounding issues → Re-run Q/A/V with strict mode
  - Coverage issues → Run missing agents
  - Security issues → Re-run security scans
- Automatic retry loop
- Fail after max attempts

#### Release Dossier Compilation
**Contents:**
- Product artifacts: PRD, RTM, API spec (OpenAPI)
- Code artifacts: repo URL, commit SHA, test reports, coverage
- Security artifacts: security pack, SBOM, signatures, vulnerability scans
- Quality artifacts: performance reports, accessibility reports, release notes
- Deployment artifacts: deployment plan, rollback plan, canary rules

**Export Formats:**
- JSON
- PDF
- HTML

**Files:**
- `packages/orchestrator-core/src/dossier/release-dossier.ts` (CREATE)

#### Testing Strategy
**Test Types:**
1. **Unit Tests** - Individual components
2. **Integration Tests** - Component interactions
3. **Acceptance Tests** - 10 criteria validation
4. **Soak Tests** - 24-48 hour runs with induced stalls
5. **Chaos Tests** - Random failures (container kills, network cuts, registry outages)

**10 Acceptance Criteria:**
1. Event sequence validation
2. Checkpoint resume after crash
3. Unsticker handles stalls
4. Failing guards block gates
5. Q/A/V produces bindings and kmap events
6. Config changes agents without code
7. Dashboards update live
8. demo:intake produces artifacts
9. End-to-end autonomy (no human input)
10. Parallel phases execute correctly

**Files:**
- `packages/orchestrator-core/src/__tests__/acceptance/acceptance-tests.ts` (CREATE)

---

## 3. DATABASE SCHEMAS

### 3.1 Complete Table List (13 Tables)

1. **runs** (enhanced)
2. **phases** (new)
3. **tasks** (new)
4. **checkpoints** (new)
5. **events** (new)
6. **timers** (new)
7. **assumptions** (new)
8. **evidence_packs** (new)
9. **ledger** (new)
10. **phase_metrics** (new)
11. **artifacts** (enhanced)
12. **waivers** (new)
13. **release_dossiers** (new)

### 3.2 Detailed Schema Specifications

#### Table: runs (enhanced)
```sql
ALTER TABLE runs ADD COLUMN IF NOT EXISTS version VARCHAR(20) DEFAULT '1.0.0';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS plan_hash VARCHAR(64);
```

#### Table: phases
```sql
CREATE TABLE IF NOT EXISTS phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  budgets JSONB NOT NULL,
  usage JSONB,
  plan_hash VARCHAR(64),
  evidence_pack_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(run_id, phase_id)
);
CREATE INDEX idx_phases_run_id ON phases(run_id);
CREATE INDEX idx_phases_status ON phases(status);
```

#### Table: tasks
```sql
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('agent', 'tool')),
  target VARCHAR(100) NOT NULL,
  input JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  retries INTEGER DEFAULT 0,
  result JSONB,
  error TEXT,
  cost JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_tasks_phase ON tasks(phase_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_type ON tasks(type);
```

#### Table: checkpoints
```sql
CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  token VARCHAR(100) NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(task_id)
);
CREATE INDEX idx_checkpoints_task ON checkpoints(task_id);
```

#### Table: events
```sql
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase_id VARCHAR(50),
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_events_run ON events(run_id);
CREATE INDEX idx_events_phase ON events(phase_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_timestamp ON events(timestamp);
```

#### Table: timers
```sql
CREATE TABLE IF NOT EXISTS timers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(100) NOT NULL UNIQUE,
  fire_at TIMESTAMP NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('retry', 'timeout')),
  payload JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_timers_fire_at ON timers(fire_at);
```

#### Table: assumptions
```sql
CREATE TABLE IF NOT EXISTS assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase_id VARCHAR(50) NOT NULL,
  assumption TEXT NOT NULL,
  rationale TEXT,
  mitigation_task_id UUID,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  validated_at TIMESTAMP
);
CREATE INDEX idx_assumptions_run_id ON assumptions(run_id);
CREATE INDEX idx_assumptions_phase ON assumptions(phase_id);
CREATE INDEX idx_assumptions_status ON assumptions(status);
```

#### Table: evidence_packs
```sql
CREATE TABLE IF NOT EXISTS evidence_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase_id VARCHAR(50) NOT NULL,
  artifacts JSONB NOT NULL,
  guard_reports JSONB NOT NULL,
  qav_summary JSONB,
  kmap_refs JSONB,
  metrics JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_evidence_run_id ON evidence_packs(run_id);
CREATE INDEX idx_evidence_phase ON evidence_packs(phase_id);
```

#### Table: ledger (immutable)
```sql
CREATE TABLE IF NOT EXISTS ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('task', 'gate', 'decision', 'artifact', 'cost', 'signature')),
  data JSONB NOT NULL,
  provenance JSONB NOT NULL,
);
CREATE INDEX idx_ledger_run ON ledger(run_id);
CREATE INDEX idx_ledger_type ON ledger(type);
CREATE INDEX idx_ledger_timestamp ON ledger(timestamp);
```

#### Table: phase_metrics
```sql
CREATE TABLE IF NOT EXISTS phase_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_phase_metrics_run ON phase_metrics(run_id);
CREATE INDEX idx_phase_metrics_phase ON phase_metrics(phase);
CREATE INDEX idx_phase_metrics_created ON phase_metrics(created_at);
```

#### Table: artifacts (enhanced)
```sql
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS provenance JSONB;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_artifacts_provenance_source ON artifacts ((provenance->>'source'));
```

#### Table: waivers
```sql
CREATE TABLE IF NOT EXISTS waivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  violation_type VARCHAR(100) NOT NULL,
  owner VARCHAR(100) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  compensating_control TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_waivers_run ON waivers(run_id);
CREATE INDEX idx_waivers_phase ON waivers(phase);
CREATE INDEX idx_waivers_expires ON waivers(expires_at);
```

#### Table: release_dossiers
```sql
CREATE TABLE IF NOT EXISTS release_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE UNIQUE,
  version VARCHAR(20) NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_dossiers_run ON release_dossiers(run_id);
```

### 3.3 Migration Files

1. `migrations/008_foundation_tables.sql` - phases, tasks, events, assumptions
2. `migrations/009_execution_tables.sql` - checkpoints, timers, evidence_packs
3. `migrations/010_complete_schema.sql` - Complete schema (all 13 tables)

---

## 4. API ENDPOINTS

**Note:** The specification focuses on internal TypeScript APIs rather than REST endpoints. The system is designed as a library/service with programmatic interfaces.

### 4.1 Orchestrator API

#### EnhancedOrchestrator
```typescript
class EnhancedOrchestrator {
  // Execute a complete run
  async execute(idea: any): Promise<RunResult>;

  // Execute a single phase
  async executePhase(phase: PhaseConfig, runContext: any): Promise<PhaseResult>;

  // Evaluate gate
  async evaluateGate(phaseId: string, evidence: EvidencePack): Promise<GateResult>;

  // Auto-fix gate failures
  async autoFix(pc: PhaseCoordinator, issues: string[], runContext: any): Promise<void>;
}
```

#### RunPlanner
```typescript
class RunPlanner {
  // Create execution plan
  async createRunPlan(idea: any): Promise<RunPlan>;

  // Derive phase plan
  async derivePhasePlan(phase: string, context: PhaseContext): Promise<PhasePlan>;
}
```

#### DAGExecutor
```typescript
class DAGExecutor {
  // Execute phases in topological order
  async execute(
    phases: PhaseConfig[],
    executor: (phase: PhaseConfig) => Promise<any>
  ): Promise<void>;

  // Build dependency graph
  private buildGraph(phases: PhaseConfig[]): Map<string, PhaseConfig>;

  // Topological sort
  private topologicalSort(phases: PhaseConfig[]): string[][];
}
```

### 4.2 Phase Coordinator API

#### EnhancedPhaseCoordinator
```typescript
class EnhancedPhaseCoordinator {
  // Execute phase
  async execute(ctx: PhaseContext): Promise<PhaseResult>;

  // Plan stage
  async derivePhasePlan(phase: string, ctx: PhaseContext): Promise<PhasePlan>;

  // Dispatch stage
  async dispatchTasks(plan: PhasePlan): Promise<TaskResult[]>;

  // Guard stage
  async runGuards(draft: any, rubrics: any): Promise<GuardReport[]>;

  // Heal stage
  async healDraft(draft: any, guardReports: GuardReport[]): Promise<any>;

  // Clarify stage (Q/A/V)
  async runQAVLoop(draft: any, ctx: PhaseContext, options?: any): Promise<QAVResult>;

  // Handoff stage
  async evaluateGate(evidence: EvidencePack): Promise<GateResult>;
}
```

### 4.3 Q/A/V Triad API

```typescript
class QuestionAgent {
  async extractClaims(draft: any): Promise<Claim[]>;
  async generateQuestions(claims: Claim[]): Promise<Question[]>;
}

class AnswerAgent {
  async answerQuestions(questions: Question[], context: any): Promise<Answer[]>;
}

class QuestionValidator {
  async validate(question: Question, answer: Answer, context: any): Promise<Validation>;
}
```

### 4.4 Execution Layer API

#### Queue
```typescript
class Queue {
  async enqueue(task: TaskSpec): Promise<void>;
  async dequeue(workerId: string): Promise<TaskSpec | null>;
  async ack(taskId: string): Promise<void>;
  async nack(taskId: string, reason: string): Promise<void>;
}
```

#### CheckpointManager
```typescript
class CheckpointManager {
  async save(taskId: string, token: string, data: any): Promise<void>;
  async load(taskId: string): Promise<Checkpoint | null>;
  async delete(taskId: string): Promise<void>;
}
```

#### WorkerPool
```typescript
class WorkerPool {
  async spawn(count: number): Promise<void>;
  async assignTask(workerId: string, task: TaskSpec): Promise<void>;
  async shutdown(): Promise<void>;
  getHealthStatus(): WorkerHealth[];
}
```

#### Scheduler
```typescript
class Scheduler {
  async schedule(task: TaskSpec): Promise<void>;
  async cancel(taskId: string): Promise<void>;
  getQueueDepth(): number;
}
```

#### TimerService
```typescript
class TimerService {
  async schedule(taskId: string, fireAt: Date, action: 'retry' | 'timeout', payload: any): Promise<void>;
  async cancel(taskId: string): Promise<void>;
  async poll(): Promise<Timer[]>;
}
```

### 4.5 Observability API

#### RunLedger
```typescript
class RunLedger {
  async appendTaskExecution(runId: string, task: TaskSpec, result: any, cost: any): Promise<void>;
  async appendGateEvaluation(runId: string, phase: string, gateResult: any): Promise<void>;
  async appendDecision(runId: string, phase: string, decision: any): Promise<void>;
  async appendArtifact(runId: string, artifact: any, provenance: any): Promise<void>;
  async appendCost(runId: string, phase: string, cost: any): Promise<void>;
  async appendSignature(runId: string, artifactId: string, signature: any): Promise<void>;
  async query(runId: string, options?: QueryOptions): Promise<LedgerEntry[]>;
}
```

#### MetricsCollector
```typescript
class MetricsCollector {
  startPhase(runId: string, phase: string): void;
  recordAgentResult(runId: string, phase: string, success: boolean): void;
  recordResourceUsage(runId: string, phase: string, usage: any): void;
  recordGateResult(runId: string, phase: string, result: any): void;
  completePhase(runId: string, phase: string): PhaseMetrics;
  async getAggregateMetrics(runId: string): Promise<AggregateMetrics>;
  async getP95Latency(phase: string, timeWindowHours: number): Promise<number>;
}
```

#### OTELTracer
```typescript
class OTELTracer {
  startRunSpan(runId: string): Span;
  startPhaseSpan(runId: string, phase: string, parentSpan: Span): Span;
  startTaskSpan(runId: string, phase: string, taskId: string, type: string, target: string, parentSpan: Span): Span;
  startToolSpan(toolId: string, version: string, parentSpan: Span): Span;
  recordSpanEvent(span: Span, event: string, attributes?: any): void;
  endSpan(span: Span, success: boolean, error?: Error): void;
}
```

### 4.6 Resilience API

#### Supervisor
```typescript
class Supervisor {
  async detectStalls(): Promise<StalledTask[]>;
  async unstick(task: TaskSpec, strategy: string): Promise<void>;
  selectStrategy(task: TaskSpec, stallContext: any): UnstickStrategy;
}
```

#### RetryPolicy
```typescript
class RetryPolicyEngine {
  async shouldRetry(task: TaskSpec, error: Error): Promise<boolean>;
  getBackoffDelay(attempt: number): number;
  async executeWithRetry<T>(fn: () => Promise<T>, policy: RetryPolicy): Promise<T>;
}
```

### 4.7 Production Hardening API

#### FanOutRunner
```typescript
class FanOutRunner {
  async fanOut(
    config: FanOutConfig,
    input: any,
    executor: (agent: string, input: any) => Promise<any>
  ): Promise<any[]>;

  async fanIn(
    results: any[],
    strategy: 'merge' | 'concat' | 'vote' | 'custom',
    schema?: any
  ): Promise<any>;
}
```

#### ReleaseDossierCompiler
```typescript
class ReleaseDossierCompiler {
  async compile(runId: string): Promise<ReleaseDossier>;
  async exportDossier(dossier: ReleaseDossier, format: 'json' | 'pdf' | 'html'): Promise<Buffer>;
}
```

---

## 5. INFRASTRUCTURE REQUIREMENTS

### 5.1 Runtime Dependencies

#### Node.js
- **Version:** 18.x or higher
- **Reason:** ES modules, async/await, crypto APIs

#### TypeScript
- **Version:** 5.x
- **Configuration:** Strict mode enabled

### 5.2 Database

#### PostgreSQL
- **Version:** 14.x or higher
- **Required Features:**
  - JSONB support
  - UUID generation (gen_random_uuid())
  - Recursive CTEs (for artifact lineage)
  - Partial indexes
  - CHECK constraints

#### Database Size Estimates
- **Small runs (< 10 phases):** ~100 MB
- **Medium runs (10-20 phases):** ~500 MB
- **Large runs (> 20 phases):** ~2 GB
- **Ledger growth:** ~10 MB per phase

### 5.3 Message Queue

#### Redis
- **Version:** 6.x or higher (Redis Streams support)
- **Features Required:**
  - Streams (XADD, XREADGROUP)
  - Consumer groups
  - Persistence (AOF or RDB)

#### Redis Configuration
```
maxmemory-policy: allkeys-lru
appendonly: yes
appendfsync: everysec
```

### 5.4 Container Runtime

#### Docker
- **Version:** 20.x or higher
- **Purpose:** Worker sandboxes for agents/tools
- **Resource Limits:**
  - Memory: 2 GB per worker (configurable)
  - CPU: 1 core per worker (configurable)
  - Network: Isolated networks per worker

#### Docker Compose (optional)
- Orchestrate PostgreSQL, Redis, workers

### 5.5 Observability Stack

#### OpenTelemetry
- **Collector:** 0.80.x or higher
- **Exporters:** Jaeger, Prometheus (optional)

#### Jaeger (Distributed Tracing)
- **Version:** 1.35 or higher
- **Components:** All-in-one or separate collector/query/UI

#### Prometheus (Optional Metrics)
- **Version:** 2.40 or higher
- **Exporters:** Node exporter, custom metrics

### 5.6 External Services

#### Knowledge Refinery (External System)
- **API:** REST or gRPC
- **Operations:** fission, fusion
- **Events:** kmap.delta.created, kmap.fusion.complete
- **Location:** Separate service (assumed to exist)

#### Tool Registry
- **Purpose:** Agent/tool discovery and versioning
- **API:** Registry lookup for tool IDs
- **Fallback:** Cached tools on registry outage

### 5.7 Development Tools

#### Package Manager
- **npm** or **pnpm** (monorepo support)

#### Linting
- **ESLint:** TypeScript rules
- **Prettier:** Code formatting

#### Testing
- **Jest:** Unit and integration tests
- **Supertest:** API testing
- **Docker Compose:** Integration test environments

### 5.8 CI/CD Requirements

#### Build Pipeline
- Compile TypeScript
- Run linters
- Run unit tests
- Build Docker images

#### Test Pipeline
- Integration tests
- Acceptance tests (10 criteria)
- Soak tests (24-48 hours)
- Chaos tests (failure injection)

#### Deployment
- Kubernetes (recommended) or Docker Swarm
- Horizontal scaling of workers
- Auto-restart policies
- Health checks

### 5.9 Network Requirements

#### Egress Policies
- Agent/tool-specific network rules
- Allowlisted domains per phase
- Blocked domains (security)

#### Ingress
- Orchestrator API (internal only recommended)
- Dashboard UI (optional, if implemented)

### 5.10 Storage Requirements

#### Persistent Volumes
- PostgreSQL data: 50-100 GB (grows with runs)
- Redis AOF/RDB: 5-10 GB
- Artifact storage: S3-compatible (or filesystem)

#### Artifact Storage (Optional Enhancement)
- S3 or MinIO for large artifacts
- References in DB, content in object storage

---

## 6. TESTING REQUIREMENTS

### 6.1 Unit Tests

**Scope:** Individual components in isolation

**Target Coverage:** 80% minimum

**Components to Test:**
- RunPlanner
- DAGExecutor
- EnhancedPhaseCoordinator
- Q/A/V Triad agents
- Queue
- CheckpointManager
- WorkerPool
- Scheduler
- TimerService
- BudgetTracker
- RunLedger
- MetricsCollector
- OTELTracer
- Supervisor/Unsticker
- RetryPolicyEngine
- FanOutRunner
- ReleaseDossierCompiler

**Test Framework:** Jest

**Location:** `packages/*/src/__tests__/unit/`

### 6.2 Integration Tests

**Scope:** Component interactions

**Test Cases:**
1. **Queue + Worker**: Enqueue task → Worker dequeues → Executes → Acks
2. **Checkpoint + Worker**: Worker saves checkpoint → Crashes → New worker resumes
3. **Timer + Scheduler**: Schedule timer → Fires → Triggers retry
4. **Orchestrator + Phase Coordinator**: Execute phase → Events emitted → Gate evaluated
5. **Q/A/V + Knowledge Refinery**: Q/A/V loop → Fission/Fusion → kmap.delta event
6. **Budget Tracker + Orchestrator**: Execute phase → Budget exceeded → Blocked
7. **Supervisor + Worker**: Worker stalls → Supervisor detects → Unsticker triggered
8. **Ledger + Orchestrator**: Run executes → Ledger entries created → Queryable
9. **Metrics + Orchestrator**: Phase completes → Metrics recorded → Aggregates calculated
10. **Fan-Out/Fan-In + Phase Coordinator**: Agents fan out → Results aggregated → Deterministic

**Test Framework:** Jest + Docker Compose (for dependencies)

**Location:** `packages/*/src/__tests__/integration/`

### 6.3 Acceptance Tests (10 Criteria)

**Source:** phase.txt:299-351

**Location:** `packages/orchestrator-core/src/__tests__/acceptance/acceptance-tests.ts`

#### Test 1: Event Sequence
- **Goal:** PhaseCoordinator emits expected events in order
- **Expected Events:** `phase.started` → `phase.progress` → `phase.ready` → `phase.gate.passed`
- **Validation:** Event order and payload structure

#### Test 2: Checkpoint Resume
- **Goal:** Worker restarts and resumes from checkpoint
- **Steps:**
  1. Start long-running task
  2. Worker saves checkpoint
  3. Kill worker
  4. New worker loads checkpoint and resumes
- **Validation:** Task completes successfully, resumed from checkpoint token

#### Test 3: Unsticker Handles Stalls
- **Goal:** Supervisor detects stall and changes strategy
- **Steps:**
  1. Worker stops sending heartbeats (3 intervals)
  2. Supervisor emits `phase.stalled` event
  3. Unsticker applies strategy (e.g., smaller-batch)
- **Validation:** `task.retry` event with strategy

#### Test 4: Failing Guard Blocks Gate
- **Goal:** Gate evaluation fails when rubrics violated
- **Steps:**
  1. Create draft with contradictions (violates contradictions_max: 0)
  2. Run guards
  3. Evaluate gate
- **Validation:** Gate fails, reasons include "contradictions_max exceeded"

#### Test 5: Q/A/V Produces Bindings
- **Goal:** Q/A/V loop produces accepted bindings and kmap delta
- **Steps:**
  1. Run Q/A/V loop on draft
  2. Validate answers
- **Validation:**
  - Accepted validations > 0
  - `kmap.delta.created` event emitted with frame IDs

#### Test 6: Config Changes Agents
- **Goal:** Swapping YAML config changes agents without code edits
- **Steps:**
  1. Load intake.yaml → Verify agents
  2. Load prd.yaml → Verify different agents
- **Validation:** Agent lists match YAML configs

#### Test 7: Dashboards Update Live
- **Goal:** Running phase updates dashboards in real-time
- **Status:** Requires dashboard implementation
- **Validation:** Dashboard reflects current phase status

#### Test 8: CI Produces Artifacts
- **Goal:** demo:intake produces IdeaSpec + EvidencePack
- **Steps:**
  1. Run intake phase with demo input
- **Validation:**
  - Artifacts include IdeaSpec
  - Evidence pack exists with artifacts

#### Test 9: End-to-End Autonomy
- **Goal:** Intake → Ideation completes without human input
- **Steps:**
  1. Execute orchestrator with simple idea
  2. Monitor for user prompts
- **Validation:**
  - Both phases complete
  - User prompts count = 0

#### Test 10: Parallel Phases Execute
- **Goal:** DAG executor runs independent phases in parallel
- **Steps:**
  1. Configure Security + Story Loop as parallel
  2. Execute orchestrator
  3. Monitor execution timing
- **Validation:** Both phases start at same time (within tolerance)

### 6.4 Soak Tests

**Goal:** Validate long-running stability

**Duration:** 24-48 hours

**Test Cases:**
1. **24-Hour Run with Induced Stalls**
   - Run continuously for 24 hours
   - Inject stalls every 2 hours
   - Verify checkpoints and resume work
   - Monitor memory leaks

2. **48-Hour Run with Variable Load**
   - Increase/decrease worker count dynamically
   - Verify worker pool adapts
   - Monitor resource usage trends

**Validation:**
- No crashes
- No memory leaks
- All tasks complete
- Checkpoints functional

**Test Framework:** Custom scripts + monitoring

**Location:** `tests/soak/`

### 6.5 Chaos Tests

**Goal:** Validate resilience under failure conditions

**Test Cases:**

#### Chaos Test 1: Random Container Kills
- **Scenario:** Kill random workers during execution
- **Frequency:** Every 5-10 minutes
- **Validation:**
  - Work continues
  - Tasks reassigned to healthy workers
  - Run completes successfully

#### Chaos Test 2: Network Cuts
- **Scenario:** Simulate network failures
- **Duration:** 30-60 seconds
- **Validation:**
  - Retries triggered
  - Recovery after network restored
  - No data loss

#### Chaos Test 3: Tool Registry Outages
- **Scenario:** Tool registry becomes unavailable
- **Duration:** 5 minutes
- **Validation:**
  - Fallback to cached tools
  - Runs continue
  - Registry reconnects when available

#### Chaos Test 4: Database Failover
- **Scenario:** Primary database fails over to replica
- **Validation:**
  - Connections re-established
  - No transactions lost
  - Runs resume

#### Chaos Test 5: Redis Restart
- **Scenario:** Redis restarts mid-run
- **Validation:**
  - Queues recover from persistence (AOF/RDB)
  - Tasks not lost
  - Workers reconnect

**Test Framework:** Chaos Mesh, Toxiproxy, or custom scripts

**Location:** `tests/chaos/`

### 6.6 Performance Tests

**Goal:** Validate scalability and latency

**Test Cases:**
1. **Throughput Test**
   - Run 100 phases concurrently
   - Measure tasks/second
   - Target: > 10 tasks/sec per worker

2. **Latency Test**
   - Measure P50, P95, P99 latencies per phase
   - Target P95: < 30 seconds for simple phases

3. **Scalability Test**
   - Scale from 1 → 10 → 100 workers
   - Measure throughput scaling
   - Target: Linear scaling up to 50 workers

**Test Framework:** Apache JMeter, k6, or custom

**Location:** `tests/performance/`

### 6.7 Test Data

**Demo Inputs:**
- Simple idea: "Build a todo app"
- Complex idea: "AI-powered healthcare diagnostic platform"
- Invalid idea: Missing required fields

**Mock Services:**
- Mock Knowledge Refinery (returns fake frames)
- Mock Tool Registry (returns tool metadata)
- Mock agent responses

**Location:** `tests/fixtures/`

### 6.8 Continuous Testing

**CI Pipeline:**
1. **On PR:**
   - Unit tests
   - Integration tests
   - Linting

2. **On Merge to Main:**
   - All above
   - Acceptance tests
   - Build Docker images

3. **Nightly:**
   - Soak tests (subset, 4-hour runs)
   - Chaos tests (subset)
   - Performance tests

4. **Weekly:**
   - Full soak tests (24-48 hours)
   - Full chaos suite

**Test Reporting:**
- Coverage reports (Codecov or similar)
- Test result dashboard
- Performance trend charts

---

## 7. FILE STRUCTURE SUMMARY

### 7.1 Complete File Tree

```
ideamine/
├── config/                              # Phase YAML configs (13 files)
│   ├── intake.yaml                      [CREATE]
│   ├── ideation.yaml                    [CREATE]
│   ├── critique.yaml                    [CREATE]
│   ├── prd.yaml                         [CREATE]
│   ├── bizdev.yaml                      [CREATE]
│   ├── architecture.yaml                [CREATE]
│   ├── build.yaml                       [CREATE]
│   ├── security.yaml                    [CREATE]
│   ├── story-loop.yaml                  [CREATE]
│   ├── qa.yaml                          [CREATE]
│   ├── aesthetic.yaml                   [CREATE]
│   ├── release.yaml                     [CREATE]
│   └── beta.yaml                        [CREATE]
│
├── packages/
│   ├── schemas/                         # JSON Schema definitions
│   │   └── src/
│   │       ├── phase/
│   │       │   ├── phase-context.ts     [CREATE]
│   │       │   ├── task-spec.ts         [CREATE]
│   │       │   ├── evidence-pack.ts     [CREATE]
│   │       │   └── index.ts             [CREATE]
│   │       └── orchestrator/
│   │           └── run-plan.ts          [CREATE]
│   │
│   ├── event-schemas/                   # Event definitions
│   │   └── src/
│   │       └── phase-events.ts          [CREATE]
│   │
│   ├── agents/                          # Agent implementations
│   │   └── src/
│   │       ├── qav/                     # Q/A/V Triad (4 files)
│   │       │   ├── question-agent.ts    [CREATE]
│   │       │   ├── answer-agent.ts      [CREATE]
│   │       │   ├── question-validator.ts [CREATE]
│   │       │   └── index.ts             [CREATE]
│   │       ├── config/
│   │       │   └── loader.ts            [MODIFY - enhance]
│   │       └── [existing agent folders]
│   │
│   └── orchestrator-core/               # Core orchestration logic
│       └── src/
│           ├── planning/                # Run planning
│           │   └── run-planner.ts       [CREATE]
│           │
│           ├── queue/                   # Job queue
│           │   └── queue.ts             [CREATE]
│           │
│           ├── checkpoint/              # Checkpoint system (2 files)
│           │   ├── checkpoint-manager.ts [CREATE]
│           │   └── checkpoint-repository.ts [CREATE]
│           │
│           ├── worker/                  # Worker pool (2 files)
│           │   ├── worker.ts            [CREATE]
│           │   └── worker-pool.ts       [CREATE]
│           │
│           ├── scheduler/               # Task scheduler
│           │   └── scheduler.ts         [CREATE]
│           │
│           ├── timer/                   # Timer service
│           │   └── timer-service.ts     [CREATE]
│           │
│           ├── budget/                  # Budget tracking
│           │   └── budget-tracker.ts    [CREATE]
│           │
│           ├── runners/                 # Execution runners (2 files)
│           │   ├── fanout.ts            [CREATE]
│           │   └── heartbeat.ts         [CREATE]
│           │
│           ├── heal/                    # Unsticker routines (4 files)
│           │   ├── heartbeatGuard.ts    [CREATE]
│           │   ├── slopeMonitor.ts      [CREATE]
│           │   ├── fallbackLadder.ts    [CREATE]
│           │   └── chunker.ts           [CREATE]
│           │
│           ├── utils/                   # Utilities (2 files)
│           │   ├── retries.ts           [CREATE]
│           │   └── idempotence.ts       [CREATE]
│           │
│           ├── ledger/                  # Run ledger
│           │   └── run-ledger.ts        [CREATE]
│           │
│           ├── metrics/                 # Metrics collection
│           │   └── metrics-collector.ts [CREATE]
│           │
│           ├── tracing/                 # OpenTelemetry
│           │   └── otel.ts              [CREATE]
│           │
│           ├── dag/                     # DAG execution
│           │   └── dag-executor.ts      [CREATE]
│           │
│           ├── dossier/                 # Release dossier
│           │   └── release-dossier.ts   [CREATE]
│           │
│           ├── base/                    # Phase coordinator (3 files)
│           │   ├── phase-coordinator.ts [EXISTING]
│           │   ├── enhanced-phase-coordinator.ts [CREATE]
│           │   └── refinery-adapter.ts  [CREATE]
│           │
│           ├── supervisor/              # Supervisor
│           │   └── supervisor.ts        [MODIFY - enhance]
│           │
│           ├── database/                # Database repositories
│           │   ├── artifact-repository.ts [MODIFY - add provenance]
│           │   └── [other repositories]
│           │
│           ├── enhanced-orchestrator.ts [MODIFY - add features]
│           ├── workflow-state.ts        [EXISTING]
│           │
│           └── __tests__/               # Tests
│               ├── unit/                [Multiple test files]
│               ├── integration/         [Multiple test files]
│               └── acceptance/
│                   └── acceptance-tests.ts [CREATE]
│
├── migrations/                          # Database migrations (3 files)
│   ├── 008_foundation_tables.sql        [CREATE]
│   ├── 009_execution_tables.sql         [CREATE]
│   └── 010_complete_schema.sql          [CREATE]
│
└── tests/                               # Additional tests
    ├── soak/                            # Soak tests
    │   └── 24h-run.ts                   [CREATE]
    ├── chaos/                           # Chaos tests
    │   ├── container-kills.ts           [CREATE]
    │   ├── network-cuts.ts              [CREATE]
    │   └── registry-outage.ts           [CREATE]
    ├── performance/                     # Performance tests
    │   └── throughput.ts                [CREATE]
    └── fixtures/                        # Test data
        ├── demo-ideas.json              [CREATE]
        └── mock-responses.json          [CREATE]
```

### 7.2 Files by Action

#### Files to CREATE (71 total)

**Config (13):**
- All 13 phase YAML files in `config/`

**Schemas (6):**
- `packages/schemas/src/phase/phase-context.ts`
- `packages/schemas/src/phase/task-spec.ts`
- `packages/schemas/src/phase/evidence-pack.ts`
- `packages/schemas/src/phase/index.ts`
- `packages/schemas/src/orchestrator/run-plan.ts`
- `packages/event-schemas/src/phase-events.ts`

**Agents (4):**
- `packages/agents/src/qav/question-agent.ts`
- `packages/agents/src/qav/answer-agent.ts`
- `packages/agents/src/qav/question-validator.ts`
- `packages/agents/src/qav/index.ts`

**Orchestrator Core (28):**
- Planning: `run-planner.ts` (1)
- Queue: `queue.ts` (1)
- Checkpoint: `checkpoint-manager.ts`, `checkpoint-repository.ts` (2)
- Worker: `worker.ts`, `worker-pool.ts` (2)
- Scheduler: `scheduler.ts` (1)
- Timer: `timer-service.ts` (1)
- Budget: `budget-tracker.ts` (1)
- Runners: `fanout.ts`, `heartbeat.ts` (2)
- Heal: `heartbeatGuard.ts`, `slopeMonitor.ts`, `fallbackLadder.ts`, `chunker.ts` (4)
- Utils: `retries.ts`, `idempotence.ts` (2)
- Ledger: `run-ledger.ts` (1)
- Metrics: `metrics-collector.ts` (1)
- Tracing: `otel.ts` (1)
- DAG: `dag-executor.ts` (1)
- Dossier: `release-dossier.ts` (1)
- Base: `enhanced-phase-coordinator.ts`, `refinery-adapter.ts` (2)
- Tests: `acceptance-tests.ts` (1)

**Migrations (3):**
- `migrations/008_foundation_tables.sql`
- `migrations/009_execution_tables.sql`
- `migrations/010_complete_schema.sql`

**Tests (17):**
- Soak tests (1)
- Chaos tests (3)
- Performance tests (1)
- Fixtures (2)
- Unit/integration tests (estimated 10+)

#### Files to MODIFY (75 total - estimated)

**Note:** Specification provides examples but full list depends on existing codebase. Key modifications:

1. `packages/orchestrator-core/src/enhanced-orchestrator.ts` - Add DAG executor, loop-until-pass, OTEL
2. `packages/orchestrator-core/src/supervisor/supervisor.ts` - Add unsticker integration
3. `packages/agents/src/config/loader.ts` - Enhance config loading
4. `packages/orchestrator-core/src/database/artifact-repository.ts` - Add provenance
5. All existing phase coordinators - Integrate Q/A/V, evidence packs, enhanced features
6. All existing agents - Use TaskSpec, emit events
7. Multiple test files - Add coverage

**Categories:**
- Orchestrator core: ~10 files
- Phase coordinators: ~12 files (one per phase)
- Agents: ~20 files (integrate with new schemas)
- Database repositories: ~5 files
- Configuration/setup: ~5 files
- Tests: ~23 files

---

## 8. IMPLEMENTATION ROADMAP

### Week 1-2: Foundation Layer (10 days)

**Deliverables:**
- 13 phase YAML configurations
- JSON Schema definitions (PhaseContext, TaskSpec, EvidencePack, RunPlan)
- 7 structured phase events
- Config loader enhancement
- Budget tracking system
- Database tables: phases, events, assumptions

**Testing:**
- Unit tests for schemas
- Config loader tests
- Budget tracker tests

**Acceptance Criteria:**
- All YAML configs validate against schemas
- Config loader loads all 13 phase configs
- Budget tracker enforces limits
- Events emitted with correct structure

---

### Week 3-4: Autonomy Layer (8 days)

**Deliverables:**
- Q/A/V Triad (3 agents)
- Knowledge Refinery integration
- Autonomous clarification loop
- Enhanced phase coordinator with Q/A/V

**Testing:**
- Q/A/V unit tests
- Integration test: Q/A/V loop produces bindings
- Integration test: kmap.delta events emitted

**Acceptance Criteria:**
- Q/A/V loop completes autonomously
- Grounding score calculated
- Assumptions tracked
- Knowledge Map frames created

---

### Week 5-6: Execution Layer (12 days)

**Deliverables:**
- Job queue (Redis Streams)
- Checkpoint system
- WorkerPool implementation
- Scheduler service
- Timer service
- Database tables: tasks, checkpoints, timers

**Testing:**
- Queue tests (enqueue/dequeue/ack)
- Checkpoint resume test
- Worker pool tests
- Timer accuracy test

**Acceptance Criteria:**
- Tasks queued and executed by workers
- Checkpoints save and resume works
- Timers fire accurately
- Worker pool scales dynamically

**MVP MILESTONE:** System is autonomous, scalable, and resilient

---

### Week 7-8: Resilience Layer (8 days)

**Deliverables:**
- Heartbeat monitoring system
- 4 unsticker routines (HeartbeatGuard, SlopeMonitor, FallbackLadder, Chunker)
- Retry policy engine
- Enhanced supervisor

**Testing:**
- Heartbeat tests (detect stalls)
- Unsticker strategy tests
- Retry policy tests
- Chaos test: Random failures

**Acceptance Criteria:**
- Stalls detected within 3 heartbeats
- Unsticker recovers stalled tasks
- Retries use exponential backoff
- System recovers from worker crashes

---

### Week 9-10: Observability Layer (8 days)

**Deliverables:**
- Run ledger (immutable timeline)
- Metrics collection system
- Provenance tracking
- OpenTelemetry integration
- Evidence pack generalization (all phases)
- Database tables: ledger, phase_metrics

**Testing:**
- Ledger query tests
- Metrics aggregation tests
- Provenance lineage tests
- OTEL trace validation

**Acceptance Criteria:**
- All run events logged in ledger
- Metrics collected per phase
- Artifact lineage queryable
- Traces exported to Jaeger

---

### Week 11: Production Hardening (9 days)

**Deliverables:**
- DAG execution engine
- Fan-out/fan-in pattern
- Loop-until-pass gate pattern
- Release dossier compilation
- Database tables: waivers, release_dossiers
- Complete test suite (acceptance, soak, chaos)

**Testing:**
- 10 acceptance tests
- Soak test (24-hour run)
- Chaos tests (container kills, network cuts)
- Performance tests

**Acceptance Criteria:**
- All 10 acceptance tests pass
- DAG executor runs phases in parallel
- Loop-until-pass gate works (max 5 retries)
- Release dossier compiles successfully
- Soak test completes without crashes
- Chaos tests demonstrate resilience

**FULL SPEC COMPLIANCE:** 100% orchestrator.txt + phase.txt requirements met

---

## 9. DEPENDENCIES AND PREREQUISITES

### 9.1 External Dependencies

**NPM Packages (estimated):**
- `@opentelemetry/sdk-trace-node`
- `@opentelemetry/resources`
- `@opentelemetry/semantic-conventions`
- `@opentelemetry/api`
- `@opentelemetry/sdk-trace-base`
- `@opentelemetry/exporter-jaeger`
- `ajv` (JSON Schema validation)
- `ioredis` (Redis client)
- `pg` (PostgreSQL client)
- `uuid` (UUID generation)
- `dockerode` (Docker API client for sandboxes)

**Dev Dependencies:**
- `jest`
- `@types/jest`
- `@types/node`
- `typescript`
- `eslint`
- `prettier`
- `supertest` (API testing)

### 9.2 Prerequisites

**Before Starting:**
1. PostgreSQL database running (14.x+)
2. Redis instance running (6.x+)
3. Docker daemon running (for worker sandboxes)
4. Knowledge Refinery service available (or mocked)
5. Tool registry available (or mocked)

**Environment Variables:**
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/ideamine
REDIS_URL=redis://localhost:6379
JAEGER_ENDPOINT=http://localhost:14268/api/traces
KNOWLEDGE_REFINERY_URL=http://localhost:8080
TOOL_REGISTRY_URL=http://localhost:8081
```

---

## 10. RISK AREAS AND UNKNOWNS

### 10.1 High-Risk Areas

1. **Knowledge Refinery Integration**
   - **Risk:** External dependency availability
   - **Mitigation:** Mock for testing, graceful degradation

2. **Worker Sandboxing**
   - **Risk:** Docker overhead, resource limits
   - **Mitigation:** Benchmark, optimize container startup

3. **Checkpoint Resume Complexity**
   - **Risk:** State reconstruction after crash
   - **Mitigation:** Extensive testing, clear checkpoint contracts

4. **DAG Execution Correctness**
   - **Risk:** Topological sort bugs, deadlocks
   - **Mitigation:** Unit tests, visualize DAG, acceptance tests

5. **Q/A/V Loop Convergence**
   - **Risk:** Loop doesn't terminate, infinite questions
   - **Mitigation:** Max iteration limits, early stopping conditions

### 10.2 Unknowns

1. **Knowledge Refinery API Contract**
   - Need exact API specification for fission/fusion
   - Need event format for kmap.delta

2. **Tool Registry Protocol**
   - Need tool discovery API
   - Need versioning scheme

3. **Existing Codebase Structure**
   - Assumption: Some orchestrator and phase coordinators exist
   - Need assessment of current implementation

4. **Agent Implementations**
   - Assumption: Some agents exist, need enhancement
   - Need catalog of existing agents

5. **Performance Baselines**
   - Unknown: Current system performance
   - Need benchmarks to compare improvements

---

## 11. SUCCESS CRITERIA

### 11.1 MVP (Week 6) Success Criteria

✅ **Functional Requirements:**
- [ ] Orchestrator executes Intake → Ideation autonomously
- [ ] Q/A/V Triad clarifies unsupported claims without human input
- [ ] Checkpoints save and resume work after worker crashes
- [ ] Budget tracking blocks phases that exceed limits
- [ ] Gates evaluate evidence packs and pass/fail phases
- [ ] Events emitted for all phase lifecycle stages

✅ **Non-Functional Requirements:**
- [ ] System scales to 10 parallel workers
- [ ] Average phase latency < 1 minute (simple phases)
- [ ] Worker crashes recover within 30 seconds
- [ ] No memory leaks in 4-hour soak test

### 11.2 Full Spec (Week 11) Success Criteria

✅ **All 10 Acceptance Tests Pass:**
1. Event sequence correct
2. Checkpoint resume works
3. Unsticker handles stalls
4. Failing guards block gates
5. Q/A/V produces bindings + kmap events
6. Config changes agents without code
7. Dashboards update live
8. demo:intake produces artifacts
9. End-to-end autonomy (no human input)
10. Parallel phases execute correctly

✅ **Resilience:**
- [ ] Soak test (24 hours) completes without crashes
- [ ] Chaos tests pass (container kills, network cuts, registry outages)
- [ ] System recovers from all tested failure scenarios

✅ **Observability:**
- [ ] All run events in ledger (immutable, queryable)
- [ ] Metrics collected for all phases
- [ ] Traces exported to Jaeger
- [ ] Artifact provenance queryable

✅ **Production Readiness:**
- [ ] DAG executor runs phases in topological order with parallelism
- [ ] Loop-until-pass gate retries up to 5 times
- [ ] Release dossier compiles with all required artifacts
- [ ] 80%+ test coverage
- [ ] Documentation complete

---

## 12. ADDITIONAL NOTES

### 12.1 Phase-Specific Configuration Highlights

**Intake Phase:**
- Parallelism: sequential
- Agents: 3 (Classifier, Expander, Validator)
- Rubrics: ambiguity_max: 0.10, blockers_max: 0, feasibility_required: true

**Ideation Phase:**
- Parallelism: 4 (all agents in parallel)
- Agents: 4 (Strategy, Competitive, TechStack, Persona)
- Budget: 2M tokens, 180 minutes
- Rubrics: usecase_coverage_min: 0.85, personas_count: [3, 5]

**Security Phase:**
- Parallelism: parallel (all 9 agents)
- Agents: 9 (secrets, SCA, SAST, IaC, container, privacy, threat model, DAST, supply chain)
- Budget: 1.5M tokens, 600 minutes (10 hours)
- Rubrics: HARD blockers (critical_cves_max: 0, secrets_max: 0, critical_sast_max: 0)

**Story Loop Phase:**
- Parallelism: iterative (loop pattern)
- Agents: Multiple (story generation, refinement, acceptance)
- Special: Continues until "done" signal

### 12.2 Key Patterns

**Plan → Dispatch → Guard → Heal → Clarify → Handoff:**
- Standard phase coordinator pattern
- All 12 phases follow this structure

**Fan-Out → Aggregate → Q/A/V → Guards → Gate:**
- Execution pattern within each phase
- Deterministic aggregation ensures reproducibility

**Checkpoint → Resume:**
- Critical for long-running tasks
- Token-based resumption

**Heartbeat → Stall Detection → Unsticker:**
- Resilience pattern
- Automatic recovery without human intervention

**Ledger Append → Query:**
- Observability pattern
- Immutable audit trail

### 12.3 Schema Versioning

All schemas have `$id` fields with version:
- `schema.phase.context.v1`
- `schema.phase.taskspec.v1`
- `schema.phase.evidencepack.v1`

**Versioning Strategy:**
- Breaking changes → increment version (v1 → v2)
- Backward-compatible changes → minor version (v1.1)
- Maintain compatibility via schema registry

### 12.4 Event-Driven Architecture

**7 Phase Events:**
1. phase.started
2. phase.progress
3. phase.agent.complete
4. phase.ready
5. phase.gate.passed
6. phase.gate.failed
7. phase.complete

**Integration Events:**
- kmap.delta.created (Knowledge Refinery)
- kmap.fusion.complete (Knowledge Refinery)
- task.retry (Supervisor)
- phase.stalled (Supervisor)

**Event Bus Topics:**
- `phase.*` - Phase lifecycle
- `task.*` - Task lifecycle
- `gate.*` - Gate evaluation
- `kmap.*` - Knowledge Map changes
- `budget.*` - Budget alerts

---

## SUMMARY STATISTICS

**Files:**
- Create: 71 files
- Modify: 75 files (estimated)
- Total: 146 files

**Database:**
- New tables: 11
- Enhanced tables: 2
- Total: 13 tables
- Migrations: 3 files

**Code Volume (estimated):**
- TypeScript: ~15,000 lines
- SQL: ~500 lines
- YAML: ~1,500 lines
- Tests: ~10,000 lines
- **Total: ~27,000 lines of code**

**Effort:**
- Foundation: 10 days
- Autonomy: 8 days
- Execution: 12 days
- Resilience: 8 days
- Observability: 8 days
- Hardening: 9 days
- **Total: 55 days (11 weeks)**

**Team Size Assumption:** 1-2 senior engineers working full-time

---

**END OF REQUIREMENTS SUMMARY**
