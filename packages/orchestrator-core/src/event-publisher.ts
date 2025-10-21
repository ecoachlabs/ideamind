import { v4 as uuidv4 } from 'uuid';
import {
  EventType,
  WorkflowCreatedEvent,
  WorkflowStateChangedEvent,
  WorkflowPausedEvent,
  WorkflowResumedEvent,
  WorkflowFailedEvent,
  WorkflowCompletedEvent,
  WorkflowState,
} from '@ideamine/event-schemas';
import { WorkflowRun } from './types';
import { connect, NatsConnection, StringCodec } from 'nats';

/**
 * Event publisher for workflow events
 *
 * Publishes events to NATS event bus for distributed system coordination.
 * Falls back to console logging if NATS is not available.
 */
export class EventPublisher {
  private natsConnection?: NatsConnection;
  private codec = StringCodec();
  private connected = false;
  private connectionAttempted = false;
  /**
   * Publish workflow created event
   */
  async publishWorkflowCreated(run: WorkflowRun): Promise<void> {
    const event: WorkflowCreatedEvent = {
      eventId: uuidv4(),
      eventType: EventType.WORKFLOW_CREATED,
      timestamp: new Date().toISOString(),
      workflowRunId: run.id,
      payload: {
        ideaSpecId: run.ideaSpecId,
        userId: run.userId,
        budget: run.budget,
        initialState: run.state,
      },
    };

    await this.publish(EventType.WORKFLOW_CREATED, event);
  }

  /**
   * Publish workflow state changed event
   */
  async publishWorkflowStateChanged(
    run: WorkflowRun,
    fromState: WorkflowState,
    toState: WorkflowState,
    reason?: string
  ): Promise<void> {
    const event: WorkflowStateChangedEvent = {
      eventId: uuidv4(),
      eventType: EventType.WORKFLOW_STATE_CHANGED,
      timestamp: new Date().toISOString(),
      workflowRunId: run.id,
      payload: {
        fromState,
        toState,
        reason,
        artifacts: run.artifacts.map(a => a.artifactId),
      },
    };

    await this.publish(EventType.WORKFLOW_STATE_CHANGED, event);
  }

  /**
   * Publish workflow paused event
   */
  async publishWorkflowPaused(
    run: WorkflowRun,
    reason: string,
    pausedBy: string,
    blockingGate?: string
  ): Promise<void> {
    const event: WorkflowPausedEvent = {
      eventId: uuidv4(),
      eventType: EventType.WORKFLOW_PAUSED,
      timestamp: new Date().toISOString(),
      workflowRunId: run.id,
      payload: {
        reason,
        pausedBy,
        currentState: run.state,
        blockingGate,
      },
    };

    await this.publish(EventType.WORKFLOW_PAUSED, event);
  }

  /**
   * Publish workflow resumed event
   */
  async publishWorkflowResumed(run: WorkflowRun, resumedBy: string): Promise<void> {
    const event: WorkflowResumedEvent = {
      eventId: uuidv4(),
      eventType: EventType.WORKFLOW_RESUMED,
      timestamp: new Date().toISOString(),
      workflowRunId: run.id,
      payload: {
        resumedBy,
        currentState: run.state,
      },
    };

    await this.publish(EventType.WORKFLOW_RESUMED, event);
  }

  /**
   * Publish workflow failed event
   */
  async publishWorkflowFailed(
    run: WorkflowRun,
    error: string,
    isRetryable: boolean
  ): Promise<void> {
    const event: WorkflowFailedEvent = {
      eventId: uuidv4(),
      eventType: EventType.WORKFLOW_FAILED,
      timestamp: new Date().toISOString(),
      workflowRunId: run.id,
      payload: {
        error,
        failedState: run.state,
        retryCount: run.retryCount,
        isRetryable,
      },
    };

    await this.publish(EventType.WORKFLOW_FAILED, event);
  }

  /**
   * Publish workflow completed event
   */
  async publishWorkflowCompleted(run: WorkflowRun): Promise<void> {
    const totalCostUsd = run.phases.reduce((sum, p) => sum + p.costUsd, 0);
    const totalTokens = run.phases.reduce(
      (sum, p) => sum + p.agents.reduce((asum, a) => asum + a.tokensUsed, 0),
      0
    );
    const durationMs =
      run.updatedAt.getTime() - run.createdAt.getTime();

    const event: WorkflowCompletedEvent = {
      eventId: uuidv4(),
      eventType: EventType.WORKFLOW_COMPLETED,
      timestamp: new Date().toISOString(),
      workflowRunId: run.id,
      payload: {
        finalState: run.state,
        totalCostUsd,
        totalTokens,
        durationMs,
        artifactCount: run.artifacts.length,
      },
    };

    await this.publish(EventType.WORKFLOW_COMPLETED, event);
  }

  /**
   * Connect to NATS server
   */
  async connect(): Promise<void> {
    if (this.connectionAttempted) {
      return;
    }

    this.connectionAttempted = true;

    try {
      const servers = process.env.NATS_URL?.split(',') || ['nats://localhost:4222'];

      this.natsConnection = await connect({
        servers,
        name: 'ideamine-orchestrator',
        maxReconnectAttempts: -1, // Infinite reconnects
        reconnectTimeWait: 2000,   // 2 seconds between reconnects
      });

      this.connected = true;

      console.log('[EventPublisher] Connected to NATS:', servers.join(', '));

      // Handle connection closed
      (async () => {
        for await (const status of this.natsConnection!) {
          console.log(`[EventPublisher] NATS status: ${status.type}`);

          if (status.type === 'disconnect') {
            this.connected = false;
          } else if (status.type === 'reconnect') {
            this.connected = true;
          }
        }
      })();
    } catch (error) {
      console.warn('[EventPublisher] Failed to connect to NATS, falling back to console logging:', error);
      this.connected = false;
    }
  }

  /**
   * Disconnect from NATS
   */
  async disconnect(): Promise<void> {
    if (this.natsConnection) {
      await this.natsConnection.drain();
      this.connected = false;
      console.log('[EventPublisher] Disconnected from NATS');
    }
  }

  /**
   * Publish event to NATS
   *
   * Publishes to NATS if connected, otherwise logs to console as fallback.
   */
  private async publish(topic: EventType, event: unknown): Promise<void> {
    const payload = JSON.stringify(event);

    // Ensure connection attempt was made
    if (!this.connectionAttempted) {
      await this.connect();
    }

    // Publish to NATS if connected
    if (this.connected && this.natsConnection) {
      try {
        this.natsConnection.publish(topic, this.codec.encode(payload));
        console.log(`[EventPublisher] Published to NATS: ${topic}`);
      } catch (error) {
        console.error(`[EventPublisher] Failed to publish to NATS:`, error);
        // Fall through to console logging
      }
    }

    // Always log to console for debugging (can be disabled via LOG_LEVEL)
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[EventPublisher] ${topic}:`, JSON.stringify(event, null, 2));
    }
  }
}
