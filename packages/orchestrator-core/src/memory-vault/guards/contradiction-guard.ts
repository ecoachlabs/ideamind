/**
 * Contradiction Guard
 *
 * Detects contradictions between knowledge frames
 */

import { Pool } from 'pg';
import pino from 'pino';
import { KnowledgeFrame, ContradictionCheckResult } from '../types';
import { KnowledgeFrameManager } from '../knowledge-frame';

const logger = pino({ name: 'contradiction-guard' });

export class ContradictionGuard {
  private frameManager: KnowledgeFrameManager;

  constructor(private db: Pool) {
    this.frameManager = new KnowledgeFrameManager(db);
  }

  /**
   * Check if a frame contradicts existing knowledge
   */
  async checkContradictions(frame: KnowledgeFrame): Promise<ContradictionCheckResult> {
    logger.debug({ frameId: frame.id, theme: frame.theme }, 'Checking for contradictions');

    const conflicts: Array<{
      claim: string;
      conflictingFrameId: string;
      conflictingClaim: string;
    }> = [];

    // Get related frames from the same theme
    const relatedFrames = await this.frameManager.queryFrames(frame.theme, undefined, {
      limit: 100,
    });

    // Check each claim against existing claims
    for (const claim of frame.claims) {
      for (const existingFrame of relatedFrames) {
        if (existingFrame.id === frame.id) continue; // Skip self

        for (const existingClaim of existingFrame.claims) {
          if (this.areContradictory(claim, existingClaim)) {
            conflicts.push({
              claim,
              conflictingFrameId: existingFrame.id,
              conflictingClaim: existingClaim,
            });

            logger.warn(
              {
                frameId: frame.id,
                conflictingFrameId: existingFrame.id,
                claim,
                conflictingClaim: existingClaim,
              },
              'Contradiction detected'
            );
          }
        }
      }
    }

    const severity = this.calculateSeverity(conflicts.length);

    return {
      contradicts: conflicts.length > 0,
      conflicts,
      severity,
    };
  }

  /**
   * Check if two claims are contradictory
   */
  private areContradictory(claim1: string, claim2: string): boolean {
    const c1 = claim1.toLowerCase().trim();
    const c2 = claim2.toLowerCase().trim();

    // Exact same claim is not a contradiction
    if (c1 === c2) return false;

    // Pattern 1: Negation
    if (this.hasOppositeNegation(c1, c2)) {
      return true;
    }

    // Pattern 2: Opposite values (e.g., "X is true" vs "X is false")
    if (this.hasOppositeValues(c1, c2)) {
      return true;
    }

    // Pattern 3: Mutually exclusive statements
    if (this.areMutuallyExclusive(c1, c2)) {
      return true;
    }

    return false;
  }

  /**
   * Check for opposite negation (e.g., "X is" vs "X is not")
   */
  private hasOppositeNegation(claim1: string, claim2: string): boolean {
    const negations = ['not', 'no', 'never', "isn't", "doesn't", "won't", "cannot", "can't"];

    const hasNegation1 = negations.some((neg) => claim1.includes(` ${neg} `));
    const hasNegation2 = negations.some((neg) => claim2.includes(` ${neg} `));

    // If one has negation and the other doesn't
    if (hasNegation1 !== hasNegation2) {
      // Remove negations and check similarity
      let cleaned1 = claim1;
      let cleaned2 = claim2;

      for (const neg of negations) {
        cleaned1 = cleaned1.replace(new RegExp(` ${neg} `, 'g'), ' ');
        cleaned2 = cleaned2.replace(new RegExp(` ${neg} `, 'g'), ' ');
      }

      const similarity = this.computeSimilarity(cleaned1, cleaned2);

      if (similarity > 0.8) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check for opposite values (e.g., "X is true" vs "X is false")
   */
  private hasOppositeValues(claim1: string, claim2: string): boolean {
    const opposites = [
      ['true', 'false'],
      ['yes', 'no'],
      ['allowed', 'forbidden'],
      ['permitted', 'prohibited'],
      ['enabled', 'disabled'],
      ['active', 'inactive'],
      ['on', 'off'],
      ['open', 'closed'],
      ['valid', 'invalid'],
      ['correct', 'incorrect'],
    ];

    for (const [word1, word2] of opposites) {
      if (claim1.includes(word1) && claim2.includes(word2)) {
        // Remove the opposite words and check similarity
        const cleaned1 = claim1.replace(word1, '');
        const cleaned2 = claim2.replace(word2, '');

        const similarity = this.computeSimilarity(cleaned1, cleaned2);

        if (similarity > 0.8) {
          return true;
        }
      }

      // Check reverse
      if (claim1.includes(word2) && claim2.includes(word1)) {
        const cleaned1 = claim1.replace(word2, '');
        const cleaned2 = claim2.replace(word1, '');

        const similarity = this.computeSimilarity(cleaned1, cleaned2);

        if (similarity > 0.8) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check for mutually exclusive statements
   */
  private areMutuallyExclusive(claim1: string, claim2: string): boolean {
    // Pattern: "X must be A" vs "X must be B" where A != B
    const mustBePattern = /(.+) must be (.+)/;
    const match1 = claim1.match(mustBePattern);
    const match2 = claim2.match(mustBePattern);

    if (match1 && match2) {
      const subject1 = match1[1].trim();
      const value1 = match1[2].trim();
      const subject2 = match2[1].trim();
      const value2 = match2[2].trim();

      // Same subject, different values
      if (this.computeSimilarity(subject1, subject2) > 0.9 && value1 !== value2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Compute text similarity (Jaccard index)
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
   * Calculate severity based on number of conflicts
   */
  private calculateSeverity(conflictCount: number): 'low' | 'medium' | 'high' {
    if (conflictCount === 0) return 'low';
    if (conflictCount === 1) return 'medium';
    return 'high';
  }

  /**
   * Resolve contradictions using majority vote or provenance
   */
  async resolveContradictions(conflicts: ContradictionCheckResult): Promise<{
    resolution: 'keep_new' | 'keep_existing' | 'flag_manual';
    reason: string;
  }> {
    if (!conflicts.contradicts || conflicts.conflicts.length === 0) {
      return {
        resolution: 'keep_new',
        reason: 'No contradictions detected',
      };
    }

    // For high severity, flag for manual review
    if (conflicts.severity === 'high') {
      return {
        resolution: 'flag_manual',
        reason: 'Multiple contradictions require manual review',
      };
    }

    // For medium severity, check provenance and freshness
    // (simplified - would check actual frame metadata in production)
    return {
      resolution: 'flag_manual',
      reason: 'Contradictions detected, manual review recommended',
    };
  }
}
