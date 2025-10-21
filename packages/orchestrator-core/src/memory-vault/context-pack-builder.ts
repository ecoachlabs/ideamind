/**
 * Context Pack Builder
 *
 * Builds optimized context packs for RAG queries with budget-aware packing,
 * freshness scoring, and relevance ranking
 */

import { Pool } from 'pg';
import pino from 'pino';
import { ContextPack, MemoryQuery, KnowledgeFrame, MemoryScope } from './types';
import { KnowledgeFrameManager } from './knowledge-frame';

const logger = pino({ name: 'context-pack-builder' });

export interface ContextBuildOptions {
  maxTokens?: number; // Token budget for context
  prioritizeRecent?: boolean;
  compressFrames?: boolean;
  includeArtifacts?: boolean;
}

export class ContextPackBuilder {
  private frameManager: KnowledgeFrameManager;

  // Approximate tokens per frame (simplified)
  private readonly AVG_TOKENS_PER_FRAME = 100;

  constructor(private db: Pool) {
    this.frameManager = new KnowledgeFrameManager(db);
  }

  /**
   * Build a context pack from a memory query
   */
  async buildPack(query: MemoryQuery, options?: ContextBuildOptions): Promise<ContextPack> {
    const startTime = Date.now();

    logger.debug({ query, options }, 'Building context pack');

    // Step 1: Retrieve candidate frames
    const candidates = await this.retrieveCandidates(query);

    logger.debug({ candidates: candidates.length }, 'Retrieved candidate frames');

    // Step 2: Score and rank frames
    const scored = this.scoreFrames(candidates, query, options);

    // Step 3: Pack frames within token budget
    const packed = this.packFrames(scored, options?.maxTokens || 4000);

    logger.debug({ packed: packed.length }, 'Packed frames within budget');

    // Step 4: Calculate freshness score
    const freshnessScore = this.calculatePackFreshness(packed);

    // Step 5: Extract citations and artifacts
    const citations = this.extractCitations(packed);
    const artifacts = options?.includeArtifacts ? this.extractArtifacts(packed) : [];

    // Step 6: Generate policy hints
    const policyHints = this.generatePolicyHints(packed, query);

    const queryTime = Date.now() - startTime;

    const contextPack: ContextPack = {
      frames: packed,
      artifacts,
      citations,
      freshnessScore,
      policyHints,
      metadata: {
        queryTime,
        tokensUsed: this.estimateTokens(packed),
        cacheHit: false, // Would check CAS cache in production
      },
    };

    logger.info(
      {
        frames: packed.length,
        freshness: freshnessScore.toFixed(3),
        tokens: contextPack.metadata?.tokensUsed,
        time: queryTime,
      },
      'Context pack built'
    );

    return contextPack;
  }

  /**
   * Retrieve candidate frames for query
   */
  private async retrieveCandidates(query: MemoryQuery): Promise<KnowledgeFrame[]> {
    const scope = query.scope
      ? Array.isArray(query.scope)
        ? query.scope
        : [query.scope]
      : undefined;

    const frames = await this.frameManager.queryFrames(query.theme, scope, {
      limit: query.k ? query.k * 3 : 36, // Retrieve 3x for ranking
      minFreshness: query.filters?.minFreshness,
      tags: query.filters?.tags,
      afterDate: query.filters?.afterDate,
    });

    // Additional filtering
    let filtered = frames;

    if (query.filters?.minGrounding !== undefined) {
      // Would filter by grounding score if available in metadata
      // For now, we assume all frames meet minimum grounding
    }

    if (query.filters?.beforeDate) {
      filtered = filtered.filter((f) => f.createdAt <= query.filters!.beforeDate!);
    }

    return filtered;
  }

  /**
   * Score frames by relevance, freshness, and other factors
   */
  private scoreFrames(
    frames: KnowledgeFrame[],
    query: MemoryQuery,
    options?: ContextBuildOptions
  ): Array<{ frame: KnowledgeFrame; score: number }> {
    const scored = frames.map((frame) => {
      let score = 0;

      // Relevance score (theme match)
      if (query.theme && frame.theme.startsWith(query.theme)) {
        score += 10;

        // Exact match bonus
        if (frame.theme === query.theme) {
          score += 5;
        }
      }

      // Freshness score
      const freshness = this.frameManager.calculateFreshness(frame);
      score += freshness * 5;

      // Scope priority (tenant > run > global > ephemeral for most queries)
      const scopeWeight = this.getScopeWeight(frame.scope, query.scope);
      score += scopeWeight;

      // Doer match
      if (query.doer && frame.provenance.who === query.doer) {
        score += 3;
      }

      // Phase match
      if (query.phase && frame.theme.includes(query.phase)) {
        score += 2;
      }

      // Pinned frames get bonus
      if (frame.pinned) {
        score += 5;
      }

      // Citation count (more citations = more grounded)
      score += Math.min(frame.citations.length * 0.5, 5);

      return { frame, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored;
  }

  /**
   * Get scope weight for prioritization
   */
  private getScopeWeight(frameScope: MemoryScope, queryScope?: MemoryScope | MemoryScope[]): number {
    const queryScopeArray = queryScope
      ? Array.isArray(queryScope)
        ? queryScope
        : [queryScope]
      : [];

    // If query specifies scopes, prioritize those
    if (queryScopeArray.length > 0) {
      return queryScopeArray.includes(frameScope) ? 10 : 0;
    }

    // Default priority: tenant > run > global > ephemeral
    switch (frameScope) {
      case 'tenant':
        return 8;
      case 'run':
        return 6;
      case 'global':
        return 4;
      case 'ephemeral':
        return 2;
      default:
        return 0;
    }
  }

  /**
   * Pack frames within token budget
   */
  private packFrames(
    scored: Array<{ frame: KnowledgeFrame; score: number }>,
    maxTokens: number
  ): KnowledgeFrame[] {
    const packed: KnowledgeFrame[] = [];
    let usedTokens = 0;

    for (const { frame } of scored) {
      const frameTokens = this.estimateFrameTokens(frame);

      if (usedTokens + frameTokens <= maxTokens) {
        packed.push(frame);
        usedTokens += frameTokens;
      } else {
        break;
      }
    }

    return packed;
  }

  /**
   * Estimate tokens for a frame
   */
  private estimateFrameTokens(frame: KnowledgeFrame): number {
    // Simplified token estimation
    // In production, use proper tokenizer

    let tokens = 0;

    // Summary
    tokens += Math.ceil(frame.summary.length / 4);

    // Claims
    for (const claim of frame.claims) {
      tokens += Math.ceil(claim.length / 4);
    }

    // Citations (metadata)
    tokens += frame.citations.length * 5;

    return tokens;
  }

  /**
   * Estimate total tokens for packed frames
   */
  private estimateTokens(frames: KnowledgeFrame[]): number {
    return frames.reduce((sum, frame) => sum + this.estimateFrameTokens(frame), 0);
  }

  /**
   * Calculate freshness score for the pack
   */
  private calculatePackFreshness(frames: KnowledgeFrame[]): number {
    if (frames.length === 0) return 0;

    const freshnessScores = frames.map((f) => this.frameManager.calculateFreshness(f));

    // Average freshness
    return freshnessScores.reduce((sum, score) => sum + score, 0) / freshnessScores.length;
  }

  /**
   * Extract all citations from frames
   */
  private extractCitations(frames: KnowledgeFrame[]): string[] {
    const allCitations = new Set<string>();

    for (const frame of frames) {
      for (const citation of frame.citations) {
        allCitations.add(citation);
      }
    }

    return Array.from(allCitations);
  }

  /**
   * Extract artifacts from frames
   */
  private extractArtifacts(frames: KnowledgeFrame[]): string[] {
    const artifacts = new Set<string>();

    for (const frame of frames) {
      // Extract artifact URIs from citations
      for (const citation of frame.citations) {
        if (citation.startsWith('artifact:') || citation.startsWith('uri:')) {
          artifacts.add(citation.replace(/^(artifact:|uri:)/, ''));
        }
      }
    }

    return Array.from(artifacts);
  }

  /**
   * Generate policy hints from frames
   */
  private generatePolicyHints(
    frames: KnowledgeFrame[],
    query: MemoryQuery
  ): {
    recommendedModel?: string;
    temperature?: number;
    maxTokens?: number;
  } {
    const hints: {
      recommendedModel?: string;
      temperature?: number;
      maxTokens?: number;
    } = {};

    // Check if frames suggest specific model preferences
    for (const frame of frames) {
      if (frame.metadata?.recommendedModel) {
        hints.recommendedModel = frame.metadata.recommendedModel;
        break;
      }
    }

    // Suggest temperature based on query type
    if (query.need === 'code') {
      hints.temperature = 0.2; // Low temperature for code generation
      hints.maxTokens = 8000;
    } else if (query.need === 'citation') {
      hints.temperature = 0.1; // Very low for factual retrieval
      hints.maxTokens = 4000;
    }

    return hints;
  }

  /**
   * Compress frames for smaller token budget
   */
  compressFrames(frames: KnowledgeFrame[]): KnowledgeFrame[] {
    // Simplified compression: just keep claims, drop metadata
    return frames.map((frame) => ({
      ...frame,
      summary: frame.claims.length > 0 ? frame.claims[0].substring(0, 100) : frame.summary,
      metadata: {},
    }));
  }
}
