/**
 * Knowledge Refinery Types
 *
 * Type definitions for the Knowledge Refinery
 */

/**
 * Knowledge entry in the refinery
 */
export interface KnowledgeEntry {
  id: string;
  key: string;
  value: any;
  category: 'requirement' | 'decision' | 'pattern' | 'constraint' | 'lesson' | 'fact';
  source: string; // Phase or run that created this entry
  confidence: number; // 0.0 to 1.0
  evidence: string[];
  tags: string[];
  metadata: Record<string, any>;
  embedding?: number[]; // Vector embedding for semantic search
  created_at: string;
  updated_at: string;
  access_count: number; // How many times this has been retrieved
  relevance_score?: number; // Calculated during query
}

/**
 * Knowledge query
 */
export interface KnowledgeQuery {
  question: string;
  context?: Record<string, any>;
  categories?: KnowledgeEntry['category'][];
  tags?: string[];
  min_confidence?: number;
  max_results?: number;
}

/**
 * Knowledge query result
 */
export interface KnowledgeQueryResult {
  entries: KnowledgeEntry[];
  answer?: string; // Synthesized answer from entries
  confidence: number;
  evidence: string[];
  metadata: {
    total_entries_found: number;
    avg_relevance: number;
    search_time_ms: number;
  };
}
