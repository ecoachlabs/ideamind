import { v4 as uuidv4 } from 'uuid';
import {
  EventType,
  AgentStartedEvent,
  AgentCompletedEvent,
  AgentFailedEvent,
} from '@ideamine/event-schemas';
import { AgentInput, AgentOutput } from './types';
import { connect, NatsConnection, StringCodec } from 'nats';

/**
 * Recorder: Publishes agent events to event bus and logs to audit trail
 *
 * Events published:
 * - AGENT_STARTED: When agent begins execution
 * - AGENT_COMPLETED: When agent finishes successfully
 * - AGENT_FAILED: When agent encounters error
 *
 * Publishes to NATS event bus with automatic reconnection and fallback to console logging.
 */
export class Recorder {
  private natsConnection?: NatsConnection;
  private codec = StringCodec();
  private connected = false;
  private connectionAttempted = false;
  /**
   * Record agent started event
   */
  async recordAgentStarted(
    agentId: string,
    phase: string,
    input: AgentInput
  ): Promise<void> {
    const event: AgentStartedEvent = {
      eventId: uuidv4(),
      eventType: EventType.AGENT_STARTED,
      timestamp: new Date().toISOString(),
      workflowRunId: input.workflowRunId,
      payload: {
        agentId,
        agentType: agentId.split('-')[0], // Extract type from ID
        phase,
        input: input.metadata || {},
      },
    };

    await this.publishEvent(event);
  }

  /**
   * Record agent completed event
   */
  async recordAgentCompleted(
    agentId: string,
    phase: string,
    input: AgentInput,
    output: AgentOutput
  ): Promise<void> {
    const event: AgentCompletedEvent = {
      eventId: uuidv4(),
      eventType: EventType.AGENT_COMPLETED,
      timestamp: new Date().toISOString(),
      workflowRunId: input.workflowRunId,
      payload: {
        agentId,
        agentType: agentId.split('-')[0],
        phase,
        output: output.metadata || {},
        costUsd: output.costUsd,
        tokensUsed: output.tokensUsed,
        durationMs: output.durationMs,
        toolsInvoked: output.toolsInvoked,
      },
    };

    await this.publishEvent(event);
  }

  /**
   * Record agent failed event
   */
  async recordAgentFailed(
    agentId: string,
    phase: string,
    input: AgentInput,
    error: string
  ): Promise<void> {
    const event: AgentFailedEvent = {
      eventId: uuidv4(),
      eventType: EventType.AGENT_FAILED,
      timestamp: new Date().toISOString(),
      workflowRunId: input.workflowRunId,
      payload: {
        agentId,
        agentType: agentId.split('-')[0],
        phase,
        error,
        retryCount: 0,
        isRetryable: true,
      },
    };

    await this.publishEvent(event);
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
        name: 'ideamine-agent-recorder',
        maxReconnectAttempts: -1,
        reconnectTimeWait: 2000,
      });

      this.connected = true;

      console.log('[Recorder] Connected to NATS:', servers.join(', '));

      // Handle connection status
      (async () => {
        for await (const status of this.natsConnection!) {
          if (status.type === 'disconnect') {
            this.connected = false;
          } else if (status.type === 'reconnect') {
            this.connected = true;
          }
        }
      })();
    } catch (error) {
      console.warn('[Recorder] Failed to connect to NATS, falling back to console logging:', error);
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
      console.log('[Recorder] Disconnected from NATS');
    }
  }

  /**
   * Publish event to event bus (NATS)
   *
   * Publishes to NATS if connected, otherwise logs to console as fallback.
   */
  private async publishEvent(event: unknown): Promise<void> {
    const payload = JSON.stringify(event);

    // Ensure connection attempt was made
    if (!this.connectionAttempted) {
      await this.connect();
    }

    // Publish to NATS if connected
    if (this.connected && this.natsConnection) {
      try {
        const eventType = (event as any).eventType;
        this.natsConnection.publish(eventType, this.codec.encode(payload));
        console.log(`[Recorder] Published to NATS: ${eventType}`);
      } catch (error) {
        console.error(`[Recorder] Failed to publish to NATS:`, error);
        // Fall through to console logging
      }
    }

    // Log to console for debugging
    if (process.env.LOG_LEVEL === 'debug') {
      console.log('[Recorder] Event:', JSON.stringify(event, null, 2));
    }
  }
}
