# Knowledge Refinery System

## Overview

The **Knowledge Refinery** is a 12-stage post-processing pipeline that transforms raw Q/A/V (Question/Answer/Validation) outputs from the Knowledge Map system into polished, production-ready knowledge entries.

## Architecture

```
Raw Q/A/V → [12-Stage Pipeline] → Refined Knowledge → Knowledge Map Database
```

### 12-Stage Pipeline

1. **Normalization**: Text canonicalization, unit standardization, alias resolution
2. **PII Redaction**: Remove sensitive information (emails, phone numbers, API keys, etc.)
3. **Content Hashing**: Generate SHA-256 hashes for idempotence
4. **Deduplication**: Detect and handle exact/fuzzy duplicates
5. **Fission**: Decompose compound questions into atomic units
6. **Entity Linking**: Resolve entity mentions to canonical forms
7. **Embedding Generation**: Create vector embeddings for semantic search
8. **Clustering**: Group similar answers by topic
9. **Fusion**: Synthesize multiple answers into canonical knowledge
10. **Knowledge Frame Extraction**: Structure knowledge into Who/What/When/Where/Why/How slots
11. **Version Management**: Track answer evolution with supersedes edges
12. **Delta Publishing**: Emit kmap.delta.* events for cache warming

## Features

### Fission (Question Decomposition)

Breaks compound questions into atomic sub-questions with dependency trees.

**Example:**
```
Input: "What are the API performance requirements and how do we monitor them?"

Output:
- ATOM-1: "What is the target response time for API calls?" (priority: high)
- ATOM-2: "What monitoring tools should we use for API performance?" (priority: high)
- ATOM-3: "What metrics should we track for API monitoring?" (priority: medium)

Dependencies:
- ATOM-2 depends_on ATOM-1 (need targets before choosing tools)
- ATOM-3 depends_on ATOM-2 (metrics depend on tools)

Coverage: 0.92 (92% of original question covered by atoms)
```

### Fusion (Answer Synthesis)

Combines multiple related answers into a single canonical answer with conflict resolution.

**Example:**
```
Input:
- Answer 1: "API response time should be < 200ms at p95"
- Answer 2: "Target is 500ms for API calls"
- Answer 3: "We aim for sub-200ms latency"

Conflicts Detected:
- Conflicting response times: 200ms vs 500ms (high severity)

Canonical Answer:
"API response time target is < 200ms at p95 latency (supported by [A-001] and [A-003]).
Note: One source indicated 500ms ([A-002]), but this conflicts with the PRD requirements."

Consensus Confidence: 0.75
Compression Rate: 3:1 (3 answers → 1 canonical)
```

### Knowledge Frames

Structured knowledge representation using Who/What/When/Where/Why/How slots.

**Example:**
```json
{
  "who": "Backend Team",
  "what": "API response time requirement",
  "when": "Sprint 3 implementation",
  "where": "Backend API layer",
  "why": "To meet SLA requirements for enterprise customers",
  "how": "Using Redis caching and database query optimization",
  "metrics": ["< 200ms p95 latency", "99.9% uptime"],
  "caveats": ["Excludes third-party API calls"],
  "exceptions": ["Batch operations may take up to 2 seconds"]
}
```

### Entity Resolution

Maps aliases to canonical entity names and links them to questions/answers.

**Example:**
```
Detected entities:
- "PM" → "Product Manager" (alias resolution)
- "API" → "Application Programming Interface" (expansion)
- "DB" → "Database" (expansion)

Linked to:
- Question Q-PRD-042: mentions [Product Manager, Database]
- Answer A-PRD-042: mentions [Application Programming Interface, Redis, Database]
```

## Usage

### Enable in Coordinator

```typescript
import { PRDCoordinator } from './phases/prd-coordinator';
import { Pool } from 'pg';

// Create database pool
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Enable Refinery in coordinator
const coordinator = new PRDCoordinator({
  enableKnowledgeMap: true,
  enableRefinery: true,  // 🔥 Enable Refinery
  dbPool,                // Required for Refinery
  knowledgeMapConnectionString: process.env.DATABASE_URL,
});

const result = await coordinator.execute(input);
```

### Direct Usage (Advanced)

```typescript
import { RefineryClient } from '@ideamine/tool-sdk/refinery';
import { Pool } from 'pg';

const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const client = new RefineryClient({
  dbPool,
  phase: 'PRD',
  runId: 'run-12345',
});

const result = await client.refine({
  questions: [
    { id: 'Q-001', text: 'What is the API response time requirement?' },
    { id: 'Q-002', text: 'How many users should the system support?' },
  ],
  answers: [
    {
      id: 'A-001',
      answer: 'API should respond in < 200ms at p95',
      evidence: ['PRD-REQ-042'],
      confidence: 0.9,
    },
    {
      id: 'A-002',
      answer: 'System must support 10,000 concurrent users',
      evidence: ['PRD-REQ-015'],
      confidence: 0.85,
    },
  ],
});

if (result.success) {
  console.log('Refined Questions:', result.refined.questions);
  console.log('Canonical Answers:', result.refined.answers);
  console.log('Knowledge Frames:', result.refined.knowledgeFrames);
  console.log('Metrics:', result.metrics);
} else {
  console.error('Gate failed:', result.gate.failures);
}
```

## Configuration

### Database Schema

Run the Refinery migration:

```bash
psql $DATABASE_URL -f packages/tool-sdk/src/db/knowledge-map-refinery-extensions.sql
```

This adds:
- Refinery columns to `questions` and `answers` tables
- New tables: `entities`, `fission_trees`, `fusion_clusters`, `knowledge_frames`, `embeddings`
- Helper functions: `generate_content_hash()`, `upsert_entity()`

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/knowledge_map

# Optional: Embedding API keys
OPENAI_API_KEY=sk-...              # For OpenAI embeddings (text-embedding-3-small)
COHERE_API_KEY=...                 # For Cohere embeddings (embed-english-v3.0)

# Optional: Vector DB (future)
QDRANT_URL=http://localhost:6333
WEAVIATE_URL=http://localhost:8080
```

### Gate Thresholds

Customize gate thresholds:

```typescript
import { RefineryGate } from '@ideamine/tool-sdk/refinery';

const gate = new RefineryGate({
  fissionCoverage: 0.90,   // Default: 0.85 (90% coverage required)
  fusionConsensus: 0.80,   // Default: 0.75 (80% consensus required)
  acceptanceRate: 0.70,    // Default: 0.60 (70% acceptance required)
});

const result = gate.evaluate({
  fissionCoverage: 0.92,
  fusionConsensus: 0.78,
  acceptanceRate: 0.68,
});

if (result.passed) {
  console.log('Gate PASSED');
} else {
  console.error('Gate FAILED:', result.failures);
}
```

## Metrics

The Refinery tracks comprehensive metrics:

```typescript
{
  inputCount: 25,              // Total Q+A inputs
  acceptedCount: 20,           // Outputs that passed gate
  rejectedCount: 5,            // Outputs rejected by gate
  fissionCoverage: 0.92,       // Avg coverage of compound→atomic decomposition
  fusionConsensus: 0.85,       // Avg consensus confidence for canonical answers
  totalCostUsd: 0.45,          // Total LLM + embedding costs
  stageResults: {
    preprocess: {
      duplicatesDetected: 3    // Duplicates found and handled
    },
    fission: {
      treesCreated: 8,         // Compound questions decomposed
      atomsGenerated: 22,      // Atomic questions generated
      avgCoverage: 0.92
    },
    entityLinking: {
      entitiesLinked: 45,      // Total entity mentions linked
      newEntities: 12,         // New entities created
      aliasesResolved: 18      // Aliases resolved to canonical
    },
    embedding: {
      embeddingsGenerated: 42, // Vector embeddings created
      totalCost: 0.08
    },
    clustering: {
      clustersCreated: 7,      // Answer clusters formed
      avgPurity: 0.88          // Intra-cluster similarity
    },
    fusion: {
      clustersProcessed: 7,
      canonicalAnswers: 7,     // Canonical answers synthesized
      avgConsensus: 0.85
    }
  }
}
```

## Delta Events

Refinery publishes delta events for cache warming:

### Event Types

1. **kmap.delta.created**: New knowledge created
2. **kmap.delta.updated**: Existing knowledge updated
3. **kmap.delta.superseded**: Knowledge replaced by newer version
4. **kmap.delta.conflict**: Contradictions detected

### Subscribe to Deltas

```typescript
import { DeltaPublisher, DeltaSubscriber } from '@ideamine/tool-sdk/refinery';

const publisher = new DeltaPublisher({
  dbPool,
  phase: 'PRD',
  runId: 'run-12345',
});

const subscriber = new DeltaSubscriber(publisher);

subscriber.on('created', (event) => {
  console.log('New knowledge created:', event.eventId);
  // Warm cache with new canonical answer
  cache.set(event.delta.added[0].nodeId, event.delta.added[0].content);
});

subscriber.on('superseded', (event) => {
  console.log('Knowledge superseded:', event.affectedNodes);
  // Invalidate old cache entry
  cache.delete(event.delta.removed[0]);
});

subscriber.on('conflict', (event) => {
  console.error('Conflict detected:', event.delta.conflict);
  // Alert team to resolve contradiction
  alertTeam(event.delta.conflict);
});
```

## Advanced Features

### Custom Entity Types

Extend the entity ontology:

```typescript
// Add custom entity types in the SQL schema
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_type_check;
ALTER TABLE entities ADD CONSTRAINT entities_type_check CHECK (
  type IN (
    'role', 'tool', 'process', 'artifact', 'actor', 'concept',
    'metric', 'requirement', 'constraint'  -- Custom types
  )
);
```

### Multi-Model Embedding

Use different embedding models per phase:

```typescript
const embedResult = await embedTool.execute({
  entityId: 'Q-001',
  entityType: 'question',
  text: 'What is the API response time?',
  model: phase === 'ARCH' ? 'openai-large' : 'openai-small',
});
```

### Batch Processing

Process large volumes efficiently:

```typescript
import { BatchEmbedTool } from '@ideamine/tool-sdk/refinery';

const batchEmbed = new BatchEmbedTool();

const result = await batchEmbed.execute({
  items: questionAnswerPairs.map((pair) => ({
    entityId: pair.id,
    entityType: 'answer',
    text: pair.answer,
  })),
  model: 'openai-small',
});

console.log(`Generated ${result.result.embeddings.length} embeddings`);
console.log(`Total cost: $${result.result.totalCost}`);
```

## Performance

### Benchmarks

- **Fission**: ~3s for compound question (1 LLM call)
- **Fusion**: ~5s per cluster (1 LLM call for synthesis, 1 for frame extraction)
- **Embedding**: ~100ms per text (OpenAI), ~2s for batch of 100
- **Clustering**: ~500ms for 50 answers (pure computation)
- **Full Pipeline**: ~30s for 10 Q/A pairs (including all stages)

### Cost Estimates

- **Per Q/A Pair**: ~$0.02 (with OpenAI embeddings and Claude Sonnet)
- **100 Q/A Pairs**: ~$2.00
- **1,000 Q/A Pairs**: ~$20.00

Cost breakdown:
- Fission: $0.005 per compound question
- Fusion: $0.008 per cluster
- Embeddings: $0.0002 per text (OpenAI small)
- Entity extraction: $0.003 per text
- Total pipeline overhead: ~40% of raw Q/A generation cost

## Troubleshooting

### Gate Failures

**Problem**: Fission coverage too low

```
Gate FAILED: fission_coverage_low: 0.72 < 0.85
```

**Solution**:
- Review compound questions - may be too ambiguous
- Lower threshold if acceptable: `fissionCoverage: 0.70`
- Check LLM quality - o1-preview performs better at decomposition

**Problem**: Fusion consensus too low

```
Gate FAILED: fusion_consensus_low: 0.68 < 0.75
```

**Solution**:
- Review answer conflicts - may indicate unclear requirements
- Improve QAA prompts to reduce contradictions
- Check if evidence is properly cited

### Missing Dependencies

**Problem**: `pg_trgm extension not available`

**Solution**:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**Problem**: `Pool is not defined`

**Solution**:
```bash
npm install pg
npm install --save-dev @types/pg
```

## Migration Guide

### From Raw Q/A to Refined

**Before** (Raw Q/A persistence):
```typescript
await kmClient.insertQuestions(questions);
await kmClient.insertAnswers(answers);
await kmClient.insertBindings(bindings);
```

**After** (With Refinery):
```typescript
// Enable Refinery in coordinator config
const coordinator = new PRDCoordinator({
  enableKnowledgeMap: true,
  enableRefinery: true,  // 🔥 Add this
  dbPool,                // 🔥 Add this
});

// Refinery runs automatically during KM generation
// No code changes needed - coordinator handles it
```

### Gradual Rollout

1. **Week 1**: Run Refinery in shadow mode (log metrics, don't persist)
2. **Week 2**: Enable Refinery for non-critical phases (IDEATION, CRITIQUE)
3. **Week 3**: Enable for critical phases (PRD, ARCH)
4. **Week 4**: Full rollout, retire shadow mode

## FAQ

**Q: Does Refinery slow down the workflow?**
A: Yes, by ~30s per 10 Q/A pairs. However, the quality improvement justifies the latency. Use `enableRefinery: false` for time-critical phases.

**Q: Can I skip certain stages?**
A: Not yet. The pipeline is designed to run all 12 stages. Future versions may support stage configuration.

**Q: What happens if Refinery fails?**
A: The coordinator falls back to original Q/A outputs. The phase continues without interruption.

**Q: How do I monitor Refinery performance?**
A: Check the `metadata.refinery` field in recorder steps, or query `refinery_runs` table.

**Q: Can I use Refinery without the Knowledge Map?**
A: No. Refinery is designed as a post-processor for Knowledge Map Q/A outputs.

## Roadmap

- [ ] Stage-level configuration (enable/disable individual stages)
- [ ] Streaming pipeline (process Q/A pairs as they arrive)
- [ ] Multi-language support (translation during normalization)
- [ ] Custom fusion strategies (beyond consensus)
- [ ] GraphRAG integration (graph-based knowledge representation)
- [ ] Automated contradiction resolution
- [ ] Knowledge versioning with time-travel queries
- [ ] Real-time delta streaming (Kafka, Redis Pub/Sub)

---

**Built with care by the IdeaMine team.**
