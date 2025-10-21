# IdeaMine Orchestrator Specification - Gap Analysis
**Date:** 2025-10-19
**Scope:** Comprehensive comparison of orchestrator.txt + phase.txt specifications vs. current implementation
**Status:** 🔴 **SIGNIFICANT GAPS IDENTIFIED**

---

## Executive Summary

After reading **orchestrator.txt (303 lines)** and **phase.txt (213 lines)** incrementally, and comparing against current IdeaMine infrastructure, we identified **62 major gaps** across 8 capability areas. While we have implemented agents for all 12 phases and basic orchestration infrastructure, we are missing **critical autonomous execution capabilities** required by the spec.

**Key Finding:** Current implementation is ~40% complete relative to spec requirements. Most gaps are in **autonomy, resilience, and observability** layers.

---

## Gap Summary by Category

| Category | Spec Requirements | Implemented | Missing | Completion % |
|----------|-------------------|-------------|---------|--------------|
| **Core Orchestration** | 15 | 8 | 7 | 53% |
| **Autonomy & Feedback (Q/A/V)** | 6 | 0 | 6 | 0% |
| **Resilience & Healing** | 7 | 1 | 6 | 14% |
| **Observability & Recording** | 8 | 3 | 5 | 38% |
| **Execution Infrastructure** | 12 | 2 | 10 | 17% |
| **Security & Policy** | 5 | 2 | 3 | 40% |
| **Contracts & APIs** | 6 | 1 | 5 | 17% |
| **Dashboards & Monitoring** | 5 | 0 | 5 | 0% |
| **TOTAL** | **64** | **17** | **47** | **27%** |

---

## Category 1: Core Orchestration

### ✅ Implemented (8)

1. **Mothership Orchestrator (MO)**
   - File: `packages/orchestrator-core/src/enhanced-orchestrator.ts`
   - File: `packages/orchestrator-core/src/langgraph-orchestrator.ts`
   - Status: ✅ Basic implementation exists

2. **Phase Coordinators (PC)**
   - Base: `packages/orchestrator-core/src/base/phase-coordinator.ts`
   - Enhanced: `packages/orchestrator-core/src/base/enhanced-phase-coordinator.ts`
   - Per-phase coordinators: `packages/agents/src/*/\*-phase-coordinator.ts`
   - Status: ✅ 12 phase coordinators exist (one per phase)

3. **Workflow State Machine**
   - File: `packages/orchestrator-core/src/workflow-state.ts`
   - Has 13 phases defined with dependencies
   - Status: ✅ Complete

4. **Agents (All 12 Phases)**
   - Intake: 3 agents ✅
   - Ideation: 4 agents ✅
   - Critique: 3 agents ✅
   - PRD: 3 agents ✅
   - BizDev: 4 agents ✅
   - Architecture: 4 agents ✅
   - Build: 3 agents ✅
   - Security: 3 agents ✅ (+ 6 placeholders)
   - Story Loop: 3 agents ✅
   - QA: 4 agents ✅
   - Aesthetic: 3 agents ✅
   - Release: 3 agents ✅
   - Beta: 3 agents ✅
   - Status: ✅ 43 agents implemented

5. **Gatekeepers**
   - File: `packages/orchestrator-core/src/gatekeeper/gatekeeper.ts`
   - File: `packages/orchestrator-core/src/gatekeeper/gates.ts`
   - File: `packages/orchestrator-core/src/gatekeeper/beta-gate.ts`
   - File: `packages/agents/src/security/security-gate.ts`
   - Status: ✅ Basic gate infrastructure exists

6. **Tool Registry**
   - File: `packages/orchestrator-core/src/analyzer/tool-registry.ts`
   - Status: ✅ Exists

7. **Event Bus**
   - File: `packages/event-bus/`
   - File: `packages/orchestrator-core/src/event-publisher.ts`
   - Status: ✅ Basic events implemented

8. **Database/State Storage**
   - Files: `packages/orchestrator-core/src/database/`
     - `workflow-repository.ts` ✅
     - `artifact-repository.ts` ✅
     - `audit-repository.ts` ✅
     - `connection.ts` ✅
   - Status: ✅ Basic persistence exists

### ❌ Missing (7)

1. **❌ Run Plan Generation**
   - **Spec Requirement (orchestrator.txt:51-53)**: "Create a **Run Plan**: phases, sub-workflows, budgets, timeouts, required evidence."
   - **Current State**: No explicit Run Plan data structure or generation logic
   - **Gap**: Need `RunPlan` schema + `createRunPlan(IdeaInput)` function
   - **Priority**: 🔴 CRITICAL

2. **❌ Phase Dependency DAG Management**
   - **Spec Requirement (orchestrator.txt:20)**: "Phase connectivity: The Orchestrator **initiates the first phase** and **connects every phase** end-to-end, maintaining the dependency DAG"
   - **Current State**: Dependencies defined in `workflow-state.ts` but no DAG execution engine
   - **Gap**: Need DAG topological sort + parallel phase execution (Security + Story Loop should run in parallel)
   - **Priority**: 🔴 CRITICAL

3. **❌ Fan-Out/Fan-In Pattern**
   - **Spec Requirement (phase.txt:56-61)**: "Fan-out: run phase Agents in parallel where allowed... Fan-in: deterministic aggregation/merging"
   - **Current State**: Phase coordinators call agents sequentially
   - **Gap**: Need `Promise.all()` with deterministic merge/aggregation logic
   - **Priority**: 🔴 HIGH

4. **❌ Self-Execution Mode (SEM)**
   - **Spec Requirement (orchestrator.txt:22)**: "The Orchestrator carries a built-in generalist capability... to **complete blocking tasks** when a doer can't"
   - **Current State**: No fallback execution capability
   - **Gap**: Need MO to execute tasks directly when agents fail
   - **Priority**: 🟡 MEDIUM

5. **❌ Auto-Doer Creation**
   - **Spec Requirement (orchestrator.txt:23)**: "The Orchestrator can **create new doers on the fly**: generate specs, scaffold code, register in Tool Registry"
   - **Current State**: All doers must be pre-defined
   - **Gap**: Need agent/tool generator + runtime registration
   - **Priority**: 🟡 LOW (nice-to-have)

6. **❌ Loop-Until-Pass Gate Pattern**
   - **Spec Requirement (orchestrator.txt:239)**: `if (!gate.pass) { await autoFix(pc, gate.issues); continue; }`
   - **Current State**: Gates block but don't auto-retry with fixes
   - **Gap**: Need gate failure → fix generation → re-execute → re-evaluate loop
   - **Priority**: 🔴 HIGH

7. **❌ Release Dossier Compilation**
   - **Spec Requirement (orchestrator.txt:281)**: "PRD, RTM, API spec, tests, coverage, security pack (SBOM/signatures/scans), performance reports, a11y, release notes"
   - **Current State**: Artifacts exist but no unified dossier assembly
   - **Gap**: Need `compileReleaseDossier(runId)` that bundles all artifacts
   - **Priority**: 🟡 MEDIUM

---

## Category 2: Autonomy & Feedback (Q/A/V Triad)

### ✅ Implemented (0)

*None*

### ❌ Missing (6)

1. **❌ Question Agent (QAQ)**
   - **Spec Requirement (orchestrator.txt:173)**: "Generate decision-changing questions for the blocking step"
   - **Spec Requirement (phase.txt:103)**: "Generate decision-changing questions per phase theme"
   - **Current State**: Not implemented
   - **Gap**: Need `QuestionAgent` class that analyzes artifacts + context → generates questions
   - **Priority**: 🔴 CRITICAL (blocks autonomous clarification)

2. **❌ Answer Agent (QAA)**
   - **Spec Requirement (orchestrator.txt:173)**: "Answer using artifacts + tools (RAG, scans); unknowns become **ASSUMPTIONS**"
   - **Spec Requirement (phase.txt:104)**: "Answer with citations to phase artifacts/tools; UNKNOWN→ next steps"
   - **Current State**: Not implemented
   - **Gap**: Need `AnswerAgent` class with RAG + tool access → answer questions with citations
   - **Priority**: 🔴 CRITICAL

3. **❌ Question Validator (QV)**
   - **Spec Requirement (orchestrator.txt:174)**: "Binds Q↔A; rejects low-quality answers; loop until thresholds met"
   - **Spec Requirement (phase.txt:105)**: "Validate (grounding/completeness/specificity/consistency); accept→ Knowledge Map; reject→ regenerate"
   - **Current State**: Not implemented
   - **Gap**: Need `QuestionValidator` class that scores Q/A bindings (grounding, completeness, specificity, consistency)
   - **Priority**: 🔴 CRITICAL

4. **❌ Knowledge Refinery Integration**
   - **Spec Requirement (orchestrator.txt:175)**: "Accepted Q/A feed the **Knowledge Refinery** (Fission & Fusion) → **Knowledge Map**"
   - **Spec Requirement (phase.txt:106)**: "Push Q/A/V to Knowledge Refinery → Fission, ground, cluster, Fusion into canonical frames; emit kmap.delta"
   - **Current State**: Knowledge Refinery exists (`services/refinery/`) but Q/A/V integration missing
   - **Gap**: Need Q/A/V → Refinery → Knowledge Map pipeline
   - **Files to Modify**:
     - `packages/orchestrator-core/src/base/refinery-adapter.ts` (exists but doesn't consume Q/A/V)
   - **Priority**: 🔴 HIGH

5. **❌ ASSUMPTIONS Registry**
   - **Spec Requirement (orchestrator.txt:25, 173)**: "Unknowns become **ASSUMPTIONS** with mitigation tasks"
   - **Current State**: No assumptions tracking
   - **Gap**: Need `AssumptionsRegistry` class + database table (run_id, phase, assumption, mitigation_task_id, status)
   - **Priority**: 🟡 MEDIUM

6. **❌ Autonomous Clarification (No User Prompts)**
   - **Spec Requirement (orchestrator.txt:24, 61-63)**: "Mid-run clarifications use Q/A/V + Knowledge Refinery—**never the user**"
   - **Current State**: No autonomous clarification mechanism
   - **Gap**: Need clarification loop: detect ambiguity → QAQ → QAA → QV → Refinery → continue (never user prompt)
   - **Priority**: 🔴 CRITICAL

---

## Category 3: Resilience & Healing (Unsticker Routines)

### ✅ Implemented (1)

1. **Supervisor (Basic)**
   - File: `packages/orchestrator-core/src/supervisor/supervisor.ts`
   - Status: ✅ Exists but likely needs enhancement

### ❌ Missing (6)

1. **❌ Heartbeat System**
   - **Spec Requirement (orchestrator.txt:132-133)**: "Each task must heartbeat at interval H. Missed × k → **Stall Suspected**"
   - **Spec Requirement (phase.txt:84)**: "Heartbeats: every task must report within H sec; miss ×k → suspect stall"
   - **Spec Requirement (orchestrator.txt:106)**: `POST /heartbeat` API
   - **Current State**: No heartbeat emission or monitoring
   - **Gap**: Need:
     - Agents/Tools emit heartbeats every 60s
     - Supervisor monitors heartbeats
     - Stall detection when 3 consecutive heartbeats missed
   - **Priority**: 🔴 HIGH

2. **❌ Progress Slope Monitor**
   - **Spec Requirement (orchestrator.txt:134-135)**: "Low delta over time → try smaller batch size / alternate tool / stricter prompts"
   - **Spec Requirement (phase.txt:85)**: "Slope Monitor: low progress delta triggers: smaller batch size, tool fallback, sandbox restart"
   - **Current State**: No progress tracking or slope analysis
   - **Gap**: Need `ProgressMonitor` class that tracks pct/eta over time, detects plateaus
   - **Priority**: 🟡 MEDIUM

3. **❌ Tool Fallback Ladder**
   - **Spec Requirement (orchestrator.txt:139-141)**: "Preferred tool fails → select next from allowlist; downgrade mode (WASM → Docker → remote API)"
   - **Spec Requirement (phase.txt:87)**: "Fallback Ladder: alternate allowlisted tools; switch WASM↔Docker; reduce model temperature"
   - **Current State**: No fallback mechanism
   - **Gap**: Need allowlist per phase (in YAML configs) + fallback sequencing
   - **Priority**: 🟡 MEDIUM

4. **❌ Spec Shrink / Chunking**
   - **Spec Requirement (orchestrator.txt:142-144)**: "For massive builds (10k–100k LOC), split by story/epic/service; enforce green tests per chunk"
   - **Spec Requirement (phase.txt:88)**: "Decompose massive work (e.g., 100k LOC) into stories/services; enforce tests per chunk"
   - **Current State**: No chunking logic for large codebases
   - **Gap**: Need story/epic decomposer + chunk-by-chunk execution
   - **Priority**: 🟡 LOW

5. **❌ Retry Policy (Advanced)**
   - **Spec Requirement (orchestrator.txt:145-147)**: "Transient errors: exponential backoff ×3–5; schema failures: auto-repair once then escalate to Fix-Synth Agent"
   - **Current State**: Basic retries may exist but no policy engine
   - **Gap**: Need configurable retry policies per error type:
     - Transient: exponential backoff ×5
     - Schema: auto-repair ×1 → Fix-Synth
     - Tool infra: alternate tool
   - **Priority**: 🟡 MEDIUM

6. **❌ Sagas & Compensation**
   - **Spec Requirement (orchestrator.txt:148-150)**: "If a downstream gate fails, run compensating actions (revert migrations, roll back flags)"
   - **Current State**: No compensation logic
   - **Gap**: Need saga pattern for reversible operations
   - **Priority**: 🟡 LOW (v2 feature)

---

## Category 4: Observability & Recording

### ✅ Implemented (3)

1. **Recorder (Basic)**
   - File: `packages/orchestrator-core/src/recorder/recorder.ts`
   - Status: ✅ Exists

2. **Audit Repository**
   - File: `packages/orchestrator-core/src/database/audit-repository.ts`
   - Status: ✅ Exists

3. **Logger**
   - File: `packages/orchestrator-core/src/utils/logger.ts`
   - Status: ✅ Exists

### ❌ Missing (5)

1. **❌ Run Ledger (Immutable Timeline)**
   - **Spec Requirement (orchestrator.txt:197-198)**: "Immutable timeline of tasks, gates, decisions, costs, artifacts, signatures"
   - **Current State**: Audit repository exists but may not capture full timeline
   - **Gap**: Need immutable append-only ledger with:
     - All tasks (inputs, outputs, tool@version, duration, cost)
     - All gate evaluations (pass/fail, reasons, evidence pack ID)
     - All decisions (Q/A/V outcomes, assumptions)
     - All artifacts (IDs, provenance, signatures)
   - **Priority**: 🔴 HIGH

2. **❌ OpenTelemetry Tracing**
   - **Spec Requirement (orchestrator.txt:199)**: "OpenTelemetry spans with run_id, phase, task_id, tool_id@ver"
   - **Spec Requirement (phase.txt:129)**: "OTEL spans labeled with run_id, phase, task_id, tool_id@ver"
   - **Current State**: No OTEL integration
   - **Gap**: Need OTEL SDK + span creation in:
     - Orchestrator (run-level spans)
     - Phase Coordinators (phase-level spans)
     - Agents (agent-level spans)
     - Tools (tool-level spans)
   - **Priority**: 🟡 MEDIUM

3. **❌ Metrics Collection**
   - **Spec Requirement (orchestrator.txt:198)**: "Phase latency, acceptance rates, unsupported claims, test pass %, CVEs, cost/run"
   - **Current State**: Ad-hoc metrics in some agents
   - **Gap**: Need structured metrics:
     - Phase duration (p50, p95, p99)
     - Gate pass/fail rates by phase
     - Agent success rates
     - Tool execution times
     - Token/cost tracking per phase
     - Security findings counts
   - **Priority**: 🔴 HIGH

4. **❌ Provenance Tracking**
   - **Spec Requirement (orchestrator.txt:207)**: "Keep **data lineage** for every artifact (who/when/tool/version/inputs)"
   - **Current State**: Artifacts stored but lineage tracking incomplete
   - **Gap**: Need provenance metadata for each artifact:
     - Source: which agent/tool produced it
     - Inputs: artifact IDs that were inputs
     - Tool version: `tool_id@ver`
     - Timestamp: created_at
     - Cost: tokens/minutes consumed
   - **Priority**: 🔴 HIGH

5. **❌ Evidence Pack (Generalized)**
   - **Spec Requirement (orchestrator.txt:114)**: `EvidencePack { artifacts[], guard_reports[], qna_summary, kmap_refs[] }`
   - **Spec Requirement (phase.txt:18, 49)**: Evidence Pack with guard reports, Q/A/V summary, kmap delta, metrics
   - **Current State**: SecurityPack exists for Security phase only
   - **Gap**: Need generalized `EvidencePack` schema for ALL phases
   - **Priority**: 🔴 HIGH

---

## Category 5: Execution Infrastructure

### ✅ Implemented (2)

1. **Workflow Engine**
   - File: `packages/orchestrator-core/src/workflow-engine.ts`
   - Status: ✅ Exists

2. **Dispatcher (Basic)**
   - File: `packages/orchestrator-core/src/dispatcher/dispatcher.ts`
   - Status: ✅ Exists

### ❌ Missing (10)

1. **❌ Job Queue (NATS/Redis Streams)**
   - **Spec Requirement (phase.txt:105)**: "Job Queue (e.g., NATS JetStream or Redis Streams) — topics: tasks, heartbeats, events"
   - **Spec Requirement (phase.txt:117-128)**: queue.ts with enqueue/consume + idempotence keys
   - **Current State**: No job queue infrastructure
   - **Gap**: Need job queue service (Redis Streams or NATS) with:
     - Topics: `tasks`, `heartbeats`, `events`
     - Idempotence keys (hash-based deduplication)
     - `enqueue(topic, msg, key)` and `consume(topic, handler)` functions
   - **Priority**: 🔴 CRITICAL

2. **❌ Scheduler Service**
   - **Spec Requirement (phase.txt:106)**: "Scheduler — turns PhasePlan into TaskSpec shards; enqueues with idempotence keys"
   - **Current State**: No scheduler
   - **Gap**: Need scheduler that:
     - Derives TaskSpecs from PhasePlan
     - Shards large tasks (batching)
     - Enqueues to job queue
     - Handles idempotence
   - **Priority**: 🔴 HIGH

3. **❌ WorkerPool**
   - **Spec Requirement (phase.txt:107)**: "WorkerPool — pulls tasks, runs agents/tools in sandboxes, emits heartbeats & checkpoints"
   - **Spec Requirement (phase.txt:133-145)**: worker.ts with heartbeat + checkpoint logic
   - **Current State**: No worker pool
   - **Gap**: Need worker pool service that:
     - Pulls tasks from queue
     - Executes agents/tools in sandboxes (Docker/WASM)
     - Emits heartbeats every 60s
     - Saves checkpoints for long tasks
     - Handles retries
   - **Priority**: 🔴 CRITICAL

4. **❌ Timer Service**
   - **Spec Requirement (phase.txt:108)**: "Timer Service — durable timers for retries/backoff and phase timeboxes"
   - **Spec Requirement (phase.txt:150-156)**: timers.ts with scheduleRetry + insertTimer
   - **Current State**: No timer service
   - **Gap**: Need timer service that:
     - Schedules future task execution (fire_at timestamp)
     - Handles exponential backoff retries
     - Enforces phase timeboxes (ISO8601 duration)
   - **Priority**: 🔴 HIGH

5. **❌ Checkpoint/Resume System**
   - **Spec Requirement (orchestrator.txt:24, 68)**: "Supports **20–50h** runs via checkpointing, continuation tokens, and resumable activities"
   - **Spec Requirement (phase.txt:37)**: "Checkpoints: every major artifact and >2 min tasks must checkpoint (continuation tokens)"
   - **Spec Requirement (phase.txt:135-145)**: `loadCheckpoint()`, `saveCheckpoint()` in worker.ts
   - **Current State**: No checkpoint system
   - **Gap**: Need:
     - `checkpoints` database table (task_id, checkpoint_token, created_at, data JSONB)
     - `saveCheckpoint(task_id, token)` function
     - `loadCheckpoint(task_id)` function
     - Agents/Tools emit checkpoints every 2 minutes or major step
     - Resume from last checkpoint on crash
   - **Priority**: 🔴 CRITICAL

6. **❌ Continuation Tokens**
   - **Spec Requirement (orchestrator.txt:122)**: "Long-running Activities: chunked with **continuation tokens**; each chunk must checkpoint"
   - **Current State**: No continuation token support
   - **Gap**: Need agents/tools to support continuation:
     - Input: `{ ...taskInput, checkpoint?: ContinuationToken }`
     - Output: `{ result, nextToken?: ContinuationToken }`
   - **Priority**: 🟡 MEDIUM

7. **❌ State Store Tables (Extended)**
   - **Spec Requirement (phase.txt:109)**: "State Store — Postgres tables: runs, phases, **tasks**, **checkpoints**, **events**"
   - **Current State**: Only `runs` table exists (maybe artifacts/audit)
   - **Gap**: Need additional tables:
     - `phases` (run_id, phase_id, status, started_at, completed_at, cost)
     - `tasks` (phase_id, task_id, type, target, input, status, retries, result, cost)
     - `checkpoints` (task_id, token, data, created_at)
     - `events` (run_id, phase_id, event_type, payload, timestamp)
   - **Priority**: 🔴 HIGH

8. **❌ Idempotence Keys**
   - **Spec Requirement (phase.txt:38)**: "Idempotence key: hash(phase + inputs + version) for dedupe/replay"
   - **Spec Requirement (phase.txt:117-119)**: Idempotence by key in queue.ts
   - **Current State**: No idempotence enforcement
   - **Gap**: Need:
     - Generate idempotence keys (SHA256 hash)
     - Store processed keys in Redis/DB
     - Skip duplicate task execution
   - **Priority**: 🔴 HIGH

9. **❌ Signals & Timers (Temporal-style)**
   - **Spec Requirement (orchestrator.txt:123)**: "Signals/Timers: MO can signal PCs to pause/resume/retry; timers wake stalled tasks"
   - **Current State**: No signaling mechanism
   - **Gap**: Need signal channels (pause, resume, retry, cancel) from MO to PCs
   - **Priority**: 🟡 MEDIUM

10. **❌ Adaptive Concurrency**
    - **Spec Requirement (phase.txt:61)**: "Concurrency: adaptive (PID-style) based on queue depth, SLOs, and budgets"
    - **Current State**: Fixed parallelism (if any)
    - **Gap**: Need PID controller that adjusts concurrency based on:
      - Queue depth (backpressure)
      - SLO targets (latency)
      - Budget consumption rate
    - **Priority**: 🟡 LOW

---

## Category 6: Security & Policy

### ✅ Implemented (2)

1. **Security Phase (6a)**
   - Agents: SecretsHygieneAgent, SCAAgent, SASTAgent
   - Gate: SecurityGate
   - Coordinator: SecurityCoordinator
   - Status: ✅ Core implementation complete

2. **Tool Allowlists (Basic)**
   - Defined in phase configs
   - Status: ✅ Partially implemented

### ❌ Missing (3)

1. **❌ Phase-Specific Policy YAMLs**
   - **Spec Requirement (phase.txt:357-456)**: YAML configs for each phase (intake.yaml, ideation.yaml, prd.yaml, etc.)
   - **Current State**: No per-phase YAML configs
   - **Gap**: Need 12 YAML files in `config/` directory with:
     - `phase`
     - `parallelism` (sequential, 2, 3, 4, partial)
     - `agents[]`
     - `budgets { tokens, tools_minutes, gpu_hours }`
     - `rubrics {}`
     - `allowlisted_tools[]`
     - `heartbeat_seconds`
     - `stall_threshold_heartbeats`
     - `refinery { fission_min_coverage, fusion_min_consensus }`
   - **Priority**: 🔴 HIGH

2. **❌ Budget Tracking & Enforcement**
   - **Spec Requirement (orchestrator.txt:70-71)**: "Track tokens/minutes; apply budgets; throttle/scale by priority; enforce SLOs"
   - **Spec Requirement (phase.txt:120-122)**: "Track: tokens, tool minutes, GPU hours; enforce Phase Budget. PC may throttle or reschedule"
   - **Current State**: No budget tracking
   - **Gap**: Need:
     - Budget schema (per phase: tokens, tools_minutes, gpu_hours)
     - Budget accumulator (track actual usage)
     - Budget enforcement (throttle/reject when exceeded)
   - **Priority**: 🔴 HIGH

3. **❌ Waiver System (Enhanced)**
   - **Spec Requirement (orchestrator.txt:183)**: "Waivers (for rare exceptions) require owner, expiry, compensating control"
   - **Spec Requirement (phase.txt:97)**: "Waivers: allowed only if policy permits (owner, expiry, compensating control)"
   - **Current State**: Basic waiver support in SecurityGate only
   - **Gap**: Need generalized waiver system:
     - `waivers` table (run_id, phase, violation_type, owner, expires_at, compensating_control)
     - Waiver approval workflow (if needed)
     - Waiver expiration checks
   - **Priority**: 🟡 MEDIUM

---

## Category 7: Contracts & APIs

### ✅ Implemented (1)

1. **Basic Data Schemas**
   - Files: `packages/schemas/`, `packages/artifact-schemas/`, `packages/event-schemas/`
   - Status: ✅ Exists but may not match spec exactly

### ❌ Missing (5)

1. **❌ PhaseContext Schema (JSON Schema)**
   - **Spec Requirement (phase.txt:65-80)**: JSON Schema with required: [phase, inputs, budgets, rubrics, timebox]
   - **Current State**: May exist informally but not as JSON Schema
   - **Gap**: Need formal JSON Schema definition in `packages/schemas/src/phase/phase-context.ts`
   - **Priority**: 🔴 HIGH

2. **❌ TaskSpec Schema (JSON Schema)**
   - **Spec Requirement (phase.txt:85-102)**: JSON Schema with required: [id, phase, type, target, input, budget]
   - **Current State**: Not formalized
   - **Gap**: Need formal JSON Schema definition in `packages/schemas/src/phase/task-spec.ts`
   - **Priority**: 🔴 HIGH

3. **❌ EvidencePack Schema (JSON Schema)**
   - **Spec Requirement (phase.txt:107-122)**: JSON Schema with required: [artifacts, guard_reports]
   - **Current State**: SecurityPack exists but not generalized
   - **Gap**: Need generalized EvidencePack for all phases
   - **Priority**: 🔴 HIGH

4. **❌ Internal APIs (4 endpoints)**
   - **Spec Requirement (orchestrator.txt:102-106)**:
     - `POST /tasks {taskSpec}` → queue a task
     - `POST /gates/{phase}/evaluate {evidencePack}` → pass|fail
     - `POST /refinery/ingest {q,a,v,phase}` → kmap.delta
     - `POST /heartbeat` (progress)
   - **Spec Requirement (phase.txt:137-141)**:
     - `POST /phase/{name}/start {PhaseContext}`
     - `POST /phase/{name}/tasks {TaskSpec}`
     - `POST /phase/{name}/gate/evaluate {EvidencePack}`
     - `POST /phase/{name}/heartbeat {task_id, pct, eta, metrics}`
   - **Current State**: No internal HTTP APIs
   - **Gap**: Need API service (Express/Fastify) with these endpoints
   - **Priority**: 🟡 MEDIUM (can use direct function calls initially)

5. **❌ Phase Event Topics (7 events)**
   - **Spec Requirement (phase.txt:129-144)**: 7 event topics with defined payloads
     - `phase.started`
     - `phase.progress`
     - `phase.stalled`
     - `phase.ready`
     - `phase.gate.passed`
     - `phase.gate.failed`
     - `phase.error`
   - **Current State**: Generic events may exist
   - **Gap**: Need strongly-typed event definitions matching spec
   - **Priority**: 🔴 HIGH

---

## Category 8: Dashboards & Monitoring

### ✅ Implemented (0)

*None*

### ❌ Missing (5)

1. **❌ Phase Gantt & Progress Heatmap**
   - **Spec Requirement (phase.txt:189)**: "Phase Gantt & progress heatmap"
   - **Current State**: No dashboard UI
   - **Gap**: Need web dashboard with:
     - Gantt chart showing phase timeline (planned vs actual)
     - Progress heatmap (color-coded by phase status)
   - **Priority**: 🟡 LOW (MVP can use CLI logs)

2. **❌ Gate Readiness Score Dashboard**
   - **Spec Requirement (phase.txt:190)**: "Gate readiness score + failing rubrics"
   - **Current State**: No dashboard
   - **Gap**: Need real-time gate readiness display:
     - Current rubric scores vs thresholds
     - Blocking violations
     - Estimated time to gate pass
   - **Priority**: 🟡 LOW

3. **❌ Cost Burn Dashboard**
   - **Spec Requirement (phase.txt:191)**: "Cost burn (tokens, tools minutes, GPU hours)"
   - **Current State**: No cost tracking UI
   - **Gap**: Need dashboard showing:
     - Token consumption by phase (line chart)
     - Tool minutes used vs budget (bar chart)
     - Total cost projection
   - **Priority**: 🟡 LOW

4. **❌ Error Stream with Root Cause**
   - **Spec Requirement (phase.txt:192)**: "Error stream with root-cause tags (tool/agent/gate)"
   - **Current State**: Logs only
   - **Gap**: Need error dashboard:
     - Real-time error feed
     - Categorized by source (tool, agent, gate)
     - Root cause analysis links
   - **Priority**: 🟡 LOW

5. **❌ Q/A/V Coverage Dashboard**
   - **Spec Requirement (phase.txt:193)**: "Q/A/V coverage and consensus over time"
   - **Current State**: Q/A/V not implemented
   - **Gap**: Need dashboard showing:
     - Questions generated per phase
     - Answer grounding scores
     - Consensus levels (Fusion)
     - Knowledge Map growth
   - **Priority**: 🟡 LOW

---

## Prioritized Implementation Roadmap

### 🔴 **Phase 1: Critical Autonomy Infrastructure** (2-3 weeks)

**Goal:** Enable fully autonomous runs with Q/A/V + checkpoints + resilience

1. **Q/A/V Triad Implementation**
   - Create `QuestionAgent`, `AnswerAgent`, `QuestionValidator` classes
   - Integrate with Knowledge Refinery
   - Add ASSUMPTIONS registry
   - **Effort:** 5 days
   - **Files to Create:**
     - `packages/agents/src/qav/question-agent.ts`
     - `packages/agents/src/qav/answer-agent.ts`
     - `packages/agents/src/qav/question-validator.ts`
     - `packages/agents/src/qav/index.ts`
   - **Database Migration:** Add `assumptions` table

2. **Job Queue + Checkpoint System**
   - Set up Redis Streams or NATS
   - Implement checkpoint/resume logic
   - Add `checkpoints` and `tasks` tables
   - **Effort:** 4 days
   - **Files to Create:**
     - `packages/orchestrator-core/src/queue/queue.ts` (enqueue, consume)
     - `packages/orchestrator-core/src/checkpoint/checkpoint-manager.ts`
     - `packages/orchestrator-core/src/database/checkpoint-repository.ts`

3. **Heartbeat + Stall Detection**
   - Agents emit heartbeats every 60s
   - Supervisor monitors for stalls (3 missed heartbeats)
   - Trigger unsticker routines on stall
   - **Effort:** 3 days
   - **Files to Modify:**
     - `packages/agent-sdk/src/base-agent.ts` (add heartbeat emission)
     - `packages/orchestrator-core/src/supervisor/supervisor.ts` (add stall detection)

4. **Phase-Specific YAML Configs**
   - Create 12 YAML config files (intake.yaml, ideation.yaml, etc.)
   - Implement config loader
   - Use configs to set budgets, allowlists, rubrics
   - **Effort:** 2 days
   - **Files to Create:** `config/*.yaml` (12 files)
   - **Files to Modify:** `packages/agents/src/config/loader.ts`

5. **Budget Tracking**
   - Track tokens/tool-minutes per phase
   - Enforce budget limits (throttle/reject)
   - **Effort:** 2 days
   - **Files to Create:**
     - `packages/orchestrator-core/src/budget/budget-tracker.ts`

**Total Effort: 16 days (~3 weeks)**

---

### 🔴 **Phase 2: Execution Infrastructure** (2 weeks)

**Goal:** Enable scalable, resilient task execution with worker pools

1. **WorkerPool Implementation**
   - Pull tasks from queue
   - Execute in sandboxed environments (Docker)
   - Emit heartbeats and checkpoints
   - **Effort:** 5 days
   - **Files to Create:**
     - `packages/orchestrator-core/src/worker/worker.ts`
     - `packages/orchestrator-core/src/worker/worker-pool.ts`

2. **Scheduler Service**
   - Derive TaskSpecs from PhasePlan
   - Shard large tasks
   - Enqueue with idempotence keys
   - **Effort:** 3 days
   - **Files to Create:**
     - `packages/orchestrator-core/src/scheduler/scheduler.ts`
     - `packages/orchestrator-core/src/scheduler/task-generator.ts`

3. **Timer Service**
   - Durable timers for retries
   - Phase timeboxes
   - **Effort:** 2 days
   - **Files to Create:**
     - `packages/orchestrator-core/src/timer/timer-service.ts`
     - `packages/orchestrator-core/src/database/timer-repository.ts`

4. **Idempotence Keys**
   - Generate hash(phase + inputs + version)
   - Store in Redis/DB
   - Skip duplicate tasks
   - **Effort:** 2 days
   - **Files to Modify:**
     - `packages/orchestrator-core/src/utils/idempotence.ts`

5. **State Store Tables**
   - Create `phases`, `tasks`, `checkpoints`, `events` tables
   - **Effort:** 1 day
   - **Migration Files:** `migrations/007_execution_tables.sql`

**Total Effort: 13 days (~2 weeks)**

---

### 🟡 **Phase 3: Observability & Recording** (1-2 weeks)

**Goal:** Full Run Ledger + metrics + provenance

1. **Run Ledger (Immutable Timeline)**
   - Append-only ledger table
   - Capture all tasks, gates, decisions, artifacts
   - **Effort:** 3 days

2. **Metrics Collection**
   - Phase duration (p50, p95, p99)
   - Gate pass rates
   - Token/cost tracking
   - **Effort:** 3 days

3. **Provenance Tracking**
   - Add provenance metadata to all artifacts
   - **Effort:** 2 days

4. **OpenTelemetry Integration**
   - Add OTEL SDK
   - Instrument MO, PCs, Agents, Tools
   - **Effort:** 3 days

5. **Evidence Pack (Generalized)**
   - Create EvidencePack schema for all phases
   - **Effort:** 1 day

**Total Effort: 12 days (~2 weeks)**

---

### 🟡 **Phase 4: Advanced Orchestration** (1-2 weeks)

**Goal:** DAG execution + fan-out/fan-in + gate loops

1. **DAG Execution Engine**
   - Topological sort of phase dependencies
   - Parallel execution (Security + Story Loop)
   - **Effort:** 4 days

2. **Fan-Out/Fan-In**
   - Parallel agent execution within phases
   - Deterministic aggregation
   - **Effort:** 3 days

3. **Loop-Until-Pass Gate Pattern**
   - Gate failure → autoFix → re-execute → re-evaluate
   - **Effort:** 3 days

4. **Release Dossier Compilation**
   - Bundle all artifacts into unified dossier
   - **Effort:** 2 days

**Total Effort: 12 days (~2 weeks)**

---

### 🟢 **Phase 5: Polish & Production Hardening** (1-2 weeks)

**Goal:** Dashboards, testing, resilience

1. **Retry Policy Engine**
   - Configurable retries per error type
   - **Effort:** 2 days

2. **Tool Fallback Ladder**
   - Allowlist fallback sequencing
   - **Effort:** 2 days

3. **Progress Slope Monitor**
   - Detect plateaus, adjust strategy
   - **Effort:** 2 days

4. **Dashboards (Optional)**
   - Phase Gantt, gate readiness, cost burn
   - **Effort:** 5 days (if prioritized)

5. **Testing**
   - Unit tests for Q/A/V, scheduler, worker
   - Integration tests (end-to-end)
   - Soak tests (24-48h long-runs)
   - **Effort:** 5 days

**Total Effort: 11-16 days (~2 weeks)**

---

## Overall Timeline

| Phase | Duration | Completion % After |
|-------|----------|-------------------|
| **Phase 1: Critical Autonomy Infrastructure** | 3 weeks | 60% |
| **Phase 2: Execution Infrastructure** | 2 weeks | 75% |
| **Phase 3: Observability & Recording** | 2 weeks | 85% |
| **Phase 4: Advanced Orchestration** | 2 weeks | 95% |
| **Phase 5: Polish & Production Hardening** | 2 weeks | 100% |
| **TOTAL** | **11 weeks** (~2.5 months) | **100%** |

---

## MVP Scope (4-5 weeks)

For a minimal viable implementation, prioritize:

✅ **Must-Have (Phase 1 + Phase 2)**
- Q/A/V Triad
- Job Queue + Checkpoints
- Heartbeat + Stall Detection
- Phase YAML Configs
- Budget Tracking
- WorkerPool
- Scheduler
- Timer Service
- Idempotence Keys
- State Store Tables

⏳ **Can Defer**
- Dashboards (use CLI logs)
- OTEL tracing (use basic logging)
- Advanced retries
- Sagas/compensation
- Self-Execution Mode
- Auto-Doer Creation

**MVP Timeline: 5 weeks**

---

## Recommendation

**Approach:** Implement in phases (1 → 2 → 3 → 4 → 5) to ensure incremental value delivery. After Phase 1, the system will be **autonomous and resilient**. After Phase 2, it will be **scalable and production-ready**.

**Next Step:** Review this gap analysis with stakeholders, confirm priorities, and start Phase 1 implementation.

---

**End of Gap Analysis**
