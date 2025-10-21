import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { RunManager } from '@ideamine/orchestrator-core/run';
import { PhaseCoordinator } from '@ideamine/orchestrator-core/phase';
import { BudgetTracker } from '@ideamine/orchestrator-core/budget';
import { Unsticker } from '@ideamine/orchestrator-core/unsticker';
import { DAGExecutor } from '@ideamine/orchestrator-core/dag';
import { QAVCoordinator } from '@ideamine/orchestrator-core/qav';
import { ClarificationLoop } from '@ideamine/orchestrator-core/clarification';
import { KnowledgeRefinery } from '@ideamine/orchestrator-core/knowledge-refinery';
import { BadRequestError, NotFoundError } from '../middleware/error-handler';
import { registerAllAgents } from '@ideamine/orchestrator-core/agents';

const router = Router();

// Register all agents on startup
registerAllAgents();

// Helper to get run manager instance
function getRunManager(db: Pool, anthropicApiKey: string): RunManager {
  const budgetTracker = new BudgetTracker(db);
  const knowledgeRefinery = new KnowledgeRefinery(db);
  const qavCoordinator = new QAVCoordinator(anthropicApiKey, knowledgeRefinery);
  const clarificationLoop = new ClarificationLoop(qavCoordinator, db);
  const phaseCoordinator = new PhaseCoordinator(
    db,
    budgetTracker,
    qavCoordinator,
    clarificationLoop
  );
  const unsticker = new Unsticker(db);
  const dagExecutor = new DAGExecutor(phaseCoordinator);

  return new RunManager(db, phaseCoordinator, budgetTracker, unsticker, dagExecutor);
}

/**
 * POST /api/runs
 * Create and start a new run
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (req as any).db as Pool;
    const config = (req as any).config;
    const io = (req as any).io as SocketIOServer;

    const {
      runId,
      phases,
      initialContext,
      budgets,
      options,
    } = req.body;

    // Validation
    if (!runId) {
      throw new BadRequestError('runId is required');
    }
    if (!phases || !Array.isArray(phases) || phases.length === 0) {
      throw new BadRequestError('phases array is required and cannot be empty');
    }
    if (!initialContext) {
      throw new BadRequestError('initialContext is required');
    }

    const runManager = getRunManager(db, config.anthropicApiKey);

    // Emit real-time updates
    runManager.on('run.started', (event) => {
      io.to(`run:${runId}`).emit('run:started', event);
    });

    runManager.on('run.phase_started', (event) => {
      io.to(`run:${runId}`).emit('run:phase_started', event);
    });

    runManager.on('run.phase_completed', (event) => {
      io.to(`run:${runId}`).emit('run:phase_completed', event);
    });

    runManager.on('run.phase_failed', (event) => {
      io.to(`run:${runId}`).emit('run:phase_failed', event);
    });

    runManager.on('run.completed', (event) => {
      io.to(`run:${runId}`).emit('run:completed', event);
    });

    // Start run asynchronously
    setImmediate(async () => {
      try {
        await runManager.startRun({
          runId,
          phases,
          initialContext,
          budgets: budgets || {
            total_tokens: 5000000,
            total_tools_minutes: 120,
            total_wallclock_minutes: 480,
          },
          options: options || {
            auto_advance: true,
            stop_on_gate_failure: false,
            enable_checkpoints: true,
            checkpoint_interval_phases: 2,
          },
        });
      } catch (error: any) {
        io.to(`run:${runId}`).emit('run:error', {
          runId,
          error: error.message,
        });
      }
    });

    res.status(202).json({
      runId,
      status: 'started',
      message: 'Run started successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/runs/:runId
 * Get run status and details
 */
router.get('/:runId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (req as any).db as Pool;
    const config = (req as any).config;
    const { runId } = req.params;

    const runManager = getRunManager(db, config.anthropicApiKey);
    const status = await runManager.getStatus(runId);

    if (!status) {
      throw new NotFoundError(`Run ${runId} not found`);
    }

    res.json(status);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/runs
 * List all runs with optional filtering
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (req as any).db as Pool;
    const config = (req as any).config;

    const { status, limit = 50, offset = 0 } = req.query;

    const runManager = getRunManager(db, config.anthropicApiKey);
    const runs = await runManager.getAllRuns({
      status: status as string | undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.json({
      runs,
      pagination: {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        total: runs.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/runs/:runId/pause
 * Pause a running run
 */
router.post('/:runId/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (req as any).db as Pool;
    const config = (req as any).config;
    const { runId } = req.params;

    const runManager = getRunManager(db, config.anthropicApiKey);
    await runManager.pauseRun(runId);

    res.json({
      runId,
      status: 'paused',
      message: 'Run paused successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/runs/:runId/resume
 * Resume a paused run
 */
router.post('/:runId/resume', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (req as any).db as Pool;
    const config = (req as any).config;
    const { runId } = req.params;

    const runManager = getRunManager(db, config.anthropicApiKey);
    await runManager.resumeRun(runId);

    res.json({
      runId,
      status: 'resumed',
      message: 'Run resumed successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/runs/:runId/cancel
 * Cancel a running run
 */
router.post('/:runId/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = (req as any).db as Pool;
    const config = (req as any).config;
    const { runId } = req.params;

    const runManager = getRunManager(db, config.anthropicApiKey);
    await runManager.cancelRun(runId);

    res.json({
      runId,
      status: 'cancelled',
      message: 'Run cancelled successfully',
    });
  } catch (error) {
    next(error);
  }
});

export { router as runsRouter };
