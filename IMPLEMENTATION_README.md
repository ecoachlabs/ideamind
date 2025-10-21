# IdeaMine Implementation Guide
**Master Index for Orchestrator & Phase Coordinator Implementation**

---

## 📚 Documentation Structure

This implementation is documented across three files:

### 1. **UNIFIED_IMPLEMENTATION_SPEC.md** (Part 1)
Contains:
- Executive Summary
- Architecture Overview
- **Foundation Layer** (Week 1-2) - YAML configs, schemas, events, budgets
- **Autonomy Layer** (Week 3-4) - Q/A/V Triad, Knowledge Refinery
- **Execution Layer** (Week 5-6) - Job Queue, WorkerPool, Scheduler, Checkpoints
- **Resilience Layer** (Week 7-8) - Heartbeats, Unsticker Routines, Retries

### 2. **UNIFIED_IMPLEMENTATION_SPEC_PART2.md** (Part 2)
Contains:
- **Observability Layer** (Week 9-10) - Ledger, Metrics, OTEL, Provenance
- **Production Hardening** (Week 11) - DAG, Fan-out/Fan-in, Gate Loops, Tests
- Complete Database Schema
- Complete File Structure
- Summary Roadmap

### 3. **ORCHESTRATOR_SPEC_GAP_ANALYSIS.md**
High-level gap analysis with prioritized breakdown by category.

---

## 🎯 Quick Start

### Current Status
- ✅ **Agents**: 43 agents across 12 phases (implemented)
- ✅ **Basic Orchestration**: State machine, phase coordinators (implemented)
- ✅ **Security Phase**: 3 agents + gate (implemented)
- ❌ **Autonomy**: Q/A/V Triad (0% - **CRITICAL**)
- ❌ **Execution Infrastructure**: Job queue, workers, checkpoints (0% - **CRITICAL**)
- ❌ **Resilience**: Heartbeats, unsticker (0% - **HIGH**)
- ❌ **Observability**: Ledger, metrics, OTEL (0% - **MEDIUM**)

**Overall Completion: ~27% of spec requirements**

---

## 🚀 Implementation Priority

### 🔴 **MVP (5 weeks) - Must Have**
1. **Week 1-2: Foundation**
   - 12 Phase YAML configs
   - JSON Schemas (PhaseContext, TaskSpec, EvidencePack)
   - 7 Phase events
   - Budget tracking

2. **Week 3-4: Autonomy**
   - Q/A/V Triad (QuestionAgent, AnswerAgent, QuestionValidator)
   - Knowledge Refinery integration
   - ASSUMPTIONS registry

3. **Week 5: Execution (Part 1)**
   - Redis Streams job queue
   - Checkpoint system
   - WorkerPool with heartbeats

**After Week 5:** System is autonomous and can run 20-50h without user interaction

### 🟡 **Full Implementation (11 weeks)**
4. **Week 6: Execution (Part 2)**
   - Scheduler service
   - Timer service
   - State store tables

5. **Week 7-8: Resilience**
   - Heartbeat monitoring
   - 7 Unsticker routines
   - Retry policies
   - Supervisor enhancement

6. **Week 9-10: Observability**
   - Run Ledger (immutable timeline)
   - Metrics collection
   - Provenance tracking
   - OpenTelemetry integration

7. **Week 11: Hardening**
   - DAG executor (parallel phases)
   - Fan-out/fan-in pattern
   - Loop-until-pass gates
   - Release Dossier
   - Comprehensive tests

**After Week 11:** 100% spec compliance

---

## 📋 Key Deliverables by Layer

### Foundation Layer
- [ ] 12 `config/*.yaml` files
- [ ] 3 JSON Schema files (`phase-context.ts`, `task-spec.ts`, `evidence-pack.ts`)
- [ ] 7 Phase event types (`phase-events.ts`)
- [ ] Run Plan generator (`run-planner.ts`)
- [ ] Budget tracker (`budget-tracker.ts`)
- [ ] 3 DB tables (`phases`, `assumptions`, `evidence_packs`)

### Autonomy Layer
- [ ] Question Agent (`question-agent.ts`)
- [ ] Answer Agent (`answer-agent.ts`)
- [ ] Question Validator (`question-validator.ts`)
- [ ] Refinery Adapter enhancement (`refinery-adapter.ts`)
- [ ] Clarification loop in PhaseCoordinator
- [ ] 1 DB table (`assumptions`)

### Execution Layer
- [ ] Job Queue (`queue.ts` with Redis Streams)
- [ ] Checkpoint Manager (`checkpoint-manager.ts`)
- [ ] Worker (`worker.ts` with heartbeats)
- [ ] WorkerPool (`worker-pool.ts`)
- [ ] Scheduler (`scheduler.ts`)
- [ ] Timer Service (`timer-service.ts`)
- [ ] 4 DB tables (`tasks`, `checkpoints`, `events`, `timers`)

### Resilience Layer
- [ ] Heartbeat Monitor (`heartbeat.ts`)
- [ ] Progress Slope Monitor (`slopeMonitor.ts`)
- [ ] Fallback Ladder (`fallbackLadder.ts`)
- [ ] Spec Shrinker (`chunker.ts`)
- [ ] Retry Policy Engine (`retries.ts`)
- [ ] Supervisor enhancement

### Observability Layer
- [ ] Run Ledger (`run-ledger.ts`)
- [ ] Metrics Collector (`metrics-collector.ts`)
- [ ] Provenance Tracking (artifact-repository enhancement)
- [ ] OTEL Integration (`otel.ts`)
- [ ] 2 DB tables (`ledger`, `phase_metrics`)

### Production Hardening
- [ ] DAG Executor (`dag-executor.ts`)
- [ ] Fan-Out Runner (`fanout.ts`)
- [ ] Loop-until-pass gate pattern
- [ ] Release Dossier Compiler (`release-dossier.ts`)
- [ ] 10 Acceptance tests
- [ ] Soak tests (24-48h)
- [ ] Chaos tests
- [ ] 2 DB tables (`waivers`, `release_dossiers`)

---

## 📊 Effort Breakdown

| Component | Files to Create | Files to Modify | DB Tables | Days |
|-----------|-----------------|-----------------|-----------|------|
| Foundation | 24 | 5 | 2 | 10 |
| Autonomy | 8 | 3 | 1 | 8 |
| Execution | 12 | 4 | 4 | 12 |
| Resilience | 9 | 6 | 0 | 8 |
| Observability | 7 | 5 | 3 | 8 |
| Hardening | 15 | 8 | 2 | 9 |
| **TOTAL** | **75** | **31** | **12** | **55** |

---

## 🔑 Critical Path Dependencies

```
Foundation → Autonomy → Execution
                         ↓
                    Resilience
                         ↓
                   Observability
                         ↓
                     Hardening
```

**Cannot skip Foundation** - All other layers depend on configs, schemas, and events.

**Cannot skip Autonomy** - Required for "no user interaction mid-run" spec requirement.

**Cannot skip Execution** - Required for 20-50h long-running tasks with checkpoints.

**Can defer Observability** - Can use basic logging initially.

**Can defer Hardening** - But MVP won't have parallel phases or comprehensive tests.

---

## 🛠️ Technology Stack

### Core
- **Language**: TypeScript/Node.js
- **Database**: PostgreSQL (13 tables)
- **Job Queue**: Redis Streams or NATS JetStream
- **Message Bus**: Event Bus (existing)

### Observability
- **Tracing**: OpenTelemetry + Jaeger
- **Metrics**: Custom metrics collector → Prometheus (optional)
- **Logging**: Winston/Pino

### Testing
- **Unit**: Jest
- **Integration**: Jest + Docker Compose
- **Soak**: Custom test harness (24-48h runs)
- **Chaos**: Chaos Monkey pattern

---

## 📖 How to Use This Guide

### For Architects
1. Read **ORCHESTRATOR_SPEC_GAP_ANALYSIS.md** for high-level overview
2. Review Architecture Overview in UNIFIED_IMPLEMENTATION_SPEC.md
3. Review Complete Database Schema in PART2.md

### For Developers
1. Pick a layer to implement (start with Foundation)
2. Find the layer section in the spec documents
3. Follow the code examples verbatim
4. Create files in exact locations specified
5. Run tests as you go

### For Project Managers
1. Use the Summary Roadmap (PART2.md bottom) for scheduling
2. Track completion by layer (6 layers = 6 milestones)
3. MVP milestone is after Execution Layer (Week 6)

---

## ✅ Acceptance Criteria

### MVP (Week 6)
- [ ] All 12 phase YAML configs exist and load correctly
- [ ] Q/A/V Triad generates questions, answers, validates (end-to-end test)
- [ ] Job queue enqueues/dequeues tasks with idempotence
- [ ] Worker executes tasks with heartbeats every 60s
- [ ] Checkpoints save every 2 minutes and resume on crash
- [ ] Budget tracker enforces token/tool-minute limits
- [ ] Phase events emit correctly (7 event types)
- [ ] Run completes Intake → Ideation with NO user prompts

### Full Implementation (Week 11)
- [ ] All 10 acceptance tests pass (phase.txt:299-351)
- [ ] Security + Story Loop phases run in PARALLEL
- [ ] Gate failures trigger auto-fix and retry (loop-until-pass)
- [ ] Run Ledger captures immutable timeline (all tasks, gates, decisions)
- [ ] OTEL spans visible in Jaeger
- [ ] Soak test runs 24h with induced stalls and completes
- [ ] Chaos test (container kills) recovers and completes
- [ ] Release Dossier compiles with all artifacts

---

## 🚨 Common Pitfalls to Avoid

1. **DON'T skip Foundation** - Everything depends on configs and schemas
2. **DON'T implement in random order** - Follow the layer sequence
3. **DON'T modify existing agents yet** - Focus on orchestration infrastructure first
4. **DON'T forget JSON Schema validation** - Use Ajv to validate at runtime
5. **DON'T hardcode phase configs** - Always load from YAML
6. **DON'T skip tests** - Write tests as you implement each component
7. **DON'T skip checkpoints** - Every task >2min must checkpoint
8. **DON'T skip heartbeats** - Workers must emit heartbeats every 60s
9. **DON'T skip idempotence keys** - Queue must deduplicate tasks
10. **DON'T skip the Run Ledger** - Provenance is critical for debugging

---

## 📞 Support

- **Spec Questions**: Refer to `orchestrator.txt` and `phase.txt` in Downloads folder
- **Implementation Questions**: Check code examples in UNIFIED_IMPLEMENTATION_SPEC.md
- **Database Questions**: See Complete Database Schema in PART2.md
- **Architecture Questions**: See Architecture Overview in UNIFIED_IMPLEMENTATION_SPEC.md

---

**Last Updated**: 2025-10-19
**Spec Version**: orchestrator.txt (303 lines) + phase.txt (213 lines)
**Implementation Status**: 27% complete (foundational agents only)
**Target Completion**: Week 11 (55 days)
