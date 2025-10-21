/**
 * Knowledge Frame Manager
 *
 * Manages storage, retrieval, and versioning of knowledge frames
 */

import { Pool } from 'pg';
import pino from 'pino';
import crypto from 'crypto';
import { KnowledgeFrame, MemoryScope, Provenance } from './types';

const logger = pino({ name: 'knowledge-frame' });

export class KnowledgeFrameManager {
  constructor(private db: Pool) {}

  /**
   * Create a new knowledge frame
   */
  async createFrame(
    scope: MemoryScope,
    theme: string,
    summary: string,
    claims: string[],
    citations: string[],
    provenance: Provenance,
    options?: {
      parents?: string[];
      version?: string;
      ttl?: number;
      pinned?: boolean;
      tags?: string[];
    }
  ): Promise<string> {
    const id = `frame_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const version = options?.version || 'v1.0.0';
    const now = new Date();

    const parents = options?.parents || [];
    const children: string[] = [];
    const pinned = options?.pinned || false;
    const tags = options?.tags || [];

    // Sign the frame
    const signature = this.signFrame({
      id,
      scope,
      theme,
      summary,
      claims,
      citations,
      version,
    });

    provenance.signature = signature;

    const query = `
      INSERT INTO knowledge_frames (
        id, scope, theme, summary, claims, citations,
        parents, children, version, provenance,
        created_at, updated_at, ttl, pinned, tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `;

    const values = [
      id,
      scope,
      theme,
      summary,
      JSON.stringify(claims),
      JSON.stringify(citations),
      JSON.stringify(parents),
      JSON.stringify(children),
      version,
      JSON.stringify(provenance),
      now,
      now,
      options?.ttl || null,
      pinned,
      JSON.stringify(tags),
    ];

    const result = await this.db.query(query, values);

    logger.info({ frameId: id, scope, theme }, 'Knowledge frame created');

    // Update parent frames to include this as a child
    if (parents.length > 0) {
      await this.addChildToParents(id, parents);
    }

    return result.rows[0].id;
  }

  /**
   * Get frame by ID
   */
  async getFrame(frameId: string): Promise<KnowledgeFrame | null> {
    const query = `
      SELECT * FROM knowledge_frames WHERE id = $1
    `;

    const result = await this.db.query(query, [frameId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToFrame(result.rows[0]);
  }

  /**
   * Query frames by theme and scope
   */
  async queryFrames(
    theme?: string,
    scope?: MemoryScope | MemoryScope[],
    options?: {
      limit?: number;
      minFreshness?: number;
      tags?: string[];
      afterDate?: Date;
    }
  ): Promise<KnowledgeFrame[]> {
    let query = `SELECT * FROM knowledge_frames WHERE 1=1`;
    const values: any[] = [];
    let paramCount = 0;

    if (theme) {
      paramCount++;
      query += ` AND theme LIKE $${paramCount}`;
      values.push(`${theme}%`);
    }

    if (scope) {
      paramCount++;
      if (Array.isArray(scope)) {
        query += ` AND scope = ANY($${paramCount})`;
        values.push(scope);
      } else {
        query += ` AND scope = $${paramCount}`;
        values.push(scope);
      }
    }

    if (options?.tags && options.tags.length > 0) {
      paramCount++;
      query += ` AND tags ?| $${paramCount}`;
      values.push(options.tags);
    }

    if (options?.afterDate) {
      paramCount++;
      query += ` AND created_at >= $${paramCount}`;
      values.push(options.afterDate);
    }

    // Filter by freshness if specified
    if (options?.minFreshness !== undefined) {
      query += ` AND (pinned = true OR (EXTRACT(EPOCH FROM (NOW() - created_at)) * 1000) < COALESCE(ttl, 31536000000))`;
    }

    query += ` ORDER BY created_at DESC`;

    if (options?.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(options.limit);
    }

    const result = await this.db.query(query, values);

    return result.rows.map((row) => this.rowToFrame(row));
  }

  /**
   * Update frame (creates new version)
   */
  async updateFrame(
    frameId: string,
    updates: {
      summary?: string;
      claims?: string[];
      citations?: string[];
      tags?: string[];
    },
    provenance: Provenance
  ): Promise<string> {
    const existing = await this.getFrame(frameId);
    if (!existing) {
      throw new Error(`Frame not found: ${frameId}`);
    }

    // Increment version
    const versionParts = existing.version.match(/v(\d+)\.(\d+)\.(\d+)/);
    if (!versionParts) {
      throw new Error(`Invalid version format: ${existing.version}`);
    }

    const major = parseInt(versionParts[1]);
    const minor = parseInt(versionParts[2]);
    const patch = parseInt(versionParts[3]);

    const newVersion = `v${major}.${minor}.${patch + 1}`;

    const query = `
      UPDATE knowledge_frames
      SET
        summary = COALESCE($1, summary),
        claims = COALESCE($2, claims),
        citations = COALESCE($3, citations),
        tags = COALESCE($4, tags),
        version = $5,
        provenance = $6,
        updated_at = $7
      WHERE id = $8
      RETURNING id
    `;

    const values = [
      updates.summary || null,
      updates.claims ? JSON.stringify(updates.claims) : null,
      updates.citations ? JSON.stringify(updates.citations) : null,
      updates.tags ? JSON.stringify(updates.tags) : null,
      newVersion,
      JSON.stringify(provenance),
      new Date(),
      frameId,
    ];

    await this.db.query(query, values);

    logger.info({ frameId, newVersion }, 'Knowledge frame updated');

    return frameId;
  }

  /**
   * Pin a frame (never expires)
   */
  async pinFrame(frameId: string): Promise<void> {
    const query = `UPDATE knowledge_frames SET pinned = true WHERE id = $1`;
    await this.db.query(query, [frameId]);

    logger.info({ frameId }, 'Frame pinned');
  }

  /**
   * Unpin a frame
   */
  async unpinFrame(frameId: string): Promise<void> {
    const query = `UPDATE knowledge_frames SET pinned = false WHERE id = $1`;
    await this.db.query(query, [frameId]);

    logger.info({ frameId }, 'Frame unpinned');
  }

  /**
   * Delete/forget frames (for privacy/GDPR)
   */
  async forgetFrames(selectors: {
    scope?: MemoryScope;
    theme?: string;
    beforeDate?: Date;
    runId?: string;
    doer?: string;
  }): Promise<number> {
    let query = `DELETE FROM knowledge_frames WHERE 1=1`;
    const values: any[] = [];
    let paramCount = 0;

    if (selectors.scope) {
      paramCount++;
      query += ` AND scope = $${paramCount}`;
      values.push(selectors.scope);
    }

    if (selectors.theme) {
      paramCount++;
      query += ` AND theme LIKE $${paramCount}`;
      values.push(`${selectors.theme}%`);
    }

    if (selectors.beforeDate) {
      paramCount++;
      query += ` AND created_at < $${paramCount}`;
      values.push(selectors.beforeDate);
    }

    if (selectors.runId) {
      paramCount++;
      query += ` AND provenance->>'run_id' = $${paramCount}`;
      values.push(selectors.runId);
    }

    if (selectors.doer) {
      paramCount++;
      query += ` AND provenance->>'who' = $${paramCount}`;
      values.push(selectors.doer);
    }

    // Safety: don't delete pinned frames
    query += ` AND pinned = false`;

    const result = await this.db.query(query, values);

    logger.warn({ count: result.rowCount, selectors }, 'Frames forgotten');

    return result.rowCount || 0;
  }

  /**
   * Calculate freshness score for a frame
   */
  calculateFreshness(frame: KnowledgeFrame, ttlConfig?: number): number {
    if (frame.pinned) {
      return 1.0; // Pinned frames are always fresh
    }

    const now = Date.now();
    const createdTime = frame.createdAt.getTime();
    const age = now - createdTime;

    const ttl = frame.ttl || ttlConfig || 31536000000; // default 365 days

    if (age >= ttl) {
      return 0.0; // Expired
    }

    // Linear decay: 1.0 at creation, 0.0 at TTL
    return 1.0 - age / ttl;
  }

  /**
   * Sign frame for provenance
   */
  private signFrame(frameData: any): string {
    const canonical = JSON.stringify(frameData, Object.keys(frameData).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Add this frame as a child to parent frames
   */
  private async addChildToParents(childId: string, parentIds: string[]): Promise<void> {
    for (const parentId of parentIds) {
      const query = `
        UPDATE knowledge_frames
        SET children = children || $1::jsonb
        WHERE id = $2
      `;

      await this.db.query(query, [JSON.stringify([childId]), parentId]);
    }
  }

  /**
   * Convert database row to KnowledgeFrame
   */
  private rowToFrame(row: any): KnowledgeFrame {
    return {
      id: row.id,
      scope: row.scope,
      theme: row.theme,
      summary: row.summary,
      claims: JSON.parse(row.claims),
      citations: JSON.parse(row.citations),
      parents: JSON.parse(row.parents),
      children: JSON.parse(row.children),
      version: row.version,
      provenance: JSON.parse(row.provenance),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ttl: row.ttl,
      pinned: row.pinned,
      tags: JSON.parse(row.tags || '[]'),
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }
}
