/**
 * RAG Quality Guard
 *
 * Roadmap: M4 - RAG Governance
 *
 * Guard: guard.rag.quality
 * Tool: tool.rag.refresh
 *
 * Measures retrieval quality and manages corpus freshness.
 *
 * Acceptance:
 * - Citation coverage ≥ 0.9
 * - Avg doc staleness ≤ T (configurable)
 */

import pino from 'pino';
import { Pool } from 'pg';
import { EventEmitter } from 'events';

const logger = pino({ name: 'rag-quality' });

// ============================================================================
// Types
// ============================================================================

export interface RetrievalMetrics {
  queryId: string;
  retrievedDocs: number;
  relevantDocs: number;
  precision: number; // relevant / retrieved
  recall: number; // relevant / total_relevant
  f1Score: number;
  mrr: number; // Mean Reciprocal Rank
  ndcg: number; // Normalized Discounted Cumulative Gain
}

export interface CitationCoverage {
  totalClaims: number;
  citedClaims: number;
  coverage: number; // cited / total
  unsupportedClaims: string[];
}

export interface DocumentFreshness {
  docId: string;
  corpus: string;
  lastUpdated: Date;
  staleness: number; // Days since last update
  isStale: boolean;
  thresholdDays: number;
}

export interface RAGQualityReport {
  runId?: string;
  timestamp: Date;
  retrievalMetrics: RetrievalMetrics[];
  avgPrecision: number;
  avgRecall: number;
  avgF1: number;
  citationCoverage: CitationCoverage;
  freshness: {
    totalDocs: number;
    staleDocs: number;
    avgStaleness: number;
    maxStaleness: number;
  };
  passed: boolean;
  violations: string[];
}

// ============================================================================
// RAG Quality Guard
// ============================================================================

export class RAGQualityGuard extends EventEmitter {
  private citationCoverageThreshold: number = 0.9; // 90%
  private stalenessThresholdDays: number = 30; // 30 days

  constructor(private db: Pool) {
    super();
  }

  /**
   * Set quality thresholds
   */
  setThresholds(citationCoverage: number, stalenessDays: number): void {
    this.citationCoverageThreshold = citationCoverage;
    this.stalenessThresholdDays = stalenessDays;

    logger.info(
      { citationCoverage, stalenessDays },
      'RAG quality thresholds updated'
    );
  }

  /**
   * Evaluate RAG quality for a run
   */
  async evaluate(runId: string): Promise<RAGQualityReport> {
    logger.info({ runId }, 'Evaluating RAG quality');

    // Get retrieval metrics
    const retrievalMetrics = await this.getRetrievalMetrics(runId);

    // Calculate averages
    const avgPrecision =
      retrievalMetrics.reduce((sum, m) => sum + m.precision, 0) /
      (retrievalMetrics.length || 1);
    const avgRecall =
      retrievalMetrics.reduce((sum, m) => sum + m.recall, 0) /
      (retrievalMetrics.length || 1);
    const avgF1 =
      retrievalMetrics.reduce((sum, m) => sum + m.f1Score, 0) /
      (retrievalMetrics.length || 1);

    // Check citation coverage
    const citationCoverage = await this.checkCitationCoverage(runId);

    // Check document freshness
    const freshness = await this.checkDocumentFreshness();

    // Determine pass/fail
    const violations: string[] = [];

    if (citationCoverage.coverage < this.citationCoverageThreshold) {
      violations.push(
        `Citation coverage ${(citationCoverage.coverage * 100).toFixed(1)}% < ${(this.citationCoverageThreshold * 100).toFixed(1)}%`
      );
    }

    if (freshness.avgStaleness > this.stalenessThresholdDays) {
      violations.push(
        `Avg staleness ${freshness.avgStaleness.toFixed(0)} days > ${this.stalenessThresholdDays} days`
      );
    }

    if (avgPrecision < 0.7) {
      violations.push(
        `Avg precision ${(avgPrecision * 100).toFixed(1)}% < 70%`
      );
    }

    const passed = violations.length === 0;

    const report: RAGQualityReport = {
      runId,
      timestamp: new Date(),
      retrievalMetrics,
      avgPrecision,
      avgRecall,
      avgF1,
      citationCoverage,
      freshness,
      passed,
      violations,
    };

    // Store report
    await this.storeReport(report);

    if (!passed) {
      logger.warn({ violations }, 'RAG quality check failed');
      this.emit('rag.quality.failed', report);
    } else {
      logger.info('RAG quality check passed');
    }

    return report;
  }

  /**
   * Get retrieval metrics for queries in a run
   */
  private async getRetrievalMetrics(runId: string): Promise<RetrievalMetrics[]> {
    const result = await this.db.query(
      `
      SELECT
        id as query_id,
        metadata->>'retrieved_docs' as retrieved_docs,
        metadata->>'relevant_docs' as relevant_docs,
        metadata->>'total_relevant' as total_relevant,
        metadata->>'mrr' as mrr,
        metadata->>'ndcg' as ndcg
      FROM rag_queries
      WHERE run_id = $1
    `,
      [runId]
    );

    const metrics: RetrievalMetrics[] = [];

    for (const row of result.rows) {
      const retrieved = parseInt(row.retrieved_docs || '0');
      const relevant = parseInt(row.relevant_docs || '0');
      const totalRelevant = parseInt(row.total_relevant || '1');

      const precision = retrieved > 0 ? relevant / retrieved : 0;
      const recall = totalRelevant > 0 ? relevant / totalRelevant : 0;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

      metrics.push({
        queryId: row.query_id,
        retrievedDocs: retrieved,
        relevantDocs: relevant,
        precision,
        recall,
        f1Score: f1,
        mrr: parseFloat(row.mrr || '0'),
        ndcg: parseFloat(row.ndcg || '0'),
      });
    }

    return metrics;
  }

  /**
   * Check citation coverage in generated outputs
   */
  private async checkCitationCoverage(runId: string): Promise<CitationCoverage> {
    // Get outputs from run
    const result = await this.db.query(
      `
      SELECT metadata->>'output' as output
      FROM artifacts
      WHERE run_id = $1 AND type = 'generated_content'
    `,
      [runId]
    );

    if (result.rows.length === 0) {
      return {
        totalClaims: 0,
        citedClaims: 0,
        coverage: 1.0, // No claims = no violation
        unsupportedClaims: [],
      };
    }

    // Parse outputs and extract claims
    const allClaims: string[] = [];
    const citedClaims: string[] = [];

    for (const row of result.rows) {
      const output = row.output || '';

      // Extract claims (sentences)
      const claims = this.extractClaims(output);
      allClaims.push(...claims);

      // Check which claims have citations
      for (const claim of claims) {
        if (this.hasCitation(claim, output)) {
          citedClaims.push(claim);
        }
      }
    }

    const unsupportedClaims = allClaims.filter((c) => !citedClaims.includes(c));

    return {
      totalClaims: allClaims.length,
      citedClaims: citedClaims.length,
      coverage: allClaims.length > 0 ? citedClaims.length / allClaims.length : 1.0,
      unsupportedClaims: unsupportedClaims.slice(0, 10), // First 10
    };
  }

  /**
   * Extract claims from text
   */
  private extractClaims(text: string): string[] {
    // Simple sentence split (in production, use NLP)
    return text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20); // Ignore short fragments
  }

  /**
   * Check if claim has citation
   */
  private hasCitation(claim: string, fullText: string): boolean {
    // Look for citation markers near claim: [1], (source), etc.
    const claimIndex = fullText.indexOf(claim);
    if (claimIndex === -1) return false;

    const afterClaim = fullText.substring(
      claimIndex + claim.length,
      claimIndex + claim.length + 50
    );

    return /\[\d+\]|\(.*?\)|<cite>/.test(afterClaim);
  }

  /**
   * Check document freshness across corpora
   */
  private async checkDocumentFreshness(): Promise<RAGQualityReport['freshness']> {
    const result = await this.db.query(`
      SELECT
        id,
        corpus,
        last_updated
      FROM knowledge_corpus
    `);

    const now = new Date();
    const freshnessList: DocumentFreshness[] = [];

    for (const row of result.rows) {
      const lastUpdated = new Date(row.last_updated);
      const staleness = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

      freshnessList.push({
        docId: row.id,
        corpus: row.corpus,
        lastUpdated,
        staleness,
        isStale: staleness > this.stalenessThresholdDays,
        thresholdDays: this.stalenessThresholdDays,
      });
    }

    const totalDocs = freshnessList.length;
    const staleDocs = freshnessList.filter((f) => f.isStale).length;
    const avgStaleness =
      totalDocs > 0
        ? freshnessList.reduce((sum, f) => sum + f.staleness, 0) / totalDocs
        : 0;
    const maxStaleness =
      totalDocs > 0 ? Math.max(...freshnessList.map((f) => f.staleness)) : 0;

    return {
      totalDocs,
      staleDocs,
      avgStaleness,
      maxStaleness,
    };
  }

  /**
   * Store quality report
   */
  private async storeReport(report: RAGQualityReport): Promise<void> {
    await this.db.query(
      `
      INSERT INTO rag_quality_reports (
        run_id, timestamp, avg_precision, avg_recall, avg_f1,
        citation_coverage, freshness, passed, violations
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
      [
        report.runId || null,
        report.timestamp,
        report.avgPrecision,
        report.avgRecall,
        report.avgF1,
        report.citationCoverage.coverage,
        JSON.stringify(report.freshness),
        report.passed,
        JSON.stringify(report.violations),
      ]
    );

    logger.debug({ runId: report.runId }, 'Quality report stored');
  }

  /**
   * Get historical quality metrics
   */
  async getHistory(limit: number = 30): Promise<RAGQualityReport[]> {
    const result = await this.db.query(
      `
      SELECT * FROM rag_quality_reports
      ORDER BY timestamp DESC
      LIMIT $1
    `,
      [limit]
    );

    return result.rows.map((row) => ({
      runId: row.run_id,
      timestamp: row.timestamp,
      retrievalMetrics: [], // Not stored in summary
      avgPrecision: parseFloat(row.avg_precision),
      avgRecall: parseFloat(row.avg_recall),
      avgF1: parseFloat(row.avg_f1),
      citationCoverage: {
        totalClaims: 0,
        citedClaims: 0,
        coverage: parseFloat(row.citation_coverage),
        unsupportedClaims: [],
      },
      freshness: row.freshness,
      passed: row.passed,
      violations: row.violations,
    }));
  }
}

// ============================================================================
// RAG Refresh Tool
// ============================================================================

export class RAGRefreshTool {
  constructor(private db: Pool) {}

  /**
   * Refresh stale corpus
   */
  async refresh(corpus: string, sourceUrl?: string): Promise<{
    documentsUpdated: number;
    documentsAdded: number;
    documentsRemoved: number;
  }> {
    logger.info({ corpus, sourceUrl }, 'Refreshing corpus');

    // Get current documents in corpus
    const currentDocs = await this.db.query(
      `SELECT id, metadata->>'source_hash' as hash FROM knowledge_corpus WHERE corpus = $1`,
      [corpus]
    );

    const currentHashes = new Set(currentDocs.rows.map((r) => r.hash));

    // Fetch fresh documents from source
    const freshDocs = await this.fetchFreshDocuments(corpus, sourceUrl);

    let updated = 0;
    let added = 0;
    let removed = 0;

    // Update/add documents
    for (const doc of freshDocs) {
      const hash = doc.hash;

      if (currentHashes.has(hash)) {
        // Document exists - update if changed
        await this.db.query(
          `
          UPDATE knowledge_corpus
          SET content = $1, last_updated = NOW(), metadata = $2
          WHERE corpus = $3 AND metadata->>'source_hash' = $4
        `,
          [doc.content, JSON.stringify(doc.metadata), corpus, hash]
        );
        updated++;
      } else {
        // New document - add
        await this.db.query(
          `
          INSERT INTO knowledge_corpus (corpus, content, last_updated, metadata)
          VALUES ($1, $2, NOW(), $3)
        `,
          [corpus, doc.content, JSON.stringify({ ...doc.metadata, source_hash: hash })]
        );
        added++;
      }

      currentHashes.delete(hash);
    }

    // Remove obsolete documents
    for (const hash of currentHashes) {
      await this.db.query(
        `DELETE FROM knowledge_corpus WHERE corpus = $1 AND metadata->>'source_hash' = $2`,
        [corpus, hash]
      );
      removed++;
    }

    logger.info({ corpus, updated, added, removed }, 'Corpus refreshed');

    return {
      documentsUpdated: updated,
      documentsAdded: added,
      documentsRemoved: removed,
    };
  }

  /**
   * Fetch fresh documents from source
   */
  private async fetchFreshDocuments(
    corpus: string,
    sourceUrl?: string
  ): Promise<Array<{ hash: string; content: string; metadata: any }>> {
    // TODO: Implement actual fetching from various sources
    // - GitHub repos (clone, parse docs)
    // - Confluence/Notion (API fetch)
    // - Web scraping
    // - RSS feeds
    // - etc.

    logger.debug({ corpus, sourceUrl }, 'Fetching fresh documents (stub)');

    // Stub implementation
    return [];
  }

  /**
   * Schedule periodic refresh
   */
  async scheduleRefresh(
    corpus: string,
    intervalHours: number,
    sourceUrl?: string
  ): Promise<void> {
    logger.info({ corpus, intervalHours }, 'Scheduling periodic refresh');

    // Store schedule
    await this.db.query(
      `
      INSERT INTO corpus_refresh_schedules (corpus, interval_hours, source_url, last_run)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (corpus) DO UPDATE SET
        interval_hours = $2,
        source_url = $3
    `,
      [corpus, intervalHours, sourceUrl || null]
    );

    // TODO: Integrate with job scheduler (e.g., node-cron)
  }

  /**
   * Run scheduled refreshes
   */
  async runScheduledRefreshes(): Promise<void> {
    const result = await this.db.query(`
      SELECT corpus, source_url, interval_hours, last_run
      FROM corpus_refresh_schedules
      WHERE last_run < NOW() - (interval_hours || ' hours')::INTERVAL
    `);

    for (const row of result.rows) {
      try {
        await this.refresh(row.corpus, row.source_url);

        // Update last run
        await this.db.query(
          `UPDATE corpus_refresh_schedules SET last_run = NOW() WHERE corpus = $1`,
          [row.corpus]
        );
      } catch (err) {
        logger.error({ corpus: row.corpus, err }, 'Scheduled refresh failed');
      }
    }
  }
}

// ============================================================================
// Database Migration
// ============================================================================

export const RAG_GOVERNANCE_MIGRATION = `
-- RAG queries table (for tracking retrieval)
CREATE TABLE IF NOT EXISTS rag_queries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  corpus VARCHAR(100),
  retrieved_count INTEGER NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_rag_queries_run ON rag_queries(run_id);
CREATE INDEX IF NOT EXISTS idx_rag_queries_corpus ON rag_queries(corpus);

COMMENT ON TABLE rag_queries IS 'RAG retrieval queries for quality tracking';

-- RAG quality reports table
CREATE TABLE IF NOT EXISTS rag_quality_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  avg_precision NUMERIC(5, 4) NOT NULL,
  avg_recall NUMERIC(5, 4) NOT NULL,
  avg_f1 NUMERIC(5, 4) NOT NULL,
  citation_coverage NUMERIC(5, 4) NOT NULL,
  freshness JSONB NOT NULL,
  passed BOOLEAN NOT NULL,
  violations JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_rag_reports_run ON rag_quality_reports(run_id);
CREATE INDEX IF NOT EXISTS idx_rag_reports_timestamp ON rag_quality_reports(timestamp);

COMMENT ON TABLE rag_quality_reports IS 'RAG quality evaluation reports';

-- Knowledge corpus table (for freshness tracking)
CREATE TABLE IF NOT EXISTS knowledge_corpus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  corpus VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_corpus_name ON knowledge_corpus(corpus);
CREATE INDEX IF NOT EXISTS idx_corpus_updated ON knowledge_corpus(last_updated);

COMMENT ON TABLE knowledge_corpus IS 'Knowledge corpus documents for RAG';

-- Corpus refresh schedules
CREATE TABLE IF NOT EXISTS corpus_refresh_schedules (
  corpus VARCHAR(100) PRIMARY KEY,
  interval_hours INTEGER NOT NULL,
  source_url TEXT,
  last_run TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE corpus_refresh_schedules IS 'Scheduled corpus refresh configuration';
`;
