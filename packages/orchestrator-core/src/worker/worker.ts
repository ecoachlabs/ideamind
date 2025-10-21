import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';
import Redis from 'ioredis';
import pino from 'pino';
import { CheckpointManager } from '../checkpoint/checkpoint-manager';
import { TaskRepository, TaskStatus } from '../database/task-repository';
import { TaskSpec } from '../queue/types';
import RedisConnection from '../queue/redis-connection';

const logger = pino({ name: 'worker' });

/**
 * Task execution result
 */
export interface TaskResult {
  ok: boolean;
  result?: any;
  error?: string;
  ms: number;
  tokensUsed?: number;
  costUsd?: number;
}

/**
 * Agent/Tool executor registry
 */
export interface ExecutorRegistry {
  executeAgent(target: string, input: any): Promise<any>;
  executeTool(target: string, input: any): Promise<any>;
}

/**
 * Worker - Executes tasks with heartbeats and checkpoints
 *
 * Features:
 * - Load checkpoint if exists (resume from failure)
 * - Emit heartbeat every 60 seconds
 * - Save checkpoints during execution
 * - Execute agents or tools
 * - Report results with metrics
 *
 * Spec: UNIFIED_IMPLEMENTATION_SPEC.md Section 3.3
 */
export class Worker {
  private workerId: string;
  private checkpointManager: CheckpointManager;
  private taskRepository: TaskRepository;
  private redis: Redis;
  private executorRegistry: ExecutorRegistry;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(
    pool: Pool,
    executorRegistry: ExecutorRegistry,
    workerId?: string
  ) {
    this.workerId = workerId || `worker-${uuidv4().substring(0, 8)}`;
    this.checkpointManager = new CheckpointManager(pool);
    this.taskRepository = new TaskRepository(pool);
    this.executorRegistry = executorRegistry;
    this.redis = null as any; // Will be set in init()
  }

  /**
   * Initialize worker (connect to Redis)
   */
  async init(): Promise<void> {
    this.redis = await RedisConnection.getConnection();
    logger.info({ workerId: this.workerId }, 'Worker initialized');
  }

  /**
   * Execute task with heartbeats and checkpoints
   *
   * @param task - Task specification
   * @returns Task result
   */
  async runTask(task: TaskSpec): Promise<TaskResult> {
    const startTime = Date.now();
    const taskId = task.id;

    try {
      logger.info(
        { workerId: this.workerId, taskId, type: task.type, target: task.target },
        'Starting task execution'
      );

      // Update task status to RUNNING
      await this.taskRepository.updateStatus(taskId, TaskStatus.RUNNING, this.workerId);

      // Step 1: Load checkpoint if exists
      const checkpoint = await this.checkpointManager.loadCheckpoint(taskId);

      // Step 2: Build execution context
      const ctx = {
        ...task.input,
        checkpoint: checkpoint?.token,
        checkpointData: checkpoint?.data,
      };

      // Step 3: Start heartbeat interval (every 60 seconds)
      this.startHeartbeat(taskId);

      // Step 4: Execute agent or tool with checkpoint callback
      let result: any;
      let tokensUsed = 0;
      let costUsd = 0;

      try {
        if (task.type === 'agent') {
          result = await this.executeAgent(taskId, task.target, ctx);
        } else {
          result = await this.executeTool(taskId, task.target, ctx);
        }

        // Extract metrics if available
        if (result && typeof result === 'object') {
          tokensUsed = result.tokensUsed || 0;
          costUsd = result.costUsd || 0;
        }
      } finally {
        // Step 5: Stop heartbeat
        this.stopHeartbeat();
      }

      // Step 6: Calculate duration
      const durationMs = Date.now() - startTime;

      // Step 7: Complete task in database
      await this.taskRepository.complete(taskId, result, {
        duration_ms: durationMs,
        tokens_used: tokensUsed,
        cost_usd: costUsd,
      });

      // Step 8: Clean up checkpoint
      await this.checkpointManager.deleteCheckpoint(taskId);

      logger.info(
        {
          workerId: this.workerId,
          taskId,
          durationMs,
          tokensUsed,
          costUsd,
        },
        'Task completed successfully'
      );

      return {
        ok: true,
        result,
        ms: durationMs,
        tokensUsed,
        costUsd,
      };
    } catch (error) {
      // Stop heartbeat on error
      this.stopHeartbeat();

      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        { error, workerId: this.workerId, taskId, durationMs },
        'Task execution failed'
      );

      // Mark task as failed
      await this.taskRepository.fail(taskId, errorMessage, task.retries || 0);

      return {
        ok: false,
        error: errorMessage,
        ms: durationMs,
      };
    }
  }

  /**
   * Execute agent with checkpoint support
   */
  private async executeAgent(taskId: string, target: string, ctx: any): Promise<any> {
    logger.debug({ taskId, target }, 'Executing agent');

    // Create checkpoint callback
    const checkpointCallback = this.checkpointManager.createCheckpointCallback(taskId);

    // Inject checkpoint callback into context (agent will use it)
    ctx._checkpointCallback = checkpointCallback;

    // Execute agent via registry
    const result = await this.executorRegistry.executeAgent(target, ctx);

    return result;
  }

  /**
   * Execute tool
   */
  private async executeTool(taskId: string, target: string, ctx: any): Promise<any> {
    logger.debug({ taskId, target }, 'Executing tool');

    // Tools don't need checkpoint callbacks (they're atomic)
    const result = await this.executorRegistry.executeTool(target, ctx);

    return result;
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(taskId: string): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.emitHeartbeat(taskId);
      } catch (error) {
        logger.error({ error, taskId, workerId: this.workerId }, 'Heartbeat failed');
      }
    }, 60000); // Every 60 seconds

    logger.debug({ taskId, workerId: this.workerId }, 'Heartbeat started');
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.debug({ workerId: this.workerId }, 'Heartbeat stopped');
    }
  }

  /**
   * Emit heartbeat (update DB + Redis)
   */
  private async emitHeartbeat(taskId: string): Promise<void> {
    // Update database
    await this.taskRepository.updateHeartbeat(taskId);

    // Store in Redis with 5-minute TTL (for fast queries)
    await this.redis.setex(
      `heartbeat:${taskId}`,
      300, // 5 minutes
      JSON.stringify({
        workerId: this.workerId,
        timestamp: Date.now(),
      })
    );

    logger.debug({ taskId, workerId: this.workerId }, 'Heartbeat emitted');
  }

  /**
   * Get worker ID
   */
  getWorkerId(): string {
    return this.workerId;
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.stopHeartbeat();
    logger.info({ workerId: this.workerId }, 'Worker shutdown complete');
  }
}
