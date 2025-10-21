import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import pino from 'pino';
import { Pool } from 'pg';

// Routes
import { runsRouter } from './routes/runs';
import { agentsRouter } from './routes/agents';
import { phasesRouter } from './routes/phases';
import { eventsRouter } from './routes/events';
import { checkpointsRouter } from './routes/checkpoints';
import { healthRouter } from './routes/health';

// Middleware
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { rateLimiter } from './middleware/rate-limiter';
import { authenticate } from './middleware/auth';

const logger = pino({ name: 'api-server' });

export interface ApiConfig {
  port: number;
  corsOrigins: string[];
  databaseUrl: string;
  anthropicApiKey: string;
  jwtSecret?: string;
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
}

export class ApiServer {
  private app: Express;
  private httpServer: any;
  private io: SocketIOServer;
  private db: Pool;
  private config: ApiConfig;
  private logger = logger;

  constructor(config: ApiConfig) {
    this.config = config;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: config.corsOrigins,
        credentials: true,
      },
    });

    // Initialize database
    this.db = new Pool({
      connectionString: config.databaseUrl,
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security
    this.app.use(helmet());
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true,
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    this.app.use(requestLogger);

    // Rate limiting
    this.app.use(rateLimiter({
      windowMs: this.config.rateLimitWindowMs || 15 * 60 * 1000, // 15 minutes
      maxRequests: this.config.rateLimitMaxRequests || 100,
    }));

    // Attach database and config to request
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      (req as any).db = this.db;
      (req as any).config = this.config;
      (req as any).io = this.io;
      next();
    });
  }

  private setupRoutes(): void {
    // Health check (no auth required)
    this.app.use('/health', healthRouter);

    // API routes (with optional auth)
    const apiRouter = express.Router();

    // Apply authentication if JWT secret is configured
    if (this.config.jwtSecret) {
      apiRouter.use(authenticate(this.config.jwtSecret));
    }

    // Mount routers
    apiRouter.use('/runs', runsRouter);
    apiRouter.use('/agents', agentsRouter);
    apiRouter.use('/phases', phasesRouter);
    apiRouter.use('/events', eventsRouter);
    apiRouter.use('/checkpoints', checkpointsRouter);

    this.app.use('/api', apiRouter);

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'IdeaMine Orchestrator API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          health: '/health',
          api: '/api',
          docs: '/api/docs',
        },
      });
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.path}`,
      });
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      this.logger.info({ socketId: socket.id }, 'WebSocket client connected');

      // Subscribe to run updates
      socket.on('subscribe:run', (runId: string) => {
        socket.join(`run:${runId}`);
        this.logger.info({ socketId: socket.id, runId }, 'Subscribed to run updates');
      });

      // Unsubscribe from run updates
      socket.on('unsubscribe:run', (runId: string) => {
        socket.leave(`run:${runId}`);
        this.logger.info({ socketId: socket.id, runId }, 'Unsubscribed from run updates');
      });

      socket.on('disconnect', () => {
        this.logger.info({ socketId: socket.id }, 'WebSocket client disconnected');
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, () => {
        this.logger.info(
          { port: this.config.port },
          'API server started successfully'
        );
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    this.logger.info('Stopping API server...');

    // Close WebSocket connections
    this.io.close();

    // Close HTTP server
    await new Promise<void>((resolve) => {
      this.httpServer.close(() => resolve());
    });

    // Close database pool
    await this.db.end();

    this.logger.info('API server stopped');
  }

  public getApp(): Express {
    return this.app;
  }

  public getIO(): SocketIOServer {
    return this.io;
  }

  public getDB(): Pool {
    return this.db;
  }
}

// Start server if run directly
if (require.main === module) {
  const config: ApiConfig = {
    port: parseInt(process.env.PORT || '9002', 10),
    corsOrigins: (process.env.CORS_ORIGINS || '*').split(','),
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/ideamine',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    jwtSecret: process.env.JWT_SECRET,
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  };

  const server = new ApiServer(config);

  server.start().catch((error) => {
    logger.error({ error }, 'Failed to start API server');
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });
}
