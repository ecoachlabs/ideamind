import { v4 as uuidv4 } from 'uuid';
import {
  AgentInput,
  AgentOutput,
  AgentConfig,
  ExecutionPlan,
  ReasoningResult,
  AnalyzerDecision,
  VerifierResult,
  ToolInvocationContext,
  ToolInvocationResult,
} from './types';
import { Analyzer } from './analyzer';
import { ToolExecutor } from './executor';
import { Verifier } from './verifier';
import { Recorder } from './recorder';

/**
 * BaseAgent: Implements the Analyzer-inside-Agent pattern
 *
 * Execution flow:
 * 1. PLANNER: Draft execution plan
 * 2. REASONING: Initial attempt without tools
 * 3. ANALYZER LOOP: Decide if tools can improve result
 *    - If VoI high enough, invoke tool via EXECUTOR
 *    - VERIFIER compares tool output to baseline
 *    - Keep tool result if improved, discard otherwise
 *    - Repeat until no improvement or budget exhausted
 * 4. RECORDER: Log execution and publish events
 */
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected analyzer: Analyzer;
  protected executor: ToolExecutor;
  protected verifier: Verifier;
  protected recorder: Recorder;
  protected checkpointCallback?: (token: string, data: Record<string, any>) => Promise<void>;
  protected lastCheckpointTime: number = 0;

  constructor(config: AgentConfig) {
    this.config = config;
    this.analyzer = new Analyzer(config);
    this.executor = new ToolExecutor();
    this.verifier = new Verifier();
    this.recorder = new Recorder();
  }

  /**
   * Set checkpoint callback (called by Worker)
   * Enables checkpoint saving during long-running executions
   */
  setCheckpointCallback(callback: (token: string, data: Record<string, any>) => Promise<void>): void {
    this.checkpointCallback = callback;
  }

  /**
   * Main execution method - implements the Analyzer-inside-Agent pattern
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    let totalCostUsd = 0;
    let totalTokens = 0;
    const toolsInvoked: string[] = [];

    try {
      // Record agent start
      await this.recorder.recordAgentStarted(this.config.agentId, this.config.phase, input);

      // Step 1: PLANNER - Draft execution plan
      const plan = await this.plan(input);
      console.log(`[${this.config.agentId}] Plan created with ${plan.steps.length} steps`);

      // Step 2: REASONING - Initial attempt without tools
      let result = await this.reason(plan, input);
      totalCostUsd += result.costUsd || 0;
      totalTokens += result.tokensUsed || 0;
      console.log(`[${this.config.agentId}] Initial reasoning complete (confidence: ${result.confidence})`);

      // Step 3: ANALYZER LOOP - Iteratively improve with tools
      let loopCount = 0;
      const maxLoops = this.config.toolPolicy.maxToolInvocations;

      while (loopCount < maxLoops) {
        // Check budget before continuing
        if (this.exceededBudget(input, totalCostUsd, totalTokens)) {
          console.log(`[${this.config.agentId}] Budget limit reached, stopping analyzer loop`);
          break;
        }

        // Analyzer decides if tool can improve result
        const decision = await this.analyzer.analyze(plan, result, input);
        totalCostUsd += decision.estimatedCostUsd || 0.01; // Small cost for analyzer invocation

        if (!decision.useTool) {
          console.log(`[${this.config.agentId}] Analyzer decided no tool needed: ${decision.reasoning}`);
          break;
        }

        // Check VoI threshold
        if (decision.voiScore! < this.config.toolPolicy.voiThreshold) {
          console.log(`[${this.config.agentId}] VoI score ${decision.voiScore} below threshold ${this.config.toolPolicy.voiThreshold}`);
          break;
        }

        console.log(`[${this.config.agentId}] Analyzer selected tool: ${decision.toolId} (VoI: ${decision.voiScore})`);

        // Step 4: EXECUTOR - Invoke tool
        const toolContext: ToolInvocationContext = {
          workflowRunId: input.workflowRunId,
          agentId: this.config.agentId,
          toolId: decision.toolId!,
          toolVersion: decision.toolVersion || 'latest',
          input: decision.input || {},
          budget: {
            maxCostUsd: input.budget.maxCostUsd - totalCostUsd,
          },
        };

        const toolResult = await this.executor.invoke(toolContext);
        totalCostUsd += toolResult.costUsd;
        toolsInvoked.push(decision.toolId!);

        if (!toolResult.success) {
          console.log(`[${this.config.agentId}] Tool execution failed: ${toolResult.error}`);
          loopCount++;
          continue;
        }

        // Step 5: VERIFIER - Did tool improve quality?
        const verification = await this.verifier.compare(result, toolResult, this.config);
        totalCostUsd += 0.01; // Small cost for verifier

        if (verification.improved) {
          console.log(`[${this.config.agentId}] Tool improved result (score: ${verification.score}, delta: +${verification.delta})`);

          // Integrate tool output into result
          result = await this.integrateToolOutput(result, toolResult, verification);
          totalTokens += 100; // Estimate for integration
        } else {
          console.log(`[${this.config.agentId}] Tool did not improve result (score: ${verification.score}), discarding`);
        }

        loopCount++;
      }

      // Step 6: Generate final artifacts
      const artifacts = await this.generateArtifacts(result, input);

      // Step 7: RECORDER - Log completion
      const output: AgentOutput = {
        success: true,
        artifacts,
        costUsd: totalCostUsd,
        tokensUsed: totalTokens,
        durationMs: Date.now() - startTime,
        toolsInvoked: toolsInvoked.length > 0 ? toolsInvoked : undefined,
      };

      await this.recorder.recordAgentCompleted(this.config.agentId, this.config.phase, input, output);

      return output;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${this.config.agentId}] Agent failed:`, errorMessage);

      await this.recorder.recordAgentFailed(this.config.agentId, this.config.phase, input, errorMessage);

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
   * PLANNER: Create execution plan
   * Override in subclasses for phase-specific planning
   */
  protected abstract plan(input: AgentInput): Promise<ExecutionPlan>;

  /**
   * REASONING: Initial reasoning without tools
   * Override in subclasses for phase-specific reasoning
   */
  protected abstract reason(plan: ExecutionPlan, input: AgentInput): Promise<ReasoningResult>;

  /**
   * Integrate tool output into current result
   * Override in subclasses for custom integration logic
   */
  protected async integrateToolOutput(
    currentResult: ReasoningResult,
    toolResult: ToolInvocationResult,
    verification: VerifierResult
  ): Promise<ReasoningResult> {
    // Default: Replace content with tool output
    return {
      content: JSON.stringify(toolResult.output),
      confidence: Math.min(currentResult.confidence + 0.1, 1.0),
      needsImprovement: false,
      reasoning: `Integrated tool output: ${verification.reasoning}`,
    };
  }

  /**
   * Generate final artifacts from reasoning result
   * Override in subclasses for phase-specific artifact generation
   */
  protected abstract generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<Array<{ type: string; content: unknown }>>;

  /**
   * Check if budget exceeded
   */
  protected exceededBudget(input: AgentInput, currentCostUsd: number, currentTokens: number): boolean {
    if (currentCostUsd >= input.budget.maxCostUsd) {
      return true;
    }
    if (currentTokens >= input.budget.maxTokens) {
      return true;
    }
    return false;
  }

  /**
   * Save checkpoint (called by agents during long-running execution)
   *
   * Automatically throttles checkpoints to max 1 per 2 minutes
   *
   * @param token - Continuation token (e.g., 'step-2-complete')
   * @param data - Checkpoint state data
   */
  protected async saveCheckpoint(token: string, data: Record<string, any>): Promise<void> {
    if (!this.checkpointCallback) {
      // No checkpoint callback set, skip
      return;
    }

    // Throttle checkpoints to max 1 per 2 minutes (120 seconds)
    const now = Date.now();
    const timeSinceLastCheckpoint = now - this.lastCheckpointTime;

    if (timeSinceLastCheckpoint < 120000 && this.lastCheckpointTime > 0) {
      // Too soon, skip checkpoint
      return;
    }

    try {
      await this.checkpointCallback(token, data);
      this.lastCheckpointTime = now;

      console.log(`[${this.config.agentId}] Checkpoint saved: ${token}`);
    } catch (error) {
      console.error(`[${this.config.agentId}] Failed to save checkpoint:`, error);
      // Don't throw - checkpoint failures shouldn't break execution
    }
  }

  /**
   * Check if resuming from checkpoint
   *
   * @param input - Agent input (contains checkpoint token if resuming)
   * @returns Checkpoint token if resuming, null otherwise
   */
  protected getCheckpointToken(input: AgentInput): string | null {
    const ctx = input as any;
    return ctx.checkpoint || null;
  }

  /**
   * Get checkpoint data
   *
   * @param input - Agent input (contains checkpoint data if resuming)
   * @returns Checkpoint data if resuming, null otherwise
   */
  protected getCheckpointData(input: AgentInput): Record<string, any> | null {
    const ctx = input as any;
    return ctx.checkpointData || null;
  }
}
