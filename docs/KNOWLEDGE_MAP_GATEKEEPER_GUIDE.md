# Knowledge Map Gatekeeper Integration Guide

## Overview

This guide explains how to integrate Knowledge Map (KM) coverage checks into your phase Gatekeepers. The Knowledge Map system tracks question-answer pairs validated through the QAQ/QAA/QV triad, ensuring comprehensive documentation and decision traceability.

## Why Knowledge Map Coverage Matters

Gates should verify that critical decisions and assumptions are documented before allowing phase completion. Knowledge Map metrics ensure:

1. **Completeness**: All priority themes have been addressed with validated answers
2. **Quality**: Q/A pairs meet rubric thresholds (grounding, specificity, etc.)
3. **Traceability**: High-priority questions are answered, not deferred
4. **Consistency**: No unresolved conflicts in the knowledge base

## Available KM Metrics

The `enrichGateInputWithKMMetrics()` method provides four metrics:

### 1. `km_coverage_ratio`
- **Type**: `percentage` (0.0 - 1.0)
- **Description**: Percentage of priority themes with accepted Q/A pairs
- **Calculation**: `(themes_with_answers / total_priority_themes)`
- **Typical Threshold**: ≥ 0.70 (70% coverage)

### 2. `km_high_priority_open`
- **Type**: `count`
- **Description**: Number of high-priority questions (priority ≥ 0.8) without accepted answers
- **Calculation**: `COUNT(questions WHERE priority >= 0.8 AND status = 'open')`
- **Typical Threshold**: = 0 (no critical questions unanswered)

### 3. `km_acceptance_rate`
- **Type**: `percentage` (0.0 - 1.0)
- **Description**: Percentage of Q/A pairs that passed validator rubric
- **Calculation**: `(accepted_bindings / total_bindings)`
- **Typical Threshold**: ≥ 0.75 (75% acceptance rate)

### 4. `km_critical_conflicts`
- **Type**: `count`
- **Description**: Number of unresolved conflicts between Q/A pairs
- **Calculation**: `COUNT(km_conflicts WHERE resolved = false)`
- **Typical Threshold**: = 0 (no unresolved conflicts)

## How to Add KM Metrics to Your Gate

### Step 1: Enable Knowledge Map in Phase Coordinator

```typescript
// packages/agents/src/prd/prd-phase-coordinator.ts

export class PRDPhaseCoordinator extends EnhancedPhaseCoordinator {
  constructor() {
    super({
      phase: 'prd',
      agents: [/* your agents */],
      gatekeeper: new PRDGatekeeper(),

      // Enable Knowledge Map generation
      enableKnowledgeMap: true,
      knowledgeMapConnectionString: process.env.KNOWLEDGE_MAP_DB_URL,
    });
  }
}
```

### Step 2: Add KM Metrics to Gate Rubric

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
          weight: 0.25,
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
          weight: 0.20,
          required: true, // Block if critical questions remain
        },
        {
          id: 'km_acceptance_rate',
          name: 'Knowledge Map Quality',
          description: 'Percentage of Q/A pairs that passed validation',
          type: 'percentage',
          operator: '>=',
          threshold: 0.75, // 75% of pairs should pass
          weight: 0.10,
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
      ['PRD', 'UserStories', 'AcceptanceCriteria', 'RTM'], // Required artifacts
    );
  }
}
```

### Step 3: Enrich Gate Input with KM Metrics

```typescript
// packages/agents/src/prd/prd-phase-coordinator.ts

import { GateEvaluationInput } from '@ideamine/orchestrator-core';

export class PRDPhaseCoordinator extends EnhancedPhaseCoordinator {
  // ... constructor ...

  /**
   * Prepare gate input with KM coverage metrics
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
      // ... other PRD metrics
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
    return 0.90;
  }

  private calculateRTMCoverage(phaseResult: PhaseOutput): number {
    // Your existing logic
    return 0.95;
  }
}
```

## Example: Complete Gate Evaluation Flow

```typescript
// When phase executes:

1. EnhancedPhaseCoordinator.execute(input)
   ├─ super.execute(input)  // Run phase agents
   │
   ├─ runKnowledgeMapGeneration(runId, phaseResult)
   │   ├─ Spawn QAQ agent → Generate questions
   │   ├─ Spawn QAA agent → Answer with evidence
   │   ├─ Pair questions + answers
   │   ├─ Spawn QV validator → Validate pairs
   │   └─ Persist to Knowledge Map DB
   │
   ├─ gatekeeper.evaluate(gateInput)
   │   ├─ prepareGateInput()
   │   │   ├─ Calculate phase metrics (AC, RTM, etc.)
   │   │   └─ enrichGateInputWithKMMetrics()
   │   │       └─ queryKnowledgeMapCoverage()
   │   │           ├─ km_coverage_ratio: 0.75
   │   │           ├─ km_high_priority_open: 0
   │   │           ├─ km_acceptance_rate: 0.85
   │   │           └─ km_critical_conflicts: 0
   │   │
   │   ├─ evaluateMetrics(enrichedMetrics)
   │   │   ├─ ac_completeness: PASS (0.90 >= 0.85)
   │   │   ├─ rtm_coverage: PASS (0.95 >= 0.90)
   │   │   ├─ km_coverage_ratio: PASS (0.75 >= 0.70)
   │   │   ├─ km_high_priority_open: PASS (0 = 0)
   │   │   ├─ km_acceptance_rate: PASS (0.85 >= 0.75)
   │   │   └─ km_critical_conflicts: PASS (0 = 0)
   │   │
   │   ├─ calculateOverallScore() → 88/100
   │   ├─ determineStatus() → PASS
   │   └─ Return GateEvaluationResult
   │
   └─ Proceed to next phase
```

## Gate Failure Scenarios

### Scenario 1: Low KM Coverage
```
Gate Status: FAIL
Reason: km_coverage_ratio (0.55 < 0.70)
Required Actions:
  - Answer unanswered questions for priority themes: [pricing, scalability, security]
  - Re-run QAQ/QAA cycle to generate missing Q/A pairs
  - Ensure validator accepts bindings (check grounding and specificity)
```

### Scenario 2: Critical Unanswered Questions
```
Gate Status: FAIL
Reason: km_high_priority_open (3 != 0)
Required Actions:
  - Answer critical questions:
    - Q-PRD-042: "What is the NFR for API response time under peak load?"
    - Q-PRD-055: "How will we handle GDPR data deletion requests?"
    - Q-PRD-071: "What are acceptance criteria for payment processing failures?"
  - If evidence insufficient, mark as ASSUMPTION with mitigation plan
```

### Scenario 3: Unresolved Conflicts
```
Gate Status: FAIL
Reason: km_critical_conflicts (2 != 0)
Required Actions:
  - Resolve conflict: Authentication method (OAuth2 vs SAML) - Q-PRD-023 vs Q-PRD-089
  - Resolve conflict: Data retention period (90 days vs 1 year) - Q-PRD-034 vs Q-PRD-102
  - Update conflicting Q/A pairs or mark one as superseded
```

## Recommended Thresholds by Phase

### INTAKE Gate
```typescript
km_coverage_ratio: >= 0.60  // 60% - early phase, exploration
km_high_priority_open: <= 5  // Allow some open questions
km_acceptance_rate: >= 0.70  // Lower bar for initial ideas
km_critical_conflicts: = 0   // Must resolve conflicts before PRD
```

### PRD Gate
```typescript
km_coverage_ratio: >= 0.70  // 70% - comprehensive documentation
km_high_priority_open: = 0   // All critical questions answered
km_acceptance_rate: >= 0.80  // High-quality answers required
km_critical_conflicts: = 0   // Zero tolerance for conflicts
```

### QA Gate
```typescript
km_coverage_ratio: >= 0.75  // 75% - thorough test documentation
km_high_priority_open: = 0   // All test scenarios documented
km_acceptance_rate: >= 0.85  // Very high quality standards
km_critical_conflicts: = 0   // Must resolve test discrepancies
```

### RELEASE Gate
```typescript
km_coverage_ratio: >= 0.80  // 80% - production-ready documentation
km_high_priority_open: = 0   // All operational questions answered
km_acceptance_rate: >= 0.90  // Production-grade quality
km_critical_conflicts: = 0   // Zero operational ambiguity
```

## Benefits of KM-Enhanced Gates

1. **Traceability**: Every decision has documented Q/A pairs
2. **Quality Assurance**: Validator ensures grounding and specificity
3. **Conflict Prevention**: Detects contradictions before they cause issues
4. **Knowledge Retention**: Institutional knowledge captured in structured format
5. **Audit Trail**: Full history of questions, answers, and validation scores

## Implementation Checklist

- [ ] Enable `enableKnowledgeMap: true` in phase coordinator
- [ ] Set `knowledgeMapConnectionString` environment variable
- [ ] Add KM metrics to gate rubric with appropriate thresholds
- [ ] Call `enrichGateInputWithKMMetrics()` in `prepareGateInput()`
- [ ] Test gate failure scenarios (low coverage, open questions, conflicts)
- [ ] Configure PostgreSQL Knowledge Map database
- [ ] Implement `queryKnowledgeMapCoverage()` with real DB queries
- [ ] Monitor KM metrics in gate evaluation logs

## Next Steps

1. **Implement PostgreSQL Queries**: Replace placeholder queries in `queryKnowledgeMapCoverage()` with actual database calls
2. **Add KM Dashboard**: Visualize coverage trends across phases
3. **Create Guard Tools**: Implement `guard.claimMiner`, `guard.contradictionScan`, etc.
4. **Optimize Thresholds**: Tune thresholds based on production data

## References

- **Knowledge Map Schema**: `/packages/tool-sdk/src/db/knowledge-map-schema.sql`
- **QAQ/QAA/QV Hubs**: `/packages/agent-sdk/src/hubs/`
- **Gatekeeper Base Class**: `/packages/orchestrator-core/src/gatekeeper/gatekeeper.ts`
- **EnhancedPhaseCoordinator**: `/packages/orchestrator-core/src/base/enhanced-phase-coordinator.ts`
