/**
 * Grounding Guard
 *
 * Ensures knowledge frames are properly grounded in citations
 */

import { Pool } from 'pg';
import pino from 'pino';
import { KnowledgeFrame, GroundingCheckResult } from '../types';

const logger = pino({ name: 'grounding-guard' });

export class GroundingGuard {
  private readonly MIN_GROUNDING_THRESHOLD = 0.7;

  constructor(private db: Pool) {}

  /**
   * Check if a frame is properly grounded
   */
  async checkGrounding(frame: KnowledgeFrame): Promise<GroundingCheckResult> {
    logger.debug({ frameId: frame.id }, 'Checking grounding');

    const missingCitations: string[] = [];

    // Rule 1: Frame must have at least one citation
    if (frame.citations.length === 0) {
      return {
        grounded: false,
        score: 0,
        missingCitations: [],
        reason: 'No citations provided',
      };
    }

    // Rule 2: Each claim should ideally have a supporting citation
    // For simplicity, we check that the number of citations is reasonable
    // relative to the number of claims
    const claimsToCitationsRatio = frame.claims.length / frame.citations.length;

    if (claimsToCitationsRatio > 5) {
      // Too many claims per citation
      return {
        grounded: false,
        score: 0.3,
        missingCitations: [],
        reason: `Too many claims (${frame.claims.length}) for citations (${frame.citations.length})`,
      };
    }

    // Rule 3: Verify citations are valid (exist and are accessible)
    const validCitations = await this.verifyCitations(frame.citations);
    const validCitationRatio = validCitations.length / frame.citations.length;

    if (validCitationRatio < 0.5) {
      return {
        grounded: false,
        score: validCitationRatio,
        missingCitations: frame.citations.filter((c) => !validCitations.includes(c)),
        reason: 'More than half of citations are invalid or inaccessible',
      };
    }

    // Calculate overall grounding score
    let score = 0.5; // Base score

    // Boost for good claim-to-citation ratio (1:1 is ideal)
    if (claimsToCitationsRatio <= 1.5) {
      score += 0.2;
    } else if (claimsToCitationsRatio <= 3) {
      score += 0.1;
    }

    // Boost for all valid citations
    score += validCitationRatio * 0.3;

    const grounded = score >= this.MIN_GROUNDING_THRESHOLD;

    logger.info(
      {
        frameId: frame.id,
        grounded,
        score: score.toFixed(3),
        claims: frame.claims.length,
        citations: frame.citations.length,
      },
      'Grounding check complete'
    );

    return {
      grounded,
      score,
      missingCitations: frame.citations.filter((c) => !validCitations.includes(c)),
    };
  }

  /**
   * Verify that citations are valid and accessible
   */
  private async verifyCitations(citations: string[]): Promise<string[]> {
    const valid: string[] = [];

    for (const citation of citations) {
      if (await this.verifyCitation(citation)) {
        valid.push(citation);
      }
    }

    return valid;
  }

  /**
   * Verify a single citation
   */
  private async verifyCitation(citation: string): Promise<boolean> {
    // Check if citation is a frame ID
    if (citation.startsWith('frame_')) {
      const query = `SELECT id FROM knowledge_frames WHERE id = $1`;
      const result = await this.db.query(query, [citation]);
      return result.rows.length > 0;
    }

    // Check if citation is an artifact
    if (citation.startsWith('artifact:') || citation.startsWith('uri:')) {
      const artifactId = citation.replace(/^(artifact:|uri:)/, '');
      const query = `SELECT id FROM artifacts WHERE id = $1 OR uri = $1`;
      const result = await this.db.query(query, [artifactId]);
      return result.rows.length > 0;
    }

    // Check if citation is a QA binding
    if (citation.startsWith('q_') || citation.startsWith('a_')) {
      const query = `SELECT qid FROM qa_bindings WHERE qid = $1 OR aid = $1`;
      const result = await this.db.query(query, [citation]);
      return result.rows.length > 0;
    }

    // For external URLs, we assume valid (would validate in production)
    if (citation.startsWith('http://') || citation.startsWith('https://')) {
      return true;
    }

    // Unknown citation format
    logger.warn({ citation }, 'Unknown citation format');
    return false;
  }

  /**
   * Suggest missing citations for a frame
   */
  async suggestCitations(frame: KnowledgeFrame): Promise<string[]> {
    const suggestions: string[] = [];

    // Search for frames with similar themes
    const query = `
      SELECT id, citations
      FROM knowledge_frames
      WHERE theme = $1 AND id != $2
      LIMIT 10
    `;

    const result = await this.db.query(query, [frame.theme, frame.id]);

    // Collect citations from similar frames
    const citationCounts = new Map<string, number>();

    for (const row of result.rows) {
      const citations = JSON.parse(row.citations);
      for (const citation of citations) {
        citationCounts.set(citation, (citationCounts.get(citation) || 0) + 1);
      }
    }

    // Sort by frequency and return top suggestions
    const sorted = Array.from(citationCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([citation]) => citation);

    suggestions.push(...sorted.slice(0, 5));

    return suggestions;
  }
}
