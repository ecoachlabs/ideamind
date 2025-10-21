/**
 * License Scanner Guard
 *
 * Roadmap: M7 - Compliance Modes
 *
 * Guard: guard.license
 *
 * Detects license conflicts and incompatibilities in dependencies and generated code.
 *
 * Acceptance:
 * - GPL detected in proprietary project → blocked
 * - Compliance report generated with all licenses
 * - License compatibility matrix enforced
 */

import pino from 'pino';
import { Pool } from 'pg';
import { EventEmitter } from 'events';

const logger = pino({ name: 'license-guard' });

// ============================================================================
// Types
// ============================================================================

export interface LicenseInfo {
  name: string;
  spdxId: string;
  category: 'permissive' | 'weak_copyleft' | 'strong_copyleft' | 'proprietary' | 'public_domain' | 'unknown';
  allowCommercialUse: boolean;
  requiresAttribution: boolean;
  requiresSourceDisclosure: boolean;
  allowModification: boolean;
  allowDistribution: boolean;
  compatibleWith: string[];
  incompatibleWith: string[];
}

export interface Dependency {
  name: string;
  version: string;
  license: string;
  source: 'npm' | 'pypi' | 'maven' | 'cargo' | 'gem' | 'manual';
  path?: string;
}

export interface LicenseScanResult {
  compliant: boolean;
  violations: LicenseViolation[];
  dependencies: DependencyLicense[];
  projectLicense?: string;
  riskScore: number;
  recommendations: string[];
}

export interface LicenseViolation {
  type: 'incompatible' | 'missing' | 'ambiguous' | 'restrictive';
  severity: 'critical' | 'high' | 'medium' | 'low';
  dependency: string;
  license: string;
  reason: string;
  recommendation: string;
}

export interface DependencyLicense {
  dependency: string;
  version: string;
  license: string;
  category: LicenseInfo['category'];
  compatible: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface CompliancePolicy {
  projectLicense: string;
  allowedCategories: LicenseInfo['category'][];
  blockedLicenses: string[];
  requireAttribution: boolean;
  allowCopyleft: boolean;
  commercialUse: boolean;
}

// ============================================================================
// License Database
// ============================================================================

const LICENSE_DATABASE: Map<string, LicenseInfo> = new Map([
  // Permissive licenses
  [
    'MIT',
    {
      name: 'MIT License',
      spdxId: 'MIT',
      category: 'permissive',
      allowCommercialUse: true,
      requiresAttribution: true,
      requiresSourceDisclosure: false,
      allowModification: true,
      allowDistribution: true,
      compatibleWith: ['MIT', 'BSD', 'Apache-2.0', 'LGPL', 'GPL', 'AGPL', 'proprietary'],
      incompatibleWith: [],
    },
  ],
  [
    'Apache-2.0',
    {
      name: 'Apache License 2.0',
      spdxId: 'Apache-2.0',
      category: 'permissive',
      allowCommercialUse: true,
      requiresAttribution: true,
      requiresSourceDisclosure: false,
      allowModification: true,
      allowDistribution: true,
      compatibleWith: ['MIT', 'BSD', 'Apache-2.0', 'LGPL-3.0', 'GPL-3.0', 'AGPL-3.0', 'proprietary'],
      incompatibleWith: ['GPL-2.0', 'LGPL-2.0', 'LGPL-2.1'],
    },
  ],
  [
    'BSD-3-Clause',
    {
      name: 'BSD 3-Clause License',
      spdxId: 'BSD-3-Clause',
      category: 'permissive',
      allowCommercialUse: true,
      requiresAttribution: true,
      requiresSourceDisclosure: false,
      allowModification: true,
      allowDistribution: true,
      compatibleWith: ['MIT', 'BSD', 'Apache-2.0', 'LGPL', 'GPL', 'AGPL', 'proprietary'],
      incompatibleWith: [],
    },
  ],
  [
    'ISC',
    {
      name: 'ISC License',
      spdxId: 'ISC',
      category: 'permissive',
      allowCommercialUse: true,
      requiresAttribution: true,
      requiresSourceDisclosure: false,
      allowModification: true,
      allowDistribution: true,
      compatibleWith: ['MIT', 'BSD', 'Apache-2.0', 'LGPL', 'GPL', 'AGPL', 'proprietary'],
      incompatibleWith: [],
    },
  ],

  // Weak copyleft
  [
    'LGPL-3.0',
    {
      name: 'GNU Lesser General Public License v3.0',
      spdxId: 'LGPL-3.0',
      category: 'weak_copyleft',
      allowCommercialUse: true,
      requiresAttribution: true,
      requiresSourceDisclosure: true,
      allowModification: true,
      allowDistribution: true,
      compatibleWith: ['MIT', 'BSD', 'Apache-2.0', 'LGPL-3.0', 'GPL-3.0', 'AGPL-3.0'],
      incompatibleWith: ['proprietary'],
    },
  ],
  [
    'MPL-2.0',
    {
      name: 'Mozilla Public License 2.0',
      spdxId: 'MPL-2.0',
      category: 'weak_copyleft',
      allowCommercialUse: true,
      requiresAttribution: true,
      requiresSourceDisclosure: true,
      allowModification: true,
      allowDistribution: true,
      compatibleWith: ['MIT', 'BSD', 'Apache-2.0', 'MPL-2.0', 'GPL-3.0', 'AGPL-3.0'],
      incompatibleWith: ['GPL-2.0', 'proprietary'],
    },
  ],

  // Strong copyleft
  [
    'GPL-3.0',
    {
      name: 'GNU General Public License v3.0',
      spdxId: 'GPL-3.0',
      category: 'strong_copyleft',
      allowCommercialUse: true,
      requiresAttribution: true,
      requiresSourceDisclosure: true,
      allowModification: true,
      allowDistribution: true,
      compatibleWith: ['MIT', 'BSD', 'Apache-2.0', 'LGPL-3.0', 'GPL-3.0', 'AGPL-3.0'],
      incompatibleWith: ['proprietary', 'GPL-2.0'],
    },
  ],
  [
    'AGPL-3.0',
    {
      name: 'GNU Affero General Public License v3.0',
      spdxId: 'AGPL-3.0',
      category: 'strong_copyleft',
      allowCommercialUse: true,
      requiresAttribution: true,
      requiresSourceDisclosure: true,
      allowModification: true,
      allowDistribution: true,
      compatibleWith: ['MIT', 'BSD', 'Apache-2.0', 'LGPL-3.0', 'GPL-3.0', 'AGPL-3.0'],
      incompatibleWith: ['proprietary', 'GPL-2.0'],
    },
  ],
  [
    'GPL-2.0',
    {
      name: 'GNU General Public License v2.0',
      spdxId: 'GPL-2.0',
      category: 'strong_copyleft',
      allowCommercialUse: true,
      requiresAttribution: true,
      requiresSourceDisclosure: true,
      allowModification: true,
      allowDistribution: true,
      compatibleWith: ['MIT', 'BSD', 'LGPL-2.0', 'LGPL-2.1', 'GPL-2.0'],
      incompatibleWith: ['Apache-2.0', 'GPL-3.0', 'AGPL-3.0', 'proprietary'],
    },
  ],

  // Public domain
  [
    'Unlicense',
    {
      name: 'The Unlicense',
      spdxId: 'Unlicense',
      category: 'public_domain',
      allowCommercialUse: true,
      requiresAttribution: false,
      requiresSourceDisclosure: false,
      allowModification: true,
      allowDistribution: true,
      compatibleWith: ['MIT', 'BSD', 'Apache-2.0', 'LGPL', 'GPL', 'AGPL', 'proprietary'],
      incompatibleWith: [],
    },
  ],
  [
    'CC0-1.0',
    {
      name: 'Creative Commons Zero v1.0',
      spdxId: 'CC0-1.0',
      category: 'public_domain',
      allowCommercialUse: true,
      requiresAttribution: false,
      requiresSourceDisclosure: false,
      allowModification: true,
      allowDistribution: true,
      compatibleWith: ['MIT', 'BSD', 'Apache-2.0', 'LGPL', 'GPL', 'AGPL', 'proprietary'],
      incompatibleWith: [],
    },
  ],
]);

// ============================================================================
// License Guard
// ============================================================================

export class LicenseGuard extends EventEmitter {
  private policies: Map<string, CompliancePolicy> = new Map();

  constructor(private db: Pool) {
    super();
    this.initializeDefaultPolicies();
  }

  /**
   * Initialize default compliance policies
   */
  private initializeDefaultPolicies() {
    // Proprietary/Commercial policy
    this.policies.set('proprietary', {
      projectLicense: 'proprietary',
      allowedCategories: ['permissive', 'public_domain'],
      blockedLicenses: ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-3.0'],
      requireAttribution: true,
      allowCopyleft: false,
      commercialUse: true,
    });

    // Open source permissive policy
    this.policies.set('open-source-permissive', {
      projectLicense: 'MIT',
      allowedCategories: ['permissive', 'weak_copyleft', 'public_domain'],
      blockedLicenses: ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0'],
      requireAttribution: true,
      allowCopyleft: false,
      commercialUse: true,
    });

    // Open source copyleft policy
    this.policies.set('open-source-copyleft', {
      projectLicense: 'GPL-3.0',
      allowedCategories: ['permissive', 'weak_copyleft', 'strong_copyleft', 'public_domain'],
      blockedLicenses: ['proprietary'],
      requireAttribution: true,
      allowCopyleft: true,
      commercialUse: true,
    });
  }

  /**
   * Scan dependencies for license compliance
   */
  async scan(
    dependencies: Dependency[],
    policyName: string = 'proprietary'
  ): Promise<LicenseScanResult> {
    logger.info({ count: dependencies.length, policy: policyName }, 'Scanning licenses');

    const policy = this.policies.get(policyName);
    if (!policy) {
      throw new Error(`Unknown policy: ${policyName}`);
    }

    const violations: LicenseViolation[] = [];
    const dependencyLicenses: DependencyLicense[] = [];
    let riskScore = 0;

    for (const dep of dependencies) {
      const licenseInfo = this.getLicenseInfo(dep.license);
      const compatible = this.checkCompatibility(licenseInfo, policy);
      const riskLevel = this.assessRisk(licenseInfo, policy);

      dependencyLicenses.push({
        dependency: dep.name,
        version: dep.version,
        license: dep.license,
        category: licenseInfo.category,
        compatible,
        riskLevel,
      });

      // Check for violations
      if (!compatible) {
        violations.push({
          type: 'incompatible',
          severity: this.getSeverity(licenseInfo, policy),
          dependency: dep.name,
          license: dep.license,
          reason: this.getIncompatibilityReason(licenseInfo, policy),
          recommendation: this.getRecommendation(dep, licenseInfo, policy),
        });
      }

      // Missing license
      if (dep.license === 'UNKNOWN' || !dep.license) {
        violations.push({
          type: 'missing',
          severity: 'high',
          dependency: dep.name,
          license: 'UNKNOWN',
          reason: 'No license information found',
          recommendation: 'Contact package maintainer or find alternative',
        });
      }

      // Calculate risk
      riskScore += this.getRiskPoints(riskLevel);
    }

    // Normalize risk score
    const normalizedRisk = Math.min(100, (riskScore / dependencies.length) * 25);

    const result: LicenseScanResult = {
      compliant: violations.length === 0,
      violations,
      dependencies: dependencyLicenses,
      projectLicense: policy.projectLicense,
      riskScore: normalizedRisk,
      recommendations: this.generateRecommendations(violations, policy),
    };

    // Store in database
    await this.storeScanResult(result, policyName, dependencies);

    // Emit event
    this.emit('scan-complete', result);

    if (!result.compliant) {
      this.emit('violations-detected', violations);
    }

    return result;
  }

  /**
   * Get license information
   */
  private getLicenseInfo(licenseName: string): LicenseInfo {
    // Normalize license name
    const normalized = this.normalizeLicenseName(licenseName);

    const info = LICENSE_DATABASE.get(normalized);
    if (info) {
      return info;
    }

    // Unknown license - treat as unknown category
    return {
      name: licenseName,
      spdxId: licenseName,
      category: 'unknown',
      allowCommercialUse: false,
      requiresAttribution: true,
      requiresSourceDisclosure: false,
      allowModification: false,
      allowDistribution: false,
      compatibleWith: [],
      incompatibleWith: [],
    };
  }

  /**
   * Normalize license name to SPDX ID
   */
  private normalizeLicenseName(name: string): string {
    if (!name) return 'UNKNOWN';

    const normalized = name.toUpperCase().trim();

    // Common mappings
    const mappings: Record<string, string> = {
      'MIT': 'MIT',
      'APACHE': 'Apache-2.0',
      'APACHE-2.0': 'Apache-2.0',
      'APACHE 2.0': 'Apache-2.0',
      'BSD': 'BSD-3-Clause',
      'BSD-3': 'BSD-3-Clause',
      'ISC': 'ISC',
      'GPL': 'GPL-3.0',
      'GPL-3': 'GPL-3.0',
      'GPL-2': 'GPL-2.0',
      'LGPL': 'LGPL-3.0',
      'LGPL-3': 'LGPL-3.0',
      'AGPL': 'AGPL-3.0',
      'AGPL-3': 'AGPL-3.0',
      'MPL': 'MPL-2.0',
      'MPL-2': 'MPL-2.0',
      'UNLICENSE': 'Unlicense',
      'CC0': 'CC0-1.0',
    };

    return mappings[normalized] || name;
  }

  /**
   * Check license compatibility with policy
   */
  private checkCompatibility(license: LicenseInfo, policy: CompliancePolicy): boolean {
    // Check if category is allowed
    if (!policy.allowedCategories.includes(license.category)) {
      return false;
    }

    // Check if license is explicitly blocked
    if (policy.blockedLicenses.includes(license.spdxId)) {
      return false;
    }

    // Check commercial use
    if (policy.commercialUse && !license.allowCommercialUse) {
      return false;
    }

    // Check copyleft
    if (
      !policy.allowCopyleft &&
      (license.category === 'strong_copyleft' || license.category === 'weak_copyleft')
    ) {
      return false;
    }

    return true;
  }

  /**
   * Assess risk level
   */
  private assessRisk(
    license: LicenseInfo,
    policy: CompliancePolicy
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Unknown license - critical risk
    if (license.category === 'unknown') {
      return 'critical';
    }

    // Strong copyleft in proprietary project - critical
    if (
      policy.projectLicense === 'proprietary' &&
      license.category === 'strong_copyleft'
    ) {
      return 'critical';
    }

    // Weak copyleft in proprietary project - high
    if (
      policy.projectLicense === 'proprietary' &&
      license.category === 'weak_copyleft'
    ) {
      return 'high';
    }

    // GPL-2.0 with Apache-2.0 - high (incompatible)
    if (
      (policy.projectLicense === 'Apache-2.0' && license.spdxId === 'GPL-2.0') ||
      (policy.projectLicense === 'GPL-2.0' && license.spdxId === 'Apache-2.0')
    ) {
      return 'high';
    }

    // Permissive licenses - low risk
    if (license.category === 'permissive' || license.category === 'public_domain') {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Get violation severity
   */
  private getSeverity(
    license: LicenseInfo,
    policy: CompliancePolicy
  ): 'critical' | 'high' | 'medium' | 'low' {
    const risk = this.assessRisk(license, policy);
    return risk as 'critical' | 'high' | 'medium' | 'low';
  }

  /**
   * Get incompatibility reason
   */
  private getIncompatibilityReason(license: LicenseInfo, policy: CompliancePolicy): string {
    if (policy.blockedLicenses.includes(license.spdxId)) {
      return `${license.name} is explicitly blocked by policy`;
    }

    if (!policy.allowedCategories.includes(license.category)) {
      return `License category '${license.category}' not allowed by policy`;
    }

    if (policy.commercialUse && !license.allowCommercialUse) {
      return `License does not allow commercial use`;
    }

    if (
      !policy.allowCopyleft &&
      (license.category === 'strong_copyleft' || license.category === 'weak_copyleft')
    ) {
      return `Copyleft license incompatible with ${policy.projectLicense}`;
    }

    return 'License incompatible with project policy';
  }

  /**
   * Get recommendation
   */
  private getRecommendation(
    dep: Dependency,
    license: LicenseInfo,
    policy: CompliancePolicy
  ): string {
    if (license.category === 'unknown') {
      return `Investigate license for ${dep.name} or find alternative package`;
    }

    if (license.category === 'strong_copyleft' && policy.projectLicense === 'proprietary') {
      return `Replace ${dep.name} with MIT/Apache-2.0 licensed alternative`;
    }

    if (license.category === 'weak_copyleft' && policy.projectLicense === 'proprietary') {
      return `Consider dynamic linking or finding permissive alternative for ${dep.name}`;
    }

    return `Review ${dep.name} license or find compatible alternative`;
  }

  /**
   * Get risk points
   */
  private getRiskPoints(level: 'low' | 'medium' | 'high' | 'critical'): number {
    const points = { low: 1, medium: 2, high: 3, critical: 4 };
    return points[level];
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    violations: LicenseViolation[],
    policy: CompliancePolicy
  ): string[] {
    const recommendations: string[] = [];

    if (violations.length === 0) {
      recommendations.push('All dependencies comply with license policy');
      return recommendations;
    }

    const criticalCount = violations.filter((v) => v.severity === 'critical').length;
    const highCount = violations.filter((v) => v.severity === 'high').length;

    if (criticalCount > 0) {
      recommendations.push(
        `CRITICAL: ${criticalCount} dependencies with incompatible licenses must be replaced`
      );
    }

    if (highCount > 0) {
      recommendations.push(
        `WARNING: ${highCount} dependencies with high-risk licenses should be reviewed`
      );
    }

    // Group by violation type
    const incompatible = violations.filter((v) => v.type === 'incompatible');
    const missing = violations.filter((v) => v.type === 'missing');

    if (incompatible.length > 0) {
      recommendations.push(
        `Review incompatible licenses: ${incompatible.map((v) => v.dependency).join(', ')}`
      );
    }

    if (missing.length > 0) {
      recommendations.push(
        `Investigate missing licenses: ${missing.map((v) => v.dependency).join(', ')}`
      );
    }

    if (policy.requireAttribution) {
      recommendations.push('Ensure all attribution requirements are met in NOTICE file');
    }

    return recommendations;
  }

  /**
   * Store scan result in database
   */
  private async storeScanResult(
    result: LicenseScanResult,
    policyName: string,
    dependencies: Dependency[]
  ): Promise<void> {
    try {
      await this.db.query(
        `
        INSERT INTO license_scans (
          policy_name,
          compliant,
          total_dependencies,
          violations_count,
          risk_score,
          dependencies,
          violations,
          recommendations
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
        [
          policyName,
          result.compliant,
          dependencies.length,
          result.violations.length,
          result.riskScore,
          JSON.stringify(result.dependencies),
          JSON.stringify(result.violations),
          JSON.stringify(result.recommendations),
        ]
      );

      logger.info({ compliant: result.compliant, violations: result.violations.length }, 'Scan result stored');
    } catch (err) {
      logger.error({ err }, 'Failed to store scan result');
    }
  }

  /**
   * Register custom compliance policy
   */
  async registerPolicy(name: string, policy: CompliancePolicy): Promise<void> {
    this.policies.set(name, policy);

    await this.db.query(
      `
      INSERT INTO compliance_policies (name, project_license, allowed_categories, blocked_licenses, config)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (name) DO UPDATE SET
        project_license = $2,
        allowed_categories = $3,
        blocked_licenses = $4,
        config = $5
    `,
      [
        name,
        policy.projectLicense,
        JSON.stringify(policy.allowedCategories),
        JSON.stringify(policy.blockedLicenses),
        JSON.stringify(policy),
      ]
    );

    logger.info({ policyName: name }, 'Policy registered');
  }

  /**
   * Extract licenses from package files
   */
  async extractFromPackageFile(filePath: string, source: Dependency['source']): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];

    try {
      const fs = require('fs').promises;
      const content = await fs.readFile(filePath, 'utf-8');

      if (source === 'npm') {
        const pkg = JSON.parse(content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        for (const [name, version] of Object.entries(deps)) {
          dependencies.push({
            name,
            version: version as string,
            license: 'UNKNOWN', // Would need to fetch from registry
            source: 'npm',
            path: filePath,
          });
        }
      } else if (source === 'pypi') {
        // Parse requirements.txt or Pipfile
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/^([a-zA-Z0-9-_]+)(==|>=|<=)?([0-9.]+)?/);
          if (match) {
            dependencies.push({
              name: match[1],
              version: match[3] || 'latest',
              license: 'UNKNOWN',
              source: 'pypi',
              path: filePath,
            });
          }
        }
      }

      logger.info({ count: dependencies.length, source }, 'Extracted dependencies');
    } catch (err) {
      logger.error({ err, filePath }, 'Failed to extract dependencies');
    }

    return dependencies;
  }
}

// ============================================================================
// Database Migration
// ============================================================================

export const LICENSE_GUARD_MIGRATION = `
-- License scans table
CREATE TABLE IF NOT EXISTS license_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_name VARCHAR(100) NOT NULL,
  compliant BOOLEAN NOT NULL,
  total_dependencies INTEGER NOT NULL,
  violations_count INTEGER NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL,
  dependencies JSONB NOT NULL,
  violations JSONB NOT NULL,
  recommendations JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_license_scans_policy ON license_scans(policy_name);
CREATE INDEX IF NOT EXISTS idx_license_scans_compliant ON license_scans(compliant);
CREATE INDEX IF NOT EXISTS idx_license_scans_timestamp ON license_scans(created_at);

COMMENT ON TABLE license_scans IS 'License compliance scan results';

-- Compliance policies table
CREATE TABLE IF NOT EXISTS compliance_policies (
  name VARCHAR(100) PRIMARY KEY,
  project_license VARCHAR(100) NOT NULL,
  allowed_categories JSONB NOT NULL,
  blocked_licenses JSONB NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE compliance_policies IS 'License compliance policy definitions';
`;
