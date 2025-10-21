/**
 * Prompt Shield Guard
 *
 * Roadmap: M5 - Safety-in-Depth
 *
 * Guard: guard.promptShield
 *
 * Detects and blocks prompt injection attacks.
 *
 * Acceptance:
 * - Red-team suite fails to override tools on seeded attacks
 */

import pino from 'pino';
import { Pool } from 'pg';

const logger = pino({ name: 'prompt-shield' });

// ============================================================================
// Types
// ============================================================================

export interface PromptShieldResult {
  safe: boolean;
  threats: PromptThreat[];
  sanitizedPrompt?: string;
  confidence: number;
}

export interface PromptThreat {
  type:
    | 'instruction_override'
    | 'role_switching'
    | 'delimiter_manipulation'
    | 'encoding_attack'
    | 'jailbreak'
    | 'system_disclosure';
  severity: 'critical' | 'high' | 'medium' | 'low';
  pattern: string;
  location: number;
  description: string;
}

// ============================================================================
// Prompt Shield Guard
// ============================================================================

export class PromptShieldGuard {
  private patterns: Map<string, RegExp[]> = new Map();
  private blocklist: Set<string> = new Set();

  constructor(private db: Pool) {
    this.initializePatterns();
    this.loadBlocklist();
  }

  /**
   * Initialize threat patterns
   */
  private initializePatterns() {
    // Instruction override patterns
    this.patterns.set('instruction_override', [
      /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/i,
      /disregard\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?)/i,
      /forget\s+(all\s+)?(previous|above)\s+(instructions?|prompts?)/i,
      /new\s+(instructions?|task|goal|objective):/i,
      /instead,?\s+(do|perform|execute|run)/i,
    ]);

    // Role switching patterns
    this.patterns.set('role_switching', [
      /you\s+are\s+now\s+(a|an|the)/i,
      /act\s+as\s+(a|an|the)/i,
      /pretend\s+(to\s+be|you\s+are)/i,
      /roleplay\s+as/i,
      /simulate\s+(a|an|the)/i,
      /from\s+now\s+on,?\s+you\s+(are|will\s+be)/i,
    ]);

    // Delimiter manipulation
    this.patterns.set('delimiter_manipulation', [
      /"""\s*\n\s*"""/,
      /```\s*\n\s*```/,
      /---\s*\n\s*---/,
      /===\s*\n\s*===/,
      /<\|endoftext\|>/i,
      /<\|im_end\|>/i,
    ]);

    // Encoding attacks
    this.patterns.set('encoding_attack', [
      /\\x[0-9a-f]{2}/i, // Hex encoding
      /&#\d+;/, // HTML entities
      /\\u[0-9a-f]{4}/i, // Unicode escape
      /%[0-9a-f]{2}/i, // URL encoding
      /base64[,:]/, // Base64 hints
    ]);

    // Jailbreak patterns
    this.patterns.set('jailbreak', [
      /DAN\s+(mode|prompt)/i,
      /developer\s+mode/i,
      /unrestricted\s+mode/i,
      /enable\s+god\s+mode/i,
      /RLHF\s+bypass/i,
      /alignment\s+override/i,
    ]);

    // System disclosure
    this.patterns.set('system_disclosure', [
      /what\s+(are|is)\s+your\s+(system|initial)\s+(prompt|instructions?)/i,
      /show\s+(me\s+)?your\s+(system|initial)\s+(prompt|instructions?)/i,
      /reveal\s+your\s+(system|initial)\s+(prompt|instructions?)/i,
      /print\s+(your\s+)?(system|initial)\s+(prompt|instructions?)/i,
    ]);
  }

  /**
   * Load blocklist from database
   */
  private async loadBlocklist() {
    try {
      const result = await this.db.query(`
        SELECT phrase FROM prompt_blocklist WHERE active = true
      `);

      for (const row of result.rows) {
        this.blocklist.add(row.phrase.toLowerCase());
      }

      logger.info({ count: this.blocklist.size }, 'Blocklist loaded');
    } catch (err) {
      logger.warn({ err }, 'Failed to load blocklist');
    }
  }

  /**
   * Check prompt for threats
   */
  async check(prompt: string, context?: Record<string, any>): Promise<PromptShieldResult> {
    logger.debug({ promptLength: prompt.length }, 'Checking prompt');

    const threats: PromptThreat[] = [];

    // Check pattern-based threats
    for (const [type, patterns] of this.patterns.entries()) {
      for (const pattern of patterns) {
        const match = pattern.exec(prompt);
        if (match) {
          threats.push({
            type: type as PromptThreat['type'],
            severity: this.getSeverity(type as PromptThreat['type']),
            pattern: pattern.source,
            location: match.index,
            description: this.getDescription(type as PromptThreat['type']),
          });
        }
      }
    }

    // Check blocklist
    const lowerPrompt = prompt.toLowerCase();
    for (const blocked of this.blocklist) {
      if (lowerPrompt.includes(blocked)) {
        threats.push({
          type: 'instruction_override',
          severity: 'critical',
          pattern: blocked,
          location: lowerPrompt.indexOf(blocked),
          description: `Blocklisted phrase: "${blocked}"`,
        });
      }
    }

    // Check for suspicious patterns
    const suspiciousPatterns = this.detectSuspiciousPatterns(prompt);
    threats.push(...suspiciousPatterns);

    // Calculate confidence
    const confidence = this.calculateConfidence(threats);

    // Determine if safe
    const criticalThreats = threats.filter((t) => t.severity === 'critical');
    const safe = criticalThreats.length === 0 && threats.length < 3;

    // Sanitize if needed
    let sanitizedPrompt: string | undefined;
    if (!safe && context?.autoSanitize) {
      sanitizedPrompt = this.sanitize(prompt, threats);
    }

    const result: PromptShieldResult = {
      safe,
      threats,
      sanitizedPrompt,
      confidence,
    };

    // Log threat
    if (!safe) {
      await this.logThreat(prompt, result);
    }

    return result;
  }

  /**
   * Detect suspicious patterns
   */
  private detectSuspiciousPatterns(prompt: string): PromptThreat[] {
    const threats: PromptThreat[] = [];

    // Excessive special characters (possible obfuscation)
    const specialCharCount = (prompt.match(/[^a-zA-Z0-9\s.,!?]/g) || []).length;
    const specialCharRatio = specialCharCount / prompt.length;

    if (specialCharRatio > 0.3) {
      threats.push({
        type: 'encoding_attack',
        severity: 'medium',
        pattern: 'excessive_special_chars',
        location: 0,
        description: `${(specialCharRatio * 100).toFixed(0)}% special characters (possible obfuscation)`,
      });
    }

    // Repetitive patterns (possible delimiter manipulation)
    const repetitivePattern = /(.{10,})\1{3,}/;
    if (repetitivePattern.test(prompt)) {
      threats.push({
        type: 'delimiter_manipulation',
        severity: 'medium',
        pattern: 'repetitive_pattern',
        location: 0,
        description: 'Repetitive patterns detected',
      });
    }

    // Excessive newlines (possible context injection)
    const newlineCount = (prompt.match(/\n/g) || []).length;
    if (newlineCount > prompt.length / 50) {
      threats.push({
        type: 'delimiter_manipulation',
        severity: 'low',
        pattern: 'excessive_newlines',
        location: 0,
        description: `${newlineCount} newlines (possible context injection)`,
      });
    }

    return threats;
  }

  /**
   * Sanitize prompt by removing/replacing threats
   */
  private sanitize(prompt: string, threats: PromptThreat[]): string {
    let sanitized = prompt;

    // Sort threats by location (reverse) to avoid offset issues
    const sortedThreats = [...threats].sort((a, b) => b.location - a.location);

    for (const threat of sortedThreats) {
      if (threat.severity === 'critical' || threat.severity === 'high') {
        // Remove critical/high threats
        // TODO: Implement more sophisticated removal based on pattern type
        const pattern = new RegExp(threat.pattern, 'gi');
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      }
    }

    return sanitized;
  }

  /**
   * Get severity for threat type
   */
  private getSeverity(type: PromptThreat['type']): PromptThreat['severity'] {
    const severityMap: Record<PromptThreat['type'], PromptThreat['severity']> = {
      instruction_override: 'critical',
      role_switching: 'high',
      delimiter_manipulation: 'medium',
      encoding_attack: 'medium',
      jailbreak: 'critical',
      system_disclosure: 'high',
    };

    return severityMap[type] || 'low';
  }

  /**
   * Get description for threat type
   */
  private getDescription(type: PromptThreat['type']): string {
    const descriptions: Record<PromptThreat['type'], string> = {
      instruction_override: 'Attempt to override system instructions',
      role_switching: 'Attempt to change AI role or behavior',
      delimiter_manipulation: 'Manipulation of delimiters to break context',
      encoding_attack: 'Encoded or obfuscated content detected',
      jailbreak: 'Known jailbreak pattern detected',
      system_disclosure: 'Attempt to reveal system prompt',
    };

    return descriptions[type] || 'Unknown threat';
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(threats: PromptThreat[]): number {
    if (threats.length === 0) return 1.0;

    // Weight by severity
    const severityWeights = {
      critical: 1.0,
      high: 0.7,
      medium: 0.4,
      low: 0.2,
    };

    const totalWeight = threats.reduce(
      (sum, t) => sum + severityWeights[t.severity],
      0
    );

    // Normalize to 0-1 (inverted - high confidence in threat = low overall safety confidence)
    return Math.max(0, 1 - totalWeight / 3);
  }

  /**
   * Log threat to database
   */
  private async logThreat(prompt: string, result: PromptShieldResult): Promise<void> {
    try {
      await this.db.query(
        `
        INSERT INTO prompt_threats (
          prompt_hash, threat_count, threats, confidence, timestamp
        ) VALUES ($1, $2, $3, $4, NOW())
      `,
        [
          this.hashPrompt(prompt),
          result.threats.length,
          JSON.stringify(result.threats),
          result.confidence,
        ]
      );
    } catch (err) {
      logger.error({ err }, 'Failed to log threat');
    }
  }

  /**
   * Hash prompt for logging (privacy)
   */
  private hashPrompt(prompt: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(prompt).digest('hex').substring(0, 16);
  }

  /**
   * Add phrase to blocklist
   */
  async addToBlocklist(phrase: string): Promise<void> {
    await this.db.query(
      `INSERT INTO prompt_blocklist (phrase, active) VALUES ($1, true)
       ON CONFLICT (phrase) DO UPDATE SET active = true`,
      [phrase.toLowerCase()]
    );

    this.blocklist.add(phrase.toLowerCase());

    logger.info({ phrase }, 'Added to blocklist');
  }

  /**
   * Get threat statistics
   */
  async getStats(days: number = 7): Promise<{
    totalThreats: number;
    byType: Record<string, number>;
    avgConfidence: number;
  }> {
    const result = await this.db.query(
      `
      SELECT
        COUNT(*) as total,
        AVG(confidence) as avg_confidence
      FROM prompt_threats
      WHERE timestamp > NOW() - INTERVAL '${days} days'
    `
    );

    const byTypeResult = await this.db.query(
      `
      SELECT
        threat->>'type' as type,
        COUNT(*) as count
      FROM prompt_threats,
        jsonb_array_elements(threats) as threat
      WHERE timestamp > NOW() - INTERVAL '${days} days'
      GROUP BY threat->>'type'
    `
    );

    const byType: Record<string, number> = {};
    for (const row of byTypeResult.rows) {
      byType[row.type] = parseInt(row.count);
    }

    return {
      totalThreats: parseInt(result.rows[0]?.total || '0'),
      byType,
      avgConfidence: parseFloat(result.rows[0]?.avg_confidence || '0'),
    };
  }
}

// ============================================================================
// Database Migration
// ============================================================================

export const PROMPT_SHIELD_MIGRATION = `
-- Prompt threats log
CREATE TABLE IF NOT EXISTS prompt_threats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_hash VARCHAR(16) NOT NULL,
  threat_count INTEGER NOT NULL,
  threats JSONB NOT NULL,
  confidence NUMERIC(3, 2) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_prompt_threats_timestamp ON prompt_threats(timestamp);
CREATE INDEX IF NOT EXISTS idx_prompt_threats_hash ON prompt_threats(prompt_hash);

COMMENT ON TABLE prompt_threats IS 'Log of detected prompt injection threats';

-- Prompt blocklist
CREATE TABLE IF NOT EXISTS prompt_blocklist (
  phrase VARCHAR(500) PRIMARY KEY,
  active BOOLEAN DEFAULT true,
  added_at TIMESTAMP NOT NULL DEFAULT NOW(),
  added_by VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_blocklist_active ON prompt_blocklist(active);

COMMENT ON TABLE prompt_blocklist IS 'Blocked phrases for prompt shield';
`;
