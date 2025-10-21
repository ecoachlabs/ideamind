# IdeaMine API Documentation

## Overview

This document provides comprehensive API documentation for the IdeaMine autonomous development orchestrator system.

## Documentation Structure

### Automated API Docs
Full TypeScript API documentation is automatically generated using TypeDoc:
```bash
npm run docs:generate
```

View the generated documentation:
```bash
npm run docs:serve
```

Generated docs are available at: `/docs/api/`

## Core Modules

### 1. Phase Execution

#### PhaseCoordinator
Coordinates phase execution with gates, guards, and Q/A/V integration.

**Location**: `packages/orchestrator-core/src/phase/phase-coordinator.ts`

**Key Methods**:
- `executePhase(phaseConfig, context)` - Execute a phase
- `evaluateGate(phase, artifacts, evidence)` - Evaluate quality gate
- `runGuards(phase, artifacts)` - Run guard checks

**Events Emitted**:
- `phase.started`
- `phase.progress`
- `phase.ready`
- `phase.gate.passed`
- `phase.gate.failed`
- `phase.stalled`
- `phase.completed`

#### DAG Executor
Executes phases in dependency order with parallel execution support.

**Location**: `packages/orchestrator-core/src/dag/dag-executor.ts`

**Key Methods**:
- `execute(dag, context)` - Execute entire DAG
- `topologicalSort(dag)` - Sort phases by dependencies
- `findParallelPhases(dag)` - Identify parallelizable phases

### 2. Autonomy Layer

#### Q/A/V Triad

##### QuestionAgent
Generates clarifying questions from insufficient context.

**Location**: `packages/orchestrator-core/src/autonomy/qav/question-agent.ts`

**Key Methods**:
- `generateQuestions(phase, context, artifacts, maxQuestions)` - Generate questions
- `scoreQuestions(questions)` - Score by priority
- `filterByCategory(questions, categories)` - Filter questions

**Example**:
```typescript
const agent = new QuestionAgent(apiKey);
const questions = await agent.generateQuestions(
  'prd',
  context,
  artifacts,
  15
);
```

##### AnswerAgent
Answers questions from Knowledge Refinery or inference.

**Location**: `packages/orchestrator-core/src/autonomy/qav/answer-agent.ts`

**Key Methods**:
- `answerQuestion(question, context, kmap, allowInference)` - Answer single question
- `answerQuestions(questions, context, kmap, allowInference)` - Batch answer
- `createHumanAnswer(questionId, answerText)` - Create human-provided answer

**Example**:
```typescript
const agent = new AnswerAgent(apiKey, knowledgeRefinery);
const { answers, unanswered } = await agent.answerQuestions(
  questions,
  context,
  kmap,
  true
);
```

##### ValidateAgent
Validates answers against evidence and produces grounded bindings.

**Location**: `packages/orchestrator-core/src/autonomy/qav/validate-agent.ts`

**Key Methods**:
- `validate(questions, answers, context, artifacts)` - Validate answers
- `getHighConfidenceBindings(bindings, minConfidence)` - Filter bindings
- `applyBindings(kmap, bindings)` - Apply to knowledge map

**Example**:
```typescript
const agent = new ValidateAgent(apiKey, 0.85);
const validation = await agent.validate(
  questions,
  answers,
  context,
  artifacts
);

if (validation.valid) {
  const updatedKmap = agent.applyBindings(kmap, validation.bindings);
}
```

##### QAVCoordinator
Orchestrates the complete Q/A/V cycle.

**Location**: `packages/orchestrator-core/src/autonomy/qav/qav-coordinator.ts`

**Key Methods**:
- `runCycle(phase, context, kmap, artifacts, config)` - Run complete cycle
- `runCycleWithHuman(phase, context, kmap, artifacts, config, callback)` - With human fallback
- `updateKnowledgeMap(kmap, validation)` - Apply validated bindings

**Example**:
```typescript
const coordinator = new QAVCoordinator(apiKey, knowledgeRefinery, config);
const validation = await coordinator.runCycle(
  'prd',
  context,
  kmap,
  artifacts,
  {
    enabled: true,
    max_questions: 15,
    min_grounding_score: 0.85,
    allow_inference: true,
    require_human_approval: false
  }
);
```

#### Knowledge Refinery
Semantic knowledge storage and retrieval.

**Location**: `packages/orchestrator-core/src/autonomy/knowledge-refinery/knowledge-refinery.ts`

**Key Methods**:
- `initialize()` - Load from database
- `query(question, context)` - Query knowledge (KnowledgeSource interface)
- `search(query)` - Search with filters
- `add(entry)` - Add knowledge entry
- `update(id, updates)` - Update entry
- `getMostAccessed(limit)` - Get popular entries
- `getStats()` - Get statistics

**Example**:
```typescript
const refinery = new KnowledgeRefinery(db, apiKey);
await refinery.initialize();

// Query
const result = await refinery.query(
  'What is the target user base?',
  context
);

// Add knowledge
await refinery.add({
  key: 'target_users',
  value: 'Enterprise teams 50-500 people',
  category: 'requirement',
  source: 'run:123:intake',
  confidence: 0.9,
  evidence: ['User specified in intake'],
  tags: ['users', 'requirements'],
  metadata: {}
});
```

#### Clarification Loop
Manages clarification cycles during phase execution.

**Location**: `packages/orchestrator-core/src/autonomy/clarification/clarification-loop.ts`

**Key Methods**:
- `run(phase, runId, context, kmap, artifacts, config)` - Run clarification loop
- `runWithHuman(phase, runId, context, kmap, artifacts, config, callback)` - With human input
- `getState(runId, phase)` - Get current state
- `isRequired(phase, context, config)` - Check if needed

**Example**:
```typescript
const loop = new ClarificationLoop(qavCoordinator, db);

const result = await loop.run(
  'prd',
  'run-123',
  context,
  kmap,
  artifacts,
  qavConfig
);

if (result.success) {
  // Use updated knowledge map
  const updatedKmap = result.kmap_updates;
} else if (result.requires_human) {
  // Handle human intervention
  console.log('Unanswered questions:', result.unanswered_questions);
}
```

### 3. Budget Tracking

#### BudgetTracker
Tracks and enforces budget limits.

**Location**: `packages/orchestrator-core/src/budget/budget-tracker.ts`

**Key Methods**:
- `setBudget(scope, budget)` - Set budget for scope
- `startTracking(scope)` - Start wall-clock tracking
- `stopTracking(scope)` - Stop wall-clock tracking
- `recordTokens(scope, tokens)` - Record token usage (throws if exceeded)
- `recordToolTime(scope, minutes)` - Record tool time (throws if exceeded)
- `isWallclockExceeded(scope)` - Check if wall-clock exceeded
- `getStatus(scope)` - Get budget status
- `getUsage(scope)` - Get current usage
- `splitBudget(totalBudget, count)` - Split budget across N tasks
- `calculateCost(usage)` - Calculate USD cost
- `persist(scope, runId)` - Save to database

**Example**:
```typescript
const tracker = new BudgetTracker(db);

// Set budget
tracker.setBudget('run:123', {
  tokens: 1000000,
  tools_minutes: 60,
  wallclock_minutes: 120
});

// Track usage
tracker.startTracking('run:123');
try {
  tracker.recordTokens('run:123', 50000);
  tracker.recordToolTime('run:123', 5.5);
} catch (error) {
  // Budget exceeded
  console.error('Budget exceeded:', error.message);
}
tracker.stopTracking('run:123');

// Get status
const status = tracker.getStatus('run:123');
console.log('Utilization:', status.utilization);
console.log('Remaining:', status.remaining);
console.log('Exceeded:', status.exceeded);

// Calculate cost
const usage = tracker.getUsage('run:123');
const cost = tracker.calculateCost(usage);
console.log('Cost: $', cost.toFixed(2));
```

### 4. Production Hardening

#### Loop-Until-Pass Gate
Automatic retry with auto-fix strategies.

**Location**: `packages/orchestrator-core/src/gate/loop-until-pass.ts`

**Key Methods**:
- `run(phase, artifacts, config, maxAttempts)` - Run with retry
- `selectAutoFixStrategy(failures)` - Select fix strategy
- `applyAutoFix(phase, strategy, context)` - Apply fix

**Auto-fix Strategies**:
- `rerun-qav` - Re-run Q/A/V with stricter grounding
- `add-missing-agents` - Add additional agents
- `rerun-security` - Re-run security checks
- `stricter-validation` - Use stricter validation
- `reduce-scope` - Reduce task scope
- `manual-intervention` - Require human review

#### Fan-Out/Fan-In Runner
Parallel agent execution with deterministic aggregation.

**Location**: `packages/orchestrator-core/src/runners/fanout.ts`

**Key Methods**:
- `run(agents, input, parallelism, aggregation)` - Execute agents
- `aggregate(results, strategy)` - Aggregate results

**Parallelism Strategies**:
- `sequential` - One at a time
- `partial` - Limited concurrency
- `iterative` - Each uses previous output
- `controlled` - Custom concurrency control

**Aggregation Strategies**:
- `merge` - Deep merge objects
- `concat` - Concatenate arrays
- `vote` - Majority voting
- `custom` - Custom function

#### Release Dossier Compiler
Compiles complete release packages.

**Location**: `packages/orchestrator-core/src/dossier/release-dossier.ts`

**Key Methods**:
- `compile(runId)` - Compile complete dossier
- `exportDossier(dossier, format)` - Export to JSON/PDF/HTML
- `getSummary(runId)` - Get summary

## Event System

All phase events follow this structure:

```typescript
interface PhaseEvent {
  event: string;        // Event type
  timestamp: string;    // ISO 8601 timestamp
  runId: string;        // Run identifier
  phase: string;        // Phase name
  metadata?: any;       // Additional data
}
```

**Event Types**:
- `phase.started` - Phase begins
- `phase.progress` - Progress update
- `phase.ready` - Execution complete, ready for gate
- `phase.gate.passed` - Gate passed
- `phase.gate.failed` - Gate failed
- `phase.stalled` - No progress detected
- `phase.completed` - Phase fully complete

**Subscribing to Events**:
```typescript
phaseCoordinator.on('phase.started', (event) => {
  console.log(`Phase ${event.phase} started for run ${event.runId}`);
});

phaseCoordinator.on('phase.gate.failed', (event) => {
  console.log(`Gate failed: ${event.failure_reasons}`);
});
```

## Configuration

### Phase Configuration
Each phase is configured via YAML in `/config/`:

```yaml
phase: prd
parallelism: sequential
aggregation_strategy: merge
agents:
  - StoryCutterAgent
  - PRDWriterAgent
budgets:
  tokens: 200000
  tools_minutes: 15
  wallclock_minutes: 45
guards:
  - type: completeness
  - type: contradictions
gate:
  pass_threshold: 0.80
  auto_fix_enabled: true
  max_attempts: 5
qav:
  enabled: true
  max_questions: 15
  min_grounding_score: 0.85
```

### Q/A/V Configuration
```typescript
interface QAVConfig {
  enabled: boolean;
  max_questions: number;
  min_grounding_score: number;
  allow_inference: boolean;
  require_human_approval: boolean;
}
```

### Budget Configuration
```typescript
interface Budget {
  tokens: number;
  tools_minutes: number;
  wallclock_minutes: number;
}
```

## Database Schema

### Key Tables
- `runs` - Run tracking
- `phases` - Phase execution
- `tasks` - Task execution
- `checkpoints` - Execution checkpoints
- `budget_tracking` - Budget usage
- `knowledge_refinery` - Accumulated knowledge
- `clarification_loops` - Q/A/V cycles
- `ledger` - Event log

See `/migrations/` for complete schema.

## Error Handling

All methods throw typed errors:

```typescript
try {
  tracker.recordTokens('run:123', 100000);
} catch (error) {
  if (error.message.includes('budget exceeded')) {
    // Handle budget exceeded
  }
}
```

## TypeScript Types

All types are exported from `@ideamine/schemas`:

```typescript
import {
  PhaseContext,
  TaskSpec,
  EvidencePack,
  PhaseStartedEvent,
  Question,
  Answer,
  ValidationResult,
  KnowledgeEntry,
  Budget,
  Usage,
  BudgetStatus
} from '@ideamine/schemas';
```

## Examples

### Complete Phase Execution
```typescript
import { PhaseCoordinator } from '@ideamine/orchestrator-core';
import { QAVCoordinator } from '@ideamine/orchestrator-core/autonomy/qav';
import { KnowledgeRefinery } from '@ideamine/orchestrator-core/autonomy/knowledge-refinery';
import { BudgetTracker } from '@ideamine/orchestrator-core/budget';

// Initialize components
const refinery = new KnowledgeRefinery(db, apiKey);
await refinery.initialize();

const qav = new QAVCoordinator(apiKey, refinery, {
  enabled: true,
  max_questions: 15,
  min_grounding_score: 0.85,
  allow_inference: true,
  require_human_approval: false
});

const budgetTracker = new BudgetTracker(db);
const coordinator = new PhaseCoordinator(db, qav, budgetTracker);

// Set budget
budgetTracker.setBudget('run:123:prd', {
  tokens: 200000,
  tools_minutes: 15,
  wallclock_minutes: 45
});

// Execute phase
const result = await coordinator.executePhase(
  phaseConfig,
  context
);

console.log('Phase complete:', result.status);
console.log('Artifacts:', result.artifacts);
console.log('Budget status:', budgetTracker.getStatus('run:123:prd'));
```

## Further Reading

- [Orchestrator Specification](../orchestrator.txt)
- [Phase Execution Specification](../phase.txt)
- [Implementation Status](../IMPLEMENTATION_STATUS.md)
- [Integration Guide](../INTEGRATION_GUIDE.md)

## Service Endpoints

- **Orchestrator**: http://localhost:9000
- **Worker**: http://localhost:3001
- **API**: http://localhost:9002
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3003

## Support

For issues and questions:
- GitHub Issues: https://github.com/ideamine/orchestrator/issues
- Documentation: https://docs.ideamine.dev
