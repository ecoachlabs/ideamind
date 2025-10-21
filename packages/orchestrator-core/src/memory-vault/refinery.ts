/**
 * Knowledge Refinery
 *
 * Performs fission (split compound knowledge) and fusion (merge duplicates)
 * to create clean, atomic knowledge frames
 */

import { Pool } from 'pg';
import pino from 'pino';
import crypto from 'crypto';
import { KnowledgeFrame, RefineryResult, ConflictReport, Provenance, MemoryScope } from './types';
import { KnowledgeFrameManager } from './knowledge-frame';

const logger = pino({ name: 'refinery' });

export class KnowledgeRefinery {
  private frameManager: KnowledgeFrameManager;

  constructor(private db: Pool) {
    this.frameManager = new KnowledgeFrameManager(db);
  }

  /**
   * Process raw knowledge through fission and fusion
   */
  async refine(
    rawKnowledge: {
      text: string;
      citations: string[];
      theme: string;
      scope: MemoryScope;
      provenance: Provenance;
    }[]
  ): Promise<RefineryResult> {
    const stats = {
      fissioned: 0,
      fused: 0,
      rejected: 0,
    };

    const processedFrames: KnowledgeFrame[] = [];
    const conflicts: ConflictReport[] = [];

    logger.info({ count: rawKnowledge.length }, 'Starting refinery processing');

    // Step 1: Fission - split compound knowledge into atomic frames
    const atomicFrames: Array<{
      theme: string;
      scope: MemoryScope;
      claims: string[];
      citations: string[];
      provenance: Provenance;
    }> = [];

    for (const raw of rawKnowledge) {
      const split = await this.fission(raw.text);
      stats.fissioned += split.length;

      for (const claim of split) {
        atomicFrames.push({
          theme: raw.theme,
          scope: raw.scope,
          claims: [claim],
          citations: raw.citations,
          provenance: raw.provenance,
        });
      }
    }

    logger.debug({ atomicFrames: atomicFrames.length }, 'Fission complete');

    // Step 2: Fusion - merge duplicate/similar frames
    const fusedFrames = await this.fusion(atomicFrames);
    stats.fused = atomicFrames.length - fusedFrames.length;

    logger.debug({ fusedFrames: fusedFrames.length, merged: stats.fused }, 'Fusion complete');

    // Step 3: Validation - check for contradictions and quality
    for (const frame of fusedFrames) {
      const validation = await this.validate(frame);

      if (!validation.valid) {
        stats.rejected++;
        logger.warn({ theme: frame.theme, reason: validation.reason }, 'Frame rejected');

        if (validation.conflicts) {
          conflicts.push({
            frameIds: validation.conflicts.frameIds,
            claims: frame.claims,
            resolution: 'quarantined',
            metadata: { reason: validation.reason },
          });
        }

        continue;
      }

      // Create the frame
      const summary = this.generateSummary(frame.claims);
      const frameId = await this.frameManager.createFrame(
        frame.scope,
        frame.theme,
        summary,
        frame.claims,
        frame.citations,
        frame.provenance,
        {
          version: 'v1.0.0',
        }
      );

      const createdFrame = await this.frameManager.getFrame(frameId);
      if (createdFrame) {
        processedFrames.push(createdFrame);
      }
    }

    logger.info(
      {
        processed: processedFrames.length,
        fissioned: stats.fissioned,
        fused: stats.fused,
        rejected: stats.rejected,
      },
      'Refinery processing complete'
    );

    return {
      frames: processedFrames,
      conflicts,
      stats,
    };
  }

  /**
   * Fission: Split compound text into atomic claims
   */
  private async fission(text: string): Promise<string[]> {
    // Simple sentence-based splitting for now
    // In production, this would use NLP/LLM for semantic chunking

    const claims: string[] = [];

    // Split by sentence boundaries
    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0);

    for (const sentence of sentences) {
      // Skip very short sentences
      if (sentence.length < 10) continue;

      // Check if sentence contains multiple claims (e.g., "and", "also", "furthermore")
      const connectors = ['and', 'also', 'furthermore', 'additionally', 'moreover'];
      let hasSplitter = false;

      for (const connector of connectors) {
        if (sentence.toLowerCase().includes(` ${connector} `)) {
          hasSplitter = true;
          break;
        }
      }

      if (hasSplitter) {
        // Split on connectors (simplified)
        const subClaims = sentence.split(/\s+(and|also|furthermore|additionally|moreover)\s+/i);
        for (let i = 0; i < subClaims.length; i += 2) {
          // Skip connector words
          const claim = subClaims[i].trim();
          if (claim.length > 10) {
            claims.push(claim);
          }
        }
      } else {
        claims.push(sentence);
      }
    }

    return claims;
  }

  /**
   * Fusion: Merge duplicate/similar frames
   */
  private async fusion(
    frames: Array<{
      theme: string;
      scope: MemoryScope;
      claims: string[];
      citations: string[];
      provenance: Provenance;
    }>
  ): Promise<
    Array<{
      theme: string;
      scope: MemoryScope;
      claims: string[];
      citations: string[];
      provenance: Provenance;
    }>
  > {
    const merged: Map<
      string,
      {
        theme: string;
        scope: MemoryScope;
        claims: string[];
        citations: string[];
        provenance: Provenance;
      }
    > = new Map();

    for (const frame of frames) {
      const key = this.computeFrameKey(frame);

      if (merged.has(key)) {
        // Merge with existing
        const existing = merged.get(key)!;

        // Combine claims (deduplicated)
        existing.claims = [...new Set([...existing.claims, ...frame.claims])];

        // Combine citations (deduplicated)
        existing.citations = [...new Set([...existing.citations, ...frame.citations])];
      } else {
        merged.set(key, {
          theme: frame.theme,
          scope: frame.scope,
          claims: [...frame.claims],
          citations: [...frame.citations],
          provenance: frame.provenance,
        });
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Compute key for frame deduplication
   */
  private computeFrameKey(frame: {
    theme: string;
    scope: MemoryScope;
    claims: string[];
  }): string {
    // Normalize claims for comparison
    const normalized = frame.claims
      .map((c) => c.toLowerCase().trim())
      .sort()
      .join('|');

    const content = `${frame.scope}:${frame.theme}:${normalized}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Validate frame for contradictions and quality
   */
  private async validate(frame: {
    theme: string;
    claims: string[];
    citations: string[];
  }): Promise<{
    valid: boolean;
    reason?: string;
    conflicts?: {
      frameIds: string[];
      conflictingClaims: string[];
    };
  }> {
    // Check if citations are provided
    if (frame.citations.length === 0) {
      return {
        valid: false,
        reason: 'No citations provided',
      };
    }

    // Check if claims are non-empty
    if (frame.claims.length === 0) {
      return {
        valid: false,
        reason: 'No claims provided',
      };
    }

    // Check for contradictions with existing frames
    const existingFrames = await this.frameManager.queryFrames(frame.theme, undefined, {
      limit: 100,
    });

    for (const existing of existingFrames) {
      for (const existingClaim of existing.claims) {
        for (const newClaim of frame.claims) {
          if (this.areContradictory(existingClaim, newClaim)) {
            return {
              valid: false,
              reason: 'Contradicts existing knowledge',
              conflicts: {
                frameIds: [existing.id],
                conflictingClaims: [existingClaim],
              },
            };
          }
        }
      }
    }

    return { valid: true };
  }

  /**
   * Check if two claims are contradictory
   */
  private areContradictory(claim1: string, claim2: string): boolean {
    // Simplified contradiction detection
    // In production, this would use semantic NLP

    const c1 = claim1.toLowerCase();
    const c2 = claim2.toLowerCase();

    // Look for negation patterns
    const negations = ['not', 'no', 'never', "isn't", "doesn't", "won't", "cannot"];

    const hasNegation1 = negations.some((neg) => c1.includes(neg));
    const hasNegation2 = negations.some((neg) => c2.includes(neg));

    // If one has negation and the other doesn't, and they're similar, might be contradiction
    if (hasNegation1 !== hasNegation2) {
      const similarity = this.computeSimilarity(c1.replace(/not|no|never|isn't|doesn't|won't|cannot/g, ''), c2.replace(/not|no|never|isn't|doesn't|won't|cannot/g, ''));

      if (similarity > 0.8) {
        return true;
      }
    }

    return false;
  }

  /**
   * Compute text similarity (simple Jaccard)
   */
  private computeSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) return 0;

    return intersection.size / union.size;
  }

  /**
   * Generate summary from claims
   */
  private generateSummary(claims: string[]): string {
    if (claims.length === 0) {
      return 'No claims';
    }

    if (claims.length === 1) {
      return claims[0];
    }

    // Take first claim as summary, or combine if short
    if (claims[0].length > 100) {
      return claims[0];
    }

    // Combine first few claims
    const combined = claims.slice(0, 3).join('; ');
    if (combined.length > 200) {
      return claims[0];
    }

    return combined;
  }
}
