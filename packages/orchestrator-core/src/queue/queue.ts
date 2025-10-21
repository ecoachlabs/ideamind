import crypto from 'crypto';
import Redis from 'ioredis';
import pino from 'pino';
import RedisConnection from './redis-connection';
import { QueueMessage, ConsumerHandler, QueueConfig } from './types';

const logger = pino({ name: 'job-queue' });

/**
 * JobQueue - Redis Streams-based distributed job queue with idempotence
 *
 * Features:
 * - Idempotent message delivery (duplicate keys auto-skipped)
 * - Consumer groups for competing consumers
 * - At-least-once delivery with ACKs
 * - Adaptive concurrency via queue depth monitoring
 *
 * Spec: UNIFIED_IMPLEMENTATION_SPEC.md Section 3.1
 */
export class JobQueue {
  private redis: Redis;
  private config: QueueConfig;
  private consumerLoops: Map<string, boolean> = new Map();

  constructor(config: QueueConfig = {}) {
    this.config = {
      idempotenceTtlSeconds: config.idempotenceTtlSeconds || 86400, // 24 hours
      blockTimeMs: config.blockTimeMs || 5000, // 5 seconds
      batchSize: config.batchSize || 10,
      ...config,
    };
    this.redis = null as any; // Will be set in init()
  }

  /**
   * Initialize Redis connection
   */
  async init(): Promise<void> {
    this.redis = await RedisConnection.getConnection();
    logger.info('JobQueue initialized');
  }

  /**
   * Enqueue message with idempotence key deduplication
   *
   * @param topic - Stream name (e.g., 'tasks', 'heartbeats', 'events')
   * @param msg - Message payload
   * @param key - Idempotence key (auto-generated if not provided)
   * @returns Message ID or null if duplicate
   */
  async enqueue(
    topic: string,
    msg: Record<string, any>,
    key?: string
  ): Promise<string | null> {
    try {
      // Generate idempotence key if not provided
      const idempotenceKey = key || this.generateKey(topic, msg);

      // Check if already processed
      const processed = await this.redis.get(`idempotence:${idempotenceKey}`);
      if (processed) {
        logger.debug({ key: idempotenceKey, topic }, 'Duplicate message skipped');
        return null;
      }

      // Add to stream
      const messageId = await this.redis.xadd(
        topic,
        '*', // Auto-generate ID
        'key',
        idempotenceKey,
        'payload',
        JSON.stringify(msg),
        'timestamp',
        Date.now().toString()
      );

      // Mark as processed (with TTL for auto-cleanup)
      await this.redis.setex(
        `idempotence:${idempotenceKey}`,
        this.config.idempotenceTtlSeconds!,
        messageId
      );

      logger.info(
        { messageId, key: idempotenceKey, topic },
        'Message enqueued'
      );

      return messageId;
    } catch (error) {
      logger.error({ error, topic, msg }, 'Failed to enqueue message');
      throw error;
    }
  }

  /**
   * Consume messages from stream with consumer group
   *
   * @param topic - Stream name
   * @param consumerGroup - Consumer group name
   * @param consumerName - Consumer instance name
   * @param handler - Message handler function
   */
  async consume(
    topic: string,
    consumerGroup: string,
    consumerName: string,
    handler: ConsumerHandler
  ): Promise<void> {
    const loopKey = `${topic}:${consumerGroup}:${consumerName}`;

    // Ensure consumer group exists
    try {
      await this.redis.xgroup('CREATE', topic, consumerGroup, '0', 'MKSTREAM');
      logger.info({ topic, consumerGroup }, 'Consumer group created');
    } catch (error: any) {
      if (!error.message.includes('BUSYGROUP')) {
        throw error;
      }
      // Group already exists, continue
    }

    this.consumerLoops.set(loopKey, true);

    logger.info({ topic, consumerGroup, consumerName }, 'Consumer started');

    // Consumer loop
    while (this.consumerLoops.get(loopKey)) {
      try {
        // Read new messages (blocking)
        const results = await this.redis.xreadgroup(
          'GROUP',
          consumerGroup,
          consumerName,
          'BLOCK',
          this.config.blockTimeMs!.toString(),
          'COUNT',
          this.config.batchSize!.toString(),
          'STREAMS',
          topic,
          '>' // Only new messages
        );

        if (!results || results.length === 0) {
          // No messages, continue loop
          continue;
        }

        // Process messages
        for (const [streamName, messages] of results) {
          for (const [messageId, fields] of messages) {
            try {
              const message = this.parseMessage(fields);

              logger.debug(
                { messageId, key: message.key, topic: streamName },
                'Processing message'
              );

              // Handle message
              await handler(message);

              // ACK message
              await this.redis.xack(streamName, consumerGroup, messageId);

              logger.debug({ messageId, topic: streamName }, 'Message ACKed');
            } catch (error) {
              logger.error(
                { error, messageId, topic: streamName },
                'Message handler failed'
              );

              // Message remains in PEL (Pending Entries List)
              // Can be claimed by another consumer or retried
            }
          }
        }
      } catch (error) {
        logger.error({ error, topic, consumerGroup }, 'Consumer loop error');

        // Backoff before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    logger.info({ topic, consumerGroup, consumerName }, 'Consumer stopped');
  }

  /**
   * Stop consumer loop
   */
  stopConsumer(topic: string, consumerGroup: string, consumerName: string): void {
    const loopKey = `${topic}:${consumerGroup}:${consumerName}`;
    this.consumerLoops.set(loopKey, false);
    logger.info({ topic, consumerGroup, consumerName }, 'Consumer stop requested');
  }

  /**
   * Get queue depth (pending messages)
   */
  async getQueueDepth(topic: string): Promise<number> {
    try {
      const info = await this.redis.xinfo('STREAM', topic);

      // Parse Redis XINFO output (array format)
      for (let i = 0; i < info.length; i += 2) {
        if (info[i] === 'length') {
          return parseInt(info[i + 1] as string, 10);
        }
      }

      return 0;
    } catch (error: any) {
      if (error.message.includes('no such key')) {
        return 0;
      }
      throw error;
    }
  }

  /**
   * Generate idempotence key from phase, inputs, and version
   *
   * Spec: phase.txt:115-145
   */
  static generateKey(phase: string, inputs: Record<string, any>, version?: string): string {
    const data = {
      phase,
      inputs,
      version: version || '1',
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');

    return `${phase}:${hash.substring(0, 16)}`;
  }

  /**
   * Generate simple idempotence key from topic and message
   */
  private generateKey(topic: string, msg: Record<string, any>): string {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ topic, msg }))
      .digest('hex');

    return `${topic}:${hash.substring(0, 16)}`;
  }

  /**
   * Parse Redis stream message fields
   */
  private parseMessage(fields: string[]): QueueMessage {
    const obj: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      obj[fields[i]] = fields[i + 1];
    }

    return {
      key: obj.key,
      payload: JSON.parse(obj.payload),
      timestamp: parseInt(obj.timestamp, 10),
    };
  }

  /**
   * Claim pending messages (for crashed consumer recovery)
   */
  async claimPending(
    topic: string,
    consumerGroup: string,
    consumerName: string,
    minIdleTimeMs: number
  ): Promise<number> {
    try {
      // Get pending messages
      const pending = await this.redis.xpending(
        topic,
        consumerGroup,
        '-',
        '+',
        '100' // Max 100 messages
      );

      if (!pending || pending.length === 0) {
        return 0;
      }

      let claimed = 0;

      for (const entry of pending) {
        const [messageId, , idleTime] = entry;

        if (idleTime >= minIdleTimeMs) {
          // Claim message
          await this.redis.xclaim(
            topic,
            consumerGroup,
            consumerName,
            minIdleTimeMs.toString(),
            messageId
          );
          claimed++;
        }
      }

      if (claimed > 0) {
        logger.info({ topic, consumerGroup, claimed }, 'Claimed pending messages');
      }

      return claimed;
    } catch (error) {
      logger.error({ error, topic, consumerGroup }, 'Failed to claim pending messages');
      return 0;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    // Stop all consumers
    for (const loopKey of this.consumerLoops.keys()) {
      this.consumerLoops.set(loopKey, false);
    }

    // Wait for consumers to finish
    await new Promise((resolve) => setTimeout(resolve, 1000));

    logger.info('JobQueue shutdown complete');
  }
}
