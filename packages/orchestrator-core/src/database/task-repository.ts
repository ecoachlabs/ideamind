import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'task-repository' });

/**
 * Task status enum
 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Task database record
 */
export interface TaskRecord {
  id: string;
  phase_id: string;
  run_id: string;
  type: 'agent' | 'tool';
  target: string;
  input: Record<string, any>;
  status: TaskStatus;
  retries: number;
  result?: Record<string, any>;
  error?: string;
  cost_usd?: number;
  tokens_used?: number;
  duration_ms?: number;
  worker_id?: string;
  last_heartbeat_at?: Date;
  idempotence_key?: string;
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
}

/**
 * TaskRepository - Database operations for tasks
 */
export class TaskRepository {
  constructor(private pool: Pool) {}

  /**
   * Create new task
   */
  async create(task: {
    phase_id: string;
    run_id: string;
    type: 'agent' | 'tool';
    target: string;
    input: Record<string, any>;
    idempotence_key?: string;
  }): Promise<string> {
    try {
      const result = await this.pool.query(
        `
        INSERT INTO tasks (phase_id, run_id, type, target, input, idempotence_key, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        `,
        [
          task.phase_id,
          task.run_id,
          task.type,
          task.target,
          task.input,
          task.idempotence_key,
          TaskStatus.PENDING,
        ]
      );

      const taskId = result.rows[0].id;

      logger.info({ taskId, type: task.type, target: task.target }, 'Task created');

      return taskId;
    } catch (error) {
      logger.error({ error, task }, 'Failed to create task');
      throw error;
    }
  }

  /**
   * Get task by ID
   */
  async getById(taskId: string): Promise<TaskRecord | null> {
    try {
      const result = await this.pool.query(
        `
        SELECT * FROM tasks WHERE id = $1
        `,
        [taskId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as TaskRecord;
    } catch (error) {
      logger.error({ error, taskId }, 'Failed to get task');
      throw error;
    }
  }

  /**
   * Update task status
   */
  async updateStatus(
    taskId: string,
    status: TaskStatus,
    workerId?: string
  ): Promise<void> {
    try {
      const updates: string[] = ['status = $2'];
      const values: any[] = [taskId, status];
      let paramCount = 2;

      if (status === TaskStatus.RUNNING && workerId) {
        paramCount++;
        updates.push(`worker_id = $${paramCount}`);
        values.push(workerId);

        paramCount++;
        updates.push(`started_at = $${paramCount}`);
        values.push(new Date());
      }

      if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
        paramCount++;
        updates.push(`completed_at = $${paramCount}`);
        values.push(new Date());
      }

      await this.pool.query(
        `
        UPDATE tasks
        SET ${updates.join(', ')}
        WHERE id = $1
        `,
        values
      );

      logger.debug({ taskId, status, workerId }, 'Task status updated');
    } catch (error) {
      logger.error({ error, taskId, status }, 'Failed to update task status');
      throw error;
    }
  }

  /**
   * Update heartbeat timestamp
   */
  async updateHeartbeat(taskId: string): Promise<void> {
    try {
      await this.pool.query(
        `
        UPDATE tasks
        SET last_heartbeat_at = NOW()
        WHERE id = $1
        `,
        [taskId]
      );

      logger.debug({ taskId }, 'Heartbeat updated');
    } catch (error) {
      logger.error({ error, taskId }, 'Failed to update heartbeat');
      throw error;
    }
  }

  /**
   * Complete task with result
   */
  async complete(
    taskId: string,
    result: Record<string, any>,
    metrics: {
      cost_usd?: number;
      tokens_used?: number;
      duration_ms: number;
    }
  ): Promise<void> {
    try {
      await this.pool.query(
        `
        UPDATE tasks
        SET
          status = $2,
          result = $3,
          cost_usd = $4,
          tokens_used = $5,
          duration_ms = $6,
          completed_at = NOW()
        WHERE id = $1
        `,
        [
          taskId,
          TaskStatus.COMPLETED,
          result,
          metrics.cost_usd || 0,
          metrics.tokens_used || 0,
          metrics.duration_ms,
        ]
      );

      logger.info({ taskId, duration_ms: metrics.duration_ms }, 'Task completed');
    } catch (error) {
      logger.error({ error, taskId }, 'Failed to complete task');
      throw error;
    }
  }

  /**
   * Fail task with error
   */
  async fail(taskId: string, error: string, retries: number): Promise<void> {
    try {
      await this.pool.query(
        `
        UPDATE tasks
        SET
          status = $2,
          error = $3,
          retries = $4,
          completed_at = NOW()
        WHERE id = $1
        `,
        [taskId, TaskStatus.FAILED, error, retries]
      );

      logger.error({ taskId, error, retries }, 'Task failed');
    } catch (error) {
      logger.error({ error, taskId }, 'Failed to mark task as failed');
      throw error;
    }
  }

  /**
   * Get tasks by phase
   */
  async getByPhase(phaseId: string, status?: TaskStatus): Promise<TaskRecord[]> {
    try {
      const query = status
        ? 'SELECT * FROM tasks WHERE phase_id = $1 AND status = $2 ORDER BY created_at ASC'
        : 'SELECT * FROM tasks WHERE phase_id = $1 ORDER BY created_at ASC';

      const params = status ? [phaseId, status] : [phaseId];

      const result = await this.pool.query(query, params);

      return result.rows as TaskRecord[];
    } catch (error) {
      logger.error({ error, phaseId, status }, 'Failed to get tasks by phase');
      throw error;
    }
  }

  /**
   * Get stalled tasks (no heartbeat for N seconds)
   */
  async getStalledTasks(secondsSinceHeartbeat: number): Promise<TaskRecord[]> {
    try {
      const result = await this.pool.query(
        `
        SELECT * FROM tasks
        WHERE status = $1
        AND last_heartbeat_at < NOW() - ($2 || ' seconds')::INTERVAL
        ORDER BY last_heartbeat_at ASC
        `,
        [TaskStatus.RUNNING, secondsSinceHeartbeat]
      );

      return result.rows as TaskRecord[];
    } catch (error) {
      logger.error({ error, secondsSinceHeartbeat }, 'Failed to get stalled tasks');
      throw error;
    }
  }

  /**
   * Get task statistics by phase
   */
  async getStatsByPhase(phaseId: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    running: number;
    avgDurationMs: number;
    totalCost: number;
    totalTokens: number;
  }> {
    try {
      const result = await this.pool.query(
        `
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) FILTER (WHERE status = 'running') as running,
          COALESCE(AVG(duration_ms) FILTER (WHERE status = 'completed'), 0) as avg_duration_ms,
          COALESCE(SUM(cost_usd), 0) as total_cost,
          COALESCE(SUM(tokens_used), 0) as total_tokens
        FROM tasks
        WHERE phase_id = $1
        `,
        [phaseId]
      );

      const row = result.rows[0];

      return {
        total: parseInt(row.total, 10),
        completed: parseInt(row.completed, 10),
        failed: parseInt(row.failed, 10),
        running: parseInt(row.running, 10),
        avgDurationMs: parseFloat(row.avg_duration_ms),
        totalCost: parseFloat(row.total_cost),
        totalTokens: parseInt(row.total_tokens, 10),
      };
    } catch (error) {
      logger.error({ error, phaseId }, 'Failed to get task stats');
      throw error;
    }
  }
}
