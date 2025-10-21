import { NatsClient } from './nats-client';
import { WorkflowRun } from '@ideamine/event-schemas';

/**
 * Event Publisher
 *
 * High-level API for publishing IdeaMine domain events to NATS
 */
export class EventPublisher {
  private natsClient: NatsClient;

  constructor(natsClient?: NatsClient) {
    this.natsClient = natsClient ?? NatsClient.getInstance();
  }

  /**
   * Publish workflow created event
   */
  async publishWorkflowCreated(workflow: WorkflowRun): Promise<void> {
    await this.natsClient.publish('workflow.created', {
      workflowId: workflow.id,
      userId: workflow.userId,
      ideaSpecId: workflow.ideaSpecId,
      state: workflow.state,
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflow.id,
      messageId: `workflow-created-${workflow.id}`,
    });
  }

  /**
   * Publish workflow state changed event
   */
  async publishWorkflowStateChanged(
    workflow: WorkflowRun,
    oldState: string,
    newState: string
  ): Promise<void> {
    await this.natsClient.publish('workflow.state-changed', {
      workflowId: workflow.id,
      oldState,
      newState,
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflow.id,
      messageId: `workflow-state-${workflow.id}-${Date.now()}`,
    });
  }

  /**
   * Publish workflow completed event
   */
  async publishWorkflowCompleted(workflow: WorkflowRun): Promise<void> {
    await this.natsClient.publish('workflow.completed', {
      workflowId: workflow.id,
      userId: workflow.userId,
      totalCost: workflow.budget.currentCostUsd,
      totalTokens: workflow.budget.currentTokens,
      duration: workflow.updatedAt.getTime() - workflow.createdAt.getTime(),
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflow.id,
      messageId: `workflow-completed-${workflow.id}`,
    });
  }

  /**
   * Publish workflow failed event
   */
  async publishWorkflowFailed(
    workflow: WorkflowRun,
    error: string,
    isRetryable: boolean
  ): Promise<void> {
    await this.natsClient.publish('workflow.failed', {
      workflowId: workflow.id,
      userId: workflow.userId,
      error,
      isRetryable,
      retryCount: workflow.retryCount,
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflow.id,
      messageId: `workflow-failed-${workflow.id}-${Date.now()}`,
    });
  }

  /**
   * Publish workflow paused event
   */
  async publishWorkflowPaused(
    workflow: WorkflowRun,
    reason: string,
    pausedBy: string
  ): Promise<void> {
    await this.natsClient.publish('workflow.paused', {
      workflowId: workflow.id,
      reason,
      pausedBy,
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflow.id,
      messageId: `workflow-paused-${workflow.id}-${Date.now()}`,
    });
  }

  /**
   * Publish workflow resumed event
   */
  async publishWorkflowResumed(
    workflow: WorkflowRun,
    resumedBy: string
  ): Promise<void> {
    await this.natsClient.publish('workflow.resumed', {
      workflowId: workflow.id,
      resumedBy,
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflow.id,
      messageId: `workflow-resumed-${workflow.id}-${Date.now()}`,
    });
  }

  /**
   * Publish phase started event
   */
  async publishPhaseStarted(
    workflowId: string,
    phaseId: string,
    phaseName: string
  ): Promise<void> {
    await this.natsClient.publish('phase.started', {
      workflowId,
      phaseId,
      phaseName,
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflowId,
      messageId: `phase-started-${workflowId}-${phaseId}`,
    });
  }

  /**
   * Publish phase completed event
   */
  async publishPhaseCompleted(
    workflowId: string,
    phaseId: string,
    phaseName: string,
    costUsd: number,
    artifactIds: string[]
  ): Promise<void> {
    await this.natsClient.publish('phase.completed', {
      workflowId,
      phaseId,
      phaseName,
      costUsd,
      artifactIds,
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflowId,
      messageId: `phase-completed-${workflowId}-${phaseId}`,
    });
  }

  /**
   * Publish phase failed event
   */
  async publishPhaseFailed(
    workflowId: string,
    phaseId: string,
    phaseName: string,
    error: string
  ): Promise<void> {
    await this.natsClient.publish('phase.failed', {
      workflowId,
      phaseId,
      phaseName,
      error,
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflowId,
      messageId: `phase-failed-${workflowId}-${phaseId}-${Date.now()}`,
    });
  }

  /**
   * Publish agent started event
   */
  async publishAgentStarted(
    workflowId: string,
    phaseId: string,
    agentId: string,
    agentType: string
  ): Promise<void> {
    await this.natsClient.publish('agent.started', {
      workflowId,
      phaseId,
      agentId,
      agentType,
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflowId,
      messageId: `agent-started-${agentId}-${Date.now()}`,
    });
  }

  /**
   * Publish agent completed event
   */
  async publishAgentCompleted(
    workflowId: string,
    phaseId: string,
    agentId: string,
    agentType: string,
    costUsd: number,
    tokensUsed: number,
    toolsInvoked: string[]
  ): Promise<void> {
    await this.natsClient.publish('agent.completed', {
      workflowId,
      phaseId,
      agentId,
      agentType,
      costUsd,
      tokensUsed,
      toolsInvoked,
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflowId,
      messageId: `agent-completed-${agentId}-${Date.now()}`,
    });
  }

  /**
   * Publish gate evaluation events
   */
  async publishGatePassed(
    workflowId: string,
    gateId: string,
    gateName: string,
    score: number
  ): Promise<void> {
    await this.natsClient.publish('gate.passed', {
      workflowId,
      gateId,
      gateName,
      score,
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflowId,
      messageId: `gate-passed-${gateId}-${Date.now()}`,
    });
  }

  async publishGateFailed(
    workflowId: string,
    gateId: string,
    gateName: string,
    score: number,
    reason: string
  ): Promise<void> {
    await this.natsClient.publish('gate.failed', {
      workflowId,
      gateId,
      gateName,
      score,
      reason,
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflowId,
      messageId: `gate-failed-${gateId}-${Date.now()}`,
    });
  }

  /**
   * Publish tool invocation events
   */
  async publishToolInvoked(
    workflowId: string,
    agentId: string,
    toolId: string,
    toolVersion: string,
    inputs: Record<string, any>
  ): Promise<void> {
    await this.natsClient.publish('tool.invoked', {
      workflowId,
      agentId,
      toolId,
      toolVersion,
      inputs,
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflowId,
      messageId: `tool-invoked-${toolId}-${Date.now()}`,
    });
  }

  async publishToolCompleted(
    workflowId: string,
    agentId: string,
    toolId: string,
    toolVersion: string,
    success: boolean,
    durationMs: number,
    costUsd: number
  ): Promise<void> {
    await this.natsClient.publish('tool.completed', {
      workflowId,
      agentId,
      toolId,
      toolVersion,
      success,
      durationMs,
      costUsd,
      timestamp: new Date().toISOString(),
    }, {
      correlationId: workflowId,
      messageId: `tool-completed-${toolId}-${Date.now()}`,
    });
  }
}
