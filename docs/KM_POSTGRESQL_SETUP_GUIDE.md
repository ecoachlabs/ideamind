# Knowledge Map PostgreSQL Setup Guide

This guide shows you how to set up and use the PostgreSQL-backed Knowledge Map system in your IdeaMine phase coordinators.

## Prerequisites

1. PostgreSQL 15+ installed
2. IdeaMine packages built (`npm run build` in workspace root)
3. Environment variables configured

## Step 1: Database Setup

### Create the Knowledge Map Database

```bash
# Create database
createdb knowledge_map

# Or using psql
psql -U postgres
CREATE DATABASE knowledge_map;
\q
```

### Apply Schema

```bash
# Apply Knowledge Map schema
psql -U postgres -d knowledge_map < packages/tool-sdk/src/db/knowledge-map-schema.sql

# Verify tables created
psql -U postgres -d knowledge_map
\dt
```

You should see tables:
- `questions`
- `answers`
- `bindings`
- `km_nodes`
- `km_edges`
- `km_conflicts`
- `km_backlog`
- `km_coverage` (view)

## Step 2: Set Environment Variables

```bash
# Add to your .env file or export directly
export KNOWLEDGE_MAP_DB_URL="postgresql://postgres:password@localhost:5432/knowledge_map"

# Optional: For development, use a separate test database
export KNOWLEDGE_MAP_DB_URL_TEST="postgresql://postgres:password@localhost:5432/knowledge_map_test"
```

## Step 3: Enable Knowledge Map in Phase Coordinator

### Example: PRD Phase Coordinator

```typescript
// packages/agents/src/prd/prd-phase-coordinator.ts

import { EnhancedPhaseCoordinator } from '@ideamine/orchestrator-core';
import { PRDGatekeeper } from './prd-gatekeeper';
import { PRDWriterAgent } from './prd-writer-agent';

export class PRDPhaseCoordinator extends EnhancedPhaseCoordinator {
  constructor() {
    super({
      phase: 'prd',
      agents: [
        new PRDWriterAgent({
          agentId: 'prd-writer',
          phase: 'prd',
        }),
      ],
      gatekeeper: new PRDGatekeeper(),

      // Enable Knowledge Map generation
      enableKnowledgeMap: true,
      knowledgeMapConnectionString: process.env.KNOWLEDGE_MAP_DB_URL,

      // Optional: Recorder and Dispatcher
      recorder: myRecorder,
      dispatcher: myDispatcher,
    });
  }

  /**
   * Prepare gate input with phase-specific metrics + KM metrics
   */
  protected async prepareGateInput(
    phaseInput: PhaseInput,
    phaseResult: PhaseOutput
  ): Promise<GateEvaluationInput> {
    // Calculate phase-specific metrics
    const prdMetrics = {
      runId: phaseInput.workflowRunId,
      ac_completeness: this.calculateACCompleteness(phaseResult),
      rtm_coverage: this.calculateRTMCoverage(phaseResult),
      nfr_coverage: this.calculateNFRCoverage(phaseResult),
    };

    // Enrich with Knowledge Map metrics
    const enrichedMetrics = await this.enrichGateInputWithKMMetrics(prdMetrics);

    return {
      runId: phaseInput.workflowRunId,
      phase: this.phaseName,
      artifacts: phaseResult.artifacts || [],
      metrics: enrichedMetrics,
    };
  }

  private calculateACCompleteness(phaseResult: PhaseOutput): number {
    // Your existing logic
    const userStories = phaseResult.artifacts?.find((a) => a.type === 'user-stories');
    if (!userStories) return 0;

    const stories = (userStories.content as any).stories || [];
    const storiesWithAC = stories.filter((s: any) => s.acceptance_criteria && s.acceptance_criteria.length > 0);

    return storiesWithAC.length / Math.max(stories.length, 1);
  }

  private calculateRTMCoverage(phaseResult: PhaseOutput): number {
    // Your existing logic
    const rtm = phaseResult.artifacts?.find((a) => a.type === 'rtm');
    if (!rtm) return 0;

    const links = (rtm.content as any).links || [];
    const requirements = (rtm.content as any).requirements || [];

    return links.length / Math.max(requirements.length, 1);
  }

  private calculateNFRCoverage(phaseResult: PhaseOutput): number {
    // Your existing logic
    return 0.85;
  }
}
```

## Step 4: Update PRD Gatekeeper with KM Metrics

```typescript
// packages/agents/src/prd/prd-gatekeeper.ts

import { Gatekeeper, GateRubric } from '@ideamine/orchestrator-core';

export class PRDGatekeeper extends Gatekeeper {
  constructor() {
    const rubric: GateRubric = {
      id: 'prd-gate',
      name: 'PRD Quality Gate',
      description: 'Ensures PRD completeness, traceability, and KM coverage',
      minimumScore: 75,
      metrics: [
        // Existing PRD metrics
        {
          id: 'ac_completeness',
          name: 'Acceptance Criteria Completeness',
          description: 'Percentage of user stories with complete AC',
          type: 'percentage',
          operator: '>=',
          threshold: 0.85,
          weight: 0.25,
          required: true,
        },
        {
          id: 'rtm_coverage',
          name: 'Requirements Traceability Matrix Coverage',
          description: 'Percentage of requirements with traced links',
          type: 'percentage',
          operator: '>=',
          threshold: 0.90,
          weight: 0.20,
          required: true,
        },
        {
          id: 'nfr_coverage',
          name: 'NFR Coverage',
          description: 'Percentage of NFRs specified',
          type: 'percentage',
          operator: '>=',
          threshold: 0.80,
          weight: 0.15,
          required: true,
        },

        // NEW: Knowledge Map metrics
        {
          id: 'km_coverage_ratio',
          name: 'Knowledge Map Coverage',
          description: 'Percentage of priority themes documented in KM',
          type: 'percentage',
          operator: '>=',
          threshold: 0.70, // 70% of themes must be covered
          weight: 0.15,
          required: true, // Block if coverage too low
        },
        {
          id: 'km_high_priority_open',
          name: 'Critical Unanswered Questions',
          description: 'Count of high-priority questions without answers',
          type: 'count',
          operator: '=',
          threshold: 0, // Must have zero unanswered critical questions
          weight: 0.15,
          required: true, // Block if critical questions remain
        },
        {
          id: 'km_acceptance_rate',
          name: 'Knowledge Map Quality',
          description: 'Percentage of Q/A pairs that passed validation',
          type: 'percentage',
          operator: '>=',
          threshold: 0.80, // 80% of pairs should pass
          weight: 0.05,
          required: false, // Warning only
        },
        {
          id: 'km_critical_conflicts',
          name: 'Unresolved KM Conflicts',
          description: 'Count of contradictions in Knowledge Map',
          type: 'count',
          operator: '=',
          threshold: 0, // Must resolve all conflicts
          weight: 0.05,
          required: true, // Block if conflicts exist
        },
      ],
    };

    super(
      'prd-gate',
      'PRD Quality Gate',
      rubric,
      ['PRD', 'UserStories', 'AcceptanceCriteria', 'RTM', 'NFR'], // Required artifacts
    );
  }
}
```

## Step 5: Test the Integration

### Run a PRD Phase

```typescript
// Example test or workflow
import { PRDPhaseCoordinator } from './packages/agents/src/prd/prd-phase-coordinator';

const coordinator = new PRDPhaseCoordinator();

const result = await coordinator.execute({
  workflowRunId: 'test-run-123',
  phase: 'prd',
  context: {
    projectName: 'MyApp',
    ideaSpec: {...},
  },
  budget: {
    maxCostUsd: 5.0,
    maxTokens: 100000,
  },
});

console.log('Phase result:', result);
console.log('Knowledge Map updated with Q/A pairs');
```

### Check Database

```sql
-- Check questions generated
SELECT id, phase, text, priority, status FROM questions WHERE run_id = 'test-run-123';

-- Check answers
SELECT q.text as question, a.answer, a.confidence
FROM questions q
JOIN answers a ON q.id = a.question_id
WHERE q.run_id = 'test-run-123';

-- Check bindings (validation results)
SELECT
  q.text as question,
  b.decision,
  b.score_grounding,
  b.score_completeness,
  b.score_specificity,
  b.score_consistency
FROM bindings b
JOIN questions q ON b.question_id = q.id
WHERE q.run_id = 'test-run-123';

-- Check Knowledge Map nodes (accepted Q/A pairs)
SELECT node_id, question, answer, phase
FROM km_nodes
WHERE run_id = 'test-run-123';

-- Check coverage metrics
SELECT * FROM km_coverage WHERE run_id = 'test-run-123' AND phase = 'PRD';
```

## Step 6: Query Knowledge Map via API

### Start Knowledge Map Service

```bash
cd services/knowledge-map
pip install -r requirements.txt
python src/main.py
```

Service will be available at `http://localhost:8003`

### Search Knowledge Map

```bash
# Semantic search
curl -X POST http://localhost:8003/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the NFR requirements for API latency?",
    "phase": "PRD",
    "limit": 10
  }'

# Get coverage metrics
curl http://localhost:8003/api/v1/coverage/PRD/test-run-123

# Detect conflicts
curl -X POST http://localhost:8003/api/v1/conflicts/detect \
  -H "Content-Type: application/json" \
  -d '{
    "new_answer": {
      "question": "How long do we retain user data?",
      "answer": "User data is retained for 90 days"
    },
    "phase": "PRD"
  }'
```

## Execution Flow

When you run a phase with Knowledge Map enabled:

```
1. PRDPhaseCoordinator.execute(input)
   ├─ Execute PRDWriterAgent → Generate PRD document
   │
   ├─ runKnowledgeMapGeneration()
   │   ├─ Spawn QAQ-PRD agent → Generate 15 questions
   │   ├─ Spawn QAA-PRD agent → Answer 15 questions with evidence
   │   ├─ Spawn QV-PRD validator → Validate Q/A pairs (12 accepted, 3 rejected)
   │   └─ persistToKnowledgeMap()
   │       ├─ INSERT INTO questions (15 rows)
   │       ├─ INSERT INTO answers (15 rows)
   │       ├─ INSERT INTO bindings (15 rows)
   │       └─ Call create_km_node_from_binding() for 12 accepted bindings
   │           ├─ INSERT INTO km_nodes (12 rows)
   │           └─ INSERT INTO km_edges (dependencies)
   │
   ├─ prepareGateInput()
   │   ├─ Calculate PRD metrics (AC completeness, RTM coverage, NFR coverage)
   │   └─ enrichGateInputWithKMMetrics()
   │       └─ kmClient.queryCoverageMetrics()
   │           ├─ Query km_coverage view → coverage_ratio: 0.75, acceptance_rate: 0.80
   │           ├─ Query questions table → high_priority_open: 0
   │           └─ Query km_conflicts table → critical_conflicts: 0
   │
   ├─ PRDGatekeeper.evaluate()
   │   ├─ Evaluate metrics:
   │   │   ✓ ac_completeness: 0.92 >= 0.85
   │   │   ✓ rtm_coverage: 0.95 >= 0.90
   │   │   ✓ nfr_coverage: 0.85 >= 0.80
   │   │   ✓ km_coverage_ratio: 0.75 >= 0.70
   │   │   ✓ km_high_priority_open: 0 = 0
   │   │   ✓ km_acceptance_rate: 0.80 >= 0.80
   │   │   ✓ km_critical_conflicts: 0 = 0
   │   ├─ Calculate overall score: 87/100
   │   ├─ Status: PASS
   │   └─ Decision: Proceed to next phase
   │
   └─ Return success
```

## Troubleshooting

### Connection Errors

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution**: Ensure PostgreSQL is running
```bash
# Check status
pg_ctl status

# Start PostgreSQL (macOS)
brew services start postgresql@15

# Start PostgreSQL (Linux)
sudo systemctl start postgresql
```

### Schema Errors

```
Error: relation "questions" does not exist
```

**Solution**: Apply schema
```bash
psql -U postgres -d knowledge_map < packages/tool-sdk/src/db/knowledge-map-schema.sql
```

### Permission Errors

```
Error: permission denied for table questions
```

**Solution**: Grant permissions
```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;
```

### No KM Metrics in Gate

```
Warning: KM Client not initialized, returning default metrics
```

**Solution**: Ensure `knowledgeMapConnectionString` is set
```typescript
enableKnowledgeMap: true,
knowledgeMapConnectionString: process.env.KNOWLEDGE_MAP_DB_URL, // Make sure this is set!
```

## Performance Optimization

### Add Indexes for Fast Queries

```sql
-- Index on phase + run_id for coverage queries
CREATE INDEX idx_questions_phase_run ON questions(phase, run_id, status);
CREATE INDEX idx_km_nodes_phase_run ON km_nodes(phase, run_id);

-- Index on priority for high-priority queries
CREATE INDEX idx_questions_priority ON questions(priority DESC) WHERE status = 'open';

-- Full-text search index
CREATE INDEX idx_questions_text_search ON questions USING gin(to_tsvector('english', text));
CREATE INDEX idx_km_nodes_text_search ON km_nodes USING gin(to_tsvector('english', question || ' ' || answer));
```

### Connection Pooling

The KnowledgeMapClient uses connection pooling by default (max 10 connections). For high-traffic deployments, tune the pool:

```typescript
const kmClient = new KnowledgeMapClient(connectionString);
// Pool configuration is handled internally with sensible defaults
```

### Caching Coverage Metrics

For frequently queried coverage metrics, consider caching:

```typescript
import NodeCache from 'node-cache';

const coverageCache = new NodeCache({ stdTTL: 60 }); // Cache for 60 seconds

protected async queryKnowledgeMapCoverage(runId: string): Promise<Record<string, number>> {
  const cacheKey = `${this.phaseName}:${runId}`;
  const cached = coverageCache.get(cacheKey);
  if (cached) return cached as Record<string, number>;

  const metrics = await this.kmClient?.queryCoverageMetrics(this.phaseName, runId);
  if (metrics) {
    coverageCache.set(cacheKey, metrics);
  }
  return metrics;
}
```

## Next Steps

1. **Add all 12 phase coordinators** with KM enabled
2. **Configure gatekeepers** with appropriate KM metric thresholds
3. **Set up monitoring** (see `/docs/KM_MONITORING_GUIDE.md`)
4. **Implement vector search** for semantic search (see `/docs/KM_VECTOR_SEARCH.md`)
5. **Create KM dashboard** for visualization (see `/docs/KM_DASHBOARD.md`)

## References

- **KM Client Source**: `/packages/orchestrator-core/src/knowledge-map/km-client.ts`
- **Enhanced Coordinator**: `/packages/orchestrator-core/src/base/enhanced-phase-coordinator.ts`
- **Gatekeeper Integration**: `/docs/KNOWLEDGE_MAP_GATEKEEPER_GUIDE.md`
- **Database Schema**: `/packages/tool-sdk/src/db/knowledge-map-schema.sql`
- **KM Service**: `/services/knowledge-map/src/main.py`
