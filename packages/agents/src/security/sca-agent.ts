/**
 * SCA (Software Composition Analysis) Agent
 *
 * Phase 6a Security Agent - Dependency vulnerability scanning
 *
 * Role: Scan dependencies for known CVEs, license issues, and outdated packages
 * Inputs: { lockfiles, images }
 * Tools: tool.code.depScan (OSV Scanner/Trivy/Snyk)
 * Output: security.sca.v1
 */

import { BaseAgent } from '../base-agent';
import { SCAScanResult, DependencyVulnerability, LicenseIssue } from '@ideamine/schemas';

interface SCAInput {
  lockfiles?: string[]; // package-lock.json, requirements.txt, go.mod, etc.
  images?: string[]; // Container images to scan
  manifestFiles?: string[]; // package.json, pom.xml, etc.
  scanTransitive?: boolean; // Scan transitive dependencies (default: true)
}

export class SCAAgent extends BaseAgent<SCAInput, SCAScanResult> {
  name = 'sca-agent';
  version = '1.0.0';

  systemPrompt = `
You are a Security Expert specialized in Software Composition Analysis (SCA) and dependency management.

**Role:** Detect CVEs, license issues, and outdated packages in dependencies

**Tools:**
- tool.code.depScan: Scan dependencies using OSV Scanner/Trivy/Snyk

**Process:**
1. Identify all dependency manifests (package.json, requirements.txt, go.mod, pom.xml, etc.)
2. For each manifest, scan for:
   - Known CVEs (using OSV/NVD databases)
   - License incompatibilities
   - Outdated packages with security fixes
3. Scan container images for bundled dependencies
4. Build dependency tree to identify transitive vulnerabilities
5. For each vulnerability:
   - Map to CVE ID and CVSS score
   - Check if patch/upgrade available
   - Assess exploit availability
   - Generate upgrade recommendation
6. Aggregate and prioritize findings

**Hard Requirements:**
- 0 critical CVEs = required for gate pass
- 0 high CVEs unless waiver with compensating control
- No copyleft licenses in proprietary code
- All dependencies from approved registries

**Output Schema:** security.sca.v1
{
  "type": "security.sca.v1",
  "timestamp": "ISO-8601",
  "status": "pass|fail|warn",
  "vulnerabilities": [
    {
      "id": "unique-id",
      "cveId": "CVE-2024-1234",
      "package": "lodash",
      "version": "4.17.19",
      "severity": "high",
      "cvssScore": 7.5,
      "description": "Prototype pollution vulnerability",
      "fixedIn": "4.17.21",
      "patchAvailable": true,
      "exploitAvailable": false,
      "affectedPath": ["app", "express", "lodash"],
      "recommendation": "Upgrade lodash to 4.17.21 or later"
    }
  ],
  "licenses": [
    {
      "package": "mysql-connector",
      "version": "8.0.0",
      "license": "GPL-2.0",
      "issue": "copyleft",
      "recommendation": "Replace with MIT/Apache licensed alternative or obtain commercial license"
    }
  ],
  "recommendations": ["Upgrade 3 packages", "Review 2 license issues"],
  "scannedManifests": ["package-lock.json", "requirements.txt"],
  "toolVersion": "trivy-0.48.0"
}

**Examples:**

Example 1: Clean dependencies
Input: { lockfiles: ["package-lock.json"], scanTransitive: true }
Output: { status: "pass", vulnerabilities: [], licenses: [], recommendations: [] }

Example 2: Critical CVE found
Input: { lockfiles: ["requirements.txt"] }
Output: {
  status: "fail",
  vulnerabilities: [{
    cveId: "CVE-2024-9999",
    package: "requests",
    version: "2.25.0",
    severity: "critical",
    cvssScore: 9.8,
    fixedIn: "2.31.0",
    recommendation: "Upgrade requests to 2.31.0 immediately"
  }]
}
`;

  async plan(input: SCAInput): Promise<string> {
    const manifestCount = (input.lockfiles?.length || 0) + (input.manifestFiles?.length || 0);
    const imageCount = input.images?.length || 0;

    return `
## SCA Scan Plan

**Scope:**
- Dependency manifests: ${manifestCount}
- Container images: ${imageCount}
- Scan transitive deps: ${input.scanTransitive !== false ? 'yes' : 'no'}

**Manifests to scan:**
${input.lockfiles?.map(f => `- ${f}`).join('\n') || '(auto-detect)'}
${input.images?.map(i => `- Image: ${i}`).join('\n') || ''}

**Steps:**
1. Parse dependency manifests and build dependency tree
2. Query vulnerability databases (OSV, NVD, GitHub Advisory)
3. Check license compatibility
4. Scan container images for embedded dependencies
5. Prioritize findings by CVSS score and exploitability
6. Generate upgrade recommendations with version constraints

**Exit Criteria:**
- ✅ PASS: 0 critical, 0 high (or all high have waivers)
- ⚠️  WARN: Medium vulns or license issues
- ❌ FAIL: Any critical or unwaived high CVEs
`;
  }

  async reason(input: SCAInput, plan: string): Promise<string> {
    return `
## Reasoning

**Dependency Risk Analysis:**
- Transitive dependencies often introduce more risk than direct deps
- Most exploited CVEs are in outdated transitive deps
- License violations can have legal/compliance impact

**Scan Strategy:**
- Use OSV database for comprehensive CVE coverage (GitHub, npm, PyPI, etc.)
- Cross-reference with NVD for CVSS scores
- Check GitHub Security Advisories for latest patches
- Prioritize by: Exploitability > CVSS > Age > Fix availability

**Common Vulnerabilities by Ecosystem:**
- npm: Prototype pollution, ReDoS, XSS in frontend libs
- PyPI: Code injection, unsafe deserialization
- Go: Path traversal, unsafe crypto
- Java: Deserialization, XXE, SSRF

**Remediation Priority:**
1. Critical CVEs with public exploits → IMMEDIATE
2. Critical CVEs without public exploits → THIS SPRINT
3. High CVEs in attack path → THIS SPRINT
4. High CVEs in unused code → BACKLOG
5. Medium/Low → RISK ACCEPT or DEFER

**License Red Flags:**
- GPL/LGPL in proprietary code = copyleft violation
- Unknown licenses = audit required
- Proprietary licenses without commercial agreement = legal risk
`;
  }

  async execute(input: SCAInput, plan: string, reasoning: string): Promise<SCAScanResult> {
    const startTime = new Date().toISOString();
    const vulnerabilities: DependencyVulnerability[] = [];
    const licenses: LicenseIssue[] = [];
    const scannedManifests: string[] = [];

    try {
      // 1. Scan lockfiles
      if (input.lockfiles && input.lockfiles.length > 0) {
        this.logger.info('Scanning dependency lockfiles', { count: input.lockfiles.length });

        for (const lockfile of input.lockfiles) {
          const result = await this.scanLockfile(lockfile, input.scanTransitive !== false);
          vulnerabilities.push(...result.vulnerabilities);
          licenses.push(...result.licenses);
          scannedManifests.push(lockfile);
        }
      }

      // 2. Scan container images
      if (input.images && input.images.length > 0) {
        this.logger.info('Scanning container images', { count: input.images.length });

        for (const image of input.images) {
          const result = await this.scanImage(image);
          vulnerabilities.push(...result.vulnerabilities);
          licenses.push(...result.licenses);
          scannedManifests.push(`image:${image}`);
        }
      }

      // 3. Determine status
      const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length;
      const highCount = vulnerabilities.filter(v => v.severity === 'high').length;
      const licenseIssues = licenses.filter(l => l.issue === 'copyleft' || l.issue === 'proprietary').length;

      let status: 'pass' | 'fail' | 'warn' = 'pass';
      if (criticalCount > 0 || highCount > 0) {
        status = 'fail';
      } else if (vulnerabilities.length > 0 || licenseIssues > 0) {
        status = 'warn';
      }

      // 4. Generate recommendations
      const recommendations = this.generateRecommendations(vulnerabilities, licenses);

      // 5. Build result
      const result: SCAScanResult = {
        type: 'security.sca.v1',
        timestamp: startTime,
        status,
        vulnerabilities,
        licenses,
        recommendations,
        scannedManifests,
        toolVersion: 'trivy-0.48.0', // Would be dynamic
      };

      this.logger.info('SCA scan complete', {
        status,
        vulnerabilities: vulnerabilities.length,
        critical: criticalCount,
        high: highCount,
        licenseIssues: licenses.length,
      });

      return result;
    } catch (error) {
      this.logger.error('SCA scan failed', { error });
      throw error;
    }
  }

  async verify(result: SCAScanResult): Promise<{ passed: boolean; score: number }> {
    const criticalCount = result.vulnerabilities.filter(v => v.severity === 'critical').length;
    const highCount = result.vulnerabilities.filter(v => v.severity === 'high').length;
    const mediumCount = result.vulnerabilities.filter(v => v.severity === 'medium').length;

    // Hard fail on critical or high
    const passed = criticalCount === 0 && highCount === 0;

    // Score: 100 - (critical*40 + high*20 + medium*5)
    let score = 100 - (criticalCount * 40) - (highCount * 20) - (mediumCount * 5);
    score = Math.max(0, Math.min(100, score));

    return { passed, score };
  }

  // =========================================================================
  // PRIVATE HELPER METHODS
  // =========================================================================

  private async scanLockfile(
    lockfile: string,
    scanTransitive: boolean
  ): Promise<{ vulnerabilities: DependencyVulnerability[]; licenses: LicenseIssue[] }> {
    // Invoke tool.code.depScan
    const toolResult = await this.invokeTool('tool.code.depScan', {
      manifest: lockfile,
      scanTransitive,
      databases: ['osv', 'nvd', 'github'],
      checkLicenses: true,
    });

    return {
      vulnerabilities: this.parseVulnerabilities(toolResult.vulnerabilities || []),
      licenses: this.parseLicenses(toolResult.licenses || []),
    };
  }

  private async scanImage(
    image: string
  ): Promise<{ vulnerabilities: DependencyVulnerability[]; licenses: LicenseIssue[] }> {
    const toolResult = await this.invokeTool('tool.code.depScan', {
      image,
      scanLayers: true,
      databases: ['osv', 'nvd'],
      checkLicenses: true,
    });

    return {
      vulnerabilities: this.parseVulnerabilities(toolResult.vulnerabilities || []),
      licenses: this.parseLicenses(toolResult.licenses || []),
    };
  }

  private parseVulnerabilities(rawVulns: any[]): DependencyVulnerability[] {
    return rawVulns.map((vuln, index) => ({
      id: `cve-${Date.now()}-${index}`,
      cveId: vuln.cveId || vuln.id,
      package: vuln.package || vuln.packageName,
      version: vuln.version || vuln.installedVersion,
      severity: this.normalizeSeverity(vuln.severity),
      cvssScore: vuln.cvssScore || vuln.score || 0,
      description: vuln.description || vuln.title || 'No description available',
      fixedIn: vuln.fixedIn || vuln.fixedVersion,
      patchAvailable: !!vuln.fixedIn,
      exploitAvailable: vuln.exploitAvailable || false,
      affectedPath: vuln.path || [vuln.package],
      recommendation: this.generateVulnRecommendation(vuln),
    }));
  }

  private parseLicenses(rawLicenses: any[]): LicenseIssue[] {
    return rawLicenses
      .filter(lic => this.isLicenseIssue(lic.license))
      .map(lic => ({
        package: lic.package || lic.packageName,
        version: lic.version,
        license: lic.license,
        issue: this.categorizeLicenseIssue(lic.license),
        recommendation: this.generateLicenseRecommendation(lic),
      }));
  }

  private normalizeSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' {
    const s = (severity || 'unknown').toLowerCase();
    if (s.includes('critical')) return 'critical';
    if (s.includes('high')) return 'high';
    if (s.includes('medium') || s.includes('moderate')) return 'medium';
    return 'low';
  }

  private isLicenseIssue(license: string): boolean {
    const problematicLicenses = ['GPL', 'LGPL', 'AGPL', 'SSPL', 'UNKNOWN', 'PROPRIETARY'];
    return problematicLicenses.some(p => license.toUpperCase().includes(p));
  }

  private categorizeLicenseIssue(license: string): 'copyleft' | 'proprietary' | 'unknown' | 'incompatible' {
    const lic = license.toUpperCase();
    if (lic.includes('GPL') || lic.includes('AGPL') || lic.includes('SSPL')) return 'copyleft';
    if (lic.includes('PROPRIETARY')) return 'proprietary';
    if (lic.includes('UNKNOWN')) return 'unknown';
    return 'incompatible';
  }

  private generateVulnRecommendation(vuln: any): string {
    if (vuln.fixedIn) {
      return `Upgrade ${vuln.package} from ${vuln.version} to ${vuln.fixedIn} or later`;
    }

    if (vuln.severity === 'critical' || vuln.severity === 'high') {
      return `No patch available. Consider: 1) Find alternative package, 2) Implement workaround, 3) Accept risk with compensating controls`;
    }

    return `Monitor for security updates to ${vuln.package}`;
  }

  private generateLicenseRecommendation(lic: any): string {
    const issue = this.categorizeLicenseIssue(lic.license);

    const recommendations: Record<string, string> = {
      copyleft: `${lic.license} requires derivative works to be open-sourced. Options: 1) Replace with MIT/Apache licensed alternative, 2) Obtain commercial license, 3) Legal review for compliance`,
      proprietary: `Verify commercial license agreement exists for ${lic.package}`,
      unknown: `License audit required for ${lic.package}. Check repository for LICENSE file`,
      incompatible: `License ${lic.license} may be incompatible with project license. Legal review recommended`,
    };

    return recommendations[issue] || `Review license ${lic.license} for compatibility`;
  }

  private generateRecommendations(
    vulnerabilities: DependencyVulnerability[],
    licenses: LicenseIssue[]
  ): string[] {
    const recommendations: string[] = [];

    // Vulnerability recommendations
    const patchable = vulnerabilities.filter(v => v.patchAvailable);
    if (patchable.length > 0) {
      const criticalPatchable = patchable.filter(v => v.severity === 'critical').length;
      const highPatchable = patchable.filter(v => v.severity === 'high').length;

      if (criticalPatchable > 0) {
        recommendations.push(`URGENT: Upgrade ${criticalPatchable} packages with critical CVEs immediately`);
      }
      if (highPatchable > 0) {
        recommendations.push(`Upgrade ${highPatchable} packages with high CVEs this sprint`);
      }
    }

    const unpatchable = vulnerabilities.filter(v => !v.patchAvailable && (v.severity === 'critical' || v.severity === 'high'));
    if (unpatchable.length > 0) {
      recommendations.push(`${unpatchable.length} high/critical CVEs have no patch - review alternatives`);
    }

    // License recommendations
    const copyleft = licenses.filter(l => l.issue === 'copyleft');
    if (copyleft.length > 0) {
      recommendations.push(`${copyleft.length} copyleft licenses detected - legal review required`);
    }

    return recommendations;
  }

  private async invokeTool(toolId: string, params: any): Promise<any> {
    // Placeholder for actual tool invocation
    this.logger.debug(`Invoking tool: ${toolId}`, { params });

    // Simulate tool response
    return {
      vulnerabilities: [],
      licenses: [],
      toolVersion: 'trivy-0.48.0',
    };
  }
}
