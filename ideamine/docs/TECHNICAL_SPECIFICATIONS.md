# IdeaMine Technical Specifications

**Version:** 1.0.0
**Date:** 2025-10-18
**Status:** Implementation Ready
**Document Owner:** Engineering Leadership

---

## Table of Contents

1. [Orchestrator Engine Specification](#orchestrator-engine-specification)
2. [Agent SDK Specification](#agent-sdk-specification)
3. [Tool SDK Specification](#tool-sdk-specification)
4. [Event Schemas](#event-schemas)
5. [Artifact Schemas](#artifact-schemas)
6. [Gatekeeper Specification](#gatekeeper-specification)
7. [Budget Guard Specification](#budget-guard-specification)
8. [API Specifications](#api-specifications)

---

## Orchestrator Engine Specification

### Overview

The Orchestration Engine is the core workflow coordinator, managing the complete idea-to-GA lifecycle through a durable state machine built on LangGraph and PostgreSQL.

### Core Components

#### 1. Workflow State Machine

**State Structure:**
```typescript
// packages/orchestrator-core/src/types/workflow-state.ts

export type Phase =
  | 'INTAKE'
  | 'REASONING'
  | 'CRITIQUE'
  | 'PRD'
  | 'BIZDEV'
  | 'ARCHITECTURE'
  | 'BUILD_SETUP'
  | 'STORY_EXECUTION'
  | 'SYSTEM_QA'
  | 'AESTHETIC'
  | 'PACKAGE_DEPLOY'
  | 'BETA'
  | 'FEEDBACK'
  | 'GA';

export type PhaseStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface WorkflowState {
  projectId: string;
  version: string; // state schema version
  currentPhase: Phase;
  phaseStates: Record<Phase, PhaseState>;
  globalContext: GlobalContext;
  budget: BudgetState;
  checkpoints: Checkpoint[];
  metadata: WorkflowMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhaseState {
  status: PhaseStatus;
  startedAt?: Date;
  completedAt?: Date;
  artifacts: string[]; // artifact IDs
  gateEvaluation?: GateEvaluationResult;
  retryCount: number;
  errorMessage?: string;
  metrics: PhaseMetrics;
}

export interface GlobalContext {
  ideaInput?: IdeaInput;
  userPreferences: Record<string, unknown>;
  techStackOverrides?: TechStackOverrides;
  complianceRequirements: string[];
  targetDeploymentDate?: string;
}

export interface BudgetState {
  cap: number; // USD
  consumed: number;
  breakdown: {
    llm: number;
    tools: number;
    infrastructure: number;
  };
  alerts: BudgetAlert[];
}

export interface Checkpoint {
  id: string;
  phase: Phase;
  timestamp: Date;
  stateSnapshot: Partial<WorkflowState>;
}

export interface WorkflowMetadata {
  owner: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  estimatedCompletionDate?: Date;
}
```

#### 2. State Persistence Layer

**Interface:**
```typescript
// packages/orchestrator-core/src/persistence/state-store.ts

export interface StateStore {
  /**
   * Save workflow state to persistent storage
   */
  save(projectId: string, state: WorkflowState): Promise<void>;

  /**
   * Load workflow state from storage
   */
  load(projectId: string, checkpointId?: string): Promise<WorkflowState>;

  /**
   * Create checkpoint for current state
   */
  checkpoint(projectId: string, phase: Phase): Promise<Checkpoint>;

  /**
   * List all checkpoints for a project
   */
  listCheckpoints(projectId: string): Promise<Checkpoint[]>;

  /**
   * Delete workflow state (soft delete)
   */
  delete(projectId: string): Promise<void>;
}
```

**PostgreSQL Implementation:**
```typescript
// packages/orchestrator-core/src/persistence/postgres-state-store.ts

export class PostgresStateStore implements StateStore {
  constructor(private pool: Pool) {}

  async save(projectId: string, state: WorkflowState): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO workflow_states (project_id, current_phase, phase_states, global_context, budget, checkpoints, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (project_id)
      DO UPDATE SET
        current_phase = EXCLUDED.current_phase,
        phase_states = EXCLUDED.phase_states,
        global_context = EXCLUDED.global_context,
        budget = EXCLUDED.budget,
        checkpoints = EXCLUDED.checkpoints,
        updated_at = EXCLUDED.updated_at
      `,
      [
        projectId,
        state.currentPhase,
        JSON.stringify(state.phaseStates),
        JSON.stringify(state.globalContext),
        JSON.stringify(state.budget),
        JSON.stringify(state.checkpoints),
        state.createdAt,
        new Date(),
      ]
    );
  }

  async load(projectId: string, checkpointId?: string): Promise<WorkflowState> {
    if (checkpointId) {
      return this.loadFromCheckpoint(projectId, checkpointId);
    }

    const result = await this.pool.query(
      'SELECT * FROM workflow_states WHERE project_id = $1',
      [projectId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Workflow state not found for project: ${projectId}`);
    }

    return this.deserializeState(result.rows[0]);
  }

  async checkpoint(projectId: string, phase: Phase): Promise<Checkpoint> {
    const state = await this.load(projectId);

    const checkpoint: Checkpoint = {
      id: generateId(),
      phase,
      timestamp: new Date(),
      stateSnapshot: {
        phaseStates: state.phaseStates,
        budget: state.budget,
      },
    };

    // Append checkpoint to state
    state.checkpoints.push(checkpoint);
    await this.save(projectId, state);

    return checkpoint;
  }

  private deserializeState(row: any): WorkflowState {
    return {
      projectId: row.project_id,
      version: '1.0.0',
      currentPhase: row.current_phase,
      phaseStates: row.phase_states,
      globalContext: row.global_context,
      budget: row.budget,
      checkpoints: row.checkpoints || [],
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
```

#### 3. Lifecycle Orchestrator

**Interface:**
```typescript
// packages/orchestrator-core/src/orchestrator/lifecycle-orchestrator.ts

export interface LifecycleOrchestrator {
  /**
   * Start new workflow from idea input
   */
  startWorkflow(ideaInput: IdeaInput, config?: WorkflowConfig): Promise<string>;

  /**
   * Get current workflow state
   */
  getState(projectId: string): Promise<WorkflowState>;

  /**
   * Resume workflow from failure or checkpoint
   */
  resumeWorkflow(projectId: string, fromCheckpoint?: string): Promise<void>;

  /**
   * Cancel workflow
   */
  cancelWorkflow(projectId: string, reason: string): Promise<void>;

  /**
   * Manually advance to next phase (admin override)
   */
  advancePhase(projectId: string, targetPhase: Phase): Promise<void>;
}
```

**Implementation (Simplified):**
```typescript
import { StateGraph } from '@langchain/langgraph';

export class LifecycleOrchestratorImpl implements LifecycleOrchestrator {
  private graph: StateGraph<WorkflowState>;

  constructor(
    private stateStore: StateStore,
    private eventBus: EventBus,
    private gatekeeper: Gatekeeper,
    private budgetGuard: BudgetGuard
  ) {
    this.graph = this.buildGraph();
  }

  private buildGraph(): StateGraph<WorkflowState> {
    const graph = new StateGraph<WorkflowState>({
      channels: {
        projectId: { value: (left, right) => right ?? left },
        currentPhase: { value: (left, right) => right ?? left },
        phaseStates: { value: (left, right) => ({ ...left, ...right }) },
        globalContext: { value: (left, right) => ({ ...left, ...right }) },
        budget: { value: (left, right) => right ?? left },
      },
    });

    // Define nodes for each phase
    graph.addNode('INTAKE', this.handleIntake.bind(this));
    graph.addNode('REASONING', this.handleReasoning.bind(this));
    graph.addNode('CRITIQUE', this.handleCritique.bind(this));
    graph.addNode('PRD', this.handlePRD.bind(this));
    graph.addNode('BIZDEV', this.handleBizDev.bind(this));
    graph.addNode('ARCHITECTURE', this.handleArchitecture.bind(this));
    graph.addNode('BUILD_SETUP', this.handleBuildSetup.bind(this));
    graph.addNode('STORY_EXECUTION', this.handleStoryExecution.bind(this));
    graph.addNode('SYSTEM_QA', this.handleSystemQA.bind(this));
    graph.addNode('AESTHETIC', this.handleAesthetic.bind(this));
    graph.addNode('PACKAGE_DEPLOY', this.handlePackageDeploy.bind(this));
    graph.addNode('BETA', this.handleBeta.bind(this));
    graph.addNode('FEEDBACK', this.handleFeedback.bind(this));
    graph.addNode('GA', this.handleGA.bind(this));

    // Define edges (transitions)
    graph.addEdge('INTAKE', 'REASONING');
    graph.addEdge('REASONING', 'CRITIQUE');

    // Conditional edge: Critique gate
    graph.addConditionalEdges(
      'CRITIQUE',
      this.critiqueGateDecision.bind(this),
      {
        PASS: 'PRD',
        RETRY: 'REASONING',
        FAIL: '__end__',
      }
    );

    graph.addConditionalEdges(
      'PRD',
      this.prdGateDecision.bind(this),
      {
        PASS: 'BIZDEV',
        RETRY: 'PRD',
      }
    );

    graph.addConditionalEdges(
      'BIZDEV',
      this.bizdevGateDecision.bind(this),
      {
        PASS: 'ARCHITECTURE',
        FAIL: '__end__',
      }
    );

    graph.addEdge('ARCHITECTURE', 'BUILD_SETUP');
    graph.addEdge('BUILD_SETUP', 'STORY_EXECUTION');
    graph.addEdge('STORY_EXECUTION', 'SYSTEM_QA');
    graph.addEdge('SYSTEM_QA', 'AESTHETIC');
    graph.addEdge('AESTHETIC', 'PACKAGE_DEPLOY');
    graph.addEdge('PACKAGE_DEPLOY', 'BETA');
    graph.addEdge('BETA', 'FEEDBACK');

    graph.addConditionalEdges(
      'FEEDBACK',
      this.feedbackDecision.bind(this),
      {
        FIXES_NEEDED: 'STORY_EXECUTION',
        READY_FOR_GA: 'GA',
      }
    );

    graph.setEntryPoint('INTAKE');
    graph.setFinishPoint('GA');

    return graph.compile({
      checkpointer: new PostgresCheckpointer(this.stateStore),
    });
  }

  async startWorkflow(ideaInput: IdeaInput, config?: WorkflowConfig): Promise<string> {
    const projectId = generateProjectId();

    const initialState: WorkflowState = {
      projectId,
      version: '1.0.0',
      currentPhase: 'INTAKE',
      phaseStates: this.initializePhaseStates(),
      globalContext: {
        ideaInput,
        userPreferences: config?.userPreferences || {},
        complianceRequirements: config?.complianceRequirements || [],
      },
      budget: {
        cap: config?.budgetCap || 500,
        consumed: 0,
        breakdown: { llm: 0, tools: 0, infrastructure: 0 },
        alerts: [],
      },
      checkpoints: [],
      metadata: {
        owner: config?.owner || 'system',
        priority: config?.priority || 'medium',
        tags: config?.tags || [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.stateStore.save(projectId, initialState);

    // Start workflow (async)
    this.runWorkflow(initialState).catch((error) => {
      console.error(`Workflow failed for project ${projectId}:`, error);
    });

    return projectId;
  }

  private async runWorkflow(initialState: WorkflowState): Promise<void> {
    for await (const state of await this.graph.stream(initialState)) {
      // Save state after each step
      await this.stateStore.save(state.projectId, state as WorkflowState);

      // Check budget
      await this.budgetGuard.checkBudget(state.projectId);

      // Emit progress event
      await this.eventBus.publish('workflow.progress', {
        projectId: state.projectId,
        phase: state.currentPhase,
        status: state.phaseStates[state.currentPhase].status,
      });
    }
  }

  private async handleIntake(state: WorkflowState): Promise<Partial<WorkflowState>> {
    console.log(`[Orchestrator] Starting INTAKE phase for ${state.projectId}`);

    // Update phase status
    await this.updatePhaseStatus(state.projectId, 'INTAKE', 'IN_PROGRESS');

    // Publish event to trigger Intake service
    await this.eventBus.publish('intake.start', {
      projectId: state.projectId,
      ideaInput: state.globalContext.ideaInput,
    });

    // Wait for completion event (with timeout)
    const result = await this.eventBus.waitForEvent(
      `intake.complete.${state.projectId}`,
      { timeout: 300000 } // 5 minutes
    );

    // Create checkpoint
    await this.stateStore.checkpoint(state.projectId, 'INTAKE');

    return {
      phaseStates: {
        ...state.phaseStates,
        INTAKE: {
          ...state.phaseStates.INTAKE,
          status: 'COMPLETED',
          completedAt: new Date(),
          artifacts: [result.ideaSpecId],
          metrics: result.metrics,
        },
      },
      currentPhase: 'REASONING',
    };
  }

  private async critiqueGateDecision(state: WorkflowState): Promise<'PASS' | 'RETRY' | 'FAIL'> {
    const critiqueArtifactId = state.phaseStates.CRITIQUE.artifacts[0];
    const evaluation = await this.gatekeeper.evaluate('critique-gate', critiqueArtifactId);

    if (evaluation.passed) {
      return 'PASS';
    } else if (state.phaseStates.CRITIQUE.retryCount < 3) {
      return 'RETRY';
    } else {
      return 'FAIL'; // Project halted
    }
  }

  // ... similar handlers for other phases
}
```

#### 4. Supervisor Service

**Responsibility:** Monitor workflows, detect stuck/failed states, trigger auto-restarts.

**Interface:**
```typescript
// apps/orchestrator/src/supervisor/supervisor-service.ts

export interface SupervisorService {
  /**
   * Monitor all active workflows
   */
  monitorWorkflows(): Promise<void>;

  /**
   * Check if workflow is stuck
   */
  isWorkflowStuck(state: WorkflowState): boolean;

  /**
   * Attempt auto-restart
   */
  restartWorkflow(projectId: string, reason: string): Promise<void>;

  /**
   * Escalate to human
   */
  escalateToHuman(projectId: string, reason: string): Promise<void>;
}
```

**Implementation:**
```typescript
export class SupervisorServiceImpl implements SupervisorService {
  private readonly STUCK_THRESHOLD_MS = 600000; // 10 minutes
  private readonly MAX_RESTARTS = 3;

  constructor(
    private stateStore: StateStore,
    private orchestrator: LifecycleOrchestrator,
    private alerting: AlertingService
  ) {
    // Start monitoring loop
    this.startMonitoring();
  }

  private startMonitoring(): void {
    setInterval(() => {
      this.monitorWorkflows().catch(console.error);
    }, 60000); // every minute
  }

  async monitorWorkflows(): Promise<void> {
    const activeProjects = await this.getActiveProjects();

    for (const projectId of activeProjects) {
      const state = await this.stateStore.load(projectId);

      if (this.isWorkflowStuck(state)) {
        console.warn(`[Supervisor] Workflow stuck: ${projectId}`);

        const restartCount = this.getRestartCount(state);
        if (restartCount < this.MAX_RESTARTS) {
          await this.restartWorkflow(projectId, 'Stuck workflow detected');
        } else {
          await this.escalateToHuman(projectId, 'Max restarts exceeded');
        }
      }
    }
  }

  isWorkflowStuck(state: WorkflowState): boolean {
    const currentPhaseState = state.phaseStates[state.currentPhase];

    // Check if phase in progress for too long
    if (currentPhaseState.status === 'IN_PROGRESS' && currentPhaseState.startedAt) {
      const elapsedMs = Date.now() - currentPhaseState.startedAt.getTime();
      return elapsedMs > this.STUCK_THRESHOLD_MS;
    }

    return false;
  }

  async restartWorkflow(projectId: string, reason: string): Promise<void> {
    console.log(`[Supervisor] Restarting workflow: ${projectId}, reason: ${reason}`);

    await this.alerting.send({
      severity: 'warning',
      title: 'Workflow Restarted',
      message: `Project ${projectId} restarted due to: ${reason}`,
    });

    // Resume from last checkpoint
    await this.orchestrator.resumeWorkflow(projectId);
  }

  async escalateToHuman(projectId: string, reason: string): Promise<void> {
    console.error(`[Supervisor] Escalating to human: ${projectId}, reason: ${reason}`);

    await this.alerting.send({
      severity: 'critical',
      title: 'Workflow Escalation Required',
      message: `Project ${projectId} requires manual intervention: ${reason}`,
      escalate: true,
    });

    // Mark workflow as requiring human review
    const state = await this.stateStore.load(projectId);
    state.metadata.requiresHumanReview = true;
    await this.stateStore.save(projectId, state);
  }

  private async getActiveProjects(): Promise<string[]> {
    // Query for workflows not in terminal states
    return []; // implementation depends on DB schema
  }

  private getRestartCount(state: WorkflowState): number {
    return state.metadata.restartCount || 0;
  }
}
```

---

## Agent SDK Specification

### Overview

The Agent SDK provides a framework for building agents with the Analyzer-inside-Agent pattern, enabling intelligent tool usage optimization via Value-of-Information scoring.

### Core Components

#### 1. Base Agent Class

**Interface:**
```typescript
// packages/agent-sdk/src/base-agent.ts

export interface AgentConfig {
  id: string;
  version: string;
  name: string;
  description: string;
  phase: Phase;
  llm: LLMConfig;
  prompt: PromptConfig;
  tools: ToolsConfig;
  analyzer: AnalyzerConfig;
  verification: VerificationConfig;
  policies: PolicyConfig;
}

export interface AgentContext {
  projectId: string;
  phase: Phase;
  inputArtifacts: Record<string, Artifact>;
  budget: BudgetState;
  traceId: string;
  correlationId: string;
}

export interface AgentOutput {
  success: boolean;
  artifactId?: string;
  artifact?: unknown;
  error?: string;
  metadata: {
    toolsInvoked: ToolInvocation[];
    tokenUsage: number;
    cost: number;
    duration: number;
    voiScores: number[];
  };
}

export abstract class BaseAgent<TInput, TOutput> {
  constructor(
    protected config: AgentConfig,
    protected llm: LLM,
    protected toolRegistry: ToolRegistry,
    protected artifactStore: ArtifactStore,
    protected analyzer: Analyzer
  ) {}

  /**
   * Main execution entry point
   */
  async execute(context: AgentContext): Promise<AgentOutput> {
    const startTime = Date.now();
    const span = trace.getTracer('agent').startSpan(this.config.id);

    try {
      // 1. Planner: Decompose task
      const plan = await this.plan(context);
      span.addEvent('plan_created', { taskCount: plan.tasks.length });

      // 2. Analyzer + Executor: Execute with tool optimization
      const result = await this.analyzeAndExecute(plan, context);
      span.addEvent('execution_complete');

      // 3. Verifier: Validate output
      const output = await this.verify(result, context);
      span.addEvent('verification_complete', { passed: output.success });

      // 4. Recorder: Capture metrics
      await this.record(context, output, Date.now() - startTime);

      span.setStatus({ code: SpanStatusCode.OK });
      return output;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Planner: Decompose task into sub-tasks and identify required tools
   */
  protected abstract plan(context: AgentContext): Promise<Plan<TInput>>;

  /**
   * Analyzer + Executor: Decide which tools to invoke and execute them
   */
  protected abstract analyzeAndExecute(
    plan: Plan<TInput>,
    context: AgentContext
  ): Promise<TOutput>;

  /**
   * Verifier: Validate output against acceptance criteria
   */
  protected abstract verify(
    result: TOutput,
    context: AgentContext
  ): Promise<AgentOutput>;

  /**
   * Recorder: Capture execution details for audit and learning
   */
  protected async record(
    context: AgentContext,
    output: AgentOutput,
    duration: number
  ): Promise<void> {
    await this.auditLog.record({
      timestamp: new Date(),
      projectId: context.projectId,
      phase: context.phase,
      actorType: 'agent',
      actorId: this.config.id,
      action: 'execute',
      inputs: { inputArtifacts: Object.keys(context.inputArtifacts) },
      outputs: { artifactId: output.artifactId, success: output.success },
      metadata: {
        duration,
        cost: output.metadata.cost,
        toolsInvoked: output.metadata.toolsInvoked.length,
      },
      traceId: context.traceId,
    });
  }
}
```

#### 2. Analyzer (VOI Calculation)

**Interface:**
```typescript
// packages/agent-sdk/src/analyzer.ts

export interface ToolCandidate {
  toolId: string;
  params: Record<string, unknown>;
  estimatedQualityGain: number; // 0-1 (how much will output improve?)
  estimatedCost: number; // USD
  estimatedLatency: number; // milliseconds
  confidence: number; // 0-1 (confidence in estimates)
}

export interface AnalysisContext {
  confidenceWithoutTool: number; // 0-1 (current confidence level)
  costSensitivity: 'low' | 'medium' | 'high'; // 0.3 | 0.5 | 0.7
  latencySensitivity: 'low' | 'medium' | 'high';
  budgetRemaining: number;
}

export interface AnalyzerConfig {
  enabled: boolean;
  voiThreshold: number; // 0-1 (minimum VOI to invoke tool)
  confidenceThreshold: number; // 0-1 (skip tool if confidence already high)
  costSensitivity: 'low' | 'medium' | 'high';
  latencySensitivity: 'low' | 'medium' | 'high';
}

export class Analyzer {
  constructor(private config: AnalyzerConfig) {}

  /**
   * Calculate Value-of-Information for a tool invocation
   */
  calculateVOI(candidate: ToolCandidate, context: AnalysisContext): number {
    const { estimatedQualityGain, estimatedCost, estimatedLatency } = candidate;
    const { confidenceWithoutTool, costSensitivity, latencySensitivity } = context;

    // Quality improvement factor (diminishing returns if already confident)
    const qualityFactor = estimatedQualityGain * (1 - confidenceWithoutTool);

    // Cost penalty (normalized to 0-1 scale)
    const maxCost = 10; // $10 considered expensive for a single tool call
    const costPenalty = (estimatedCost / maxCost) * this.getSensitivityWeight(costSensitivity);

    // Latency penalty (normalized to 0-1 scale)
    const maxLatency = 60000; // 1 minute considered slow
    const latencyPenalty = (estimatedLatency / maxLatency) * this.getSensitivityWeight(latencySensitivity);

    // VOI = expected benefit - expected costs
    const voi = qualityFactor - costPenalty - latencyPenalty;

    // Clamp to 0-1 range
    return Math.max(0, Math.min(1, voi));
  }

  /**
   * Select tools to invoke based on VOI threshold
   */
  selectTools(
    candidates: ToolCandidate[],
    context: AnalysisContext
  ): ToolCandidate[] {
    // Skip analysis if confidence already high
    if (context.confidenceWithoutTool >= this.config.confidenceThreshold) {
      return [];
    }

    // Calculate VOI for each candidate
    const rankedCandidates = candidates
      .map((c) => ({
        ...c,
        voi: this.calculateVOI(c, context),
      }))
      .filter((c) => c.voi >= this.config.voiThreshold)
      .sort((a, b) => b.voi - a.voi); // highest VOI first

    // Budget check: exclude tools that exceed remaining budget
    const affordable = rankedCandidates.filter(
      (c) => c.estimatedCost <= context.budgetRemaining
    );

    return affordable;
  }

  private getSensitivityWeight(sensitivity: 'low' | 'medium' | 'high'): number {
    switch (sensitivity) {
      case 'low': return 0.3;
      case 'medium': return 0.5;
      case 'high': return 0.7;
    }
  }
}
```

#### 3. Example Agent Implementation (PRD Feature Extraction)

```typescript
// services/prd/src/agents/feature-extraction-agent.ts

import { BaseAgent, Plan, AgentContext, AgentOutput } from '@ideamine/agent-sdk';

interface FeatureExtractionInput {
  discoveryPackId: string;
  critiqueReportId: string;
}

interface FeatureExtractionOutput {
  features: Feature[];
  userStories: UserStory[];
}

export class FeatureExtractionAgent extends BaseAgent<
  FeatureExtractionInput,
  FeatureExtractionOutput
> {
  protected async plan(context: AgentContext): Promise<Plan<FeatureExtractionInput>> {
    // Retrieve input artifacts
    const discoveryPack = await this.artifactStore.retrieve<DiscoveryPack>(
      context.inputArtifacts.discoveryPack
    );

    const critiqueReport = await this.artifactStore.retrieve<CritiqueReport>(
      context.inputArtifacts.critiqueReport
    );

    // Decompose into sub-tasks
    return {
      tasks: [
        {
          id: 'extract-features-from-personas',
          type: 'extraction',
          input: { personas: discoveryPack.personas },
          toolCandidates: [
            {
              toolId: 'extractFeatures',
              params: { source: 'personas', data: discoveryPack.personas },
              estimatedQualityGain: 0.8,
              estimatedCost: 0.15,
              estimatedLatency: 5000,
              confidence: 0.9,
            },
          ],
        },
        {
          id: 'extract-features-from-journeys',
          type: 'extraction',
          input: { journeyMaps: discoveryPack.journeyMaps },
          toolCandidates: [
            {
              toolId: 'extractFeatures',
              params: { source: 'journeys', data: discoveryPack.journeyMaps },
              estimatedQualityGain: 0.7,
              estimatedCost: 0.12,
              estimatedLatency: 4000,
              confidence: 0.85,
            },
          ],
        },
        {
          id: 'filter-risky-features',
          type: 'filtering',
          input: { risks: critiqueReport.technicalRisks },
          toolCandidates: [],
        },
      ],
    };
  }

  protected async analyzeAndExecute(
    plan: Plan<FeatureExtractionInput>,
    context: AgentContext
  ): Promise<FeatureExtractionOutput> {
    let allFeatures: Feature[] = [];

    for (const task of plan.tasks) {
      // Analyzer decides which tools to invoke
      const analysisContext: AnalysisContext = {
        confidenceWithoutTool: 0.5, // moderate confidence without tools
        costSensitivity: this.config.analyzer.costSensitivity,
        latencySensitivity: this.config.analyzer.latencySensitivity,
        budgetRemaining: context.budget.cap - context.budget.consumed,
      };

      const selectedTools = this.analyzer.selectTools(task.toolCandidates, analysisContext);

      if (selectedTools.length > 0) {
        // Invoke tools
        for (const tool of selectedTools) {
          const result = await this.toolRegistry.execute(tool.toolId, tool.params, context);
          allFeatures.push(...result.features);
        }
      } else {
        // Use LLM directly (no tool justified by VOI)
        const llmResult = await this.llm.generate({
          prompt: this.buildPrompt(task),
          maxTokens: 4000,
        });
        allFeatures.push(...this.parseFeatures(llmResult.text));
      }
    }

    // Deduplicate and categorize features
    const deduped = this.deduplicateFeatures(allFeatures);
    const userStories = await this.convertToUserStories(deduped);

    return { features: deduped, userStories };
  }

  protected async verify(
    result: FeatureExtractionOutput,
    context: AgentContext
  ): Promise<AgentOutput> {
    // Verification checks
    const checks = [
      { name: 'minimum_features', passed: result.features.length >= 50 },
      { name: 'minimum_stories', passed: result.userStories.length >= 50 },
      {
        name: 'category_distribution',
        passed: this.hasCategoryDistribution(result.features),
      },
      {
        name: 'acceptance_criteria_coverage',
        passed: result.userStories.every((s) => s.acceptanceCriteria.length >= 3),
      },
    ];

    const allPassed = checks.every((c) => c.passed);

    if (!allPassed) {
      return {
        success: false,
        error: `Verification failed: ${checks.filter((c) => !c.passed).map((c) => c.name).join(', ')}`,
        metadata: this.buildMetadata(),
      };
    }

    // Store artifact
    const artifactId = await this.artifactStore.store({
      type: 'PRD',
      version: '1.0.0',
      projectId: context.projectId,
      content: result,
    });

    return {
      success: true,
      artifactId,
      artifact: result,
      metadata: this.buildMetadata(),
    };
  }

  private hasCategoryDistribution(features: Feature[]): boolean {
    const categories = ['core', 'nice-to-have', 'future'];
    return categories.every(
      (cat) => features.filter((f) => f.category === cat).length >= features.length * 0.1
    );
  }

  // ... helper methods
}
```

---

## Tool SDK Specification

### Overview

The Tool SDK defines the interface for creating, registering, and executing tools in sandboxed environments.

### Tool Definition Schema

**tool.yaml:**
```yaml
tool:
  # Metadata
  id: "web-search"
  version: "2.1.0"
  name: "Web Search"
  description: "Searches the web using Tavily API and returns ranked results"
  category: "research"
  tags:
    - "research"
    - "web"
    - "tavily"

  # Parameters
  parameters:
    query:
      type: "string"
      required: true
      description: "Search query string"
      minLength: 1
      maxLength: 500
    maxResults:
      type: "number"
      required: false
      default: 10
      minimum: 1
      maximum: 20
      description: "Maximum number of results to return"
    includeRawContent:
      type: "boolean"
      required: false
      default: false
      description: "Include full page content in results"

  # Return schema
  returns:
    type: "array"
    items:
      type: "object"
      properties:
        url:
          type: "string"
          format: "uri"
        title:
          type: "string"
        snippet:
          type: "string"
        score:
          type: "number"
          description: "Relevance score 0-1"
        publishedDate:
          type: "string"
          format: "date"

  # Execution config
  execution:
    runtime: "node:20-alpine"
    entrypoint: "./dist/index.js"
    timeout: 30000 # 30 seconds
    retries: 3
    retryBackoff: "exponential"
    sandbox:
      enabled: true
      network:
        allowlist:
          - "api.tavily.com"
      resources:
        cpu: "1"
        memory: "512Mi"
        disk: "1Gi"

  # Cost model
  cost:
    perInvocation: 0.05
    perResult: 0.01

  # Secrets
  secrets:
    - name: "TAVILY_API_KEY"
      required: true

  # Dependencies
  dependencies:
    npm:
      - "axios@^1.6.0"
      - "zod@^3.22.0"

  # Testing
  tests:
    - name: "successful_search"
      input:
        query: "artificial intelligence"
        maxResults: 5
      expectedOutput:
        type: "array"
        minLength: 1
        maxLength: 5

  # Approval
  approval:
    status: "approved"
    approvedBy: "security-team"
    approvedAt: "2025-10-01T00:00:00Z"
    securityScanPassed: true
    lastReviewed: "2025-10-01T00:00:00Z"
```

### Tool Implementation

**TypeScript Interface:**
```typescript
// packages/tool-sdk/src/tool.ts

export interface Tool<TParams = unknown, TResult = unknown> {
  id: string;
  version: string;
  execute(params: TParams, context: ToolContext): Promise<TResult>;
}

export interface ToolContext {
  projectId: string;
  agentId: string;
  traceId: string;
  secrets: Record<string, string>;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: string;
  metadata: {
    duration: number;
    cost: number;
  };
}
```

**Example Tool Implementation:**
```typescript
// platform/tool-registry/tools/web-search/src/index.ts

import axios from 'axios';
import { z } from 'zod';
import { Tool, ToolContext } from '@ideamine/tool-sdk';

// Input schema
const WebSearchParamsSchema = z.object({
  query: z.string().min(1).max(500),
  maxResults: z.number().int().min(1).max(20).default(10),
  includeRawContent: z.boolean().default(false),
});

type WebSearchParams = z.infer<typeof WebSearchParamsSchema>;

// Output schema
interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  score: number;
  publishedDate?: string;
  rawContent?: string;
}

export class WebSearchTool implements Tool<WebSearchParams, SearchResult[]> {
  id = 'web-search';
  version = '2.1.0';

  async execute(params: WebSearchParams, context: ToolContext): Promise<SearchResult[]> {
    // Validate input
    const validated = WebSearchParamsSchema.parse(params);

    // Get API key from secrets
    const apiKey = context.secrets.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error('TAVILY_API_KEY secret not found');
    }

    // Call Tavily API
    const response = await axios.post(
      'https://api.tavily.com/search',
      {
        query: validated.query,
        max_results: validated.maxResults,
        include_raw_content: validated.includeRawContent,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        timeout: 25000, // slightly less than tool timeout
      }
    );

    // Transform results
    return response.data.results.map((r: any) => ({
      url: r.url,
      title: r.title,
      snippet: r.snippet,
      score: r.score,
      publishedDate: r.published_date,
      rawContent: validated.includeRawContent ? r.raw_content : undefined,
    }));
  }
}

// Export for tool executor
export default new WebSearchTool();
```

### Tool Executor

**Interface:**
```typescript
// packages/tool-sdk/src/executor.ts

export interface ToolExecutor {
  execute(request: ToolExecutionRequest): Promise<ToolExecutionResult>;
}

export interface ToolExecutionRequest {
  toolId: string;
  version: string;
  params: Record<string, unknown>;
  context: ToolContext;
  retryCount?: number;
}

export interface ToolExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  duration: number;
  cost: number;
  resultId?: string;
}
```

**Implementation (Simplified):**
```typescript
// packages/tool-sdk/src/executor-impl.ts

export class ToolExecutorImpl implements ToolExecutor {
  constructor(
    private toolRegistry: ToolRegistry,
    private sandboxManager: SandboxManager,
    private secretsManager: SecretsManager,
    private artifactStore: ArtifactStore
  ) {}

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const { toolId, version, params, context } = request;
    const startTime = Date.now();

    // 1. Load tool definition
    const tool = await this.toolRegistry.getTool(toolId, version);

    // 2. Validate params
    this.validateParams(params, tool.parameters);

    // 3. Create sandbox
    const sandbox = await this.sandboxManager.createSandbox({
      runtime: tool.execution.runtime,
      resources: tool.execution.sandbox.resources,
      network: tool.execution.sandbox.network,
      timeout: tool.execution.timeout,
    });

    try {
      // 4. Inject secrets
      const secrets = await this.secretsManager.getSecrets(tool.secrets.map((s) => s.name));
      await sandbox.injectSecrets(secrets);

      // 5. Execute tool in sandbox
      const output = await sandbox.run(tool.execution.entrypoint, {
        params,
        context: {
          projectId: context.projectId,
          agentId: context.agentId,
          traceId: context.traceId,
        },
      });

      // 6. Validate output
      this.validateOutput(output, tool.returns);

      // 7. Sanitize output (redact secrets)
      const sanitized = this.sanitizeOutput(output);

      const duration = Date.now() - startTime;
      const cost = this.calculateCost(tool, params, output);

      // 8. Store result
      const resultId = await this.artifactStore.store({
        type: 'tool-result',
        toolId,
        version,
        params,
        output: sanitized,
        context,
      });

      return {
        success: true,
        output: sanitized,
        duration,
        cost,
        resultId,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Retry logic
      if (this.isRetryable(error) && (request.retryCount || 0) < tool.execution.retries) {
        await this.delay(this.calculateBackoff(request.retryCount || 0));
        return this.execute({ ...request, retryCount: (request.retryCount || 0) + 1 });
      }

      return {
        success: false,
        error: error.message,
        duration,
        cost: tool.cost.perInvocation,
      };
    } finally {
      await sandbox.destroy();
    }
  }

  private calculateCost(tool: ToolDefinition, params: any, output: any): number {
    let cost = tool.cost.perInvocation;

    // Add per-result cost if applicable
    if (tool.cost.perResult && Array.isArray(output)) {
      cost += output.length * tool.cost.perResult;
    }

    return cost;
  }

  private sanitizeOutput(output: unknown): unknown {
    // Redact patterns matching secrets
    const serialized = JSON.stringify(output);
    const sanitized = serialized
      .replace(/sk-[a-zA-Z0-9]{48}/g, '[REDACTED_API_KEY]')
      .replace(/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED_TOKEN]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]');

    return JSON.parse(sanitized);
  }

  private isRetryable(error: Error): boolean {
    // Retry on network errors, timeouts, 5xx responses
    return (
      error.name === 'NetworkError' ||
      error.name === 'TimeoutError' ||
      (error as any).response?.status >= 500
    );
  }

  private calculateBackoff(retryCount: number): number {
    // Exponential backoff with jitter
    const baseDelay = 1000; // 1 second
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, 30000); // max 30 seconds
  }
}
```

---

## Event Schemas

### Event Base Schema

```typescript
// packages/event-schemas/src/base.ts

export interface Event<T = unknown> {
  id: string; // UUID v7 (time-sortable)
  type: string;
  projectId: string;
  timestamp: string; // ISO 8601
  version: string; // event schema version
  payload: T;
  metadata: EventMetadata;
}

export interface EventMetadata {
  source: string; // service that emitted event
  traceId: string;
  correlationId: string;
  retryCount?: number;
}
```

### Phase Events

```typescript
// packages/event-schemas/src/phase-events.ts

// Intake
export interface IntakeStartEvent extends Event<{
  ideaInput: IdeaInput;
}> {
  type: 'intake.start';
}

export interface IntakeCompleteEvent extends Event<{
  ideaSpecId: string;
  ideaSpec: IdeaSpec;
  metrics: PhaseMetrics;
}> {
  type: 'intake.complete';
}

// Reasoning
export interface ReasoningStartEvent extends Event<{
  ideaSpecId: string;
}> {
  type: 'reasoning.start';
}

export interface ReasoningCompleteEvent extends Event<{
  discoveryPackId: string;
  discoveryPack: DiscoveryPack;
  metrics: PhaseMetrics;
}> {
  type: 'reasoning.complete';
}

// Critique
export interface CritiqueStartEvent extends Event<{
  discoveryPackId: string;
}> {
  type: 'critique.start';
}

export interface CritiqueCompleteEvent extends Event<{
  critiqueReportId: string;
  critiqueReport: CritiqueReport;
  metrics: PhaseMetrics;
}> {
  type: 'critique.complete';
}

// Gate Evaluation
export interface GateEvaluationEvent extends Event<{
  gateId: string;
  artifactId: string;
  passed: boolean;
  checkResults: CheckResult[];
  humanReviewRequired: boolean;
}> {
  type: 'gate.evaluated';
}

// Budget
export interface BudgetAlertEvent extends Event<{
  threshold: number; // e.g., 0.8 for 80%
  consumed: number;
  cap: number;
}> {
  type: 'budget.alert';
}

// Workflow
export interface WorkflowProgressEvent extends Event<{
  phase: Phase;
  status: PhaseStatus;
  progressPercent: number;
}> {
  type: 'workflow.progress';
}
```

---

## Gatekeeper Specification

### Gate Configuration Schema

```typescript
// packages/orchestrator-core/src/gatekeeper/types.ts

export interface GateConfig {
  id: string;
  name: string;
  phase: Phase;
  checks: Check[];
  humanReview: HumanReviewConfig;
  actions: GateActions;
}

export interface Check {
  id: string;
  name: string;
  type: 'count' | 'percentage' | 'boolean' | 'custom';
  required: boolean;
  threshold?: number;
  operator?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  extractor: string; // JSONPath expression
  customValidator?: string; // function name
  errorMessage?: string;
}

export interface HumanReviewConfig {
  enabled: boolean;
  triggers: string[]; // JSONPath conditions
  reviewers: string[]; // user IDs or roles
  sla: number; // SLA in hours
}

export interface GateActions {
  onPass: string; // next phase or action
  onFail: string; // retry action
  onHumanReviewRequired: string; // escalation action
}
```

### Example Gate Configurations

**PRD Gate:**
```yaml
gate:
  id: "prd-gate"
  name: "PRD Quality Gate"
  phase: "PRD"
  checks:
    - id: "min-user-stories"
      name: "Minimum User Stories"
      type: "count"
      required: true
      threshold: 50
      operator: "gte"
      extractor: "$.userStories.length"
      errorMessage: "PRD must contain at least 50 user stories"

    - id: "acceptance-criteria-coverage"
      name: "Acceptance Criteria Coverage"
      type: "percentage"
      required: true
      threshold: 100
      extractor: "$.userStories[?(@.acceptanceCriteria.length >= 3)].length / $.userStories.length * 100"
      errorMessage: "All user stories must have at least 3 acceptance criteria"

    - id: "nfr-documented"
      name: "Non-Functional Requirements Documented"
      type: "boolean"
      required: true
      extractor: "$.nonFunctionalRequirements"
      errorMessage: "Non-functional requirements must be documented"

    - id: "r0-scope-constraint"
      name: "R0 Scope Constraint"
      type: "count"
      required: true
      threshold: 30
      operator: "lte"
      extractor: "$.roadmap.R0.stories.length"
      errorMessage: "R0 must contain at most 30 stories for MVP"

  humanReview:
    enabled: true
    triggers:
      - "$.roadmap.R0.stories.length > 40"
      - "$.userStories[?(@.estimate > 13)].length > 5"
    reviewers:
      - "product-owner"
    sla: 24

  actions:
    onPass: "advance_to_bizdev"
    onFail: "retry_prd_generation"
    onHumanReviewRequired: "escalate_to_product_owner"
```

---

## Budget Guard Specification

### Budget Tracking

```typescript
// packages/orchestrator-core/src/budget-guard/types.ts

export interface BudgetConfig {
  cap: number; // USD
  alerts: BudgetAlertConfig[];
  hardStop: boolean; // stop workflow at 100%?
}

export interface BudgetAlertConfig {
  threshold: number; // 0-1 (e.g., 0.8 = 80%)
  channels: string[]; // 'slack', 'email', 'webhook'
  recipients: string[];
}

export interface BudgetEntry {
  id: string;
  projectId: string;
  phase: Phase;
  actorType: 'agent' | 'tool' | 'infrastructure';
  actorId: string;
  itemType: 'llm' | 'tool' | 'compute' | 'storage';
  costUSD: number;
  timestamp: Date;
  metadata: Record<string, unknown>;
}
```

### Budget Guard Service

```typescript
// packages/orchestrator-core/src/budget-guard/budget-guard-service.ts

export class BudgetGuardService {
  constructor(
    private stateStore: StateStore,
    private alerting: AlertingService
  ) {}

  async trackCost(entry: BudgetEntry): Promise<void> {
    // Record cost
    await this.db.insert('budget_tracking', entry);

    // Update workflow state budget
    const state = await this.stateStore.load(entry.projectId);
    state.budget.consumed += entry.costUSD;
    state.budget.breakdown[entry.itemType] += entry.costUSD;
    await this.stateStore.save(entry.projectId, state);

    // Check thresholds
    await this.checkBudget(entry.projectId);
  }

  async checkBudget(projectId: string): Promise<void> {
    const state = await this.stateStore.load(projectId);
    const { cap, consumed, alerts } = state.budget;
    const percentConsumed = consumed / cap;

    // Check alert thresholds
    for (const alert of alerts) {
      if (percentConsumed >= alert.threshold && !alert.triggered) {
        await this.triggerAlert(projectId, alert);
        alert.triggered = true;
        await this.stateStore.save(projectId, state);
      }
    }

    // Hard stop at 100%
    if (percentConsumed >= 1.0 && state.budget.hardStop) {
      throw new BudgetExceededError(`Budget cap of $${cap} exceeded for project ${projectId}`);
    }
  }

  private async triggerAlert(projectId: string, alert: BudgetAlertConfig): Promise<void> {
    await this.alerting.send({
      severity: 'warning',
      title: `Budget Alert: ${alert.threshold * 100}% threshold reached`,
      message: `Project ${projectId} has consumed ${alert.threshold * 100}% of budget`,
      channels: alert.channels,
      recipients: alert.recipients,
    });
  }
}
```

---

## API Specifications

### REST API (OpenAPI 3.1)

**Excerpt:**
```yaml
openapi: 3.1.0
info:
  title: IdeaMine Platform API
  version: 1.0.0
  description: REST API for IdeaMine autonomous software development platform

servers:
  - url: https://api.ideamine.dev/v1
    description: Production
  - url: https://staging-api.ideamine.dev/v1
    description: Staging

paths:
  /projects:
    post:
      summary: Submit new idea and start workflow
      operationId: createProject
      tags:
        - Projects
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/IdeaInput'
      responses:
        '201':
          description: Project created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ProjectCreatedResponse'

    get:
      summary: List all projects
      operationId: listProjects
      tags:
        - Projects
      security:
        - bearerAuth: []
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [in_progress, completed, failed]
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
            maximum: 100
      responses:
        '200':
          description: Projects retrieved successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ProjectListResponse'

  /projects/{projectId}:
    get:
      summary: Get project details
      operationId: getProject
      tags:
        - Projects
      security:
        - bearerAuth: []
      parameters:
        - name: projectId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Project details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Project'

  /projects/{projectId}/status:
    get:
      summary: Get workflow status
      operationId: getWorkflowStatus
      tags:
        - Projects
      security:
        - bearerAuth: []
      parameters:
        - name: projectId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Workflow status
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/WorkflowStatus'

  /artifacts/{artifactId}:
    get:
      summary: Retrieve artifact
      operationId: getArtifact
      tags:
        - Artifacts
      security:
        - bearerAuth: []
      parameters:
        - name: artifactId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Artifact retrieved
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Artifact'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    IdeaInput:
      type: object
      required:
        - title
        - description
      properties:
        title:
          type: string
          minLength: 10
          maxLength: 200
        description:
          type: string
          minLength: 100
          maxLength: 5000
        targetUsers:
          type: array
          items:
            type: string
        constraints:
          type: object
          properties:
            budget:
              type: number
            timeline:
              type: number
            compliance:
              type: array
              items:
                type: string

    ProjectCreatedResponse:
      type: object
      properties:
        projectId:
          type: string
          format: uuid
        status:
          type: string
          enum: [created]
        createdAt:
          type: string
          format: date-time

    WorkflowStatus:
      type: object
      properties:
        projectId:
          type: string
          format: uuid
        currentPhase:
          type: string
        phaseStates:
          type: object
          additionalProperties:
            $ref: '#/components/schemas/PhaseState'
        budget:
          $ref: '#/components/schemas/BudgetState'

    PhaseState:
      type: object
      properties:
        status:
          type: string
          enum: [PENDING, IN_PROGRESS, COMPLETED, FAILED, SKIPPED]
        startedAt:
          type: string
          format: date-time
        completedAt:
          type: string
          format: date-time
        artifacts:
          type: array
          items:
            type: string
            format: uuid

    BudgetState:
      type: object
      properties:
        cap:
          type: number
        consumed:
          type: number
        breakdown:
          type: object
          properties:
            llm:
              type: number
            tools:
              type: number
            infrastructure:
              type: number
```

---

**End of Technical Specifications Document**

**Revision History:**
- v1.0.0 (2025-10-18): Initial technical specifications
