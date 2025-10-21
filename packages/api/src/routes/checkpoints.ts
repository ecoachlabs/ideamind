import { Router, Response, NextFunction } from 'express';
import { CheckpointManager } from '@ideamine/orchestrator-core/checkpoint';
import { BadRequestError, NotFoundError } from '../middleware/error-handler';
import { IdeaMineRequest } from '../types/express';

const router = Router();

/**
 * GET /api/checkpoints/runs/:runId
 * Get all checkpoints for a run
 */
router.get('/runs/:runId', async (req: IdeaMineRequest, res: Response, next: NextFunction) => {
  try {
    const { db } = req;
    const { runId } = req.params;
    const { phase } = req.query;

    const checkpointManager = new CheckpointManager(db);

    // Get latest checkpoint
    const checkpoint = await checkpointManager.getLatestCheckpoint(
      runId,
      phase as string | undefined
    );

    if (!checkpoint) {
      return res.json({
        runId,
        phase,
        checkpoint: null,
      });
    }

    res.json({
      runId,
      phase,
      checkpoint,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/checkpoints/:checkpointId
 * Get checkpoint details
 */
router.get('/:checkpointId', async (req: IdeaMineRequest, res: Response, next: NextFunction) => {
  try {
    const { db } = req;
    const { checkpointId } = req.params;

    const checkpointManager = new CheckpointManager(db);
    const checkpoint = await checkpointManager.getCheckpoint(checkpointId);

    if (!checkpoint) {
      throw new NotFoundError(`Checkpoint ${checkpointId} not found`);
    }

    res.json(checkpoint);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/checkpoints/:checkpointId/resume
 * Resume from a checkpoint
 */
router.post('/:checkpointId/resume', async (req: IdeaMineRequest, res: Response, next: NextFunction) => {
  try {
    const { db } = req;
    const { checkpointId } = req.params;

    const checkpointManager = new CheckpointManager(db);
    const checkpoint = await checkpointManager.resumeFromCheckpoint(checkpointId);

    res.json({
      checkpointId,
      status: 'resumed',
      checkpoint,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/checkpoints/cleanup
 * Cleanup expired checkpoints
 */
router.delete('/cleanup', async (req: IdeaMineRequest, res: Response, next: NextFunction) => {
  try {
    const { db } = req;

    const checkpointManager = new CheckpointManager(db);
    const deleted = await checkpointManager.cleanupExpired();

    res.json({
      deleted,
      message: `Deleted ${deleted} expired checkpoints`,
    });
  } catch (error) {
    next(error);
  }
});

export { router as checkpointsRouter };
