# IdeaMine Orchestrator Integration Guide

**Version:** 1.0.0
**Status:** Production Ready
**Last Updated:** 2025-10-20

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [System Architecture](#system-architecture)
4. [Component Integration](#component-integration)
5. [Usage Examples](#usage-examples)
6. [Configuration](#configuration)
7. [Monitoring & Observability](#monitoring--observability)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

---

## Overview

The IdeaMine Orchestrator is a production-ready system for autonomous software product generation. It implements 100% of the orchestrator.txt and phase.txt specifications, providing:

- **Autonomous Execution:** 20-50 hour runs without human intervention
- **Parallel Execution:** DAG-based phase execution and fan-out/fan-in agent execution
- **Resilience:** Checkpoint-based recovery, auto-fix gates, unsticker routines
- **Observability:** Complete audit trail, metrics collection, provenance tracking
- **Production Hardening:** Comprehensive testing (acceptance, soak, chaos)

---

## Quick Start

### Prerequisites

```bash
# Required services
- PostgreSQL 14+
- Redis 7+
- Node.js 18+
- pnpm 8+
```

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/ideamine.git
cd ideamine

# Install dependencies
pnpm install

# Run database migrations
pnpm migrate:up

# Start services
docker-compose up -d postgres redis

# Start orchestrator
pnpm start
```

### Basic Usage

```typescript
import { EnhancedOrchestrator } from '@ideamine/orchestrator-core';

// Initialize orchestrator
const orchestrator = new EnhancedOrchestrator({
  db: postgresClient,
  redis: redisClient,
  eventBus: new EventBus(),
});

// Execute a run
const run = await orchestrator.execute({
  idea: 'Build a collaborative todo app with real-time sync',
  target_users: 'remote teams',
  constraints: ['mobile-first', 'offline-capable'],
});

console.log('Run completed:', run.id);
console.log('Phases completed:', run.phases_completed);
console.log('Artifacts produced:', run.artifacts.length);
```

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Enhanced Orchestrator                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Run Planner  │  │ DAG Executor │  │ Phase Coord  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐     ┌──────────────┐
│  Execution   │      │  Resilience  │     │ Observability│
│    Layer     │      │    Layer     │     │    Layer     │
│              │      │              │     │              │
│ • Queue      │      │ • Heartbeats │     │ • Ledger     │
│ • Workers    │      │ • Unsticker  │     │ • Metrics    │
│ • Checkpoints│      │ • Retries    │     │ • Provenance │
│ • Scheduler  │      │ • Supervisor │     │ • Tracing    │
│ • Timers     │      │ • Fallbacks  │     │ • Dossier    │
└──────────────┘      └──────────────┘     └──────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Data Layer      │
                    │  • PostgreSQL    │
                    │  • Redis Streams │
                    └──────────────────┘
```

### Layer Responsibilities

**Execution Layer:**
- Distributed task execution via Redis Streams queue
- Worker pool management with auto-scaling
- Checkpoint-based resumability
- Task scheduling and sharding
- Durable timers for retries and timeouts

**Resilience Layer:**
- Heartbeat monitoring and stall detection
- 7 unsticker routines for different failure modes
- Error-specific retry policies
- Tool fallback ladder
- Circuit breaker pattern

**Observability Layer:**
- Immutable append-only ledger
- Structured metrics collection
- Provenance tracking for all artifacts
- OpenTelemetry integration (ready)
- Release dossier compilation

**Production Hardening:**
- DAG executor for parallel phases
- Fan-out/fan-in for parallel agents
- Loop-until-pass gates with auto-fix
- Comprehensive test coverage

---

## Component Integration

### 1. Enhanced Orchestrator Setup

```typescript
import { EnhancedOrchestrator } from '@ideamine/orchestrator-core';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { EventBus } from '@ideamine/orchestrator-core/events';

// Database connection
const db = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'ideamine',
  user: 'postgres',
  password: 'password',
});

// Redis connection
const redis = createClient({
  url: 'redis://localhost:6379',
});
await redis.connect();

// Event bus for pub/sub
const eventBus = new EventBus();

// Initialize orchestrator
const orchestrator = new EnhancedOrchestrator({
  db,
  redis,
  eventBus,
  config: {
    maxWorkers: 4,
    heartbeatInterval: 60000, // 1 minute
    stallThreshold: 3, // 3 missed heartbeats
    maxRetries: 5,
  },
});
```

### 2. Worker Pool Setup

```typescript
import { WorkerPool } from '@ideamine/orchestrator-core/worker';
import { Queue } from '@ideamine/orchestrator-core/queue';
import { CheckpointManager } from '@ideamine/orchestrator-core/checkpoint';

// Initialize queue
const queue = new Queue(redis);

// Initialize checkpoint manager
const checkpointManager = new CheckpointManager(db);

// Create worker pool
const workerPool = new WorkerPool({
  minWorkers: 2,
  maxWorkers: 8,
  queue,
  checkpointManager,
  eventBus,
  autoScale: true,
  scaleUpThreshold: 10, // Queue depth
  scaleDownThreshold: 2,
});

// Start workers
await workerPool.start();
```

### 3. Supervisor Setup

```typescript
import { EnhancedSupervisor } from '@ideamine/orchestrator-core/supervisor';
import { HeartbeatMonitor } from '@ideamine/orchestrator-core/runners/heartbeat';
import { SlopeMonitor } from '@ideamine/orchestrator-core/heal/slopeMonitor';
import { FallbackLadder } from '@ideamine/orchestrator-core/heal/fallbackLadder';

// Initialize supervisor
const supervisor = new EnhancedSupervisor({
  db,
  redis,
  eventBus,
  heartbeatMonitor: new HeartbeatMonitor({ interval: 60000 }),
  slopeMonitor: new SlopeMonitor({ windowSize: 5 }),
  fallbackLadder: new FallbackLadder({ toolRegistry }),
});

// Start monitoring
await supervisor.start();
```

### 4. Metrics Collection

```typescript
import { MetricsCollector } from '@ideamine/orchestrator-core/metrics';
import { RunLedger } from '@ideamine/orchestrator-core/ledger';

// Initialize metrics collector
const metricsCollector = new MetricsCollector(db);

// Initialize run ledger
const runLedger = new RunLedger(db);

// Track phase execution
metricsCollector.startPhase(runId, 'prd');

// Record gate result
metricsCollector.recordGateResult(runId, 'prd', {
  pass: true,
  score: 0.92,
});

// Record resource usage
metricsCollector.recordResourceUsage(runId, 'prd', {
  tokens: 50000,
  tools_minutes: 2.5,
  cost_usd: 1.25,
});

// Complete phase
const metrics = metricsCollector.completePhase(runId, 'prd');

// Append to ledger
await runLedger.appendTaskExecution(runId, task, result, cost);
await runLedger.appendGateEvaluation(runId, phase, gateResult);
```

---

## Usage Examples

### Example 1: Simple Run

```typescript
// Execute a simple run
const run = await orchestrator.execute({
  idea: 'Build a REST API for user management',
});

// Wait for completion
console.log(`Run ${run.id} completed with ${run.phases_completed.length} phases`);
```

### Example 2: Partial Run (Specific Phases)

```typescript
// Execute only intake and ideation phases
const run = await orchestrator.execute(
  {
    idea: 'Build a machine learning pipeline',
  },
  {
    phases: ['intake', 'ideation'],
    autonomousMode: true,
  }
);
```

### Example 3: Monitoring Run Progress

```typescript
// Subscribe to events
eventBus.on('phase.started', (event) => {
  console.log(`Phase ${event.payload.phase} started`);
});

eventBus.on('phase.gate.passed', (event) => {
  console.log(`Phase ${event.payload.phase} gate passed with score ${event.payload.score}`);
});

eventBus.on('phase.completed', (event) => {
  console.log(`Phase ${event.payload.phase} completed in ${event.payload.duration_ms}ms`);
});

// Execute run
const run = await orchestrator.execute({ idea: 'Build a dashboard' });
```

### Example 4: Compiling Release Dossier

```typescript
import { ReleaseDossierCompiler } from '@ideamine/orchestrator-core/dossier';

// Initialize compiler
const dossierCompiler = new ReleaseDossierCompiler(db);

// Compile dossier for run
const dossier = await dossierCompiler.compile(runId);

// Export as HTML
const html = await dossierCompiler.exportDossier(dossier, 'html');
fs.writeFileSync('release-dossier.html', html);

// Get summary
const summary = await dossierCompiler.getSummary(runId);
console.log(`Completeness: ${summary.completeness_percent}%`);
console.log(`Missing artifacts: ${summary.missing_artifacts.join(', ')}`);
```

### Example 5: DAG Execution with Parallel Phases

```typescript
import { DAGExecutor } from '@ideamine/orchestrator-core/dag';

// Define phase dependencies
const phases = [
  { phaseId: 'intake', dependencies: [] },
  { phaseId: 'ideation', dependencies: ['intake'] },
  { phaseId: 'prd', dependencies: ['ideation'] },
  { phaseId: 'architecture', dependencies: ['prd'] },
  { phaseId: 'build', dependencies: ['architecture'] },
  { phaseId: 'security', dependencies: ['build'] },
  { phaseId: 'story-loop', dependencies: ['build'] }, // Parallel with security!
  { phaseId: 'qa', dependencies: ['security', 'story-loop'] },
];

// Initialize DAG executor
const dagExecutor = new DAGExecutor();

// Validate dependencies
const validation = dagExecutor.validate(phases);
if (!validation.valid) {
  console.error('Invalid dependencies:', validation.issues);
  throw new Error('Phase dependency validation failed');
}

// Execute phases in DAG order
await dagExecutor.execute(phases, async (phase) => {
  return await phaseCoordinator.execute(phase);
});

// Get execution plan
const levels = dagExecutor.topologicalSort(phases);
console.log('Execution plan:', levels);
// Output: [['intake'], ['ideation'], ['prd'], ['architecture'], ['build'], ['security', 'story-loop'], ['qa']]
```

### Example 6: Fan-Out/Fan-In with Parallel Agents

```typescript
import { FanOutRunner } from '@ideamine/orchestrator-core/runners';

// Initialize fan-out runner
const fanOutRunner = new FanOutRunner();

// Execute agents in parallel
const result = await fanOutRunner.execute(
  {
    parallelism: 'parallel', // or 'sequential', 2 (number), 'iterative'
    agents: ['StrategyAgent', 'CompetitiveAgent', 'TechStackAgent', 'PersonaAgent'],
    aggregation_strategy: 'merge', // or 'concat', 'vote', 'custom'
  },
  inputData,
  async (agent, input) => {
    // Execute single agent
    return await agentExecutor.execute(agent, input);
  }
);

console.log('Aggregated result:', result);
```

### Example 7: Loop-Until-Pass Gates with Auto-Fix

```typescript
import { LoopUntilPassGate } from '@ideamine/orchestrator-core/gate';

// Initialize loop-until-pass gate
const loopGate = new LoopUntilPassGate(
  5, // max attempts
  true // enable auto-fix
);

// Execute phase with auto-fix retry
const result = await loopGate.executeWithGate(
  phaseExecutor,
  async (phaseResult) => {
    // Evaluate gate
    return await gatekeeper.evaluate(phaseResult);
  },
  context
);

console.log(`Gate passed after ${result.attempts} attempts`);
console.log(`Auto-fix applied: ${result.autoFixApplied}`);
```

---

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/ideamine

# Redis
REDIS_URL=redis://localhost:6379

# Orchestrator
MAX_WORKERS=4
HEARTBEAT_INTERVAL=60000
STALL_THRESHOLD=3
MAX_RETRIES=5

# Metrics
METRICS_RETENTION_DAYS=90
LEDGER_RETENTION_DAYS=365

# OpenTelemetry (optional)
OTEL_EXPORTER_JAEGER_ENDPOINT=http://localhost:14268/api/traces
OTEL_SERVICE_NAME=ideamine-orchestrator
```

### Phase Configuration (YAML)

Example: `config/prd.yaml`

```yaml
phase: prd
parallelism: sequential
aggregation_strategy: merge

agents:
  - StoryCutterAgent
  - PRDWriterAgent
  - UXFlowAgent
  - NFRsAgent
  - TraceMatrixAgent

budgets:
  tokens: 200000
  tools_minutes: 15
  wallclock_minutes: 45

guards:
  - type: contradictions
    threshold: 0
  - type: grounding
    threshold: 0.85
  - type: coverage
    min_stories: 5

gate:
  pass_threshold: 0.7
  auto_fix_enabled: true
  max_attempts: 5
```

---

## Monitoring & Observability

### Metrics Queries

```sql
-- Phase performance (last 7 days)
SELECT * FROM phase_performance;

-- Cost breakdown for run
SELECT * FROM get_cost_breakdown('run-id-here');

-- Gate history for run
SELECT * FROM get_gate_history('run-id-here');

-- Recent run summary
SELECT * FROM recent_run_summary LIMIT 10;

-- Active tasks with heartbeat status
SELECT * FROM active_tasks;
```

### Event Monitoring

```typescript
// Subscribe to all events
eventBus.on('*', (event) => {
  console.log(`[${event.type}]`, event.payload);
});

// Specific event types
eventBus.on('phase.started', handler);
eventBus.on('phase.progress', handler);
eventBus.on('phase.ready', handler);
eventBus.on('phase.gate.passed', handler);
eventBus.on('phase.gate.failed', handler);
eventBus.on('phase.stalled', handler);
eventBus.on('phase.completed', handler);
eventBus.on('task.retry', handler);
eventBus.on('kmap.delta.created', handler);
```

### Ledger Queries

```typescript
// Query ledger entries
const entries = await runLedger.query(runId, {
  type: 'gate',
  from: new Date('2025-10-01'),
  limit: 100,
});

// Get cost summary
const entries = await runLedger.query(runId, { type: 'cost' });
const totalCost = entries.reduce((sum, e) => sum + e.data.usd, 0);
```

---

## Troubleshooting

### Common Issues

#### Issue: Worker crashes and doesn't resume

**Cause:** Checkpoint not saved or corrupted

**Solution:**
```typescript
// Check checkpoint exists
const checkpoint = await checkpointManager.loadCheckpoint(taskId);
if (!checkpoint) {
  console.error('No checkpoint found for task:', taskId);
}

// Verify checkpoint data
console.log('Checkpoint token:', checkpoint.token);
console.log('Checkpoint data:', checkpoint.data);
```

#### Issue: Phase stalls indefinitely

**Cause:** No heartbeats received, supervisor not detecting stall

**Solution:**
```typescript
// Check heartbeat monitor is running
console.log('Heartbeat monitor running:', heartbeatMonitor.isRunning());

// Check stall detection
const stalledTasks = await supervisor.getStalledTasks();
console.log('Stalled tasks:', stalledTasks);

// Manually trigger unsticker
await supervisor.handleStall(taskId);
```

#### Issue: Gate keeps failing even with auto-fix

**Cause:** Fix strategies not addressing root cause

**Solution:**
```typescript
// Check gate failure reasons
const gateResult = await gatekeeper.evaluate(phaseId, evidencePack);
console.log('Gate failed reasons:', gateResult.reasons);
console.log('Gate issues:', gateResult.issues);

// Verify fix strategies applied
const stats = loopGate.getStats(attempts, autoFixApplied);
console.log('Auto-fix statistics:', stats);

// Escalate to manual intervention
if (attempts >= maxAttempts) {
  await notifyHuman(runId, phaseId, gateResult);
}
```

#### Issue: High memory usage

**Cause:** Too many workers, checkpoint data not cleaned up

**Solution:**
```sql
-- Clean up old checkpoints
SELECT cleanup_old_checkpoints(7); -- 7 days retention

-- Clean up old events
SELECT cleanup_old_events(30); -- 30 days retention

-- Monitor worker count
SELECT COUNT(*) FROM workers WHERE status = 'running';
```

---

## Best Practices

### 1. Worker Pool Sizing

```typescript
// Conservative: 1 worker per 2 CPU cores
const maxWorkers = Math.floor(os.cpus().length / 2);

// Aggressive: 1 worker per CPU core
const maxWorkers = os.cpus().length;

// Auto-scaling recommended
const workerPool = new WorkerPool({
  minWorkers: 2,
  maxWorkers: 8,
  autoScale: true,
});
```

### 2. Checkpoint Frequency

```typescript
// For long-running tasks (>5 min), checkpoint every 2 minutes
agent.setCheckpointCallback(async () => {
  await agent.saveCheckpoint();
}, 120000); // 2 minutes

// For short tasks (<1 min), don't checkpoint
// (overhead not worth it)
```

### 3. Retry Policy Configuration

```typescript
// Transient errors: exponential backoff
retryEngine.setPolicy('transient', {
  strategy: 'exponential',
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 60000,
});

// Rate limit errors: linear backoff with jitter
retryEngine.setPolicy('rate-limit', {
  strategy: 'linear',
  maxRetries: 10,
  baseDelay: 5000,
  jitter: 1000,
});
```

### 4. Metrics Collection

```typescript
// Always collect phase metrics
metricsCollector.startPhase(runId, phase);
try {
  const result = await executePhase(phase);
  metricsCollector.recordGateResult(runId, phase, gateResult);
} finally {
  metricsCollector.completePhase(runId, phase);
}
```

### 5. Event-Driven Architecture

```typescript
// Use events for cross-component communication
// Don't use direct method calls

// ❌ Bad: Direct call
phaseCoordinator.onGatePassed(phaseId);

// ✅ Good: Event emission
eventBus.emit('phase.gate.passed', { phaseId, score: 0.92 });
```

---

## Additional Resources

- [API Documentation](./API_DOCS.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [Architecture Decision Records](./docs/adr/)
- [Performance Benchmarks](./BENCHMARKS.md)
- [Operator Runbook](./RUNBOOK.md)

---

**Last Updated:** 2025-10-20
**Version:** 1.0.0
**Status:** Production Ready
