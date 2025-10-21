# Execution Layer - Integration & Deployment Guide

**Status:** ✅ Complete (Week 5-6 of implementation)
**Implements:** UNIFIED_IMPLEMENTATION_SPEC.md Section 3

## Overview

The Execution Layer provides a custom distributed orchestration engine for scalable, fault-tolerant task execution supporting 20-50 hour autonomous runs.

**Key Features:**
- ✅ Redis Streams job queue with idempotence
- ✅ Checkpoint/resume for long-running tasks
- ✅ Worker pool with dynamic scaling
- ✅ Heartbeat monitoring (60s intervals)
- ✅ Exponential backoff retries
- ✅ Durable timers (survive restarts)
- ✅ Task sharding for batches

**No external orchestrators** - We own the entire execution stack end-to-end.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Scheduler Service                          │
│  - Generates TaskSpecs from PhasePlan                          │
│  - Splits budgets across agents                                │
│  - Enqueues to JobQueue                                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      JobQueue (Redis Streams)                   │
│  Topics: tasks, heartbeats, events                             │
│  - Idempotent message delivery                                 │
│  - Consumer groups for load balancing                          │
│  - At-least-once delivery with ACKs                            │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WorkerPool                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐           │
│  │Worker 1 │  │Worker 2 │  │Worker 3 │  │Worker 4 │ ...       │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘           │
│       │            │            │            │                  │
└───────┼────────────┼────────────┼────────────┼──────────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
    ┌──────────────────────────────────────────────┐
    │       CheckpointManager (Postgres)           │
    │  - Save checkpoint every 2 minutes           │
    │  - Resume from last checkpoint on crash      │
    │  - Continuation tokens (step-N-complete)     │
    └──────────────────────────────────────────────┘
        │
        ▼
    ┌──────────────────────────────────────────────┐
    │         TimerService (Postgres)              │
    │  - Schedule retries (exponential backoff)    │
    │  - Enforce phase timeboxes                   │
    │  - Durable timers (resume after restart)     │
    └──────────────────────────────────────────────┘
```

---

## Component Details

### 1. JobQueue (Redis Streams)

**File:** `packages/orchestrator-core/src/queue/queue.ts`

**Features:**
- Idempotent enqueue (duplicate keys auto-skipped)
- Consumer groups for competing consumers
- Queue depth monitoring for adaptive scaling
- Pending message claiming (crash recovery)

**Usage:**
```typescript
import { JobQueue } from '@ideamine/orchestrator-core/queue';

const queue = new JobQueue({
  idempotenceTtlSeconds: 86400, // 24 hours
  blockTimeMs: 5000,
  batchSize: 10,
});

await queue.init();

// Enqueue task
const messageId = await queue.enqueue('tasks', taskSpec, idempotenceKey);

// Consume tasks
await queue.consume('tasks', 'phase-workers', 'worker-1', async (message) => {
  await processTask(message.payload);
});
```

**Idempotence:**
```typescript
// Generate deterministic key
const key = JobQueue.generateKey('INTAKE', { idea: 'test' }, 'v1');

// First enqueue: succeeds
await queue.enqueue('tasks', task, key); // Returns messageId

// Second enqueue: skipped (duplicate)
await queue.enqueue('tasks', task, key); // Returns null
```

---

### 2. CheckpointManager

**Files:**
- `packages/orchestrator-core/src/checkpoint/checkpoint-manager.ts`
- `packages/orchestrator-core/src/database/checkpoint-repository.ts`

**Features:**
- Save/load checkpoints with continuation tokens
- Resume tasks from last checkpoint
- Automatic cleanup after completion
- Compression for large checkpoints

**Usage:**
```typescript
import { CheckpointManager } from '@ideamine/orchestrator-core/checkpoint';

const checkpointManager = new CheckpointManager(pool);

// Save checkpoint
await checkpointManager.saveCheckpoint(
  taskId,
  'step-2-complete',
  { progress: 0.5, results: [...] }
);

// Load checkpoint
const checkpoint = await checkpointManager.loadCheckpoint(taskId);
if (checkpoint) {
  console.log(`Resuming from: ${checkpoint.token}`);
  // checkpoint.data contains saved state
}

// Resume task with executor
const result = await checkpointManager.resumeTask(taskId, async (checkpoint) => {
  if (checkpoint?.token === 'step-2-complete') {
    return resumeFromStep2(checkpoint.data);
  }
  return executeFromStart();
});
```

**Agent Integration:**
```typescript
// In BaseAgent subclass
async execute(input: any): Promise<any> {
  // Check if resuming
  const checkpointToken = this.getCheckpointToken(input);
  const checkpointData = this.getCheckpointData(input);

  if (checkpointToken === 'step-2-complete') {
    return this.resumeFromStep2(checkpointData);
  }

  // Step 1
  const step1Result = await this.step1();
  await this.saveCheckpoint('step-1-complete', { step1Result });

  // Step 2
  const step2Result = await this.step2(step1Result);
  await this.saveCheckpoint('step-2-complete', { step1Result, step2Result });

  // Step 3 (final)
  return this.step3(step2Result);
}
```

---

### 3. Worker & WorkerPool

**Files:**
- `packages/orchestrator-core/src/worker/worker.ts`
- `packages/orchestrator-core/src/worker/worker-pool.ts`

**Worker Features:**
- Load checkpoint before execution
- Emit heartbeat every 60 seconds
- Save checkpoints during execution
- Execute agents/tools via registry
- Report metrics (cost, tokens, duration)

**Usage:**
```typescript
import { Worker, WorkerPool } from '@ideamine/orchestrator-core/worker';

// Define executor registry
const executorRegistry = {
  async executeAgent(target: string, input: any) {
    const AgentClass = agentRegistry.get(target);
    const agent = new AgentClass(config);

    // Set checkpoint callback
    if (input._checkpointCallback) {
      agent.setCheckpointCallback(input._checkpointCallback);
    }

    return agent.execute(input);
  },

  async executeTool(target: string, input: any) {
    const tool = toolRegistry.get(target);
    return tool.execute(input);
  },
};

// Create worker pool
const workerPool = new WorkerPool(pool, queue, executorRegistry, {
  concurrency: 4,
  consumerGroup: 'phase-workers',
  autoScale: true,
  minWorkers: 2,
  maxWorkers: 10,
});

await workerPool.start();

// Scale manually
await workerPool.scale(6);

// Auto-scale based on queue depth
await workerPool.autoScale();

// Graceful shutdown
await workerPool.stop();
```

**Heartbeat Flow:**
```
Worker starts task
  ↓
Set heartbeat interval (60s)
  ↓
Every 60s:
  - Update tasks.last_heartbeat_at (Postgres)
  - Store heartbeat:taskId in Redis (TTL: 5min)
  ↓
Task completes → Stop heartbeat
```

---

### 4. Scheduler

**File:** `packages/orchestrator-core/src/scheduler/scheduler.ts`

**Features:**
- Generate TaskSpecs from PhasePlan
- Split budgets evenly across agents
- Create database task records
- Enqueue to JobQueue
- Task sharding for batches

**Usage:**
```typescript
import { Scheduler } from '@ideamine/orchestrator-core/scheduler';

const scheduler = new Scheduler(pool, queue);

// Schedule phase
const phasePlan: PhasePlan = {
  phase: 'IDEATION',
  parallelism: 4,
  agents: ['StrategyAgent', 'CompetitiveAgent', 'TechStackAgent', 'PersonaAgent'],
  budgets: { tokens: 2000000, tools_minutes: 180 },
  timebox: 'PT3H',
  // ... other fields
};

const result = await scheduler.schedule(phasePlan, {
  run_id: 'run-123',
  phase_id: 'phase-456',
  phase: 'IDEATION',
  inputs: { idea: 'Build a todo app' },
  budgets: phasePlan.budgets,
  rubrics: {},
  timebox: 'PT3H',
});

console.log(`Scheduled ${result.totalTasks} tasks, enqueued ${result.enqueuedTasks}`);
```

**Task Sharding:**
```typescript
// Shard large task
const originalTask: TaskSpec = {
  id: 'task-123',
  phase: 'QA',
  type: 'agent',
  target: 'TestGeneratorAgent',
  input: {
    tests: [/* 1000 test cases */],
  },
  // ... other fields
};

const shards = scheduler.shardTask(originalTask, 100); // 100 tests per shard
console.log(`Created ${shards.length} shards`); // 10 shards
```

---

### 5. TimerService

**File:** `packages/orchestrator-core/src/timer/timer-service.ts`

**Features:**
- Schedule retries with exponential backoff
- Enforce phase timeboxes
- Persist timers to database (durable)
- Resume timers after restart
- Custom scheduled actions

**Usage:**
```typescript
import { TimerService, DEFAULT_RETRY_POLICY } from '@ideamine/orchestrator-core/timer';

const timerService = new TimerService(pool, queue);
await timerService.start();

// Schedule retry
const timerId = await timerService.scheduleRetry(
  taskSpec,
  2, // attempt 2
  DEFAULT_RETRY_POLICY // base: 1s, max: 5min, maxAttempts: 3
);
// Fires after: min(1000 * 2^2, 300000) = 4000ms

// Schedule phase timeout
const timeoutId = await timerService.scheduleTimeout(
  phaseId,
  3 * 60 * 60 * 1000 // 3 hours
);

// Cancel timer
await timerService.cancelTimer(timerId);

// Get stats
const stats = await timerService.getStats();
console.log(`${stats.pending} pending, next fire: ${stats.nextFireAt}`);

// Graceful shutdown
await timerService.stop();
```

**Retry Policy:**
```typescript
const customPolicy: RetryPolicy = {
  base: 2000, // 2 seconds
  maxMs: 600000, // 10 minutes
  maxAttempts: 5,
};

// Delay calculation: min(base * 2^attempt, maxMs)
// Attempt 0: 2s
// Attempt 1: 4s
// Attempt 2: 8s
// Attempt 3: 16s
// Attempt 4: 32s
// Attempt 5+: capped at 10min
```

---

## Database Schema

**Migration:** `migrations/009_execution_tables.sql`

**Tables:**
1. **tasks** - Task execution tracking
2. **checkpoints** - Checkpoint storage (UNIQUE per task)
3. **events** - Event log for audit trail
4. **timers** - Durable timer storage

**Views:**
- `active_tasks` - Running tasks with heartbeat status
- `task_stats_by_phase` - Aggregated metrics
- `pending_timers` - Upcoming timer fires

**Functions:**
- `cleanup_old_checkpoints(days)` - Delete old checkpoints
- `cleanup_old_events(days)` - Delete old events
- `cleanup_fired_timers(days)` - Delete fired timers

---

## Deployment Guide

### Prerequisites

1. **PostgreSQL** (existing)
2. **Redis** 6.0+ (Redis Streams support)

### Setup Steps

#### 1. Install Dependencies

```bash
cd packages/orchestrator-core
pnpm install
```

New dependencies added:
- `ioredis` - Redis client with Streams support
- `pino` - Structured logging

#### 2. Run Database Migration

```bash
psql -U postgres -d ideamine < migrations/009_execution_tables.sql
```

Verify tables:
```sql
\dt tasks checkpoints events timers
```

#### 3. Start Redis

**Option A: Docker**
```bash
docker run -d \
  --name ideamine-redis \
  -p 6379:6379 \
  redis:7-alpine
```

**Option B: Local**
```bash
redis-server --port 6379
```

**Verify:**
```bash
redis-cli ping
# PONG
```

#### 4. Configure Environment

```bash
# .env
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:pass@localhost:5432/ideamine

# Worker pool settings
WORKER_CONCURRENCY=4
WORKER_AUTO_SCALE=true
WORKER_MIN=2
WORKER_MAX=10

# Checkpoint settings
CHECKPOINT_TTL_DAYS=7

# Timer settings
TIMER_CHECK_INTERVAL_SECONDS=10
```

#### 5. Start Services

**Option A: Monolithic (all in one process)**
```typescript
import { Pool } from 'pg';
import { JobQueue, WorkerPool, TimerService, Scheduler } from '@ideamine/orchestrator-core';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const queue = new JobQueue();
await queue.init();

const scheduler = new Scheduler(pool, queue);
const workerPool = new WorkerPool(pool, queue, executorRegistry);
const timerService = new TimerService(pool, queue);

await Promise.all([
  workerPool.start(),
  timerService.start(),
]);

console.log('Execution Layer started');
```

**Option B: Microservices (separate processes)**

**Scheduler Service:**
```typescript
const scheduler = new Scheduler(pool, queue);
// Expose HTTP API for scheduling
app.post('/schedule', async (req, res) => {
  const result = await scheduler.schedule(req.body.plan, req.body.ctx);
  res.json(result);
});
```

**Worker Service:**
```typescript
const workerPool = new WorkerPool(pool, queue, executorRegistry, {
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '4'),
});
await workerPool.start();
```

**Timer Service:**
```typescript
const timerService = new TimerService(pool, queue);
await timerService.start();
```

---

## Monitoring

### Metrics to Track

```typescript
// Queue depth (for scaling)
const depth = await queue.getQueueDepth('tasks');
if (depth > 100) {
  await workerPool.scale(workerPool.getStats().workerCount + 2);
}

// Task statistics
const stats = await scheduler.getStats(phaseId);
console.log(`
  Total: ${stats.total}
  Completed: ${stats.completed}
  Failed: ${stats.failed}
  Running: ${stats.running}
  Avg Duration: ${stats.avgDurationMs}ms
  Total Cost: $${stats.totalCost}
`);

// Checkpoint stats
const ckptStats = await checkpointManager.getStats();
console.log(`
  Checkpoints: ${ckptStats.total}
  Total Size: ${(ckptStats.totalSizeBytes / 1024 / 1024).toFixed(2)} MB
  Avg Size: ${(ckptStats.avgSizeBytes / 1024).toFixed(2)} KB
`);

// Timer stats
const timerStats = await timerService.getStats();
console.log(`
  Pending: ${timerStats.pending}
  Next Fire: ${timerStats.nextFireAt}
`);
```

### Database Queries

**Active tasks:**
```sql
SELECT * FROM active_tasks
WHERE seconds_since_heartbeat > 120
ORDER BY running_duration_seconds DESC;
```

**Phase progress:**
```sql
SELECT * FROM task_stats_by_phase
WHERE phase_id = 'phase-123';
```

**Pending timers:**
```sql
SELECT * FROM pending_timers
WHERE seconds_until_fire < 60
ORDER BY fire_at ASC;
```

---

## Example: Complete Task Execution Flow

```typescript
// 1. Schedule phase
const phasePlan: PhasePlan = {
  phase: 'INTAKE',
  parallelism: 'sequential',
  agents: ['IntakeClassifierAgent', 'IntakeExpanderAgent', 'IntakeValidatorAgent'],
  budgets: { tokens: 700000, tools_minutes: 60 },
  timebox: 'PT1H',
  // ... other fields
};

const scheduleResult = await scheduler.schedule(phasePlan, {
  run_id: 'run-abc',
  phase_id: 'phase-xyz',
  phase: 'INTAKE',
  inputs: { idea: 'Build a distributed task queue' },
  budgets: phasePlan.budgets,
  rubrics: { ambiguity_max: 0.10 },
  timebox: 'PT1H',
});

// 2. Workers consume tasks
// Worker 1 picks up IntakeClassifierAgent task
const worker1 = workerPool.workers[0];

// 2a. Load checkpoint (none exists for new task)
const checkpoint = await checkpointManager.loadCheckpoint(taskId);
// checkpoint = null

// 2b. Start heartbeat
setInterval(() => emitHeartbeat(taskId), 60000);

// 2c. Execute agent
const agent = new IntakeClassifierAgent(config);
agent.setCheckpointCallback((token, data) => {
  checkpointManager.saveCheckpoint(taskId, token, data);
});

// Agent executes:
// - Step 1: Classify intent
await agent.classifyIntent(idea);
await saveCheckpoint('classify-complete', { intent: 'feature' });

// - Step 2: Extract entities
await agent.extractEntities(idea);
await saveCheckpoint('extract-complete', { intent, entities });

// - Step 3: Generate taxonomy
const result = await agent.generateTaxonomy(entities);

// 2d. Complete task
await taskRepository.complete(taskId, result, {
  duration_ms: 45000,
  tokens_used: 12000,
  cost_usd: 0.18,
});

// 2e. Delete checkpoint
await checkpointManager.deleteCheckpoint(taskId);

// 3. Task fails and retries
// If agent throws error:
try {
  await agent.execute(input);
} catch (error) {
  // Mark task as failed
  await taskRepository.fail(taskId, error.message, 0);

  // Schedule retry
  await timerService.scheduleRetry(taskSpec, 0, DEFAULT_RETRY_POLICY);
  // Fires after 1 second
}

// 4. Timer fires → re-enqueue task
// TimerService checks pending timers every 10s
// Finds retry timer that should fire
// Re-enqueues task to JobQueue
await queue.enqueue('tasks', { ...taskSpec, retries: 1 });

// 5. Worker picks up retry
// This time it succeeds!
```

---

## Checkpoint/Resume Example

**Scenario:** Long-running agent crashes after 30 minutes, resumes from checkpoint.

```typescript
// Initial execution (Worker 1)
class LongRunningAgent extends BaseAgent {
  async execute(input: any): Promise<any> {
    // Check if resuming
    const checkpoint = this.getCheckpointToken(input);

    if (checkpoint === 'phase-2-complete') {
      return this.resumeFromPhase2(this.getCheckpointData(input));
    }

    if (checkpoint === 'phase-3-complete') {
      return this.resumeFromPhase3(this.getCheckpointData(input));
    }

    // Phase 1: Data collection (10 minutes)
    const data = await this.collectData();
    await this.saveCheckpoint('phase-1-complete', { data });

    // Phase 2: Analysis (15 minutes)
    const analysis = await this.analyzeData(data);
    await this.saveCheckpoint('phase-2-complete', { data, analysis });

    // Phase 3: Synthesis (10 minutes)
    const synthesis = await this.synthesize(analysis);
    await this.saveCheckpoint('phase-3-complete', { data, analysis, synthesis });

    // CRASH HERE! Worker dies at minute 30

    // Phase 4: Final report (5 minutes)
    return this.generateReport(synthesis);
  }

  private async resumeFromPhase3(checkpointData: any): Promise<any> {
    console.log('Resuming from phase 3');
    const { synthesis } = checkpointData;

    // Skip phases 1-3, start at phase 4
    return this.generateReport(synthesis);
  }
}

// Resume flow:
// 1. Worker crashes → heartbeat stops
// 2. Supervisor detects stalled task (no heartbeat for 3 minutes)
// 3. New worker picks up task
// 4. Worker loads checkpoint: 'phase-3-complete'
// 5. Agent resumes from resumeFromPhase3()
// 6. Completes in 5 minutes instead of re-running all 40 minutes
```

---

## Production Considerations

### Scaling

**Horizontal scaling:**
- Run multiple worker pools in separate processes/containers
- All consume from same Redis Streams consumer group
- Load balanced automatically by Redis

**Vertical scaling:**
- Increase `WORKER_CONCURRENCY` per instance
- Monitor CPU/memory usage
- I/O-bound tasks: higher concurrency (10+)
- CPU-bound tasks: lower concurrency (2-4)

### High Availability

**Redis:**
- Use Redis Sentinel for automatic failover
- Or Redis Cluster for sharding
- Enable AOF persistence for durability

**Postgres:**
- Primary-replica setup
- Connection pooling (pg-pool)
- Read replicas for metrics queries

**Workers:**
- Run multiple worker pools across hosts
- If one dies, others continue processing
- Pending messages claimed after 5 minutes

### Security

**Redis:**
- Enable AUTH: `redis-cli CONFIG SET requirepass "strong-password"`
- Use TLS for network encryption
- Bind to localhost or private network

**Postgres:**
- Least-privilege grants (see migration comments)
- Encrypt connections (SSL)
- Row-level security for multi-tenancy

### Cost Optimization

**Checkpoints:**
- Clean up old checkpoints weekly: `SELECT cleanup_old_checkpoints(7);`
- Compress large checkpoints (>10KB)
- Use separate storage for large artifacts

**Events:**
- Archive to S3 after 30 days: `SELECT cleanup_old_events(30);`
- Use time-series database for metrics (InfluxDB, TimescaleDB)

**Timers:**
- Clean up fired timers: `SELECT cleanup_fired_timers(7);`

---

## Troubleshooting

### Queue not processing

**Check Redis connection:**
```bash
redis-cli ping
```

**Check queue depth:**
```typescript
const depth = await queue.getQueueDepth('tasks');
console.log(`Queue depth: ${depth}`);
```

**Check workers:**
```typescript
const stats = workerPool.getStats();
console.log(`Workers: ${stats.workerCount}, Running: ${stats.isRunning}`);
```

### Tasks stalling

**Check heartbeats:**
```sql
SELECT * FROM active_tasks
WHERE seconds_since_heartbeat > 180;
```

**Claim pending messages:**
```typescript
const claimed = await queue.claimPending('tasks', 'phase-workers', 'worker-1', 300000);
console.log(`Claimed ${claimed} pending messages`);
```

### Checkpoints not saving

**Check callback:**
```typescript
// In Worker
if (!input._checkpointCallback) {
  console.warn('No checkpoint callback set!');
}
```

**Check agent:**
```typescript
// In Agent
if (!this.checkpointCallback) {
  console.warn('Checkpoint callback not set!');
}
```

**Check database:**
```sql
SELECT * FROM checkpoints ORDER BY created_at DESC LIMIT 10;
```

### Timers not firing

**Check timer service:**
```typescript
const stats = await timerService.getStats();
console.log(`Pending: ${stats.pending}, Next: ${stats.nextFireAt}`);
```

**Check database:**
```sql
SELECT * FROM pending_timers;
```

**Force check:**
```typescript
// Manually trigger timer check
await timerService['checkTimers'](); // private method
```

---

## Next Steps

1. **Run Migration:** Apply `009_execution_tables.sql`
2. **Start Redis:** Docker or local instance
3. **Test Queue:** Run `queue.test.ts`
4. **Deploy Workers:** Start WorkerPool
5. **Monitor:** Set up dashboards (Grafana + Prometheus)
6. **Scale:** Tune concurrency based on load

**Progress:** Execution Layer complete! 54% of full spec implemented.

**Next Layer:** Resilience Layer (Week 7-8)
- Unsticker (detect and recover stalled tasks)
- Circuit breakers
- Graceful degradation
- Fallback strategies
