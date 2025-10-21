/**
 * refine.dedup
 *
 * Detects and handles duplicate questions/answers using content hashing.
 *
 * Features:
 * - SHA-256 content hashing
 * - Exact duplicate detection
 * - Near-duplicate detection (fuzzy matching)
 * - Supersedes edge creation
 * - Duplicate merging
 */

import {
  Tool,
  ToolInput,
  ToolOutput,
  ToolMetadata,
  ToolCategory,
} from '../../types';
import { createHash } from 'crypto';
import { Pool } from 'pg';

// ============================================================================
// DEDUP TOOL
// ============================================================================

export class DedupTool implements Tool {
  readonly metadata: ToolMetadata = {
    name: 'refine.dedup',
    description: 'Detect and handle duplicate questions/answers',
    category: ToolCategory.REFINERY,
    version: '1.0.0',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: {
          type: 'string',
          description: 'Question or Answer ID',
        },
        entityType: {
          type: 'string',
          enum: ['question', 'answer'],
          description: 'Type of entity',
        },
        text: {
          type: 'string',
          description: 'Text content',
        },
        contentHash: {
          type: 'string',
          description: 'Pre-computed content hash (optional)',
        },
        fuzzyThreshold: {
          type: 'number',
          description: 'Similarity threshold for fuzzy matching (0-1)',
          default: 0.95,
        },
      },
      required: ['entityId', 'entityType', 'text'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        isDuplicate: { type: 'boolean' },
        duplicateOf: { type: 'string' },
        matchType: { type: 'string' },
        similarityScore: { type: 'number' },
      },
    },
    costUsd: 0.001, // Database query only
  };

  private db: Pool;

  constructor(dbPool: Pool) {
    this.db = dbPool;
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    const startTime = Date.now();
    const {
      entityId,
      entityType,
      text,
      contentHash,
      fuzzyThreshold = 0.95,
    } = input as DedupInput;

    try {
      // Step 1: Generate content hash
      const hash = contentHash || this.generateContentHash(text);

      // Step 2: Check for exact duplicate
      const exactDuplicate = await this.findExactDuplicate(hash, entityType, entityId);

      if (exactDuplicate) {
        return {
          result: {
            isDuplicate: true,
            duplicateOf: exactDuplicate.id,
            matchType: 'exact',
            similarityScore: 1.0,
            contentHash: hash,
          },
          metadata: {
            toolName: this.metadata.name,
            toolVersion: this.metadata.version,
            executionTimeMs: Date.now() - startTime,
            costUsd: this.metadata.costUsd,
          },
        };
      }

      // Step 3: Check for near-duplicates (fuzzy matching)
      const nearDuplicate = await this.findNearDuplicate(
        text,
        entityType,
        entityId,
        fuzzyThreshold
      );

      if (nearDuplicate) {
        return {
          result: {
            isDuplicate: true,
            duplicateOf: nearDuplicate.id,
            matchType: 'fuzzy',
            similarityScore: nearDuplicate.similarity,
            contentHash: hash,
          },
          metadata: {
            toolName: this.metadata.name,
            toolVersion: this.metadata.version,
            executionTimeMs: Date.now() - startTime,
            costUsd: this.metadata.costUsd,
          },
        };
      }

      // No duplicate found
      return {
        result: {
          isDuplicate: false,
          duplicateOf: null,
          matchType: 'none',
          similarityScore: 0,
          contentHash: hash,
        },
        metadata: {
          toolName: this.metadata.name,
          toolVersion: this.metadata.version,
          executionTimeMs: Date.now() - startTime,
          costUsd: this.metadata.costUsd,
        },
      };
    } catch (error) {
      console.error('[Dedup] Error:', error);
      throw error;
    }
  }

  /**
   * Generate SHA-256 content hash
   */
  private generateContentHash(text: string): string {
    // Normalize text before hashing
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Find exact duplicate by content hash
   */
  private async findExactDuplicate(
    hash: string,
    entityType: 'question' | 'answer',
    excludeId: string
  ): Promise<{ id: string } | null> {
    const table = entityType === 'question' ? 'questions' : 'answers';

    const query = `
      SELECT id
      FROM ${table}
      WHERE content_hash = $1
        AND id != $2
      LIMIT 1
    `;

    const result = await this.db.query(query, [hash, excludeId]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Find near-duplicate using fuzzy text matching
   */
  private async findNearDuplicate(
    text: string,
    entityType: 'question' | 'answer',
    excludeId: string,
    threshold: number
  ): Promise<{ id: string; similarity: number } | null> {
    const table = entityType === 'question' ? 'questions' : 'answers';
    const column = entityType === 'question' ? 'text' : 'answer';

    // Use PostgreSQL's pg_trgm extension for fuzzy matching
    const query = `
      SELECT id, similarity(${column}, $1) AS sim
      FROM ${table}
      WHERE id != $2
        AND similarity(${column}, $1) >= $3
      ORDER BY sim DESC
      LIMIT 1
    `;

    try {
      const result = await this.db.query(query, [text, excludeId, threshold]);

      if (result.rows.length > 0) {
        return {
          id: result.rows[0].id,
          similarity: parseFloat(result.rows[0].sim),
        };
      }
    } catch (error) {
      // pg_trgm extension not installed - fall back to simple matching
      console.warn('[Dedup] pg_trgm extension not available, using fallback');
      return this.fallbackFuzzyMatch(text, entityType, excludeId, threshold);
    }

    return null;
  }

  /**
   * Fallback fuzzy matching (without pg_trgm)
   */
  private async fallbackFuzzyMatch(
    text: string,
    entityType: 'question' | 'answer',
    excludeId: string,
    threshold: number
  ): Promise<{ id: string; similarity: number } | null> {
    const table = entityType === 'question' ? 'questions' : 'answers';
    const column = entityType === 'question' ? 'text' : 'answer';

    // Fetch recent entities for comparison
    const query = `
      SELECT id, ${column} AS text
      FROM ${table}
      WHERE id != $1
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const result = await this.db.query(query, [excludeId]);

    let bestMatch: { id: string; similarity: number } | null = null;

    for (const row of result.rows) {
      const similarity = this.calculateSimilarity(text, row.text);
      if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { id: row.id, similarity };
      }
    }

    return bestMatch;
  }

  /**
   * Calculate text similarity (Jaccard index)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const tokens1 = new Set(this.tokenize(text1));
    const tokens2 = new Set(this.tokenize(text2));

    const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / Math.max(union.size, 1);
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2);
  }
}

// ============================================================================
// DEDUP HANDLER
// ============================================================================

/**
 * Handles duplicate entities by creating supersedes edges
 */
export class DedupHandler {
  private db: Pool;

  constructor(dbPool: Pool) {
    this.db = dbPool;
  }

  /**
   * Mark entity as duplicate and create supersedes edge
   */
  async markAsDuplicate(
    duplicateId: string,
    originalId: string,
    entityType: 'question' | 'answer'
  ): Promise<void> {
    // Create supersedes edge: original supersedes duplicate
    const edgeId = `EDGE-${Date.now()}`;

    const query = `
      INSERT INTO km_edges (id, source_node_id, target_node_id, edge_type, created_at)
      VALUES ($1, $2, $3, 'supersedes', NOW())
      ON CONFLICT DO NOTHING
    `;

    await this.db.query(query, [edgeId, originalId, duplicateId]);

    // Mark duplicate as inactive in km_nodes
    const updateQuery = `
      UPDATE km_nodes
      SET status = 'superseded',
          updated_at = NOW()
      WHERE ${entityType === 'question' ? 'question_id' : 'answer_id'} = $1
    `;

    await this.db.query(updateQuery, [duplicateId]);
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface DedupInput {
  entityId: string;
  entityType: 'question' | 'answer';
  text: string;
  contentHash?: string;
  fuzzyThreshold?: number;
}

interface DedupOutput {
  isDuplicate: boolean;
  duplicateOf: string | null;
  matchType: 'exact' | 'fuzzy' | 'none';
  similarityScore: number;
  contentHash: string;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createDedupTool(dbPool: Pool): Tool {
  return new DedupTool(dbPool);
}

export function createDedupHandler(dbPool: Pool): DedupHandler {
  return new DedupHandler(dbPool);
}
