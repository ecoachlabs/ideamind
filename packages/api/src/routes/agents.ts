import { Router, Request, Response, NextFunction } from 'express';
import { registry } from '@ideamine/orchestrator-core/agents';
import { registerAllAgents } from '@ideamine/orchestrator-core/agents';
import { BadRequestError, NotFoundError } from '../middleware/error-handler';

const router = Router();

// Register all agents on startup
registerAllAgents();

/**
 * GET /api/agents
 * List all available agents
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phase, tag } = req.query;

    let agents = Array.from((registry as any).metadata.values());

    // Filter by phase
    if (phase) {
      agents = agents.filter((agent: any) =>
        agent.phases.includes(phase as string)
      );
    }

    // Filter by tag
    if (tag) {
      agents = agents.filter((agent: any) =>
        agent.tags.includes(tag as string)
      );
    }

    res.json({
      agents,
      total: agents.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agents/:agentName
 * Get agent details
 */
router.get('/:agentName', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { agentName } = req.params;

    const metadata = (registry as any).metadata.get(agentName);

    if (!metadata) {
      throw new NotFoundError(`Agent ${agentName} not found`);
    }

    res.json(metadata);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/agents/:agentName/execute
 * Execute an agent directly
 */
router.post('/:agentName/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = (req as any).config;
    const { agentName } = req.params;
    const { input, context } = req.body;

    // Validation
    if (!input) {
      throw new BadRequestError('input is required');
    }
    if (!context) {
      throw new BadRequestError('context is required');
    }

    // Get agent
    const agent = registry.get(agentName, config.anthropicApiKey);

    if (!agent) {
      throw new NotFoundError(`Agent ${agentName} not found`);
    }

    // Execute agent
    const result = await agent.execute(input, context);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agents/by-phase/:phase
 * Get all agents for a specific phase
 */
router.get('/by-phase/:phase', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phase } = req.params;

    const agents = registry.getForPhase(phase);

    res.json({
      phase,
      agents,
      total: agents.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agents/by-tag/:tag
 * Get all agents with a specific tag
 */
router.get('/by-tag/:tag', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tag } = req.params;

    const agents = registry.searchByTag(tag);

    res.json({
      tag,
      agents,
      total: agents.length,
    });
  } catch (error) {
    next(error);
  }
});

export { router as agentsRouter };
