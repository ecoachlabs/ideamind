"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Recorder = void 0;
const uuid_1 = require("uuid");
const event_schemas_1 = require("@ideamine/event-schemas");
const nats_1 = require("nats");
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
class Recorder {
    natsConnection;
    codec = (0, nats_1.StringCodec)();
    connected = false;
    connectionAttempted = false;
    /**
     * Record agent started event
     */
    async recordAgentStarted(agentId, phase, input) {
        const event = {
            eventId: (0, uuid_1.v4)(),
            eventType: event_schemas_1.EventType.AGENT_STARTED,
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
    async recordAgentCompleted(agentId, phase, input, output) {
        const event = {
            eventId: (0, uuid_1.v4)(),
            eventType: event_schemas_1.EventType.AGENT_COMPLETED,
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
    async recordAgentFailed(agentId, phase, input, error) {
        const event = {
            eventId: (0, uuid_1.v4)(),
            eventType: event_schemas_1.EventType.AGENT_FAILED,
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
    async connect() {
        if (this.connectionAttempted) {
            return;
        }
        this.connectionAttempted = true;
        try {
            const servers = process.env.NATS_URL?.split(',') || ['nats://localhost:4222'];
            this.natsConnection = await (0, nats_1.connect)({
                servers,
                name: 'ideamine-agent-recorder',
                maxReconnectAttempts: -1,
                reconnectTimeWait: 2000,
            });
            this.connected = true;
            console.log('[Recorder] Connected to NATS:', servers.join(', '));
            // Handle connection status
            (async () => {
                for await (const status of this.natsConnection) {
                    if (status.type === 'disconnect') {
                        this.connected = false;
                    }
                    else if (status.type === 'reconnect') {
                        this.connected = true;
                    }
                }
            })();
        }
        catch (error) {
            console.warn('[Recorder] Failed to connect to NATS, falling back to console logging:', error);
            this.connected = false;
        }
    }
    /**
     * Disconnect from NATS
     */
    async disconnect() {
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
    async publishEvent(event) {
        const payload = JSON.stringify(event);
        // Ensure connection attempt was made
        if (!this.connectionAttempted) {
            await this.connect();
        }
        // Publish to NATS if connected
        if (this.connected && this.natsConnection) {
            try {
                const eventType = event.eventType;
                this.natsConnection.publish(eventType, this.codec.encode(payload));
                console.log(`[Recorder] Published to NATS: ${eventType}`);
            }
            catch (error) {
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
exports.Recorder = Recorder;
//# sourceMappingURL=recorder.js.map