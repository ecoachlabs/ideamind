/**
 * Dataset Curator
 *
 * Curates training datasets with quality filtering, synthetic detection,
 * and PII/toxicity screening for fine-tuning and model improvement.
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import pino from 'pino';
import crypto from 'crypto';

const logger = pino({ name: 'dataset-curator' });

export interface DatasetArtifact {
  artifactId: string;
  contentType: 'code' | 'text' | 'prd' | 'api' | 'test' | 'documentation';
  content: string;
  origin: 'human' | 'synthetic' | 'mixed' | 'unknown';
  originConfidence?: number;
  runId?: string;
  taskId?: string;
  tags?: Record<string, string>;
}

export interface SyntheticDetectionResult {
  isSynthetic: boolean;
  confidence: number; // 0-1
  reasons: string[];
  markers: string[];
}

export interface QualityScores {
  overall: number; // 0-1
  toxicity: number; // 0-1
  hasPII: boolean;
  piiTypes: string[];
  diversity: number; // 0-1
  complexity: number; // 0-1
}

export interface CurationDecision {
  artifactId: string;
  decision: 'approve' | 'reject' | 'flag';
  reason: string;
  curatedBy: string;
}

export interface CurationCriteria {
  minQualityScore?: number;
  maxToxicityScore?: number;
  allowPII?: boolean;
  allowSynthetic?: boolean;
  minConfidence?: number;
  contentTypes?: string[];
  origins?: string[];
}

export interface DatasetStats {
  totalArtifacts: number;
  approved: number;
  rejected: number;
  flagged: number;
  pending: number;
  avgQualityScore: number;
  originBreakdown: Record<string, number>;
  contentTypeBreakdown: Record<string, number>;
}

const DEFAULT_CURATION_CRITERIA: CurationCriteria = {
  minQualityScore: 0.6,
  maxToxicityScore: 0.3,
  allowPII: false,
  allowSynthetic: true,
  minConfidence: 0.7,
};

export class DatasetCurator extends EventEmitter {
  constructor(private pool: Pool) {
    super();
  }

  /**
   * Ingest artifact into dataset
   */
  async ingestArtifact(artifact: DatasetArtifact): Promise<string> {
    logger.info({ artifactId: artifact.artifactId }, 'Ingesting artifact');

    // Calculate content hash
    const contentHash = crypto
      .createHash('sha256')
      .update(artifact.content)
      .digest('hex');

    // Detect if synthetic
    const syntheticResult = await this.detectSynthetic(artifact.content);

    // Score quality
    const qualityScores = await this.scoreQuality(artifact);

    // Determine origin if not provided
    let origin = artifact.origin;
    let originConfidence = artifact.originConfidence;

    if (!origin || origin === 'unknown') {
      origin = syntheticResult.isSynthetic ? 'synthetic' : 'human';
      originConfidence = syntheticResult.confidence;
    }

    // Store in database
    await this.pool.query(
      `INSERT INTO dataset_artifacts
       (artifact_id, content_type, content_hash, content_size, origin, origin_confidence,
        generation_model, quality_score, toxicity_score, pii_detected, run_id, task_id, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (artifact_id) DO UPDATE SET
         updated_at = NOW()`,
      [
        artifact.artifactId,
        artifact.contentType,
        contentHash,
        artifact.content.length,
        origin,
        originConfidence || null,
        artifact.tags?.model || null,
        qualityScores.overall,
        qualityScores.toxicity,
        qualityScores.hasPII,
        artifact.runId || null,
        artifact.taskId || null,
        JSON.stringify(artifact.tags || {}),
      ]
    );

    // Store quality metrics
    await this.storeQualityMetrics(artifact.artifactId, qualityScores);

    this.emit('artifact-ingested', {
      artifactId: artifact.artifactId,
      origin,
      qualityScore: qualityScores.overall,
    });

    logger.info(
      {
        artifactId: artifact.artifactId,
        origin,
        qualityScore: qualityScores.overall.toFixed(2),
        toxicity: qualityScores.toxicity.toFixed(2),
      },
      'Artifact ingested'
    );

    return artifact.artifactId;
  }

  /**
   * Detect if content is synthetic (AI-generated)
   */
  async detectSynthetic(content: string): Promise<SyntheticDetectionResult> {
    const reasons: string[] = [];
    const markers: string[] = [];
    let confidence = 0.5; // Default uncertain

    // Check for explicit AI markers
    const aiMarkers = [
      /as an ai/i,
      /language model/i,
      /i('m| am) (an )?ai/i,
      /i don't have personal/i,
      /i cannot (actually )?feel/i,
      /my (training|knowledge) (data|cutoff)/i,
    ];

    for (const pattern of aiMarkers) {
      if (pattern.test(content)) {
        reasons.push(`Contains AI self-reference: ${pattern.source}`);
        markers.push(pattern.source);
        confidence = Math.max(confidence, 0.95);
      }
    }

    // Check for repetitive structure (common in synthetic text)
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length > 5) {
      const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
      const variance =
        sentences.reduce((sum, s) => sum + Math.pow(s.length - avgLength, 2), 0) /
        sentences.length;

      // Low variance = very uniform sentence lengths = likely synthetic
      if (variance < 100 && sentences.length > 10) {
        reasons.push('Uniform sentence structure suggests synthetic generation');
        confidence = Math.max(confidence, 0.7);
      }
    }

    // Check for template patterns
    const templatePatterns = [
      /\{\{[^}]+\}\}/g, // Template variables
      /\[placeholder\]/gi,
      /\[insert \w+\]/gi,
      /\(to be (filled|added|completed)\)/gi,
    ];

    for (const pattern of templatePatterns) {
      if (pattern.test(content)) {
        reasons.push('Contains template patterns');
        markers.push(pattern.source);
        confidence = Math.max(confidence, 0.8);
      }
    }

    // Check for very long content with many sentences (LLMs often generate verbose text)
    if (content.length > 10000 && sentences.length > 50) {
      const hasLogicalFlow = /first|second|third|next|then|finally|in conclusion/i.test(
        content
      );
      if (hasLogicalFlow) {
        reasons.push('Long structured content with logical flow markers');
        confidence = Math.max(confidence, 0.65);
      }
    }

    // If no strong signals, default to slightly synthetic (modern assumption)
    if (reasons.length === 0) {
      confidence = 0.4; // Slight lean towards human
    }

    const isSynthetic = confidence > 0.6;

    return {
      isSynthetic,
      confidence: Math.round(confidence * 100) / 100,
      reasons,
      markers,
    };
  }

  /**
   * Score quality of artifact
   */
  async scoreQuality(artifact: DatasetArtifact): Promise<QualityScores> {
    const content = artifact.content;

    // Toxicity detection (basic pattern matching)
    const toxicity = this.detectToxicity(content);

    // PII detection
    const piiResult = this.detectPII(content);

    // Diversity score (vocabulary richness)
    const diversity = this.calculateDiversity(content);

    // Complexity score (based on content type)
    const complexity = this.calculateComplexity(content, artifact.contentType);

    // Overall quality (weighted average)
    const overall =
      (1 - toxicity) * 0.3 + // Low toxicity is good
      (piiResult.hasPII ? 0 : 1) * 0.2 + // No PII is good
      diversity * 0.25 +
      complexity * 0.25;

    return {
      overall: Math.round(overall * 100) / 100,
      toxicity: Math.round(toxicity * 100) / 100,
      hasPII: piiResult.hasPII,
      piiTypes: piiResult.types,
      diversity: Math.round(diversity * 100) / 100,
      complexity: Math.round(complexity * 100) / 100,
    };
  }

  /**
   * Detect toxicity in content
   */
  private detectToxicity(content: string): number {
    const toxicPatterns = [
      /\b(hate|stupid|idiot|dumb|kill|die|death)\b/gi,
      /\b(racist|sexist|discriminat(e|ion))\b/gi,
      /\b(offensive|vulgar|profan(e|ity))\b/gi,
    ];

    let toxicMatches = 0;
    for (const pattern of toxicPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        toxicMatches += matches.length;
      }
    }

    // Normalize by content length
    const toxicityScore = Math.min(toxicMatches / (content.length / 1000), 1);

    return toxicityScore;
  }

  /**
   * Detect PII (Personally Identifiable Information)
   */
  private detectPII(content: string): { hasPII: boolean; types: string[] } {
    const piiTypes: string[] = [];

    // Email addresses
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g.test(content)) {
      piiTypes.push('email');
    }

    // Phone numbers (various formats)
    if (
      /\b(\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/g.test(content) ||
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g.test(content)
    ) {
      piiTypes.push('phone');
    }

    // SSN (###-##-####)
    if (/\b\d{3}-\d{2}-\d{4}\b/g.test(content)) {
      piiTypes.push('ssn');
    }

    // Credit card numbers (simplified check)
    if (/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g.test(content)) {
      piiTypes.push('credit_card');
    }

    // IP addresses
    if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/g.test(content)) {
      piiTypes.push('ip_address');
    }

    // API keys / tokens (basic heuristic)
    if (/\b[A-Za-z0-9_-]{32,}\b/g.test(content)) {
      piiTypes.push('api_key');
    }

    return {
      hasPII: piiTypes.length > 0,
      types: piiTypes,
    };
  }

  /**
   * Calculate diversity (vocabulary richness)
   */
  private calculateDiversity(content: string): number {
    const words = content
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);

    if (words.length === 0) return 0;

    const uniqueWords = new Set(words);
    const diversity = uniqueWords.size / words.length;

    return Math.min(diversity * 2, 1); // Scale up a bit
  }

  /**
   * Calculate complexity based on content type
   */
  private calculateComplexity(content: string, contentType: string): number {
    if (contentType === 'code') {
      // Code complexity: function definitions, control structures
      const functions = (content.match(/function |async |const \w+ = /g) || []).length;
      const controlStructures = (content.match(/if |for |while |switch /g) || []).length;
      const complexity = (functions + controlStructures) / (content.length / 1000);
      return Math.min(complexity / 10, 1);
    } else {
      // Text complexity: average word length, sentence structure
      const words = content.split(/\s+/);
      const avgWordLength =
        words.reduce((sum, w) => sum + w.length, 0) / (words.length || 1);
      const complexity = avgWordLength / 10; // 10+ chars per word = high complexity
      return Math.min(complexity, 1);
    }
  }

  /**
   * Store quality metrics
   */
  private async storeQualityMetrics(
    artifactId: string,
    scores: QualityScores
  ): Promise<void> {
    const metrics = [
      { name: 'overall_quality', value: scores.overall, type: 'quality' },
      { name: 'toxicity', value: scores.toxicity, type: 'toxicity' },
      { name: 'diversity', value: scores.diversity, type: 'diversity' },
      { name: 'complexity', value: scores.complexity, type: 'quality' },
    ];

    for (const metric of metrics) {
      await this.pool.query(
        `INSERT INTO dataset_quality_metrics
         (artifact_id, metric_name, metric_value, metric_type)
         VALUES ($1, $2, $3, $4)`,
        [artifactId, metric.name, metric.value, metric.type]
      );
    }
  }

  /**
   * Curate artifact (make decision)
   */
  async curateArtifact(decision: CurationDecision): Promise<void> {
    await this.pool.query(
      `UPDATE dataset_artifacts
       SET curation_status = $1,
           curation_reason = $2,
           curated_by = $3,
           curated_at = NOW()
       WHERE artifact_id = $4`,
      [decision.decision === 'approve' ? 'approved' : decision.decision === 'reject' ? 'rejected' : 'flagged',
       decision.reason,
       decision.curatedBy,
       decision.artifactId]
    );

    this.emit('artifact-curated', decision);

    logger.info(
      { artifactId: decision.artifactId, decision: decision.decision },
      'Artifact curated'
    );
  }

  /**
   * Bulk curate based on criteria
   */
  async bulkCurate(
    criteria: CurationCriteria,
    curatedBy: string
  ): Promise<{ approved: number; rejected: number; flagged: number }> {
    const config = { ...DEFAULT_CURATION_CRITERIA, ...criteria };

    logger.info({ criteria: config }, 'Starting bulk curation');

    let approved = 0;
    let rejected = 0;
    let flagged = 0;

    // Get pending artifacts
    const result = await this.pool.query(
      `SELECT artifact_id, quality_score, toxicity_score, pii_detected, origin, origin_confidence
       FROM dataset_artifacts
       WHERE curation_status = 'pending'`
    );

    for (const row of result.rows) {
      let decision: 'approve' | 'reject' | 'flag' = 'approve';
      let reason = 'Meets quality criteria';

      // Check quality score
      if (row.quality_score < config.minQualityScore!) {
        decision = 'reject';
        reason = `Quality score ${row.quality_score} below threshold ${config.minQualityScore}`;
      }

      // Check toxicity
      if (row.toxicity_score > config.maxToxicityScore!) {
        decision = 'reject';
        reason = `Toxicity score ${row.toxicity_score} above threshold ${config.maxToxicityScore}`;
      }

      // Check PII
      if (row.pii_detected && !config.allowPII) {
        decision = 'reject';
        reason = 'Contains PII';
      }

      // Check synthetic
      if (row.origin === 'synthetic' && !config.allowSynthetic) {
        decision = 'reject';
        reason = 'Synthetic content not allowed';
      }

      // Check confidence
      if (
        row.origin_confidence &&
        row.origin_confidence < config.minConfidence!
      ) {
        decision = 'flag';
        reason = `Low confidence (${row.origin_confidence}) - needs review`;
      }

      // Execute decision
      await this.curateArtifact({
        artifactId: row.artifact_id,
        decision,
        reason,
        curatedBy,
      });

      if (decision === 'approve') approved++;
      else if (decision === 'reject') rejected++;
      else if (decision === 'flag') flagged++;
    }

    logger.info({ approved, rejected, flagged }, 'Bulk curation complete');

    return { approved, rejected, flagged };
  }

  /**
   * Get curation queue (pending artifacts)
   */
  async getCurationQueue(filters?: {
    contentType?: string;
    origin?: string;
    minQualityScore?: number;
    limit?: number;
  }): Promise<any[]> {
    const conditions = ['curation_status = $1'];
    const values: any[] = ['pending'];
    let paramIndex = 2;

    if (filters?.contentType) {
      conditions.push(`content_type = $${paramIndex++}`);
      values.push(filters.contentType);
    }

    if (filters?.origin) {
      conditions.push(`origin = $${paramIndex++}`);
      values.push(filters.origin);
    }

    if (filters?.minQualityScore !== undefined) {
      conditions.push(`quality_score >= $${paramIndex++}`);
      values.push(filters.minQualityScore);
    }

    const limit = filters?.limit || 100;

    const result = await this.pool.query(
      `SELECT * FROM dataset_artifacts
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${paramIndex}`,
      [...values, limit]
    );

    return result.rows;
  }

  /**
   * Get dataset statistics
   */
  async getDatasetStats(): Promise<DatasetStats> {
    const result = await this.pool.query(
      `SELECT * FROM v_dataset_quality_overview`
    );

    let totalArtifacts = 0;
    let approved = 0;
    let rejected = 0;
    let flagged = 0;
    let pending = 0;
    let totalQuality = 0;
    const originBreakdown: Record<string, number> = {};

    for (const row of result.rows) {
      const count = parseInt(row.artifact_count);
      totalArtifacts += count;

      if (row.curation_status === 'approved') approved += count;
      else if (row.curation_status === 'rejected') rejected += count;
      else if (row.curation_status === 'flagged') flagged += count;
      else if (row.curation_status === 'pending') pending += count;

      originBreakdown[row.origin] = (originBreakdown[row.origin] || 0) + count;
      totalQuality += parseFloat(row.avg_quality_score || 0) * count;
    }

    const avgQualityScore = totalArtifacts > 0 ? totalQuality / totalArtifacts : 0;

    return {
      totalArtifacts,
      approved,
      rejected,
      flagged,
      pending,
      avgQualityScore: Math.round(avgQualityScore * 100) / 100,
      originBreakdown,
      contentTypeBreakdown: {}, // Would need separate query
    };
  }

  /**
   * Legacy method for backward compatibility
   */
  async labelOrigin(artifactId: string, origin: string): Promise<void> {
    await this.pool.query(
      `UPDATE dataset_artifacts SET origin = $1 WHERE artifact_id = $2`,
      [origin, artifactId]
    );
  }
}
