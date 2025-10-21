/**
 * Determinism & Content-Addressed Storage (CAS)
 *
 * Roadmap: M1 - Autonomy Core
 *
 * Tools: exec.seed + cache.CAS
 * - Seeded execution for reproducibility
 * - Content-addressed cache for tool outputs
 * - Replay hash binding for exact-once enforcement
 *
 * Acceptance:
 * - Identical inputs → identical digests
 * - Replay uses cache for ≥60% of identical sub-tasks
 */

import crypto from 'crypto';
import pino from 'pino';
import { Pool } from 'pg';
import { promises as fs } from 'fs';
import path from 'path';

const logger = pino({ name: 'determinism' });

// ============================================================================
// Types
// ============================================================================

export interface SeedContext {
  seed: number;
  timestamp: Date;
  runId: string;
  taskId?: string;
}

export interface CASEntry {
  digest: string; // SHA256 hash
  artifactUri: string; // Storage location
  contentType: string;
  size: number;
  metadata: Record<string, any>;
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
}

export interface ReplayHash {
  hash: string;
  inputs: any;
  seed: number;
  modelId?: string;
  timestamp: Date;
}

// ============================================================================
// Seed Manager
// ============================================================================

export class SeedManager {
  private seeds: Map<string, number> = new Map();

  /**
   * Initialize seed for a run
   * Uses deterministic seed based on runId for reproducibility
   */
  initSeed(runId: string, customSeed?: number): SeedContext {
    const seed = customSeed !== undefined ? customSeed : this.generateSeed(runId);

    this.seeds.set(runId, seed);

    logger.info({ runId, seed }, 'Seed initialized');

    return {
      seed,
      timestamp: new Date(),
      runId,
    };
  }

  /**
   * Get seed for a run
   */
  getSeed(runId: string): number | undefined {
    return this.seeds.get(runId);
  }

  /**
   * Get seed for a task (derived from run seed + task ID)
   */
  getTaskSeed(runId: string, taskId: string): number {
    const runSeed = this.getSeed(runId);
    if (runSeed === undefined) {
      throw new Error(`No seed found for run ${runId}`);
    }

    // Derive task seed from run seed + task ID
    return this.hashToSeed(`${runSeed}-${taskId}`);
  }

  /**
   * Generate deterministic seed from runId
   */
  private generateSeed(runId: string): number {
    return this.hashToSeed(runId);
  }

  /**
   * Convert hash to 32-bit integer seed
   */
  private hashToSeed(input: string): number {
    const hash = crypto.createHash('sha256').update(input).digest();
    return hash.readUInt32BE(0);
  }

  /**
   * Set seed for randomness (Math.random, etc.)
   * Note: This is a placeholder - actual implementation would use seedrandom library
   */
  setSeed(seed: number) {
    // TODO: Integrate with seedrandom or similar library
    logger.debug({ seed }, 'Seed set (placeholder)');
  }
}

// ============================================================================
// Content-Addressed Storage (CAS)
// ============================================================================

export class ContentAddressedStore {
  private casDir: string;

  constructor(
    private db: Pool,
    baseDir: string = '/tmp/ideamine-cas'
  ) {
    this.casDir = baseDir;
  }

  /**
   * Store content and return digest
   */
  async store(
    content: any,
    contentType: string = 'application/json',
    metadata: Record<string, any> = {}
  ): Promise<CASEntry> {
    // Serialize content
    const serialized =
      typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    // Compute digest (SHA256)
    const digest = crypto.createHash('sha256').update(serialized).digest('hex');

    // Check if already exists
    const existing = await this.get(digest);
    if (existing) {
      // Update access stats
      await this.updateAccess(digest);
      logger.debug({ digest }, 'CAS hit - content already exists');
      return existing;
    }

    // Store to filesystem (in subdirectory based on first 2 chars of hash)
    const subdir = digest.substring(0, 2);
    const dir = path.join(this.casDir, subdir);
    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, digest);
    await fs.writeFile(filePath, serialized, 'utf-8');

    const entry: CASEntry = {
      digest,
      artifactUri: filePath,
      contentType,
      size: Buffer.byteLength(serialized),
      metadata,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
    };

    // Store metadata in database
    await this.db.query(
      `
      INSERT INTO cas_cache (
        digest, artifact_uri, content_type, size, metadata, created_at, last_accessed_at, access_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        entry.digest,
        entry.artifactUri,
        entry.contentType,
        entry.size,
        JSON.stringify(entry.metadata),
        entry.createdAt,
        entry.lastAccessedAt,
        entry.accessCount,
      ]
    );

    logger.info({ digest, size: entry.size }, 'Content stored in CAS');

    return entry;
  }

  /**
   * Retrieve content by digest
   */
  async get(digest: string): Promise<CASEntry | null> {
    const result = await this.db.query(
      `SELECT * FROM cas_cache WHERE digest = $1`,
      [digest]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      digest: row.digest,
      artifactUri: row.artifact_uri,
      contentType: row.content_type,
      size: row.size,
      metadata: row.metadata,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
      accessCount: row.access_count,
    };
  }

  /**
   * Read content from CAS
   */
  async read(digest: string): Promise<any> {
    const entry = await this.get(digest);
    if (!entry) {
      throw new Error(`Content not found in CAS: ${digest}`);
    }

    // Update access stats
    await this.updateAccess(digest);

    // Read from filesystem
    const content = await fs.readFile(entry.artifactUri, 'utf-8');

    // Parse if JSON
    if (entry.contentType === 'application/json') {
      return JSON.parse(content);
    }

    return content;
  }

  /**
   * Update access statistics
   */
  private async updateAccess(digest: string) {
    await this.db.query(
      `
      UPDATE cas_cache
      SET last_accessed_at = NOW(), access_count = access_count + 1
      WHERE digest = $1
    `,
      [digest]
    );
  }

  /**
   * Compute digest for content without storing
   */
  computeDigest(content: any): string {
    const serialized =
      typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Check if content exists in CAS
   */
  async has(digest: string): Promise<boolean> {
    const entry = await this.get(digest);
    return entry !== null;
  }

  /**
   * Delete old/unused entries (garbage collection)
   */
  async gc(olderThanDays: number = 30, minAccessCount: number = 1): Promise<number> {
    const result = await this.db.query(
      `
      DELETE FROM cas_cache
      WHERE last_accessed_at < NOW() - INTERVAL '${olderThanDays} days'
        AND access_count < $1
      RETURNING digest, artifact_uri
    `,
      [minAccessCount]
    );

    // Delete files from filesystem
    for (const row of result.rows) {
      try {
        await fs.unlink(row.artifact_uri);
      } catch (err) {
        logger.warn({ digest: row.digest, err }, 'Failed to delete CAS file');
      }
    }

    logger.info({ deleted: result.rowCount }, 'CAS garbage collection complete');

    return result.rowCount || 0;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    totalSizeBytes: number;
    avgAccessCount: number;
    hitRate: number;
  }> {
    const result = await this.db.query(`
      SELECT
        COUNT(*) as total_entries,
        SUM(size) as total_size,
        AVG(access_count) as avg_access,
        COUNT(*) FILTER (WHERE access_count > 0) * 100.0 / COUNT(*) as hit_rate
      FROM cas_cache
    `);

    const row = result.rows[0];
    return {
      totalEntries: parseInt(row.total_entries),
      totalSizeBytes: parseInt(row.total_size || '0'),
      avgAccessCount: parseFloat(row.avg_access || '0'),
      hitRate: parseFloat(row.hit_rate || '0'),
    };
  }
}

// ============================================================================
// Replay Hash Manager
// ============================================================================

export class ReplayHashManager {
  constructor(
    private db: Pool,
    private cas: ContentAddressedStore
  ) {}

  /**
   * Compute replay hash for a task
   * Binds inputs + seed + model for exact-once enforcement
   */
  computeHash(inputs: any, seed: number, modelId?: string): string {
    const payload = {
      inputs,
      seed,
      modelId: modelId || 'default',
      version: '1.0',
    };

    return this.cas.computeDigest(payload);
  }

  /**
   * Check if task has been executed before
   */
  async getReplay(hash: string): Promise<{ digest: string; output: any } | null> {
    const result = await this.db.query(
      `SELECT output_digest FROM replay_cache WHERE replay_hash = $1`,
      [hash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const outputDigest = result.rows[0].output_digest;

    // Retrieve output from CAS
    const output = await this.cas.read(outputDigest);

    logger.info({ hash, outputDigest }, 'Replay cache hit');

    return {
      digest: outputDigest,
      output,
    };
  }

  /**
   * Store task execution for replay
   */
  async storeReplay(
    hash: string,
    inputs: any,
    seed: number,
    output: any,
    modelId?: string
  ): Promise<void> {
    // Store output in CAS
    const entry = await this.cas.store(output, 'application/json', {
      replayHash: hash,
      seed,
      modelId,
    });

    // Store replay mapping
    await this.db.query(
      `
      INSERT INTO replay_cache (replay_hash, inputs, seed, model_id, output_digest, timestamp)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (replay_hash) DO UPDATE SET
        output_digest = $5,
        timestamp = NOW()
    `,
      [hash, JSON.stringify(inputs), seed, modelId || 'default', entry.digest]
    );

    logger.info({ hash, outputDigest: entry.digest }, 'Replay cache stored');
  }

  /**
   * Execute task with replay cache
   */
  async executeWithReplay<T>(
    inputs: any,
    seed: number,
    executor: () => Promise<T>,
    modelId?: string
  ): Promise<{ output: T; fromCache: boolean }> {
    const hash = this.computeHash(inputs, seed, modelId);

    // Check for replay
    const replay = await this.getReplay(hash);
    if (replay) {
      return {
        output: replay.output,
        fromCache: true,
      };
    }

    // Execute task
    const output = await executor();

    // Store for replay
    await this.storeReplay(hash, inputs, seed, output, modelId);

    return {
      output,
      fromCache: false,
    };
  }

  /**
   * Get cache hit rate
   */
  async getHitRate(runId?: string): Promise<number> {
    const whereClause = runId ? `WHERE metadata->>'runId' = $1` : '';
    const params = runId ? [runId] : [];

    const result = await this.db.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM cas_cache WHERE digest = replay_cache.output_digest AND access_count > 1
        )) * 100.0 / COUNT(*) as hit_rate
      FROM replay_cache
      ${whereClause}
    `,
      params
    );

    return parseFloat(result.rows[0]?.hit_rate || '0');
  }
}

// ============================================================================
// Database Migrations
// ============================================================================

export const DETERMINISM_MIGRATIONS = `
-- CAS cache table
CREATE TABLE IF NOT EXISTS cas_cache (
  digest VARCHAR(64) PRIMARY KEY,
  artifact_uri TEXT NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  size BIGINT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  access_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cas_last_accessed ON cas_cache(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_cas_access_count ON cas_cache(access_count);

COMMENT ON TABLE cas_cache IS 'Content-addressed storage for deterministic caching';

-- Replay cache table
CREATE TABLE IF NOT EXISTS replay_cache (
  replay_hash VARCHAR(64) PRIMARY KEY,
  inputs JSONB NOT NULL,
  seed INTEGER NOT NULL,
  model_id VARCHAR(100),
  output_digest VARCHAR(64) NOT NULL REFERENCES cas_cache(digest) ON DELETE CASCADE,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_replay_timestamp ON replay_cache(timestamp);
CREATE INDEX IF NOT EXISTS idx_replay_model ON replay_cache(model_id);

COMMENT ON TABLE replay_cache IS 'Replay cache for exact-once task execution';
`;
