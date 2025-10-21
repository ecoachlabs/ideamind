import os from 'os';
import { Pool } from 'pg';
import pino from 'pino';
import { Worker, ExecutorRegistry } from './worker';
import { JobQueue } from '../queue/queue';
import { QueueMessage } from '../queue/types';

const logger = pino({ name: 'worker-pool' });

/**
 * WorkerPool configuration
 */
export interface WorkerPoolConfig {
  concurrency?: number;
  consumerGroup?: string;
  autoScale?: boolean;
  minWorkers?: number;
  maxWorkers?: number;
}

/**
 * WorkerPool - Manages multiple workers consuming from job queue
 *
 * Features:
 * - Spawn N workers consuming from queue
 * - Dynamic scaling (add/remove workers)
 * - Graceful shutdown
 * - Worker health monitoring
 *
 * Spec: UNIFIED_IMPLEMENTATION_SPEC.md Section 3.3
 */
export class WorkerPool {
  private workers: Worker[] = [];
  private queue: JobQueue;
  private config: WorkerPoolConfig;
  private pool: Pool;
  private executorRegistry: ExecutorRegistry;
  private isRunning = false;
  private consumerGroup: string;

  constructor(
    pool: Pool,
    queue: JobQueue,
    executorRegistry: ExecutorRegistry,
    config: WorkerPoolConfig = {}
  ) {
    this.pool = pool;
    this.queue = queue;
    this.executorRegistry = executorRegistry;

    // Default concurrency: min(CPU_COUNT, 4)
    const defaultConcurrency = Math.min(os.cpus().length, 4);

    this.config = {
      concurrency: config.concurrency || defaultConcurrency,
      consumerGroup: config.consumerGroup || 'phase-workers',
      autoScale: config.autoScale || false,
      minWorkers: config.minWorkers || 1,
      maxWorkers: config.maxWorkers || 10,
      ...config,
    };

    this.consumerGroup = this.config.consumerGroup!;
  }

  /**
   * Start worker pool
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('WorkerPool already running');
      return;
    }

    this.isRunning = true;

    logger.info(
      {
        concurrency: this.config.concurrency,
        consumerGroup: this.consumerGroup,
      },
      'Starting WorkerPool'
    );

    // Initialize queue
    await this.queue.init();

    // Spawn initial workers
    await this.scale(this.config.concurrency!);

    logger.info(
      { workerCount: this.workers.length },
      'WorkerPool started successfully'
    );
  }

  /**
   * Stop worker pool (graceful shutdown)
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('WorkerPool not running');
      return;
    }

    logger.info('Stopping WorkerPool');

    this.isRunning = false;

    // Stop all consumers
    for (const worker of this.workers) {
      const workerId = worker.getWorkerId();
      this.queue.stopConsumer('tasks', this.consumerGroup, workerId);
    }

    // Wait for workers to finish current tasks
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Shutdown workers
    await Promise.all(this.workers.map((w) => w.shutdown()));

    // Shutdown queue
    await this.queue.shutdown();

    this.workers = [];

    logger.info('WorkerPool stopped');
  }

  /**
   * Scale worker pool to target size
   *
   * @param targetSize - Target number of workers
   */
  async scale(targetSize: number): Promise<void> {
    const currentSize = this.workers.length;

    if (targetSize === currentSize) {
      return;
    }

    if (targetSize > currentSize) {
      // Scale up: Add workers
      const toAdd = targetSize - currentSize;

      logger.info({ currentSize, targetSize, toAdd }, 'Scaling up WorkerPool');

      for (let i = 0; i < toAdd; i++) {
        await this.addWorker();
      }
    } else {
      // Scale down: Remove workers
      const toRemove = currentSize - targetSize;

      logger.info({ currentSize, targetSize, toRemove }, 'Scaling down WorkerPool');

      for (let i = 0; i < toRemove; i++) {
        await this.removeWorker();
      }
    }

    logger.info(
      { workerCount: this.workers.length },
      'WorkerPool scaled successfully'
    );
  }

  /**
   * Add worker to pool
   */
  private async addWorker(): Promise<void> {
    // Create worker
    const worker = new Worker(this.pool, this.executorRegistry);
    await worker.init();

    const workerId = worker.getWorkerId();

    // Start consuming
    this.startConsumer(worker, workerId);

    this.workers.push(worker);

    logger.info({ workerId, workerCount: this.workers.length }, 'Worker added');
  }

  /**
   * Remove worker from pool
   */
  private async removeWorker(): Promise<void> {
    if (this.workers.length === 0) {
      return;
    }

    const worker = this.workers.pop()!;
    const workerId = worker.getWorkerId();

    // Stop consumer
    this.queue.stopConsumer('tasks', this.consumerGroup, workerId);

    // Shutdown worker
    await worker.shutdown();

    logger.info({ workerId, workerCount: this.workers.length }, 'Worker removed');
  }

  /**
   * Start consumer for worker
   */
  private startConsumer(worker: Worker, workerId: string): void {
    // Consumer runs in background (non-blocking)
    this.queue
      .consume('tasks', this.consumerGroup, workerId, async (message: QueueMessage) => {
        try {
          const task = message.payload;

          logger.debug({ workerId, taskId: task.id }, 'Worker processing task');

          // Execute task
          await worker.runTask(task);
        } catch (error) {
          logger.error({ error, workerId, message }, 'Worker task execution failed');
        }
      })
      .catch((error) => {
        logger.error({ error, workerId }, 'Consumer loop crashed');

        // TODO: Restart consumer or remove worker
      });

    logger.debug({ workerId }, 'Consumer started for worker');
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    workerCount: number;
    isRunning: boolean;
    config: WorkerPoolConfig;
  } {
    return {
      workerCount: this.workers.length,
      isRunning: this.isRunning,
      config: this.config,
    };
  }

  /**
   * Get queue depth (for adaptive scaling)
   */
  async getQueueDepth(): Promise<number> {
    return this.queue.getQueueDepth('tasks');
  }

  /**
   * Auto-scale based on queue depth
   *
   * Simple algorithm:
   * - If queue depth > workers * 5: scale up
   * - If queue depth < workers * 2: scale down
   */
  async autoScale(): Promise<void> {
    if (!this.config.autoScale) {
      return;
    }

    const queueDepth = await this.getQueueDepth();
    const currentWorkers = this.workers.length;

    // Scale up if queue is deep
    if (queueDepth > currentWorkers * 5 && currentWorkers < this.config.maxWorkers!) {
      const targetSize = Math.min(
        currentWorkers + 1,
        this.config.maxWorkers!
      );

      logger.info(
        { queueDepth, currentWorkers, targetSize },
        'Auto-scaling up'
      );

      await this.scale(targetSize);
    }

    // Scale down if queue is shallow
    if (queueDepth < currentWorkers * 2 && currentWorkers > this.config.minWorkers!) {
      const targetSize = Math.max(
        currentWorkers - 1,
        this.config.minWorkers!
      );

      logger.info(
        { queueDepth, currentWorkers, targetSize },
        'Auto-scaling down'
      );

      await this.scale(targetSize);
    }
  }
}
