# Knowledge Refinery

## Quick Start

```typescript
import { RefineryClient } from '@ideamine/tool-sdk/refinery';
import { Pool } from 'pg';

// 1. Create database pool
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 2. Create client
const client = new RefineryClient({
  dbPool,
  phase: 'PRD',
  runId: 'run-12345',
});

// 3. Refine Q/A
const result = await client.refine({
  questions: [{ id: 'Q-001', text: '...' }],
  answers: [{ id: 'A-001', answer: '...', confidence: 0.9 }],
});

// 4. Check results
if (result.success) {
  console.log('✅ Refinery passed gate');
  console.log('Refined:', result.refined);
  console.log('Metrics:', result.metrics);
} else {
  console.error('❌ Gate failed:', result.gate.failures);
}
```

## 12-Stage Pipeline

1. **Normalization**: Text canonicalization
2. **PII Redaction**: Remove sensitive data
3. **Content Hashing**: SHA-256 for idempotence
4. **Deduplication**: Detect duplicates
5. **Fission**: Decompose compound questions
6. **Entity Linking**: Resolve aliases
7. **Embedding**: Generate vectors
8. **Clustering**: Group similar answers
9. **Fusion**: Synthesize canonical answers
10. **Knowledge Frames**: Extract structured slots
11. **Versioning**: Track evolution
12. **Delta Publishing**: Emit events

## Tools

### Refinery Tools (`refine.*`)

- `refine.normalize` - Text canonicalization
- `refine.fission` - Question decomposition
- `refine.embed` - Vector embeddings
- `refine.cluster` - Topic clustering
- `refine.fusion` - Answer synthesis
- `refine.ontologyLink` - Entity resolution
- `refine.dedup` - Duplicate detection

### Guard Tools (`guard.*`)

- `guard.PII_redactor` - Redact PII

## Usage

### In Coordinator

```typescript
import { PRDCoordinator } from './phases/prd-coordinator';

const coordinator = new PRDCoordinator({
  enableKnowledgeMap: true,
  enableRefinery: true,  // ✅ Enable
  dbPool,                // ✅ Required
});
```

### Standalone

```typescript
import { RefineryWorkflow } from '@ideamine/tool-sdk/refinery';

const workflow = new RefineryWorkflow({
  dbPool,
  phase: 'PRD',
  runId: 'run-12345',
});

const output = await workflow.refine({
  questions: [...],
  answers: [...],
});
```

## Configuration

See:
- `/config/refinery-example.ts` - Full configuration example
- `/docs/KNOWLEDGE_REFINERY.md` - Complete documentation
- `/docs/LLM_PROVIDER_CONFIGURATION.md` - LLM provider setup

## Database Setup

```bash
# Run migration
psql $DATABASE_URL -f packages/tool-sdk/src/db/knowledge-map-refinery-extensions.sql

# Enable pg_trgm for fuzzy matching
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/km
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Optional
GOOGLE_API_KEY=...
COHERE_API_KEY=...
```

## Gate Thresholds

Customize quality thresholds:

```typescript
import { RefineryGate } from '@ideamine/tool-sdk/refinery';

const gate = new RefineryGate({
  fissionCoverage: 0.85,   // Default: 0.85
  fusionConsensus: 0.75,   // Default: 0.75
  acceptanceRate: 0.60,    // Default: 0.60
});
```

## Metrics

```typescript
{
  inputCount: 25,
  acceptedCount: 20,
  rejectedCount: 5,
  fissionCoverage: 0.92,     // Quality metric
  fusionConsensus: 0.85,     // Quality metric
  totalCostUsd: 0.45,        // Total cost
  stageResults: {
    fission: { atomsGenerated: 22 },
    fusion: { canonicalAnswers: 7 },
    // ... other stages
  }
}
```

## Delta Events

Subscribe to knowledge changes:

```typescript
import { DeltaPublisher, DeltaSubscriber } from '@ideamine/tool-sdk/refinery';

const publisher = new DeltaPublisher({ dbPool, phase: 'PRD', runId });
const subscriber = new DeltaSubscriber(publisher);

subscriber.on('created', (event) => {
  console.log('New knowledge:', event);
});

subscriber.on('superseded', (event) => {
  console.log('Knowledge updated:', event);
});

subscriber.on('conflict', (event) => {
  console.error('Conflict detected:', event);
});
```

## Performance

- **Latency**: ~30s for 10 Q/A pairs
- **Cost**: ~$0.02 per Q/A pair
- **Throughput**: ~20 Q/A pairs per minute

## Architecture

```
┌─────────────┐
│   Raw Q/A   │
└──────┬──────┘
       │
       v
┌─────────────────────────────────────┐
│  Knowledge Refinery (12 Stages)    │
│                                     │
│  1. Normalize                       │
│  2. Redact PII                      │
│  3. Hash                            │
│  4. Dedup                           │
│  5. Fission (Q decomposition)       │
│  6. Entity Linking                  │
│  7. Embedding                       │
│  8. Clustering                      │
│  9. Fusion (A synthesis)            │
│ 10. Knowledge Frames                │
│ 11. Versioning                      │
│ 12. Delta Publishing                │
└──────┬──────────────────────────────┘
       │
       v
┌──────────────┐
│ Refinery Gate│ (Quality Check)
└──────┬───────┘
       │
       ├─ PASS ──> Refined Knowledge
       │
       └─ FAIL ──> Original Q/A (fallback)
```

## Files

- `refinery-client.ts` - Client interface
- `refinery-workflow.ts` - Pipeline orchestration
- `delta-publisher.ts` - Event publishing
- `tools/refine/*` - Individual tools
- `tools/guard/*` - Safety tools

## Documentation

- `/docs/KNOWLEDGE_REFINERY.md` - Full documentation
- `/config/refinery-example.ts` - Configuration guide
- Database schema: `/packages/tool-sdk/src/db/knowledge-map-refinery-extensions.sql`

## Troubleshooting

**Gate failures**: Check `result.gate.failures` for specific issues
**High costs**: Review LLM provider configuration
**Slow performance**: Reduce batch size or use faster models
**Missing entities**: Check entity extraction prompts

## Support

- GitHub Issues: https://github.com/ideamine/ideamine/issues
- Documentation: /docs/KNOWLEDGE_REFINERY.md
- Example config: /config/refinery-example.ts
