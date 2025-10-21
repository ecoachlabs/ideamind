/**
 * Internal API - Heartbeat
 *
 * Spec: orchestrator.txt:102-106, phase.txt:137-141
 * Endpoint: POST /heartbeat {task_id, pct, eta, metrics}
 *
 * Purpose: Workers emit heartbeats to signal task progress
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { EventEmitter } from 'events';

export function createHeartbeatRouter(dbPool: Pool, eventBus: EventEmitter): Router {
  const router = Router();

  /**
   * POST /heartbeat
   * Worker emits heartbeat for a task
   *
   * Body: {
   *   task_id: string,
   *   run_id: string,
   *   phase: string,
   *   pct: number (0-100),
   *   eta: string (ISO8601 timestamp),
   *   metrics?: any
   * }
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { task_id, run_id, phase, pct, eta, metrics } = req.body;

      // Validate required fields
      if (!task_id || !run_id || !phase || pct === undefined) {
        return res.status(400).json({
          error: 'Missing required fields: task_id, run_id, phase, pct',
        });
      }

      console.log(`[HeartbeatAPI] Heartbeat received: task=${task_id}, pct=${pct}%, eta=${eta}`);

      // Update task heartbeat timestamp
      await dbPool.query(
        `
        UPDATE tasks SET
          last_heartbeat_at = NOW(),
          progress_pct = $1,
          eta = $2,
          updated_at = NOW()
        WHERE task_id = $3
      `,
        [pct, eta, task_id]
      );

      // Insert heartbeat record
      await dbPool.query(
        `
        INSERT INTO heartbeats (
          id, task_id, run_id, phase, progress_pct, eta,
          metrics, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `,
        [
          `hb-${task_id}-${Date.now()}`,
          task_id,
          run_id,
          phase,
          pct,
          eta,
          JSON.stringify(metrics || {}),
        ]
      );

      // Emit heartbeat event for monitoring
      eventBus.emit('task.heartbeat', {
        task_id,
        run_id,
        phase,
        pct,
        eta,
        metrics,
        timestamp: new Date().toISOString(),
      });

      res.json({
        status: 'ok',
        task_id,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[HeartbeatAPI] Heartbeat processing failed:', error);
      res.status(500).json({
        error: 'Heartbeat processing failed',
        message: error.message,
      });
    }
  });

  /**
   * GET /heartbeat/status/:taskId
   * Get last heartbeat for a task
   */
  router.get('/status/:taskId', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;

      const result = await dbPool.query(
        `
        SELECT * FROM heartbeats
        WHERE task_id = $1
        ORDER BY timestamp DESC
        LIMIT 1
      `,
        [taskId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'No heartbeat found for task',
        });
      }

      res.json({
        heartbeat: result.rows[0],
      });
    } catch (error: any) {
      console.error('[HeartbeatAPI] Failed to get heartbeat:', error);
      res.status(500).json({
        error: 'Failed to get heartbeat',
        message: error.message,
      });
    }
  });

  /**
   * GET /heartbeat/stalled
   * Get tasks with stalled heartbeats (missed 3+ heartbeats)
   */
  router.get('/stalled', async (req: Request, res: Response) => {
    try {
      const heartbeatInterval = 60; // seconds
      const stallThreshold = 3;
      const stallTimeout = heartbeatInterval * stallThreshold;

      const result = await dbPool.query(
        `
        SELECT t.task_id, t.run_id, t.phase, t.last_heartbeat_at,
               EXTRACT(EPOCH FROM (NOW() - t.last_heartbeat_at)) as seconds_since_heartbeat
        FROM tasks t
        WHERE t.status = 'running'
          AND t.last_heartbeat_at IS NOT NULL
          AND t.last_heartbeat_at < NOW() - INTERVAL '${stallTimeout} seconds'
        ORDER BY t.last_heartbeat_at ASC
      `
      );

      console.log(`[HeartbeatAPI] Found ${result.rows.length} stalled tasks`);

      res.json({
        stalled_tasks: result.rows,
        stall_threshold_seconds: stallTimeout,
      });
    } catch (error: any) {
      console.error('[HeartbeatAPI] Failed to get stalled tasks:', error);
      res.status(500).json({
        error: 'Failed to get stalled tasks',
        message: error.message,
      });
    }
  });

  return router;
}
