import { v4 as uuidv4 } from 'uuid';
import { WorkflowState, Budget } from '@ideamine/event-schemas';
import { WorkflowRun, PhaseState } from './types';
import { WorkflowStateMachine } from './workflow-state';
import { PhaseOrchestrator } from './phase-orchestrator';
import { EventPublisher } from './event-publisher';
import { Gatekeeper, GateEvaluationInput } from './gatekeeper/gatekeeper';

/**
 * Workflow Engine
 *
 * Core orchestration engine that manages workflow lifecycle:
 * 1. Creates workflow runs from idea submissions
 * 2. Executes phases sequentially
 * 3. Evaluates gates between phases
 * 4. Manages state transitions
 * 5. Handles errors and retries
 * 6. Publishes events
 */
export class WorkflowEngine {
  private phaseOrchestrator: PhaseOrchestrator;
  private eventPublisher: EventPublisher;
  private gatekeepers: Map<string, Gatekeeper>;

  constructor(gatekeepers?: Map<string, Gatekeeper>) {
    this.phaseOrchestrator = new PhaseOrchestrator();
    this.eventPublisher = new EventPublisher();
    this.gatekeepers = gatekeepers || new Map();
  }

  /**
   * Create and start a new workflow run
   */
  async createWorkflow(
    ideaSpecId: string,
    userId: string,
    budget: Budget
  ): Promise<WorkflowRun> {
    const run: WorkflowRun = {
      id: uuidv4(),
      state: WorkflowState.CREATED,
      ideaSpecId,
      userId,
      budget,
      phases: [],
      gates: [],
      artifacts: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      retryCount: 0,
    };

    console.log(`[WorkflowEngine] Created workflow run: ${run.id}`);

    // Publish workflow created event
    await this.eventPublisher.publishWorkflowCreated(run);

    // Transition to intake phase
    await this.transitionTo(run, WorkflowState.INTAKE);

    return run;
  }

  /**
   * Execute the workflow
   */
  async executeWorkflow(run: WorkflowRun): Promise<void> {
    console.log(`[WorkflowEngine] Starting workflow execution: ${run.id}`);

    try {
      // Execute each phase in sequence
      for (const phaseConfig of WorkflowStateMachine.PHASES) {
        // Check if dependencies are met
        if (!this.areDependenciesMet(run, phaseConfig)) {
          console.log(`[WorkflowEngine] Dependencies not met for phase: ${phaseConfig.phaseName}`);
          continue;
        }

        // Transition to phase state
        await this.transitionTo(run, phaseConfig.state);

        // Execute phase
        const phaseExecution = await this.phaseOrchestrator.executePhase(run, phaseConfig);
        run.phases.push(phaseExecution);
        run.artifacts.push(...phaseExecution.artifacts);

        // Check if phase failed
        if (phaseExecution.state === PhaseState.FAILED) {
          if (run.retryCount < run.budget.maxRetries) {
            console.log(`[WorkflowEngine] Phase failed, retrying: ${phaseConfig.phaseName} (attempt ${run.retryCount + 1}/${run.budget.maxRetries})`);
            run.retryCount++;

            // Calculate exponential backoff delay
            const backoffMs = Math.min(1000 * Math.pow(2, run.retryCount), 30000);
            console.log(`[WorkflowEngine] Waiting ${backoffMs}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));

            // Re-execute the failed phase
            console.log(`[WorkflowEngine] Re-executing phase: ${phaseConfig.phaseName}`);
            const retryExecution = await this.phaseOrchestrator.executePhase(run, phaseConfig);

            // Replace the failed execution with the retry
            run.phases[run.phases.length - 1] = retryExecution;
            run.artifacts = run.artifacts.filter(a => a.phaseId !== phaseConfig.phaseName);
            run.artifacts.push(...retryExecution.artifacts);

            // Check retry result
            if (retryExecution.state === PhaseState.FAILED) {
              // If still failed, check if we have more retries
              if (run.retryCount >= run.budget.maxRetries) {
                await this.failWorkflow(
                  run,
                  `Phase ${phaseConfig.phaseName} failed after ${run.retryCount} retries`
                );
                return;
              }
              // Otherwise loop will retry again
            } else {
              // Success! Reset retry count for next phase
              console.log(`[WorkflowEngine] Phase retry succeeded: ${phaseConfig.phaseName}`);
              run.retryCount = 0;
            }
          } else {
            await this.failWorkflow(
              run,
              `Phase ${phaseConfig.phaseName} failed after ${run.retryCount} retries`
            );
            return;
          }
        }

        // Evaluate gates if configured
        if (phaseConfig.gates && phaseConfig.gates.length > 0) {
          const gatesPassed = await this.evaluateGates(run, phaseConfig.gates);

          if (!gatesPassed) {
            await this.pauseWorkflow(run, `Gate blocked at ${phaseConfig.phaseName}`, 'gatekeeper');
            return;
          }
        }

        // Check budget
        const totalCost = run.phases.reduce((sum, p) => sum + p.costUsd, 0);
        if (totalCost >= run.budget.maxCostUsd) {
          await this.pauseWorkflow(run, 'Budget limit exceeded', 'system');
          return;
        }
      }

      // All phases complete - transition to GA
      await this.transitionTo(run, WorkflowState.GA);
      await this.eventPublisher.publishWorkflowCompleted(run);

      console.log(`[WorkflowEngine] Workflow completed successfully: ${run.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.failWorkflow(run, errorMessage);
    }
  }

  /**
   * Transition workflow to new state
   */
  private async transitionTo(run: WorkflowRun, newState: WorkflowState): Promise<void> {
    const oldState = run.state;

    if (!WorkflowStateMachine.isValidTransition(oldState, newState)) {
      throw new Error(`Invalid state transition: ${oldState} -> ${newState}`);
    }

    run.state = newState;
    run.updatedAt = new Date();

    await this.eventPublisher.publishWorkflowStateChanged(run, oldState, newState);

    console.log(`[WorkflowEngine] State transition: ${oldState} -> ${newState}`);
  }

  /**
   * Check if phase dependencies are met
   */
  private areDependenciesMet(run: WorkflowRun, phaseConfig: { dependencies: string[] }): boolean {
    if (phaseConfig.dependencies.length === 0) {
      return true;
    }

    return phaseConfig.dependencies.every(depId =>
      run.phases.some(p => p.phaseId === depId && p.state === PhaseState.COMPLETED)
    );
  }

  /**
   * Evaluate gates
   */
  private async evaluateGates(run: WorkflowRun, gateIds: string[]): Promise<boolean> {
    console.log(`[WorkflowEngine] Evaluating gates:`, gateIds);

    // If no gatekeepers configured, log warning and pass
    if (this.gatekeepers.size === 0) {
      console.warn('[WorkflowEngine] No gatekeepers configured - gates auto-pass. Use EnhancedPhaseCoordinator for full gate support.');
      return true;
    }

    for (const gateId of gateIds) {
      const gatekeeper = this.gatekeepers.get(gateId);

      if (!gatekeeper) {
        console.warn(`[WorkflowEngine] Gatekeeper not found for gate: ${gateId} - auto-passing`);
        continue;
      }

      // Prepare gate evaluation input
      const input: GateEvaluationInput = {
        runId: run.id,
        phase: run.state,
        artifacts: run.artifacts,
        metrics: this.extractMetrics(run),
      };

      // Evaluate the gate
      const result = await gatekeeper.evaluate(input);

      // Record gate result
      run.gates.push({
        gateId,
        result: result.decision.decision,
        score: result.overallScore,
        timestamp: new Date(),
      });

      // Check if gate blocks
      if (result.status === 'fail') {
        console.log(
          `[WorkflowEngine] Gate ${gateId} blocked (score: ${result.overallScore}/100)`,
          result.decision.reasons
        );
        return false;
      }

      // Log warnings
      if (result.status === 'warn') {
        console.warn(
          `[WorkflowEngine] Gate ${gateId} passed with warnings:`,
          result.recommendations
        );
      } else {
        console.log(`[WorkflowEngine] Gate ${gateId} passed (score: ${result.overallScore}/100)`);
      }
    }

    return true;
  }

  /**
   * Extract metrics from workflow run for gate evaluation
   */
  private extractMetrics(run: WorkflowRun): Record<string, number | boolean> {
    const metrics: Record<string, number | boolean> = {};

    // Calculate total cost
    const totalCost = run.phases.reduce((sum, p) => sum + p.costUsd, 0);
    metrics.total_cost_usd = totalCost;

    // Calculate total tokens
    const totalTokens = run.phases.reduce(
      (sum, p) => sum + p.agents.reduce((asum, a) => asum + a.tokensUsed, 0),
      0
    );
    metrics.total_tokens = totalTokens;

    // Budget utilization
    metrics.budget_utilization = totalCost / run.budget.maxCostUsd;

    // Phase count
    metrics.phases_completed = run.phases.filter(p => p.state === PhaseState.COMPLETED).length;
    metrics.phases_failed = run.phases.filter(p => p.state === PhaseState.FAILED).length;

    // Artifact count
    metrics.artifact_count = run.artifacts.length;

    // Retry count
    metrics.retry_count = run.retryCount;

    // Duration
    const durationMs = run.updatedAt.getTime() - run.createdAt.getTime();
    metrics.duration_minutes = durationMs / 60000;

    return metrics;
  }

  /**
   * Pause workflow
   */
  private async pauseWorkflow(run: WorkflowRun, reason: string, pausedBy: string): Promise<void> {
    const oldState = run.state;
    run.state = WorkflowState.PAUSED;
    run.updatedAt = new Date();

    await this.eventPublisher.publishWorkflowPaused(run, reason, pausedBy);

    console.log(`[WorkflowEngine] Workflow paused: ${reason}`);
  }

  /**
   * Fail workflow
   */
  private async failWorkflow(run: WorkflowRun, error: string): Promise<void> {
    const oldState = run.state;
    run.state = WorkflowState.FAILED;
    run.updatedAt = new Date();

    const isRetryable = run.retryCount < run.budget.maxRetries;
    await this.eventPublisher.publishWorkflowFailed(run, error, isRetryable);

    console.error(`[WorkflowEngine] Workflow failed: ${error}`);
  }

  /**
   * Resume paused workflow
   */
  async resumeWorkflow(run: WorkflowRun, resumedBy: string): Promise<void> {
    if (run.state !== WorkflowState.PAUSED) {
      throw new Error(`Cannot resume workflow in state: ${run.state}`);
    }

    await this.eventPublisher.publishWorkflowResumed(run, resumedBy);

    console.log(`[WorkflowEngine] Workflow resumed by: ${resumedBy}`);

    // Continue execution
    await this.executeWorkflow(run);
  }
}
