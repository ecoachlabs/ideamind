/**
 * Continuation Manager - Resume Long-Running Activities
 *
 * Spec: orchestrator.txt:6 (Execution Model)
 * "Long-running Activities: chunked with continuation tokens;
 * each chunk must checkpoint"
 *
 * **Purpose:**
 * Support 20-50 hour runs by chunking long activities into
 * smaller resumable units. Each chunk saves a continuation token
 * that captures the execution state.
 *
 * **Use Cases:**
 * - Story Loop: Generate 100+ stories in chunks of 10
 * - Large file processing: Process 10k files in batches
 * - Multi-phase builds: Build microservices one at a time
 * - Massive test suites: Run tests in parallel batches
 */

import pino from 'pino';
import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { Recorder } from '../recorder/recorder';
import { CheckpointManager } from '../checkpoint/checkpoint-manager';

const logger = pino({ name: 'continuation-manager' });

/**
 * Continuation token
 * Contains all state needed to resume execution
 */
export interface ContinuationToken {
  id: string;
  runId: string;
  phase: string;
  activityId: string;
  activityType: string;
  chunkIndex: number;
  totalChunks: number;
  state: Record<string, any>; // Execution state
  processedItems: string[]; // Items already processed
  remainingItems: string[]; // Items yet to process
  progress: number; // 0.0 to 1.0
  createdAt: Date;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Activity chunk configuration
 */
export interface ActivityChunkConfig {
  chunkSize: number; // Items per chunk
  maxChunks?: number; // Maximum chunks (safety limit)
  chunkTimeout: number; // Timeout per chunk (ms)
  checkpointInterval?: number; // Checkpoint every N chunks
}

/**
 * Chunked activity definition
 */
export interface ChunkedActivity<TInput, TOutput> {
  id: string;
  runId: string;
  phase: string;
  type: string;
  totalItems: string[]; // All items to process
  chunkConfig: ActivityChunkConfig;
  processChunk: (items: string[], state: Record<string, any>) => Promise<{
    results: TOutput[];
    newState: Record<string, any>;
  }>;
  validateChunk?: (results: TOutput[]) => boolean;
  onChunkComplete?: (chunkIndex: number, results: TOutput[]) => Promise<void>;
  onActivityComplete?: (allResults: TOutput[]) => Promise<void>;
}

/**
 * Continuation Manager
 *
 * Manages chunked execution of long-running activities with
 * continuation tokens for resumability.
 */
export class ContinuationManager extends EventEmitter {
  private activeActivities: Map<string, ChunkedActivity<any, any>> = new Map();
  private continuationTokens: Map<string, ContinuationToken> = new Map();

  constructor(
    private db: Pool,
    private recorder: Recorder,
    private checkpointManager: CheckpointManager
  ) {
    super();
  }

  /**
   * Execute a chunked activity
   *
   * Breaks the activity into chunks and processes them sequentially,
   * creating continuation tokens between chunks for resumability.
   *
   * @param activity - Chunked activity definition
   * @param continuationToken - Optional token to resume from
   * @returns All results from all chunks
   */
  async executeChunked<TInput, TOutput>(
    activity: ChunkedActivity<TInput, TOutput>,
    continuationToken?: ContinuationToken
  ): Promise<TOutput[]> {
    const startTime = Date.now();

    logger.info(
      {
        activityId: activity.id,
        runId: activity.runId,
        phase: activity.phase,
        totalItems: activity.totalItems.length,
        chunkSize: activity.chunkConfig.chunkSize,
        resuming: !!continuationToken,
      },
      'Starting chunked activity'
    );

    this.activeActivities.set(activity.id, activity);

    let state: Record<string, any> = {};
    let processedItems: string[] = [];
    let allResults: TOutput[] = [];
    let chunkIndex = 0;

    // Resume from continuation token if provided
    if (continuationToken) {
      state = continuationToken.state;
      processedItems = continuationToken.processedItems;
      chunkIndex = continuationToken.chunkIndex;

      logger.info(
        {
          chunkIndex,
          progress: continuationToken.progress,
        },
        'Resuming from continuation token'
      );

      this.emit('activity.resumed', {
        activityId: activity.id,
        chunkIndex,
        progress: continuationToken.progress,
      });
    }

    // Calculate chunks
    const remainingItems = activity.totalItems.filter(
      (item) => !processedItems.includes(item)
    );

    const chunks = this.createChunks(
      remainingItems,
      activity.chunkConfig.chunkSize
    );

    const totalChunks = chunks.length;

    logger.debug(
      {
        totalChunks,
        remainingItems: remainingItems.length,
      },
      'Chunks calculated'
    );

    // Safety check
    if (
      activity.chunkConfig.maxChunks &&
      totalChunks > activity.chunkConfig.maxChunks
    ) {
      throw new Error(
        `Too many chunks: ${totalChunks} > ${activity.chunkConfig.maxChunks} (maxChunks)`
      );
    }

    this.emit('activity.started', {
      activityId: activity.id,
      runId: activity.runId,
      totalChunks,
    });

    // Process chunks sequentially
    for (let i = 0; i < chunks.length; i++) {
      const currentChunkIndex = chunkIndex + i;
      const chunk = chunks[i];

      logger.debug(
        {
          chunkIndex: currentChunkIndex,
          chunkSize: chunk.length,
          totalChunks,
        },
        'Processing chunk'
      );

      const chunkStartTime = Date.now();

      try {
        // Execute chunk with timeout
        const chunkResult = await this.executeWithTimeout(
          () => activity.processChunk(chunk, state),
          activity.chunkConfig.chunkTimeout
        );

        const chunkDuration = Date.now() - chunkStartTime;

        // Validate chunk results if validator provided
        if (activity.validateChunk) {
          const isValid = activity.validateChunk(chunkResult.results);
          if (!isValid) {
            throw new Error(`Chunk ${currentChunkIndex} validation failed`);
          }
        }

        // Update state
        state = chunkResult.newState;
        processedItems.push(...chunk);
        allResults.push(...chunkResult.results);

        // Calculate progress
        const progress = processedItems.length / activity.totalItems.length;

        logger.debug(
          {
            chunkIndex: currentChunkIndex,
            progress: (progress * 100).toFixed(1) + '%',
            durationMs: chunkDuration,
          },
          'Chunk completed'
        );

        this.emit('activity.chunk.completed', {
          activityId: activity.id,
          chunkIndex: currentChunkIndex,
          progress,
          durationMs: chunkDuration,
        });

        // Call chunk completion callback if provided
        if (activity.onChunkComplete) {
          await activity.onChunkComplete(currentChunkIndex, chunkResult.results);
        }

        // Create continuation token for next chunk
        if (i < chunks.length - 1) {
          const token = await this.createContinuationToken({
            runId: activity.runId,
            phase: activity.phase,
            activityId: activity.id,
            activityType: activity.type,
            chunkIndex: currentChunkIndex + 1,
            totalChunks,
            state,
            processedItems,
            remainingItems: activity.totalItems.filter(
              (item) => !processedItems.includes(item)
            ),
            progress,
          });

          logger.debug(
            {
              tokenId: token.id,
              chunkIndex: currentChunkIndex + 1,
            },
            'Continuation token created'
          );
        }

        // Create checkpoint at intervals
        if (
          activity.chunkConfig.checkpointInterval &&
          (currentChunkIndex + 1) % activity.chunkConfig.checkpointInterval === 0
        ) {
          await this.checkpointManager.saveCheckpoint({
            id: `${activity.runId}-${activity.phase}-chunk-${currentChunkIndex}`,
            runId: activity.runId,
            phase: activity.phase,
            state: {
              activityId: activity.id,
              chunkIndex: currentChunkIndex + 1,
              processedItems,
              state,
              allResults,
            },
            createdAt: new Date(),
            createdBy: 'ContinuationManager',
          });

          logger.debug(
            {
              chunkIndex: currentChunkIndex + 1,
            },
            'Checkpoint created'
          );
        }

        // Record chunk completion
        await this.recorder.recordStep({
          runId: activity.runId,
          phase: activity.phase,
          step: `activity.chunk.${currentChunkIndex}`,
          actor: 'ContinuationManager',
          outputs: chunkResult.results.map((r: any) => r.id || `result-${i}`),
          cost: { usd: 0, tokens: 0 },
          latency_ms: chunkDuration,
          status: 'succeeded',
          metadata: {
            activityId: activity.id,
            chunkIndex: currentChunkIndex,
            chunkSize: chunk.length,
            progress,
          },
        });
      } catch (error: any) {
        logger.error(
          {
            error,
            chunkIndex: currentChunkIndex,
          },
          'Chunk processing failed'
        );

        // Create continuation token for retry
        const failureToken = await this.createContinuationToken({
          runId: activity.runId,
          phase: activity.phase,
          activityId: activity.id,
          activityType: activity.type,
          chunkIndex: currentChunkIndex, // Retry this chunk
          totalChunks,
          state,
          processedItems,
          remainingItems: activity.totalItems.filter(
            (item) => !processedItems.includes(item)
          ),
          progress: processedItems.length / activity.totalItems.length,
        });

        this.emit('activity.chunk.failed', {
          activityId: activity.id,
          chunkIndex: currentChunkIndex,
          error: error.message,
          continuationToken: failureToken.id,
        });

        // Record chunk failure
        await this.recorder.recordStep({
          runId: activity.runId,
          phase: activity.phase,
          step: `activity.chunk.${currentChunkIndex}`,
          actor: 'ContinuationManager',
          cost: { usd: 0, tokens: 0 },
          latency_ms: Date.now() - chunkStartTime,
          status: 'failed',
          metadata: {
            activityId: activity.id,
            chunkIndex: currentChunkIndex,
            error: error.message,
            continuationToken: failureToken.id,
          },
        });

        throw new Error(
          `Activity chunk ${currentChunkIndex} failed: ${error.message}. Continuation token: ${failureToken.id}`
        );
      }
    }

    // Activity completed
    const totalDuration = Date.now() - startTime;

    logger.info(
      {
        activityId: activity.id,
        totalChunks,
        totalResults: allResults.length,
        durationMs: totalDuration,
      },
      'Chunked activity completed'
    );

    this.emit('activity.completed', {
      activityId: activity.id,
      runId: activity.runId,
      totalChunks,
      totalResults: allResults.length,
      durationMs: totalDuration,
    });

    // Call activity completion callback if provided
    if (activity.onActivityComplete) {
      await activity.onActivityComplete(allResults);
    }

    // Record activity completion
    await this.recorder.recordStep({
      runId: activity.runId,
      phase: activity.phase,
      step: `activity.${activity.id}.completed`,
      actor: 'ContinuationManager',
      outputs: allResults.map((r: any) => r.id || 'result'),
      cost: { usd: 0, tokens: 0 },
      latency_ms: totalDuration,
      status: 'succeeded',
      metadata: {
        activityId: activity.id,
        totalChunks,
        totalResults: allResults.length,
      },
    });

    this.activeActivities.delete(activity.id);

    return allResults;
  }

  /**
   * Create a continuation token
   */
  async createContinuationToken(
    params: Omit<ContinuationToken, 'id' | 'createdAt' | 'expiresAt'>
  ): Promise<ContinuationToken> {
    const tokenId = `ct-${params.runId}-${params.activityId}-${params.chunkIndex}-${Date.now()}`;

    const token: ContinuationToken = {
      id: tokenId,
      ...params,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };

    // Store in memory
    this.continuationTokens.set(tokenId, token);

    // Persist to database
    await this.db.query(
      `
      INSERT INTO continuation_tokens (
        token_id, run_id, phase, activity_id, activity_type,
        chunk_index, total_chunks, state, processed_items,
        remaining_items, progress, created_at, expires_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `,
      [
        token.id,
        token.runId,
        token.phase,
        token.activityId,
        token.activityType,
        token.chunkIndex,
        token.totalChunks,
        JSON.stringify(token.state),
        token.processedItems,
        token.remainingItems,
        token.progress,
        token.createdAt,
        token.expiresAt,
        JSON.stringify(token.metadata || {}),
      ]
    );

    logger.debug({ tokenId, chunkIndex: token.chunkIndex }, 'Continuation token created');

    return token;
  }

  /**
   * Get continuation token by ID
   */
  async getContinuationToken(tokenId: string): Promise<ContinuationToken | null> {
    // Check in-memory cache first
    const cached = this.continuationTokens.get(tokenId);
    if (cached) {
      return cached;
    }

    // Query database
    const result = await this.db.query(
      `SELECT * FROM continuation_tokens WHERE token_id = $1`,
      [tokenId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    const token: ContinuationToken = {
      id: row.token_id,
      runId: row.run_id,
      phase: row.phase,
      activityId: row.activity_id,
      activityType: row.activity_type,
      chunkIndex: row.chunk_index,
      totalChunks: row.total_chunks,
      state: row.state,
      processedItems: row.processed_items,
      remainingItems: row.remaining_items,
      progress: parseFloat(row.progress),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      metadata: row.metadata,
    };

    // Cache it
    this.continuationTokens.set(tokenId, token);

    return token;
  }

  /**
   * Create chunks from items
   */
  private createChunks<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];

    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }

    return chunks;
  }

  /**
   * Execute with timeout
   */
  private executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Chunk timeout')), timeoutMs)
      ),
    ]);
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM continuation_tokens WHERE expires_at < NOW() RETURNING token_id`
    );

    const deletedCount = result.rowCount || 0;

    // Remove from cache
    for (const row of result.rows) {
      this.continuationTokens.delete(row.token_id);
    }

    if (deletedCount > 0) {
      logger.info({ deletedCount }, 'Expired continuation tokens cleaned up');
    }

    return deletedCount;
  }

  /**
   * Get activity statistics
   */
  async getStats(runId?: string): Promise<{
    active_activities: number;
    total_tokens: number;
    active_tokens: number;
    expired_tokens: number;
  }> {
    const whereClause = runId ? 'WHERE run_id = $1' : '';
    const params = runId ? [runId] : [];

    const result = await this.db.query(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN expires_at > NOW() THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN expires_at <= NOW() THEN 1 ELSE 0 END) as expired
      FROM continuation_tokens
      ${whereClause}
    `,
      params
    );

    const row = result.rows[0];

    return {
      active_activities: this.activeActivities.size,
      total_tokens: parseInt(row.total, 10),
      active_tokens: parseInt(row.active, 10),
      expired_tokens: parseInt(row.expired, 10),
    };
  }
}
