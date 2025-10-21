/**
 * Terms Scanner Guard
 *
 * Roadmap: M7 - Compliance Modes
 *
 * Guard: guard.termsScan
 *
 * Detects conflicts with Terms of Service, Acceptable Use Policies,
 * and regulatory compliance requirements.
 *
 * Acceptance:
 * - Prohibited use cases blocked (weapons, CSAM, fraud)
 * - ToS violations flagged before deployment
 * - Compliance report for SOC2/GDPR/HIPAA
 */

import pino from 'pino';
import { Pool } from 'pg';
import { EventEmitter } from 'events';

const logger = pino({ name: 'terms-scanner' });

// ============================================================================
// Types
// ============================================================================

export interface TermsScanResult {
  compliant: boolean;
  violations: TermsViolation[];
  warnings: TermsWarning[];
  riskScore: number;
  recommendations: string[];
}

export interface TermsViolation {
  type: ViolationType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: ViolationCategory;
  description: string;
  evidence: string[];
  regulation?: string;
  remediation: string;
}

export interface TermsWarning {
  type: ViolationType;
  category: ViolationCategory;
  description: string;
  recommendation: string;
}

export type ViolationType =
  | 'prohibited_use'
  | 'content_policy'
  | 'data_usage'
  | 'service_limits'
  | 'geographic_restriction'
  | 'age_restriction'
  | 'export_control'
  | 'regulatory'
  | 'privacy'
  | 'security';

export type ViolationCategory =
  | 'harmful_content'
  | 'illegal_activity'
  | 'privacy_violation'
  | 'security_risk'
  | 'data_misuse'
  | 'service_abuse'
  | 'regulatory_noncompliance';

export interface ProhibitedUseCase {
  name: string;
  patterns: RegExp[];
  severity: 'critical' | 'high';
  category: ViolationCategory;
  description: string;
}

export interface ComplianceFramework {
  name: 'SOC2' | 'GDPR' | 'HIPAA' | 'CCPA' | 'PCI-DSS' | 'ISO27001' | 'NIST';
  requirements: ComplianceRequirement[];
}

export interface ComplianceRequirement {
  id: string;
  title: string;
  description: string;
  checkFunction: (context: any) => boolean;
  remediation: string;
}

// ============================================================================
// Prohibited Use Cases Database
// ============================================================================

const PROHIBITED_USE_CASES: ProhibitedUseCase[] = [
  {
    name: 'Child Safety (CSAM)',
    patterns: [
      /child\s+(porn|abuse|exploitation)/i,
      /CSAM/i,
      /underage\s+(sex|nude)/i,
      /minor\s+(sex|exploitation)/i,
    ],
    severity: 'critical',
    category: 'harmful_content',
    description: 'Child sexual abuse material is strictly prohibited',
  },
  {
    name: 'Weapons & Violence',
    patterns: [
      /build\s+(bomb|explosive|weapon)/i,
      /create\s+(biological|chemical)\s+weapon/i,
      /3d\s+print\s+(gun|weapon)/i,
      /assemble\s+(explosive|IED)/i,
    ],
    severity: 'critical',
    category: 'harmful_content',
    description: 'Instructions for creating weapons or explosives',
  },
  {
    name: 'Fraud & Financial Crime',
    patterns: [
      /credit\s+card\s+(fraud|generator|hack)/i,
      /fake\s+(id|passport|document)/i,
      /money\s+laundering/i,
      /counterfeit\s+(money|currency)/i,
      /ponzi\s+scheme/i,
      /pump\s+and\s+dump/i,
    ],
    severity: 'critical',
    category: 'illegal_activity',
    description: 'Fraud, scams, and financial crimes',
  },
  {
    name: 'Hacking & Unauthorized Access',
    patterns: [
      /hack\s+(into|password|account)/i,
      /brute\s+force\s+(attack|password)/i,
      /sql\s+injection\s+attack/i,
      /unauthorized\s+access/i,
      /bypass\s+(authentication|security)/i,
      /crack\s+(password|encryption)/i,
    ],
    severity: 'high',
    category: 'illegal_activity',
    description: 'Hacking, unauthorized access, and security bypasses',
  },
  {
    name: 'Hate Speech & Harassment',
    patterns: [
      /hate\s+speech/i,
      /racial\s+slur/i,
      /dox(x)?ing/i,
      /swat(t)?ing/i,
      /harass(ment)?/i,
    ],
    severity: 'high',
    category: 'harmful_content',
    description: 'Hate speech, harassment, and targeted attacks',
  },
  {
    name: 'PII Collection Without Consent',
    patterns: [
      /collect\s+(ssn|social\s+security)/i,
      /scrape\s+(email|phone|address)/i,
      /harvest\s+(credentials|passwords)/i,
      /bulk\s+(email|contact)\s+collection/i,
    ],
    severity: 'high',
    category: 'privacy_violation',
    description: 'Unauthorized collection of personal information',
  },
  {
    name: 'Misinformation & Deepfakes',
    patterns: [
      /deep\s?fake/i,
      /fake\s+news\s+generator/i,
      /misinformation\s+campaign/i,
      /impersonate\s+(person|celebrity)/i,
    ],
    severity: 'high',
    category: 'harmful_content',
    description: 'Creation of deepfakes or misinformation',
  },
  {
    name: 'Spam & Abuse',
    patterns: [
      /spam\s+(bot|generator|tool)/i,
      /mass\s+(email|sms)\s+sender/i,
      /email\s+bomber/i,
      /ddos\s+(attack|tool)/i,
    ],
    severity: 'high',
    category: 'service_abuse',
    description: 'Spam, mass messaging, and service abuse',
  },
  {
    name: 'Malware & Viruses',
    patterns: [
      /create\s+(virus|malware|trojan)/i,
      /ransomware/i,
      /keylogger/i,
      /rootkit/i,
      /backdoor/i,
    ],
    severity: 'critical',
    category: 'security_risk',
    description: 'Malware, viruses, and malicious software',
  },
  {
    name: 'Export Control Violations',
    patterns: [
      /export\s+(encryption|technology)\s+to\s+(iran|north\s+korea|cuba)/i,
      /ITAR\s+violation/i,
      /sanctions\s+(evasion|bypass)/i,
    ],
    severity: 'critical',
    category: 'regulatory_noncompliance',
    description: 'Export control and sanctions violations',
  },
];

// ============================================================================
// Terms Scanner
// ============================================================================

export class TermsScannerGuard extends EventEmitter {
  private frameworks: Map<string, ComplianceFramework> = new Map();

  constructor(private db: Pool) {
    super();
    this.initializeComplianceFrameworks();
  }

  /**
   * Initialize compliance frameworks
   */
  private initializeComplianceFrameworks() {
    // GDPR
    this.frameworks.set('GDPR', {
      name: 'GDPR',
      requirements: [
        {
          id: 'gdpr-consent',
          title: 'Lawful Basis for Processing',
          description: 'Data processing requires valid legal basis (consent, contract, etc.)',
          checkFunction: (ctx) => ctx.hasConsent === true || ctx.legalBasis !== undefined,
          remediation: 'Implement consent mechanism or establish legal basis',
        },
        {
          id: 'gdpr-purpose',
          title: 'Purpose Limitation',
          description: 'Data collected for specific, explicit, legitimate purposes',
          checkFunction: (ctx) => ctx.dataPurpose !== undefined && ctx.dataPurpose.length > 0,
          remediation: 'Document data collection purpose and use',
        },
        {
          id: 'gdpr-retention',
          title: 'Data Retention Limits',
          description: 'Data retained no longer than necessary',
          checkFunction: (ctx) => ctx.retentionPolicy !== undefined,
          remediation: 'Implement data retention and deletion policies',
        },
        {
          id: 'gdpr-security',
          title: 'Security of Processing',
          description: 'Appropriate technical and organizational measures',
          checkFunction: (ctx) => ctx.encryption === true && ctx.accessControl === true,
          remediation: 'Implement encryption and access controls',
        },
        {
          id: 'gdpr-dpo',
          title: 'Data Protection Officer',
          description: 'DPO required for large-scale processing',
          checkFunction: (ctx) => ctx.dpoAssigned === true || ctx.processingScale !== 'large',
          remediation: 'Appoint Data Protection Officer',
        },
      ],
    });

    // SOC 2
    this.frameworks.set('SOC2', {
      name: 'SOC2',
      requirements: [
        {
          id: 'soc2-security',
          title: 'Security Controls',
          description: 'Firewall, encryption, access controls',
          checkFunction: (ctx) => ctx.firewall && ctx.encryption && ctx.mfa,
          remediation: 'Implement security controls (firewall, encryption, MFA)',
        },
        {
          id: 'soc2-availability',
          title: 'System Availability',
          description: 'Monitoring, backups, disaster recovery',
          checkFunction: (ctx) => ctx.monitoring && ctx.backups && ctx.dr,
          remediation: 'Implement monitoring, backup, and DR plans',
        },
        {
          id: 'soc2-confidentiality',
          title: 'Confidentiality',
          description: 'Protect confidential information',
          checkFunction: (ctx) => ctx.encryption && ctx.accessControl,
          remediation: 'Implement encryption and access controls',
        },
        {
          id: 'soc2-audit',
          title: 'Audit Logging',
          description: 'Comprehensive audit trail',
          checkFunction: (ctx) => ctx.auditLogging === true,
          remediation: 'Enable audit logging for all critical operations',
        },
      ],
    });

    // HIPAA
    this.frameworks.set('HIPAA', {
      name: 'HIPAA',
      requirements: [
        {
          id: 'hipaa-phi',
          title: 'PHI Protection',
          description: 'Protected Health Information must be secured',
          checkFunction: (ctx) => ctx.phiEncryption === true && ctx.phiAccessControl === true,
          remediation: 'Encrypt and control access to PHI',
        },
        {
          id: 'hipaa-baa',
          title: 'Business Associate Agreement',
          description: 'BAA required for third-party processors',
          checkFunction: (ctx) => ctx.baaInPlace === true || ctx.thirdPartyProcessors === 0,
          remediation: 'Execute Business Associate Agreements',
        },
        {
          id: 'hipaa-audit',
          title: 'Audit Controls',
          description: 'Record and examine PHI access',
          checkFunction: (ctx) => ctx.phiAuditLog === true,
          remediation: 'Implement PHI access logging',
        },
        {
          id: 'hipaa-breach',
          title: 'Breach Notification',
          description: 'Notify affected individuals within 60 days',
          checkFunction: (ctx) => ctx.breachNotificationPlan === true,
          remediation: 'Create breach notification procedure',
        },
      ],
    });
  }

  /**
   * Scan for terms violations
   */
  async scan(content: string, context?: any): Promise<TermsScanResult> {
    logger.info('Scanning for ToS violations');

    const violations: TermsViolation[] = [];
    const warnings: TermsWarning[] = [];

    // Check prohibited use cases
    for (const useCase of PROHIBITED_USE_CASES) {
      for (const pattern of useCase.patterns) {
        const matches = content.match(pattern);
        if (matches) {
          violations.push({
            type: 'prohibited_use',
            severity: useCase.severity,
            category: useCase.category,
            description: useCase.description,
            evidence: matches.slice(0, 3), // First 3 matches
            remediation: `Remove ${useCase.name} content`,
          });
        }
      }
    }

    // Check content policy
    const contentViolations = this.checkContentPolicy(content);
    violations.push(...contentViolations);

    // Check data usage
    const dataViolations = this.checkDataUsage(content);
    violations.push(...dataViolations);

    // Check service limits
    const limitWarnings = this.checkServiceLimits(content, context);
    warnings.push(...limitWarnings);

    // Check privacy
    const privacyViolations = this.checkPrivacy(content);
    violations.push(...privacyViolations);

    // Calculate risk score
    const riskScore = this.calculateRiskScore(violations);

    // Generate recommendations
    const recommendations = this.generateRecommendations(violations, warnings);

    const result: TermsScanResult = {
      compliant: violations.length === 0,
      violations,
      warnings,
      riskScore,
      recommendations,
    };

    // Store in database
    await this.storeScanResult(result, content);

    // Emit event
    this.emit('scan-complete', result);

    if (!result.compliant) {
      this.emit('violations-detected', violations);
    }

    return result;
  }

  /**
   * Check compliance against framework
   */
  async checkCompliance(
    frameworkName: 'SOC2' | 'GDPR' | 'HIPAA',
    context: any
  ): Promise<{
    compliant: boolean;
    framework: string;
    passed: string[];
    failed: string[];
    recommendations: string[];
  }> {
    const framework = this.frameworks.get(frameworkName);
    if (!framework) {
      throw new Error(`Unknown framework: ${frameworkName}`);
    }

    const passed: string[] = [];
    const failed: string[] = [];
    const recommendations: string[] = [];

    for (const req of framework.requirements) {
      const check = req.checkFunction(context);
      if (check) {
        passed.push(req.title);
      } else {
        failed.push(req.title);
        recommendations.push(`${req.id}: ${req.remediation}`);
      }
    }

    const result = {
      compliant: failed.length === 0,
      framework: frameworkName,
      passed,
      failed,
      recommendations,
    };

    // Store in database
    await this.storeComplianceCheck(frameworkName, result, context);

    logger.info({ framework: frameworkName, compliant: result.compliant }, 'Compliance check complete');

    return result;
  }

  /**
   * Check content policy
   */
  private checkContentPolicy(content: string): TermsViolation[] {
    const violations: TermsViolation[] = [];

    // Profanity/offensive language (simplified)
    const profanityPatterns = [
      /f[u*]ck/i,
      /sh[i*]t/i,
      /b[i*]tch/i,
      /offensive\s+language/i,
    ];

    for (const pattern of profanityPatterns) {
      if (pattern.test(content)) {
        violations.push({
          type: 'content_policy',
          severity: 'low',
          category: 'harmful_content',
          description: 'Potentially offensive language detected',
          evidence: [],
          remediation: 'Review and sanitize content',
        });
        break;
      }
    }

    // Personally identifiable information (PII)
    const piiPatterns = [
      { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, type: 'SSN' },
      { pattern: /\b(?:\d[ -]*?){13,19}\b/g, type: 'Credit Card' },
      { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, type: 'Email' },
      { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, type: 'Phone' },
    ];

    for (const pii of piiPatterns) {
      const matches = content.match(pii.pattern);
      if (matches && matches.length > 5) {
        violations.push({
          type: 'privacy',
          severity: 'high',
          category: 'privacy_violation',
          description: `Multiple ${pii.type} instances detected`,
          evidence: matches.slice(0, 3),
          remediation: 'Redact or encrypt PII',
        });
      }
    }

    return violations;
  }

  /**
   * Check data usage
   */
  private checkDataUsage(content: string): TermsViolation[] {
    const violations: TermsViolation[] = [];

    // Bulk data scraping
    const scrapingPatterns = [
      /scrape\s+(all|bulk|mass)/i,
      /crawl\s+(entire|all)/i,
      /download\s+entire\s+database/i,
    ];

    for (const pattern of scrapingPatterns) {
      if (pattern.test(content)) {
        violations.push({
          type: 'data_usage',
          severity: 'high',
          category: 'data_misuse',
          description: 'Bulk data scraping detected',
          evidence: [content.match(pattern)?.[0] || ''],
          remediation: 'Use API with rate limits instead',
        });
      }
    }

    return violations;
  }

  /**
   * Check service limits
   */
  private checkServiceLimits(content: string, context?: any): TermsWarning[] {
    const warnings: TermsWarning[] = [];

    // Rate limiting
    if (content.includes('infinite loop') || content.includes('while(true)')) {
      warnings.push({
        type: 'service_limits',
        category: 'service_abuse',
        description: 'Potential infinite loop detected',
        recommendation: 'Add timeout or iteration limits',
      });
    }

    // Large requests
    if (context?.requestSize && context.requestSize > 10 * 1024 * 1024) {
      warnings.push({
        type: 'service_limits',
        category: 'service_abuse',
        description: 'Request size exceeds 10MB',
        recommendation: 'Split into smaller requests',
      });
    }

    return warnings;
  }

  /**
   * Check privacy compliance
   */
  private checkPrivacy(content: string): TermsViolation[] {
    const violations: TermsViolation[] = [];

    // Tracking without consent
    const trackingPatterns = [
      /track\s+user\s+without\s+consent/i,
      /collect\s+(data|information)\s+without\s+(consent|permission)/i,
      /third[\s-]party\s+tracking/i,
    ];

    for (const pattern of trackingPatterns) {
      if (pattern.test(content)) {
        violations.push({
          type: 'privacy',
          severity: 'high',
          category: 'privacy_violation',
          description: 'Data collection without consent',
          evidence: [content.match(pattern)?.[0] || ''],
          regulation: 'GDPR Article 6',
          remediation: 'Implement consent mechanism',
        });
      }
    }

    return violations;
  }

  /**
   * Calculate risk score
   */
  private calculateRiskScore(violations: TermsViolation[]): number {
    let score = 0;

    for (const violation of violations) {
      switch (violation.severity) {
        case 'critical':
          score += 25;
          break;
        case 'high':
          score += 15;
          break;
        case 'medium':
          score += 5;
          break;
        case 'low':
          score += 1;
          break;
      }
    }

    return Math.min(100, score);
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    violations: TermsViolation[],
    warnings: TermsWarning[]
  ): string[] {
    const recommendations: string[] = [];

    const criticalCount = violations.filter((v) => v.severity === 'critical').length;
    const highCount = violations.filter((v) => v.severity === 'high').length;

    if (criticalCount > 0) {
      recommendations.push(`CRITICAL: ${criticalCount} prohibited use cases detected - MUST be removed`);
    }

    if (highCount > 0) {
      recommendations.push(`WARNING: ${highCount} high-severity violations require immediate attention`);
    }

    // Group by category
    const byCategory = new Map<ViolationCategory, TermsViolation[]>();
    for (const violation of violations) {
      if (!byCategory.has(violation.category)) {
        byCategory.set(violation.category, []);
      }
      byCategory.get(violation.category)!.push(violation);
    }

    for (const [category, viols] of byCategory) {
      recommendations.push(`${category}: ${viols.length} violations - ${viols[0].remediation}`);
    }

    if (warnings.length > 0) {
      recommendations.push(`Review ${warnings.length} warnings for potential issues`);
    }

    if (violations.length === 0) {
      recommendations.push('Content complies with terms of service');
    }

    return recommendations;
  }

  /**
   * Store scan result
   */
  private async storeScanResult(result: TermsScanResult, content: string): Promise<void> {
    try {
      await this.db.query(
        `
        INSERT INTO terms_scans (
          compliant,
          violations_count,
          warnings_count,
          risk_score,
          violations,
          warnings,
          recommendations,
          content_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
        [
          result.compliant,
          result.violations.length,
          result.warnings.length,
          result.riskScore,
          JSON.stringify(result.violations),
          JSON.stringify(result.warnings),
          JSON.stringify(result.recommendations),
          crypto.createHash('sha256').update(content).digest('hex'),
        ]
      );

      logger.info({ compliant: result.compliant, violations: result.violations.length }, 'Scan result stored');
    } catch (err) {
      logger.error({ err }, 'Failed to store scan result');
    }
  }

  /**
   * Store compliance check
   */
  private async storeComplianceCheck(
    framework: string,
    result: any,
    context: any
  ): Promise<void> {
    try {
      await this.db.query(
        `
        INSERT INTO compliance_checks (
          framework,
          compliant,
          passed,
          failed,
          recommendations,
          context
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [
          framework,
          result.compliant,
          JSON.stringify(result.passed),
          JSON.stringify(result.failed),
          JSON.stringify(result.recommendations),
          JSON.stringify(context),
        ]
      );

      logger.info({ framework, compliant: result.compliant }, 'Compliance check stored');
    } catch (err) {
      logger.error({ err }, 'Failed to store compliance check');
    }
  }
}

// ============================================================================
// Database Migration
// ============================================================================

export const TERMS_SCANNER_MIGRATION = `
-- Terms scans table
CREATE TABLE IF NOT EXISTS terms_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  compliant BOOLEAN NOT NULL,
  violations_count INTEGER NOT NULL,
  warnings_count INTEGER NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL,
  violations JSONB NOT NULL,
  warnings JSONB NOT NULL,
  recommendations JSONB NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_terms_scans_compliant ON terms_scans(compliant);
CREATE INDEX IF NOT EXISTS idx_terms_scans_risk ON terms_scans(risk_score);
CREATE INDEX IF NOT EXISTS idx_terms_scans_timestamp ON terms_scans(created_at);

COMMENT ON TABLE terms_scans IS 'Terms of Service violation scans';

-- Compliance checks table
CREATE TABLE IF NOT EXISTS compliance_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework VARCHAR(50) NOT NULL,
  compliant BOOLEAN NOT NULL,
  passed JSONB NOT NULL,
  failed JSONB NOT NULL,
  recommendations JSONB NOT NULL,
  context JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_framework ON compliance_checks(framework);
CREATE INDEX IF NOT EXISTS idx_compliance_compliant ON compliance_checks(compliant);
CREATE INDEX IF NOT EXISTS idx_compliance_timestamp ON compliance_checks(created_at);

COMMENT ON TABLE compliance_checks IS 'Compliance framework checks (SOC2, GDPR, HIPAA)';
`;
