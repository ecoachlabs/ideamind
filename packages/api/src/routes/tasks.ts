/**
 * Internal API - Tasks
 *
 * Spec: orchestrator.txt:102-106, phase.txt:137-141
 * Endpoint: POST /tasks {taskSpec}
 *
 * Purpose: Queue a task for execution by worker pool
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

export function createTasksRouter(dbPool: Pool): Router {
  const router = Router();

  /**
   * POST /tasks
   * Queue a task for execution
   *
   * Body: TaskSpec {
   *   id: string,
   *   phase: string,
   *   type: string,
   *   target: string,
   *   input: any,
   *   budget: { tokens, tools_minutes },
   *   timebox: string (ISO8601 duration)
   * }
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const taskSpec = req.body;

      // Validate required fields
      if (!taskSpec.id || !taskSpec.phase || !taskSpec.type) {
        return res.status(400).json({
          error: 'Missing required fields: id, phase, type',
        });
      }

      console.log(`[TasksAPI] Queueing task ${taskSpec.id} for phase ${taskSpec.phase}`);

      // Generate idempotence key
      const { generateIdempotenceKey } = await import(
        '@ideamine/orchestrator-core/utils/idempotence'
      );
      const idempotenceKey = generateIdempotenceKey(taskSpec.phase, taskSpec.input, '1.0.0');

      // Enqueue task to job queue (Redis Streams)
      const { RedisQueue } = await import('@ideamine/orchestrator-core/queue');
      const queue = new RedisQueue();

      await queue.enqueue('tasks', taskSpec, idempotenceKey);

      // Insert task record into database
      const result = await dbPool.query(
        `
        INSERT INTO tasks (
          task_id, run_id, phase, type, target, input, status,
          budget_tokens, budget_tools_minutes, timebox,
          created_at, idempotence_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)
        RETURNING *
      `,
        [
          taskSpec.id,
          taskSpec.run_id || null,
          taskSpec.phase,
          taskSpec.type,
          taskSpec.target,
          JSON.stringify(taskSpec.input || {}),
          'pending',
          taskSpec.budget?.tokens || null,
          taskSpec.budget?.tools_minutes || null,
          taskSpec.timebox || null,
          idempotenceKey,
        ]
      );

      console.log(`[TasksAPI] Task ${taskSpec.id} queued successfully`);

      res.status(201).json({
        task: result.rows[0],
        idempotence_key: idempotenceKey,
        status: 'queued',
      });
    } catch (error: any) {
      console.error('[TasksAPI] Failed to queue task:', error);
      res.status(500).json({
        error: 'Failed to queue task',
        message: error.message,
      });
    }
  });

  /**
   * GET /tasks/:taskId
   * Get task status
   */
  router.get('/:taskId', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;

      const result = await dbPool.query(`SELECT * FROM tasks WHERE task_id = $1`, [taskId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Task not found',
        });
      }

      res.json({
        task: result.rows[0],
      });
    } catch (error: any) {
      console.error('[TasksAPI] Failed to get task:', error);
      res.status(500).json({
        error: 'Failed to get task',
        message: error.message,
      });
    }
  });

  return router;
}
