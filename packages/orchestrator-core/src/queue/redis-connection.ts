import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'redis-connection' });

/**
 * Redis connection singleton for queue, heartbeats, and caching
 * Supports both single instance and cluster modes
 */
class RedisConnection {
  private static instance: Redis | null = null;
  private static isConnecting = false;

  /**
   * Get or create Redis connection
   */
  static async getConnection(): Promise<Redis> {
    if (this.instance && this.instance.status === 'ready') {
      return this.instance;
    }

    if (this.isConnecting) {
      // Wait for existing connection attempt
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.getConnection();
    }

    this.isConnecting = true;

    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

      logger.info({ redisUrl }, 'Connecting to Redis');

      this.instance = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy(times: number) {
          const delay = Math.min(times * 50, 2000);
          logger.warn({ times, delay }, 'Redis connection retry');
          return delay;
        },
        reconnectOnError(err: Error) {
          const targetError = 'READONLY';
          if (err.message.includes(targetError)) {
            // Reconnect on READONLY errors (Redis cluster failover)
            return true;
          }
          return false;
        },
      });

      this.instance.on('connect', () => {
        logger.info('Redis connected');
      });

      this.instance.on('error', (err: Error) => {
        logger.error({ err }, 'Redis connection error');
      });

      this.instance.on('close', () => {
        logger.warn('Redis connection closed');
      });

      // Wait for ready state
      await new Promise<void>((resolve, reject) => {
        if (this.instance!.status === 'ready') {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          reject(new Error('Redis connection timeout'));
        }, 5000);

        this.instance!.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.instance!.once('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      logger.info('Redis connection ready');
      return this.instance;
    } catch (error) {
      logger.error({ error }, 'Failed to connect to Redis');
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Close Redis connection (for graceful shutdown)
   */
  static async close(): Promise<void> {
    if (this.instance) {
      logger.info('Closing Redis connection');
      await this.instance.quit();
      this.instance = null;
    }
  }

  /**
   * Health check
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const redis = await this.getConnection();
      const result = await redis.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error({ error }, 'Redis health check failed');
      return false;
    }
  }
}

export default RedisConnection;
