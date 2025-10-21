/**
 * Data Exfiltration Guard
 *
 * Roadmap: M5 - Safety-in-Depth
 *
 * Guard: guard.exfilScan
 *
 * Detects and blocks attempts to exfiltrate sensitive data.
 *
 * Acceptance:
 * - Red-team suite fails to exfil on seeded attacks
 */

import pino from 'pino';
import { Pool } from 'pg';

const logger = pino({ name: 'exfil-guard' });

// ============================================================================
// Types
// ============================================================================

export interface ExfilScanResult {
  safe: boolean;
  violations: ExfilViolation[];
  sanitizedOutput?: string;
  riskScore: number; // 0-1
}

export interface ExfilViolation {
  type:
    | 'api_key'
    | 'password'
    | 'token'
    | 'pii'
    | 'credit_card'
    | 'ssn'
    | 'private_key'
    | 'connection_string'
    | 'url_exfil';
  severity: 'critical' | 'high' | 'medium' | 'low';
  pattern: string;
  matched: string; // Redacted version
  location: number;
  description: string;
}

export interface SensitivePattern {
  regex: RegExp;
  type: ExfilViolation['type'];
  severity: ExfilViolation['severity'];
  description: string;
}

// ============================================================================
// Exfil Guard
// ============================================================================

export class ExfilGuard {
  private patterns: SensitivePattern[] = [];
  private allowedDomains: Set<string> = new Set();

  constructor(private db: Pool) {
    this.initializePatterns();
    this.loadAllowedDomains();
  }

  /**
   * Initialize sensitive data patterns
   */
  private initializePatterns() {
    this.patterns = [
      // API Keys
      {
        regex: /\b([a-z0-9]{20,}[-_])?[A-Z0-9]{32,}\b/g,
        type: 'api_key',
        severity: 'critical',
        description: 'Potential API key detected',
      },
      {
        regex: /sk[-_][a-zA-Z0-9]{32,}/g,
        type: 'api_key',
        severity: 'critical',
        description: 'Secret key pattern detected',
      },

      // AWS Keys
      {
        regex: /AKIA[0-9A-Z]{16}/g,
        type: 'api_key',
        severity: 'critical',
        description: 'AWS Access Key ID detected',
      },

      // GitHub Tokens
      {
        regex: /gh[ps]_[a-zA-Z0-9]{36}/g,
        type: 'token',
        severity: 'critical',
        description: 'GitHub token detected',
      },

      // JWT Tokens
      {
        regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
        type: 'token',
        severity: 'high',
        description: 'JWT token detected',
      },

      // Passwords in common formats
      {
        regex: /(password|passwd|pwd)["\s:=]+[^\s"]{8,}/gi,
        type: 'password',
        severity: 'critical',
        description: 'Password value detected',
      },

      // Database connection strings
      {
        regex: /(mongodb|mysql|postgresql|mssql):\/\/[^\s]+/gi,
        type: 'connection_string',
        severity: 'critical',
        description: 'Database connection string detected',
      },

      // Private keys
      {
        regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g,
        type: 'private_key',
        severity: 'critical',
        description: 'Private key detected',
      },

      // Credit cards (basic Luhn check would be better)
      {
        regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g,
        type: 'credit_card',
        severity: 'critical',
        description: 'Credit card number detected',
      },

      // SSN
      {
        regex: /\b\d{3}-\d{2}-\d{4}\b/g,
        type: 'ssn',
        severity: 'critical',
        description: 'Social Security Number detected',
      },

      // Email addresses (PII)
      {
        regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        type: 'pii',
        severity: 'medium',
        description: 'Email address detected',
      },

      // Phone numbers
      {
        regex: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        type: 'pii',
        severity: 'medium',
        description: 'Phone number detected',
      },

      // Suspicious URLs (data exfil endpoints)
      {
        regex: /https?:\/\/[a-zA-Z0-9.-]+\.(xyz|tk|ml|ga|cf|top)\/[^\s]*/g,
        type: 'url_exfil',
        severity: 'high',
        description: 'Suspicious TLD detected (common in exfil attacks)',
      },
    ];
  }

  /**
   * Load allowed domains from database
   */
  private async loadAllowedDomains() {
    try {
      const result = await this.db.query(`
        SELECT domain FROM allowed_domains WHERE active = true
      `);

      for (const row of result.rows) {
        this.allowedDomains.add(row.domain.toLowerCase());
      }

      logger.info({ count: this.allowedDomains.size }, 'Allowed domains loaded');
    } catch (err) {
      logger.warn({ err }, 'Failed to load allowed domains');
    }
  }

  /**
   * Scan output for data exfiltration attempts
   */
  async scan(
    output: string,
    context?: Record<string, any>
  ): Promise<ExfilScanResult> {
    logger.debug({ outputLength: output.length }, 'Scanning for exfil');

    const violations: ExfilViolation[] = [];

    // Check each pattern
    for (const pattern of this.patterns) {
      const matches = Array.from(output.matchAll(pattern.regex));

      for (const match of matches) {
        // Skip if in allowed context
        if (this.isAllowedContext(match[0], pattern.type, context)) {
          continue;
        }

        violations.push({
          type: pattern.type,
          severity: pattern.severity,
          pattern: pattern.regex.source,
          matched: this.redact(match[0], pattern.type),
          location: match.index || 0,
          description: pattern.description,
        });
      }
    }

    // Check for URL exfiltration
    const urlViolations = this.checkURLExfiltration(output);
    violations.push(...urlViolations);

    // Calculate risk score
    const riskScore = this.calculateRiskScore(violations);

    // Determine if safe
    const criticalViolations = violations.filter((v) => v.severity === 'critical');
    const safe = criticalViolations.length === 0 && riskScore < 0.5;

    // Sanitize if needed
    let sanitizedOutput: string | undefined;
    if (!safe && context?.autoSanitize) {
      sanitizedOutput = this.sanitize(output, violations);
    }

    const result: ExfilScanResult = {
      safe,
      violations,
      sanitizedOutput,
      riskScore,
    };

    // Log violation
    if (!safe) {
      await this.logViolation(result);
    }

    return result;
  }

  /**
   * Check for URL-based exfiltration
   */
  private checkURLExfiltration(output: string): ExfilViolation[] {
    const violations: ExfilViolation[] = [];

    // Extract all URLs
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = Array.from(output.matchAll(urlRegex));

    for (const urlMatch of urls) {
      const url = urlMatch[0];

      try {
        const parsed = new URL(url);

        // Check if domain is allowed
        if (this.allowedDomains.has(parsed.hostname.toLowerCase())) {
          continue;
        }

        // Check for data in URL (common exfil technique)
        if (parsed.searchParams.toString().length > 200) {
          violations.push({
            type: 'url_exfil',
            severity: 'high',
            pattern: 'long_url_params',
            matched: url.substring(0, 50) + '...',
            location: urlMatch.index || 0,
            description: 'URL with suspiciously long parameters (possible data exfil)',
          });
        }

        // Check for base64 encoded data in URL
        const base64Regex = /[A-Za-z0-9+/]{40,}={0,2}/;
        if (base64Regex.test(parsed.searchParams.toString())) {
          violations.push({
            type: 'url_exfil',
            severity: 'high',
            pattern: 'base64_in_url',
            matched: url.substring(0, 50) + '...',
            location: urlMatch.index || 0,
            description: 'URL with base64-encoded data (possible exfil)',
          });
        }
      } catch {
        // Invalid URL, skip
      }
    }

    return violations;
  }

  /**
   * Check if match is in allowed context
   */
  private isAllowedContext(
    matched: string,
    type: ExfilViolation['type'],
    context?: Record<string, any>
  ): boolean {
    // Check if explicitly allowed in context
    if (context?.allowedPatterns?.includes(matched)) {
      return true;
    }

    // For emails, check if domain is allowed
    if (type === 'pii' && matched.includes('@')) {
      const domain = matched.split('@')[1];
      if (this.allowedDomains.has(domain.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Redact sensitive value
   */
  private redact(value: string, type: ExfilViolation['type']): string {
    if (value.length <= 4) {
      return '***';
    }

    // Show first and last 2 characters
    return `${value.substring(0, 2)}...${value.substring(value.length - 2)}`;
  }

  /**
   * Sanitize output by removing/redacting violations
   */
  private sanitize(output: string, violations: ExfilViolation[]): string {
    let sanitized = output;

    // Sort by location (reverse) to avoid offset issues
    const sorted = [...violations].sort((a, b) => b.location - a.location);

    for (const violation of sorted) {
      if (violation.severity === 'critical' || violation.severity === 'high') {
        // Replace with redacted version
        const pattern = new RegExp(violation.pattern, 'g');
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      }
    }

    return sanitized;
  }

  /**
   * Calculate risk score
   */
  private calculateRiskScore(violations: ExfilViolation[]): number {
    if (violations.length === 0) return 0;

    const severityWeights = {
      critical: 1.0,
      high: 0.7,
      medium: 0.4,
      low: 0.2,
    };

    const totalWeight = violations.reduce(
      (sum, v) => sum + severityWeights[v.severity],
      0
    );

    // Normalize to 0-1
    return Math.min(1, totalWeight / 5);
  }

  /**
   * Log violation to database
   */
  private async logViolation(result: ExfilScanResult): Promise<void> {
    try {
      await this.db.query(
        `
        INSERT INTO exfil_violations (
          violation_count, violations, risk_score, timestamp
        ) VALUES ($1, $2, $3, NOW())
      `,
        [
          result.violations.length,
          JSON.stringify(result.violations),
          result.riskScore,
        ]
      );
    } catch (err) {
      logger.error({ err }, 'Failed to log violation');
    }
  }

  /**
   * Add domain to allowlist
   */
  async addAllowedDomain(domain: string): Promise<void> {
    await this.db.query(
      `INSERT INTO allowed_domains (domain, active) VALUES ($1, true)
       ON CONFLICT (domain) DO UPDATE SET active = true`,
      [domain.toLowerCase()]
    );

    this.allowedDomains.add(domain.toLowerCase());

    logger.info({ domain }, 'Added to allowed domains');
  }

  /**
   * Get violation statistics
   */
  async getStats(days: number = 7): Promise<{
    totalViolations: number;
    byType: Record<string, number>;
    avgRiskScore: number;
  }> {
    const result = await this.db.query(
      `
      SELECT
        COUNT(*) as total,
        AVG(risk_score) as avg_risk
      FROM exfil_violations
      WHERE timestamp > NOW() - INTERVAL '${days} days'
    `
    );

    const byTypeResult = await this.db.query(
      `
      SELECT
        violation->>'type' as type,
        COUNT(*) as count
      FROM exfil_violations,
        jsonb_array_elements(violations) as violation
      WHERE timestamp > NOW() - INTERVAL '${days} days'
      GROUP BY violation->>'type'
    `
    );

    const byType: Record<string, number> = {};
    for (const row of byTypeResult.rows) {
      byType[row.type] = parseInt(row.count);
    }

    return {
      totalViolations: parseInt(result.rows[0]?.total || '0'),
      byType,
      avgRiskScore: parseFloat(result.rows[0]?.avg_risk || '0'),
    };
  }
}

// ============================================================================
// Database Migration
// ============================================================================

export const EXFIL_GUARD_MIGRATION = `
-- Exfiltration violations log
CREATE TABLE IF NOT EXISTS exfil_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  violation_count INTEGER NOT NULL,
  violations JSONB NOT NULL,
  risk_score NUMERIC(3, 2) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_exfil_violations_timestamp ON exfil_violations(timestamp);
CREATE INDEX IF NOT EXISTS idx_exfil_violations_run ON exfil_violations(run_id);

COMMENT ON TABLE exfil_violations IS 'Log of detected data exfiltration attempts';

-- Allowed domains (for PII/URLs)
CREATE TABLE IF NOT EXISTS allowed_domains (
  domain VARCHAR(255) PRIMARY KEY,
  active BOOLEAN DEFAULT true,
  added_at TIMESTAMP NOT NULL DEFAULT NOW(),
  added_by VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_allowed_domains_active ON allowed_domains(active);

COMMENT ON TABLE allowed_domains IS 'Allowed domains for exfil guard (PII emails, URLs)';
`;
