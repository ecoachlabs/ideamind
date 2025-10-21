import { AgentInput, AgentOutput } from './types';
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
export declare class Recorder {
    private natsConnection?;
    private codec;
    private connected;
    private connectionAttempted;
    /**
     * Record agent started event
     */
    recordAgentStarted(agentId: string, phase: string, input: AgentInput): Promise<void>;
    /**
     * Record agent completed event
     */
    recordAgentCompleted(agentId: string, phase: string, input: AgentInput, output: AgentOutput): Promise<void>;
    /**
     * Record agent failed event
     */
    recordAgentFailed(agentId: string, phase: string, input: AgentInput, error: string): Promise<void>;
    /**
     * Connect to NATS server
     */
    connect(): Promise<void>;
    /**
     * Disconnect from NATS
     */
    disconnect(): Promise<void>;
    /**
     * Publish event to event bus (NATS)
     *
     * Publishes to NATS if connected, otherwise logs to console as fallback.
     */
    private publishEvent;
}
//# sourceMappingURL=recorder.d.ts.map