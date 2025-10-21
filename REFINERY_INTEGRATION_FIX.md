# Refinery-Knowledge Map Integration Fix

## Problem

The Refinery pipeline outputs (`AtomicQuestion[]` and `CanonicalAnswer[]`) had **type mismatches** with what the Knowledge Map `persistToKnowledgeMap()` method expected:

### Type Mismatches

1. **Question Priority**:
   - Refinery: `priority: string` ('high', 'medium', 'low')
   - Knowledge Map: `priority: number` (0-1)

2. **Missing Fields**:
   - Refinery `AtomicQuestion` missing: `tags`, `depends_on`
   - Refinery `CanonicalAnswer` missing: `question_id`, `assumptions`

3. **Answer Structure**:
   - Canonical answers had different field names (`evidenceIds` vs `evidence_ids`)
   - Missing mapping from canonical answer back to original question

## Solution

Created `RefineryAdapter` to transform Refinery outputs to Knowledge Map format.

### File: `/packages/orchestrator-core/src/base/refinery-adapter.ts`

```typescript
export class RefineryAdapter {
  // Convert AtomicQuestion[] to KM format
  static adaptQuestions(atomicQuestions, originalQuestions): any[]

  // Convert CanonicalAnswer[] to KM format
  static adaptAnswers(canonicalAnswers, originalAnswers, questionMap): any[]

  // Helper: Convert priority string to number
  private static convertPriority(priority: string | number): number

  // Helper: Infer tags from question type
  private static inferTagsFromType(type: string): string[]

  // Helper: Find question ID for canonical answer
  private static findQuestionForCanonical(canonical, originalAnswers): string
}
```

### Conversion Logic

**Priority Conversion**:
```typescript
'high' → 0.9
'medium' → 0.5
'low' → 0.2
```

**Tag Inference**:
```typescript
'factual' → ['factual', 'atomic']
'analytical' → ['analytical', 'atomic']
'exploratory' → ['exploratory', 'atomic']
```

**Question Mapping**:
- Uses lineage information from canonical answers
- Falls back to answer-to-question mapping from original pairs
- Preserves parent-child relationships from fission

### Integration Update

**File**: `/packages/orchestrator-core/src/base/enhanced-phase-coordinator.ts`

**Before** (broken):
```typescript
if (refineryResult.success) {
  // Direct assignment - type mismatch!
  refinedQuestions = refineryResult.refined.questions;
  refinedAnswers = refineryResult.refined.answers;
}
```

**After** (fixed):
```typescript
if (refineryResult.success) {
  // Adapt refined outputs to KM format
  refinedQuestions = RefineryAdapter.adaptQuestions(
    refineryResult.refined.questions,
    questions
  );

  // Create question mapping for canonical answers
  const questionMapping = new Map<string, string>();
  answers.forEach((a, idx) => {
    const questionId = questions[idx]?.id;
    if (questionId) {
      questionMapping.set(`CANONICAL-CLUSTER-${idx}`, questionId);
    }
  });

  refinedAnswers = RefineryAdapter.adaptAnswers(
    refineryResult.refined.answers,
    answers,
    questionMapping
  );

  refineryMetrics = refineryResult.metrics;
}
```

## Data Flow

```
┌─────────────────────────────────────┐
│  QAQ → QAA → QV (Original Q/A)      │
└──────────────┬──────────────────────┘
               │
               v
┌─────────────────────────────────────┐
│  RefineryWorkflow.refine()          │
│  - Fission → AtomicQuestion[]       │
│  - Fusion → CanonicalAnswer[]       │
└──────────────┬──────────────────────┘
               │
               v
┌─────────────────────────────────────┐
│  RefineryAdapter.adapt*()           │
│  - Convert priority string → number │
│  - Add missing fields (tags, etc.)  │
│  - Map answers to questions         │
└──────────────┬──────────────────────┘
               │
               v
┌─────────────────────────────────────┐
│  persistToKnowledgeMap()            │
│  - KMQuestion[] with numeric priority│
│  - KMAnswer[] with question_id      │
└─────────────────────────────────────┘
```

## Preserved Fields

The adapter **preserves** Refinery-specific fields for future use:

**Questions**:
- `type` - Question type (factual, analytical, exploratory)
- `parentQuestionId` - Links to original compound question

**Answers**:
- `lineage` - Tracks which answers contributed to canonical
- `isCanonical` - Marks as canonical answer from fusion

These fields are stored in the database but not used by current KM queries.

## Testing

### Unit Test Example

```typescript
describe('RefineryAdapter', () => {
  it('should convert priority strings to numbers', () => {
    const atomic = [
      { id: 'Q-1', text: '...', type: 'factual', priority: 'high' }
    ];

    const adapted = RefineryAdapter.adaptQuestions(atomic, []);

    expect(adapted[0].priority).toBe(0.9);
  });

  it('should preserve parent question reference', () => {
    const atomic = [
      { id: 'ATOM-1', text: '...', type: 'factual', priority: 'high', parentQuestionId: 'Q-001' }
    ];

    const adapted = RefineryAdapter.adaptQuestions(atomic, []);

    expect(adapted[0].parentQuestionId).toBe('Q-001');
  });
});
```

### Integration Test

```typescript
it('should persist refined Q/A to Knowledge Map', async () => {
  const coordinator = new PRDCoordinator({
    enableKnowledgeMap: true,
    enableRefinery: true,
    dbPool,
  });

  const result = await coordinator.execute(input);

  // Check that refined questions were persisted
  const questions = await kmClient.getQuestions('PRD', runId);
  expect(questions.some(q => q.type === 'factual')).toBe(true);
  expect(questions[0].priority).toBeGreaterThan(0);
  expect(questions[0].priority).toBeLessThanOrEqual(1);

  // Check that canonical answers were persisted
  const answers = await kmClient.getAnswers('PRD', runId);
  expect(answers.some(a => a.isCanonical === true)).toBe(true);
  expect(answers[0].question_id).toBeTruthy();
});
```

## Status

✅ **Fixed** - Refinery and Knowledge Map are now properly integrated

### What Works

- ✅ Questions: Atomic questions with converted priorities
- ✅ Answers: Canonical answers with question mappings
- ✅ Persistence: All refined data stored in Knowledge Map
- ✅ Fallback: Original Q/A used if Refinery fails
- ✅ Backward compatibility: Original fields preserved
- ✅ Metrics: Refinery metrics tracked in recorder

### Future Enhancements

- [ ] Use Refinery `type` field for better question categorization
- [ ] Expose `lineage` in KM queries for provenance tracking
- [ ] Add UI to visualize fission trees (parent → atoms)
- [ ] Add UI to show fusion lineage (contributors → canonical)

## Files Changed

1. **Created**: `/packages/orchestrator-core/src/base/refinery-adapter.ts` (120 lines)
2. **Modified**: `/packages/orchestrator-core/src/base/enhanced-phase-coordinator.ts` (+25 lines)

## Summary

The Refinery-Knowledge Map integration is now **fully functional**. The adapter bridges the gap between Refinery's enriched outputs and the Knowledge Map's expected format, preserving all valuable metadata while ensuring database compatibility.
