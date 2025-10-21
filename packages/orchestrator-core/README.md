# @ideamine/orchestrator-core

Core orchestration infrastructure for the IdeaMine Level-2 microflow architecture.

## Overview

This package implements the nine fundamental components of the IdeaMine execution architecture:

1. **Orchestrators** - Sequence phases, set gates, loop on failures
2. **Agents** - Think/plan using Analyzers to intelligently choose tools
3. **Tools** - Perform precise, hard tasks
4. **Executors** - Run tools/jobs reliably (via Supervisor)
5. **Gatekeepers** - Enforce pre/post conditions (quality, security, perf, viability, a11y)
6. **Triggers** - Start/resume on events/time (idea submitted, tester clicked, nightly runs)
7. **Supervisors** - Unstick retries, handle backoff, restart failed nodes
8. **Dispatchers** - Queue/fan-out/fan-in work with back-pressure
9. **Recorders** - Log every step, artifact, decision, score, and cost

## Architecture

### Recorder

Comprehensive logging for audit trails, debugging, cost attribution, and quality analysis.

```typescript
import { Recorder, InMemoryRecorderStorage } from '@ideamine/orchestrator-core';

const storage = new InMemoryRecorderStorage();
const recorder = new Recorder(storage);

// Record a step execution
await recorder.recordStep({
  runId: 'run-123',
  phase: 'PRD',
  step: 'tool.prd.traceMatrix',
  actor: 'Agent:PRD-Writer',
  inputs: ['disc-456'],
  outputs: ['rtm-789'],
  score: { ac_quality: 0.91 },
  cost: { usd: 0.07, tokens: 18234 },
  latency_ms: 12850,
  decision: 'Analyzer chose tool (VoI=0.38)',
  gate: 'PRD Gate precheck',
  status: 'succeeded',
});

// Query logs
const logs = await recorder.getRunLogs('run-123');
const summary = await recorder.getRunSummary('run-123');
```

**Log Entry Schema:**
- runId, phase, step, actor
- inputs/outputs (artifact IDs)
- score (quality metrics)
- cost (USD + tokens)
- latency_ms
- decision reasoning
- gate association
- status (succeeded | failed | retrying | blocked)
- timestamp

### Gatekeeper

Enforce quality gates with rubric-based evaluation and evidence packs.

```typescript
import { CritiqueGate, PRDGate, QAGate } from '@ideamine/orchestrator-core';

const critiqueGate = new CritiqueGate(recorder);

const result = await critiqueGate.evaluate({
  runId: 'run-123',
  phase: 'CRITIQUE',
  artifacts: [
    { type: 'critique-report', id: 'crt-456', ... },
    { type: 'pre-mortem', id: 'pm-789', ... },
  ],
  metrics: {
    unresolved_criticals: 0,
    confidence: 0.85,
    counterfactuals: 7,
  },
});

console.log(result.status); // 'pass' | 'fail' | 'warn'
console.log(result.overallScore); // 0-100
console.log(result.decision.nextSteps);
console.log(result.recommendations);
```

**Available Gates:**
- **CritiqueGate** - unresolved criticals = 0; confidence ≥ 0.7; counterfactuals ≥ 5
- **PRDGate** - AC completeness ≥ 0.85; RTM link coverage ≥ 0.9; NFR coverage ≥ 0.8
- **ViabilityGate** - LTV:CAC ≥ 3.0; payback ≤ 12mo; 1+ viable channel
- **ArchitectureGate** - ADR completeness ≥ 0.95; unreviewed tech choices = 0
- **SecurityGate** - critical vulns = 0; threat mitigations linked; secrets policy pass
- **PerformanceGate** - p95 latency within target; error budget burn < 10%/day
- **QAGate** - test coverage ≥ 0.9; critical vulns = 0; perf targets met
- **AccessibilityGate** - WCAG 2.2 AA automated pass + manual spot checks
- **AestheticGate** - WCAG compliance; visual regression pass; brand consistency

### Supervisor

Handle retries with exponential backoff, circuit breakers, heartbeat monitoring, and quarantine.

```typescript
import { Supervisor, DEFAULT_RETRY_POLICIES } from '@ideamine/orchestrator-core';

const supervisor = new Supervisor(
  {
    retryPolicy: DEFAULT_RETRY_POLICIES.standard,
    circuitBreaker: {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
      halfOpenRequests: 1,
    },
    heartbeat: {
      interval: 5000,
      timeout: 15000,
      maxMissed: 3,
    },
    quarantineAfterFailures: 5,
    escalateAfterRetries: 3,
  },
  recorder
);

// Execute with retry logic
const result = await supervisor.executeWithRetry(
  {
    runId: 'run-123',
    phase: 'BUILD',
    step: 'tool.build.ciComposer',
    actor: 'Agent:CI-Builder',
    attempt: 0,
  },
  async () => {
    return await someToolExecution();
  }
);

if (result.success) {
  console.log('Execution succeeded after', result.attempts, 'attempts');
} else if (result.quarantined) {
  console.log('Actor quarantined after repeated failures');
} else if (result.escalated) {
  console.log('Escalated to human intervention');
}
```

**Features:**
- Exponential backoff with jitter (prevents thundering herd)
- Circuit breaker pattern
- Heartbeat monitoring for long-running tasks
- Automatic quarantine for repeatedly failing actors
- Escalation to human intervention
- Configurable retry policies

### Dispatcher

Event-driven orchestration with queuing, fan-out/fan-in, and back-pressure.

```typescript
import { Dispatcher, EventTopic } from '@ideamine/orchestrator-core';

const dispatcher = new Dispatcher(
  {
    maxConcurrency: 10,
    maxQueueSize: 1000,
    deadLetterAfterRetries: 3,
    rateLimit: {
      maxPerSecond: 50,
      maxPerMinute: 2000,
    },
    backPressure: {
      enabled: true,
      threshold: 0.8,
      maxDelay: 5000,
    },
  },
  recorder
);

// Subscribe to events
dispatcher.subscribe(EventTopic.PRD_READY, async (message) => {
  console.log('PRD ready:', message.payload);
  // Trigger next phase
});

// Dispatch event
await dispatcher.dispatch({
  topic: EventTopic.IDEATION_READY,
  payload: { ideaSpec, discoveryPack },
  priority: 8,
  metadata: {
    runId: 'run-123',
    phase: 'IDEATION',
    source: 'IdeationPhaseCoordinator',
  },
});

// Fan-out to multiple topics
await dispatcher.fanOut(
  [EventTopic.BUILD_READY, EventTopic.QA_READY],
  { buildId: 'build-456' },
  { runId: 'run-123', source: 'BuildCoordinator' }
);

// Fan-in (wait for multiple events)
const results = await dispatcher.fanIn(
  [EventTopic.E2E_DONE, EventTopic.LOAD_TEST_DONE],
  30000 // 30s timeout
);
```

**Event Topics:**
- `idea.created`, `intake.ready`, `ideation.ready`, `critique.ready`
- `prd.ready`, `bizdev.ready`, `arch.ready`, `build.ready`
- `story.started`, `story.done`, `qa.ready`, `aesthetic.ready`
- `release.ready`, `beta.ready`, `feedback.item`, `fix.ready`, `ga.ready`

### Analyzer

Intelligent tool selection using Value of Information (VoI) scoring.

```typescript
import { Analyzer, CapabilityClass, createDefaultToolRegistry } from '@ideamine/orchestrator-core';

const toolRegistry = createDefaultToolRegistry();

const analyzer = new Analyzer(
  {
    minConfidenceNoTool: 0.78,
    minScoreToInvoke: 0.22,
    budget: {
      remainingUsd: 10.0,
      remainingTokens: 500000,
    },
    piiPolicy: {
      allowPiiEgress: false,
      requiresApproval: true,
    },
  },
  toolRegistry,
  recorder
);

// Analyze whether to use a tool
const analysis = await analyzer.analyze({
  runId: 'run-123',
  phase: 'PRD',
  taskDescription: 'Create requirements traceability matrix',
  requiredCapability: CapabilityClass.TRACE_MATRIX,
  noToolConfidence: 0.65, // Agent confidence without tools
  input: { stories, requirements },
  utility: 0.9, // High importance
});

if (analysis.useTools && analysis.selectedTool) {
  console.log('Using tool:', analysis.selectedTool.name);
  console.log('VoI score:', analysis.voiScore?.score);

  // Execute tool
  const toolResult = await analysis.selectedTool.execute(input);

  // Update budget
  if (toolResult.metadata?.cost) {
    analyzer.updateBudget(toolResult.metadata.cost);
  }
} else {
  console.log('Reasoning without tools:', analysis.reasoning);
}
```

**VoI Formula:**
```
VoI = (error_reduction × utility) − (cost + latency_penalty + risk_penalty)

where:
- error_reduction = expected_tool_confidence - no_tool_confidence
- utility = task importance (0-1)
- cost = estimated USD cost (normalized to 0-1)
- latency_penalty = estimated latency / 10s (normalized to 0-1)
- risk_penalty = PII risk + approval delay + budget risk
```

**Tool Capability Classes:**
- Intake: normalizer, ontology, complianceSweep, feasibility
- Ideation: usecases, personas, kpiDesigner
- Critique: socratic, counterfactuals, premortem, cloneSim
- PRD: storyCutter, uxFlow, nfrPack, traceMatrix
- BizDev: icpSegmentation, ltvCacModel, gtmPlanner
- Architecture: c4Generator, apiSpec, dataModeler, threatModeler
- QA: e2e, visualDiff, load, dast, fuzz, chaos
- Aesthetic: tokens, theming, axe, lighthouse, screenshot
- Release: containerize, sbom, sign, canaryRules
- Beta: cohortSlicer, inviteManager, ota, sdkPack

## Usage Example

Complete workflow example combining all components:

```typescript
import {
  Recorder,
  InMemoryRecorderStorage,
  Supervisor,
  Dispatcher,
  Analyzer,
  CritiqueGate,
  PRDGate,
  EventTopic,
  createDefaultToolRegistry,
  CapabilityClass,
  DEFAULT_RETRY_POLICIES,
} from '@ideamine/orchestrator-core';

// Setup infrastructure
const storage = new InMemoryRecorderStorage();
const recorder = new Recorder(storage);

const supervisor = new Supervisor(
  { retryPolicy: DEFAULT_RETRY_POLICIES.standard },
  recorder
);

const dispatcher = new Dispatcher(
  {
    maxConcurrency: 10,
    maxQueueSize: 1000,
    deadLetterAfterRetries: 3,
  },
  recorder
);

const toolRegistry = createDefaultToolRegistry();
const analyzer = new Analyzer(
  {
    minConfidenceNoTool: 0.78,
    minScoreToInvoke: 0.22,
    budget: { remainingUsd: 100, remainingTokens: 1000000 },
  },
  toolRegistry,
  recorder
);

// Setup gates
const critiqueGate = new CritiqueGate(recorder);
const prdGate = new PRDGate(recorder);

// Subscribe to phase completion events
dispatcher.subscribe(EventTopic.CRITIQUE_READY, async (message) => {
  // Evaluate critique gate
  const gateResult = await critiqueGate.evaluate({
    runId: message.metadata.runId,
    phase: 'CRITIQUE',
    artifacts: message.payload.artifacts,
    metrics: message.payload.metrics,
  });

  if (gateResult.status === 'pass') {
    // Trigger PRD phase
    await dispatcher.dispatch({
      topic: EventTopic.PRD_READY,
      payload: message.payload,
      priority: 8,
      metadata: message.metadata,
    });
  } else {
    console.log('Critique gate failed:', gateResult.decision.requiredActions);
    // Loop back to critique with hints
  }
});

// Agent execution with analyzer and supervisor
async function executePRDAgent(context: any) {
  // Analyze whether to use tool
  const analysis = await analyzer.analyze({
    runId: context.runId,
    phase: 'PRD',
    taskDescription: 'Create requirements traceability matrix',
    requiredCapability: CapabilityClass.TRACE_MATRIX,
    noToolConfidence: 0.65,
    input: context.input,
    utility: 0.9,
  });

  let result;

  if (analysis.useTools && analysis.selectedTool) {
    // Execute with supervisor for retry logic
    result = await supervisor.executeWithRetry(
      {
        runId: context.runId,
        phase: 'PRD',
        step: 'tool.prd.traceMatrix',
        actor: 'Agent:PRD-Writer',
        attempt: 0,
      },
      async () => {
        return await analysis.selectedTool!.execute(context.input);
      }
    );
  } else {
    // Reason without tools
    result = await reasonWithoutTools(context);
  }

  return result;
}

// Query metrics
const summary = await recorder.getRunSummary('run-123');
console.log('Total cost:', summary.totalCost);
console.log('Success rate:', summary.successRate);
console.log('Phase metrics:', summary.phaseMetrics);

const dispatcherStats = dispatcher.getStats();
console.log('Queue size:', dispatcherStats.queueSize);
console.log('Messages/sec:', dispatcherStats.messagesPerSecond);
```

## Key Concepts

### Separation of Concerns

- **Orchestrators** manage phase sequencing and workflow state
- **Agents** contain domain logic and planning (think/plan)
- **Analyzers** make tool selection decisions (when to use tools)
- **Tools** perform specific technical tasks (what to do)
- **Executors** run tools with reliability (via Supervisors)
- **Gatekeepers** enforce quality standards
- **Recorders** capture everything for observability
- **Dispatchers** manage event flow and concurrency

### Decision Points

Every decision is logged with:
- Input context
- Available options
- Scoring/reasoning
- Selected option
- Confidence level
- Alternatives considered

### Error Handling

- Tools fail → Supervisor retries with backoff
- Retries exhausted → Escalate or quarantine
- Gates fail → Generate required actions, loop to upstream phase
- Budget exceeded → Analyzer switches to cheaper alternatives
- Stuck execution → Supervisor detects via heartbeat, restarts

### Observability

Every step produces:
- **Logs** - What happened
- **Artifacts** - What was produced
- **Decisions** - Why it happened
- **Scores** - How well it performed
- **Costs** - What it consumed

## License

MIT
