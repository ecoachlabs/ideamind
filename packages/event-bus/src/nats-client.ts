import {
  connect,
  NatsConnection,
  JetStreamClient,
  JetStreamManager,
  JetStreamPublishOptions,
  ConsumerConfig,
  StreamConfig,
  JSONCodec,
  headers,
} from 'nats';

/**
 * NATS Jetstream Configuration
 */
export interface NatsConfig {
  servers: string[];
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectTimeWait?: number;
}

/**
 * Stream configuration
 */
export interface StreamSetup {
  name: string;
  subjects: string[];
  retention?: 'limits' | 'interest' | 'workqueue';
  maxAge?: number; // nanoseconds
  maxBytes?: number;
  maxMsgs?: number;
  storage?: 'file' | 'memory';
}

/**
 * NATS Jetstream Client
 *
 * Provides:
 * - Event publishing with guaranteed delivery
 * - Stream and consumer management
 * - Message subscription with acknowledgment
 * - Dead letter queue handling
 */
export class NatsClient {
  private connection?: NatsConnection;
  private jetstream?: JetStreamClient;
  private jetstreamManager?: JetStreamManager;
  private codec = JSONCodec();
  private static instance: NatsClient;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): NatsClient {
    if (!NatsClient.instance) {
      NatsClient.instance = new NatsClient();
    }
    return NatsClient.instance;
  }

  /**
   * Connect to NATS server
   */
  async connect(config: NatsConfig): Promise<void> {
    try {
      this.connection = await connect({
        servers: config.servers,
        reconnect: config.reconnect ?? true,
        maxReconnectAttempts: config.maxReconnectAttempts ?? -1, // infinite
        reconnectTimeWait: config.reconnectTimeWait ?? 2000, // 2 seconds
      });

      this.jetstream = this.connection.jetstream();
      this.jetstreamManager = await this.connection.jetstreamManager();

      console.log(`[NatsClient] Connected to NATS: ${config.servers.join(', ')}`);

      // Handle connection events
      (async () => {
        for await (const status of this.connection!.status()) {
          console.log(`[NatsClient] Status: ${status.type} - ${status.data}`);
        }
      })();
    } catch (error) {
      console.error('[NatsClient] Connection failed:', error);
      throw error;
    }
  }

  /**
   * Create or update a stream
   */
  async setupStream(config: StreamSetup): Promise<void> {
    if (!this.jetstreamManager) {
      throw new Error('NATS not connected');
    }

    const streamConfig: Partial<StreamConfig> = {
      name: config.name,
      subjects: config.subjects,
      retention: config.retention ?? 'limits',
      max_age: config.maxAge ?? 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days in nanoseconds
      max_bytes: config.maxBytes ?? 1024 * 1024 * 1024 * 10, // 10GB
      max_msgs: config.maxMsgs ?? 1_000_000,
      storage: config.storage ?? 'file',
    };

    try {
      await this.jetstreamManager.streams.add(streamConfig);
      console.log(`[NatsClient] Stream created/updated: ${config.name}`);
    } catch (error: any) {
      // Stream might already exist
      if (error.message?.includes('already in use')) {
        console.log(`[NatsClient] Stream already exists: ${config.name}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Publish an event to a subject
   */
  async publish<T = any>(
    subject: string,
    event: T,
    options?: {
      correlationId?: string;
      messageId?: string;
      headers?: Record<string, string>;
    }
  ): Promise<void> {
    if (!this.jetstream) {
      throw new Error('NATS not connected');
    }

    const h = headers();

    if (options?.correlationId) {
      h.set('Nats-Msg-Id', options.messageId ?? `${Date.now()}`);
      h.set('correlation-id', options.correlationId);
    }

    if (options?.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        h.set(key, value);
      }
    }

    const publishOptions: Partial<JetStreamPublishOptions> = {
      headers: h,
    };

    try {
      const ack = await this.jetstream.publish(
        subject,
        this.codec.encode(event),
        publishOptions
      );

      console.log(
        `[NatsClient] Published to ${subject}: seq=${ack.seq}, stream=${ack.stream}`
      );
    } catch (error) {
      console.error(`[NatsClient] Publish failed for ${subject}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to a subject with durable consumer
   */
  async subscribe<T = any>(
    stream: string,
    subject: string,
    consumerName: string,
    handler: (data: T, metadata: {
      subject: string;
      seq: number;
      timestamp: Date;
      correlationId?: string;
    }) => Promise<void>,
    options?: {
      maxAckPending?: number;
      ackWait?: number; // milliseconds
      maxDeliver?: number;
      filterSubject?: string;
    }
  ): Promise<void> {
    if (!this.jetstream || !this.jetstreamManager) {
      throw new Error('NATS not connected');
    }

    // Create consumer config
    const consumerConfig: Partial<ConsumerConfig> = {
      durable_name: consumerName,
      ack_policy: 'explicit' as any,
      max_ack_pending: options?.maxAckPending ?? 100,
      ack_wait: (options?.ackWait ?? 30000) * 1_000_000, // convert to nanoseconds
      max_deliver: options?.maxDeliver ?? 3,
      filter_subject: options?.filterSubject ?? subject,
    };

    try {
      await this.jetstreamManager.consumers.add(stream, consumerConfig);
    } catch (error: any) {
      if (!error.message?.includes('already in use')) {
        throw error;
      }
    }

    // Get consumer
    const consumer = await this.jetstream.consumers.get(stream, consumerName);

    // Start consuming messages
    const messages = await consumer.consume();

    console.log(
      `[NatsClient] Subscribed to ${stream}/${subject} as ${consumerName}`
    );

    // Process messages
    (async () => {
      for await (const msg of messages) {
        try {
          const data = this.codec.decode(msg.data) as T;

          const metadata = {
            subject: msg.subject,
            seq: msg.seq,
            timestamp: new Date(msg.info?.timestampNanos ? Number(msg.info.timestampNanos) / 1_000_000 : Date.now()),
            correlationId: msg.headers?.get('correlation-id'),
          };

          await handler(data, metadata);

          // Acknowledge message
          msg.ack();
        } catch (error) {
          console.error(
            `[NatsClient] Error processing message on ${subject}:`,
            error
          );

          // Negative acknowledgment (will be redelivered)
          msg.nak();
        }
      }
    })();
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      console.log('[NatsClient] Connection closed');
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.connection) {
        return false;
      }

      const status = this.connection.info;
      return status !== undefined;
    } catch (error) {
      console.error('[NatsClient] Health check failed:', error);
      return false;
    }
  }

  /**
   * Get connection stats
   */
  getStats() {
    if (!this.connection) {
      return null;
    }

    return {
      server: this.connection.getServer(),
      info: this.connection.info,
    };
  }
}

/**
 * Initialize NATS client from environment
 */
export function initializeNatsFromEnv(): Promise<NatsClient> {
  const servers = process.env.NATS_SERVERS?.split(',') ?? ['nats://localhost:4222'];

  const config: NatsConfig = {
    servers,
    reconnect: true,
    maxReconnectAttempts: -1,
    reconnectTimeWait: 2000,
  };

  const client = NatsClient.getInstance();
  return client.connect(config).then(() => client);
}

/**
 * Setup default IdeaMine streams
 */
export async function setupIdeaMineStreams(client: NatsClient): Promise<void> {
  const streams: StreamSetup[] = [
    {
      name: 'WORKFLOWS',
      subjects: [
        'workflow.created',
        'workflow.state-changed',
        'workflow.completed',
        'workflow.failed',
        'workflow.paused',
        'workflow.resumed',
      ],
      retention: 'limits',
      maxAge: 30 * 24 * 60 * 60 * 1_000_000_000, // 30 days
      storage: 'file',
    },
    {
      name: 'PHASES',
      subjects: [
        'phase.started',
        'phase.completed',
        'phase.failed',
      ],
      retention: 'limits',
      maxAge: 30 * 24 * 60 * 60 * 1_000_000_000, // 30 days
      storage: 'file',
    },
    {
      name: 'AGENTS',
      subjects: [
        'agent.started',
        'agent.completed',
        'agent.failed',
        'agent.tool-invoked',
      ],
      retention: 'limits',
      maxAge: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days
      storage: 'file',
    },
    {
      name: 'GATES',
      subjects: [
        'gate.evaluating',
        'gate.passed',
        'gate.failed',
        'gate.escalated',
      ],
      retention: 'limits',
      maxAge: 30 * 24 * 60 * 60 * 1_000_000_000, // 30 days
      storage: 'file',
    },
    {
      name: 'TOOLS',
      subjects: [
        'tool.invoked',
        'tool.completed',
        'tool.failed',
      ],
      retention: 'limits',
      maxAge: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days
      storage: 'file',
    },
  ];

  for (const stream of streams) {
    await client.setupStream(stream);
  }

  console.log('[NatsClient] All IdeaMine streams configured');
}
