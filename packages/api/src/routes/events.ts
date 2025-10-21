import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { EventLedger } from '@ideamine/orchestrator-core/ledger';
import { BadRequestError, NotFoundError } from '../middleware/error-handler';

const router = Router();

/**
 * GET /api/events
 * Query events with optional filtering
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (req as any).db as Pool;
    const {
      runId,
      phase,
      eventType,
      limit = 100,
      offset = 0,
    } = req.query;

    const ledger = new EventLedger(db);

    const events = await ledger.query({
      runId: runId as string | undefined,
      phase: phase as string | undefined,
      eventType: eventType as string | undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.json({
      events,
      pagination: {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        total: events.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/events/runs/:runId
 * Get full event timeline for a run
 */
router.get('/runs/:runId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (req as any).db as Pool;
    const { runId } = req.params;

    const ledger = new EventLedger(db);
    const timeline = await ledger.getRunTimeline(runId);

    res.json({
      runId,
      events: timeline,
      total: timeline.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/events/runs/:runId/phases/:phase
 * Get events for a specific phase in a run
 */
router.get('/runs/:runId/phases/:phase', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (req as any).db as Pool;
    const { runId, phase } = req.params;

    const ledger = new EventLedger(db);
    const events = await ledger.getPhaseEvents(runId, phase);

    res.json({
      runId,
      phase,
      events,
      total: events.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/events/runs/:runId/stats
 * Get event statistics for a run
 */
router.get('/runs/:runId/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (req as any).db as Pool;
    const { runId } = req.params;

    const ledger = new EventLedger(db);
    const stats = await ledger.getStats(runId);

    res.json({
      runId,
      stats,
    });
  } catch (error) {
    next(error);
  }
});

export { router as eventsRouter };
