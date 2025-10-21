import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import pino from 'pino';
import { Pool } from 'pg';
import { IdeaMineRequest } from './types/express';

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
  jwtSecret: string;  // REQUIRED - auth always enabled
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
}

export class ApiServer {
  private app: Express;
  private httpServer: HttpServer;
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
    // TYPESCRIPT FIX: Properly augment request with IdeaMineRequest interface
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const ideaMineReq = req as IdeaMineRequest;
      ideaMineReq.db = this.db;
      ideaMineReq.config = this.config;
      ideaMineReq.io = this.io;
      next();
    });
  }

  private setupRoutes(): void {
    // Health check (no auth required)
    this.app.use('/health', healthRouter);

    // API routes (authentication ALWAYS required)
    const apiRouter = express.Router();

    // SECURITY: Authentication is mandatory - cannot be disabled
    apiRouter.use(authenticate(this.config.jwtSecret));

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

/**
 * Validate configuration at startup - fail fast
 */
function validateConfig(): ApiConfig {
  const env = process.env.NODE_ENV || 'development';

  // REQUIRED in production
  const requiredInProduction = {
    DATABASE_URL: process.env.DATABASE_URL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    JWT_SECRET: process.env.JWT_SECRET,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
  };

  if (env === 'production') {
    const missing = Object.entries(requiredInProduction)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      throw new Error(
        `FATAL: Missing required production config: ${missing.join(', ')}\n` +
        `Set these environment variables before starting the server.\n` +
        `Never run production without authentication and CORS protection.`
      );
    }

    // Validate CORS is not wildcard in production
    if (requiredInProduction.CORS_ORIGINS === '*') {
      throw new Error(
        'FATAL: CORS_ORIGINS cannot be "*" in production. ' +
        'Specify allowed origins: https://app.example.com,https://dashboard.example.com'
      );
    }
  }

  // Validate JWT_SECRET always required (even in development)
  if (!process.env.JWT_SECRET) {
    if (env === 'production') {
      throw new Error(
        'FATAL: JWT_SECRET is required. Authentication cannot be disabled.\n' +
        'Generate a secret: openssl rand -base64 32'
      );
    } else {
      // Development: Require explicit acknowledgment to run without auth
      if (process.env.DISABLE_AUTH !== 'true') {
        throw new Error(
          'JWT_SECRET is missing. Either:\n' +
          '1. Set JWT_SECRET environment variable (recommended)\n' +
          '2. Set DISABLE_AUTH=true to run without authentication (DEV ONLY)\n' +
          'Generate a secret: openssl rand -base64 32'
        );
      }
      logger.warn(
        '⚠️  SECURITY WARNING: Authentication disabled for development.\n' +
        '⚠️  This is EXTREMELY DANGEROUS and must NEVER be used in production.\n' +
        '⚠️  Set JWT_SECRET environment variable to enable authentication.'
      );
    }
  }

  // Parse CORS origins (never default to wildcard)
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : (env === 'production'
        ? [] as never  // Force error if missing
        : ['http://localhost:3000', 'http://localhost:9000']);  // Dev defaults

  return {
    port: parseInt(process.env.PORT || (env === 'production' ? '8080' : '9002'), 10),
    corsOrigins,
    databaseUrl: requiredInProduction.DATABASE_URL || 'postgresql://localhost:5432/ideamine',
    anthropicApiKey: requiredInProduction.ANTHROPIC_API_KEY || '',
    jwtSecret: requiredInProduction.JWT_SECRET || 'dev-secret-DO-NOT-USE-IN-PRODUCTION',
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  };
}

// Start server if run directly
if (require.main === module) {
  const config = validateConfig();  // ✅ Validates before server starts

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
