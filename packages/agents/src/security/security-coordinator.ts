/**
 * Security Coordinator
 *
 * Phase 6a Security Coordinator - Orchestrates parallel security scans
 *
 * Role: Fan-out security scans, aggregate results into SecurityPack, invoke Security Gate
 * Pattern: Fan-out/Fan-in with parallel execution
 * Agents:
 *   - SecretsHygieneAgent (critical path)
 *   - SCAAgent (critical path)
 *   - SASTAgent (critical path)
 *   - IaCPolicyAgent (optional)
 *   - ContainerHardeningAgent (optional)
 *   - PrivacyDPIAAgent (optional)
 *   - ThreatModelAgent (optional)
 *   - DASTAgent (optional)
 *   - SupplyChainAgent (optional)
 */

import {
  SecurityPack,
  SecretsScanResult,
  SCAScanResult,
  SASTScanResult,
  IaCPolicyResult,
  ContainerHardeningResult,
  PrivacyDPIAResult,
  ThreatModelResult,
  DASTScanResult,
  SupplyChainResult,
  GateDecision,
  Waiver,
  SecurityArtifact,
} from '@ideamine/schemas';

import { SecretsHygieneAgent } from './secrets-hygiene-agent';
import { SCAAgent } from './sca-agent';
import { SASTAgent } from './sast-agent';
import { SecurityGate, SecurityGateConfig } from './security-gate';

export interface SecurityCoordinatorInput {
  runId: string;
  repoRef: string; // Git ref to scan
  codebasePath?: string; // Path to codebase (if already cloned)

  // Dependency manifests
  lockfiles?: string[]; // package-lock.json, requirements.txt, etc.
  manifestFiles?: string[];

  // Container images
  images?: string[];

  // Infrastructure as Code
  iacFiles?: string[];

  // Optional configuration
  languages?: string[];
  scanTransitive?: boolean;

  // Runtime testing
  deployedUrl?: string; // For DAST

  // Waivers
  waivers?: Waiver[];

  // Gate configuration
  gateConfig?: Partial<SecurityGateConfig>;
}

export interface SecurityCoordinatorResult {
  securityPack: SecurityPack;
  gateDecision: GateDecision;
  duration: number; // milliseconds
}

export class SecurityCoordinator {
  private secretsAgent: SecretsHygieneAgent;
  private scaAgent: SCAAgent;
  private sastAgent: SASTAgent;
  private gate: SecurityGate;

  constructor() {
    this.secretsAgent = new SecretsHygieneAgent();
    this.scaAgent = new SCAAgent();
    this.sastAgent = new SASTAgent();
    this.gate = new SecurityGate();
  }

  /**
   * Execute security scan workflow
   *
   * Process:
   * 1. Fan-out: Launch all security agents in parallel
   * 2. Wait for all agents to complete (Promise.all)
   * 3. Aggregate results into SecurityPack
   * 4. Invoke Security Gate
   * 5. Return SecurityPack + GateDecision
   */
  async execute(input: SecurityCoordinatorInput): Promise<SecurityCoordinatorResult> {
    const startTime = Date.now();

    console.log('[SecurityCoordinator] Starting Phase 6a Security scan', {
      runId: input.runId,
      repoRef: input.repoRef,
    });

    try {
      // =====================================================================
      // PHASE 1: FAN-OUT - Launch all agents in parallel
      // =====================================================================

      const [secretsResult, scaResult, sastResult] = await Promise.all([
        // Critical path: Secrets, SCA, SAST (always run)
        this.runSecretsAgent(input),
        this.runSCAAgent(input),
        this.runSASTAgent(input),
      ]);

      // Optional agents (run if relevant inputs provided)
      const [iacResult, containerResult, privacyResult, threatModelResult, dastResult, supplyChainResult] =
        await Promise.all([
          input.iacFiles && input.iacFiles.length > 0 ? this.runIaCAgent(input) : null,
          input.images && input.images.length > 0 ? this.runContainerAgent(input) : null,
          this.runPrivacyAgent(input), // Always run (scans code for PII)
          this.runThreatModelAgent(input), // Always run (generates threat model)
          input.deployedUrl ? this.runDASTAgent(input) : null,
          this.runSupplyChainAgent(input), // Always run (generates SBOM)
        ]);

      // =====================================================================
      // PHASE 2: AGGREGATE - Build SecurityPack
      // =====================================================================

      const securityPack = this.aggregateResults(
        input,
        secretsResult,
        scaResult,
        sastResult,
        iacResult,
        containerResult,
        privacyResult,
        threatModelResult,
        dastResult,
        supplyChainResult
      );

      console.log('[SecurityCoordinator] Security scan complete', {
        runId: input.runId,
        status: securityPack.overallStatus,
        criticalCount: securityPack.criticalCount,
        highCount: securityPack.highCount,
      });

      // =====================================================================
      // PHASE 3: GATE - Evaluate results
      // =====================================================================

      // Create gate with custom config if provided
      const gate = input.gateConfig ? new SecurityGate(input.gateConfig) : this.gate;

      const gateDecision = gate.evaluate(securityPack);

      console.log('[SecurityCoordinator] Security gate decision', {
        runId: input.runId,
        decision: gateDecision.decision,
        score: gateDecision.overallScore,
      });

      // =====================================================================
      // PHASE 4: RETURN
      // =====================================================================

      const duration = Date.now() - startTime;

      return {
        securityPack,
        gateDecision,
        duration,
      };
    } catch (error) {
      console.error('[SecurityCoordinator] Security scan failed', {
        runId: input.runId,
        error,
      });
      throw error;
    }
  }

  // ===========================================================================
  // AGENT EXECUTION
  // ===========================================================================

  private async runSecretsAgent(input: SecurityCoordinatorInput): Promise<SecretsScanResult> {
    console.log('[SecurityCoordinator] Running Secrets Hygiene Agent');

    const agentInput = {
      repoRef: input.repoRef,
      imageRefs: input.images,
      scanPaths: input.codebasePath ? [input.codebasePath] : undefined,
    };

    return await this.secretsAgent.run(agentInput);
  }

  private async runSCAAgent(input: SecurityCoordinatorInput): Promise<SCAScanResult> {
    console.log('[SecurityCoordinator] Running SCA Agent');

    const agentInput = {
      lockfiles: input.lockfiles,
      images: input.images,
      manifestFiles: input.manifestFiles,
      scanTransitive: input.scanTransitive !== false,
    };

    return await this.scaAgent.run(agentInput);
  }

  private async runSASTAgent(input: SecurityCoordinatorInput): Promise<SASTScanResult> {
    console.log('[SecurityCoordinator] Running SAST Agent');

    const agentInput = {
      codebaseRef: input.repoRef,
      languages: input.languages,
      scanPaths: input.codebasePath ? [input.codebasePath] : undefined,
    };

    return await this.sastAgent.run(agentInput);
  }

  private async runIaCAgent(input: SecurityCoordinatorInput): Promise<IaCPolicyResult | null> {
    // Placeholder - IaC agent not yet implemented
    console.log('[SecurityCoordinator] IaC Agent not implemented - skipping');
    return null;
  }

  private async runContainerAgent(input: SecurityCoordinatorInput): Promise<ContainerHardeningResult | null> {
    // Placeholder - Container agent not yet implemented
    console.log('[SecurityCoordinator] Container Agent not implemented - skipping');
    return null;
  }

  private async runPrivacyAgent(input: SecurityCoordinatorInput): Promise<PrivacyDPIAResult | null> {
    // Placeholder - Privacy agent not yet implemented
    console.log('[SecurityCoordinator] Privacy Agent not implemented - skipping');
    return null;
  }

  private async runThreatModelAgent(input: SecurityCoordinatorInput): Promise<ThreatModelResult | null> {
    // Placeholder - ThreatModel agent not yet implemented
    console.log('[SecurityCoordinator] ThreatModel Agent not implemented - skipping');
    return null;
  }

  private async runDASTAgent(input: SecurityCoordinatorInput): Promise<DASTScanResult | null> {
    // Placeholder - DAST agent not yet implemented
    console.log('[SecurityCoordinator] DAST Agent not implemented - skipping');
    return null;
  }

  private async runSupplyChainAgent(input: SecurityCoordinatorInput): Promise<SupplyChainResult | null> {
    // Placeholder - SupplyChain agent not yet implemented
    console.log('[SecurityCoordinator] SupplyChain Agent not implemented - skipping');
    return null;
  }

  // ===========================================================================
  // AGGREGATION
  // ===========================================================================

  private aggregateResults(
    input: SecurityCoordinatorInput,
    secrets: SecretsScanResult,
    sca: SCAScanResult,
    sast: SASTScanResult,
    iac: IaCPolicyResult | null,
    container: ContainerHardeningResult | null,
    privacy: PrivacyDPIAResult | null,
    threatModel: ThreatModelResult | null,
    dast: DASTScanResult | null,
    supplyChain: SupplyChainResult | null
  ): SecurityPack {
    // Calculate aggregate counts
    const criticalCount = this.countCritical(secrets, sca, sast, iac, container, dast);
    const highCount = this.countHigh(sca, sast, iac, container, dast);
    const mediumCount = this.countMedium(sca, sast, iac, container, dast);
    const lowCount = this.countLow(sca, sast, iac, container, dast);

    // Determine overall status
    let overallStatus: 'pass' | 'fail' | 'warn' = 'pass';

    if (criticalCount > 0 || secrets.findings.length > 0) {
      overallStatus = 'fail';
    } else if (highCount > 0) {
      overallStatus = 'fail'; // High findings also fail the gate
    } else if (mediumCount > 0 || lowCount > 0) {
      overallStatus = 'warn';
    }

    // Collect all artifacts
    const artifacts = this.collectArtifacts(input, secrets, sca, sast, supplyChain);

    return {
      version: '1.0',
      runId: input.runId,
      timestamp: new Date().toISOString(),
      phase: 'SECURITY',
      secrets,
      sca,
      sast,
      iac: iac || undefined,
      container: container || undefined,
      privacy: privacy || undefined,
      threatModel: threatModel || undefined,
      dast: dast || undefined,
      supplyChain: supplyChain || undefined,
      overallStatus,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      waivers: input.waivers || [],
      artifacts,
    };
  }

  // ===========================================================================
  // COUNTING HELPERS
  // ===========================================================================

  private countCritical(...results: (any | null)[]): number {
    let count = 0;

    for (const result of results) {
      if (!result) continue;

      // Secrets
      if (result.findings && result.type === 'security.secrets.v1') {
        count += result.findings.filter((f: any) => f.severity === 'critical').length;
      }

      // SCA vulnerabilities
      if (result.vulnerabilities) {
        count += result.vulnerabilities.filter((v: any) => v.severity === 'critical').length;
      }

      // SAST findings
      if (result.findings && result.type === 'security.sast.v1') {
        count += result.findings.filter((f: any) => f.severity === 'critical').length;
      }

      // IaC violations
      if (result.violations) {
        count += result.violations.filter((v: any) => v.severity === 'critical').length;
      }

      // Container issues
      if (result.issues) {
        count += result.issues.filter((i: any) => i.severity === 'critical').length;
      }

      // DAST findings
      if (result.findings && result.type === 'security.dast.v1') {
        count += result.findings.filter((f: any) => f.severity === 'critical').length;
      }
    }

    return count;
  }

  private countHigh(...results: (any | null)[]): number {
    let count = 0;

    for (const result of results) {
      if (!result) continue;

      if (result.findings && (result.type === 'security.secrets.v1' || result.type === 'security.sast.v1' || result.type === 'security.dast.v1')) {
        count += result.findings.filter((f: any) => f.severity === 'high').length;
      }

      if (result.vulnerabilities) {
        count += result.vulnerabilities.filter((v: any) => v.severity === 'high').length;
      }

      if (result.violations) {
        count += result.violations.filter((v: any) => v.severity === 'high').length;
      }

      if (result.issues) {
        count += result.issues.filter((i: any) => i.severity === 'high').length;
      }
    }

    return count;
  }

  private countMedium(...results: (any | null)[]): number {
    let count = 0;

    for (const result of results) {
      if (!result) continue;

      if (result.findings) {
        count += result.findings.filter((f: any) => f.severity === 'medium').length;
      }

      if (result.vulnerabilities) {
        count += result.vulnerabilities.filter((v: any) => v.severity === 'medium').length;
      }

      if (result.violations) {
        count += result.violations.filter((v: any) => v.severity === 'medium').length;
      }

      if (result.issues) {
        count += result.issues.filter((i: any) => i.severity === 'medium').length;
      }
    }

    return count;
  }

  private countLow(...results: (any | null)[]): number {
    let count = 0;

    for (const result of results) {
      if (!result) continue;

      if (result.findings) {
        count += result.findings.filter((f: any) => f.severity === 'low').length;
      }

      if (result.vulnerabilities) {
        count += result.vulnerabilities.filter((v: any) => v.severity === 'low').length;
      }

      if (result.violations) {
        count += result.violations.filter((v: any) => v.severity === 'low').length;
      }

      if (result.issues) {
        count += result.issues.filter((i: any) => i.severity === 'low').length;
      }
    }

    return count;
  }

  // ===========================================================================
  // ARTIFACT COLLECTION
  // ===========================================================================

  private collectArtifacts(
    input: SecurityCoordinatorInput,
    secrets: SecretsScanResult,
    sca: SCAScanResult,
    sast: SASTScanResult,
    supplyChain: SupplyChainResult | null
  ): SecurityArtifact[] {
    const artifacts: SecurityArtifact[] = [];

    // Add scan reports as artifacts
    artifacts.push(
      this.createArtifact('scan_report', 'secrets-scan-report.json', JSON.stringify(secrets)),
      this.createArtifact('scan_report', 'sca-scan-report.json', JSON.stringify(sca)),
      this.createArtifact('scan_report', 'sast-scan-report.json', JSON.stringify(sast))
    );

    // Add SBOM if available
    if (supplyChain && supplyChain.sbomUri) {
      artifacts.push({
        id: `sbom-${Date.now()}`,
        type: 'sbom',
        name: 'Software Bill of Materials',
        uri: supplyChain.sbomUri,
        contentHash: '', // Would be computed from actual SBOM
        sizeBytes: 0,
        createdAt: new Date().toISOString(),
      });
    }

    return artifacts;
  }

  private createArtifact(
    type: SecurityArtifact['type'],
    name: string,
    content: string
  ): SecurityArtifact {
    const contentHash = this.computeHash(content);

    return {
      id: `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      name,
      uri: `s3://security-artifacts/${name}`, // Placeholder URI
      contentHash,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
      createdAt: new Date().toISOString(),
    };
  }

  private computeHash(content: string): string {
    // Placeholder - would use crypto.createHash('sha256')
    return Buffer.from(content).toString('base64').substring(0, 32);
  }
}
