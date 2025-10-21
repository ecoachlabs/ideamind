/**
 * RAG Governance Module
 *
 * Roadmap: M4 - RAG Governance
 *
 * Components:
 * - Quality Guard: Retrieval quality measurement
 * - Refresh Tool: Stale corpus refresh
 */

export {
  RAGQualityGuard,
  RAGRefreshTool,
  type RetrievalMetrics,
  type CitationCoverage,
  type DocumentFreshness,
  type RAGQualityReport,
  RAG_GOVERNANCE_MIGRATION,
} from './quality-guard';
