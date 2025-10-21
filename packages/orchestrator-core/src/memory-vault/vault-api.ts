/**
 * Memory Vault API
 *
 * Unified API for all memory vault operations
 */

import { Pool } from 'pg';
import pino from 'pino';
import {
  KnowledgeFrame,
  ContextPack,
  MemoryQuery,
  IngestFrameRequest,
  IngestQABindingRequest,
  IngestArtifactRequest,
  IngestSignalRequest,
  MemorySuggestRequest,
  UpdateTTLRequest,
  PinRequest,
  ForgetRequest,
  MemoryTopic,
  Provenance,
} from './types';
import { KnowledgeFrameManager } from './knowledge-frame';
import { QABindingManager } from './qa-binding';
import { KnowledgeRefinery } from './refinery';
import { ContextPackBuilder } from './context-pack-builder';
import { MemoryBroker } from './memory-broker';
import { MemoryGate, MemoryGateConfig } from './memory-gate';
import { GroundingGuard } from './guards/grounding-guard';
import { ContradictionGuard } from './guards/contradiction-guard';

const logger = pino({ name: 'vault-api' });

export class MemoryVaultAPI {
  private frameManager: KnowledgeFrameManager;
  private qaManager: QABindingManager;
  private refinery: KnowledgeRefinery;
  private contextBuilder: ContextPackBuilder;
  private broker: MemoryBroker;
  private gate: MemoryGate;
  private groundingGuard: GroundingGuard;
  private contradictionGuard: ContradictionGuard;

  constructor(private db: Pool) {
    this.frameManager = new KnowledgeFrameManager(db);
    this.qaManager = new QABindingManager(db);
    this.refinery = new KnowledgeRefinery(db);
    this.contextBuilder = new ContextPackBuilder(db);
    this.broker = new MemoryBroker(db);
    this.gate = new MemoryGate(db);
    this.groundingGuard = new GroundingGuard(db);
    this.contradictionGuard = new ContradictionGuard(db);
  }

  /**
   * Initialize the vault (load subscriptions, etc.)
   */
  async initialize(): Promise<void> {
    await this.broker.loadSubscriptions();
    logger.info('Memory Vault initialized');
  }

  // ============================================================================
  // Ingest APIs
  // ============================================================================

  /**
   * Ingest knowledge frame
   */
  async ingestFrame(request: IngestFrameRequest): Promise<string> {
    logger.debug({ theme: request.frame.theme }, 'Ingesting frame');

    const frameId = await this.frameManager.createFrame(
      request.frame.scope,
      request.frame.theme,
      request.frame.summary,
      request.frame.claims,
      request.frame.citations,
      request.frame.provenance,
      {
        parents: request.frame.parents,
        version: request.frame.version,
        ttl: request.frame.ttl,
        pinned: request.frame.pinned,
        tags: request.frame.tags,
      }
    );

    // Publish creation event
    const frame = await this.frameManager.getFrame(frameId);
    if (frame) {
      await this.broker.publishFrameCreated([frame]);
    }

    return frameId;
  }

  /**
   * Ingest QA binding
   */
  async ingestQABinding(request: IngestQABindingRequest): Promise<string> {
    logger.debug('Ingesting QA binding');

    const qid = await this.qaManager.createBinding(request.q, request.a, {
      validatorScore: request.v,
      phase: request.phase,
      runId: request.runId,
      doer: request.doer,
      citations: request.citations,
    });

    return qid;
  }

  /**
   * Ingest artifact (store metadata)
   */
  async ingestArtifact(request: IngestArtifactRequest): Promise<string> {
    logger.debug({ type: request.type, uri: request.uri }, 'Ingesting artifact');

    const query = `
      INSERT INTO artifacts (type, uri, sha256, phase, run_id, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    const result = await this.db.query(query, [
      request.type,
      request.uri,
      request.sha256,
      request.phase,
      request.runId,
      JSON.stringify(request.metadata || {}),
      new Date(),
    ]);

    return result.rows[0].id;
  }

  /**
   * Ingest signal (telemetry/metrics)
   */
  async ingestSignal(request: IngestSignalRequest): Promise<string> {
    logger.debug({ runId: request.signal.runId }, 'Ingesting signal');

    const query = `
      INSERT INTO signals (
        run_id, task_id, gate_scores, cost, time, model, tool, metadata, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;

    const result = await this.db.query(query, [
      request.signal.runId,
      request.signal.taskId || null,
      JSON.stringify(request.signal.gateScores || {}),
      request.signal.cost || null,
      request.signal.time || null,
      request.signal.model || null,
      request.signal.tool || null,
      JSON.stringify(request.signal.metadata || {}),
      new Date(),
    ]);

    return result.rows[0].id;
  }

  /**
   * Ingest and refine raw knowledge
   */
  async ingestAndRefine(
    rawKnowledge: Array<{
      text: string;
      citations: string[];
      theme: string;
      scope: 'ephemeral' | 'run' | 'tenant' | 'global';
      provenance: Provenance;
    }>
  ): Promise<{
    frameIds: string[];
    stats: { fissioned: number; fused: number; rejected: number };
  }> {
    logger.info({ count: rawKnowledge.length }, 'Ingesting and refining raw knowledge');

    const result = await this.refinery.refine(rawKnowledge);

    logger.info({ stats: result.stats }, 'Refinery processing complete');

    // Publish created frames
    if (result.frames.length > 0) {
      await this.broker.publishFrameCreated(result.frames);
    }

    return {
      frameIds: result.frames.map((f) => f.id),
      stats: result.stats,
    };
  }

  // ============================================================================
  // Query APIs
  // ============================================================================

  /**
   * Query memory vault for context pack
   */
  async query(query: MemoryQuery): Promise<ContextPack> {
    logger.info({ query }, 'Querying memory vault');

    const pack = await this.contextBuilder.buildPack(query, {
      maxTokens: 4000,
      prioritizeRecent: true,
      includeArtifacts: true,
    });

    return pack;
  }

  /**
   * Suggest knowledge for a task
   */
  async suggest(request: MemorySuggestRequest): Promise<ContextPack> {
    logger.info({ doer: request.doer, phase: request.phase }, 'Suggesting knowledge');

    // Build query based on doer/phase/task
    const query: MemoryQuery = {
      doer: request.doer,
      phase: request.phase,
      scope: ['tenant', 'run', 'global'],
      k: 12,
      filters: {
        minFreshness: 0.7,
      },
    };

    return this.query(query);
  }

  // ============================================================================
  // Subscribe APIs
  // ============================================================================

  /**
   * Subscribe to memory updates
   */
  async subscribe(
    topic: MemoryTopic | string,
    options?: {
      doer?: string;
      phase?: string;
      theme?: string;
      callback?: string;
    }
  ): Promise<string> {
    return this.broker.subscribe(topic, options);
  }

  /**
   * Unsubscribe from updates
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    return this.broker.unsubscribe(subscriptionId);
  }

  /**
   * Get delta stream
   */
  async getDeltaStream(cursor?: number, limit?: number): Promise<any[]> {
    return this.broker.getDeltaStream(cursor, limit);
  }

  // ============================================================================
  // Admin APIs
  // ============================================================================

  /**
   * Update TTL for scope/theme
   */
  async updateTTL(request: UpdateTTLRequest): Promise<void> {
    logger.info({ scope: request.scope, theme: request.theme, ttl: request.ttl }, 'Updating TTL');

    let query = `UPDATE knowledge_frames SET ttl = $1 WHERE scope = $2`;
    const values: any[] = [request.ttl, request.scope];

    if (request.theme) {
      query += ` AND theme LIKE $3`;
      values.push(`${request.theme}%`);
    }

    await this.db.query(query, values);
  }

  /**
   * Pin a frame or artifact
   */
  async pin(request: PinRequest): Promise<void> {
    if (request.frameId) {
      logger.info({ frameId: request.frameId }, 'Pinning frame');
      await this.frameManager.pinFrame(request.frameId);
    }

    if (request.artifactId) {
      logger.info({ artifactId: request.artifactId }, 'Pinning artifact');
      // Would pin artifact (set pinned = true in artifacts table)
    }
  }

  /**
   * Forget/delete knowledge (GDPR, right-to-forget)
   */
  async forget(request: ForgetRequest): Promise<number> {
    logger.warn({ selectors: request.selectors, reason: request.reason }, 'Forgetting knowledge');

    const count = await this.frameManager.forgetFrames(request.selectors);

    return count;
  }

  // ============================================================================
  // Quality Gates
  // ============================================================================

  /**
   * Check memory gate
   */
  async checkGate(config: MemoryGateConfig): Promise<any> {
    return this.gate.check(config);
  }

  /**
   * Check grounding for a frame
   */
  async checkGrounding(frameId: string): Promise<any> {
    const frame = await this.frameManager.getFrame(frameId);
    if (!frame) {
      throw new Error(`Frame not found: ${frameId}`);
    }

    return this.groundingGuard.checkGrounding(frame);
  }

  /**
   * Check contradictions for a frame
   */
  async checkContradictions(frameId: string): Promise<any> {
    const frame = await this.frameManager.getFrame(frameId);
    if (!frame) {
      throw new Error(`Frame not found: ${frameId}`);
    }

    return this.contradictionGuard.checkContradictions(frame);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get broker for event subscription
   */
  getBroker(): MemoryBroker {
    return this.broker;
  }

  /**
   * Get frame manager
   */
  getFrameManager(): KnowledgeFrameManager {
    return this.frameManager;
  }

  /**
   * Get QA manager
   */
  getQAManager(): QABindingManager {
    return this.qaManager;
  }
}
