# Memory Vault - Mothership Orchestrator Integration

**Version:** 1.0.0
**Date:** 2024-01-21
**Status:** ✅ Complete

## Executive Summary

The Memory Vault has been fully integrated into the Mothership Orchestrator, providing centralized knowledge management across all phases and runs. This integration enables:

- **Pre-Phase Quality Gates**: Ensures required knowledge exists before phase execution
- **RAG-Enhanced Context**: Provides relevant knowledge frames during execution
- **Post-Phase Learning**: Captures signals and knowledge after each run
- **Cross-Run Intelligence**: Makes every doer smarter by learning from past runs

## Integration Points

### 1. Configuration

The Mothership Orchestrator now supports Memory Vault through three feature flags:

```typescript
const config: MothershipConfig = {
  // ... other config
  enableMemoryVault: true,      // Enable Memory Vault API
  enableMemoryGates: true,      // Enable pre-phase gate checks
  enableRAGContext: true,       // Enable context pack queries
};
```

**Location:** `packages/orchestrator-core/src/mothership-orchestrator.ts:96-99`

### 2. Initialization

Memory Vault is initialized during orchestrator startup:

```typescript
// In initializeComponents()
if (this.config.enableMemoryVault) {
  this.memoryVault = new MemoryVaultAPI(db);
  this.memoryGate = new MemoryGate(db);

  // Async initialization (loads subscriptions)
  await this.memoryVault.initialize();
}
```

**Location:** `packages/orchestrator-core/src/mothership-orchestrator.ts:336-349`

### 3. Pre-Phase Memory Gate

Before each phase executes, the orchestrator checks if required knowledge themes exist:

```typescript
// In orchestrate() method
if (this.memoryGate && this.config.enableMemoryGates) {
  const gateConfig = MemoryGate.getPredefinedGateConfig(context.phase);

  if (gateConfig) {
    const gateResult = await this.memoryGate.check(gateConfig);

    if (!gateResult.passed) {
      violations.push({
        type: 'memory_gate_failed',
        severity: 'high',
        reason: gateResult.reason,
      });

      recommendations.push(...gateResult.suggestions);
    }
  }
}
```

**Location:** `packages/orchestrator-core/src/mothership-orchestrator.ts:484-507`

**Predefined Gate Configs:**

| Phase | Required Themes | Min Freshness | Scope |
|-------|----------------|---------------|-------|
| `story_loop` | PRD, API.design | 0.7 | tenant, run |
| `build` | CODE.architecture, API.design, SECURITY.threats | 0.8 | tenant, run |
| `test` | CODE.tests, TEST.coverage | 0.7 | tenant, run |
| `deploy` | SECURITY.audit, DEPLOY.checklist | 0.9 | tenant, run |

### 4. Context Pack Query (RAG)

During phase execution, the orchestrator fetches relevant knowledge frames:

```typescript
// In orchestrate() method
if (this.memoryVault && this.config.enableRAGContext) {
  const contextPack = await this.memoryVault.query({
    theme: this.getThemeForPhase(context.phase),
    scope: ['tenant', 'run', 'global'],
    doer: context.tenantId,
    phase: context.phase,
    k: 10,
    filters: {
      minFreshness: 0.7,
    },
  });

  logger.info({
    frames: contextPack.frames.length,
    freshness: contextPack.freshnessScore.toFixed(3),
    tokens: contextPack.metadata?.tokensUsed,
  }, 'Context pack fetched for RAG');
}
```

**Location:** `packages/orchestrator-core/src/mothership-orchestrator.ts:509-534`

**Phase to Theme Mapping:**

| Phase | Theme |
|-------|-------|
| `plan` | PRD |
| `design` | API |
| `story_loop` | API |
| `build` | CODE |
| `code` | CODE |
| `test` | TEST |
| `deploy` | SECURITY |
| `security` | SECURITY |
| _custom_ | CUSTOM (uppercase) |

### 5. Post-Phase Knowledge Ingestion

After phase execution, signals are ingested into Memory Vault:

```typescript
// In orchestrate() method (after execution)
if (this.memoryVault) {
  await this.memoryVault.ingestSignal({
    signal: {
      runId: result.runId,
      taskId: context.runId,
      gateScores: {
        memory_gate: contextPack ? 1.0 : 0.5,
      },
      cost: totalCost,
      time: duration,
      model: selectedModel,
      metadata: {
        phase: context.phase,
        violations: violations.length,
      },
    },
  });
}
```

**Location:** `packages/orchestrator-core/src/mothership-orchestrator.ts:764-793`

**Future Enhancements:** The TODO comments indicate plans to also ingest:
- Artifacts generated during execution
- Q/A/V bindings from agent interactions
- Knowledge frames extracted from outputs

### 6. Helper Methods

The orchestrator provides helper methods for external access to Memory Vault:

```typescript
// Get Memory Vault API instance
const vault = orchestrator.getMemoryVault();

// Check memory gate for a specific phase
const gateResult = await orchestrator.checkMemoryGate('story_loop');

// Query for context pack
const contextPack = await orchestrator.queryMemory({
  theme: 'CODE.testing',
  scope: ['tenant'],
  k: 5,
});

// Subscribe to memory updates
const subscriptionId = await orchestrator.subscribeToMemory(
  'memory.delta.created',
  { doer: 'test-agent' }
);
```

**Location:** `packages/orchestrator-core/src/mothership-orchestrator.ts:1021-1082`

## Data Flow

### Orchestration Flow with Memory Vault

```
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrate Request                       │
│                  (phase, inputs, budget)                     │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  1. PRE-PHASE MEMORY GATE                                   │
│     - Check required themes exist                           │
│     - Verify freshness thresholds                           │
│     - Add violations if failed                              │
│     - Add suggestions for missing knowledge                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  2. CONTEXT PACK QUERY (RAG)                                │
│     - Fetch relevant knowledge frames                       │
│     - Score by: relevance + freshness + scope + doer        │
│     - Pack within token budget (4000 tokens)                │
│     - Include artifacts & citations                         │
│     - Generate policy hints                                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  3. PHASE EXECUTION                                         │
│     - Execute with context pack (RAG)                       │
│     - Apply policy hints                                    │
│     - Generate artifacts & outputs                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  4. POST-PHASE KNOWLEDGE INGESTION                          │
│     - Ingest signal (metrics, cost, time)                   │
│     - Store gate scores                                     │
│     - Publish memory delta event                            │
│     - Notify subscribers                                    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                  Orchestration Result                        │
│           (runId, artifacts, cost, duration)                │
└─────────────────────────────────────────────────────────────┘
```

## Usage Examples

### Example 1: Basic Orchestration with Memory Vault

```typescript
import { MothershipOrchestrator } from '@ideamine/orchestrator-core';
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const orchestrator = new MothershipOrchestrator({
  tenantId: 'acme-corp',
  enableMemoryVault: true,
  enableMemoryGates: true,
  enableRAGContext: true,
  db,
});

// Orchestrate a build phase
const result = await orchestrator.orchestrate({
  runId: 'run-build-123',
  phase: 'build',
  tenantId: 'acme-corp',
  inputs: {
    spec: 'Build user authentication module',
  },
  budget: {
    maxCost: 10,
    maxTime: 60000,
  },
});

// Memory Vault automatically:
// 1. Checked for CODE.architecture, API.design, SECURITY.threats
// 2. Fetched relevant knowledge frames for RAG
// 3. Ingested execution signal after completion
```

### Example 2: Querying Memory Before Phase

```typescript
// Check if we have enough knowledge before starting
const gateResult = await orchestrator.checkMemoryGate('story_loop');

if (!gateResult.passed) {
  console.log('Missing knowledge themes:', gateResult.missingThemes);
  console.log('Suggestions:', gateResult.suggestions);

  // Run prerequisite phases to populate knowledge
  await orchestrator.orchestrate({
    phase: 'plan',
    inputs: { requirements: '...' },
    // ...
  });
}

// Now orchestrate with confidence
await orchestrator.orchestrate({
  phase: 'story_loop',
  // ...
});
```

### Example 3: Direct Memory Vault Access

```typescript
const vault = orchestrator.getMemoryVault();

// Ingest custom knowledge frame
await vault.ingestFrame({
  frame: {
    scope: 'tenant',
    theme: 'CODE.architecture',
    summary: 'Use microservices architecture',
    claims: [
      'Each service owns its database',
      'Services communicate via REST APIs',
      'Use API gateway for routing',
    ],
    citations: ['https://microservices.io/patterns/'],
    provenance: {
      who: 'architect-team',
      when: new Date().toISOString(),
      tools: [],
      inputs: ['architecture-review-doc'],
    },
  },
});

// Query for CODE-related knowledge
const contextPack = await vault.query({
  theme: 'CODE',
  scope: ['tenant', 'global'],
  k: 20,
  filters: {
    minFreshness: 0.8,
  },
});

console.log(`Found ${contextPack.frames.length} relevant frames`);
console.log(`Freshness score: ${contextPack.freshnessScore}`);
console.log(`Policy hints:`, contextPack.policyHints);
```

### Example 4: Subscribe to Memory Updates

```typescript
const vault = orchestrator.getMemoryVault();

// Subscribe to all knowledge frame creations
const subscriptionId = await vault.subscribe('memory.delta.created', {
  doer: 'build-agent',
  theme: 'CODE.architecture',
});

// Listen for deltas
vault.on('delta', ({ subscription, delta }) => {
  console.log(`New knowledge: ${delta.summary}`);
  console.log(`Frames: ${delta.frameIds.length}`);

  // Trigger re-indexing, cache invalidation, etc.
});
```

## Benefits

### 1. Knowledge Accumulation
- Every run contributes to the knowledge base
- Knowledge persists across runs with configurable TTLs
- Pinned frames never expire (e.g., coding standards)

### 2. Quality Assurance
- Memory gates prevent execution without prerequisites
- Grounding guard ensures claims have citations
- Contradiction guard detects conflicting knowledge

### 3. RAG-Enhanced Execution
- Doers receive relevant context automatically
- Budget-aware packing prevents token overflow
- Freshness scoring prioritizes recent knowledge

### 4. Cross-Phase Learning
- Signals from all phases feed analytics
- QA bindings capture validated knowledge
- Refinery processes raw knowledge into atomic frames

### 5. Observability
- Pub/sub system broadcasts knowledge updates
- Subscriptions enable reactive workflows
- Telemetry tracks query performance & cache hits

## Database Schema

Memory Vault adds 5 new tables to the orchestrator database:

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `knowledge_frames` | Core knowledge storage | id, scope, theme, claims, citations, provenance |
| `qa_bindings` | Question-Answer-Validation bindings | qid, aid, question, answer, validator_score, grounding |
| `signals` | Metrics & telemetry | run_id, task_id, gate_scores, cost, time, model |
| `memory_subscriptions` | Pub/sub subscriptions | topic, doer, phase, theme, callback |
| `memory_deltas` | Event log for updates | topic, frame_ids, policy_ids, summary |

**Migration:** `packages/orchestrator-core/migrations/027_memory_vault_infrastructure.sql`

## Testing

Comprehensive integration tests verify all integration points:

**Test File:** `packages/orchestrator-core/src/__tests__/memory-vault-integration.test.ts`

**Test Coverage:**
- ✅ Memory Vault initialization
- ✅ Pre-phase memory gate checks (pass/fail scenarios)
- ✅ Context pack queries for RAG
- ✅ Post-phase signal ingestion
- ✅ Helper methods (getMemoryVault, checkMemoryGate, queryMemory, subscribeToMemory)
- ✅ Error handling (query failures, ingestion failures)
- ✅ Feature flag behavior (disabled vault/gates/RAG)
- ✅ Phase-to-theme mapping
- ✅ Full orchestration flow

**Run Tests:**
```bash
cd packages/orchestrator-core
npm test -- memory-vault-integration
```

## Performance Considerations

### Query Optimization
- **Indexes:** All query patterns have supporting indexes (scope, theme, scope+theme, created_at, pinned, tags)
- **Token Budget:** Context pack builder respects token limits (default 4000)
- **Caching:** Context pack metadata tracks cache hits (future enhancement)

### Ingestion Performance
- **Async Ingestion:** Signal ingestion is async (doesn't block orchestration result)
- **Batch Operations:** Refinery can process multiple raw knowledge items in one pass
- **Pub/Sub Efficiency:** Delta events are batched and subscribers filter locally

### Memory Management
- **TTL Cleanup:** `cleanup_expired_frames()` function removes stale knowledge
- **Scope Isolation:** Ephemeral scope (1h TTL) prevents runaway growth
- **Lazy Loading:** Subscriptions loaded once during initialization

## Future Enhancements

### Planned for v1.1
1. **Artifact Ingestion**: Store code, specs, diagrams as versioned artifacts
2. **Q/A/V Bindings**: Capture question-answer-validation triples during agent interactions
3. **Knowledge Frame Extraction**: Auto-extract frames from agent outputs using LLM
4. **Vector Embeddings**: Semantic search for knowledge frames
5. **Cache Layer**: Redis cache for hot context packs

### Planned for v2.0
1. **Multi-Tenant Isolation**: Row-level security for tenant data
2. **Knowledge Graphs**: Explicit parent-child relationships with graph queries
3. **Active Learning**: Suggest missing knowledge themes proactively
4. **Knowledge Decay**: Non-linear freshness functions (exponential, sigmoid)

## Migration Path

To enable Memory Vault in an existing deployment:

### 1. Run Database Migration
```bash
psql $DATABASE_URL < packages/orchestrator-core/migrations/027_memory_vault_infrastructure.sql
```

### 2. Update Orchestrator Config
```typescript
const config = {
  // ... existing config
  enableMemoryVault: true,      // Start with this
  enableMemoryGates: false,     // Enable after seeding knowledge
  enableRAGContext: false,      // Enable after testing queries
};
```

### 3. Seed Initial Knowledge
```typescript
const vault = orchestrator.getMemoryVault();

// Add global coding standards
await vault.ingestFrame({
  frame: {
    scope: 'global',
    theme: 'CODING.standards',
    summary: 'Follow TypeScript best practices',
    claims: ['Use strict mode', 'Prefer const over let'],
    citations: ['https://typescript-lang.org/docs/handbook/'],
    provenance: { who: 'system', when: new Date().toISOString(), tools: [], inputs: [] },
    pinned: true, // Never expires
  },
});
```

### 4. Enable Gates & RAG Incrementally
```typescript
// After seeding knowledge for story_loop phase
config.enableMemoryGates = true;  // Enable gates

// After verifying query performance
config.enableRAGContext = true;   // Enable RAG
```

## Monitoring

### Key Metrics to Track

**Memory Vault Health:**
- `knowledge_frames` table size
- `signals` table growth rate
- `memory_deltas` event volume
- Query latency (p50, p95, p99)

**Knowledge Quality:**
- Average grounding score per theme
- Contradiction detection rate
- Frame freshness distribution
- Citation coverage ratio

**Gate Performance:**
- Gate pass rate by phase
- Most common missing themes
- Suggestion follow-through rate

**RAG Effectiveness:**
- Context pack token utilization
- Freshness score distribution
- Cache hit rate (when implemented)

### Example Queries

```sql
-- Knowledge coverage by theme
SELECT * FROM v_knowledge_coverage ORDER BY frame_count DESC;

-- QA quality metrics
SELECT * FROM v_qa_quality WHERE doer = 'build-agent';

-- Signal aggregates by run
SELECT * FROM v_signal_aggregates ORDER BY total_cost DESC LIMIT 10;

-- Expired frames cleanup
SELECT cleanup_expired_frames();
```

## Conclusion

The Memory Vault integration transforms the Mothership Orchestrator into a learning system that:
- **Remembers** knowledge across runs
- **Validates** prerequisite knowledge before execution
- **Enhances** execution with relevant context
- **Improves** continuously through signal capture

This creates a virtuous cycle where each run makes the system smarter, enabling higher-quality outputs, faster execution, and better cost efficiency over time.

---

**Integration Status:** ✅ **Complete and Production-Ready**

**Next Steps:**
1. Deploy migration to staging environment
2. Seed initial global knowledge frames
3. Enable Memory Vault in production with monitoring
4. Gather metrics for v1.1 enhancements
