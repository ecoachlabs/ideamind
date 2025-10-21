# IdeaMine System Architecture

**Version:** 1.0
**Date:** 2025-10-18
**Status:** Draft

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Custom Orchestration Engine](#custom-orchestration-engine)
3. [Agent Runtime Architecture](#agent-runtime-architecture)
4. [Tool Registry & Executor](#tool-registry--executor)
5. [Event-Driven Architecture](#event-driven-architecture)
6. [Data Architecture](#data-architecture)
7. [Security Architecture](#security-architecture)
8. [Observability & Monitoring](#observability--monitoring)
9. [Deployment Architecture](#deployment-architecture)
10. [API Specifications](#api-specifications)

---

## Architecture Overview

### High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Admin Console (React)                        │
│                     Status, Runs, Gates, Costs, Audit               │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                         API Gateway                                  │
│                   Auth, Rate Limiting, Routing                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                   LIFECYCLE ORCHESTRATOR                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐               │
│  │  Workflow    │  │   Scheduler  │  │ Gate        │               │
│  │  Engine      │◄─┤   (Triggers) │  │ Steward     │               │
│  └──────┬───────┘  └──────────────┘  └──────┬──────┘               │
│         │                                    │                      │
│  ┌──────▼───────┐  ┌──────────────┐  ┌──────▼──────┐               │
│  │ Supervisor   │  │  Dispatcher  │  │  Recorder   │               │
│  │ (Watchdog)   │  │  (Queue)     │  │  (Audit)    │               │
│  └──────────────┘  └──────┬───────┘  └─────────────┘               │
└─────────────────────────────┼──────────────────────────────────────┘
                              │
                ┌─────────────▼─────────────┐
                │      Event Bus (NATS)     │
                │   Topics: idea.created,   │
                │   intake.ready, prd.ready │
                └─────────────┬─────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐  ┌─────────▼────────┐  ┌────────▼───────┐
│ ORCHESTRATORS  │  │    AGENTS        │  │  GATEKEEPERS   │
│ ┌────────────┐ │  │ ┌──────────────┐ │  │ ┌────────────┐ │
│ │ Intake     │ │  │ │ Idea Parser  │ │  │ │ Policy     │ │
│ │ Reasoning  │ │  │ │ Critique     │ │  │ │ Security   │ │
│ │ PRD        │ │  │ │ PRD Writer   │ │  │ │ Perf       │ │
│ │ BizDev     │ │  │ │ Architect    │ │  │ │ A11y       │ │
│ │ Build      │ │  │ │ Coder        │ │  │ │ Viability  │ │
│ │ Test       │ │  │ │ QA Runner    │ │  │ └────────────┘ │
│ │ Release    │ │  │ └──────┬───────┘ │  └────────────────┘
│ └────────────┘ │  │        │         │
└────────────────┘  │ ┌──────▼───────┐ │
                    │ │  Analyzer    │ │
                    │ │  (Tool Sel.) │ │
                    │ └──────┬───────┘ │
                    └────────┼─────────┘
                             │
                    ┌────────▼─────────┐
                    │  TOOL REGISTRY   │
                    │ ┌──────────────┐ │
                    │ │Tool Metadata │ │
                    │ │Versions      │ │
                    │ │Allowlists    │ │
                    │ └──────┬───────┘ │
                    └────────┼─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌────────▼────────┐  ┌───────▼────────┐
│  EXECUTORS     │  │     TOOLS       │  │   RECORDERS    │
│ ┌────────────┐ │  │ ┌─────────────┐ │  │ ┌────────────┐ │
│ │ Docker     │ │  │ │ Normalizer  │ │  │ │ Master Run │ │
│ │ Containers │ │  │ │ API Spec    │ │  │ │ Log        │ │
│ │            │ │  │ │ Diagram Gen │ │  │ │            │ │
│ │ Sandboxed  │ │  │ │ Test Runner │ │  │ │ Gate       │ │
│ │ Timeouts   │ │  │ │ Security    │ │  │ │ Decisions  │ │
│ │ Retries    │ │  │ │ Scan        │ │  │ │            │ │
│ └────────────┘ │  │ │ ... 100+    │ │  │ │ Cost Track │ │
└────────────────┘  │ └─────────────┘ │  │ └────────────┘ │
                    └─────────────────┘  └────────────────┘
```

### Platform Fabric (Shared Services)

```
┌──────────────────────────────────────────────────────────────┐
│                    PLATFORM FABRIC                            │
├─────────────┬──────────────┬──────────────┬─────────────────┤
│ Vector DB   │ Artifact     │ Secrets      │ Feature Flags   │
│ (Qdrant)    │ Store (MinIO)│ (Vault)      │ (Redis)         │
│             │              │              │                 │
│ RAG for     │ S3-compatible│ Dynamic creds│ Cohort-based    │
│ prior art   │ Versioned    │ Rotation     │ rollouts        │
└─────────────┴──────────────┴──────────────┴─────────────────┘

┌──────────────────────────────────────────────────────────────┐
│              OBSERVABILITY & GOVERNANCE                       │
├─────────────┬──────────────┬──────────────┬─────────────────┤
│ Prometheus  │ Jaeger       │ Loki         │ Policy Engine   │
│ Metrics     │ Traces       │ Logs         │ Legal/IP/PII    │
│             │              │              │ checks          │
└─────────────┴──────────────┴──────────────┴─────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   DATA LAYER                                  │
├─────────────┬──────────────┬──────────────┬─────────────────┤
│ PostgreSQL  │ TimescaleDB  │ Redis        │ Knowledge Graph │
│ Workflow    │ Time-series  │ Cache +      │ Neo4j (optional)│
│ State       │ metrics      │ Flags        │ Relationships   │
└─────────────┴──────────────┴──────────────┴─────────────────┘
```

---

## Custom Orchestration Engine

### Why Custom?

We're building a custom orchestration engine instead of using n8n or Temporal for these critical reasons:

1. **Nine-Doer Model**: Our architecture requires tight integration between Orchestrators, Agents, Tools, Executors, Gatekeepers, Triggers, Supervisors, Dispatchers, and Recorders - a pattern not natively supported by existing tools
2. **Long-Running AI Workflows**: LLM-based workflows have unique patterns (token budgets, model fallbacks, quality verification) not optimized in general workflow engines
3. **Custom Gate Logic**: Our evidence-based gatekeeper evaluation with rubrics and multi-dimensional scoring needs first-class support
4. **Cost Control**: Fine-grained budget tracking per agent/tool execution is mission-critical
5. **No Vendor Lock-in**: Complete control over scaling, pricing, and feature development

### Architecture Components

#### 1. Workflow State Machine

**State Model**:
```typescript
enum WorkflowState {
  CREATED = 'CREATED',
  INTAKE = 'INTAKE',
  IDEATION = 'IDEATION',
  CRITIQUE = 'CRITIQUE',
  PRD = 'PRD',
  BIZDEV = 'BIZDEV',
  ARCH = 'ARCH',
  BUILD = 'BUILD',
  STORY_LOOP = 'STORY_LOOP',
  QA = 'QA',
  AESTHETIC = 'AESTHETIC',
  RELEASE = 'RELEASE',
  BETA = 'BETA',
  FEEDBACK_LOOP = 'FEEDBACK_LOOP',
  DOCS_GROWTH = 'DOCS_GROWTH',
  GA = 'GA',
  PAUSED = 'PAUSED',
  FAILED = 'FAILED',
  CLOSED = 'CLOSED'
}

interface WorkflowRun {
  id: string;                    // run-{uuid}
  state: WorkflowState;
  ideaSpecId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;

  // Budget tracking
  budget: {
    maxCostUsd: number;
    currentCostUsd: number;
    maxTokens: number;
    currentTokens: number;
  };

  // Phase tracking
  phases: PhaseExecution[];

  // Gate tracking
  gates: GateResult[];

  // Artifacts produced
  artifacts: string[];          // artifact IDs

  // Resume tokens for human-in-loop
  resumeToken?: string;

  // Error tracking
  errors: WorkflowError[];
  retryCount: number;
  maxRetries: number;
}

interface PhaseExecution {
  phase: string;                // 'INTAKE', 'IDEATION', etc.
  state: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  agentExecutions: AgentExecution[];
  artifacts: string[];
  cost: CostMetrics;
}

interface AgentExecution {
  agentId: string;              // 'idea-parser', 'critique-analyst', etc.
  state: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;

  // Analyzer decisions
  toolsInvoked: ToolInvocation[];
  decision: {
    usedTool: boolean;
    rationale: string;
    confidence: number;
  };

  // Outputs
  artifacts: string[];
  scores: Record<string, number>;
  cost: CostMetrics;
}

interface ToolInvocation {
  toolId: string;               // 'tool.intake.normalizer@1.0.0'
  executorId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'succeeded' | 'failed' | 'timeout';
  inputs: Record<string, any>;
  outputs?: Record<string, any>;
  metrics: {
    latencyMs: number;
    costUsd: number;
    tokens?: number;
  };
  retryCount: number;
}

interface GateResult {
  gate: string;                 // 'critique-gate', 'prd-gate', etc.
  status: 'pending' | 'passed' | 'failed' | 'conditional';
  evaluatedAt: Date;
  evidence: string[];           // artifact IDs
  scores: Record<string, number>;
  reasons: string[];
  approver?: string;            // for manual gates
}
```

#### 2. Event Sourcing for Durability

**Pattern**: All state changes are persisted as immutable events

```typescript
enum EventType {
  WORKFLOW_CREATED = 'workflow.created',
  PHASE_STARTED = 'phase.started',
  PHASE_COMPLETED = 'phase.completed',
  AGENT_STARTED = 'agent.started',
  AGENT_COMPLETED = 'agent.completed',
  TOOL_INVOKED = 'tool.invoked',
  TOOL_COMPLETED = 'tool.completed',
  GATE_EVALUATED = 'gate.evaluated',
  WORKFLOW_PAUSED = 'workflow.paused',
  WORKFLOW_RESUMED = 'workflow.resumed',
  WORKFLOW_FAILED = 'workflow.failed',
  WORKFLOW_COMPLETED = 'workflow.completed'
}

interface Event {
  id: string;
  workflowRunId: string;
  type: EventType;
  timestamp: Date;
  payload: Record<string, any>;
  metadata: {
    correlationId: string;
    causationId?: string;       // event that caused this one
    userId?: string;
  };
}
```

**Benefits**:
- Complete audit trail
- Rebuild state from events
- Time-travel debugging
- Easy replay for testing

#### 3. Workflow Definition Language

```typescript
interface WorkflowDefinition {
  version: string;              // '1.0.0'
  phases: PhaseDefinition[];
  gates: GateDefinition[];
}

interface PhaseDefinition {
  id: string;                   // 'INTAKE', 'IDEATION', etc.
  agents: AgentDefinition[];
  requiredArtifacts: string[];  // from previous phases
  producesArtifacts: string[];
  timeoutMinutes: number;
  retryPolicy: RetryPolicy;
  parallelizable: boolean;      // can run in parallel with others?
}

interface AgentDefinition {
  id: string;                   // 'idea-parser'
  type: string;                 // class name or module path
  inputs: InputMapping[];
  outputs: OutputMapping[];
  policy: AgentPolicy;
  timeoutSeconds: number;
}

interface AgentPolicy {
  maxToolCalls: number;
  maxCostUsd: number;
  minConfidenceNoTool: number;  // 0.0-1.0
  minScoreToInvoke: number;
  allowedTools: string[];       // tool IDs
  forbidPII: boolean;
  networkEgress: 'none' | 'restricted' | 'full';
}

interface GateDefinition {
  id: string;                   // 'critique-gate'
  type: 'automated' | 'manual' | 'hybrid';
  afterPhase: string;           // phase ID
  rubrics: Rubric[];
  requiredEvidence: string[];   // artifact types
  passingThresholds: Record<string, number>;
  failureAction: 'block' | 'warn' | 'conditional';
}

interface Rubric {
  id: string;
  metric: string;               // 'coverage', 'ac_quality', etc.
  evaluator: string;            // function name or LLM prompt
  min?: number;
  max?: number;
  target: number;
  weight: number;               // for composite scoring
}
```

#### 4. Scheduler (Triggers)

**Responsibilities**:
- Cron-based workflow initiation
- Event-driven workflow resumption
- Priority queue management

```typescript
interface Trigger {
  id: string;
  type: 'cron' | 'event' | 'webhook' | 'manual';
  workflowDefinitionId: string;
  schedule?: string;            // cron expression
  eventPattern?: EventPattern;
  enabled: boolean;
}

interface EventPattern {
  topic: string;
  filters: Record<string, any>;
}

class Scheduler {
  // Cron triggers
  async scheduleCronTrigger(trigger: Trigger): Promise<void>;

  // Event-driven triggers
  async onEvent(event: Event): Promise<void>;

  // Manual start
  async startWorkflow(params: WorkflowParams): Promise<string>; // returns runId

  // Resume paused workflow
  async resumeWorkflow(runId: string, resumeToken: string, input: any): Promise<void>;
}
```

#### 5. Supervisor (Watchdog)

**Responsibilities**:
- Monitor running workflows
- Detect stuck/failed steps
- Auto-restart with exponential backoff
- Escalate after max retries

```typescript
class Supervisor {
  // Monitors all active runs
  async monitorActiveRuns(): Promise<void> {
    const activeRuns = await this.getActiveRuns();

    for (const run of activeRuns) {
      // Check for timeouts
      if (this.isTimedOut(run)) {
        await this.handleTimeout(run);
      }

      // Check for stalled steps
      if (this.isStalled(run)) {
        await this.handleStall(run);
      }

      // Check for budget exceeded
      if (this.isBudgetExceeded(run)) {
        await this.handleBudgetExceeded(run);
      }
    }
  }

  private async handleTimeout(run: WorkflowRun): Promise<void> {
    if (run.retryCount < run.maxRetries) {
      // Retry with backoff
      await this.retryWithBackoff(run);
    } else {
      // Fail and notify
      await this.failWorkflow(run, 'Max retries exceeded');
      await this.notifyOps(run);
    }
  }

  private async retryWithBackoff(run: WorkflowRun): Promise<void> {
    const backoffMs = Math.min(
      1000 * Math.pow(2, run.retryCount),
      60000 // max 60s
    );

    await this.sleep(backoffMs);
    await this.retryPhase(run);
  }
}
```

#### 6. Dispatcher (Queue & Routing)

**Responsibilities**:
- Queue agent tasks
- Load balancing across workers
- Back-pressure management
- Priority handling

```typescript
interface TaskQueue {
  push(task: Task, priority?: number): Promise<void>;
  pop(workerId: string): Promise<Task | null>;
  ack(taskId: string): Promise<void>;
  nack(taskId: string): Promise<void>;
  length(): Promise<number>;
}

class Dispatcher {
  private queues: Map<string, TaskQueue>; // per phase

  async dispatch(run: WorkflowRun, phase: PhaseDefinition): Promise<void> {
    const queue = this.queues.get(phase.id);

    for (const agentDef of phase.agents) {
      const task: Task = {
        id: generateId(),
        runId: run.id,
        agentId: agentDef.id,
        inputs: this.resolveInputs(run, agentDef.inputs),
        priority: this.calculatePriority(run),
        createdAt: new Date()
      };

      await queue.push(task, task.priority);
    }
  }

  // Worker pulls tasks
  async pullTask(workerId: string, phaseId: string): Promise<Task | null> {
    const queue = this.queues.get(phaseId);
    return queue.pop(workerId);
  }

  // Back-pressure: pause dispatching if queue too long
  async checkBackPressure(): Promise<boolean> {
    for (const [phaseId, queue] of this.queues) {
      const length = await queue.length();
      if (length > 1000) {
        this.logger.warn(`Back-pressure on ${phaseId}: ${length} tasks`);
        return true;
      }
    }
    return false;
  }
}
```

#### 7. Recorder (Audit & Telemetry)

**Responsibilities**:
- Log every step with inputs/outputs
- Track costs granularly
- Capture evidence for gates
- Provide audit trail

```typescript
interface AuditEntry {
  id: string;
  runId: string;
  timestamp: Date;
  actor: string;               // 'orchestrator', 'agent:idea-parser', 'tool:normalizer'
  action: string;              // 'started', 'completed', 'failed', 'invoked'
  phase?: string;
  inputs?: string[];           // artifact IDs
  outputs?: string[];          // artifact IDs
  cost: CostMetrics;
  metrics?: Record<string, number>;
  decision?: {
    analyzer: string;
    rationale: string;
    confidence: number;
    voi?: number;              // value-of-information score
  };
  error?: string;
}

interface CostMetrics {
  usd: number;
  tokens?: number;
  computeSeconds?: number;
  latencyMs: number;
}

class Recorder {
  async recordPhaseStart(run: WorkflowRun, phase: string): Promise<void>;
  async recordPhaseComplete(run: WorkflowRun, phase: string, artifacts: string[]): Promise<void>;

  async recordAgentStart(run: WorkflowRun, agent: string): Promise<void>;
  async recordAgentComplete(
    run: WorkflowRun,
    agent: string,
    outputs: string[],
    cost: CostMetrics,
    decision: any
  ): Promise<void>;

  async recordToolInvocation(
    run: WorkflowRun,
    tool: string,
    inputs: any,
    outputs: any,
    metrics: any
  ): Promise<void>;

  async recordGateEvaluation(
    run: WorkflowRun,
    gate: string,
    result: GateResult
  ): Promise<void>;

  // Query capabilities for admin console
  async getRunHistory(runId: string): Promise<AuditEntry[]>;
  async getCostBreakdown(runId: string): Promise<CostBreakdown>;
  async getAgentPerformance(agentId: string, since: Date): Promise<AgentMetrics>;
}
```

---

## Agent Runtime Architecture

### Analyzer-inside-Agent Pattern

Every agent follows this five-step pattern:

```typescript
abstract class BaseAgent {
  constructor(
    protected policy: AgentPolicy,
    protected toolRegistry: ToolRegistry,
    protected executor: Executor,
    protected evals: EvalHarness,
    protected recorder: Recorder
  ) {}

  async execute(input: AgentInput): Promise<AgentOutput> {
    // 1. PLANNER: Draft execution plan
    const plan = await this.plan(input);

    // 2. REASONING: Initial attempt without tools
    let result = await this.reason(plan, input);

    // 3. ANALYZER LOOP: Decide if tools can improve
    while (true) {
      const decision = await this.analyzer(plan, result, input);

      if (!decision.useTool) {
        break; // Confident enough without tools
      }

      // 4. EXECUTOR: Invoke tool
      const toolOutput = await this.executor.run(
        decision.toolId,
        { plan, result, input }
      );

      // 5. VERIFIER: Did tool improve quality?
      const improved = await this.evals.quickCompare(result, toolOutput);

      // Record decision and outcome
      await this.recorder.recordToolInvocation({
        runId: input.runId,
        tool: decision.toolId,
        decision: decision.rationale,
        improved: improved.pass,
        cost: toolOutput.cost
      });

      if (improved.pass) {
        result = toolOutput;
      }

      if (!improved.pass || this.exceededBudget(input)) {
        break;
      }
    }

    // 6. VERIFIER: Final quality check
    const verified = await this.verify(result);

    // 7. RECORDER: Log final output
    return this.record(verified, input);
  }

  // Subclasses implement these
  protected abstract plan(input: AgentInput): Promise<Plan>;
  protected abstract reason(plan: Plan, input: AgentInput): Promise<any>;

  // Analyzer: Core decision logic
  protected async analyzer(
    plan: Plan,
    result: any,
    input: AgentInput
  ): Promise<AnalyzerDecision> {
    // Self-assess confidence
    const confidence = await this.evals.selfConfidence(result);

    if (confidence >= this.policy.minConfidenceNoTool) {
      return {
        useTool: false,
        rationale: `High confidence (${confidence.toFixed(2)})`
      };
    }

    // Classify task type
    const taskClass = await this.classifyTask(plan, result);

    // Find candidate tools
    const candidates = await this.toolRegistry.search({
      tags: [taskClass],
      allowedBy: this.policy.allowedTools
    });

    if (candidates.length === 0) {
      return {
        useTool: false,
        rationale: 'No allowed tools for this task'
      };
    }

    // Score tools by Value-of-Information
    const scored = candidates.map(tool => ({
      tool,
      score: this.calculateVoI(tool, result, confidence)
    })).sort((a, b) => b.score - a.score);

    const best = scored[0];

    if (best.score < this.policy.minScoreToInvoke) {
      return {
        useTool: false,
        rationale: `Best VoI (${best.score.toFixed(2)}) below threshold`
      };
    }

    return {
      useTool: true,
      toolId: best.tool.id,
      rationale: `Best VoI: ${best.score.toFixed(2)}`,
      voi: best.score
    };
  }

  // Value-of-Information calculation
  private calculateVoI(
    tool: ToolMetadata,
    currentResult: any,
    confidence: number
  ): number {
    // Expected error reduction (inverse of current confidence)
    const errorReduction = 1.0 - confidence;

    // Utility weight from tool's historical accuracy
    const utility = tool.metrics.accuracyScore || 0.8;

    // Costs
    const costPenalty = tool.metrics.avgCostUsd * 10; // $0.10 = -1.0 score
    const latencyPenalty = tool.metrics.avgLatencyMs / 10000; // 10s = -1.0 score
    const riskPenalty = tool.risk * 0.5;

    return (errorReduction * utility) - (costPenalty + latencyPenalty + riskPenalty);
  }

  protected async verify(result: any): Promise<any> {
    // Run lightweight quality checks
    const scores = await this.evals.quickEval(result, this.getRubrics());

    if (scores.overall < 0.6) {
      throw new Error(`Quality check failed: ${scores.overall}`);
    }

    return { ...result, scores };
  }

  protected abstract getRubrics(): Rubric[];
}
```

### Concrete Agent Example

```typescript
class IdeaParserAgent extends BaseAgent {
  protected async plan(input: AgentInput): Promise<Plan> {
    return {
      steps: [
        'Extract title and summary',
        'Identify target users',
        'List constraints and deadlines',
        'Classify domain and platform'
      ]
    };
  }

  protected async reason(plan: Plan, input: AgentInput): Promise<any> {
    const prompt = `
      Parse the following idea into structured fields:

      Idea: ${input.idea}

      Extract:
      - title: brief name
      - summary: 2-3 sentences
      - goals: list of objectives
      - targetUsers: who will use this
      - platforms: web, mobile, desktop, etc.
      - constraints: limitations mentioned
      - deadlines: timeline expectations

      Format as JSON.
    `;

    const response = await this.llm.complete(prompt);
    return JSON.parse(response);
  }

  protected getRubrics(): Rubric[] {
    return [
      { id: 'completeness', metric: 'fields_filled', target: 1.0, weight: 0.5 },
      { id: 'clarity', metric: 'summary_length', target: 50, weight: 0.3 },
      { id: 'specificity', metric: 'vague_terms_count', target: 0, weight: 0.2 }
    ];
  }

  protected async classifyTask(plan: Plan, result: any): Promise<string> {
    // This agent often benefits from prior art lookup
    if (!result.domain || result.targetUsers.length === 0) {
      return 'prior-art';
    }
    return 'none';
  }
}
```

---

## Tool Registry & Executor

### Tool Registry Schema

```sql
CREATE TABLE tools (
  id VARCHAR(255) PRIMARY KEY,           -- 'tool.intake.normalizer'
  version VARCHAR(50) NOT NULL,          -- '1.0.0'
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),                 -- 'intake', 'qa', 'aesthetic', etc.
  runtime VARCHAR(50),                   -- 'docker', 'wasm', 'native'
  entrypoint TEXT,                       -- Docker command or function path
  input_schema JSONB NOT NULL,
  output_schema JSONB NOT NULL,
  metrics_schema JSONB,
  license VARCHAR(50),
  owner VARCHAR(255),

  -- Approval and access control
  status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'approved', 'deprecated'
  approved_by VARCHAR(255),
  approved_at TIMESTAMPTZ,
  allowed_agents TEXT[],                 -- which agents can use this

  -- Resource limits
  timeout_seconds INTEGER DEFAULT 60,
  max_memory_mb INTEGER DEFAULT 512,
  max_cpu_cores DECIMAL(3,1) DEFAULT 1.0,
  network_egress VARCHAR(50) DEFAULT 'none', -- 'none', 'restricted', 'full'

  -- Metrics tracking
  total_invocations INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_latency_ms DECIMAL(10,2),
  avg_cost_usd DECIMAL(10,4),
  accuracy_score DECIMAL(3,2),           -- 0.00-1.00

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tools_category ON tools(category);
CREATE INDEX idx_tools_status ON tools(status);
```

### Tool Registration API

```typescript
interface ToolRegistration {
  id: string;
  version: string;
  toolYaml: string;              // Complete tool.yaml content
  dockerImage?: string;          // For Docker runtime
  wasmModule?: Buffer;           // For WASM runtime
  smokeTest: SmokeTest;          // Test cases to validate
}

interface SmokeTest {
  inputs: any[];
  expectedOutputs: any[];
  maxLatencyMs: number;
}

class ToolRegistry {
  async register(registration: ToolRegistration): Promise<void> {
    // 1. Validate tool.yaml schema
    await this.validateToolYaml(registration.toolYaml);

    // 2. Run smoke tests in sandbox
    await this.runSmokeTests(registration);

    // 3. Store tool metadata
    await this.storeTool(registration);

    // 4. Set status to 'pending' for approval
    await this.setPendingApproval(registration.id);

    // 5. Notify approvers
    await this.notifyApprovers(registration);
  }

  async approve(toolId: string, approver: string): Promise<void> {
    await this.db.query(
      'UPDATE tools SET status = $1, approved_by = $2, approved_at = NOW() WHERE id = $3',
      ['approved', approver, toolId]
    );

    // Publish event
    await this.eventBus.publish('tool.approved', { toolId });
  }

  async search(criteria: SearchCriteria): Promise<ToolMetadata[]> {
    const { tags, allowedBy, category, minAccuracy } = criteria;

    let query = 'SELECT * FROM tools WHERE status = $1';
    const params: any[] = ['approved'];

    if (category) {
      query += ' AND category = $' + (params.length + 1);
      params.push(category);
    }

    if (minAccuracy) {
      query += ' AND accuracy_score >= $' + (params.length + 1);
      params.push(minAccuracy);
    }

    const results = await this.db.query(query, params);

    // Filter by allowed agents
    if (allowedBy) {
      return results.rows.filter(tool =>
        tool.allowed_agents.includes('*') || tool.allowed_agents.includes(allowedBy)
      );
    }

    return results.rows;
  }

  async updateMetrics(toolId: string, execution: ToolExecution): Promise<void> {
    // Incremental average update
    await this.db.query(`
      UPDATE tools
      SET
        total_invocations = total_invocations + 1,
        success_count = success_count + CASE WHEN $2 = 'success' THEN 1 ELSE 0 END,
        failure_count = failure_count + CASE WHEN $2 = 'failed' THEN 1 ELSE 0 END,
        avg_latency_ms = (avg_latency_ms * total_invocations + $3) / (total_invocations + 1),
        avg_cost_usd = (avg_cost_usd * total_invocations + $4) / (total_invocations + 1),
        updated_at = NOW()
      WHERE id = $1
    `, [toolId, execution.status, execution.latencyMs, execution.costUsd]);
  }
}
```

### Executor (Sandboxed Tool Runner)

```typescript
interface ExecutionContext {
  toolId: string;
  version: string;
  inputs: Record<string, any>;
  timeout: number;              // seconds
  budget: {
    maxCostUsd: number;
    remaining: number;
  };
}

interface ExecutionResult {
  status: 'success' | 'failed' | 'timeout';
  outputs?: Record<string, any>;
  logs: string[];
  metrics: {
    latencyMs: number;
    costUsd: number;
    peakMemoryMb: number;
  };
  error?: string;
}

class Executor {
  async run(context: ExecutionContext): Promise<ExecutionResult> {
    const tool = await this.toolRegistry.get(context.toolId, context.version);

    // Policy checks
    if (!this.canExecute(tool, context)) {
      throw new Error('Policy violation: tool not allowed');
    }

    const startTime = Date.now();

    try {
      let result: ExecutionResult;

      switch (tool.runtime) {
        case 'docker':
          result = await this.runDocker(tool, context);
          break;
        case 'wasm':
          result = await this.runWasm(tool, context);
          break;
        case 'native':
          result = await this.runNative(tool, context);
          break;
        default:
          throw new Error(`Unsupported runtime: ${tool.runtime}`);
      }

      result.metrics.latencyMs = Date.now() - startTime;

      // Update tool metrics
      await this.toolRegistry.updateMetrics(context.toolId, {
        status: result.status,
        latencyMs: result.metrics.latencyMs,
        costUsd: result.metrics.costUsd
      });

      return result;

    } catch (error) {
      return {
        status: 'failed',
        logs: [],
        metrics: {
          latencyMs: Date.now() - startTime,
          costUsd: 0,
          peakMemoryMb: 0
        },
        error: error.message
      };
    }
  }

  private async runDocker(
    tool: ToolMetadata,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    // 1. Create ephemeral container
    const containerId = await this.docker.createContainer({
      image: tool.dockerImage,
      entrypoint: tool.entrypoint,
      env: {
        INPUTS: JSON.stringify(context.inputs)
      },
      resources: {
        memory: tool.maxMemoryMb * 1024 * 1024,
        cpus: tool.maxCpuCores
      },
      network: this.getNetworkMode(tool.networkEgress),
      timeout: context.timeout
    });

    // 2. Start and wait
    await this.docker.start(containerId);
    const result = await this.docker.wait(containerId, context.timeout * 1000);

    // 3. Collect outputs and logs
    const logs = await this.docker.logs(containerId);
    const outputs = JSON.parse(result.stdout);

    // 4. Cleanup
    await this.docker.remove(containerId);

    return {
      status: result.exitCode === 0 ? 'success' : 'failed',
      outputs,
      logs,
      metrics: {
        latencyMs: 0, // filled by caller
        costUsd: this.calculateCost(tool, result.stats),
        peakMemoryMb: result.stats.maxMemoryMb
      }
    };
  }

  private getNetworkMode(egress: string): string {
    switch (egress) {
      case 'none': return 'none';
      case 'restricted': return 'restrictedNetwork'; // custom network with firewall
      case 'full': return 'bridge';
      default: return 'none';
    }
  }

  private calculateCost(tool: ToolMetadata, stats: ContainerStats): number {
    // Simple cost model: $0.0001 per CPU-second
    const cpuSeconds = stats.cpuTimeMs / 1000;
    const cpuCost = cpuSeconds * tool.maxCpuCores * 0.0001;

    // Memory cost: $0.00001 per GB-second
    const gbSeconds = (stats.avgMemoryMb / 1024) * (stats.durationMs / 1000);
    const memCost = gbSeconds * 0.00001;

    return cpuCost + memCost;
  }
}
```

---

## Event-Driven Architecture

### Event Bus (NATS)

**Event Topics**:
```
idea.created.v1
intake.ready.v1
ideation.ready.v1
critique.ready.v1
prd.ready.v1
bizdev.ready.v1
arch.ready.v1
build.ready.v1
story.started.v1
story.done.v1
qa.ready.v1
aesthetic.ready.v1
release.ready.v1
beta.ready.v1
feedback.item.v1
fix.ready.v1
ga.ready.v1

workflow.paused.v1
workflow.resumed.v1
workflow.failed.v1
workflow.completed.v1

gate.evaluated.v1
budget.warning.v1
budget.exceeded.v1
```

### Event Schema

```typescript
interface BaseEvent {
  id: string;                    // event UUID
  type: string;                  // 'idea.created.v1'
  timestamp: Date;
  source: string;                // service that emitted
  correlationId: string;         // runId
  causationId?: string;          // event that caused this
  data: Record<string, any>;
}

// Example: PRD Ready Event
interface PrdReadyEvent extends BaseEvent {
  type: 'prd.ready.v1';
  data: {
    runId: string;
    prdId: string;
    sourceIdea: string;
    quality: {
      stories: number;
      acCompleteness: number;
      rtmCoverage: number;
      nfrCoverage: number;
    };
    cost: CostMetrics;
  };
}
```

### Pub/Sub Pattern

```typescript
class EventBus {
  private nats: NatsConnection;

  async publish(topic: string, data: any, correlationId: string): Promise<void> {
    const event: BaseEvent = {
      id: generateId(),
      type: topic,
      timestamp: new Date(),
      source: process.env.SERVICE_NAME,
      correlationId,
      data
    };

    await this.nats.publish(topic, JSON.stringify(event));

    // Also store in event log
    await this.eventLog.append(event);
  }

  async subscribe(
    topic: string,
    handler: (event: BaseEvent) => Promise<void>
  ): Promise<Subscription> {
    const sub = await this.nats.subscribe(topic, {
      queue: process.env.SERVICE_NAME, // load balancing
      callback: async (msg) => {
        const event = JSON.parse(msg.data);

        try {
          await handler(event);
          msg.ack();
        } catch (error) {
          this.logger.error(`Handler failed for ${topic}:`, error);
          msg.nack();
        }
      }
    });

    return sub;
  }
}
```

---

## Data Architecture

### Database Schema

#### Workflow Runs Table
```sql
CREATE TABLE workflow_runs (
  id VARCHAR(255) PRIMARY KEY,
  state VARCHAR(50) NOT NULL,
  idea_spec_id VARCHAR(255),
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Budget
  max_cost_usd DECIMAL(10,2),
  current_cost_usd DECIMAL(10,2) DEFAULT 0,
  max_tokens BIGINT,
  current_tokens BIGINT DEFAULT 0,

  -- Resume
  resume_token VARCHAR(255),
  paused_at TIMESTAMPTZ,
  paused_reason TEXT,

  -- Retry
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Metadata
  metadata JSONB
);

CREATE INDEX idx_runs_state ON workflow_runs(state);
CREATE INDEX idx_runs_created_by ON workflow_runs(created_by);
CREATE INDEX idx_runs_created_at ON workflow_runs(created_at DESC);
```

#### Artifacts Table
```sql
CREATE TABLE artifacts (
  id VARCHAR(255) PRIMARY KEY,           -- 'ide-abc123'
  run_id VARCHAR(255) NOT NULL REFERENCES workflow_runs(id),
  type VARCHAR(100) NOT NULL,            -- 'IdeaSpec', 'PRD', 'ArchPlan', etc.
  version VARCHAR(50) NOT NULL,          -- '1.0.0'
  content_hash VARCHAR(64) NOT NULL,     -- SHA-256

  -- Storage
  storage_path TEXT NOT NULL,            -- S3 path
  size_bytes BIGINT,

  -- Metadata
  schema_version VARCHAR(50),
  metadata JSONB,

  -- Provenance
  created_by VARCHAR(255),               -- agent ID
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Relationships
  parent_artifacts TEXT[],               -- artifact IDs this was derived from

  UNIQUE(content_hash)
);

CREATE INDEX idx_artifacts_run ON artifacts(run_id);
CREATE INDEX idx_artifacts_type ON artifacts(type);
CREATE INDEX idx_artifacts_hash ON artifacts(content_hash);
```

#### Audit Log Table
```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  run_id VARCHAR(255) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  actor VARCHAR(255) NOT NULL,           -- 'orchestrator', 'agent:idea-parser', etc.
  action VARCHAR(100) NOT NULL,          -- 'started', 'completed', 'failed'
  phase VARCHAR(50),

  -- I/O
  inputs TEXT[],                         -- artifact IDs
  outputs TEXT[],                        -- artifact IDs

  -- Costs
  cost_usd DECIMAL(10,4),
  tokens BIGINT,
  latency_ms INTEGER,

  -- Decision
  decision JSONB,                        -- analyzer rationale, VoI, etc.

  -- Metrics
  metrics JSONB,

  -- Error
  error TEXT
);

CREATE INDEX idx_audit_run ON audit_log(run_id);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor);

-- Partition by month for performance
CREATE TABLE audit_log_2025_10 PARTITION OF audit_log
  FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
```

#### Gates Table
```sql
CREATE TABLE gate_evaluations (
  id BIGSERIAL PRIMARY KEY,
  run_id VARCHAR(255) NOT NULL REFERENCES workflow_runs(id),
  gate_id VARCHAR(100) NOT NULL,         -- 'critique-gate', 'prd-gate', etc.
  status VARCHAR(50) NOT NULL,           -- 'passed', 'failed', 'conditional'
  evaluated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Evidence
  evidence_artifacts TEXT[],

  -- Scores
  scores JSONB,                          -- {"coverage": 0.85, "quality": 0.92}

  -- Reasons
  reasons TEXT[],

  -- Approval
  approver VARCHAR(255),
  approval_notes TEXT
);

CREATE INDEX idx_gates_run ON gate_evaluations(run_id);
CREATE INDEX idx_gates_status ON gate_evaluations(status);
```

### Artifact Storage (MinIO/S3)

**Directory Structure**:
```
/artifacts/
  /{runId}/
    /ideaspec/
      /v1/
        ideaspec.json
        glossary.md
    /discoverypack/
      /v1/
        discoverypack.json
    /critique/
      /v1/
        report.json
        counterfactuals.json
        premortem.md
    /prd/
      /v1/
        prd.json
        flows.svg
        rtm.csv
    /arch/
      /v1/
        archplan.json
        c4-diagram.svg
        openapi.yaml
    /release/
      /v1/
        bundle.tar.gz
        sbom.spdx.json
        signatures.json
```

**Content-Addressed Storage**:
- Files stored by SHA-256 hash
- Metadata table maps artifact ID → hash → S3 path
- Deduplication automatic
- Immutable (write-once)

---

## Security Architecture

### Sandboxing Strategy

#### Tool Execution Sandbox

```yaml
# Docker container security profile
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
  seccompProfile:
    type: RuntimeDefault

# Network policies
networkPolicy:
  egress:
    none:
      - allow: []
    restricted:
      - allow:
          - namespaceSelector:
              matchLabels:
                name: ideamine-allowed-services
          - ports:
              - protocol: TCP
                port: 443
    full:
      - allow:
          - to: 0.0.0.0/0
```

#### Resource Limits

```yaml
resources:
  limits:
    cpu: "1000m"          # 1 core max
    memory: "512Mi"
  requests:
    cpu: "100m"
    memory: "128Mi"

# Execution timeout
timeout: 60s

# Auto-kill on violation
oomKiller: enabled
```

### Secrets Management

**HashiCorp Vault Integration**:

```typescript
class SecretsManager {
  private vault: VaultClient;

  async getSecret(path: string, ttl: number = 3600): Promise<string> {
    // Use dynamic secrets with TTL
    const lease = await this.vault.read(path, { ttl });

    // Schedule renewal before expiry
    this.scheduleRenewal(lease.leaseId, ttl);

    return lease.data.value;
  }

  async getToolCredentials(toolId: string): Promise<Credentials> {
    // Scoped credentials per tool
    const path = `tools/${toolId}/credentials`;
    return await this.vault.read(path);
  }

  async rotateSecret(path: string): Promise<void> {
    // Automated rotation on schedule
    await this.vault.rotate(path);

    // Notify dependent services
    await this.eventBus.publish('secret.rotated', { path });
  }
}
```

### RBAC Model

```sql
CREATE TABLE roles (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  permissions JSONB NOT NULL
);

INSERT INTO roles (id, name, permissions) VALUES
('org-admin', 'Organization Administrator', '{
  "workflows": ["create", "read", "update", "delete", "pause", "resume"],
  "gates": ["approve", "override"],
  "tools": ["register", "approve", "deprecate"],
  "users": ["invite", "remove", "assign-roles"],
  "billing": ["view", "update"]
}'),
('project-owner', 'Project Owner', '{
  "workflows": ["create", "read", "update", "delete"],
  "gates": ["view"],
  "artifacts": ["read", "download"]
}'),
('developer', 'Developer', '{
  "workflows": ["read"],
  "artifacts": ["read"],
  "tools": ["view"]
}');

CREATE TABLE user_roles (
  user_id VARCHAR(255) NOT NULL,
  org_id VARCHAR(255) NOT NULL,
  role_id VARCHAR(255) NOT NULL REFERENCES roles(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, org_id, role_id)
);
```

### Audit Trail

Every action logged with:
- Who (user ID, service account)
- What (action, resource, change)
- When (timestamp with millisecond precision)
- Where (IP, user agent)
- Why (context, runId, correlationId)
- Result (success/failure, errors)

**Immutable Audit Log**:
- Append-only table
- Write-only permissions for services
- Partitioned by month
- Backed up to immutable storage
- Compliance-ready (SOC2, GDPR, HIPAA)

---

## Observability & Monitoring

### OpenTelemetry Integration

```typescript
import { trace, metrics, logs } from '@opentelemetry/api';

class InstrumentedOrchestrator {
  private tracer = trace.getTracer('orchestrator');
  private meter = metrics.getMeter('orchestrator');

  async executeWorkflow(run: WorkflowRun): Promise<void> {
    // Create span for entire workflow
    const span = this.tracer.startSpan('workflow.execute', {
      attributes: {
        'workflow.id': run.id,
        'workflow.state': run.state,
        'workflow.created_by': run.createdBy
      }
    });

    try {
      for (const phase of run.phases) {
        await this.executePhase(run, phase, span);
      }

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      throw error;
    } finally {
      span.end();
    }
  }

  private async executePhase(
    run: WorkflowRun,
    phase: PhaseDefinition,
    parentSpan: Span
  ): Promise<void> {
    const phaseSpan = this.tracer.startSpan(
      `phase.${phase.id}`,
      {
        parent: parentSpan,
        attributes: {
          'phase.id': phase.id,
          'phase.agents_count': phase.agents.length
        }
      }
    );

    try {
      // Execute agents...

      // Record metrics
      this.meter.createHistogram('phase.duration').record(
        Date.now() - phaseSpan.startTime,
        { phase: phase.id }
      );

      phaseSpan.setStatus({ code: SpanStatusCode.OK });
    } finally {
      phaseSpan.end();
    }
  }
}
```

### Metrics

**Prometheus Metrics**:

```typescript
// Workflow metrics
const workflowsTotal = new Counter({
  name: 'ideamine_workflows_total',
  help: 'Total workflows started',
  labelNames: ['created_by']
});

const workflowDuration = new Histogram({
  name: 'ideamine_workflow_duration_seconds',
  help: 'Workflow duration from creation to completion',
  labelNames: ['state'],
  buckets: [60, 300, 600, 1800, 3600, 7200, 14400] // 1m to 4h
});

const workflowCost = new Histogram({
  name: 'ideamine_workflow_cost_usd',
  help: 'Total cost per workflow',
  labelNames: ['phase'],
  buckets: [0.1, 0.5, 1, 5, 10, 50, 100]
});

// Phase metrics
const phaseSuccess = new Counter({
  name: 'ideamine_phase_success_total',
  help: 'Successful phase completions',
  labelNames: ['phase']
});

const phaseDuration = new Histogram({
  name: 'ideamine_phase_duration_seconds',
  help: 'Phase execution duration',
  labelNames: ['phase'],
  buckets: [10, 30, 60, 120, 300, 600]
});

// Agent metrics
const agentToolUsage = new Counter({
  name: 'ideamine_agent_tool_usage_total',
  help: 'Tool invocations by agent',
  labelNames: ['agent', 'tool', 'improved']
});

const agentConfidence = new Histogram({
  name: 'ideamine_agent_confidence',
  help: 'Agent self-assessed confidence',
  labelNames: ['agent'],
  buckets: [0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 1.0]
});

// Gate metrics
const gateEvaluations = new Counter({
  name: 'ideamine_gate_evaluations_total',
  help: 'Gate evaluations',
  labelNames: ['gate', 'status']
});

const gateScores = new Histogram({
  name: 'ideamine_gate_scores',
  help: 'Gate evaluation scores',
  labelNames: ['gate', 'metric'],
  buckets: [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0]
});

// Tool metrics
const toolInvocations = new Counter({
  name: 'ideamine_tool_invocations_total',
  help: 'Tool invocations',
  labelNames: ['tool', 'status']
});

const toolDuration = new Histogram({
  name: 'ideamine_tool_duration_seconds',
  help: 'Tool execution duration',
  labelNames: ['tool'],
  buckets: [1, 5, 10, 30, 60, 120]
});

const toolCost = new Histogram({
  name: 'ideamine_tool_cost_usd',
  help: 'Tool execution cost',
  labelNames: ['tool'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1.0]
});
```

### Dashboards

**Grafana Dashboard Structure**:

1. **Overview Dashboard**
   - Active workflows
   - Workflows completed today
   - Average time to GA
   - Average cost per workflow
   - Gate pass rates
   - Budget utilization

2. **Workflow Dashboard**
   - Workflow state distribution
   - Phase durations (heatmap)
   - Cost breakdown by phase
   - Failure rates by phase
   - Retry counts

3. **Agent Dashboard**
   - Agent invocation counts
   - Tool usage rates
   - Confidence distributions
   - Quality scores
   - Cost per agent

4. **Gate Dashboard**
   - Gate pass/fail rates
   - Score distributions
   - Time to pass gates
   - Manual approval latency
   - Evidence completeness

5. **Tool Dashboard**
   - Tool popularity
   - Success rates
   - Latency percentiles
   - Cost trends
   - Approval queue

### Alerts

```yaml
alerts:
  - name: HighWorkflowFailureRate
    expr: rate(ideamine_workflows_total{state="failed"}[5m]) > 0.1
    severity: warning
    annotations:
      summary: "High workflow failure rate detected"

  - name: BudgetExceeded
    expr: ideamine_workflow_cost_usd > 100
    severity: critical
    annotations:
      summary: "Workflow exceeded $100 budget"

  - name: GateFailing
    expr: rate(ideamine_gate_evaluations_total{status="failed"}[15m]) > 0.5
    severity: warning
    annotations:
      summary: "{{ $labels.gate }} failing frequently"

  - name: ToolTimeout
    expr: rate(ideamine_tool_invocations_total{status="timeout"}[10m]) > 0.2
    severity: warning
    annotations:
      summary: "{{ $labels.tool }} timing out frequently"

  - name: OrchestratorDown
    expr: up{job="orchestrator"} == 0
    severity: critical
    annotations:
      summary: "Orchestrator service is down"
```

---

## Deployment Architecture

### Kubernetes Deployment

```yaml
# Orchestrator deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orchestrator
spec:
  replicas: 3
  selector:
    matchLabels:
      app: orchestrator
  template:
    metadata:
      labels:
        app: orchestrator
    spec:
      containers:
      - name: orchestrator
        image: ideamine/orchestrator:1.0.0
        env:
        - name: DB_HOST
          value: postgres.ideamine.svc.cluster.local
        - name: NATS_URL
          value: nats://nats.ideamine.svc.cluster.local:4222
        - name: VAULT_ADDR
          value: http://vault.ideamine.svc.cluster.local:8200
        resources:
          requests:
            cpu: "500m"
            memory: "1Gi"
          limits:
            cpu: "2000m"
            memory: "4Gi"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5

---
# Agent worker deployment (scales independently)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-worker
spec:
  replicas: 10               # Scale based on queue depth
  selector:
    matchLabels:
      app: agent-worker
  template:
    metadata:
      labels:
        app: agent-worker
    spec:
      containers:
      - name: worker
        image: ideamine/agent-worker:1.0.0
        env:
        - name: PHASE
          value: "INTAKE,IDEATION,PRD"  # Worker specialization
        resources:
          requests:
            cpu: "1000m"
            memory: "2Gi"
          limits:
            cpu: "4000m"
            memory: "8Gi"

---
# Tool executor deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tool-executor
spec:
  replicas: 20               # High concurrency for tool runs
  selector:
    matchLabels:
      app: tool-executor
  template:
    metadata:
      labels:
        app: tool-executor
    spec:
      serviceAccountName: tool-executor
      containers:
      - name: executor
        image: ideamine/tool-executor:1.0.0
        securityContext:
          privileged: true    # Needs Docker-in-Docker
        volumeMounts:
        - name: docker-sock
          mountPath: /var/run/docker.sock
      volumes:
      - name: docker-sock
        hostPath:
          path: /var/run/docker.sock
```

### Horizontal Pod Autoscaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: agent-worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: agent-worker
  minReplicas: 5
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: External
    external:
      metric:
        name: queue_depth
        selector:
          matchLabels:
            queue: "agent-tasks"
      target:
        type: AverageValue
        averageValue: "30"
```

### Service Mesh (Istio)

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: orchestrator-vs
spec:
  hosts:
  - orchestrator.ideamine.com
  http:
  - match:
    - uri:
        prefix: /api/v1
    route:
    - destination:
        host: orchestrator
        port:
          number: 8080
    retries:
      attempts: 3
      perTryTimeout: 30s
      retryOn: 5xx,reset,connect-failure,refused-stream
    timeout: 120s
```

---

## API Specifications

### RESTful API

#### Workflow Management

```
POST   /api/v1/workflows
GET    /api/v1/workflows/{id}
GET    /api/v1/workflows
PATCH  /api/v1/workflows/{id}
DELETE /api/v1/workflows/{id}
POST   /api/v1/workflows/{id}/pause
POST   /api/v1/workflows/{id}/resume
POST   /api/v1/workflows/{id}/retry
```

#### Artifacts

```
GET    /api/v1/artifacts/{id}
GET    /api/v1/workflows/{workflowId}/artifacts
POST   /api/v1/artifacts
```

#### Gates

```
GET    /api/v1/gates
POST   /api/v1/gates/{gateId}/evaluate
POST   /api/v1/gates/{gateId}/approve
```

#### Tools

```
GET    /api/v1/tools
POST   /api/v1/tools/register
POST   /api/v1/tools/{toolId}/approve
GET    /api/v1/tools/{toolId}/metrics
```

### Example API Requests

**Create Workflow**:
```http
POST /api/v1/workflows
Content-Type: application/json
Authorization: Bearer {token}

{
  "idea": "Build a mobile app for tracking daily water intake with reminders",
  "budget": {
    "maxCostUsd": 50,
    "maxTokens": 1000000
  },
  "metadata": {
    "source": "web-ui",
    "tags": ["health", "mobile"]
  }
}

Response 201 Created:
{
  "id": "run-abc123",
  "state": "CREATED",
  "createdAt": "2025-10-18T14:00:00Z",
  "estimatedCompletionAt": "2025-10-18T16:00:00Z"
}
```

**Resume Paused Workflow**:
```http
POST /api/v1/workflows/run-abc123/resume
Content-Type: application/json

{
  "resumeToken": "token-xyz789",
  "input": {
    "answers": {
      "targetAudience": "Health-conscious adults 25-45",
      "platforms": ["iOS", "Android"]
    }
  }
}

Response 200 OK:
{
  "status": "resumed",
  "state": "IDEATION"
}
```

---

## Conclusion

This architecture provides:

1. **Autonomy**: Custom orchestration with nine-doer model
2. **Durability**: Event sourcing + PostgreSQL persistence
3. **Scalability**: Horizontal scaling for all components
4. **Observability**: OpenTelemetry + Prometheus + Grafana
5. **Security**: Sandboxing, RBAC, secrets management, audit logs
6. **Cost Control**: Budget guards, granular tracking, auto-tiering
7. **Quality**: Multi-layer gates with evidence-based evaluation
8. **Modularity**: Independent services with clear contracts

The system is production-ready, enterprise-grade, and optimized for the unique challenges of AI-driven software development workflows.
