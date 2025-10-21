/**
 * Learning Curator - Enhanced dataset curation
 *
 * Builds high-quality learning datasets from telemetry with deduplication, redaction, and labeling
 */

import pino from 'pino';
import { Pool } from 'pg';
import crypto from 'crypto';

const logger = pino({ name: 'learning-curator' });

export interface LearningBundle {
  runId: string;
  artifacts: ArtifactSample[];
  metrics: Record<string, any>;
  gates: Record<string, any>;
  qav: Record<string, any>;
  costs: Record<string, any>;
}

export interface ArtifactSample {
  artifactId: string;
  type: string;
  content: string;
  inputHash: string;
  outputHash: string;
  labels: SampleLabels;
}

export interface SampleLabels {
  grounding: number; // 0-1
  contradiction: boolean;
  specificity: number; // 0-1
  correctness: number; // 0-1
  gatesPassed: string[];
  gatesFailed: string[];
  origin: 'human' | 'ai-generated' | 'hybrid';
  syntheticConfidence: number; // 0-1
}

export class LearningCurator {
  constructor(private db: Pool) {}

  /**
   * Process learning bundle
   */
  async processBundle(bundle: LearningBundle): Promise<string> {
    const datasetId = `dataset_${Date.now()}`;

    logger.info({ runId: bundle.runId, datasetId }, 'Processing learning bundle');

    // Extract samples from bundle
    const samples = await this.extractSamples(bundle);

    // Deduplicate
    const uniqueSamples = await this.deduplicateSamples(samples);

    // Redact PII
    const redactedSamples = await this.redactSamples(uniqueSamples);

    // Label samples using guards and QAV
    const labeledSamples = await this.labelSamples(redactedSamples, bundle);

    // Store in dataset
    await this.storeSamples(datasetId, labeledSamples);

    logger.info(
      { datasetId, originalCount: samples.length, finalCount: labeledSamples.length },
      'Learning bundle processed'
    );

    return datasetId;
  }

  /**
   * Extract artifact samples from bundle
   */
  private async extractSamples(bundle: LearningBundle): Promise<ArtifactSample[]> {
    const samples: ArtifactSample[] = [];

    for (const artifact of bundle.artifacts) {
      const inputHash = this.hashContent(artifact.content);
      const outputHash = inputHash; // Simplified

      samples.push({
        artifactId: artifact.artifactId,
        type: artifact.type,
        content: artifact.content,
        inputHash,
        outputHash,
        labels: {
          grounding: 0,
          contradiction: false,
          specificity: 0,
          correctness: 0,
          gatesPassed: [],
          gatesFailed: [],
          origin: 'ai-generated',
          syntheticConfidence: 1.0,
        },
      });
    }

    return samples;
  }

  /**
   * Deduplicate samples
   */
  private async deduplicateSamples(samples: ArtifactSample[]): Promise<ArtifactSample[]> {
    // Check existing hashes
    const hashes = samples.map((s) => s.inputHash);

    const existing = await this.db.query(
      `SELECT DISTINCT input_hash FROM dataset_samples WHERE input_hash = ANY($1)`,
      [hashes]
    );

    const existingHashes = new Set(existing.rows.map((r) => r.input_hash));

    // Filter out duplicates
    return samples.filter((s) => !existingHashes.has(s.inputHash));
  }

  /**
   * Redact PII from samples
   */
  private async redactSamples(samples: ArtifactSample[]): Promise<ArtifactSample[]> {
    // Simplified PII redaction
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, // Email
      /\b\d{16}\b/g, // Credit card
      /\b\d{3}-\d{3}-\d{4}\b/g, // Phone
    ];

    return samples.map((sample) => {
      let content = sample.content;

      piiPatterns.forEach((pattern) => {
        content = content.replace(pattern, '[REDACTED]');
      });

      return { ...sample, content };
    });
  }

  /**
   * Label samples using guards and QAV
   */
  private async labelSamples(samples: ArtifactSample[], bundle: LearningBundle): Promise<ArtifactSample[]> {
    // Label using QAV scores
    const qavScores = bundle.qav || {};

    return samples.map((sample) => {
      const labels: SampleLabels = {
        grounding: qavScores.grounding || 0.8,
        contradiction: qavScores.hasContradiction || false,
        specificity: qavScores.specificity || 0.7,
        correctness: qavScores.correctness || 0.8,
        gatesPassed: bundle.gates?.passed || [],
        gatesFailed: bundle.gates?.failed || [],
        origin: this.detectOrigin(sample.content),
        syntheticConfidence: this.detectSyntheticConfidence(sample.content),
      };

      return { ...sample, labels };
    });
  }

  /**
   * Store samples in dataset
   */
  private async storeSamples(datasetId: string, samples: ArtifactSample[]): Promise<void> {
    for (const sample of samples) {
      await this.db.query(
        `INSERT INTO dataset_samples (
          dataset_id, artifact_id, type, content, input_hash, output_hash,
          grounding, contradiction, specificity, correctness,
          gates_passed, gates_failed, origin, synthetic_confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          datasetId,
          sample.artifactId,
          sample.type,
          sample.content,
          sample.inputHash,
          sample.outputHash,
          sample.labels.grounding,
          sample.labels.contradiction,
          sample.labels.specificity,
          sample.labels.correctness,
          JSON.stringify(sample.labels.gatesPassed),
          JSON.stringify(sample.labels.gatesFailed),
          sample.labels.origin,
          sample.labels.syntheticConfidence,
        ]
      );
    }
  }

  /**
   * Detect origin of content
   */
  private detectOrigin(content: string): 'human' | 'ai-generated' | 'hybrid' {
    // Simplified heuristics
    // In production, use ML classifier or provenance tracking

    const aiIndicators = ['as an ai', 'i cannot', 'i apologize', 'based on my analysis'];
    const humanIndicators = ['btw', 'lol', 'tbh', 'imho'];

    const hasAIIndicators = aiIndicators.some((ind) => content.toLowerCase().includes(ind));
    const hasHumanIndicators = humanIndicators.some((ind) => content.toLowerCase().includes(ind));

    if (hasAIIndicators && hasHumanIndicators) return 'hybrid';
    if (hasAIIndicators) return 'ai-generated';
    if (hasHumanIndicators) return 'human';

    return 'ai-generated'; // Default
  }

  /**
   * Detect synthetic confidence
   */
  private detectSyntheticConfidence(content: string): number {
    // Simplified scoring
    // In production, use model-based detection

    const aiPhrases = ['as an ai', 'i cannot', 'based on my analysis', 'according to'];
    const matchCount = aiPhrases.filter((phrase) => content.toLowerCase().includes(phrase)).length;

    return Math.min(matchCount * 0.25 + 0.5, 1.0);
  }

  /**
   * Hash content for deduplication
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get dataset samples
   */
  async getDatasetSamples(datasetId: string, limit?: number): Promise<any[]> {
    const result = await this.db.query(
      `SELECT * FROM dataset_samples WHERE dataset_id = $1 ORDER BY created_at LIMIT $2`,
      [datasetId, limit || 100]
    );

    return result.rows;
  }
}

export const LEARNING_CURATOR_MIGRATION = `
-- Enhanced dataset samples table (extends existing)
ALTER TABLE dataset_samples ADD COLUMN IF NOT EXISTS dataset_id VARCHAR(200);
ALTER TABLE dataset_samples ADD COLUMN IF NOT EXISTS artifact_id VARCHAR(200);
ALTER TABLE dataset_samples ADD COLUMN IF NOT EXISTS type VARCHAR(100);
ALTER TABLE dataset_samples ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE dataset_samples ADD COLUMN IF NOT EXISTS grounding DECIMAL(3,2);
ALTER TABLE dataset_samples ADD COLUMN IF NOT EXISTS contradiction BOOLEAN DEFAULT false;
ALTER TABLE dataset_samples ADD COLUMN IF NOT EXISTS specificity DECIMAL(3,2);
ALTER TABLE dataset_samples ADD COLUMN IF NOT EXISTS correctness DECIMAL(3,2);
ALTER TABLE dataset_samples ADD COLUMN IF NOT EXISTS gates_passed JSONB DEFAULT '[]'::jsonb;
ALTER TABLE dataset_samples ADD COLUMN IF NOT EXISTS gates_failed JSONB DEFAULT '[]'::jsonb;
ALTER TABLE dataset_samples ADD COLUMN IF NOT EXISTS origin VARCHAR(20);
ALTER TABLE dataset_samples ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_dataset_samples_dataset ON dataset_samples(dataset_id);
CREATE INDEX IF NOT EXISTS idx_dataset_samples_origin ON dataset_samples(origin);

COMMENT ON TABLE dataset_samples IS 'Curated learning dataset with labels from guards/QAV';
`;
