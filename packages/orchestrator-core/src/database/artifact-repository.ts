import { DatabaseConnection } from './connection';
import { ArtifactRow } from './types';
import { ArtifactReference } from '@ideamine/artifact-schemas';

/**
 * Artifact Repository
 *
 * Manages artifact metadata (actual content stored in MinIO)
 */
export class ArtifactRepository {
  constructor(private db: DatabaseConnection) {}

  /**
   * MEDIUM FIX: Validate storage path to prevent path traversal
   */
  private validateStoragePath(storagePath: string): void {
    // Disallow path traversal patterns
    if (storagePath.includes('..') || storagePath.includes('//')) {
      throw new Error(
        `Invalid storage path: path traversal detected. Path must not contain '..' or '//'`
      );
    }

    // Ensure path doesn't start with /
    if (storagePath.startsWith('/')) {
      throw new Error(
        `Invalid storage path: absolute paths not allowed. Use relative paths only.`
      );
    }

    // Disallow Windows drive letters
    if (/^[a-zA-Z]:/.test(storagePath)) {
      throw new Error(
        `Invalid storage path: Windows drive letters not allowed.`
      );
    }

    // Ensure path only contains safe characters
    if (!/^[a-zA-Z0-9/_.-]+$/.test(storagePath)) {
      throw new Error(
        `Invalid storage path: only alphanumeric, hyphen, underscore, dot, and forward slash allowed.`
      );
    }
  }

  /**
   * Create artifact metadata
   */
  async createArtifact(artifact: {
    id: string;
    workflowRunId: string;
    type: string;
    phase: string;
    createdBy: string;
    contentHash: string;
    storagePath: string;
    sizeBytes: number;
    version?: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    // MEDIUM FIX: Validate storage path before inserting
    this.validateStoragePath(artifact.storagePath);

    const query = `
      INSERT INTO artifacts (
        id, workflow_run_id, type, phase, created_by, content_hash,
        storage_path, size_bytes, version, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    await this.db.query(query, [
      artifact.id,
      artifact.workflowRunId,
      artifact.type,
      artifact.phase,
      artifact.createdBy,
      artifact.contentHash,
      artifact.storagePath,
      artifact.sizeBytes,
      artifact.version ?? 1,
      JSON.stringify(artifact.metadata ?? {}),
    ]);

    console.log(`[ArtifactRepository] Created artifact: ${artifact.id}`);
  }

  /**
   * Get artifact by ID
   */
  async getArtifact(id: string): Promise<ArtifactRow | null> {
    const query = 'SELECT * FROM artifacts WHERE id = $1';
    const result = await this.db.query<ArtifactRow>(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Get artifacts by workflow run
   */
  async getArtifactsByWorkflowRun(workflowRunId: string): Promise<ArtifactRow[]> {
    const query = `
      SELECT * FROM artifacts
      WHERE workflow_run_id = $1
      ORDER BY created_at ASC
    `;

    const result = await this.db.query<ArtifactRow>(query, [workflowRunId]);

    return result.rows;
  }

  /**
   * Get artifacts by type
   */
  async getArtifactsByType(
    workflowRunId: string,
    type: string
  ): Promise<ArtifactRow[]> {
    const query = `
      SELECT * FROM artifacts
      WHERE workflow_run_id = $1 AND type = $2
      ORDER BY version DESC, created_at DESC
    `;

    const result = await this.db.query<ArtifactRow>(query, [workflowRunId, type]);

    return result.rows;
  }

  /**
   * Get artifact by content hash (deduplication)
   */
  async getArtifactByHash(contentHash: string): Promise<ArtifactRow | null> {
    const query = `
      SELECT * FROM artifacts
      WHERE content_hash = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await this.db.query<ArtifactRow>(query, [contentHash]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Get latest version of artifact by type
   */
  async getLatestArtifact(
    workflowRunId: string,
    type: string
  ): Promise<ArtifactRow | null> {
    const query = `
      SELECT * FROM artifacts
      WHERE workflow_run_id = $1 AND type = $2
      ORDER BY version DESC, created_at DESC
      LIMIT 1
    `;

    const result = await this.db.query<ArtifactRow>(query, [workflowRunId, type]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * List artifacts with pagination
   */
  async listArtifacts(options: {
    workflowRunId?: string;
    type?: string;
    phase?: string;
    limit?: number;
    offset?: number;
  }): Promise<ArtifactRow[]> {
    let query = 'SELECT * FROM artifacts WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (options.workflowRunId) {
      query += ` AND workflow_run_id = $${paramIndex}`;
      params.push(options.workflowRunId);
      paramIndex++;
    }

    if (options.type) {
      query += ` AND type = $${paramIndex}`;
      params.push(options.type);
      paramIndex++;
    }

    if (options.phase) {
      query += ` AND phase = $${paramIndex}`;
      params.push(options.phase);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';

    if (options.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }

    if (options.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
    }

    const result = await this.db.query<ArtifactRow>(query, params);

    return result.rows;
  }

  /**
   * Delete artifact (marks for deletion, actual removal from storage happens async)
   */
  async deleteArtifact(id: string): Promise<void> {
    const query = 'DELETE FROM artifacts WHERE id = $1';
    await this.db.query(query, [id]);

    console.log(`[ArtifactRepository] Deleted artifact: ${id}`);
  }

  /**
   * Get artifact statistics
   */
  async getArtifactStats(workflowRunId: string): Promise<{
    totalCount: number;
    totalSizeBytes: number;
    byType: Record<string, { count: number; sizeBytes: number }>;
  }> {
    const query = `
      SELECT
        COUNT(*) as total_count,
        COALESCE(SUM(size_bytes), 0) as total_size,
        type,
        COUNT(*) as type_count,
        COALESCE(SUM(size_bytes), 0) as type_size
      FROM artifacts
      WHERE workflow_run_id = $1
      GROUP BY type
    `;

    const result = await this.db.query<{
      total_count: string;
      total_size: string;
      type: string;
      type_count: string;
      type_size: string;
    }>(query, [workflowRunId]);

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
    const totalSizeBytes = result.rows.length > 0 ? parseInt(result.rows[0].total_size, 10) : 0;

    const byType: Record<string, { count: number; sizeBytes: number }> = {};

    for (const row of result.rows) {
      byType[row.type] = {
        count: parseInt(row.type_count, 10),
        sizeBytes: parseInt(row.type_size, 10),
      };
    }

    return {
      totalCount,
      totalSizeBytes,
      byType,
    };
  }
}
