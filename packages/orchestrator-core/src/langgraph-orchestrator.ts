import { StateGraph, END, START } from '@langchain/langgraph';
import { WorkflowState } from '@ideamine/event-schemas';
import { WorkflowRun, PhaseConfig, PhaseState } from './types';
import { EventPublisher } from './event-publisher';

/**
 * LangGraph Orchestrator
 *
 * Implements the 12-phase pipeline using LangGraph state machines.
 * Each phase is a node in the graph, with conditional edges for gate evaluation.
 *
 * State Flow:
 * START -> Intake -> Ideation -> Critique -> [CritiqueGate]
 *   -> PRD -> [PRDGate] -> BizDev -> [ViabilityGate]
 *   -> Architecture -> [ArchitectureGate] -> Build
 *   -> StoryLoop -> QA -> [QAGate] -> Aesthetic -> [AestheticGate]
 *   -> Release -> Beta -> [Feedback] -> GA -> END
 *
 * Each gate can: PASS (continue), FAIL (retry), or ESCALATE (human review)
 */

/**
 * Graph state - carries context through the workflow
 */
export interface GraphState {
  workflowRun: WorkflowRun;
  currentPhase: string;
  error?: string;
  gateResults: Map<string, boolean>;
  retryCount: number;
}

/**
 * Phase execution result
 */
interface PhaseResult {
  success: boolean;
  artifacts: string[];
  costUsd: number;
  error?: string;
}

/**
 * LangGraph-based workflow orchestrator
 */
export class LangGraphOrchestrator {
  private graph: StateGraph<GraphState>;
  private eventPublisher: EventPublisher;
  private compiledGraph?: ReturnType<StateGraph<GraphState>['compile']>;

  constructor() {
    this.eventPublisher = new EventPublisher();
    this.graph = new StateGraph<GraphState>({
      channels: {
        workflowRun: {
          value: (left?: WorkflowRun, right?: WorkflowRun) => right ?? left!,
        },
        currentPhase: {
          value: (left?: string, right?: string) => right ?? left ?? '',
        },
        error: {
          value: (left?: string, right?: string) => right ?? left,
        },
        gateResults: {
          value: (left?: Map<string, boolean>, right?: Map<string, boolean>) => {
            return right ?? left ?? new Map();
          },
        },
        retryCount: {
          value: (left?: number, right?: number) => right ?? left ?? 0,
        },
      },
    });

    this.buildGraph();
  }

  /**
   * Build the workflow graph with all phases and gates
   */
  private buildGraph(): void {
    // Define all phase nodes
    this.graph.addNode('intake', this.executeIntakePhase.bind(this));
    this.graph.addNode('ideation', this.executeIdeationPhase.bind(this));
    this.graph.addNode('critique', this.executeCritiquePhase.bind(this));
    this.graph.addNode('critiqueGate', this.evaluateCritiqueGate.bind(this));
    this.graph.addNode('prd', this.executePRDPhase.bind(this));
    this.graph.addNode('prdGate', this.evaluatePRDGate.bind(this));
    this.graph.addNode('bizdev', this.executeBizDevPhase.bind(this));
    this.graph.addNode('viabilityGate', this.evaluateViabilityGate.bind(this));
    this.graph.addNode('architecture', this.executeArchitecturePhase.bind(this));
    this.graph.addNode('architectureGate', this.evaluateArchitectureGate.bind(this));
    this.graph.addNode('build', this.executeBuildPhase.bind(this));
    this.graph.addNode('storyLoop', this.executeStoryLoopPhase.bind(this));
    this.graph.addNode('qa', this.executeQAPhase.bind(this));
    this.graph.addNode('qaGate', this.evaluateQAGate.bind(this));
    this.graph.addNode('aesthetic', this.executeAestheticPhase.bind(this));
    this.graph.addNode('aestheticGate', this.evaluateAestheticGate.bind(this));
    this.graph.addNode('release', this.executeReleasePhase.bind(this));
    this.graph.addNode('beta', this.executeBetaPhase.bind(this));

    // Define edges: linear flow with gates
    this.graph.addEdge(START, 'intake');
    this.graph.addEdge('intake', 'ideation');
    this.graph.addEdge('ideation', 'critique');
    this.graph.addEdge('critique', 'critiqueGate');

    // Critique gate: conditional routing
    this.graph.addConditionalEdges(
      'critiqueGate',
      this.routeGate.bind(this, 'critiqueGate'),
      {
        pass: 'prd',
        retry: 'critique',
        fail: END,
      }
    );

    this.graph.addEdge('prd', 'prdGate');
    this.graph.addConditionalEdges(
      'prdGate',
      this.routeGate.bind(this, 'prdGate'),
      {
        pass: 'bizdev',
        retry: 'prd',
        fail: END,
      }
    );

    this.graph.addEdge('bizdev', 'viabilityGate');
    this.graph.addConditionalEdges(
      'viabilityGate',
      this.routeGate.bind(this, 'viabilityGate'),
      {
        pass: 'architecture',
        retry: 'bizdev',
        fail: END,
      }
    );

    this.graph.addEdge('architecture', 'architectureGate');
    this.graph.addConditionalEdges(
      'architectureGate',
      this.routeGate.bind(this, 'architectureGate'),
      {
        pass: 'build',
        retry: 'architecture',
        fail: END,
      }
    );

    this.graph.addEdge('build', 'storyLoop');
    this.graph.addEdge('storyLoop', 'qa');
    this.graph.addEdge('qa', 'qaGate');

    this.graph.addConditionalEdges(
      'qaGate',
      this.routeGate.bind(this, 'qaGate'),
      {
        pass: 'aesthetic',
        retry: 'qa',
        fail: END,
      }
    );

    this.graph.addEdge('aesthetic', 'aestheticGate');
    this.graph.addConditionalEdges(
      'aestheticGate',
      this.routeGate.bind(this, 'aestheticGate'),
      {
        pass: 'release',
        retry: 'aesthetic',
        fail: END,
      }
    );

    this.graph.addEdge('release', 'beta');
    this.graph.addEdge('beta', END);

    // Compile the graph
    this.compiledGraph = this.graph.compile();
  }

  /**
   * Execute a workflow from start to end
   */
  async executeWorkflow(workflowRun: WorkflowRun): Promise<WorkflowRun> {
    if (!this.compiledGraph) {
      throw new Error('Graph not compiled');
    }

    console.log(`[LangGraphOrchestrator] Starting workflow: ${workflowRun.id}`);

    const initialState: GraphState = {
      workflowRun,
      currentPhase: 'intake',
      gateResults: new Map(),
      retryCount: 0,
    };

    try {
      // Execute the graph
      const result = await this.compiledGraph.invoke(initialState);

      console.log(`[LangGraphOrchestrator] Workflow completed: ${workflowRun.id}`);

      return result.workflowRun;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LangGraphOrchestrator] Workflow failed: ${errorMessage}`);

      workflowRun.state = WorkflowState.FAILED;
      await this.eventPublisher.publishWorkflowFailed(
        workflowRun,
        errorMessage,
        false
      );

      throw error;
    }
  }

  /**
   * Gate routing logic
   */
  private routeGate(gateId: string, state: GraphState): 'pass' | 'retry' | 'fail' {
    const passed = state.gateResults.get(gateId);

    if (passed === undefined) {
      throw new Error(`Gate result not found: ${gateId}`);
    }

    if (passed) {
      return 'pass';
    }

    // Check retry limit
    if (state.retryCount >= state.workflowRun.budget.maxRetries) {
      return 'fail';
    }

    return 'retry';
  }

  // ============================================================================
  // Phase Execution Methods
  // ============================================================================

  private async executeIntakePhase(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Executing Intake phase');

    state.workflowRun.state = WorkflowState.INTAKE;
    await this.eventPublisher.publishWorkflowStateChanged(
      state.workflowRun,
      WorkflowState.CREATED,
      WorkflowState.INTAKE
    );

    try {
      // Load intake agent configurations
      const {
        IntakeClassifierAgent,
        IntakeExpanderAgent,
        IntakeValidatorAgent,
        loadIntakeAgentConfigs,
      } = await import('@ideamine/agents');

      const configs = loadIntakeAgentConfigs();
      const classifierConfig = configs.find((c) => c.id === 'intake-classifier-agent');
      const expanderConfig = configs.find((c) => c.id === 'intake-expander-agent');
      const validatorConfig = configs.find((c) => c.id === 'intake-validator-agent');

      if (!classifierConfig || !expanderConfig || !validatorConfig) {
        throw new Error('Failed to load intake agent configurations');
      }

      // Initialize agents
      const classifierAgent = new IntakeClassifierAgent(classifierConfig);
      const expanderAgent = new IntakeExpanderAgent(expanderConfig);
      const validatorAgent = new IntakeValidatorAgent(validatorConfig);

      console.log('[LangGraphOrchestrator] Intake agents initialized');

      // Extract initial idea from workflow input
      const ideaText = state.workflowRun.input?.ideaText || state.workflowRun.input?.description;
      const title = state.workflowRun.input?.title;

      if (!ideaText) {
        throw new Error('No idea text provided in workflow input');
      }

      // Step 1: Classification
      console.log('[LangGraphOrchestrator] Running intake-classifier-agent');
      const classifierOutput = await classifierAgent.execute({
        data: { ideaText, title },
        context: {
          projectId: state.workflowRun.projectId,
          userId: state.workflowRun.userId,
          workflowRunId: state.workflowRun.id,
        },
      });

      if (!classifierOutput.success) {
        throw new Error('Classifier agent failed');
      }

      const classification = classifierOutput.artifacts[0].content;

      // Store classification artifact
      state.workflowRun.artifacts.push({
        id: `${state.workflowRun.id}-classifier`,
        type: 'intake-classification',
        data: classification,
        createdAt: new Date(),
      });

      // Step 2: Expansion
      console.log('[LangGraphOrchestrator] Running intake-expander-agent');
      const expanderOutput = await expanderAgent.execute({
        data: { ideaText, title, classification },
        context: {
          projectId: state.workflowRun.projectId,
          userId: state.workflowRun.userId,
          workflowRunId: state.workflowRun.id,
        },
      });

      if (!expanderOutput.success) {
        throw new Error('Expander agent failed');
      }

      const expansion = expanderOutput.artifacts[0].content;

      // Store expansion artifact
      state.workflowRun.artifacts.push({
        id: `${state.workflowRun.id}-expander`,
        type: 'intake-expansion',
        data: expansion,
        createdAt: new Date(),
      });

      // Step 3: Validation
      console.log('[LangGraphOrchestrator] Running intake-validator-agent');
      const validatorOutput = await validatorAgent.execute({
        data: { partialSpec: expansion.partialSpec },
        context: {
          projectId: state.workflowRun.projectId,
          userId: state.workflowRun.userId,
          workflowRunId: state.workflowRun.id,
        },
      });

      if (!validatorOutput.success) {
        throw new Error('Validator agent failed');
      }

      // Store all validator artifacts (IdeaSpec + validation report)
      validatorOutput.artifacts.forEach((artifact) => {
        state.workflowRun.artifacts.push({
          id: `${state.workflowRun.id}-validator-${artifact.type}`,
          type: artifact.type,
          data: artifact.content,
          createdAt: new Date(),
        });
      });

      // Find the final IdeaSpec
      const ideaSpecArtifact = validatorOutput.artifacts.find((a) => a.type === 'idea-spec');
      if (!ideaSpecArtifact) {
        throw new Error('No IdeaSpec artifact generated by validator');
      }

      // Update workflow with final IdeaSpec
      state.workflowRun.ideaSpec = ideaSpecArtifact.content;

      // Publish intake completion event
      await this.eventPublisher.publishPhaseCompleted({
        workflowRunId: state.workflowRun.id,
        phase: 'INTAKE',
        artifacts: state.workflowRun.artifacts.map((a) => a.id),
        costUsd:
          (classifierOutput.cost || 0) + (expanderOutput.cost || 0) + (validatorOutput.cost || 0),
        durationMs: Date.now() - state.workflowRun.createdAt.getTime(),
      });

      console.log('[LangGraphOrchestrator] Intake phase completed successfully');

      return {
        currentPhase: 'intake',
        workflowRun: state.workflowRun,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LangGraphOrchestrator] Intake phase failed: ${errorMessage}`);

      state.workflowRun.state = WorkflowState.FAILED;
      await this.eventPublisher.publishPhaseFailed({
        workflowRunId: state.workflowRun.id,
        phase: 'INTAKE',
        error: errorMessage,
        retryable: true,
      });

      throw error;
    }
  }

  private async executeIdeationPhase(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Executing Ideation phase');

    state.workflowRun.state = WorkflowState.IDEATION;
    await this.eventPublisher.publishWorkflowStateChanged(
      state.workflowRun,
      WorkflowState.INTAKE,
      WorkflowState.IDEATION
    );

    try {
      // Load IdeationPhaseCoordinator
      const { IdeationPhaseCoordinator } = await import('@ideamine/agents');

      // Initialize coordinator
      const coordinator = new IdeationPhaseCoordinator({
        budget: {
          maxCostUsd: 2.0,
          maxTokens: 50000,
        },
        eventPublisher: this.eventPublisher,
      });

      console.log('[LangGraphOrchestrator] IdeationPhaseCoordinator initialized');

      // Find IdeaSpec from INTAKE phase
      const ideaSpecArtifact = state.workflowRun.artifacts.find(
        (a) => a.type === 'idea-spec'
      );

      if (!ideaSpecArtifact) {
        throw new Error('IdeaSpec not found from INTAKE phase');
      }

      const ideaSpec = ideaSpecArtifact.data;

      // Execute all 4 agents in PARALLEL
      console.log('[LangGraphOrchestrator] Running 4 ideation agents in parallel');
      const startTime = Date.now();

      const result = await coordinator.execute({
        workflowRunId: state.workflowRun.id,
        userId: state.workflowRun.userId,
        projectId: state.workflowRun.projectId,
        previousArtifacts: state.workflowRun.artifacts,
        ideaSpec,
      });

      const duration = Date.now() - startTime;

      if (!result.success) {
        throw new Error(`Ideation phase failed: ${result.error}`);
      }

      console.log(
        `[LangGraphOrchestrator] Ideation completed in ${duration}ms (${result.failedAgents || 0} agent failures)`
      );

      // Store all ideation artifacts
      result.artifacts?.forEach((artifact) => {
        state.workflowRun.artifacts.push({
          id: `${state.workflowRun.id}-ideation-${artifact.type}`,
          type: artifact.type,
          data: artifact.content,
          createdAt: new Date(),
        });
      });

      // Publish ideation completion event
      await this.eventPublisher.publishPhaseCompleted({
        workflowRunId: state.workflowRun.id,
        phase: 'IDEATION',
        artifacts: result.artifacts?.map((a) => a.type) || [],
        costUsd: result.cost || 0,
        durationMs: duration,
      });

      console.log('[LangGraphOrchestrator] Ideation phase completed successfully');

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

  private async executeCritiquePhase(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Executing Critique phase');

    state.workflowRun.state = WorkflowState.CRITIQUE;
    await this.eventPublisher.publishWorkflowStateChanged(
      state.workflowRun,
      WorkflowState.IDEATION,
      WorkflowState.CRITIQUE
    );

    try {
      // Load CritiquePhaseCoordinator
      const { CritiquePhaseCoordinator } = await import('@ideamine/agents');

      // Initialize coordinator
      const coordinator = new CritiquePhaseCoordinator({
        budget: {
          maxCostUsd: 1.5,
          maxTokens: 40000,
        },
        eventPublisher: this.eventPublisher,
      });

      console.log('[LangGraphOrchestrator] CritiquePhaseCoordinator initialized');

      // Find IdeaSpec from INTAKE phase
      const ideaSpecArtifact = state.workflowRun.artifacts.find(
        (a) => a.type === 'idea-spec'
      );

      if (!ideaSpecArtifact) {
        throw new Error('IdeaSpec not found from INTAKE phase');
      }

      const ideaSpec = ideaSpecArtifact.data;

      // Execute all 3 agents in PARALLEL
      console.log('[LangGraphOrchestrator] Running 3 critique agents in parallel');
      const startTime = Date.now();

      const result = await coordinator.execute({
        workflowRunId: state.workflowRun.id,
        userId: state.workflowRun.userId,
        projectId: state.workflowRun.projectId,
        previousArtifacts: state.workflowRun.artifacts,
        ideaSpec,
      });

      const duration = Date.now() - startTime;

      if (!result.success) {
        throw new Error(`Critique phase failed: ${result.error}`);
      }

      console.log(
        `[LangGraphOrchestrator] Critique completed in ${duration}ms (${result.failedAgents || 0} agent failures)`
      );

      // Store all critique artifacts
      result.artifacts?.forEach((artifact) => {
        state.workflowRun.artifacts.push({
          id: `${state.workflowRun.id}-critique-${artifact.type}`,
          type: artifact.type,
          data: artifact.content,
          createdAt: new Date(),
        });
      });

      // Publish critique completion event
      await this.eventPublisher.publishPhaseCompleted({
        workflowRunId: state.workflowRun.id,
        phase: 'CRITIQUE',
        artifacts: result.artifacts?.map((a) => a.type) || [],
        costUsd: result.cost || 0,
        durationMs: duration,
      });

      console.log('[LangGraphOrchestrator] Critique phase completed successfully');

      return {
        currentPhase: 'critique',
        workflowRun: state.workflowRun,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LangGraphOrchestrator] Critique phase failed: ${errorMessage}`);

      state.workflowRun.state = WorkflowState.FAILED;
      await this.eventPublisher.publishPhaseFailed({
        workflowRunId: state.workflowRun.id,
        phase: 'CRITIQUE',
        error: errorMessage,
        retryable: true,
      });

      throw error;
    }
  }

  private async executePRDPhase(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Executing PRD phase');

    state.workflowRun.state = WorkflowState.PRD;
    await this.eventPublisher.publishWorkflowStateChanged(
      state.workflowRun,
      WorkflowState.CRITIQUE,
      WorkflowState.PRD
    );

    try {
      // Load PRDPhaseCoordinator
      const { PRDPhaseCoordinator } = await import('@ideamine/agents');

      // Initialize coordinator
      const coordinator = new PRDPhaseCoordinator({
        budget: {
          maxCostUsd: 1.8,
          maxTokens: 45000,
        },
        eventPublisher: this.eventPublisher,
      });

      console.log('[LangGraphOrchestrator] PRDPhaseCoordinator initialized');

      // Find IdeaSpec from INTAKE phase
      const ideaSpecArtifact = state.workflowRun.artifacts.find(
        (a) => a.type === 'idea-spec'
      );

      if (!ideaSpecArtifact) {
        throw new Error('IdeaSpec not found from INTAKE phase');
      }

      const ideaSpec = ideaSpecArtifact.data;

      // Execute all 3 agents in PARALLEL
      console.log('[LangGraphOrchestrator] Running 3 PRD agents in parallel');
      const startTime = Date.now();

      const result = await coordinator.execute({
        workflowRunId: state.workflowRun.id,
        userId: state.workflowRun.userId,
        projectId: state.workflowRun.projectId,
        previousArtifacts: state.workflowRun.artifacts,
        ideaSpec,
      });

      const duration = Date.now() - startTime;

      if (!result.success) {
        throw new Error(`PRD phase failed: ${result.error}`);
      }

      console.log(
        `[LangGraphOrchestrator] PRD completed in ${duration}ms (${result.failedAgents || 0} agent failures)`
      );

      // Store all PRD artifacts
      result.artifacts?.forEach((artifact) => {
        state.workflowRun.artifacts.push({
          id: `${state.workflowRun.id}-prd-${artifact.type}`,
          type: artifact.type,
          data: artifact.content,
          createdAt: new Date(),
        });
      });

      // Publish PRD completion event
      await this.eventPublisher.publishPhaseCompleted({
        workflowRunId: state.workflowRun.id,
        phase: 'PRD',
        artifacts: result.artifacts?.map((a) => a.type) || [],
        costUsd: result.cost || 0,
        durationMs: duration,
      });

      console.log('[LangGraphOrchestrator] PRD phase completed successfully');

      return {
        currentPhase: 'prd',
        workflowRun: state.workflowRun,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LangGraphOrchestrator] PRD phase failed: ${errorMessage}`);

      state.workflowRun.state = WorkflowState.FAILED;
      await this.eventPublisher.publishPhaseFailed({
        workflowRunId: state.workflowRun.id,
        phase: 'PRD',
        error: errorMessage,
        retryable: true,
      });

      throw error;
    }
  }

  private async executeBizDevPhase(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Executing BizDev phase');

    state.workflowRun.state = WorkflowState.BIZDEV;
    await this.eventPublisher.publishWorkflowStateChanged(
      state.workflowRun,
      WorkflowState.PRD,
      WorkflowState.BIZDEV
    );

    try {
      // Load BizDevPhaseCoordinator
      const { BizDevPhaseCoordinator } = await import('@ideamine/agents');

      // Initialize coordinator
      const coordinator = new BizDevPhaseCoordinator({
        budget: {
          maxCostUsd: 2.0,
          maxTokens: 50000,
        },
        eventPublisher: this.eventPublisher,
      });

      console.log('[LangGraphOrchestrator] BizDevPhaseCoordinator initialized');

      // Find IdeaSpec from INTAKE phase
      const ideaSpecArtifact = state.workflowRun.artifacts.find(
        (a) => a.type === 'idea-spec'
      );

      if (!ideaSpecArtifact) {
        throw new Error('IdeaSpec not found from INTAKE phase');
      }

      const ideaSpec = ideaSpecArtifact.data;

      // Execute all 4 agents in PARALLEL
      console.log('[LangGraphOrchestrator] Running 4 BIZDEV agents in parallel');
      const startTime = Date.now();

      const result = await coordinator.execute({
        workflowRunId: state.workflowRun.id,
        userId: state.workflowRun.userId,
        projectId: state.workflowRun.projectId,
        previousArtifacts: state.workflowRun.artifacts,
        ideaSpec,
      });

      const duration = Date.now() - startTime;

      if (!result.success) {
        throw new Error(`BIZDEV phase failed: ${result.error}`);
      }

      console.log(
        `[LangGraphOrchestrator] BIZDEV completed in ${duration}ms (${result.failedAgents || 0} agent failures)`
      );

      // Store all BIZDEV artifacts
      result.artifacts?.forEach((artifact) => {
        state.workflowRun.artifacts.push({
          id: `${state.workflowRun.id}-bizdev-${artifact.type}`,
          type: artifact.type,
          data: artifact.content,
          createdAt: new Date(),
        });
      });

      // Publish BIZDEV completion event
      await this.eventPublisher.publishPhaseCompleted({
        workflowRunId: state.workflowRun.id,
        phase: 'BIZDEV',
        artifacts: result.artifacts?.map((a) => a.type) || [],
        costUsd: result.cost || 0,
        durationMs: duration,
      });

      console.log('[LangGraphOrchestrator] BIZDEV phase completed successfully');

      return {
        currentPhase: 'bizdev',
        workflowRun: state.workflowRun,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LangGraphOrchestrator] BIZDEV phase failed: ${errorMessage}`);

      state.workflowRun.state = WorkflowState.FAILED;
      await this.eventPublisher.publishPhaseFailed({
        workflowRunId: state.workflowRun.id,
        phase: 'BIZDEV',
        error: errorMessage,
        retryable: true,
      });

      throw error;
    }
  }

  private async executeArchitecturePhase(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Executing Architecture phase');

    state.workflowRun.state = WorkflowState.ARCHITECTURE;
    await this.eventPublisher.publishWorkflowStateChanged(
      state.workflowRun,
      WorkflowState.BIZDEV,
      WorkflowState.ARCHITECTURE
    );

    try {
      // Load ArchPhaseCoordinator
      const { ArchPhaseCoordinator } = await import('@ideamine/agents');

      // Initialize coordinator
      const coordinator = new ArchPhaseCoordinator({
        budget: {
          maxCostUsd: 2.0,
          maxTokens: 50000,
        },
        eventPublisher: this.eventPublisher,
      });

      console.log('[LangGraphOrchestrator] ArchPhaseCoordinator initialized');

      // Find IdeaSpec from INTAKE phase
      const ideaSpecArtifact = state.workflowRun.artifacts.find(
        (a) => a.type === 'idea-spec'
      );

      if (!ideaSpecArtifact) {
        throw new Error('IdeaSpec not found from INTAKE phase');
      }

      const ideaSpec = ideaSpecArtifact.data;

      // Execute all 4 agents in PARALLEL
      console.log('[LangGraphOrchestrator] Running 4 ARCH agents in parallel');
      const startTime = Date.now();

      const result = await coordinator.execute({
        workflowRunId: state.workflowRun.id,
        userId: state.workflowRun.userId,
        projectId: state.workflowRun.projectId,
        previousArtifacts: state.workflowRun.artifacts,
        ideaSpec,
      });

      const duration = Date.now() - startTime;

      if (!result.success) {
        throw new Error(`ARCH phase failed: ${result.error}`);
      }

      console.log(
        `[LangGraphOrchestrator] ARCH completed in ${duration}ms (${result.failedAgents || 0} agent failures)`
      );

      // Store all ARCH artifacts
      result.artifacts?.forEach((artifact) => {
        state.workflowRun.artifacts.push({
          id: `${state.workflowRun.id}-arch-${artifact.type}`,
          type: artifact.type,
          data: artifact.content,
          createdAt: new Date(),
        });
      });

      // Publish ARCH completion event
      await this.eventPublisher.publishPhaseCompleted({
        workflowRunId: state.workflowRun.id,
        phase: 'ARCH',
        artifacts: result.artifacts?.map((a) => a.type) || [],
        costUsd: result.cost || 0,
        durationMs: duration,
      });

      console.log('[LangGraphOrchestrator] ARCH phase completed successfully');

      return {
        currentPhase: 'architecture',
        workflowRun: state.workflowRun,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LangGraphOrchestrator] ARCH phase failed: ${errorMessage}`);

      state.workflowRun.state = WorkflowState.FAILED;
      await this.eventPublisher.publishPhaseFailed({
        workflowRunId: state.workflowRun.id,
        phase: 'ARCH',
        error: errorMessage,
        retryable: true,
      });

      throw error;
    }
  }

  private async executeBuildPhase(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Executing Build phase');

    state.workflowRun.state = WorkflowState.BUILD;
    await this.eventPublisher.publishWorkflowStateChanged(
      state.workflowRun,
      WorkflowState.ARCHITECTURE,
      WorkflowState.BUILD
    );

    try {
      // Load BuildPhaseCoordinator
      const { BuildPhaseCoordinator } = await import('@ideamine/agents');

      // Initialize coordinator
      const coordinator = new BuildPhaseCoordinator({
        budget: {
          maxCostUsd: 1.5,
          maxTokens: 40000,
        },
        eventPublisher: this.eventPublisher,
      });

      console.log('[LangGraphOrchestrator] BuildPhaseCoordinator initialized');

      // Find IdeaSpec from INTAKE phase
      const ideaSpecArtifact = state.workflowRun.artifacts.find(
        (a) => a.type === 'idea-spec'
      );

      if (!ideaSpecArtifact) {
        throw new Error('IdeaSpec not found from INTAKE phase');
      }

      const ideaSpec = ideaSpecArtifact.data;

      // Execute all 3 agents in PARALLEL
      console.log('[LangGraphOrchestrator] Running 3 BUILD agents in parallel');
      const startTime = Date.now();

      const result = await coordinator.execute({
        workflowRunId: state.workflowRun.id,
        userId: state.workflowRun.userId,
        projectId: state.workflowRun.projectId,
        previousArtifacts: state.workflowRun.artifacts,
        ideaSpec,
      });

      const duration = Date.now() - startTime;

      if (!result.success) {
        throw new Error(`BUILD phase failed: ${result.error}`);
      }

      console.log(
        `[LangGraphOrchestrator] BUILD completed in ${duration}ms (${result.failedAgents || 0} agent failures)`
      );

      // Store all BUILD artifacts
      result.artifacts?.forEach((artifact) => {
        state.workflowRun.artifacts.push({
          id: `${state.workflowRun.id}-build-${artifact.type}`,
          type: artifact.type,
          data: artifact.content,
          createdAt: new Date(),
        });
      });

      // Publish BUILD completion event
      await this.eventPublisher.publishPhaseCompleted({
        workflowRunId: state.workflowRun.id,
        phase: 'BUILD',
        artifacts: result.artifacts?.map((a) => a.type) || [],
        costUsd: result.cost || 0,
        durationMs: duration,
      });

      console.log('[LangGraphOrchestrator] BUILD phase completed successfully');

      return {
        currentPhase: 'build',
        workflowRun: state.workflowRun,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LangGraphOrchestrator] BUILD phase failed: ${errorMessage}`);

      state.workflowRun.state = WorkflowState.FAILED;
      await this.eventPublisher.publishPhaseFailed({
        workflowRunId: state.workflowRun.id,
        phase: 'BUILD',
        error: errorMessage,
        retryable: true,
      });

      throw error;
    }
  }

  private async executeStoryLoopPhase(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Executing Story Loop phase');

    state.workflowRun.state = WorkflowState.STORY_LOOP;
    await this.eventPublisher.publishWorkflowStateChanged(
      state.workflowRun,
      WorkflowState.BUILD,
      WorkflowState.STORY_LOOP
    );

    try {
      // Load StoryLoopPhaseCoordinator
      const { StoryLoopPhaseCoordinator } = await import('@ideamine/agents');

      // Initialize coordinator with higher budget for iterative story processing
      const coordinator = new StoryLoopPhaseCoordinator({
        budget: {
          maxCostUsd: 10.0, // Higher budget for implementing multiple user stories
          maxTokens: 200000,
        },
        eventPublisher: this.eventPublisher,
      });

      console.log('[LangGraphOrchestrator] StoryLoopPhaseCoordinator initialized');

      // Find IdeaSpec from INTAKE phase
      const ideaSpecArtifact = state.workflowRun.artifacts.find(
        (a) => a.type === 'idea-spec'
      );

      if (!ideaSpecArtifact) {
        throw new Error('IdeaSpec not found from INTAKE phase');
      }

      const ideaSpec = ideaSpecArtifact.data;

      // Execute SEQUENTIAL story processing (coder → reviewer → test writer per story)
      console.log('[LangGraphOrchestrator] Running STORY_LOOP agents sequentially per user story');
      const startTime = Date.now();

      const result = await coordinator.execute({
        workflowRunId: state.workflowRun.id,
        userId: state.workflowRun.userId,
        projectId: state.workflowRun.projectId,
        previousArtifacts: state.workflowRun.artifacts,
        ideaSpec,
      });

      const duration = Date.now() - startTime;

      if (!result.success) {
        throw new Error(`STORY_LOOP phase failed: ${result.error}`);
      }

      console.log(
        `[LangGraphOrchestrator] STORY_LOOP completed in ${duration}ms`
      );

      // Store all STORY_LOOP artifacts
      result.artifacts?.forEach((artifact) => {
        state.workflowRun.artifacts.push({
          id: `${state.workflowRun.id}-story-loop-${artifact.type}`,
          type: artifact.type,
          data: artifact.content,
          createdAt: new Date(),
        });
      });

      // Publish STORY_LOOP completion event
      await this.eventPublisher.publishPhaseCompleted({
        workflowRunId: state.workflowRun.id,
        phase: 'STORY_LOOP',
        artifacts: result.artifacts?.map((a) => a.type) || [],
        costUsd: result.cost || 0,
        durationMs: duration,
      });

      console.log('[LangGraphOrchestrator] STORY_LOOP phase completed successfully');

      return {
        currentPhase: 'storyLoop',
        workflowRun: state.workflowRun,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LangGraphOrchestrator] STORY_LOOP phase failed: ${errorMessage}`);

      state.workflowRun.state = WorkflowState.FAILED;
      await this.eventPublisher.publishPhaseFailed({
        workflowRunId: state.workflowRun.id,
        phase: 'STORY_LOOP',
        error: errorMessage,
        retryable: true,
      });

      throw error;
    }
  }

  private async executeQAPhase(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Executing QA phase');

    state.workflowRun.state = WorkflowState.QA;
    await this.eventPublisher.publishWorkflowStateChanged(
      state.workflowRun,
      WorkflowState.STORY_LOOP,
      WorkflowState.QA
    );

    try {
      // Load QAPhaseCoordinator
      const { QAPhaseCoordinator } = await import('@ideamine/agents');

      // Initialize coordinator
      const coordinator = new QAPhaseCoordinator({
        budget: {
          maxCostUsd: 2.0,
          maxTokens: 50000,
        },
        eventPublisher: this.eventPublisher,
      });

      console.log('[LangGraphOrchestrator] QAPhaseCoordinator initialized');

      // Find IdeaSpec from INTAKE phase
      const ideaSpecArtifact = state.workflowRun.artifacts.find(
        (a) => a.type === 'idea-spec'
      );

      if (!ideaSpecArtifact) {
        throw new Error('IdeaSpec not found from INTAKE phase');
      }

      const ideaSpec = ideaSpecArtifact.data;

      // Execute all 4 agents in PARALLEL
      console.log('[LangGraphOrchestrator] Running 4 QA agents in parallel');
      const startTime = Date.now();

      const result = await coordinator.execute({
        workflowRunId: state.workflowRun.id,
        userId: state.workflowRun.userId,
        projectId: state.workflowRun.projectId,
        previousArtifacts: state.workflowRun.artifacts,
        ideaSpec,
      });

      const duration = Date.now() - startTime;

      if (!result.success) {
        throw new Error(`QA phase failed: ${result.error}`);
      }

      console.log(
        `[LangGraphOrchestrator] QA completed in ${duration}ms (${result.failedAgents || 0} agent failures)`
      );

      // Store all QA artifacts
      result.artifacts?.forEach((artifact) => {
        state.workflowRun.artifacts.push({
          id: `${state.workflowRun.id}-qa-${artifact.type}`,
          type: artifact.type,
          data: artifact.content,
          createdAt: new Date(),
        });
      });

      // Publish QA completion event
      await this.eventPublisher.publishPhaseCompleted({
        workflowRunId: state.workflowRun.id,
        phase: 'QA',
        artifacts: result.artifacts?.map((a) => a.type) || [],
        costUsd: result.cost || 0,
        durationMs: duration,
      });

      console.log('[LangGraphOrchestrator] QA phase completed successfully');

      return {
        currentPhase: 'qa',
        workflowRun: state.workflowRun,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LangGraphOrchestrator] QA phase failed: ${errorMessage}`);

      state.workflowRun.state = WorkflowState.FAILED;
      await this.eventPublisher.publishPhaseFailed({
        workflowRunId: state.workflowRun.id,
        phase: 'QA',
        error: errorMessage,
        retryable: true,
      });

      throw error;
    }
  }

  private async executeAestheticPhase(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Executing Aesthetic phase');

    state.workflowRun.state = WorkflowState.AESTHETIC;
    await this.eventPublisher.publishWorkflowStateChanged(
      state.workflowRun,
      WorkflowState.QA,
      WorkflowState.AESTHETIC
    );

    try {
      // Load AestheticPhaseCoordinator
      const { AestheticPhaseCoordinator } = await import('@ideamine/agents');

      // Initialize coordinator
      const coordinator = new AestheticPhaseCoordinator({
        budget: {
          maxCostUsd: 1.5,
          maxTokens: 40000,
        },
        eventPublisher: this.eventPublisher,
      });

      console.log('[LangGraphOrchestrator] AestheticPhaseCoordinator initialized');

      // Find IdeaSpec from INTAKE phase
      const ideaSpecArtifact = state.workflowRun.artifacts.find(
        (a) => a.type === 'idea-spec'
      );

      if (!ideaSpecArtifact) {
        throw new Error('IdeaSpec not found from INTAKE phase');
      }

      const ideaSpec = ideaSpecArtifact.data;

      // Execute all 3 agents in PARALLEL
      console.log('[LangGraphOrchestrator] Running 3 AESTHETIC agents in parallel');
      const startTime = Date.now();

      const result = await coordinator.execute({
        workflowRunId: state.workflowRun.id,
        userId: state.workflowRun.userId,
        projectId: state.workflowRun.projectId,
        previousArtifacts: state.workflowRun.artifacts,
        ideaSpec,
      });

      const duration = Date.now() - startTime;

      if (!result.success) {
        throw new Error(`AESTHETIC phase failed: ${result.error}`);
      }

      console.log(
        `[LangGraphOrchestrator] AESTHETIC completed in ${duration}ms (${result.failedAgents || 0} agent failures)`
      );

      // Store all AESTHETIC artifacts
      result.artifacts?.forEach((artifact) => {
        state.workflowRun.artifacts.push({
          id: `${state.workflowRun.id}-aesthetic-${artifact.type}`,
          type: artifact.type,
          data: artifact.content,
          createdAt: new Date(),
        });
      });

      // Publish AESTHETIC completion event
      await this.eventPublisher.publishPhaseCompleted({
        workflowRunId: state.workflowRun.id,
        phase: 'AESTHETIC',
        artifacts: result.artifacts?.map((a) => a.type) || [],
        costUsd: result.cost || 0,
        durationMs: duration,
      });

      console.log('[LangGraphOrchestrator] AESTHETIC phase completed successfully');

      return {
        currentPhase: 'aesthetic',
        workflowRun: state.workflowRun,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LangGraphOrchestrator] AESTHETIC phase failed: ${errorMessage}`);

      state.workflowRun.state = WorkflowState.FAILED;
      await this.eventPublisher.publishPhaseFailed({
        workflowRunId: state.workflowRun.id,
        phase: 'AESTHETIC',
        error: errorMessage,
        retryable: true,
      });

      throw error;
    }
  }

  private async executeReleasePhase(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Executing Release phase');

    state.workflowRun.state = WorkflowState.RELEASE;
    await this.eventPublisher.publishWorkflowStateChanged(
      state.workflowRun,
      WorkflowState.AESTHETIC,
      WorkflowState.RELEASE
    );

    try {
      // Load ReleasePhaseCoordinator
      const { ReleasePhaseCoordinator } = await import('@ideamine/agents');

      // Initialize coordinator
      const coordinator = new ReleasePhaseCoordinator({
        budget: {
          maxCostUsd: 2.0,
          maxTokens: 50000,
        },
        eventPublisher: this.eventPublisher,
      });

      console.log('[LangGraphOrchestrator] ReleasePhaseCoordinator initialized');

      // Find IdeaSpec from INTAKE phase
      const ideaSpecArtifact = state.workflowRun.artifacts.find(
        (a) => a.type === 'idea-spec'
      );

      if (!ideaSpecArtifact) {
        throw new Error('IdeaSpec not found from INTAKE phase');
      }

      const ideaSpec = ideaSpecArtifact.data;

      // Execute all 3 agents in PARALLEL
      console.log('[LangGraphOrchestrator] Running 3 RELEASE agents in parallel');
      const startTime = Date.now();

      const result = await coordinator.execute({
        workflowRunId: state.workflowRun.id,
        userId: state.workflowRun.userId,
        projectId: state.workflowRun.projectId,
        previousArtifacts: state.workflowRun.artifacts,
        ideaSpec,
      });

      const duration = Date.now() - startTime;

      if (!result.success) {
        throw new Error(`RELEASE phase failed: ${result.error}`);
      }

      console.log(
        `[LangGraphOrchestrator] RELEASE completed in ${duration}ms (${result.failedAgents || 0} agent failures)`
      );

      // Store all RELEASE artifacts
      result.artifacts?.forEach((artifact) => {
        state.workflowRun.artifacts.push({
          id: `${state.workflowRun.id}-release-${artifact.type}`,
          type: artifact.type,
          data: artifact.content,
          createdAt: new Date(),
        });
      });

      // Publish RELEASE completion event
      await this.eventPublisher.publishPhaseCompleted({
        workflowRunId: state.workflowRun.id,
        phase: 'RELEASE',
        artifacts: result.artifacts?.map((a) => a.type) || [],
        costUsd: result.cost || 0,
        durationMs: duration,
      });

      console.log('[LangGraphOrchestrator] RELEASE phase completed successfully');

      return {
        currentPhase: 'release',
        workflowRun: state.workflowRun,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LangGraphOrchestrator] RELEASE phase failed: ${errorMessage}`);

      state.workflowRun.state = WorkflowState.FAILED;
      await this.eventPublisher.publishPhaseFailed({
        workflowRunId: state.workflowRun.id,
        phase: 'RELEASE',
        error: errorMessage,
        retryable: true,
      });

      throw error;
    }
  }

  private async executeBetaPhase(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Executing Beta phase');

    state.workflowRun.state = WorkflowState.BETA;
    await this.eventPublisher.publishWorkflowStateChanged(
      state.workflowRun,
      WorkflowState.RELEASE,
      WorkflowState.BETA
    );

    try {
      // Load BetaPhaseCoordinator
      const { BetaPhaseCoordinator } = await import('@ideamine/agents');

      // Initialize coordinator
      const coordinator = new BetaPhaseCoordinator({
        budget: {
          maxCostUsd: 2.0,
          maxTokens: 50000,
        },
        eventPublisher: this.eventPublisher,
      });

      console.log('[LangGraphOrchestrator] BetaPhaseCoordinator initialized');

      // Find IdeaSpec from INTAKE phase
      const ideaSpecArtifact = state.workflowRun.artifacts.find(
        (a) => a.type === 'idea-spec'
      );

      if (!ideaSpecArtifact) {
        throw new Error('IdeaSpec not found from INTAKE phase');
      }

      const ideaSpec = ideaSpecArtifact.data;

      // Execute all 3 agents in PARALLEL
      console.log('[LangGraphOrchestrator] Running 3 BETA agents in parallel');
      const startTime = Date.now();

      const result = await coordinator.execute({
        workflowRunId: state.workflowRun.id,
        userId: state.workflowRun.userId,
        projectId: state.workflowRun.projectId,
        previousArtifacts: state.workflowRun.artifacts,
        ideaSpec,
      });

      const duration = Date.now() - startTime;

      if (!result.success) {
        throw new Error(`BETA phase failed: ${result.error}`);
      }

      console.log(
        `[LangGraphOrchestrator] BETA completed in ${duration}ms (${result.failedAgents || 0} agent failures)`
      );

      // Store all BETA artifacts
      result.artifacts?.forEach((artifact) => {
        state.workflowRun.artifacts.push({
          id: `${state.workflowRun.id}-beta-${artifact.type}`,
          type: artifact.type,
          data: artifact.content,
          createdAt: new Date(),
        });
      });

      // Publish BETA completion event
      await this.eventPublisher.publishPhaseCompleted({
        workflowRunId: state.workflowRun.id,
        phase: 'BETA',
        artifacts: result.artifacts?.map((a) => a.type) || [],
        costUsd: result.cost || 0,
        durationMs: duration,
      });

      console.log('[LangGraphOrchestrator] BETA phase completed successfully');

      return {
        currentPhase: 'beta',
        workflowRun: state.workflowRun,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LangGraphOrchestrator] BETA phase failed: ${errorMessage}`);

      state.workflowRun.state = WorkflowState.FAILED;
      await this.eventPublisher.publishPhaseFailed({
        workflowRunId: state.workflowRun.id,
        phase: 'BETA',
        error: errorMessage,
        retryable: true,
      });

      throw error;
    }
  }

  // ============================================================================
  // Gate Evaluation Methods
  // ============================================================================

  private async evaluateCritiqueGate(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Evaluating Critique Gate');

    // TODO: Implement actual gate evaluation
    // - Minimum 15 identified risks
    // - At least 3 critical findings
    // - 100% assumption coverage

    const passed = true; // Placeholder
    state.gateResults.set('critiqueGate', passed);

    return {
      gateResults: state.gateResults,
    };
  }

  private async evaluatePRDGate(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Evaluating PRD Gate');

    // TODO: Implement actual gate evaluation
    // - Minimum 50 user stories
    // - 100% stories have acceptance criteria
    // - All NFRs documented

    const passed = true; // Placeholder
    state.gateResults.set('prdGate', passed);

    return {
      gateResults: state.gateResults,
    };
  }

  private async evaluateViabilityGate(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Evaluating Viability Gate');

    // TODO: Implement actual gate evaluation
    // - LTV:CAC ratio >= 3.0
    // - Breakeven within 24 months
    // - TAM >= $100M

    const passed = true; // Placeholder
    state.gateResults.set('viabilityGate', passed);

    return {
      gateResults: state.gateResults,
    };
  }

  private async evaluateArchitectureGate(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Evaluating Architecture Gate');

    // TODO: Implement actual gate evaluation
    // - >= 95% ADR completeness
    // - Zero unreviewed tech choices
    // - All entities have schemas

    const passed = true; // Placeholder
    state.gateResults.set('architectureGate', passed);

    return {
      gateResults: state.gateResults,
    };
  }

  private async evaluateQAGate(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Evaluating QA Gate');

    // TODO: Implement actual gate evaluation
    // - >= 90% test coverage
    // - Zero critical security vulnerabilities
    // - Performance targets met

    const passed = true; // Placeholder
    state.gateResults.set('qaGate', passed);

    return {
      gateResults: state.gateResults,
    };
  }

  private async evaluateAestheticGate(state: GraphState): Promise<Partial<GraphState>> {
    console.log('[LangGraphOrchestrator] Evaluating Aesthetic Gate');

    // TODO: Implement actual gate evaluation
    // - WCAG 2.1 AA compliance
    // - Visual regression tests pass
    // - Brand consistency checks

    const passed = true; // Placeholder
    state.gateResults.set('aestheticGate', passed);

    return {
      gateResults: state.gateResults,
    };
  }
}
