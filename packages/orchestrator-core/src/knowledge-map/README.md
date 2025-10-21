# Knowledge Map Module

## Overview

The Knowledge Map module provides a production-ready system for managing questions, answers, and knowledge throughout the IdeaMine workflow phases. It includes:

- **Core Client**: Insert and query questions, answers, and bindings
- **Carry-Over Manager**: Propagate unresolved questions across phases
- **Contradiction Detection**: Identify conflicts with existing knowledge
- **Management Tools**: Query, supersede, and resolve knowledge entries

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  EnhancedPhaseCoordinator                │
│  ┌───────────────────────────────────────────────────┐  │
│  │  1. Load Carry-Over Questions (from prev phases)  │  │
│  │  2. Generate Q/A (QAQ + QAA agents)               │  │
│  │  3. Validate (QV with contradiction detection)    │  │
│  │  4. Refine (optional Refinery pipeline)           │  │
│  │  5. Persist to Knowledge Map                      │  │
│  │  6. Update Question Statuses                      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Enable Knowledge Map in Coordinator

```typescript
import { PRDCoordinator } from '@ideamine/orchestrator-core';
import { Pool } from 'pg';

const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const coordinator = new PRDCoordinator({
  enableKnowledgeMap: true,   // ✅ Enable KM
  enableRefinery: true,        // ✅ Enable Refinery (optional)
  dbPool,                      // ✅ Required for carry-over and contradiction detection
  knowledgeMapConnectionString: process.env.DATABASE_URL,
});

const result = await coordinator.execute({
  workflowRunId: 'run-123',
  artifacts: [...],
});
```

### 2. Use Management Tools

```typescript
import {
  KMQueryTool,
  KMSupersedeTool,
  KMResolveTool,
  KMCarryOverManager,
} from '@ideamine/orchestrator-core/knowledge-map';

// Initialize tools
const queryTool = new KMQueryTool(dbPool);
const supersedeTool = new KMSupersedeTool(dbPool);
const resolveTool = new KMResolveTool(dbPool);
const carryOverManager = new KMCarryOverManager(dbPool);

// Query knowledge
const results = await queryTool.queryByText({
  searchText: 'target latency',
  phase: 'PRD',
  limit: 10,
});

// Get unresolved questions
const unresolved = await queryTool.getUnresolvedQuestions('PRD');

// Get carry-over statistics
const stats = await carryOverManager.getCarryOverStats('BIZDEV');
```

## Module Structure

```
src/knowledge-map/
├── km-client.ts              # Core KM database client
├── km-carry-over.ts          # Cross-phase question propagation
├── km-management-tools.ts    # Query, supersede, resolve tools
├── index.ts                  # Public API exports
└── README.md                 # This file
```

## Core Components

### 1. KnowledgeMapClient

**Purpose**: Core database operations for questions, answers, and bindings.

**Methods**:
```typescript
class KnowledgeMapClient {
  // Insert operations
  async insertQuestions(questions: KMQuestion[]): Promise<void>
  async insertAnswers(answers: KMAnswer[]): Promise<void>
  async insertBindings(bindings: KMBinding[]): Promise<number>

  // Query operations
  async getQuestions(phase: string, runId: string): Promise<KMQuestion[]>
  async getAnswers(phase: string, runId: string): Promise<KMAnswer[]>
  async queryCoverageMetrics(phase: string, runId: string): Promise<KMCoverageMetrics>
}
```

**Example**:
```typescript
const kmClient = new KnowledgeMapClient(connectionString);

// Insert questions
await kmClient.insertQuestions([
  {
    id: 'Q-PRD-001',
    phase: 'PRD',
    run_id: 'run-123',
    text: 'What is the target latency?',
    tags: ['performance', 'requirements'],
    priority: 0.9,
    depends_on: [],
    status: 'open',
    generated_by: 'QAQ-PRD',
  },
]);

// Insert answers
await kmClient.insertAnswers([
  {
    id: 'A-PRD-001',
    question_id: 'Q-PRD-001',
    answer: 'Target latency is < 200ms for 95th percentile',
    evidence_ids: ['ARTIFACT-PRD-001'],
    assumptions: [],
    confidence: 0.9,
    generated_by: 'QAA-PRD',
  },
]);

// Insert binding
await kmClient.insertBindings([
  {
    question_id: 'Q-PRD-001',
    answer_id: 'A-PRD-001',
    score_grounding: 0.9,
    score_completeness: 0.85,
    score_specificity: 0.9,
    score_consistency: 1.0,
    decision: 'accept',
    reasons: [],
    hints: [],
    validated_by: 'QV-PRD',
  },
]);
```

### 2. KMCarryOverManager

**Purpose**: Propagate unresolved questions across workflow phases.

**Key Features**:
- Loads questions with status `open` or `partial` from previous phases
- Configurable priority threshold (default: ≥ 0.5)
- Configurable max questions (default: 50)
- Automatically updates question statuses based on answer acceptance
- Tracks carry-over lineage with edges

**Methods**:
```typescript
class KMCarryOverManager {
  async getCarryOverQuestions(config: CarryOverConfig): Promise<CarryOverQuestion[]>
  async updatePhaseQuestionStatuses(phase: string, runId: string): Promise<StatusCounts>
  async markAsCarriedOver(questionId: string, fromPhase: string, toPhase: string): Promise<void>
  async getCarryOverStats(phase: string): Promise<CarryOverStats>
}
```

**Example**:
```typescript
const carryOverManager = new KMCarryOverManager(dbPool);

// Load unresolved questions from previous phases
const carryOverQuestions = await carryOverManager.getCarryOverQuestions({
  currentPhase: 'BIZDEV',
  runId: 'run-123',
  maxQuestions: 50,
  minPriority: 0.5,
});

console.log(`Found ${carryOverQuestions.length} carry-over questions`);

// Update statuses after phase completion
const counts = await carryOverManager.updatePhaseQuestionStatuses('BIZDEV', 'run-123');
console.log(`Resolved: ${counts.resolved}, Partial: ${counts.partial}, Open: ${counts.open}`);

// Get carry-over statistics
const stats = await carryOverManager.getCarryOverStats('BIZDEV');
console.log(`Total unresolved: ${stats.totalUnresolvedFromPrevious}`);
console.log(`High priority: ${stats.highPriorityUnresolved}`);
console.log(`Avg age: ${stats.avgAgeInDays} days`);
```

**Phase Order**:
```
INTAKE → IDEATION → CRITIQUE → PRD → BIZDEV → ARCH →
BUILD → CODING → QA → AESTHETIC → RELEASE → BETA → GA
```

### 3. KMQueryTool

**Purpose**: Search and retrieve knowledge from the map.

**Methods**:
```typescript
class KMQueryTool {
  async queryByText(params: {
    searchText: string;
    phase?: string;
    limit?: number;
  }): Promise<KMQueryResult[]>

  async queryByQuestionId(questionId: string): Promise<KMQueryResult | null>

  async getUnresolvedQuestions(phase?: string): Promise<UnresolvedQuestion[]>
}
```

**Example**:
```typescript
const queryTool = new KMQueryTool(dbPool);

// Search by text
const results = await queryTool.queryByText({
  searchText: 'latency',
  phase: 'PRD',
  limit: 10,
});

results.forEach((result) => {
  console.log(`Q: ${result.question}`);
  console.log(`A: ${result.answer}`);
  console.log(`Quality: ${JSON.stringify(result.quality)}`);
});

// Get specific question
const question = await queryTool.queryByQuestionId('Q-PRD-001');
if (question) {
  console.log(`Status: ${question.status}`);
  console.log(`Priority: ${question.priority}`);
}

// Get all unresolved questions
const unresolved = await queryTool.getUnresolvedQuestions('PRD');
console.log(`Found ${unresolved.length} unresolved questions`);
```

### 4. KMSupersedeTool

**Purpose**: Mark old knowledge as superseded by new knowledge.

**Methods**:
```typescript
class KMSupersedeTool {
  async supersede(params: {
    oldNodeId: string;
    newNodeId: string;
    reason: string;
    supersededBy: string;
  }): Promise<SupersedeResult>

  async getSupersessionHistory(nodeId: string): Promise<SupersessionHistoryEntry[]>
}
```

**Example**:
```typescript
const supersedeTool = new KMSupersedeTool(dbPool);

// Supersede old answer with new one
await supersedeTool.supersede({
  oldNodeId: 'KM-Q-PRD-001-A-PRD-001',
  newNodeId: 'KM-Q-PRD-001-A-PRD-015',
  reason: 'Updated latency requirement after performance testing',
  supersededBy: 'PRD-Coordinator',
});

// Get supersession history (recursive chain)
const history = await supersedeTool.getSupersessionHistory('KM-Q-PRD-001-A-PRD-001');
history.forEach((entry) => {
  console.log(`Depth ${entry.depth}: ${entry.nodeId} (active: ${entry.isActive})`);
  if (entry.supersededBy) {
    console.log(`  → Superseded by: ${entry.supersededBy}`);
  }
});
```

### 5. KMResolveTool

**Purpose**: Resolve contradictions by choosing the correct answer.

**Methods**:
```typescript
class KMResolveTool {
  async resolveContradiction(params: {
    questionId: string;
    chosenAnswerId: string;
    rejectedAnswerIds: string[];
    reason: string;
    resolvedBy: string;
  }): Promise<ResolveResult>

  async getConflicts(phase?: string): Promise<ConflictEntry[]>
}
```

**Example**:
```typescript
const resolveTool = new KMResolveTool(dbPool);

// Get all conflicts
const conflicts = await resolveTool.getConflicts('PRD');
console.log(`Found ${conflicts.length} conflicts`);

conflicts.forEach((conflict) => {
  console.log(`\nQuestion: ${conflict.question}`);
  console.log('Conflicting answers:');
  conflict.conflictingAnswers.forEach((answer) => {
    console.log(`  - ${answer.answerId}: ${answer.answer}`);
  });
});

// Resolve a specific conflict
await resolveTool.resolveContradiction({
  questionId: 'Q-PRD-001',
  chosenAnswerId: 'A-PRD-015',
  rejectedAnswerIds: ['A-PRD-001', 'A-PRD-008'],
  reason: 'A-PRD-015 has the most recent and accurate latency requirement',
  resolvedBy: 'ProductManager',
});
```

## Data Models

### Question Status Lifecycle

```
open → partial → resolved
 ↓       ↓         ↓
 └───────┴─────────┘
   (can transition back)
```

- **open**: No answers
- **partial**: Has answers but none accepted
- **resolved**: Has at least one accepted answer

### Quality Scores

All bindings include 4 quality dimensions (0.0 - 1.0):

```typescript
{
  score_grounding: 0.9,     // Evidence quality
  score_completeness: 0.85, // Fully addresses question
  score_specificity: 0.8,   // Concrete vs vague
  score_consistency: 1.0,   // No conflicts with KM
}
```

### Database Schema

**Core Tables**:
- `questions` - All questions with status tracking
- `answers` - All answers with confidence scores
- `bindings` - Q/A pairs with validation scores + decision
- `km_nodes` - Active knowledge entries
- `km_edges` - Relationships (supersedes, carried_over, etc.)

## Configuration

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/ideamine

# Optional (for contradiction detection)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Coordinator Options

```typescript
interface EnhancedPhaseCoordinatorConfig {
  enableKnowledgeMap?: boolean;              // Enable KM (default: false)
  knowledgeMapConnectionString?: string;     // PostgreSQL connection
  enableRefinery?: boolean;                  // Enable 12-stage pipeline (default: false)
  dbPool?: Pool;                             // Required for carry-over + contradiction detection
}
```

### Carry-Over Configuration

```typescript
interface CarryOverConfig {
  currentPhase: string;
  runId: string;
  maxQuestions?: number;   // Default: 50
  minPriority?: number;    // Default: 0.5
}
```

## Monitoring

### Key Metrics

```sql
-- Question status distribution by phase
SELECT
  phase,
  COUNT(*) FILTER (WHERE status = 'open') AS open_count,
  COUNT(*) FILTER (WHERE status = 'partial') AS partial_count,
  COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_count
FROM questions
GROUP BY phase;

-- Contradiction detection rate
SELECT
  phase,
  COUNT(*) AS total_validations,
  COUNT(*) FILTER (WHERE score_consistency = 0.0) AS conflicts_detected,
  ROUND(100.0 * COUNT(*) FILTER (WHERE score_consistency = 0.0) / COUNT(*), 2) AS conflict_rate
FROM bindings
GROUP BY phase;

-- Carry-over statistics
SELECT
  phase,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400) AS avg_age_days,
  COUNT(*) FILTER (WHERE priority >= 0.7) AS high_priority_count
FROM questions
WHERE status IN ('open', 'partial')
GROUP BY phase;

-- Supersession tracking
SELECT
  COUNT(*) FILTER (WHERE is_active = true) AS active_nodes,
  COUNT(*) FILTER (WHERE is_active = false) AS superseded_nodes
FROM km_nodes;
```

## Best Practices

### 1. Question Priority

Set priority based on importance:
- **0.9-1.0**: Critical questions (must be answered)
- **0.7-0.8**: High priority (should be answered)
- **0.5-0.6**: Medium priority (nice to have)
- **0.0-0.4**: Low priority (optional)

### 2. Carry-Over Management

- Review carry-over stats regularly
- Address high-priority unresolved questions first
- Consider increasing `maxQuestions` for critical phases
- Lower `minPriority` threshold if too many questions are filtered

### 3. Contradiction Resolution

- Use `getConflicts()` to identify all conflicts periodically
- Resolve contradictions promptly to maintain knowledge quality
- Document resolution reasons for audit trail
- Consider using LLM-powered automated resolution for low-risk conflicts

### 4. Knowledge Supersession

- Use supersession instead of deletion to maintain history
- Always provide clear reasons for supersession
- Review supersession chains periodically to detect knowledge evolution patterns

## Troubleshooting

### High Carry-Over Count

**Problem**: Too many questions carry over to next phase

**Solutions**:
- Review question generation logic (QAQ agent)
- Improve answer quality (QAA agent)
- Lower validation thresholds temporarily
- Increase phase duration to allow more Q/A coverage

### Contradiction Detection False Positives

**Problem**: Valid answers flagged as contradictions

**Solutions**:
- Use rule-based mode (`useLLM: false`) for numeric-only conflicts
- Adjust similarity thresholds in contradiction tool
- Review existing KM for outdated knowledge that should be superseded

### Poor Query Performance

**Problem**: Slow text search queries

**Solutions**:
- Add database indexes: `CREATE INDEX ON questions USING gin(tags);`
- Limit search scope with `phase` parameter
- Reduce `limit` parameter for large result sets
- Consider full-text search with PostgreSQL `ts_vector`

## Migration Guide

### From Basic KM to Enhanced KM

1. **Enable carry-over**:
   ```typescript
   // Before
   const coordinator = new PRDCoordinator({
     enableKnowledgeMap: true,
   });

   // After
   const coordinator = new PRDCoordinator({
     enableKnowledgeMap: true,
     dbPool,  // Add this
   });
   ```

2. **No schema changes required** - All features use existing KM schema

3. **Opt-in features** - Carry-over and contradiction detection activate automatically when `dbPool` is provided

## API Reference

See full type definitions in:
- `/src/knowledge-map/km-client.ts`
- `/src/knowledge-map/km-carry-over.ts`
- `/src/knowledge-map/km-management-tools.ts`
- `/src/knowledge-map/index.ts`

## Examples

Complete examples available in:
- `/tests/integration/knowledge-map-integration.test.ts`
- `/KNOWLEDGE_MAP_FEATURES_SUMMARY.md`

## Support

For questions or issues:
1. Review this README
2. Check `/KNOWLEDGE_MAP_FEATURES_SUMMARY.md` for detailed feature documentation
3. Review integration tests for usage examples
4. Check database logs for connection/query issues
