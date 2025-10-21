import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { BadRequestError } from '../middleware/error-handler';

const router = Router();

/**
 * GET /api/phases
 * List all available phases
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phases = [
      {
        name: 'intake',
        description: 'Structure raw ideas into actionable intake documents',
        agents: ['IntakeAgent'],
      },
      {
        name: 'ideation',
        description: 'Generate creative variations and enhancements',
        agents: ['IdeationAgent', 'StoryCutterAgent'],
      },
      {
        name: 'critique',
        description: 'Evaluate ideas for feasibility and risks',
        agents: ['CritiqueAgent'],
      },
      {
        name: 'prd',
        description: 'Write comprehensive product requirements',
        agents: ['PRDWriterAgent', 'StoryCutterAgent'],
      },
      {
        name: 'bizdev',
        description: 'Create business development and go-to-market strategies',
        agents: ['BizDevAgent'],
      },
      {
        name: 'architecture',
        description: 'Design technical architecture',
        agents: ['ArchitectureAgent'],
      },
      {
        name: 'build',
        description: 'Generate implementation plans and code',
        agents: ['BuildAgent'],
      },
      {
        name: 'security',
        description: 'Perform security analysis and threat modeling',
        agents: ['SecurityAgent'],
      },
      {
        name: 'qa',
        description: 'Create comprehensive testing strategies',
        agents: ['QAAgent'],
      },
      {
        name: 'aesthetic',
        description: 'Review UX/UI and design',
        agents: ['AestheticAgent'],
      },
      {
        name: 'release',
        description: 'Plan deployment and release procedures',
        agents: ['ReleaseAgent'],
      },
      {
        name: 'beta',
        description: 'Design beta testing programs',
        agents: ['BetaAgent'],
      },
    ];

    res.json({
      phases,
      total: phases.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/phases/:phase
 * Get phase details
 */
router.get('/:phase', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phase } = req.params;

    const phaseMap: Record<string, any> = {
      intake: {
        name: 'intake',
        description: 'Structure raw ideas into actionable intake documents',
        agents: ['IntakeAgent'],
        typical_duration_minutes: 5,
        typical_token_usage: 5000,
      },
      ideation: {
        name: 'ideation',
        description: 'Generate creative variations and enhancements',
        agents: ['IdeationAgent', 'StoryCutterAgent'],
        typical_duration_minutes: 10,
        typical_token_usage: 15000,
      },
      critique: {
        name: 'critique',
        description: 'Evaluate ideas for feasibility and risks',
        agents: ['CritiqueAgent'],
        typical_duration_minutes: 8,
        typical_token_usage: 12000,
      },
      prd: {
        name: 'prd',
        description: 'Write comprehensive product requirements',
        agents: ['PRDWriterAgent', 'StoryCutterAgent'],
        typical_duration_minutes: 12,
        typical_token_usage: 18000,
      },
      bizdev: {
        name: 'bizdev',
        description: 'Create business development and go-to-market strategies',
        agents: ['BizDevAgent'],
        typical_duration_minutes: 15,
        typical_token_usage: 20000,
      },
      architecture: {
        name: 'architecture',
        description: 'Design technical architecture',
        agents: ['ArchitectureAgent'],
        typical_duration_minutes: 18,
        typical_token_usage: 25000,
      },
      build: {
        name: 'build',
        description: 'Generate implementation plans and code',
        agents: ['BuildAgent'],
        typical_duration_minutes: 25,
        typical_token_usage: 40000,
      },
      security: {
        name: 'security',
        description: 'Perform security analysis and threat modeling',
        agents: ['SecurityAgent'],
        typical_duration_minutes: 20,
        typical_token_usage: 30000,
      },
      qa: {
        name: 'qa',
        description: 'Create comprehensive testing strategies',
        agents: ['QAAgent'],
        typical_duration_minutes: 18,
        typical_token_usage: 28000,
      },
      aesthetic: {
        name: 'aesthetic',
        description: 'Review UX/UI and design',
        agents: ['AestheticAgent'],
        typical_duration_minutes: 15,
        typical_token_usage: 22000,
      },
      release: {
        name: 'release',
        description: 'Plan deployment and release procedures',
        agents: ['ReleaseAgent'],
        typical_duration_minutes: 20,
        typical_token_usage: 28000,
      },
      beta: {
        name: 'beta',
        description: 'Design beta testing programs',
        agents: ['BetaAgent'],
        typical_duration_minutes: 18,
        typical_token_usage: 26000,
      },
    };

    const phaseDetails = phaseMap[phase];

    if (!phaseDetails) {
      throw new BadRequestError(`Unknown phase: ${phase}`);
    }

    res.json(phaseDetails);
  } catch (error) {
    next(error);
  }
});

export { router as phasesRouter };
