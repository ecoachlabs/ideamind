import { WorkflowRun, PhaseExecution, PhaseState, PhaseConfig, AgentExecution, AgentState } from './types';

/**
 * Phase Orchestrator
 *
 * Responsible for:
 * - Executing all agents in a phase
 * - Collecting artifacts
 * - Tracking costs
 * - Handling errors and retries
 * - Parallel agent execution where possible
 */
export class PhaseOrchestrator {
  private maxRetries = 3;
  private retryDelayMs = 1000;

  /**
   * Execute a phase
   */
  async executePhase(
    run: WorkflowRun,
    phaseConfig: PhaseConfig
  ): Promise<PhaseExecution> {
    const execution: PhaseExecution = {
      phaseId: phaseConfig.phaseId,
      phaseName: phaseConfig.phaseName,
      state: PhaseState.RUNNING,
      startedAt: new Date(),
      agents: [],
      artifacts: [],
      costUsd: 0,
      retryCount: 0,
    };

    try {
      console.log(`[PhaseOrchestrator] Starting phase: ${phaseConfig.phaseName}`);

      // Determine parallel vs sequential agent execution
      const { parallelAgents, sequentialAgents } = this.categorizeAgents(phaseConfig.agents);

      // Execute parallel agents concurrently
      if (parallelAgents.length > 0) {
        console.log(`[PhaseOrchestrator] Executing ${parallelAgents.length} agents in parallel`);
        const parallelResults = await Promise.allSettled(
          parallelAgents.map(agentId => this.executeAgentWithRetry(run, agentId))
        );

        for (const result of parallelResults) {
          if (result.status === 'fulfilled') {
            execution.agents.push(result.value);
            execution.costUsd += result.value.costUsd;
          } else {
            // Parallel agent failure doesn't fail the phase
            console.warn(`[PhaseOrchestrator] Parallel agent failed:`, result.reason);
          }
        }
      }

      // Execute sequential agents one by one
      for (const agentId of sequentialAgents) {
        const agentResult = await this.executeAgentWithRetry(run, agentId);
        execution.agents.push(agentResult);
        execution.costUsd += agentResult.costUsd;

        // Sequential failure fails the phase
        if (agentResult.state === AgentState.FAILED) {
          throw new Error(`Sequential agent ${agentId} failed: ${agentResult.error}`);
        }
      }

      execution.state = PhaseState.COMPLETED;
      execution.completedAt = new Date();

      console.log(
        `[PhaseOrchestrator] Phase completed: ${phaseConfig.phaseName} ` +
        `(cost: $${execution.costUsd.toFixed(2)}, ` +
        `agents: ${execution.agents.length})`
      );

      return execution;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      execution.state = PhaseState.FAILED;
      execution.error = errorMessage;
      execution.completedAt = new Date();

      console.error(`[PhaseOrchestrator] Phase failed: ${phaseConfig.phaseName}`, errorMessage);

      return execution;
    }
  }

  /**
   * Categorize agents into parallel vs sequential based on naming convention
   *
   * Agents ending in '-parallel' can run concurrently
   * All others run sequentially
   */
  private categorizeAgents(agents: string[]): {
    parallelAgents: string[];
    sequentialAgents: string[];
  } {
    const parallelAgents: string[] = [];
    const sequentialAgents: string[] = [];

    for (const agentId of agents) {
      if (agentId.endsWith('-parallel') || agentId.includes('parallel')) {
        parallelAgents.push(agentId);
      } else {
        sequentialAgents.push(agentId);
      }
    }

    return { parallelAgents, sequentialAgents };
  }

  /**
   * Execute agent with automatic retry logic
   */
  private async executeAgentWithRetry(
    run: WorkflowRun,
    agentId: string
  ): Promise<AgentExecution> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[PhaseOrchestrator] Executing agent: ${agentId} (attempt ${attempt}/${this.maxRetries})`);

        const result = await this.invokeAgent(run, agentId);

        if (result.state === AgentState.COMPLETED) {
          console.log(`[PhaseOrchestrator] Agent ${agentId} completed successfully`);
          return result;
        }

        // Agent returned with failed state
        throw new Error(result.error || 'Agent execution failed');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[PhaseOrchestrator] Agent ${agentId} failed (attempt ${attempt}/${this.maxRetries}):`, lastError.message);

        // Wait before retry with exponential backoff
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
          console.log(`[PhaseOrchestrator] Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted - return failed execution
    return {
      agentId,
      agentType: agentId.split('-')[0],
      state: AgentState.FAILED,
      startedAt: new Date(),
      completedAt: new Date(),
      costUsd: 0,
      tokensUsed: 0,
      toolsInvoked: 0,
      error: lastError?.message || 'Unknown error',
    };
  }

  /**
   * Invoke agent via agent service
   *
   * Uses HTTP call to agent service if AGENT_SERVICE_URL is configured,
   * otherwise falls back to simulation
   */
  private async invokeAgent(
    run: WorkflowRun,
    agentId: string
  ): Promise<AgentExecution> {
    const agentServiceUrl = process.env.AGENT_SERVICE_URL;

    if (agentServiceUrl) {
      try {
        const response = await fetch(`${agentServiceUrl}/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            agentId,
            workflowRunId: run.id,
            budget: run.budget,
            context: {
              ideaSpecId: run.ideaSpecId,
              phase: run.state,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Agent service returned ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        console.warn('[PhaseOrchestrator] Agent service unavailable, using simulation:', error);
        return await this.simulateAgentExecution(agentId);
      }
    }

    // Fallback to simulation
    return await this.simulateAgentExecution(agentId);
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Simulate agent execution (fallback when agent service unavailable)
   */
  private async simulateAgentExecution(agentId: string): Promise<AgentExecution> {
    const delay = Math.random() * 1000;
    await this.sleep(delay);

    return {
      agentId,
      agentType: agentId.split('-')[0],
      state: AgentState.COMPLETED,
      startedAt: new Date(),
      completedAt: new Date(),
      costUsd: Math.random() * 0.1,
      tokensUsed: Math.floor(Math.random() * 1000),
      toolsInvoked: Math.floor(Math.random() * 3),
    };
  }
}
