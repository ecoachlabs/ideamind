/**
 * IP Provenance Tool
 *
 * Roadmap: M7 - Compliance Modes
 *
 * Tool: tool.ip.provenance
 *
 * Tracks origin of code artifacts (human vs AI, training data sources).
 * Essential for IP compliance, copyright attribution, and audit trails.
 *
 * Acceptance:
 * - 100% of AI-generated code tagged with model + training data
 * - Provenance queryable by file/function
 * - Attribution report generated for compliance
 */

import pino from 'pino';
import { Pool } from 'pg';
import { EventEmitter } from 'events';
import crypto from 'crypto';

const logger = pino({ name: 'ip-provenance' });

// ============================================================================
// Types
// ============================================================================

export interface CodeArtifact {
  id: string;
  type: 'file' | 'function' | 'class' | 'snippet';
  path: string;
  content: string;
  hash: string;
  startLine?: number;
  endLine?: number;
}

export interface ProvenanceRecord {
  artifactId: string;
  origin: 'human' | 'ai' | 'hybrid' | 'external' | 'unknown';
  source: ProvenanceSource;
  attribution: Attribution;
  confidence: number;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface ProvenanceSource {
  type: 'author' | 'ai_model' | 'repository' | 'library' | 'snippet_db';
  name: string;
  version?: string;
  license?: string;
  trainingDataSources?: string[];
  url?: string;
}

export interface Attribution {
  authors: string[];
  contributors: string[];
  copyrightHolder?: string;
  licenseText?: string;
  aiModelUsed?: string;
  aiProvider?: string;
  generationDate?: Date;
}

export interface ProvenanceReport {
  totalArtifacts: number;
  byOrigin: Record<ProvenanceRecord['origin'], number>;
  aiGeneratedPercentage: number;
  humanWrittenPercentage: number;
  hybridPercentage: number;
  artifacts: ProvenanceArtifact[];
  riskAssessment: IPRiskAssessment;
  attributionList: AttributionEntry[];
}

export interface ProvenanceArtifact {
  path: string;
  type: CodeArtifact['type'];
  origin: ProvenanceRecord['origin'];
  source: string;
  license?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface IPRiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  risks: IPRisk[];
  recommendations: string[];
}

export interface IPRisk {
  type: 'license_conflict' | 'missing_attribution' | 'unknown_origin' | 'training_data_risk' | 'copyright_claim';
  severity: 'low' | 'medium' | 'high' | 'critical';
  artifact: string;
  description: string;
  mitigation: string;
}

export interface AttributionEntry {
  source: string;
  license: string;
  copyrightHolder?: string;
  artifacts: string[];
}

export interface WatermarkDetection {
  detected: boolean;
  confidence: number;
  watermarkType?: 'text' | 'structural' | 'statistical';
  source?: string;
  details?: string;
}

// ============================================================================
// IP Provenance Tool
// ============================================================================

export class IPProvenanceTool extends EventEmitter {
  private provenanceRecords: Map<string, ProvenanceRecord> = new Map();

  constructor(private db: Pool) {
    super();
  }

  /**
   * Record provenance for a code artifact
   */
  async record(artifact: CodeArtifact, record: Omit<ProvenanceRecord, 'artifactId'>): Promise<string> {
    const artifactId = artifact.id || this.generateArtifactId(artifact);

    const provenanceRecord: ProvenanceRecord = {
      artifactId,
      ...record,
    };

    // Store in memory
    this.provenanceRecords.set(artifactId, provenanceRecord);

    // Store in database
    await this.db.query(
      `
      INSERT INTO code_provenance (
        artifact_id,
        artifact_type,
        artifact_path,
        artifact_hash,
        origin,
        source_type,
        source_name,
        source_version,
        source_license,
        training_data_sources,
        attribution,
        confidence,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (artifact_id) DO UPDATE SET
        origin = $5,
        source_type = $6,
        source_name = $7,
        source_version = $8,
        source_license = $9,
        training_data_sources = $10,
        attribution = $11,
        confidence = $12,
        metadata = $13,
        updated_at = NOW()
    `,
      [
        artifactId,
        artifact.type,
        artifact.path,
        artifact.hash,
        record.origin,
        record.source.type,
        record.source.name,
        record.source.version,
        record.source.license,
        JSON.stringify(record.source.trainingDataSources || []),
        JSON.stringify(record.attribution),
        record.confidence,
        JSON.stringify(record.metadata),
      ]
    );

    logger.info({ artifactId, origin: record.origin }, 'Provenance recorded');
    this.emit('provenance-recorded', { artifactId, record });

    return artifactId;
  }

  /**
   * Track AI-generated code
   */
  async trackAIGeneration(
    artifact: CodeArtifact,
    modelId: string,
    provider: string,
    trainingDataSources: string[] = [],
    confidence: number = 1.0
  ): Promise<string> {
    return this.record(artifact, {
      origin: 'ai',
      source: {
        type: 'ai_model',
        name: modelId,
        version: undefined,
        license: undefined,
        trainingDataSources,
      },
      attribution: {
        authors: [],
        contributors: [],
        aiModelUsed: modelId,
        aiProvider: provider,
        generationDate: new Date(),
      },
      confidence,
      timestamp: new Date(),
      metadata: {
        modelId,
        provider,
        trainingDataSources,
      },
    });
  }

  /**
   * Track human-authored code
   */
  async trackHumanAuthorship(
    artifact: CodeArtifact,
    author: string,
    contributors: string[] = [],
    confidence: number = 1.0
  ): Promise<string> {
    return this.record(artifact, {
      origin: 'human',
      source: {
        type: 'author',
        name: author,
      },
      attribution: {
        authors: [author],
        contributors,
        copyrightHolder: author,
      },
      confidence,
      timestamp: new Date(),
      metadata: {
        author,
        contributors,
      },
    });
  }

  /**
   * Track external/library code
   */
  async trackExternalCode(
    artifact: CodeArtifact,
    library: string,
    version: string,
    license: string,
    url?: string,
    confidence: number = 1.0
  ): Promise<string> {
    return this.record(artifact, {
      origin: 'external',
      source: {
        type: 'library',
        name: library,
        version,
        license,
        url,
      },
      attribution: {
        authors: [],
        contributors: [],
        copyrightHolder: library,
        licenseText: license,
      },
      confidence,
      timestamp: new Date(),
      metadata: {
        library,
        version,
        license,
        url,
      },
    });
  }

  /**
   * Track hybrid code (human + AI)
   */
  async trackHybridCode(
    artifact: CodeArtifact,
    author: string,
    modelId: string,
    humanPercentage: number,
    aiPercentage: number,
    confidence: number = 0.8
  ): Promise<string> {
    return this.record(artifact, {
      origin: 'hybrid',
      source: {
        type: 'author',
        name: `${author} + ${modelId}`,
      },
      attribution: {
        authors: [author],
        contributors: [],
        aiModelUsed: modelId,
      },
      confidence,
      timestamp: new Date(),
      metadata: {
        author,
        modelId,
        humanPercentage,
        aiPercentage,
      },
    });
  }

  /**
   * Query provenance for artifact
   */
  async query(artifactId: string): Promise<ProvenanceRecord | null> {
    // Check memory first
    if (this.provenanceRecords.has(artifactId)) {
      return this.provenanceRecords.get(artifactId)!;
    }

    // Check database
    const result = await this.db.query(
      `SELECT * FROM code_provenance WHERE artifact_id = $1`,
      [artifactId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const record: ProvenanceRecord = {
      artifactId: row.artifact_id,
      origin: row.origin,
      source: {
        type: row.source_type,
        name: row.source_name,
        version: row.source_version,
        license: row.source_license,
        trainingDataSources: row.training_data_sources,
      },
      attribution: row.attribution,
      confidence: parseFloat(row.confidence),
      timestamp: row.created_at,
      metadata: row.metadata,
    };

    return record;
  }

  /**
   * Query provenance by file path
   */
  async queryByPath(path: string): Promise<ProvenanceRecord[]> {
    const result = await this.db.query(
      `SELECT * FROM code_provenance WHERE artifact_path = $1 ORDER BY created_at DESC`,
      [path]
    );

    return result.rows.map((row) => ({
      artifactId: row.artifact_id,
      origin: row.origin,
      source: {
        type: row.source_type,
        name: row.source_name,
        version: row.source_version,
        license: row.source_license,
        trainingDataSources: row.training_data_sources,
      },
      attribution: row.attribution,
      confidence: parseFloat(row.confidence),
      timestamp: row.created_at,
      metadata: row.metadata,
    }));
  }

  /**
   * Generate provenance report
   */
  async generateReport(projectPath?: string): Promise<ProvenanceReport> {
    logger.info({ projectPath }, 'Generating provenance report');

    const query = projectPath
      ? `SELECT * FROM code_provenance WHERE artifact_path LIKE $1`
      : `SELECT * FROM code_provenance`;

    const params = projectPath ? [`${projectPath}%`] : [];
    const result = await this.db.query(query, params);

    const artifacts: ProvenanceArtifact[] = [];
    const byOrigin: Record<ProvenanceRecord['origin'], number> = {
      human: 0,
      ai: 0,
      hybrid: 0,
      external: 0,
      unknown: 0,
    };

    for (const row of result.rows) {
      byOrigin[row.origin as ProvenanceRecord['origin']]++;

      artifacts.push({
        path: row.artifact_path,
        type: row.artifact_type,
        origin: row.origin,
        source: row.source_name,
        license: row.source_license,
        riskLevel: this.assessArtifactRisk(row),
      });
    }

    const totalArtifacts = result.rows.length;
    const aiGeneratedPercentage = totalArtifacts > 0 ? (byOrigin.ai / totalArtifacts) * 100 : 0;
    const humanWrittenPercentage = totalArtifacts > 0 ? (byOrigin.human / totalArtifacts) * 100 : 0;
    const hybridPercentage = totalArtifacts > 0 ? (byOrigin.hybrid / totalArtifacts) * 100 : 0;

    // Risk assessment
    const riskAssessment = this.assessIPRisks(artifacts);

    // Attribution list
    const attributionList = this.buildAttributionList(result.rows);

    const report: ProvenanceReport = {
      totalArtifacts,
      byOrigin,
      aiGeneratedPercentage,
      humanWrittenPercentage,
      hybridPercentage,
      artifacts,
      riskAssessment,
      attributionList,
    };

    // Store report
    await this.storeReport(report, projectPath);

    this.emit('report-generated', report);

    return report;
  }

  /**
   * Detect AI watermarks
   */
  async detectWatermark(content: string): Promise<WatermarkDetection> {
    // Text-based watermark patterns
    const textWatermarks = [
      { pattern: /\/\*\s*Generated by (Claude|GPT|Gemini|LLaMA)/i, source: 'AI Model' },
      { pattern: /This code was (generated|created|written) (by|using) (AI|Claude|GPT)/i, source: 'AI Model' },
      { pattern: /@generated/i, source: 'Code Generator' },
    ];

    for (const watermark of textWatermarks) {
      const match = content.match(watermark.pattern);
      if (match) {
        return {
          detected: true,
          confidence: 0.95,
          watermarkType: 'text',
          source: watermark.source,
          details: match[0],
        };
      }
    }

    // Structural watermarks (specific patterns in code structure)
    const structuralPatterns = [
      // Overly verbose comments
      /\/\/\s*.{200,}/g,
      // Repetitive function signatures
      /function\s+\w+\s*\([^)]*\)\s*:\s*\w+\s*{/g,
    ];

    let structuralScore = 0;
    for (const pattern of structuralPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 5) {
        structuralScore += 0.2;
      }
    }

    if (structuralScore > 0.6) {
      return {
        detected: true,
        confidence: structuralScore,
        watermarkType: 'structural',
        details: 'AI-like code patterns detected',
      };
    }

    // Statistical analysis (perplexity-based detection)
    const statisticalScore = this.calculatePerplexity(content);
    if (statisticalScore < 0.3) {
      // Low perplexity = likely AI-generated
      return {
        detected: true,
        confidence: 1 - statisticalScore,
        watermarkType: 'statistical',
        details: 'Low perplexity indicates AI generation',
      };
    }

    return {
      detected: false,
      confidence: 0,
    };
  }

  /**
   * Calculate perplexity (simplified heuristic)
   */
  private calculatePerplexity(content: string): number {
    // Simplified: measure of unpredictability
    // Low perplexity = repetitive, predictable (AI-like)
    // High perplexity = varied, unpredictable (human-like)

    const words = content.split(/\s+/);
    const uniqueWords = new Set(words);
    const repetitionRatio = uniqueWords.size / words.length;

    // Average word length variance
    const wordLengths = words.map((w) => w.length);
    const avgLength = wordLengths.reduce((a, b) => a + b, 0) / wordLengths.length;
    const variance =
      wordLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) /
      wordLengths.length;

    // Combine metrics (normalized to 0-1)
    return Math.min(1, (repetitionRatio + Math.sqrt(variance) / 10) / 2);
  }

  /**
   * Generate artifact ID
   */
  private generateArtifactId(artifact: CodeArtifact): string {
    const hash = crypto
      .createHash('sha256')
      .update(artifact.path + artifact.content)
      .digest('hex');
    return `artifact-${hash.substring(0, 16)}`;
  }

  /**
   * Assess artifact risk
   */
  private assessArtifactRisk(row: any): 'low' | 'medium' | 'high' | 'critical' {
    // Unknown origin = critical
    if (row.origin === 'unknown') {
      return 'critical';
    }

    // AI-generated without training data sources = high
    if (
      row.origin === 'ai' &&
      (!row.training_data_sources || row.training_data_sources.length === 0)
    ) {
      return 'high';
    }

    // External without license = high
    if (row.origin === 'external' && !row.source_license) {
      return 'high';
    }

    // Low confidence = medium
    if (parseFloat(row.confidence) < 0.7) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Assess IP risks
   */
  private assessIPRisks(artifacts: ProvenanceArtifact[]): IPRiskAssessment {
    const risks: IPRisk[] = [];

    for (const artifact of artifacts) {
      // Unknown origin
      if (artifact.origin === 'unknown') {
        risks.push({
          type: 'unknown_origin',
          severity: 'critical',
          artifact: artifact.path,
          description: 'Code origin cannot be determined',
          mitigation: 'Manually review and document authorship',
        });
      }

      // Missing license
      if (artifact.origin === 'external' && !artifact.license) {
        risks.push({
          type: 'missing_attribution',
          severity: 'high',
          artifact: artifact.path,
          description: 'External code without license information',
          mitigation: 'Identify and document license',
        });
      }

      // AI-generated with training data risk
      if (artifact.origin === 'ai') {
        risks.push({
          type: 'training_data_risk',
          severity: 'medium',
          artifact: artifact.path,
          description: 'AI-generated code may contain training data patterns',
          mitigation: 'Review for copyright/license issues from training data',
        });
      }

      // High risk level
      if (artifact.riskLevel === 'critical' || artifact.riskLevel === 'high') {
        risks.push({
          type: 'copyright_claim',
          severity: artifact.riskLevel === 'critical' ? 'critical' : 'high',
          artifact: artifact.path,
          description: 'High risk of copyright or license violation',
          mitigation: 'Legal review recommended',
        });
      }
    }

    // Calculate overall risk
    const criticalCount = risks.filter((r) => r.severity === 'critical').length;
    const highCount = risks.filter((r) => r.severity === 'high').length;

    let overallRisk: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (criticalCount > 0) overallRisk = 'critical';
    else if (highCount > 3) overallRisk = 'high';
    else if (highCount > 0) overallRisk = 'medium';

    // Recommendations
    const recommendations: string[] = [];
    if (criticalCount > 0) {
      recommendations.push(`CRITICAL: ${criticalCount} artifacts with unknown origin require immediate review`);
    }
    if (highCount > 0) {
      recommendations.push(`WARNING: ${highCount} artifacts with missing attribution/license`);
    }
    recommendations.push('Maintain comprehensive provenance records for all code');
    recommendations.push('Review AI-generated code for training data copyright issues');
    recommendations.push('Ensure all external code has proper license attribution');

    return {
      overallRisk,
      risks,
      recommendations,
    };
  }

  /**
   * Build attribution list
   */
  private buildAttributionList(rows: any[]): AttributionEntry[] {
    const attributionMap = new Map<string, AttributionEntry>();

    for (const row of rows) {
      const key = `${row.source_name}:${row.source_license || 'UNKNOWN'}`;

      if (!attributionMap.has(key)) {
        attributionMap.set(key, {
          source: row.source_name,
          license: row.source_license || 'UNKNOWN',
          copyrightHolder: row.attribution?.copyrightHolder,
          artifacts: [],
        });
      }

      attributionMap.get(key)!.artifacts.push(row.artifact_path);
    }

    return Array.from(attributionMap.values());
  }

  /**
   * Store report in database
   */
  private async storeReport(report: ProvenanceReport, projectPath?: string): Promise<void> {
    try {
      await this.db.query(
        `
        INSERT INTO provenance_reports (
          project_path,
          total_artifacts,
          by_origin,
          ai_percentage,
          human_percentage,
          hybrid_percentage,
          risk_assessment,
          attribution_list
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
        [
          projectPath || 'all',
          report.totalArtifacts,
          JSON.stringify(report.byOrigin),
          report.aiGeneratedPercentage,
          report.humanWrittenPercentage,
          report.hybridPercentage,
          JSON.stringify(report.riskAssessment),
          JSON.stringify(report.attributionList),
        ]
      );

      logger.info({ totalArtifacts: report.totalArtifacts }, 'Report stored');
    } catch (err) {
      logger.error({ err }, 'Failed to store report');
    }
  }
}

// ============================================================================
// Database Migration
// ============================================================================

export const IP_PROVENANCE_MIGRATION = `
-- Code provenance table
CREATE TABLE IF NOT EXISTS code_provenance (
  artifact_id VARCHAR(100) PRIMARY KEY,
  artifact_type VARCHAR(50) NOT NULL,
  artifact_path TEXT NOT NULL,
  artifact_hash VARCHAR(64) NOT NULL,
  origin VARCHAR(50) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_name VARCHAR(500) NOT NULL,
  source_version VARCHAR(100),
  source_license VARCHAR(100),
  training_data_sources JSONB DEFAULT '[]'::jsonb,
  attribution JSONB NOT NULL,
  confidence NUMERIC(3,2) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provenance_path ON code_provenance(artifact_path);
CREATE INDEX IF NOT EXISTS idx_provenance_origin ON code_provenance(origin);
CREATE INDEX IF NOT EXISTS idx_provenance_hash ON code_provenance(artifact_hash);
CREATE INDEX IF NOT EXISTS idx_provenance_timestamp ON code_provenance(created_at);

COMMENT ON TABLE code_provenance IS 'IP provenance tracking for code artifacts';

-- Provenance reports table
CREATE TABLE IF NOT EXISTS provenance_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_path TEXT NOT NULL,
  total_artifacts INTEGER NOT NULL,
  by_origin JSONB NOT NULL,
  ai_percentage NUMERIC(5,2) NOT NULL,
  human_percentage NUMERIC(5,2) NOT NULL,
  hybrid_percentage NUMERIC(5,2) NOT NULL,
  risk_assessment JSONB NOT NULL,
  attribution_list JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_project ON provenance_reports(project_path);
CREATE INDEX IF NOT EXISTS idx_reports_timestamp ON provenance_reports(created_at);

COMMENT ON TABLE provenance_reports IS 'IP provenance compliance reports';
`;
