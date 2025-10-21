/**
 * Security Gate
 *
 * Phase 6a Security Gate - Enforces security requirements before QA/Release
 *
 * Role: Make pass/fail/escalate decision based on SecurityPack results
 * Hard Requirements:
 *   - 0 critical CVEs (no exceptions)
 *   - 0 secrets (no exceptions)
 *   - 0 high CVEs (unless waiver with compensating control)
 *   - SAST: 0 critical, 0 high (unless waiver)
 *   - 100% SBOM coverage (all artifacts have SBOM)
 *   - All container images signed
 */

import { SecurityPack, GateDecision, Waiver } from '@ideamine/schemas';

export interface SecurityGateConfig {
  // Hard thresholds (cannot be changed)
  readonly criticalCVEsAllowed: number; // Always 0
  readonly secretsAllowed: number; // Always 0

  // Configurable thresholds
  highCVEsAllowed: number; // Default 0, but can be overridden with waivers
  mediumCVEsAllowed: number; // Default 10
  sbomCoverageRequired: number; // Default 100% (0-1)
  signatureRequired: boolean; // Default true

  // Waiver settings
  allowWaivers: boolean; // Default true
  maxWaiverDuration: number; // Max days for waiver validity (default 30)
}

export class SecurityGate {
  private config: SecurityGateConfig;

  constructor(config?: Partial<SecurityGateConfig>) {
    // Hard-coded defaults with immutable critical thresholds
    this.config = {
      criticalCVEsAllowed: 0, // IMMUTABLE
      secretsAllowed: 0, // IMMUTABLE
      highCVEsAllowed: 0,
      mediumCVEsAllowed: 10,
      sbomCoverageRequired: 1.0, // 100%
      signatureRequired: true,
      allowWaivers: true,
      maxWaiverDuration: 30,
      ...config,
    };

    // Enforce immutability of critical thresholds
    if (this.config.criticalCVEsAllowed !== 0) {
      throw new Error('criticalCVEsAllowed must be 0 - this is a hard security requirement');
    }
    if (this.config.secretsAllowed !== 0) {
      throw new Error('secretsAllowed must be 0 - this is a hard security requirement');
    }
  }

  /**
   * Evaluate SecurityPack and make gate decision
   */
  evaluate(securityPack: SecurityPack): GateDecision {
    const timestamp = new Date().toISOString();
    const violations: string[] = [];
    const warnings: string[] = [];
    const requiredActions: string[] = [];

    // 1. Check CRITICAL requirements (no waivers allowed)
    const criticalViolations = this.checkCriticalRequirements(securityPack);
    violations.push(...criticalViolations);

    // 2. Check HIGH severity issues (waivers allowed)
    const highViolations = this.checkHighSeverityRequirements(securityPack);

    // Filter out waived violations
    const activeHighViolations = this.filterWaivedViolations(highViolations, securityPack.waivers);
    violations.push(...activeHighViolations);

    // 3. Check MEDIUM severity issues (warnings only)
    const mediumWarnings = this.checkMediumSeverityRequirements(securityPack);
    warnings.push(...mediumWarnings);

    // 4. Check supply chain requirements
    const supplyChainViolations = this.checkSupplyChainRequirements(securityPack);
    violations.push(...supplyChainViolations);

    // 5. Make decision
    let decision: 'pass' | 'fail' | 'escalate';
    let nextSteps: string[];

    if (violations.length === 0) {
      decision = 'pass';
      nextSteps = [
        'Security gate passed - proceed to QA phase',
        'Generate security attestation for release',
        'Archive SecurityPack as evidence',
      ];
    } else if (this.shouldEscalate(violations, securityPack)) {
      decision = 'escalate';
      nextSteps = [
        'Security gate requires escalation - awaiting manual review',
        'Security team will review violations and waivers',
        'Expected review time: 1-2 business days',
      ];
      requiredActions.push('Manual security review required');
    } else {
      decision = 'fail';
      nextSteps = [
        'Security gate failed - must fix violations before proceeding',
        'Review findings in SecurityPack',
        'Fix critical/high issues or request waivers',
        'Re-run security scan after fixes',
      ];
      requiredActions.push(...this.generateRequiredActions(securityPack));
    }

    // 6. Calculate overall score (0-100)
    const overallScore = this.calculateSecurityScore(securityPack);

    return {
      decision,
      overallScore,
      reasons: [...violations, ...warnings],
      requiredActions: requiredActions.length > 0 ? requiredActions : undefined,
      nextSteps,
      timestamp,
    };
  }

  // =========================================================================
  // CRITICAL REQUIREMENTS (NO WAIVERS)
  // =========================================================================

  private checkCriticalRequirements(pack: SecurityPack): string[] {
    const violations: string[] = [];

    // 1. Zero secrets (hard requirement)
    if (pack.secrets.status === 'fail' || pack.secrets.findings.length > 0) {
      const count = pack.secrets.findings.length;
      violations.push(
        `CRITICAL: ${count} secret${count !== 1 ? 's' : ''} detected. All secrets must be removed before deployment.`
      );
    }

    // 2. Zero critical CVEs (hard requirement)
    if (pack.criticalCount > 0) {
      violations.push(
        `CRITICAL: ${pack.criticalCount} critical CVE${pack.criticalCount !== 1 ? 's' : ''} detected. All critical vulnerabilities must be patched.`
      );
    }

    // 3. Critical SAST findings (hard requirement)
    if (pack.sast) {
      const criticalSAST = pack.sast.findings.filter(f => f.severity === 'critical').length;
      if (criticalSAST > 0) {
        violations.push(
          `CRITICAL: ${criticalSAST} critical security bug${criticalSAST !== 1 ? 's' : ''} in code. Must fix before deployment.`
        );
      }
    }

    return violations;
  }

  // =========================================================================
  // HIGH SEVERITY REQUIREMENTS (WAIVERS ALLOWED)
  // =========================================================================

  private checkHighSeverityRequirements(pack: SecurityPack): string[] {
    const violations: string[] = [];

    // 1. High CVEs
    const highCVEs = pack.sca.vulnerabilities.filter(v => v.severity === 'high');
    if (highCVEs.length > this.config.highCVEsAllowed) {
      violations.push(
        `HIGH: ${highCVEs.length} high-severity CVE${highCVEs.length !== 1 ? 's' : ''} detected. ${highCVEs.length - this.config.highCVEsAllowed} exceed threshold.`
      );
    }

    // 2. High SAST findings
    if (pack.sast) {
      const highSAST = pack.sast.findings.filter(f => f.severity === 'high');
      if (highSAST.length > 0) {
        violations.push(
          `HIGH: ${highSAST.length} high-severity security bug${highSAST.length !== 1 ? 's' : ''} in code.`
        );
      }
    }

    // 3. IaC critical/high violations
    if (pack.iac) {
      const iacHigh = pack.iac.violations.filter(v => v.severity === 'critical' || v.severity === 'high');
      if (iacHigh.length > 0) {
        violations.push(
          `HIGH: ${iacHigh.length} critical/high IaC policy violation${iacHigh.length !== 1 ? 's' : ''}.`
        );
      }
    }

    // 4. Container hardening issues
    if (pack.container) {
      const containerHigh = pack.container.issues.filter(i => i.severity === 'critical' || i.severity === 'high');
      if (containerHigh.length > 0) {
        violations.push(
          `HIGH: ${containerHigh.length} critical/high container hardening issue${containerHigh.length !== 1 ? 's' : ''}.`
        );
      }
    }

    return violations;
  }

  // =========================================================================
  // MEDIUM SEVERITY REQUIREMENTS (WARNINGS ONLY)
  // =========================================================================

  private checkMediumSeverityRequirements(pack: SecurityPack): string[] {
    const warnings: string[] = [];

    // 1. Medium CVEs
    const mediumCVEs = pack.sca.vulnerabilities.filter(v => v.severity === 'medium');
    if (mediumCVEs.length > this.config.mediumCVEsAllowed) {
      warnings.push(
        `WARN: ${mediumCVEs.length} medium-severity CVEs detected (${mediumCVEs.length - this.config.mediumCVEsAllowed} over threshold).`
      );
    }

    // 2. License issues
    const copyleftLicenses = pack.sca.licenses.filter(l => l.issue === 'copyleft');
    if (copyleftLicenses.length > 0) {
      warnings.push(
        `WARN: ${copyleftLicenses.length} copyleft license${copyleftLicenses.length !== 1 ? 's' : ''} detected. Legal review may be required.`
      );
    }

    // 3. Privacy risks
    if (pack.privacy) {
      const highPrivacyRisks = pack.privacy.risks.filter(r => r.severity === 'high');
      if (highPrivacyRisks.length > 0) {
        warnings.push(
          `WARN: ${highPrivacyRisks.length} high privacy risk${highPrivacyRisks.length !== 1 ? 's' : ''} identified.`
        );
      }
    }

    return warnings;
  }

  // =========================================================================
  // SUPPLY CHAIN REQUIREMENTS
  // =========================================================================

  private checkSupplyChainRequirements(pack: SecurityPack): string[] {
    const violations: string[] = [];

    if (pack.supplyChain) {
      // 1. SBOM coverage
      if (pack.supplyChain.coverage < this.config.sbomCoverageRequired) {
        const coveragePercent = (pack.supplyChain.coverage * 100).toFixed(0);
        const requiredPercent = (this.config.sbomCoverageRequired * 100).toFixed(0);
        violations.push(
          `SUPPLY CHAIN: SBOM coverage is ${coveragePercent}% (required: ${requiredPercent}%). All artifacts must have SBOM.`
        );
      }

      // 2. Signature verification
      if (this.config.signatureRequired) {
        const unverified = pack.supplyChain.verifications.filter(v => !v.verified);
        if (unverified.length > 0) {
          violations.push(
            `SUPPLY CHAIN: ${unverified.length} artifact${unverified.length !== 1 ? 's' : ''} failed signature verification.`
          );
        }
      }
    }

    return violations;
  }

  // =========================================================================
  // WAIVER HANDLING
  // =========================================================================

  private filterWaivedViolations(violations: string[], waivers: Waiver[]): string[] {
    if (!this.config.allowWaivers || waivers.length === 0) {
      return violations;
    }

    // For now, return all violations
    // In real implementation, would match violations to waivers by findingId
    // and remove waived violations from the list

    // Check waiver expiration
    const now = new Date();
    const activeWaivers = waivers.filter(w => {
      const expiresAt = new Date(w.expiresAt);
      return w.status === 'active' && expiresAt > now;
    });

    // TODO: Implement waiver matching logic
    // For now, just return violations as-is
    return violations;
  }

  private shouldEscalate(violations: string[], pack: SecurityPack): boolean {
    // Escalate if:
    // 1. There are waivers that need approval
    // 2. There are borderline cases (e.g., 1 high CVE with patch available)
    // 3. Manual review was explicitly requested

    // Check for pending waivers
    const pendingWaivers = pack.waivers.filter(w => w.status === 'active');
    if (pendingWaivers.length > 0) {
      return true;
    }

    // Check for borderline high CVEs (patch available, not in attack path)
    const highCVEs = pack.sca.vulnerabilities.filter(v => v.severity === 'high');
    const patchableHighCVEs = highCVEs.filter(v => v.patchAvailable && !v.exploitAvailable);

    if (highCVEs.length === patchableHighCVEs.length && highCVEs.length <= 2) {
      // Only patchable high CVEs, and not many - could escalate for review
      return true;
    }

    return false;
  }

  // =========================================================================
  // SCORING
  // =========================================================================

  private calculateSecurityScore(pack: SecurityPack): number {
    let score = 100;

    // Deductions:
    // - Critical CVE: -50 points each
    // - Critical SAST: -50 points each
    // - Secrets: -50 points each
    // - High CVE: -25 points each
    // - High SAST: -25 points each
    // - Medium CVE: -5 points each
    // - Medium SAST: -5 points each

    // Critical findings (instant fail)
    score -= pack.criticalCount * 50;
    score -= pack.secrets.findings.length * 50;

    if (pack.sast) {
      const criticalSAST = pack.sast.findings.filter(f => f.severity === 'critical').length;
      score -= criticalSAST * 50;
    }

    // High findings
    score -= pack.highCount * 25;

    if (pack.sast) {
      const highSAST = pack.sast.findings.filter(f => f.severity === 'high').length;
      score -= highSAST * 25;
    }

    // Medium findings
    score -= pack.mediumCount * 5;

    if (pack.sast) {
      const mediumSAST = pack.sast.findings.filter(f => f.severity === 'medium').length;
      score -= mediumSAST * 5;
    }

    // Ensure score is in range [0, 100]
    return Math.max(0, Math.min(100, score));
  }

  // =========================================================================
  // ACTION GENERATION
  // =========================================================================

  private generateRequiredActions(pack: SecurityPack): string[] {
    const actions: string[] = [];

    // 1. Secrets
    if (pack.secrets.findings.length > 0) {
      actions.push('Remove all secrets from code and container images');
      actions.push('Rotate exposed secrets immediately');
      actions.push('Use environment variables or secrets manager for credentials');
    }

    // 2. Critical CVEs
    const criticalCVEs = pack.sca.vulnerabilities.filter(v => v.severity === 'critical');
    if (criticalCVEs.length > 0) {
      const patchable = criticalCVEs.filter(v => v.patchAvailable);
      if (patchable.length > 0) {
        actions.push(`Upgrade ${patchable.length} dependencies to patch critical CVEs`);
      }

      const unpatchable = criticalCVEs.filter(v => !v.patchAvailable);
      if (unpatchable.length > 0) {
        actions.push(`Find alternatives for ${unpatchable.length} dependencies with unpatched critical CVEs`);
      }
    }

    // 3. Critical SAST
    if (pack.sast) {
      const criticalSAST = pack.sast.findings.filter(f => f.severity === 'critical');
      if (criticalSAST.length > 0) {
        actions.push(`Fix ${criticalSAST.length} critical security bugs in code`);
      }
    }

    // 4. High findings (if no waivers)
    const highCVEs = pack.sca.vulnerabilities.filter(v => v.severity === 'high');
    if (highCVEs.length > 0) {
      actions.push(`Fix or waive ${highCVEs.length} high-severity CVEs`);
    }

    // 5. Supply chain
    if (pack.supplyChain && pack.supplyChain.coverage < 1.0) {
      actions.push('Generate SBOM for all artifacts');
    }

    if (pack.supplyChain) {
      const unverified = pack.supplyChain.verifications.filter(v => !v.verified);
      if (unverified.length > 0) {
        actions.push(`Sign ${unverified.length} container images with valid signatures`);
      }
    }

    return actions;
  }
}
