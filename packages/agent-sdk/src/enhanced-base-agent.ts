/**
 * EnhancedBaseAgent - Integrates Level-2 Microflow Infrastructure
 *
 * This agent extends BaseAgent with full Level-2 infrastructure:
 * - Analyzer: VoI-based tool selection from orchestrator-core
 * - Supervisor: Retry/backoff/circuit breaker logic
 * - Recorder: Comprehensive logging
 * - Tool Registry: Centralized tool management
 *
 * Execution flow:
 * 1. PLANNER: Draft execution plan
 * 2. REASONING: Initial attempt without tools (with Supervisor retry)
 * 3. ANALYZER LOOP: VoI-based tool selection
 *    - Query Tool Registry by capability
 *    - Calculate VoI score
 *    - Execute via Supervisor (with retry)
 *    - Record all decisions
 * 4. GENERATE ARTIFACTS
 * 5. RECORD completion
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Analyzer as OrchestratorAnalyzer,
  CapabilityClass,
  Tool,
  ToolRegistry,
  Supervisor,
  Recorder as OrchestratorRecorder,
  DEFAULT_RETRY_POLICIES,
  type SupervisionConfig,
  type AnalyzerConfig,
} from '@ideamine/orchestrator-core';
import {
  AgentInput,
  AgentOutput,
  AgentConfig,
  ExecutionPlan,
  ReasoningResult,
} from './types';
import { BaseAgent } from './base-agent';

export interface EnhancedAgentConfig extends AgentConfig {
  // Tool registry for this agent
  toolRegistry?: ToolRegistry;

  // Supervision config
  supervision?: SupervisionConfig;

  // Recorder instance
  recorder?: OrchestratorRecorder;

  // Capability classes this agent can use
  allowedCapabilities?: CapabilityClass[];
}

/**
 * EnhancedBaseAgent - Integrates Level-2 infrastructure
 */
export abstract class EnhancedBaseAgent extends BaseAgent {
  protected orchestratorAnalyzer: OrchestratorAnalyzer;
  protected supervisor: Supervisor;
  protected orchestratorRecorder: OrchestratorRecorder;
  protected toolRegistry: ToolRegistry;

  constructor(config: EnhancedAgentConfig) {
    super(config);

    // Setup tool registry
    this.toolRegistry = config.toolRegistry || new ToolRegistry();

    // Setup recorder
    this.orchestratorRecorder =
      config.recorder || new OrchestratorRecorder(new InMemoryRecorderStorage());

    // Setup supervisor with retry logic
    this.supervisor = new Supervisor(
      config.supervision || {
        retryPolicy: DEFAULT_RETRY_POLICIES.standard,
        circuitBreaker: {
          failureThreshold: 3,
          successThreshold: 2,
          timeout: 30000,
          halfOpenRequests: 1,
        },
        quarantineAfterFailures: 5,
        escalateAfterRetries: 3,
      },
      this.orchestratorRecorder
    );

    // Setup orchestrator analyzer with VoI
    const analyzerConfig: AnalyzerConfig = {
      minConfidenceNoTool: config.toolPolicy.minConfidenceWithoutTools || 0.78,
      minScoreToInvoke: config.toolPolicy.voiThreshold || 0.22,
      budget: {
        remainingUsd: config.budget?.maxCostUsd || 10.0,
        remainingTokens: config.budget?.maxTokens || 500000,
      },
      allowlist: config.allowedCapabilities,
      piiPolicy: {
        allowPiiEgress: false,
        requiresApproval: true,
      },
    };

    this.orchestratorAnalyzer = new OrchestratorAnalyzer(
      analyzerConfig,
      this.toolRegistry,
      this.orchestratorRecorder
    );
  }

  /**
   * Enhanced execution with full Level-2 infrastructure
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    let totalCostUsd = 0;
    let totalTokens = 0;
    const toolsInvoked: string[] = [];
    const runId = input.workflowRunId || uuidv4();

    try {
      // Record agent start
      await this.orchestratorRecorder.recordStep({
        runId,
        phase: this.config.phase,
        step: `agent.${this.config.agentId}.start`,
        actor: `Agent:${this.config.agentId}`,
        cost: { usd: 0, tokens: 0 },
        latency_ms: 0,
        status: 'succeeded',
        metadata: { inputKeys: Object.keys(input.data || {}) },
      });

      // Step 1: PLANNER - Create execution plan
      const planResult = await this.supervisor.executeWithRetry(
        {
          runId,
          phase: this.config.phase,
          step: `agent.${this.config.agentId}.plan`,
          actor: `Agent:${this.config.agentId}`,
          attempt: 0,
        },
        async () => this.plan(input)
      );

      if (!planResult.success || !planResult.result) {
        throw new Error('Planning failed: ' + planResult.error?.message);
      }

      const plan = planResult.result;
      console.log(`[${this.config.agentId}] Plan created with ${plan.steps.length} steps`);

      // Step 2: REASONING - Initial attempt without tools (with retry)
      const reasoningResult = await this.supervisor.executeWithRetry(
        {
          runId,
          phase: this.config.phase,
          step: `agent.${this.config.agentId}.reason`,
          actor: `Agent:${this.config.agentId}`,
          attempt: 0,
        },
        async () => this.reason(plan, input)
      );

      if (!reasoningResult.success || !reasoningResult.result) {
        throw new Error('Reasoning failed: ' + reasoningResult.error?.message);
      }

      let result = reasoningResult.result;
      totalCostUsd += result.costUsd || 0;
      totalTokens += result.tokensUsed || 0;

      console.log(
        `[${this.config.agentId}] Initial reasoning complete (confidence: ${result.confidence})`
      );

      // Step 3: ANALYZER LOOP - VoI-based tool selection
      let loopCount = 0;
      const maxLoops = this.config.toolPolicy.maxToolInvocations || 3;

      while (loopCount < maxLoops) {
        // Check budget
        if (totalCostUsd >= (input.budget?.maxCostUsd || 10.0)) {
          console.log(`[${this.config.agentId}] Budget exhausted, stopping analyzer loop`);
          break;
        }

        // Get required capability for this step
        const requiredCapability = await this.getRequiredCapability(plan, result, loopCount);
        if (!requiredCapability) {
          console.log(`[${this.config.agentId}] No more capabilities needed`);
          break;
        }

        // Analyze with VoI scoring
        const analysis = await this.orchestratorAnalyzer.analyze({
          runId,
          phase: this.config.phase,
          taskDescription: plan.steps[loopCount]?.description || 'Improve result quality',
          requiredCapability,
          noToolConfidence: result.confidence,
          input: input.data,
          utility: this.getTaskUtility(plan, loopCount),
        });

        if (!analysis.useTools || !analysis.selectedTool) {
          console.log(
            `[${this.config.agentId}] Analyzer decided no tool needed: ${analysis.reasoning}`
          );
          break;
        }

        console.log(
          `[${this.config.agentId}] Selected tool: ${analysis.selectedTool.name} (VoI: ${analysis.voiScore?.score.toFixed(3)})`
        );

        // Execute tool with Supervisor retry logic
        const toolExecResult = await this.supervisor.executeWithRetry(
          {
            runId,
            phase: this.config.phase,
            step: `tool.${analysis.selectedTool.id}`,
            actor: `Agent:${this.config.agentId}`,
            attempt: 0,
          },
          async () => analysis.selectedTool!.execute(input.data)
        );

        if (!toolExecResult.success || !toolExecResult.result) {
          console.log(
            `[${this.config.agentId}] Tool execution failed after retries: ${toolExecResult.error?.message}`
          );

          if (toolExecResult.quarantined) {
            console.log(`[${this.config.agentId}] Tool quarantined due to repeated failures`);
            break;
          }

          if (toolExecResult.escalated) {
            console.log(`[${this.config.agentId}] Tool execution escalated to human`);
            // In production, this would trigger a notification
          }

          loopCount++;
          continue;
        }

        const toolResult = toolExecResult.result;
        toolsInvoked.push(analysis.selectedTool.id);

        // Update costs
        if (toolResult.metadata?.cost) {
          totalCostUsd += toolResult.metadata.cost.usd;
          totalTokens += toolResult.metadata.cost.tokens;
          this.orchestratorAnalyzer.updateBudget(toolResult.metadata.cost);
        }

        // Integrate tool output if it improved
        if (toolResult.success && toolResult.confidence > result.confidence) {
          console.log(
            `[${this.config.agentId}] Tool improved confidence: ${result.confidence.toFixed(2)} → ${toolResult.confidence.toFixed(2)}`
          );

          result = {
            content: toolResult.output,
            confidence: toolResult.confidence,
            needsImprovement: toolResult.confidence < 0.9,
            reasoning: `Integrated tool ${analysis.selectedTool.name}`,
            costUsd: totalCostUsd,
            tokensUsed: totalTokens,
          };
        } else {
          console.log(`[${this.config.agentId}] Tool did not improve result, discarding`);
        }

        loopCount++;
      }

      // Step 4: Generate final artifacts
      const artifacts = await this.generateArtifacts(result, input);

      // Record artifact generation
      for (const artifact of artifacts) {
        await this.orchestratorRecorder.recordArtifact({
          id: `${runId}-${artifact.type}-${Date.now()}`,
          type: artifact.type,
          runId,
          phase: this.config.phase,
          producedBy: `Agent:${this.config.agentId}`,
          content: artifact.content,
        });
      }

      // Step 5: Record completion
      const output: AgentOutput = {
        success: true,
        artifacts,
        costUsd: totalCostUsd,
        tokensUsed: totalTokens,
        durationMs: Date.now() - startTime,
        toolsInvoked: toolsInvoked.length > 0 ? toolsInvoked : undefined,
      };

      await this.orchestratorRecorder.recordStep({
        runId,
        phase: this.config.phase,
        step: `agent.${this.config.agentId}.complete`,
        actor: `Agent:${this.config.agentId}`,
        outputs: artifacts.map((a) => a.type),
        cost: { usd: totalCostUsd, tokens: totalTokens },
        latency_ms: Date.now() - startTime,
        status: 'succeeded',
        metadata: {
          artifactCount: artifacts.length,
          toolsInvoked: toolsInvoked.length,
          analyzerLoops: loopCount,
        },
      });

      return output;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${this.config.agentId}] Agent failed:`, errorMessage);

      await this.orchestratorRecorder.recordStep({
        runId,
        phase: this.config.phase,
        step: `agent.${this.config.agentId}.failed`,
        actor: `Agent:${this.config.agentId}`,
        cost: { usd: totalCostUsd, tokens: totalTokens },
        latency_ms: Date.now() - startTime,
        status: 'failed',
        metadata: { error: errorMessage },
      });

      return {
        success: false,
        artifacts: [],
        costUsd: totalCostUsd,
        tokensUsed: totalTokens,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Get required capability for current analyzer loop iteration
   * Override in subclasses to specify phase-specific capabilities
   */
  protected async getRequiredCapability(
    plan: ExecutionPlan,
    result: ReasoningResult,
    loopCount: number
  ): Promise<CapabilityClass | null> {
    // Default: no tools (subclasses should override)
    return null;
  }

  /**
   * Get utility score for current task (0-1)
   * Higher utility means more important to get right
   */
  protected getTaskUtility(plan: ExecutionPlan, loopCount: number): number {
    // Default: medium utility
    return 0.7;
  }

  /**
   * Get orchestrator recorder for access in subclasses
   */
  protected getRecorder(): OrchestratorRecorder {
    return this.orchestratorRecorder;
  }

  /**
   * Get supervisor for access in subclasses
   */
  protected getSupervisor(): Supervisor {
    return this.supervisor;
  }

  /**
   * Get tool registry for access in subclasses
   */
  protected getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }
}

// Re-export for convenience
import { InMemoryRecorderStorage } from '@ideamine/orchestrator-core';
export { InMemoryRecorderStorage };
