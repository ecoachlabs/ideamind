/**
 * Internal API - Refinery
 *
 * Spec: orchestrator.txt:102-106, phase.txt:137-141
 * Endpoint: POST /refinery/ingest {q,a,v,phase}
 *
 * Purpose: Ingest Q/A/V bundle into Knowledge Refinery
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { EventEmitter } from 'events';

export function createRefineryRouter(dbPool: Pool, eventBus: EventEmitter): Router {
  const router = Router();

  /**
   * POST /refinery/ingest
   * Ingest Q/A/V bundle into Knowledge Refinery
   *
   * Body: {
   *   run_id: string,
   *   phase: string,
   *   questions: any[],
   *   answers: any[],
   *   validations: any[]
   * }
   */
  router.post('/ingest', async (req: Request, res: Response) => {
    try {
      const { run_id, phase, questions, answers, validations } = req.body;

      // Validate required fields
      if (!run_id || !phase || !questions || !answers || !validations) {
        return res.status(400).json({
          error: 'Missing required fields: run_id, phase, questions, answers, validations',
        });
      }

      console.log(
        `[RefineryAPI] Ingesting Q/A/V bundle: ${questions.length} questions, ${answers.length} answers`
      );

      // Process Q/A/V bundle through Refinery
      const { RefineryAdapter } = await import(
        '@ideamine/orchestrator-core/base/refinery-adapter'
      );

      const adapter = new RefineryAdapter({
        dbPool,
        eventEmitter: eventBus,
      });

      const result = await adapter.processQAVBundle({
        questions,
        answers,
        validations,
        phase,
        run_id,
      });

      console.log(
        `[RefineryAPI] Q/A/V processing complete: ${result.metrics.frames_created} frames, ${result.metrics.assumptions_created} assumptions`
      );

      res.json({
        result: {
          kmap_refs: result.kmap_refs,
          assumptions: result.assumptions,
          metrics: result.metrics,
        },
      });
    } catch (error: any) {
      console.error('[RefineryAPI] Q/A/V ingestion failed:', error);
      res.status(500).json({
        error: 'Q/A/V ingestion failed',
        message: error.message,
      });
    }
  });

  /**
   * GET /refinery/stats
   * Get Knowledge Refinery statistics
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const result = await dbPool.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE frame_type = 'factual') as factual_frames,
          COUNT(*) FILTER (WHERE frame_type = 'procedural') as procedural_frames,
          COUNT(*) FILTER (WHERE frame_type = 'constraint') as constraint_frames,
          COUNT(*) FILTER (WHERE frame_type = 'assumption') as assumption_frames,
          AVG(confidence) as avg_confidence
        FROM knowledge_frames
      `
      );

      const assumptionsResult = await dbPool.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') as active_assumptions,
          COUNT(*) FILTER (WHERE status = 'validated') as validated_assumptions,
          COUNT(*) FILTER (WHERE status = 'invalidated') as invalidated_assumptions
        FROM assumptions
      `
      );

      res.json({
        knowledge_frames: result.rows[0],
        assumptions: assumptionsResult.rows[0],
      });
    } catch (error: any) {
      console.error('[RefineryAPI] Failed to get stats:', error);
      res.status(500).json({
        error: 'Failed to get stats',
        message: error.message,
      });
    }
  });

  return router;
}
