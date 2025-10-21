import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'checkpoint-repository' });

/**
 * Checkpoint database record
 */
export interface CheckpointRecord {
  id: string;
  task_id: string;
  token: string;
  data: Record<string, any>;
  size_bytes?: number;
  created_at: Date;
}

/**
 * CheckpointRepository - Database operations for checkpoints
 * Spec: UNIFIED_IMPLEMENTATION_SPEC.md Section 3.2
 */
export class CheckpointRepository {
  constructor(private pool: Pool) {}

  /**
   * Save checkpoint (upsert - replaces existing checkpoint for task)
   */
  async save(
    taskId: string,
    token: string,
    data: Record<string, any>
  ): Promise<string> {
    try {
      const dataJson = JSON.stringify(data);
      const sizeBytes = Buffer.byteLength(dataJson, 'utf8');

      const result = await this.pool.query(
        `
        INSERT INTO checkpoints (task_id, token, data, size_bytes)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (task_id)
        DO UPDATE SET
          token = EXCLUDED.token,
          data = EXCLUDED.data,
          size_bytes = EXCLUDED.size_bytes,
          created_at = NOW()
        RETURNING id
        `,
        [taskId, token, data, sizeBytes]
      );

      const checkpointId = result.rows[0].id;

      logger.info(
        { checkpointId, taskId, token, sizeBytes },
        'Checkpoint saved'
      );

      return checkpointId;
    } catch (error) {
      logger.error({ error, taskId, token }, 'Failed to save checkpoint');
      throw error;
    }
  }

  /**
   * Load latest checkpoint for task
   */
  async load(taskId: string): Promise<CheckpointRecord | null> {
    try {
      const result = await this.pool.query(
        `
        SELECT id, task_id, token, data, size_bytes, created_at
        FROM checkpoints
        WHERE task_id = $1
        `,
        [taskId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const checkpoint = result.rows[0];

      logger.debug({ taskId, token: checkpoint.token }, 'Checkpoint loaded');

      return checkpoint;
    } catch (error) {
      logger.error({ error, taskId }, 'Failed to load checkpoint');
      throw error;
    }
  }

  /**
   * Delete checkpoint (cleanup after task completion)
   */
  async delete(taskId: string): Promise<void> {
    try {
      await this.pool.query(
        `
        DELETE FROM checkpoints
        WHERE task_id = $1
        `,
        [taskId]
      );

      logger.debug({ taskId }, 'Checkpoint deleted');
    } catch (error) {
      logger.error({ error, taskId }, 'Failed to delete checkpoint');
      throw error;
    }
  }

  /**
   * Get checkpoint statistics
   */
  async getStats(): Promise<{
    total: number;
    totalSizeBytes: number;
    avgSizeBytes: number;
  }> {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) as total,
          COALESCE(SUM(size_bytes), 0) as total_size_bytes,
          COALESCE(AVG(size_bytes), 0) as avg_size_bytes
        FROM checkpoints
      `);

      return {
        total: parseInt(result.rows[0].total, 10),
        totalSizeBytes: parseInt(result.rows[0].total_size_bytes, 10),
        avgSizeBytes: parseFloat(result.rows[0].avg_size_bytes),
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get checkpoint stats');
      throw error;
    }
  }

  /**
   * Clean up old checkpoints (for completed tasks)
   */
  async cleanup(daysToKeep: number = 7): Promise<number> {
    try {
      const result = await this.pool.query(
        `
        DELETE FROM checkpoints
        WHERE created_at < NOW() - ($1 || ' days')::INTERVAL
        AND task_id NOT IN (
          SELECT id FROM tasks WHERE status IN ('running', 'pending')
        )
        `,
        [daysToKeep]
      );

      const deletedCount = result.rowCount || 0;

      if (deletedCount > 0) {
        logger.info({ deletedCount, daysToKeep }, 'Checkpoints cleaned up');
      }

      return deletedCount;
    } catch (error) {
      logger.error({ error, daysToKeep }, 'Failed to cleanup checkpoints');
      throw error;
    }
  }
}
