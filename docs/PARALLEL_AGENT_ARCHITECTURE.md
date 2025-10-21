# Parallel Agent Architecture

## Overview

IdeaMine uses a **two-level parallelization strategy** to optimize performance while maintaining correctness:

1. **Phases run sequentially** (due to dependencies and gates)
2. **Agents within each phase run in parallel** (fan-out/fan-in pattern)

This architecture provides **4-6x performance improvement** within each phase while ensuring data consistency.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        INTAKE PHASE                          │
│  Classifier → Expander → Validator (sequential, 10-17s)     │
└─────────────────────┬───────────────────────────────────────┘
                      │ IdeaSpec v1.0.0
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      IDEATION PHASE                          │
│                    (Parallel Execution)                      │
│                                                              │
│   ┌──────────────────┐  ┌──────────────────┐               │
│   │ StrategyAgent    │  │ CompetitiveAgent │               │
│   │ (10-15s)         │  │ (10-15s)         │               │
│   └────────┬─────────┘  └────────┬─────────┘               │
│            │                     │                          │
│   ┌────────▼─────────┐  ┌────────▼─────────┐               │
│   │ TechStackAgent   │  │ PersonaAgent     │               │
│   │ (10-15s)         │  │ (10-15s)         │               │
│   └────────┬─────────┘  └────────┬─────────┘               │
│            │                     │                          │
│            └──────────┬──────────┘                          │
│                       ▼                                     │
│              PhaseCoordinator.aggregate()                   │
│              (combines all artifacts)                       │
│                                                              │
│  Total Time: 10-15s (vs 40-60s sequential)                 │
└─────────────────────┬───────────────────────────────────────┘
                      │ Ideation artifacts
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      IDEATION GATE                           │
│  Validates: completeness, consistency, quality              │
└─────────────────────┬───────────────────────────────────────┘
                      │ PASS/RETRY/FAIL
                      ▼
                   (Next Phase)
```

---

## Implementation Pattern

### Phase Coordinator Class

Each phase should have a coordinator that orchestrates parallel agent execution:

```typescript
import { BaseAgent, AgentInput, AgentOutput } from '@ideamine/agent-sdk';

/**
 * PhaseCoordinator
 *
 * Orchestrates parallel execution of multiple agents within a phase.
 * Implements fan-out (spawn agents) and fan-in (aggregate results) pattern.
 */
export abstract class PhaseCoordinator {
  protected agents: BaseAgent[];
  protected phaseName: string;
  protected budget: PhaseBudget;

  constructor(config: PhaseCoordinatorConfig) {
    this.phaseName = config.phaseName;
    this.budget = config.budget;
    this.agents = this.initializeAgents(config);
  }

  /**
   * Execute all agents in parallel
   */
  async execute(input: PhaseInput): Promise<PhaseOutput> {
    console.log(`[${this.phaseName}] Starting parallel agent execution`);
    const startTime = Date.now();

    try {
      // FAN-OUT: Execute all agents in parallel
      const agentPromises = this.agents.map(async (agent) => {
        const agentInput = this.prepareAgentInput(agent, input);
        return await agent.execute(agentInput);
      });

      // Wait for all agents to complete (or fail)
      const results = await Promise.allSettled(agentPromises);

      // Handle failures gracefully
      const successes: AgentOutput[] = [];
      const failures: Error[] = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successes.push(result.value);
        } else {
          failures.push(result.reason);
          console.error(
            `[${this.phaseName}] Agent ${this.agents[index].config.id} failed:`,
            result.reason
          );
        }
      });

      // Check if we have minimum required successes
      if (successes.length < this.getMinRequiredAgents()) {
        throw new Error(
          `Phase failed: Only ${successes.length}/${this.agents.length} agents succeeded`
        );
      }

      // FAN-IN: Aggregate all results
      const aggregated = await this.aggregateResults(successes, failures);

      const duration = Date.now() - startTime;
      console.log(`[${this.phaseName}] Completed in ${duration}ms`);

      return {
        success: true,
        artifacts: aggregated.artifacts,
        cost: aggregated.totalCost,
        duration,
        failedAgents: failures.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${this.phaseName}] Phase execution failed:`, errorMessage);

      return {
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Initialize all agents for this phase
   */
  protected abstract initializeAgents(config: PhaseCoordinatorConfig): BaseAgent[];

  /**
   * Prepare input for a specific agent
   */
  protected abstract prepareAgentInput(agent: BaseAgent, phaseInput: PhaseInput): AgentInput;

  /**
   * Aggregate results from all successful agents
   */
  protected abstract aggregateResults(
    successes: AgentOutput[],
    failures: Error[]
  ): Promise<AggregatedResult>;

  /**
   * Minimum number of agents that must succeed for phase to pass
   */
  protected abstract getMinRequiredAgents(): number;
}
```

### Example: IDEATION Phase Coordinator

```typescript
import {
  StrategyAgent,
  CompetitiveAnalystAgent,
  TechStackRecommenderAgent,
  UserPersonaBuilderAgent,
} from './ideation';
import { PhaseCoordinator } from '../base/phase-coordinator';

/**
 * IdeationPhaseCoordinator
 *
 * Orchestrates 4 parallel agents:
 * 1. Strategy Agent - Product vision and strategy
 * 2. Competitive Analyst - Market and competitor analysis
 * 3. Tech Stack Recommender - Technology recommendations
 * 4. User Persona Builder - Target user personas
 */
export class IdeationPhaseCoordinator extends PhaseCoordinator {
  private strategyAgent: StrategyAgent;
  private competitiveAgent: CompetitiveAnalystAgent;
  private techStackAgent: TechStackRecommenderAgent;
  private personaAgent: UserPersonaBuilderAgent;

  protected initializeAgents(config: PhaseCoordinatorConfig): BaseAgent[] {
    const configs = loadIdeationAgentConfigs();

    this.strategyAgent = new StrategyAgent(configs[0]);
    this.competitiveAgent = new CompetitiveAnalystAgent(configs[1]);
    this.techStackAgent = new TechStackRecommenderAgent(configs[2]);
    this.personaAgent = new UserPersonaBuilderAgent(configs[3]);

    return [
      this.strategyAgent,
      this.competitiveAgent,
      this.techStackAgent,
      this.personaAgent,
    ];
  }

  protected prepareAgentInput(agent: BaseAgent, phaseInput: PhaseInput): AgentInput {
    // All agents receive the same base input (IdeaSpec from INTAKE)
    const { ideaSpec, workflowRunId, userId, projectId } = phaseInput;

    return {
      data: {
        ideaSpec,
        category: ideaSpec.metadata.category,
        complexity: ideaSpec.metadata.complexity,
      },
      context: {
        workflowRunId,
        userId,
        projectId,
        phase: 'IDEATION',
      },
    };
  }

  protected async aggregateResults(
    successes: AgentOutput[],
    failures: Error[]
  ): Promise<AggregatedResult> {
    const artifacts: any[] = [];
    let totalCost = 0;

    // Collect all artifacts from successful agents
    successes.forEach((output) => {
      artifacts.push(...output.artifacts);
      totalCost += output.cost || 0;
    });

    // Create aggregated ideation artifact
    const strategyArtifact = artifacts.find((a) => a.type === 'product-strategy');
    const competitiveArtifact = artifacts.find((a) => a.type === 'competitive-analysis');
    const techStackArtifact = artifacts.find((a) => a.type === 'tech-stack-recommendation');
    const personaArtifact = artifacts.find((a) => a.type === 'user-personas');

    const aggregatedArtifact = {
      type: 'ideation-complete',
      version: '1.0.0',
      content: {
        strategy: strategyArtifact?.content,
        competitive: competitiveArtifact?.content,
        techStack: techStackArtifact?.content,
        personas: personaArtifact?.content,
        failedAgents: failures.length,
        completeness: successes.length / this.agents.length,
      },
      generatedAt: new Date().toISOString(),
    };

    return {
      artifacts: [...artifacts, aggregatedArtifact],
      totalCost,
    };
  }

  protected getMinRequiredAgents(): number {
    // Require at least 3 out of 4 agents to succeed
    return 3;
  }
}
```

### Orchestrator Integration

Update the LangGraph orchestrator to use coordinators:

```typescript
// In langgraph-orchestrator.ts

private async executeIdeationPhase(state: GraphState): Promise<Partial<GraphState>> {
  console.log('[LangGraphOrchestrator] Executing Ideation phase');

  state.workflowRun.state = WorkflowState.IDEATION;

  try {
    // Initialize phase coordinator
    const coordinator = new IdeationPhaseCoordinator({
      phaseName: 'IDEATION',
      budget: {
        maxCostUsd: 2.0,
        maxTokens: 50000,
      },
    });

    // Execute all agents in parallel
    const phaseInput = {
      ideaSpec: state.workflowRun.ideaSpec,
      workflowRunId: state.workflowRun.id,
      userId: state.workflowRun.userId,
      projectId: state.workflowRun.projectId,
    };

    const result = await coordinator.execute(phaseInput);

    if (!result.success) {
      throw new Error(`Ideation phase failed: ${result.error}`);
    }

    // Store artifacts
    result.artifacts.forEach((artifact) => {
      state.workflowRun.artifacts.push({
        id: `${state.workflowRun.id}-ideation-${artifact.type}`,
        type: artifact.type,
        data: artifact.content,
        createdAt: new Date(),
      });
    });

    // Publish completion event
    await this.eventPublisher.publishPhaseCompleted({
      workflowRunId: state.workflowRun.id,
      phase: 'IDEATION',
      artifacts: result.artifacts.map((a) => a.type),
      costUsd: result.cost,
      durationMs: result.duration,
    });

    console.log(
      `[LangGraphOrchestrator] Ideation phase completed in ${result.duration}ms (${result.failedAgents} failures)`
    );

    return {
      currentPhase: 'ideation',
      workflowRun: state.workflowRun,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[LangGraphOrchestrator] Ideation phase failed: ${errorMessage}`);

    state.workflowRun.state = WorkflowState.FAILED;
    await this.eventPublisher.publishPhaseFailed({
      workflowRunId: state.workflowRun.id,
      phase: 'IDEATION',
      error: errorMessage,
      retryable: true,
    });

    throw error;
  }
}
```

---

## Performance Comparison

### Sequential Execution (Current INTAKE approach)

```
IntakeClassifierAgent:  3-5s   ────────
IntakeExpanderAgent:    5-8s          ────────────
IntakeValidatorAgent:   2-4s                     ──────
                        ═══════════════════════════════
Total:                  10-17s
```

### Parallel Execution (Proposed IDEATION approach)

```
StrategyAgent:         10-15s  ──────────────────
CompetitiveAgent:      10-15s  ──────────────────
TechStackAgent:        10-15s  ──────────────────
PersonaAgent:          10-15s  ──────────────────
                       ═══════════════════════════
Total:                 10-15s (4x faster!)
```

---

## Benefits

### 1. **Massive Performance Gains**
- **IDEATION:** 40-60s → 10-15s (4x faster)
- **CRITIQUE:** 30-45s → 10-15s (3x faster)
- **BIZDEV:** 40-50s → 12-15s (3-4x faster)
- **Overall pipeline:** ~5-10 minutes → ~2-3 minutes

### 2. **Resilience**
- If one agent fails, others can continue
- Phase can succeed with partial results (e.g., 3/4 agents)
- Graceful degradation instead of all-or-nothing

### 3. **Resource Efficiency**
- Better utilization of Claude API rate limits
- Concurrent LLM calls (if quota allows)
- Reduced idle time

### 4. **Real-Time Progress Updates**
- Each agent publishes events as it completes
- User sees incremental progress
- Better UX with streaming updates

---

## Parallelization Strategy by Phase

| Phase | Agents | Parallel? | Speedup | Notes |
|-------|--------|-----------|---------|-------|
| **INTAKE** | 3 | ❌ No | 1x | Sequential dependencies (classifier → expander → validator) |
| **IDEATION** | 4 | ✅ Yes | 4x | All agents read IdeaSpec, no dependencies |
| **CRITIQUE** | 3 | ✅ Yes | 3x | Red team agents can run independently |
| **PRD** | 3 | ⚠️ Partial | 2x | Feature decomposer depends on PRD writer |
| **BIZDEV** | 4 | ✅ Yes | 4x | All business analyses independent |
| **ARCH** | 4 | ⚠️ Partial | 2-3x | API/Data modeling can be parallel, solution architect first |
| **BUILD** | 3 | ✅ Yes | 3x | Repo, CI/CD, env can be parallel |
| **STORY_LOOP** | 3 | ⚠️ Iterative | N/A | Story coder → reviewer → test writer (loop) |
| **QA** | 4 | ✅ Yes | 4x | E2E, load, security, visual tests independent |
| **AESTHETIC** | 3 | ✅ Yes | 3x | UI audit, a11y, polish independent |
| **RELEASE** | 3 | ⚠️ Partial | 2x | Packager first, then deployer + release notes |
| **BETA** | 3 | ✅ Yes | 3x | Distribution, telemetry, analytics independent |

**Legend:**
- ✅ Yes: Full parallelization possible
- ⚠️ Partial: Some agents must be sequential
- ❌ No: Must be fully sequential

---

## Implementation Recommendations

### 1. **Start with High-Impact Phases**

Implement parallel coordinators for phases with the most agents:
1. **IDEATION** (4 agents, 4x speedup)
2. **BIZDEV** (4 agents, 4x speedup)
3. **QA** (4 agents, 4x speedup)

### 2. **Budget Pooling**

Agents share the phase budget:

```typescript
const phaseBudget = {
  maxCostUsd: 2.0,
  maxTokens: 50000,
};

// Each agent gets a portion
const agentBudget = {
  maxCostUsd: phaseBudget.maxCostUsd / agents.length,
  maxTokens: phaseBudget.maxTokens / agents.length,
};
```

### 3. **Rate Limiting**

Avoid overwhelming Claude API:

```typescript
import pLimit from 'p-limit';

// Max 3 concurrent LLM calls
const limit = pLimit(3);

const results = await Promise.all(
  agents.map((agent) => limit(() => agent.execute(input)))
);
```

### 4. **Real-Time Progress**

Publish events as each agent completes:

```typescript
const agentPromises = agents.map(async (agent) => {
  const result = await agent.execute(input);

  // Publish agent completion event immediately
  await eventPublisher.publishAgentCompleted({
    workflowRunId,
    phase: 'IDEATION',
    agentId: agent.config.id,
    artifacts: result.artifacts,
  });

  return result;
});
```

### 5. **Failure Handling**

Use `Promise.allSettled` instead of `Promise.all`:

```typescript
// ✅ GOOD - Continues even if some agents fail
const results = await Promise.allSettled(agentPromises);

// ❌ BAD - Fails entire phase if one agent fails
const results = await Promise.all(agentPromises);
```

---

## Example: Full Pipeline with Parallel Phases

```typescript
async executeFullPipeline(ideaInput: string): Promise<WorkflowResult> {
  // PHASE 1: INTAKE (sequential - 10-17s)
  const intakeResult = await executeIntakePhase(ideaInput);
  const ideaSpec = intakeResult.ideaSpec;

  // PHASE 2: IDEATION (4 parallel agents - 10-15s)
  const ideationCoordinator = new IdeationPhaseCoordinator();
  const ideationResult = await ideationCoordinator.execute({ ideaSpec });

  // PHASE 3: CRITIQUE (3 parallel agents - 10-15s)
  const critiqueCoordinator = new CritiquePhaseCoordinator();
  const critiqueResult = await critiqueCoordinator.execute({
    ideaSpec,
    ideation: ideationResult.artifacts,
  });

  // CRITIQUE GATE
  const critiquePassed = await evaluateCritiqueGate(critiqueResult);
  if (!critiquePassed) {
    return { status: 'FAILED_CRITIQUE_GATE' };
  }

  // PHASE 4: PRD (2 sequential + 1 parallel - 15-20s)
  const prdCoordinator = new PRDPhaseCoordinator();
  const prdResult = await prdCoordinator.execute({
    ideaSpec,
    ideation: ideationResult.artifacts,
    critique: critiqueResult.artifacts,
  });

  // ...continue through all phases

  return {
    status: 'SUCCESS',
    totalDuration: calculateDuration(),
    artifacts: collectAllArtifacts(),
  };
}
```

---

## Next Steps

### To Implement Parallel Architecture:

1. **Create PhaseCoordinator base class** (`packages/orchestrator-core/src/base/phase-coordinator.ts`)
2. **Implement IdeationPhaseCoordinator** as proof-of-concept
3. **Update LangGraph orchestrator** to use coordinators
4. **Add rate limiting** with `p-limit`
5. **Test with actual Claude API** to verify concurrent calls work
6. **Measure performance gains** vs sequential execution
7. **Roll out to remaining phases** (CRITIQUE, BIZDEV, QA, etc.)

Would you like me to implement the PhaseCoordinator base class and the first phase coordinator (IDEATION) as a working example?
