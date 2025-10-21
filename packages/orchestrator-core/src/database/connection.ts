import { Pool, PoolClient, QueryResult } from 'pg';

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
  ssl?: boolean;
  sslCa?: string;      // Path to CA certificate
  sslCert?: string;    // Path to client certificate
  sslKey?: string;     // Path to client key
}

/**
 * Database connection pool manager
 *
 * Provides:
 * - Connection pooling for efficiency
 * - Transaction support
 * - Query execution with error handling
 * - Health checks
 */
export class DatabaseConnection {
  private pool: Pool;
  private static instance: DatabaseConnection;
  private healthMonitorInterval?: NodeJS.Timer;

  private constructor(config: DatabaseConfig) {
    // SECURITY FIX #8: Secure SSL configuration
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.maxConnections ?? 20,
      idleTimeoutMillis: config.idleTimeoutMs ?? 30000,
      connectionTimeoutMillis: config.connectionTimeoutMs ?? 5000,
      ssl: config.ssl
        ? {
            rejectUnauthorized: true,  // REQUIRED in production
            ca: config.sslCa,          // CA certificate
            cert: config.sslCert,      // Client certificate (optional)
            key: config.sslKey,        // Client key (optional)
          }
        : undefined,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('[DatabaseConnection] Unexpected pool error:', this.sanitizeError(err));
    });

    console.log(
      `[DatabaseConnection] Pool created: ${config.host}:${config.port}/${config.database}`
    );

    // FEATURE #18: Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Sanitize query text to prevent information disclosure
   */
  private sanitizeQuery(query: string): string {
    // SECURITY FIX #10: Redact potential PII patterns
    return query
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL_REDACTED]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
      .replace(/\b\d{16}\b/g, '[CARD_REDACTED]')
      .substring(0, 200); // Limit length
  }

  /**
   * Sanitize error messages for production
   */
  private sanitizeError(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'Unknown error';
    }

    // Remove stack traces in production
    if (process.env.NODE_ENV === 'production') {
      return error.message.split('\n')[0]; // First line only
    }

    return error.message;
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthMonitorInterval = setInterval(() => {
      const stats = this.getStats();

      if (stats.health === 'critical') {
        console.error('[DatabaseConnection] CRITICAL:', stats.warnings);
      } else if (stats.health === 'warning') {
        console.warn('[DatabaseConnection] WARNING:', stats.warnings);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: DatabaseConfig): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      if (!config) {
        throw new Error('Database config required for first initialization');
      }
      DatabaseConnection.instance = new DatabaseConnection(config);
    }
    return DatabaseConnection.instance;
  }

  /**
   * Execute a query
   */
  async query<T = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();

    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;

      // SECURITY FIX #10: Sanitize query before logging
      console.log(
        `[DatabaseConnection] Query executed in ${duration}ms: ${this.sanitizeQuery(text)}`
      );

      return result;
    } catch (error) {
      // SECURITY FIX #10: Sanitize error before logging
      const sanitizedError = this.sanitizeError(error);
      console.error('[DatabaseConnection] Query error:', sanitizedError);

      // Don't expose internal details to caller in production
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Database operation failed. Check logs for details.');
      }

      throw error;
    }
  }

  /**
   * Execute code with a database client (auto-release)
   * Use this instead of getClient() to prevent connection leaks
   *
   * PERFORMANCE FIX #3: Auto-releases connection
   */
  async withClient<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await callback(client);
    } finally {
      client.release(); // Always release, even on error
    }
  }

  /**
   * Get a client from the pool for transactions
   * @deprecated Use withClient() or transaction() instead to prevent leaks
   */
  async getClient(): Promise<PoolClient> {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[DatabaseConnection] Direct getClient() usage detected. Use withClient() to prevent leaks.');
    }
    return await this.pool.connect();
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');

      const result = await callback(client);

      await client.query('COMMIT');

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[DatabaseConnection] Transaction rolled back:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW()');
      return result.rows.length > 0;
    } catch (error) {
      console.error('[DatabaseConnection] Health check failed:', error);
      return false;
    }
  }

  /**
   * Get pool statistics with health assessment
   * FEATURE #18: Enhanced pool monitoring
   */
  getStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    health: 'healthy' | 'warning' | 'critical';
    warnings: string[];
  } {
    const stats = {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      health: 'healthy' as 'healthy' | 'warning' | 'critical',
      warnings: [] as string[],
    };

    // Warning: High wait queue
    if (stats.waitingCount > 5) {
      stats.health = 'warning';
      stats.warnings.push(`${stats.waitingCount} queries waiting for connections`);
    }

    // Critical: All connections in use
    const maxConnections = (this.pool.options.max as number) ?? 20;
    if (stats.idleCount === 0 && stats.totalCount >= maxConnections) {
      stats.health = 'critical';
      stats.warnings.push('Connection pool exhausted - possible leak');
    }

    // Warning: Low idle ratio
    if (stats.totalCount > 0) {
      const idleRatio = stats.idleCount / stats.totalCount;
      if (idleRatio < 0.2) {
        stats.health = 'warning';
        stats.warnings.push(`Only ${(idleRatio * 100).toFixed(0)}% connections idle`);
      }
    }

    return stats;
  }

  /**
   * Close the pool
   */
  async close(): Promise<void> {
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
    }
    await this.pool.end();
    console.log('[DatabaseConnection] Pool closed');
  }
}

/**
 * Parse DATABASE_URL connection string
 * Format: postgresql://user:password@host:port/database?param=value
 */
function parseDatabaseUrl(url: string): Partial<DatabaseConfig> {
  try {
    const parsed = new URL(url);

    // Validate protocol
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      throw new Error(`Invalid database URL protocol: ${parsed.protocol}`);
    }

    const config: Partial<DatabaseConfig> = {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? parseInt(parsed.port, 10) : 5432,
      database: parsed.pathname.replace(/^\//, '') || 'ideamine',
      user: parsed.username || 'ideamine',
      password: decodeURIComponent(parsed.password || ''),
    };

    // Parse query parameters for SSL settings
    const params = parsed.searchParams;
    if (params.has('sslmode') && params.get('sslmode') !== 'disable') {
      config.ssl = true;
    }

    return config;
  } catch (error) {
    throw new Error(
      `Failed to parse DATABASE_URL: ${error instanceof Error ? error.message : 'Invalid URL format'}`
    );
  }
}

/**
 * Initialize database connection from environment
 * SECURITY FIX #2: No hardcoded credentials
 *
 * Supports two configuration methods:
 * 1. DATABASE_URL connection string (recommended for Docker/production)
 * 2. Individual env vars (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
 */
export function initializeDatabaseFromEnv(): DatabaseConnection {
  let config: DatabaseConfig;

  // Option 1: Parse DATABASE_URL if provided (standard practice)
  if (process.env.DATABASE_URL) {
    const parsedConfig = parseDatabaseUrl(process.env.DATABASE_URL);

    // Validate password exists in production
    if (process.env.NODE_ENV === 'production' && !parsedConfig.password) {
      throw new Error(
        'DATABASE_URL must include password in production. ' +
        'Never use default credentials in production.'
      );
    }

    config = {
      host: parsedConfig.host!,
      port: parsedConfig.port!,
      database: parsedConfig.database!,
      user: parsedConfig.user!,
      password: parsedConfig.password!,
      maxConnections: parseInt(process.env.DATABASE_POOL_SIZE ?? '20', 10),
      ssl: parsedConfig.ssl ?? (process.env.DB_SSL === 'true'),
      sslCa: process.env.DB_SSL_CA,
      sslCert: process.env.DB_SSL_CERT,
      sslKey: process.env.DB_SSL_KEY,
    };

    // MEDIUM FIX: Don't log connection details that could expose credentials
    console.log(
      `[DatabaseConnection] Initialized from DATABASE_URL: ${parsedConfig.host}:${parsedConfig.port}/${parsedConfig.database}`
    );
  }
  // Option 2: Use individual environment variables (backward compatibility)
  else {
    // Require critical credentials in production - fail fast
    const requiredEnvVars = ['DB_HOST', 'DB_PASSWORD'];
    const missing = requiredEnvVars.filter(v => !process.env[v]);

    if (missing.length > 0 && process.env.NODE_ENV === 'production') {
      throw new Error(
        `Missing required database credentials: ${missing.join(', ')}. ` +
        `Set DATABASE_URL or individual DB_* variables. ` +
        `Never use default credentials in production.`
      );
    }

    config = {
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      database: process.env.DB_NAME ?? 'ideamine',
      user: process.env.DB_USER ?? 'ideamine',
      password: process.env.DB_PASSWORD!,  // Fail if not set in production
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS ?? '20', 10),
      ssl: process.env.DB_SSL === 'true',
      sslCa: process.env.DB_SSL_CA,
      sslCert: process.env.DB_SSL_CERT,
      sslKey: process.env.DB_SSL_KEY,
    };

    // MEDIUM FIX: Don't log connection details that could expose credentials
    console.log(
      `[DatabaseConnection] Initialized from env vars: ${config.host}:${config.port}/${config.database}`
    );
  }

  return DatabaseConnection.getInstance(config);
}
