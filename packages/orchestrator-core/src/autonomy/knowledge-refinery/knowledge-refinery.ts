import pino from 'pino';
import Anthropic from '@anthropic-ai/sdk';
import { KnowledgeSource } from '../qav/answer-agent';
import {
  KnowledgeEntry,
  KnowledgeQuery,
  KnowledgeQueryResult,
} from './types';

const logger = pino({ name: 'knowledge-refinery' });

/**
 * Knowledge Refinery
 *
 * Stores and retrieves accumulated knowledge using semantic search
 * Implements KnowledgeSource interface for Q/A/V integration
 * Spec: phase.txt:196-204
 */
export class KnowledgeRefinery implements KnowledgeSource {
  private entries: Map<string, KnowledgeEntry> = new Map();
  private anthropic: Anthropic;

  constructor(
    private db: any,
    private apiKey: string,
    private model: string = 'claude-3-5-sonnet-20241022'
  ) {
    this.anthropic = new Anthropic({ apiKey });
  }

  /**
   * Initialize from database
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Knowledge Refinery from database');

    const result = await this.db.query(
      `SELECT * FROM knowledge_refinery ORDER BY access_count DESC, created_at DESC`
    );

    for (const row of result.rows) {
      const entry: KnowledgeEntry = {
        id: row.id,
        key: row.key,
        value: JSON.parse(row.value),
        category: row.category,
        source: row.source,
        confidence: row.confidence,
        evidence: JSON.parse(row.evidence),
        tags: JSON.parse(row.tags),
        metadata: JSON.parse(row.metadata || '{}'),
        embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
        created_at: row.created_at,
        updated_at: row.updated_at,
        access_count: row.access_count || 0,
      };

      this.entries.set(entry.id, entry);
    }

    logger.info(
      { entries_count: this.entries.size },
      'Knowledge Refinery initialized'
    );
  }

  /**
   * Query knowledge base (KnowledgeSource interface)
   */
  async query(
    question: string,
    context: Record<string, any>
  ): Promise<{ answer: string; confidence: number; evidence: string[] } | null> {
    const startTime = Date.now();

    logger.info({ question }, 'Querying Knowledge Refinery');

    const queryResult = await this.search({
      question,
      context,
      max_results: 5,
      min_confidence: 0.5,
    });

    if (queryResult.entries.length === 0) {
      logger.info({ question }, 'No relevant knowledge found');
      return null;
    }

    const answer = await this.synthesizeAnswer(question, queryResult.entries);

    for (const entry of queryResult.entries) {
      await this.incrementAccessCount(entry.id);
    }

    const elapsed = Date.now() - startTime;

    logger.info(
      {
        question,
        entries_used: queryResult.entries.length,
        confidence: queryResult.confidence,
        elapsed_ms: elapsed,
      },
      'Query complete'
    );

    return {
      answer: answer || queryResult.answer || 'No answer available',
      confidence: queryResult.confidence,
      evidence: queryResult.evidence,
    };
  }

  /**
   * Search knowledge base
   */
  async search(query: KnowledgeQuery): Promise<KnowledgeQueryResult> {
    const startTime = Date.now();

    logger.debug({ query }, 'Searching knowledge base');

    const questionEmbedding = await this.getEmbedding(query.question);

    let candidates: KnowledgeEntry[] = Array.from(this.entries.values());

    if (query.categories && query.categories.length > 0) {
      candidates = candidates.filter((e) =>
        query.categories!.includes(e.category)
      );
    }

    if (query.tags && query.tags.length > 0) {
      candidates = candidates.filter((e) =>
        query.tags!.some((tag) => e.tags.includes(tag))
      );
    }

    if (query.min_confidence) {
      candidates = candidates.filter((e) => e.confidence >= query.min_confidence!);
    }

    const scoredCandidates = candidates
      .map((entry) => {
        const relevance = this.calculateRelevance(
          questionEmbedding,
          entry.embedding,
          query.question,
          entry
        );

        return {
          ...entry,
          relevance_score: relevance,
        };
      })
      .filter((e) => e.relevance_score > 0.3)
      .sort((a, b) => b.relevance_score - a.relevance_score);

    const maxResults = query.max_results || 10;
    const topResults = scoredCandidates.slice(0, maxResults);

    const confidence = this.calculateAggregateConfidence(topResults);

    const evidence = topResults.flatMap((e) => e.evidence).slice(0, 10);

    const elapsed = Date.now() - startTime;

    return {
      entries: topResults,
      confidence,
      evidence,
      metadata: {
        total_entries_found: scoredCandidates.length,
        avg_relevance:
          topResults.reduce((sum, e) => sum + (e.relevance_score || 0), 0) /
          Math.max(1, topResults.length),
        search_time_ms: elapsed,
      },
    };
  }

  /**
   * Add knowledge entry
   */
  async add(entry: Omit<KnowledgeEntry, 'id' | 'created_at' | 'updated_at' | 'access_count'>): Promise<string> {
    const id = `ke-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const embeddingText = `${entry.key}: ${JSON.stringify(entry.value)}`;
    const embedding = await this.getEmbedding(embeddingText);

    const fullEntry: KnowledgeEntry = {
      ...entry,
      id,
      embedding,
      created_at: now,
      updated_at: now,
      access_count: 0,
    };

    this.entries.set(id, fullEntry);

    await this.db.query(
      `
      INSERT INTO knowledge_refinery
        (id, key, value, category, source, confidence, evidence, tags, metadata, embedding, created_at, updated_at, access_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
      [
        id,
        entry.key,
        JSON.stringify(entry.value),
        entry.category,
        entry.source,
        entry.confidence,
        JSON.stringify(entry.evidence),
        JSON.stringify(entry.tags),
        JSON.stringify(entry.metadata),
        JSON.stringify(embedding),
        now,
        now,
        0,
      ]
    );

    logger.info(
      {
        id,
        key: entry.key,
        category: entry.category,
      },
      'Knowledge entry added'
    );

    return id;
  }

  /**
   * Update knowledge entry
   */
  async update(
    id: string,
    updates: Partial<Omit<KnowledgeEntry, 'id' | 'created_at' | 'access_count'>>
  ): Promise<void> {
    const existing = this.entries.get(id);
    if (!existing) {
      throw new Error(`Knowledge entry not found: ${id}`);
    }

    const updated: KnowledgeEntry = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (updates.key || updates.value) {
      const embeddingText = `${updated.key}: ${JSON.stringify(updated.value)}`;
      updated.embedding = await this.getEmbedding(embeddingText);
    }

    this.entries.set(id, updated);

    await this.db.query(
      `
      UPDATE knowledge_refinery
      SET key = $1, value = $2, category = $3, confidence = $4, evidence = $5,
          tags = $6, metadata = $7, embedding = $8, updated_at = $9
      WHERE id = $10
    `,
      [
        updated.key,
        JSON.stringify(updated.value),
        updated.category,
        updated.confidence,
        JSON.stringify(updated.evidence),
        JSON.stringify(updated.tags),
        JSON.stringify(updated.metadata),
        JSON.stringify(updated.embedding),
        updated.updated_at,
        id,
      ]
    );

    logger.info({ id }, 'Knowledge entry updated');
  }

  /**
   * Get embedding for text
   * TODO: Integrate with proper embedding API
   */
  private async getEmbedding(text: string): Promise<number[]> {
    const hash = this.simpleHash(text);
    const dimensions = 384;
    const embedding = new Array(dimensions).fill(0);

    for (let i = 0; i < dimensions; i++) {
      embedding[i] = Math.sin(hash + i) * 0.5 + 0.5;
    }

    return embedding;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevance(
    questionEmbedding: number[] | undefined,
    entryEmbedding: number[] | undefined,
    question: string,
    entry: KnowledgeEntry
  ): number {
    const questionLower = question.toLowerCase();
    const entryText = `${entry.key} ${JSON.stringify(entry.value)}`.toLowerCase();

    const keywordScore = questionLower.split(' ').filter((word) =>
      word.length > 3 && entryText.includes(word)
    ).length / Math.max(1, questionLower.split(' ').length);

    let semanticScore = 0;
    if (questionEmbedding && entryEmbedding) {
      semanticScore = this.cosineSimilarity(questionEmbedding, entryEmbedding);
    }

    return keywordScore * 0.3 + semanticScore * 0.7;
  }

  /**
   * Cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculate aggregate confidence
   */
  private calculateAggregateConfidence(entries: KnowledgeEntry[]): number {
    if (entries.length === 0) return 0;

    let totalWeight = 0;
    let weightedSum = 0;

    for (const entry of entries) {
      const weight = (entry.relevance_score || 0.5) * entry.confidence;
      weightedSum += entry.confidence * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Synthesize answer using Claude
   */
  private async synthesizeAnswer(
    question: string,
    entries: KnowledgeEntry[]
  ): Promise<string> {
    const prompt = `You are synthesizing an answer from knowledge base entries.

## Question:
${question}

## Relevant Knowledge Entries:
${entries
  .map(
    (e, i) => `
${i + 1}. [${e.category}] ${e.key}
   Value: ${JSON.stringify(e.value)}
   Confidence: ${e.confidence}
   Evidence: ${e.evidence.join(', ')}
`
  )
  .join('\n')}

## Your Task:
Synthesize a clear, concise answer based on these entries.
Return ONLY the answer text.`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        return content.text.trim();
      }
      return '';
    } catch (error) {
      logger.error({ error }, 'Failed to synthesize answer');
      return '';
    }
  }

  /**
   * Increment access count
   */
  private async incrementAccessCount(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;

    entry.access_count += 1;
    await this.db.query(
      `UPDATE knowledge_refinery SET access_count = access_count + 1 WHERE id = $1`,
      [id]
    );
  }

  async getMostAccessed(limit: number = 10): Promise<KnowledgeEntry[]> {
    const sorted = Array.from(this.entries.values()).sort(
      (a, b) => b.access_count - a.access_count
    );
    return sorted.slice(0, limit);
  }

  getByCategory(category: KnowledgeEntry['category']): KnowledgeEntry[] {
    return Array.from(this.entries.values()).filter(
      (e) => e.category === category
    );
  }

  getByTag(tag: string): KnowledgeEntry[] {
    return Array.from(this.entries.values()).filter((e) =>
      e.tags.includes(tag)
    );
  }

  async clear(): Promise<void> {
    this.entries.clear();
    await this.db.query(`DELETE FROM knowledge_refinery`);
    logger.info('Knowledge Refinery cleared');
  }

  getStats(): {
    total_entries: number;
    by_category: Record<string, number>;
    avg_confidence: number;
    total_accesses: number;
  } {
    const entries = Array.from(this.entries.values());

    const byCategory: Record<string, number> = {};
    let totalAccesses = 0;
    let totalConfidence = 0;

    for (const entry of entries) {
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
      totalAccesses += entry.access_count;
      totalConfidence += entry.confidence;
    }

    return {
      total_entries: entries.length,
      by_category: byCategory,
      avg_confidence: entries.length > 0 ? totalConfidence / entries.length : 0,
      total_accesses: totalAccesses,
    };
  }
}
