import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

/**
 * GET /health
 * Health check endpoint
 */
router.get('/', async (req: Request, res: Response) => {
  const db = (req as any).db as Pool | undefined;

  const health: any = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
  };

  // Check database connection if available
  if (db) {
    try {
      const result = await db.query('SELECT NOW()');
      health.database = {
        status: 'connected',
        timestamp: result.rows[0].now,
      };
    } catch (error: any) {
      health.database = {
        status: 'error',
        error: error.message,
      };
      health.status = 'degraded';
    }
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

export { router as healthRouter };
