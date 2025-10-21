# IdeaMine Unified Implementation Specification (Part 2)
**Continuation of UNIFIED_IMPLEMENTATION_SPEC.md**

---

## Observability Layer (Week 9-10)

**Goal:** Full Run Ledger, metrics, provenance, OTEL tracing

### 5.1 Run Ledger (Immutable Timeline)

**Requirement:** orchestrator.txt:197-198, 77

**Files to Create:**

**packages/orchestrator-core/src/ledger/run-ledger.ts:**
```typescript
/**
 * Run Ledger - Immutable append-only timeline of everything
 * Spec: orchestrator.txt:197-198
 */

export interface LedgerEntry {
  id: string;
  run_id: string;
  timestamp: Date;
  type: 'task' | 'gate' | 'decision' | 'artifact' | 'cost' | 'signature';
  data: any;
  provenance: {
    who: string;      // agent/tool ID
    when: string;     // ISO8601
    tool_version?: string;
    inputs?: string[];  // artifact IDs that were inputs
  };
}

export class RunLedger {
  constructor(private db: any) {}

  async appendTaskExecution(
    runId: string,
    task: TaskSpec,
    result: any,
    cost: { tokens: number; tools_minutes: number; usd?: number }
  ): Promise<void> {
    await this.append({
      run_id: runId,
      type: 'task',
      data: {
        task_id: task.id,
        phase: task.phase,
        type: task.type,
        target: task.target,
        input: task.input,
        result,
        duration_ms: result.ms,
        cost,
      },
      provenance: {
        who: task.target,
        when: new Date().toISOString(),
        tool_version: result.tool_version,
      },
    });
  }

  async appendGateEvaluation(
    runId: string,
    phase: string,
    gateResult: { pass: boolean; reasons: string[]; evidence_pack_id: string; score: number }
  ): Promise<void> {
    await this.append({
      run_id: runId,
      type: 'gate',
      data: {
        phase,
        pass: gateResult.pass,
        reasons: gateResult.reasons,
        evidence_pack_id: gateResult.evidence_pack_id,
        score: gateResult.score,
      },
      provenance: {
        who: `gatekeeper-${phase}`,
        when: new Date().toISOString(),
      },
    });
  }

  async appendDecision(
    runId: string,
    phase: string,
    decision: { type: string; outcome: any; qav_summary?: any }
  ): Promise<void> {
    await this.append({
      run_id: runId,
      type: 'decision',
      data: {
        phase,
        decision_type: decision.type,
        outcome: decision.outcome,
        qav_summary: decision.qav_summary,
      },
      provenance: {
        who: 'orchestrator',
        when: new Date().toISOString(),
      },
    });
  }

  async appendArtifact(
    runId: string,
    artifact: { id: string; type: string; size: number; hash: string },
    provenance: { source: string; inputs: string[]; tool_version?: string }
  ): Promise<void> {
    await this.append({
      run_id: runId,
      type: 'artifact',
      data: artifact,
      provenance: {
        who: provenance.source,
        when: new Date().toISOString(),
        tool_version: provenance.tool_version,
        inputs: provenance.inputs,
      },
    });
  }

  async appendCost(
    runId: string,
    phase: string,
    cost: { tokens: number; tools_minutes: number; usd: number }
  ): Promise<void> {
    await this.append({
      run_id: runId,
      type: 'cost',
      data: { phase, ...cost },
      provenance: {
        who: 'budget-tracker',
        when: new Date().toISOString(),
      },
    });
  }

  async appendSignature(
    runId: string,
    artifact_id: string,
    signature: { algorithm: string; value: string; signer: string }
  ): Promise<void> {
    await this.append({
      run_id: runId,
      type: 'signature',
      data: { artifact_id, ...signature },
      provenance: {
        who: signature.signer,
        when: new Date().toISOString(),
      },
    });
  }

  private async append(entry: Omit<LedgerEntry, 'id' | 'timestamp'>): Promise<void> {
    await this.db.query(`
      INSERT INTO ledger (id, run_id, timestamp, type, data, provenance)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      crypto.randomUUID(),
      entry.run_id,
      new Date(),
      entry.type,
      JSON.stringify(entry.data),
      JSON.stringify(entry.provenance),
    ]);
  }

  async query(runId: string, options?: {
    type?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }): Promise<LedgerEntry[]> {
    let sql = `SELECT * FROM ledger WHERE run_id = $1`;
    const params: any[] = [runId];

    if (options?.type) {
      sql += ` AND type = $${params.length + 1}`;
      params.push(options.type);
    }

    if (options?.from) {
      sql += ` AND timestamp >= $${params.length + 1}`;
      params.push(options.from);
    }

    if (options?.to) {
      sql += ` AND timestamp <= $${params.length + 1}`;
      params.push(options.to);
    }

    sql += ` ORDER BY timestamp DESC`;

    if (options?.limit) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    const result = await this.db.query(sql, params);

    return result.rows.map(row => ({
      id: row.id,
      run_id: row.run_id,
      timestamp: row.timestamp,
      type: row.type,
      data: row.data,
      provenance: row.provenance,
    }));
  }
}
```

**Migration:**
```sql
-- Ledger table (immutable append-only)
CREATE TABLE IF NOT EXISTS ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('task', 'gate', 'decision', 'artifact', 'cost', 'signature')),
  data JSONB NOT NULL,
  provenance JSONB NOT NULL,  -- { who, when, tool_version, inputs }

  INDEX idx_ledger_run (run_id),
  INDEX idx_ledger_type (type),
  INDEX idx_ledger_timestamp (timestamp)
);
```

**Effort:** 2 days

---

### 5.2 Metrics Collection System

**Requirement:** orchestrator.txt:198, phase.txt:119-122

**Files to Create:**

**packages/orchestrator-core/src/metrics/metrics-collector.ts:**
```typescript
/**
 * Metrics Collector - Structured metrics for all phases
 * Spec: orchestrator.txt:198
 */

export interface PhaseMetrics {
  phase: string;
  run_id: string;
  // Duration metrics
  duration_ms: number;
  started_at: Date;
  completed_at: Date;
  // Gate metrics
  gate_pass: boolean;
  gate_score: number;
  gate_retries: number;
  // Agent metrics
  agents_count: number;
  agents_succeeded: number;
  agents_failed: number;
  // Resource metrics
  tokens_used: number;
  tools_minutes_used: number;
  cost_usd: number;
  // Quality metrics
  test_pass_percent?: number;
  coverage_percent?: number;
  unsupported_claims_count?: number;
  cves_count?: number;
}

export class MetricsCollector {
  private metrics: Map<string, PhaseMetrics> = new Map();

  startPhase(runId: string, phase: string): void {
    this.metrics.set(`${runId}-${phase}`, {
      phase,
      run_id: runId,
      duration_ms: 0,
      started_at: new Date(),
      completed_at: new Date(),
      gate_pass: false,
      gate_score: 0,
      gate_retries: 0,
      agents_count: 0,
      agents_succeeded: 0,
      agents_failed: 0,
      tokens_used: 0,
      tools_minutes_used: 0,
      cost_usd: 0,
    });
  }

  recordAgentResult(runId: string, phase: string, success: boolean): void {
    const key = `${runId}-${phase}`;
    const metrics = this.metrics.get(key);
    if (!metrics) return;

    metrics.agents_count++;
    if (success) {
      metrics.agents_succeeded++;
    } else {
      metrics.agents_failed++;
    }
  }

  recordResourceUsage(
    runId: string,
    phase: string,
    usage: { tokens: number; tools_minutes: number; cost_usd: number }
  ): void {
    const key = `${runId}-${phase}`;
    const metrics = this.metrics.get(key);
    if (!metrics) return;

    metrics.tokens_used += usage.tokens;
    metrics.tools_minutes_used += usage.tools_minutes;
    metrics.cost_usd += usage.cost_usd;
  }

  recordGateResult(
    runId: string,
    phase: string,
    result: { pass: boolean; score: number }
  ): void {
    const key = `${runId}-${phase}`;
    const metrics = this.metrics.get(key);
    if (!metrics) return;

    metrics.gate_pass = result.pass;
    metrics.gate_score = result.score;

    if (!result.pass) {
      metrics.gate_retries++;
    }
  }

  completePhase(runId: string, phase: string): PhaseMetrics {
    const key = `${runId}-${phase}`;
    const metrics = this.metrics.get(key);
    if (!metrics) throw new Error(`No metrics for ${key}`);

    metrics.completed_at = new Date();
    metrics.duration_ms = metrics.completed_at.getTime() - metrics.started_at.getTime();

    // Persist to DB
    this.persistMetrics(metrics);

    return metrics;
  }

  private async persistMetrics(metrics: PhaseMetrics): Promise<void> {
    await this.db.query(`
      INSERT INTO phase_metrics (run_id, phase, data, created_at)
      VALUES ($1, $2, $3, NOW())
    `, [metrics.run_id, metrics.phase, JSON.stringify(metrics)]);
  }

  async getAggregateMetrics(runId: string): Promise<{
    total_duration_ms: number;
    total_cost_usd: number;
    total_tokens: number;
    phases_completed: number;
    phases_failed: number;
    gate_pass_rate: number;
  }> {
    const result = await this.db.query(`
      SELECT
        SUM((data->>'duration_ms')::int) as total_duration_ms,
        SUM((data->>'cost_usd')::float) as total_cost_usd,
        SUM((data->>'tokens_used')::int) as total_tokens,
        COUNT(CASE WHEN (data->>'gate_pass')::boolean = true THEN 1 END) as phases_completed,
        COUNT(CASE WHEN (data->>'gate_pass')::boolean = false THEN 1 END) as phases_failed
      FROM phase_metrics
      WHERE run_id = $1
    `, [runId]);

    const row = result.rows[0];

    return {
      total_duration_ms: parseInt(row.total_duration_ms) || 0,
      total_cost_usd: parseFloat(row.total_cost_usd) || 0,
      total_tokens: parseInt(row.total_tokens) || 0,
      phases_completed: parseInt(row.phases_completed) || 0,
      phases_failed: parseInt(row.phases_failed) || 0,
      gate_pass_rate: row.phases_completed / (row.phases_completed + row.phases_failed),
    };
  }

  async getP95Latency(phase: string, timeWindowHours: number = 24): Promise<number> {
    const since = new Date(Date.now() - timeWindowHours * 3600000);

    const result = await this.db.query(`
      SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (data->>'duration_ms')::int) as p95
      FROM phase_metrics
      WHERE phase = $1 AND created_at > $2
    `, [phase, since]);

    return parseInt(result.rows[0].p95) || 0;
  }
}
```

**Migration:**
```sql
CREATE TABLE IF NOT EXISTS phase_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  data JSONB NOT NULL,  -- PhaseMetrics object
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_phase_metrics_run (run_id),
  INDEX idx_phase_metrics_phase (phase),
  INDEX idx_phase_metrics_created (created_at)
);
```

**Effort:** 2 days

---

### 5.3 Provenance Tracking

**Requirement:** orchestrator.txt:207

**Files to Modify:**

**packages/orchestrator-core/src/database/artifact-repository.ts:**
```typescript
/**
 * Enhanced Artifact Repository with Provenance
 * Spec: orchestrator.txt:207
 */

export interface ArtifactProvenance {
  source: string;        // agent/tool that produced it
  created_at: Date;
  inputs: string[];      // artifact IDs that were inputs
  tool_version?: string; // e.g., "semgrep@1.45.0"
  cost: {
    tokens: number;
    tools_minutes: number;
  };
}

export class ArtifactRepository {
  async create(
    artifact: any,
    provenance: ArtifactProvenance
  ): Promise<void> {
    await this.db.query(`
      INSERT INTO artifacts (id, run_id, type, content, size, hash, provenance, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      artifact.id,
      artifact.run_id,
      artifact.type,
      JSON.stringify(artifact.content),
      artifact.size,
      artifact.hash,
      JSON.stringify(provenance),
      new Date(),
    ]);
  }

  async getLineage(artifactId: string): Promise<any[]> {
    // Recursively get all ancestor artifacts
    const result = await this.db.query(`
      WITH RECURSIVE lineage AS (
        -- Base case: the artifact itself
        SELECT id, provenance
        FROM artifacts
        WHERE id = $1

        UNION

        -- Recursive case: input artifacts
        SELECT a.id, a.provenance
        FROM artifacts a
        INNER JOIN lineage l ON a.id = ANY((l.provenance->>'inputs')::jsonb)
      )
      SELECT * FROM lineage
    `, [artifactId]);

    return result.rows;
  }
}
```

**Migration:**
```sql
-- Add provenance column to artifacts table
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS provenance JSONB;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS hash VARCHAR(64);

CREATE INDEX idx_artifacts_provenance_source ON artifacts ((provenance->>'source'));
```

**Effort:** 1 day

---

### 5.4 OpenTelemetry Integration

**Requirement:** orchestrator.txt:199, phase.txt:129

**Files to Create:**

**packages/orchestrator-core/src/tracing/otel.ts:**
```typescript
/**
 * OpenTelemetry Integration
 * Spec: orchestrator.txt:199, phase.txt:129
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { trace, Span, SpanStatusCode } from '@opentelemetry/api';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

export class OTELTracer {
  private tracer: any;

  constructor() {
    const provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'ideamine-orchestrator',
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
      }),
    });

    const exporter = new JaegerExporter({
      endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    });

    provider.addSpanProcessor(new BatchSpanProcessor(exporter));
    provider.register();

    this.tracer = trace.getTracer('ideamine-orchestrator');
  }

  startRunSpan(runId: string): Span {
    return this.tracer.startSpan('run', {
      attributes: {
        'run.id': runId,
      },
    });
  }

  startPhaseSpan(runId: string, phase: string, parentSpan: Span): Span {
    return this.tracer.startSpan(`phase.${phase}`, {
      parent: parentSpan,
      attributes: {
        'run.id': runId,
        'phase': phase,
      },
    });
  }

  startTaskSpan(
    runId: string,
    phase: string,
    taskId: string,
    type: 'agent' | 'tool',
    target: string,
    parentSpan: Span
  ): Span {
    return this.tracer.startSpan(`task.${type}`, {
      parent: parentSpan,
      attributes: {
        'run.id': runId,
        'phase': phase,
        'task.id': taskId,
        'task.type': type,
        'task.target': target,
      },
    });
  }

  startToolSpan(
    toolId: string,
    version: string,
    parentSpan: Span
  ): Span {
    return this.tracer.startSpan(`tool`, {
      parent: parentSpan,
      attributes: {
        'tool.id': toolId,
        'tool.version': version,
      },
    });
  }

  recordSpanEvent(span: Span, event: string, attributes?: Record<string, any>): void {
    span.addEvent(event, attributes);
  }

  endSpan(span: Span, success: boolean, error?: Error): void {
    if (success) {
      span.setStatus({ code: SpanStatusCode.OK });
    } else {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
      if (error) {
        span.recordException(error);
      }
    }
    span.end();
  }
}
```

**Files to Modify:**

**packages/orchestrator-core/src/enhanced-orchestrator.ts:**
```typescript
import { OTELTracer } from './tracing/otel';

export class EnhancedOrchestrator {
  private otel: OTELTracer;

  async execute(idea: any): Promise<any> {
    const runSpan = this.otel.startRunSpan(runId);

    try {
      for (const phase of phases) {
        const phaseSpan = this.otel.startPhaseSpan(runId, phase.phaseId, runSpan);

        try {
          const result = await this.executePhase(phase, runContext);
          this.otel.endSpan(phaseSpan, true);
        } catch (error) {
          this.otel.endSpan(phaseSpan, false, error);
          throw error;
        }
      }

      this.otel.endSpan(runSpan, true);
    } catch (error) {
      this.otel.endSpan(runSpan, false, error);
      throw error;
    }
  }
}
```

**Effort:** 2 days

---

### 5.5 Evidence Pack Generalization

**Requirement:** orchestrator.txt:114, phase.txt:18, 49

**Already Implemented in Foundation Layer (Section 1.2)**

Evidence Pack schema was created as generalized for all phases. Just need to ensure all Phase Coordinators use it.

**Files to Modify:**

All phase coordinators should build Evidence Packs:

```typescript
// Example for any phase
const evidencePack: EvidencePack = {
  artifacts: phaseResult.artifacts.map(a => a.id),
  guard_reports: guardResults,
  qav_summary: {
    questions_count: questions.length,
    answered_count: answers.filter(a => a.answer !== 'UNKNOWN').length,
    validated_count: validations.filter(v => v.accepted).length,
    grounding_score: avgGroundingScore,
    assumptions: refineryResult.assumptions,
  },
  kmap_refs: refineryResult.kmap_refs,
  metrics: {
    duration_ms: Date.now() - startTime,
    tokens_used: budgetTracker.getUsage(phase).tokens,
    tools_minutes: budgetTracker.getUsage(phase).tools_minutes,
    cost_usd: calculateCost(budgetTracker.getUsage(phase)),
  },
};
```

**Effort:** 1 day (update all phase coordinators)

---

**Observability Layer Total: 8 days**

---

## Production Hardening (Week 11)

**Goal:** Dashboards, testing, RBAC, versioning, DAG execution, fan-out/fan-in

### 6.1 DAG Execution Engine

**Requirement:** orchestrator.txt:20, workflow-state.ts dependencies

**Files to Create:**

**packages/orchestrator-core/src/dag/dag-executor.ts:**
```typescript
/**
 * DAG Executor - Execute phases in topological order with parallelism
 * Spec: orchestrator.txt:20 (phase connectivity, dependency DAG)
 */

import { WorkflowStateMachine } from '../workflow-state';
import { PhaseConfig } from '../types';

export class DAGExecutor {
  /**
   * Build dependency graph
   */
  private buildGraph(phases: PhaseConfig[]): Map<string, PhaseConfig> {
    const graph = new Map<string, PhaseConfig>();

    for (const phase of phases) {
      graph.set(phase.phaseId, phase);
    }

    return graph;
  }

  /**
   * Topological sort to get execution order
   */
  private topologicalSort(phases: PhaseConfig[]): string[][] {
    const graph = this.buildGraph(phases);
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Initialize
    for (const phase of phases) {
      inDegree.set(phase.phaseId, 0);
      adjList.set(phase.phaseId, []);
    }

    // Build adjacency list and in-degrees
    for (const phase of phases) {
      for (const dep of phase.dependencies || []) {
        adjList.get(dep)!.push(phase.phaseId);
        inDegree.set(phase.phaseId, (inDegree.get(phase.phaseId) || 0) + 1);
      }
    }

    // BFS to find levels (phases that can run in parallel)
    const levels: string[][] = [];
    const queue: string[] = [];

    // Start with phases that have no dependencies
    for (const [phaseId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(phaseId);
      }
    }

    while (queue.length > 0) {
      const levelSize = queue.length;
      const currentLevel: string[] = [];

      for (let i = 0; i < levelSize; i++) {
        const phaseId = queue.shift()!;
        currentLevel.push(phaseId);

        // Reduce in-degree for dependent phases
        for (const dependent of adjList.get(phaseId) || []) {
          const newDegree = (inDegree.get(dependent) || 0) - 1;
          inDegree.set(dependent, newDegree);

          if (newDegree === 0) {
            queue.push(dependent);
          }
        }
      }

      levels.push(currentLevel);
    }

    return levels;
  }

  /**
   * Execute phases in DAG order
   * Phases in same level run in parallel (e.g., Security + Story Loop)
   */
  async execute(
    phases: PhaseConfig[],
    executor: (phase: PhaseConfig) => Promise<any>
  ): Promise<void> {
    const levels = this.topologicalSort(phases);

    console.log('Execution plan:', levels);
    // Example: [
    //   ['intake'],
    //   ['ideation'],
    //   ['critique'],
    //   ['prd'],
    //   ['bizdev'],
    //   ['architecture'],
    //   ['build'],
    //   ['security', 'story-loop'],  // PARALLEL!
    //   ['qa'],
    //   ['aesthetic'],
    //   ['release'],
    //   ['beta']
    // ]

    for (const level of levels) {
      // Execute all phases in this level in parallel
      await Promise.all(
        level.map(phaseId => {
          const phase = phases.find(p => p.phaseId === phaseId)!;
          return executor(phase);
        })
      );
    }
  }
}
```

**Files to Modify:**

**packages/orchestrator-core/src/enhanced-orchestrator.ts:**
```typescript
import { DAGExecutor } from './dag/dag-executor';

export class EnhancedOrchestrator {
  private dagExecutor: DAGExecutor;

  async execute(idea: any): Promise<any> {
    const runPlan = await this.runPlanner.createRunPlan(idea);
    const phases = WorkflowStateMachine.PHASES;

    // Execute phases in DAG order
    await this.dagExecutor.execute(phases, async (phase) => {
      return this.executePhase(phase, runContext);
    });
  }
}
```

**Effort:** 2 days

---

### 6.2 Fan-Out/Fan-In Pattern

**Requirement:** phase.txt:56-61, 160, 172

**Files to Create:**

**packages/orchestrator-core/src/runners/fanout.ts:**
```typescript
/**
 * Fan-Out/Fan-In Runner - Parallel agent execution with deterministic aggregation
 * Spec: phase.txt:56-61, 160
 */

import { TaskSpec } from '@ideamine/schemas/phase';

export interface FanOutConfig {
  parallelism: 'sequential' | 'partial' | 'iterative' | number;
  agents: string[];
  aggregation_strategy: 'merge' | 'concat' | 'vote' | 'custom';
}

export class FanOutRunner {
  /**
   * Fan-out: run agents in parallel based on parallelism config
   */
  async fanOut(
    config: FanOutConfig,
    input: any,
    executor: (agent: string, input: any) => Promise<any>
  ): Promise<any[]> {
    if (config.parallelism === 'sequential') {
      // Run one by one
      const results = [];
      for (const agent of config.agents) {
        const result = await executor(agent, input);
        results.push(result);
      }
      return results;
    } else if (typeof config.parallelism === 'number') {
      // Run exactly N in parallel
      const batchSize = config.parallelism;
      const results = [];

      for (let i = 0; i < config.agents.length; i += batchSize) {
        const batch = config.agents.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(agent => executor(agent, input))
        );
        results.push(...batchResults);
      }

      return results;
    } else if (config.parallelism === 'partial') {
      // Run some in parallel, some sequential (needs dependency graph)
      // For now, run all in parallel
      return Promise.all(
        config.agents.map(agent => executor(agent, input))
      );
    } else if (config.parallelism === 'iterative') {
      // Run in loop pattern (Story Loop use case)
      return this.runIterative(config.agents, input, executor);
    }

    // Default: all parallel
    return Promise.all(
      config.agents.map(agent => executor(agent, input))
    );
  }

  /**
   * Fan-in: deterministic aggregation
   * Spec: phase.txt:59 (schema-constrained, deterministic)
   */
  async fanIn(
    results: any[],
    strategy: 'merge' | 'concat' | 'vote' | 'custom',
    schema?: any
  ): Promise<any> {
    if (strategy === 'merge') {
      // Merge objects with conflict resolution
      return this.mergeResults(results, 'latest-wins');
    } else if (strategy === 'concat') {
      // Concatenate arrays
      return results.flat();
    } else if (strategy === 'vote') {
      // Vote/consensus
      return this.voteResults(results);
    }

    // Default: return all results
    return results;
  }

  private mergeResults(results: any[], conflictResolution: 'latest-wins' | 'consensus'): any {
    const merged: any = {};

    for (const result of results) {
      for (const [key, value] of Object.entries(result)) {
        if (conflictResolution === 'latest-wins') {
          merged[key] = value;
        } else {
          // Consensus: only merge if all agree
          if (!merged[key]) {
            merged[key] = value;
          } else if (JSON.stringify(merged[key]) !== JSON.stringify(value)) {
            // Conflict - keep array of options
            if (!Array.isArray(merged[key])) {
              merged[key] = [merged[key]];
            }
            merged[key].push(value);
          }
        }
      }
    }

    // Ensure deterministic JSON (sort keys)
    return this.sortKeys(merged);
  }

  private sortKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortKeys(item));
    } else if (typeof obj === 'object' && obj !== null) {
      const sorted: any = {};
      for (const key of Object.keys(obj).sort()) {
        sorted[key] = this.sortKeys(obj[key]);
      }
      return sorted;
    }
    return obj;
  }

  private voteResults(results: any[]): any {
    // Simple majority vote
    const votes: Map<string, number> = new Map();

    for (const result of results) {
      const key = JSON.stringify(result);
      votes.set(key, (votes.get(key) || 0) + 1);
    }

    // Find max votes
    let maxVotes = 0;
    let winner = null;

    for (const [result, count] of votes.entries()) {
      if (count > maxVotes) {
        maxVotes = count;
        winner = result;
      }
    }

    return winner ? JSON.parse(winner) : results[0];
  }

  private async runIterative(
    agents: string[],
    input: any,
    executor: (agent: string, input: any) => Promise<any>
  ): Promise<any[]> {
    // Story Loop pattern: iterate until condition met
    const results = [];
    let iteration = 0;
    let continueLoop = true;

    while (continueLoop && iteration < 100) {  // max 100 iterations
      for (const agent of agents) {
        const result = await executor(agent, { ...input, iteration });
        results.push(result);

        // Check if loop should continue
        if (result.done) {
          continueLoop = false;
          break;
        }
      }
      iteration++;
    }

    return results;
  }
}
```

**Files to Modify:**

**packages/orchestrator-core/src/base/enhanced-phase-coordinator.ts:**
```typescript
import { FanOutRunner } from '../runners/fanout';

export class EnhancedPhaseCoordinator {
  private fanOutRunner: FanOutRunner;

  async execute(ctx: PhaseContext): Promise<PhaseResult> {
    const plan = await derivePhasePlan(ctx.phase, ctx);

    // Fan-out
    const results = await this.fanOutRunner.fanOut(
      {
        parallelism: plan.parallelism,
        agents: plan.agents,
        aggregation_strategy: 'merge',
      },
      ctx.inputs,
      (agent, input) => this.executeAgent(agent, input)
    );

    // Fan-in (deterministic aggregation)
    const draft = await this.fanOutRunner.fanIn(
      results,
      'merge',  // strategy from phase config
      phaseArtifactSchema  // schema for validation
    );

    // ... Q/A/V, guards, gate
  }
}
```

**Effort:** 2 days

---

### 6.3 Loop-Until-Pass Gate Pattern

**Requirement:** orchestrator.txt:239 (`if (!gate.pass) { await autoFix(); continue; }`)

**Files to Modify:**

**packages/orchestrator-core/src/enhanced-orchestrator.ts:**
```typescript
/**
 * Loop-Until-Pass Gate Pattern
 * Spec: orchestrator.txt:236-245
 */

export class EnhancedOrchestrator {
  async executePhase(phase: PhaseConfig, runContext: any): Promise<any> {
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      const pc = await this.spawnPhaseCoordinator(phase, runContext);
      const result = await pc.execute();

      // Evaluate gate
      const gate = await this.evaluateGate(phase.phaseId, result.evidence);

      if (gate.pass) {
        // Gate passed - advance to next phase
        await this.persistPhaseArtifacts(runContext.run_id, phase.phaseId, result.artifacts);
        await this.advanceState(runContext.run_id, phase.phaseId);
        return result;
      } else {
        // Gate failed - auto-fix and retry
        console.log(`Gate failed for ${phase.phaseId}, attempting auto-fix (attempt ${attempts + 1}/${maxAttempts})`);

        await this.autoFix(pc, gate.issues, runContext);
        attempts++;

        // Re-evaluate gate after fixes (loop continues)
      }
    }

    throw new Error(`Gate failed after ${maxAttempts} attempts for phase ${phase.phaseId}`);
  }

  private async autoFix(
    pc: PhaseCoordinator,
    issues: string[],
    runContext: any
  ): Promise<void> {
    // Invoke Fix agents based on issues
    for (const issue of issues) {
      if (issue.includes('grounding')) {
        // Run Q/A/V again with stricter thresholds
        await pc.runQAVLoop(pc.getDraft(), runContext, { strictMode: true });
      } else if (issue.includes('coverage')) {
        // Re-run missing agents
        const missingAgents = this.identifyMissingAgents(issue);
        await pc.runAgents(missingAgents, runContext);
      } else if (issue.includes('security')) {
        // Re-run security scans
        await pc.runSecurityScans(runContext);
      }
    }
  }
}
```

**Effort:** 1 day

---

### 6.4 Release Dossier Compilation

**Requirement:** orchestrator.txt:248-249, 281

**Files to Create:**

**packages/orchestrator-core/src/dossier/release-dossier.ts:**
```typescript
/**
 * Release Dossier Compiler
 * Spec: orchestrator.txt:281 (PRD, RTM, API spec, tests, coverage, security pack, etc.)
 */

export interface ReleaseDossier {
  run_id: string;
  version: string;
  created_at: Date;

  // Product artifacts
  prd: any;
  rtm: any;  // Requirements Traceability Matrix
  api_spec: any;  // OpenAPI

  // Code artifacts
  repository_url: string;
  commit_sha: string;
  test_reports: any[];
  coverage_report: any;

  // Security artifacts
  security_pack: any;
  sbom: any;  // Software Bill of Materials
  signatures: any[];
  vulnerability_scans: any[];

  // Quality artifacts
  performance_reports: any[];
  accessibility_reports: any[];
  release_notes: string;

  // Deployment artifacts
  deployment_plan: any;
  rollback_plan: any;
  canary_rules: any;
}

export class ReleaseDossierCompiler {
  async compile(runId: string): Promise<ReleaseDossier> {
    // Gather artifacts from all phases
    const artifacts = await this.gatherArtifacts(runId);

    return {
      run_id: runId,
      version: await this.deriveVersion(runId),
      created_at: new Date(),

      prd: artifacts.find(a => a.type === 'PRD'),
      rtm: artifacts.find(a => a.type === 'RTM'),
      api_spec: artifacts.find(a => a.type === 'OpenAPI'),

      repository_url: artifacts.find(a => a.type === 'RepoManifest')?.url,
      commit_sha: artifacts.find(a => a.type === 'CommitSHA')?.sha,
      test_reports: artifacts.filter(a => a.type === 'TestReport'),
      coverage_report: artifacts.find(a => a.type === 'CoverageReport'),

      security_pack: artifacts.find(a => a.type === 'SecurityPack'),
      sbom: artifacts.find(a => a.type === 'SBOM'),
      signatures: artifacts.filter(a => a.type === 'Signature'),
      vulnerability_scans: artifacts.filter(a => a.type === 'VulnerabilityScan'),

      performance_reports: artifacts.filter(a => a.type === 'PerfReport'),
      accessibility_reports: artifacts.filter(a => a.type === 'A11yAudit'),
      release_notes: artifacts.find(a => a.type === 'ReleaseNotes')?.content,

      deployment_plan: artifacts.find(a => a.type === 'DeploymentPlan'),
      rollback_plan: artifacts.find(a => a.type === 'RollbackPlan'),
      canary_rules: artifacts.find(a => a.type === 'CanaryRules'),
    };
  }

  private async gatherArtifacts(runId: string): Promise<any[]> {
    const result = await this.db.query(`
      SELECT * FROM artifacts WHERE run_id = $1 ORDER BY created_at ASC
    `, [runId]);

    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      ...row.content,
    }));
  }

  private async deriveVersion(runId: string): Promise<string> {
    // Semantic versioning based on changes
    return '1.0.0';  // placeholder
  }

  async exportDossier(dossier: ReleaseDossier, format: 'json' | 'pdf' | 'html'): Promise<Buffer> {
    if (format === 'json') {
      return Buffer.from(JSON.stringify(dossier, null, 2));
    } else if (format === 'pdf') {
      // Generate PDF
      return this.generatePDF(dossier);
    } else {
      // Generate HTML
      return this.generateHTML(dossier);
    }
  }
}
```

**Effort:** 2 days

---

### 6.5 Testing Strategy

**Requirement:** phase.txt:197-202 (Unit, Integration, Soak, Chaos)

**Files to Create:**

**packages/orchestrator-core/src/__tests__/acceptance/acceptance-tests.ts:**
```typescript
/**
 * Acceptance Tests - 10 criteria from phase.txt:299-351
 */

describe('Phase Coordinator Acceptance Tests', () => {
  // 16.2: Event sequence
  test('PhaseCoordinator emits expected event sequence', async () => {
    const events: string[] = [];
    const eventBus = mockEventBus((event) => events.push(event.type));

    const pc = new PhaseCoordinator({ eventBus });
    await pc.execute(demoContext);

    expect(events).toEqual([
      'phase.started',
      'phase.progress',
      'phase.ready',
      'phase.gate.passed',
    ]);
  });

  // 16.3: Checkpoint resume
  test('Worker restarts and resumes from checkpoint', async () => {
    const checkpointManager = new CheckpointManager(db);

    // Start task
    const worker = new Worker('worker-1', checkpointManager);
    const taskPromise = worker.runTask(longRunningTask);

    // Simulate crash after checkpoint
    await sleep(2000);
    const checkpoint = await checkpointManager.loadCheckpoint(longRunningTask.id);
    expect(checkpoint).toBeTruthy();

    // Kill worker
    worker.kill();

    // Resume with new worker
    const worker2 = new Worker('worker-2', checkpointManager);
    const result = await worker2.runTask(longRunningTask);

    expect(result.ok).toBe(true);
    expect(result.resumedFrom).toBe(checkpoint.token);
  });

  // 16.4: Unsticker handles stalls
  test('Unsticker changes strategy when task stalls', async () => {
    const supervisor = new Supervisor();
    const taskId = 'stalled-task';

    // Simulate stall (no heartbeat for 3 intervals)
    await sleep(180000);  // 3 minutes

    const stalledEvent = await waitForEvent('phase.stalled');
    expect(stalledEvent.payload.task_id).toBe(taskId);

    // Verify unsticker was triggered
    const retryEvent = await waitForEvent('task.retry');
    expect(retryEvent.payload.strategy).toBe('smaller-batch');
  });

  // 16.5: Gate blocks on failures
  test('Failing guard blocks gate advancement', async () => {
    const draft = { contradictions: 5 };  // violates contradictions_max: 0

    const guardReports = await runGuards(draft, rubrics);
    const gateResult = await gatekeeper('prd', { draft, guardReports });

    expect(gateResult.pass).toBe(false);
    expect(gateResult.reasons).toContain('contradictions_max exceeded');
  });

  // 16.6: Q/A/V produces bindings and kmap delta
  test('Q/A/V produces accepted bindings and kmap.delta event', async () => {
    const { questions, answers, validations } = await runQAVLoop(draft, ctx);

    const accepted = validations.filter(v => v.accepted);
    expect(accepted.length).toBeGreaterThan(0);

    const kmapEvent = await waitForEvent('kmap.delta.created');
    expect(kmapEvent.payload.frame_ids.length).toBeGreaterThan(0);
  });

  // 16.7: Config changes agents without code edits
  test('Swapping phase config changes agents dynamically', async () => {
    const ideationConfig = await loadPhaseConfig('ideation');
    expect(ideationConfig.agents).toEqual([
      'StrategyAgent',
      'CompetitiveAgent',
      'TechStackAgent',
      'PersonaAgent',
    ]);

    const prdConfig = await loadPhaseConfig('prd');
    expect(prdConfig.agents).toEqual([
      'StoryCutterAgent',
      'PRDWriterAgent',
      'UXFlowAgent',
      'NFRsAgent',
      'TraceMatrixAgent',
    ]);

    // No code changes required - just YAML
  });

  // 16.8: Dashboards update live
  test('Running demo phase updates dashboards', async () => {
    // (requires dashboard implementation)
  });

  // 16.9: CI produces artifacts
  test('demo:intake produces IdeaSpec + EvidencePack', async () => {
    const result = await runPhase('intake', demoInput);

    expect(result.artifacts).toContainEqual(
      expect.objectContaining({ type: 'IdeaSpec' })
    );
    expect(result.evidence_pack).toBeDefined();
    expect(result.evidence_pack.artifacts.length).toBeGreaterThan(0);
  });

  // 16.10: End-to-end no human input
  test('Intake→Ideation completes autonomously', async () => {
    const run = await orchestrator.execute({ idea: 'Build a todo app' });

    // Should complete Intake and Ideation without user prompts
    expect(run.phases_completed).toContain('intake');
    expect(run.phases_completed).toContain('ideation');
    expect(run.user_prompts_count).toBe(0);
  });
});

// Soak tests (24-48h)
describe('Soak Tests', () => {
  test('24h long-run with induced stalls', async () => {
    // Run for 24 hours, inject stalls every 2 hours
    // Verify resume/checkpoints work
  }, 86400000);  // 24h timeout
});

// Chaos tests
describe('Chaos Tests', () => {
  test('Random container kills during execution', async () => {
    // Kill random workers during run
    // Verify work continues and completes
  });

  test('Network cuts', async () => {
    // Simulate network failures
    // Verify retries and recovery
  });

  test('Tool registry outages', async () => {
    // Simulate tool registry down
    // Verify fallback to cached tools
  });
});
```

**Effort:** 3 days (write tests) + ongoing (run soak/chaos tests)

---

**Production Hardening Total: 9 days**

---

## Complete Database Schema

**Migration File:** `migrations/010_complete_schema.sql`

```sql
-- ====================
-- COMPLETE SCHEMA
-- ====================

-- 1. Runs table (already exists, enhance)
ALTER TABLE runs ADD COLUMN IF NOT EXISTS version VARCHAR(20) DEFAULT '1.0.0';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS plan_hash VARCHAR(64);

-- 2. Phases table
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

-- 3. Tasks table
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

-- 4. Checkpoints table
CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  token VARCHAR(100) NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(task_id)
);
CREATE INDEX idx_checkpoints_task ON checkpoints(task_id);

-- 5. Events table
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

-- 6. Timers table
CREATE TABLE IF NOT EXISTS timers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(100) NOT NULL UNIQUE,
  fire_at TIMESTAMP NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('retry', 'timeout')),
  payload JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_timers_fire_at ON timers(fire_at);

-- 7. Assumptions table
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

-- 8. Evidence packs table
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

-- 9. Ledger table (immutable)
CREATE TABLE IF NOT EXISTS ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  type VARCHAR(20) NOT NULL,
  data JSONB NOT NULL,
  provenance JSONB NOT NULL,
  CHECK (type IN ('task', 'gate', 'decision', 'artifact', 'cost', 'signature'))
);
CREATE INDEX idx_ledger_run ON ledger(run_id);
CREATE INDEX idx_ledger_type ON ledger(type);
CREATE INDEX idx_ledger_timestamp ON ledger(timestamp);

-- 10. Phase metrics table
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

-- 11. Artifacts table (enhance with provenance)
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS provenance JSONB;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_artifacts_provenance_source ON artifacts ((provenance->>'source'));

-- 12. Waivers table (enhanced)
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

-- 13. Release dossiers table
CREATE TABLE IF NOT EXISTS release_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE UNIQUE,
  version VARCHAR(20) NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_dossiers_run ON release_dossiers(run_id);
```

---

## Complete File Structure

```
ideamine/
├── config/                           # Phase YAML configs
│   ├── intake.yaml
│   ├── ideation.yaml
│   ├── critique.yaml
│   ├── prd.yaml
│   ├── bizdev.yaml
│   ├── architecture.yaml
│   ├── build.yaml
│   ├── security.yaml
│   ├── story-loop.yaml
│   ├── qa.yaml
│   ├── aesthetic.yaml
│   ├── release.yaml
│   └── beta.yaml
│
├── packages/
│   ├── schemas/
│   │   └── src/
│   │       ├── phase/
│   │       │   ├── phase-context.ts      # PhaseContext JSON Schema
│   │       │   ├── task-spec.ts          # TaskSpec JSON Schema
│   │       │   └── evidence-pack.ts      # EvidencePack JSON Schema
│   │       └── orchestrator/
│   │           └── run-plan.ts           # RunPlan + PhasePlan
│   │
│   ├── event-schemas/
│   │   └── src/
│   │       └── phase-events.ts           # 7 phase events
│   │
│   ├── agents/
│   │   └── src/
│   │       ├── qav/                      # Q/A/V Triad
│   │       │   ├── question-agent.ts
│   │       │   ├── answer-agent.ts
│   │       │   ├── question-validator.ts
│   │       │   └── index.ts
│   │       ├── config/
│   │       │   └── loader.ts             # Enhanced config loader
│   │       └── [existing agent folders]
│   │
│   └── orchestrator-core/
│       └── src/
│           ├── planning/
│           │   └── run-planner.ts        # Run Plan generator
│           ├── queue/
│           │   └── queue.ts              # Redis Streams queue
│           ├── checkpoint/
│           │   ├── checkpoint-manager.ts
│           │   └── checkpoint-repository.ts
│           ├── worker/
│           │   ├── worker.ts             # Worker with heartbeats
│           │   └── worker-pool.ts
│           ├── scheduler/
│           │   └── scheduler.ts          # TaskSpec scheduler
│           ├── timer/
│           │   └── timer-service.ts      # Durable timers
│           ├── budget/
│           │   └── budget-tracker.ts     # Budget enforcement
│           ├── runners/
│           │   ├── fanout.ts             # Fan-out/fan-in
│           │   └── heartbeat.ts          # Heartbeat monitor
│           ├── heal/
│           │   ├── heartbeatGuard.ts
│           │   ├── slopeMonitor.ts
│           │   ├── fallbackLadder.ts
│           │   └── chunker.ts
│           ├── utils/
│           │   ├── retries.ts            # Retry policy engine
│           │   └── idempotence.ts
│           ├── ledger/
│           │   └── run-ledger.ts         # Immutable ledger
│           ├── metrics/
│           │   └── metrics-collector.ts  # Metrics system
│           ├── tracing/
│           │   └── otel.ts               # OpenTelemetry
│           ├── dag/
│           │   └── dag-executor.ts       # DAG execution
│           ├── dossier/
│           │   └── release-dossier.ts    # Dossier compiler
│           ├── base/
│           │   ├── phase-coordinator.ts
│           │   ├── enhanced-phase-coordinator.ts  # With all features
│           │   └── refinery-adapter.ts   # Enhanced Q/A/V integration
│           ├── supervisor/
│           │   └── supervisor.ts         # Enhanced supervisor
│           ├── enhanced-orchestrator.ts  # Enhanced MO
│           └── workflow-state.ts
│
└── migrations/
    ├── 008_foundation_tables.sql
    ├── 009_execution_tables.sql
    └── 010_complete_schema.sql
```

---

## Summary: Implementation Roadmap

| Week | Layer | Components | Effort | Cumulative % |
|------|-------|-----------|--------|--------------|
| 1-2 | Foundation | YAML configs, schemas, events, budgets, tables | 10 days | 18% |
| 3-4 | Autonomy | Q/A/V Triad, Knowledge Refinery integration, clarification loop | 8 days | 33% |
| 5-6 | Execution | Job queue, checkpoints, worker pool, scheduler, timers, tables | 12 days | 54% |
| 7-8 | Resilience | Heartbeats, unsticker routines, retries, supervisor | 8 days | 69% |
| 9-10 | Observability | Ledger, metrics, provenance, OTEL, evidence packs | 8 days | 83% |
| 11 | Hardening | DAG, fan-out/fan-in, gate loops, dossier, tests | 9 days | 100% |

**Total: 55 days (11 weeks)**

**MVP Milestone (Week 6):** After Execution Layer - System is autonomous, scalable, and resilient
**Full Spec Compliance (Week 11):** 100% orchestrator.txt + phase.txt requirements met

---

**END OF UNIFIED IMPLEMENTATION SPECIFICATION**
