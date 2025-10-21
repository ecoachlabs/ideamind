import { Router, Response, NextFunction } from 'express';
import { Pool } from 'pg';
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
import { validate } from '../middleware/validation';
import {
  createRunSchema,
  getRunSchema,
  listRunsSchema,
  pauseRunSchema,
  resumeRunSchema,
  cancelRunSchema,
} from '../schemas/runs';
import { IdeaMineRequest } from '../types/express';

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
 * SECURITY FIX #11: Added input validation
 */
router.post('/', validate(createRunSchema), async (req: IdeaMineRequest, res: Response, next: NextFunction) => {
  try {
    const { db, config, io } = req;

    const {
      runId,
      phases,
      initialContext,
      budgets,
      options,
    } = req.body;

    // Input already validated by middleware
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
      } catch (error: unknown) {
        io.to(`run:${runId}`).emit('run:error', {
          runId,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
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
 * SECURITY FIX #11: Added input validation
 */
router.get('/:runId', validate(getRunSchema), async (req: IdeaMineRequest, res: Response, next: NextFunction) => {
  try {
    const { db, config } = req;
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
 * SECURITY FIX #11: Added input validation
 */
router.get('/', validate(listRunsSchema), async (req: IdeaMineRequest, res: Response, next: NextFunction) => {
  try {
    const { db, config } = req;

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
 * SECURITY FIX #11: Added input validation
 */
router.post('/:runId/pause', validate(pauseRunSchema), async (req: IdeaMineRequest, res: Response, next: NextFunction) => {
  try {
    const { db, config } = req;
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
 * SECURITY FIX #11: Added input validation
 */
router.post('/:runId/resume', validate(resumeRunSchema), async (req: IdeaMineRequest, res: Response, next: NextFunction) => {
  try {
    const { db, config } = req;
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
 * SECURITY FIX #11: Added input validation
 */
router.post('/:runId/cancel', validate(cancelRunSchema), async (req: IdeaMineRequest, res: Response, next: NextFunction) => {
  try {
    const { db, config } = req;
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
