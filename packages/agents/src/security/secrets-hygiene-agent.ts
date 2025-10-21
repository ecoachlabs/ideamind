/**
 * Secrets Hygiene Agent
 *
 * Phase 6a Security Agent - Ensures zero secrets in code/images
 *
 * Role: Scan repository and container images for leaked secrets (API keys, tokens, credentials)
 * Inputs: { repo_ref, image_refs }
 * Tools: guard.secretScan (TruffleHog/Gitleaks/detect-secrets)
 * Output: security.secrets.v1
 */

import { BaseAgent, AgentExecutionInput, AgentExecutionResult } from '../base-agent';
import { SecretsScanResult, SecretFinding } from '@ideamine/schemas';

interface SecretsHygieneInput {
  repoRef: string; // Git ref to scan
  imageRefs?: string[]; // Container images to scan
  scanPaths?: string[]; // Specific paths to scan
  excludePaths?: string[]; // Paths to exclude (e.g., test fixtures)
}

export class SecretsHygieneAgent extends BaseAgent<SecretsHygieneInput, SecretsScanResult> {
  name = 'secrets-hygiene-agent';
  version = '1.0.0';

  systemPrompt = `
You are a Security Expert specialized in secrets detection and remediation.

**Role:** Scan code repositories and container images for leaked secrets (API keys, passwords, tokens, certificates, etc.)

**Tools:**
- guard.secretScan: Scan repository/images for secrets using TruffleHog/Gitleaks

**Process:**
1. Scan repository at given ref using guard.secretScan
2. If images provided, scan each image for embedded secrets
3. Classify findings by severity (critical for production keys, high for dev/test)
4. For each finding, provide:
   - Redacted preview (never log full secrets)
   - File/line location
   - Secret type (AWS key, GitHub token, private key, etc.)
   - Remediation steps
5. Aggregate results and determine pass/fail status

**Hard Requirements:**
- 0 secrets in production code/images = PASS
- Any secret found = FAIL (gate blocker)
- Never log or output actual secret values - always redact

**Output Schema:** security.secrets.v1
{
  "type": "security.secrets.v1",
  "timestamp": "ISO-8601",
  "status": "pass|fail",
  "findings": [
    {
      "id": "unique-id",
      "severity": "critical|high",
      "type": "aws_access_key|github_token|private_key|...",
      "file": "path/to/file",
      "line": 123,
      "matched": "AKIA****REDACTED****",
      "confidence": 0.95,
      "recommendation": "Remove secret and rotate immediately. Use environment variables or secrets manager."
    }
  ],
  "scannedPaths": ["src/", "config/"],
  "scannedImages": ["app:latest"],
  "toolVersion": "trufflehog-3.x"
}

**Examples:**

Example 1: Clean repository
Input: { repoRef: "main", imageRefs: ["app:v1.0"] }
Output: { status: "pass", findings: [], scannedPaths: [...], scannedImages: [...] }

Example 2: Leaked AWS key
Input: { repoRef: "feature/auth" }
Output: {
  status: "fail",
  findings: [{
    id: "aws-key-001",
    severity: "critical",
    type: "aws_access_key",
    file: "src/config.ts",
    line: 42,
    matched: "AKIA****XXXX",
    confidence: 0.98,
    recommendation: "Remove hardcoded AWS key. Rotate immediately in AWS IAM. Use AWS_ACCESS_KEY_ID environment variable."
  }]
}
`;

  async plan(input: SecretsHygieneInput): Promise<string> {
    return `
## Secrets Hygiene Scan Plan

**Scope:**
- Repository: ${input.repoRef}
- Images: ${input.imageRefs?.join(', ') || 'none'}
- Custom paths: ${input.scanPaths?.join(', ') || 'all'}
- Exclusions: ${input.excludePaths?.join(', ') || 'none'}

**Steps:**
1. Scan repository code for secrets using guard.secretScan
2. ${input.imageRefs?.length ? 'Scan container images for embedded secrets' : 'Skip image scanning (no images provided)'}
3. Classify findings by severity and confidence
4. Generate remediation recommendations
5. Determine pass/fail status (0 secrets required)

**Exit Criteria:**
- ✅ PASS: Zero secrets detected
- ❌ FAIL: Any secret detected (blocks Security Gate)
`;
  }

  async reason(input: SecretsHygieneInput, plan: string): Promise<string> {
    const scanScope = this.calculateScanScope(input);

    return `
## Reasoning

**Scan Scope Assessment:**
- Total paths to scan: ${scanScope.paths}
- Total images to scan: ${scanScope.images}
- Estimated scan time: ${scanScope.estimatedTime}

**Risk Analysis:**
- High-risk paths: ${this.identifyHighRiskPaths(input).join(', ')}
- Common secret locations: config files, .env files, scripts, Dockerfiles

**Detection Strategy:**
- Use regex patterns for known secret formats (AWS, GitHub, SSH keys, etc.)
- Entropy-based detection for unknown secrets
- Cross-reference with public breach databases
- Scan git history (not just current HEAD)

**False Positive Mitigation:**
- Exclude test fixtures with known fake secrets
- Verify detected secrets match known patterns
- Check confidence scores (>0.8 = high confidence)
`;
  }

  async execute(
    input: SecretsHygieneInput,
    plan: string,
    reasoning: string
  ): Promise<SecretsScanResult> {
    const startTime = new Date().toISOString();
    const findings: SecretFinding[] = [];

    try {
      // 1. Scan repository
      this.logger.info('Scanning repository for secrets', { repoRef: input.repoRef });

      const repoFindings = await this.scanRepository(input);
      findings.push(...repoFindings);

      // 2. Scan images if provided
      if (input.imageRefs && input.imageRefs.length > 0) {
        this.logger.info('Scanning container images for secrets', {
          images: input.imageRefs
        });

        const imageFindings = await this.scanImages(input.imageRefs);
        findings.push(...imageFindings);
      }

      // 3. Determine status
      const status = findings.length === 0 ? 'pass' : 'fail';

      // 4. Build result
      const result: SecretsScanResult = {
        type: 'security.secrets.v1',
        timestamp: startTime,
        status,
        findings,
        scannedPaths: input.scanPaths || ['**/*'],
        scannedImages: input.imageRefs || [],
        toolVersion: 'trufflehog-3.63.0', // Would be dynamic in real implementation
      };

      this.logger.info('Secrets scan complete', {
        status,
        findingsCount: findings.length,
        criticalCount: findings.filter(f => f.severity === 'critical').length,
      });

      return result;
    } catch (error) {
      this.logger.error('Secrets scan failed', { error });
      throw error;
    }
  }

  async verify(result: SecretsScanResult): Promise<{ passed: boolean; score: number }> {
    // Hard requirement: 0 secrets
    const passed = result.status === 'pass' && result.findings.length === 0;

    // Score based on findings
    let score = 100;

    if (result.findings.length > 0) {
      const criticalCount = result.findings.filter(f => f.severity === 'critical').length;
      const highCount = result.findings.filter(f => f.severity === 'high').length;

      // Each critical = -50 points, each high = -25 points
      score = Math.max(0, 100 - (criticalCount * 50) - (highCount * 25));
    }

    return { passed, score };
  }

  // =========================================================================
  // PRIVATE HELPER METHODS
  // =========================================================================

  private async scanRepository(input: SecretsHygieneInput): Promise<SecretFinding[]> {
    // In real implementation, this would call guard.secretScan tool
    // For now, return simulated scan based on analysis

    // Simulate tool call
    const toolResult = await this.invokeTool('guard.secretScan', {
      target: input.repoRef,
      type: 'repository',
      paths: input.scanPaths,
      exclude: input.excludePaths,
      scanHistory: true, // Scan git history, not just HEAD
    });

    return this.parseSecretFindings(toolResult);
  }

  private async scanImages(imageRefs: string[]): Promise<SecretFinding[]> {
    const findings: SecretFinding[] = [];

    for (const image of imageRefs) {
      const toolResult = await this.invokeTool('guard.secretScan', {
        target: image,
        type: 'container_image',
        layers: 'all', // Scan all image layers
      });

      const imageFindings = this.parseSecretFindings(toolResult);
      findings.push(...imageFindings);
    }

    return findings;
  }

  private parseSecretFindings(toolResult: any): SecretFinding[] {
    // Parse tool output into SecretFinding[]
    if (!toolResult || !toolResult.findings) {
      return [];
    }

    return toolResult.findings.map((finding: any, index: number) => ({
      id: `secret-${Date.now()}-${index}`,
      severity: this.determineSeverity(finding),
      type: finding.type || 'unknown',
      file: finding.file || finding.path,
      line: finding.line,
      matched: this.redactSecret(finding.matched || finding.secret),
      confidence: finding.confidence || 0.8,
      recommendation: this.generateRecommendation(finding),
    }));
  }

  private determineSeverity(finding: any): 'critical' | 'high' {
    // Production secrets = critical
    // Development/test secrets = high
    const productionKeywords = ['prod', 'production', 'live', 'aws', 'github', 'stripe'];
    const lowerType = (finding.type || '').toLowerCase();
    const lowerFile = (finding.file || '').toLowerCase();

    if (productionKeywords.some(kw => lowerType.includes(kw) || lowerFile.includes(kw))) {
      return 'critical';
    }

    return 'high';
  }

  private redactSecret(secret: string): string {
    if (!secret || secret.length < 8) {
      return '***REDACTED***';
    }

    // Show first 4 chars + last 4 chars, redact middle
    const start = secret.substring(0, 4);
    const end = secret.substring(secret.length - 4);
    return `${start}****REDACTED****${end}`;
  }

  private generateRecommendation(finding: any): string {
    const type = finding.type || 'unknown';

    const recommendations: Record<string, string> = {
      aws_access_key: 'Remove hardcoded AWS credentials. Rotate keys in AWS IAM immediately. Use IAM roles or AWS_ACCESS_KEY_ID environment variable.',
      github_token: 'Revoke GitHub token immediately. Use GitHub Secrets or GITHUB_TOKEN environment variable.',
      private_key: 'Remove private key from repository. Regenerate key pair. Store private keys in secure vault (AWS Secrets Manager, HashiCorp Vault).',
      api_key: 'Remove hardcoded API key. Rotate key with provider. Use environment variables or secrets manager.',
      password: 'Remove hardcoded password. Reset password. Use environment variables or configuration management.',
      database_url: 'Remove hardcoded database connection string. Use DATABASE_URL environment variable.',
    };

    return recommendations[type] || 'Remove secret from code. Rotate/regenerate secret. Use environment variables or secrets manager.';
  }

  private calculateScanScope(input: SecretsHygieneInput): {
    paths: number;
    images: number;
    estimatedTime: string;
  } {
    const paths = input.scanPaths?.length || 1;
    const images = input.imageRefs?.length || 0;

    // Rough estimate: 30s per path + 60s per image
    const estimatedSeconds = (paths * 30) + (images * 60);
    const estimatedTime = `${Math.ceil(estimatedSeconds / 60)} minutes`;

    return { paths, images, estimatedTime };
  }

  private identifyHighRiskPaths(input: SecretsHygieneInput): string[] {
    const highRiskPatterns = [
      'config/',
      '.env',
      'secrets/',
      'credentials/',
      'deploy/',
      'infra/',
      'scripts/',
      'Dockerfile',
      '.github/workflows/',
    ];

    if (!input.scanPaths) {
      return highRiskPatterns;
    }

    return input.scanPaths.filter(path =>
      highRiskPatterns.some(pattern => path.includes(pattern))
    );
  }

  private async invokeTool(toolId: string, params: any): Promise<any> {
    // Placeholder for actual tool invocation
    // In real implementation, this would call the tool executor
    this.logger.debug(`Invoking tool: ${toolId}`, { params });

    // Simulate tool response
    return {
      findings: [],
      scanned: params.target,
      toolVersion: 'trufflehog-3.63.0',
    };
  }
}
