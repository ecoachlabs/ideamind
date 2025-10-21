/**
 * Security Pack - Comprehensive security assessment results
 * Version 1.0 - Phase 6a Security & Privacy Assurance
 */

export interface SecurityPack {
  version: '1.0';
  runId: string;
  timestamp: string;
  phase: 'SECURITY';

  // Scan results
  secrets: SecretsScanResult;
  sca: SCAScanResult;
  sast: SASTScanResult;
  iac?: IaCPolicyResult;
  container?: ContainerHardeningResult;
  privacy?: PrivacyDPIAResult;
  threatModel?: ThreatModelResult;
  dast?: DASTScanResult;
  supplyChain?: SupplyChainResult;

  // Aggregate metrics
  overallStatus: 'pass' | 'fail' | 'warn';
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;

  // Waivers & exceptions
  waivers: Waiver[];

  // Gate result
  gateDecision?: GateDecision;

  // Evidence
  artifacts: SecurityArtifact[];
}

// ============================================================================
// SECRETS SCAN RESULT
// ============================================================================

export interface SecretsScanResult {
  type: 'security.secrets.v1';
  timestamp: string;
  status: 'pass' | 'fail';
  findings: SecretFinding[];
  scannedPaths: string[];
  scannedImages: string[];
  toolVersion: string;
}

export interface SecretFinding {
  id: string;
  severity: 'critical' | 'high';
  type: string; // 'aws_key', 'github_token', 'private_key', etc.
  file: string;
  line?: number;
  matched: string; // Redacted secret preview
  confidence: number; // 0-1
  recommendation: string;
}

// ============================================================================
// SCA (DEPENDENCY VULN) RESULT
// ============================================================================

export interface SCAScanResult {
  type: 'security.sca.v1';
  timestamp: string;
  status: 'pass' | 'fail' | 'warn';
  vulnerabilities: DependencyVulnerability[];
  licenses: LicenseIssue[];
  recommendations: string[];
  scannedManifests: string[];
  toolVersion: string;
}

export interface DependencyVulnerability {
  id: string;
  cveId?: string; // CVE-2024-1234
  package: string;
  version: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cvssScore?: number;
  description: string;
  fixedIn?: string; // Version that fixes the vuln
  patchAvailable: boolean;
  exploitAvailable: boolean;
  affectedPath: string[]; // Dependency chain
  recommendation: string;
}

export interface LicenseIssue {
  package: string;
  version: string;
  license: string;
  issue: 'copyleft' | 'proprietary' | 'unknown' | 'incompatible';
  recommendation: string;
}

// ============================================================================
// SAST (STATIC ANALYSIS) RESULT
// ============================================================================

export interface SASTScanResult {
  type: 'security.sast.v1';
  timestamp: string;
  status: 'pass' | 'fail' | 'warn';
  findings: SASTFinding[];
  coverage: {
    filesScanned: number;
    linesScanned: number;
    rulesApplied: number;
  };
  toolVersion: string;
}

export interface SASTFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string; // 'injection', 'xss', 'auth', 'crypto', etc.
  cweId?: string; // CWE-89
  owaspId?: string; // A01:2021
  title: string;
  description: string;
  file: string;
  line: number;
  column?: number;
  codeSnippet: string;
  dataFlow?: string[]; // Taint tracking
  recommendation: string;
  confidence: number; // 0-1
}

// ============================================================================
// IAC POLICY RESULT
// ============================================================================

export interface IaCPolicyResult {
  type: 'security.iac.v1';
  timestamp: string;
  status: 'pass' | 'fail' | 'warn';
  violations: IaCViolation[];
  waivers: PolicyWaiver[];
  scannedFiles: string[];
  toolVersion: string;
}

export interface IaCViolation {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  policy: string;
  resource: string;
  file: string;
  line?: number;
  issue: string;
  impact: string;
  recommendation: string;
}

export interface PolicyWaiver {
  violationId: string;
  reason: string;
  owner: string;
  expiresAt: string;
}

// ============================================================================
// CONTAINER HARDENING RESULT
// ============================================================================

export interface ContainerHardeningResult {
  type: 'security.container.v1';
  timestamp: string;
  status: 'pass' | 'fail' | 'warn';
  issues: ContainerIssue[];
  baseImages: BaseImageInfo[];
  hardening: HardeningChecks;
  scannedImages: string[];
  toolVersion: string;
}

export interface ContainerIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  image: string;
  check: string;
  issue: string;
  recommendation: string;
}

export interface BaseImageInfo {
  image: string;
  baseImage: string;
  lastUpdated: string;
  vulnerabilities: number;
  recommendation: string;
}

export interface HardeningChecks {
  runAsNonRoot: boolean;
  readOnlyRootFilesystem: boolean;
  droppedCapabilities: string[];
  addedCapabilities: string[];
  privileged: boolean;
  allowPrivilegeEscalation: boolean;
}

// ============================================================================
// PRIVACY DPIA RESULT
// ============================================================================

export interface PrivacyDPIAResult {
  type: 'security.privacy.v1';
  timestamp: string;
  status: 'pass' | 'fail' | 'warn';
  piiAssets: PIIAsset[];
  risks: PrivacyRisk[];
  controls: PrivacyControl[];
  dataMap: DataFlow[];
  toolVersion: string;
}

export interface PIIAsset {
  id: string;
  type: 'email' | 'name' | 'ssn' | 'phone' | 'address' | 'health' | 'financial' | 'biometric';
  location: string; // Database, file, etc.
  retention: string;
  encryption: boolean;
  consentRequired: boolean;
  dsarReady: boolean; // Data Subject Access Request
}

export interface PrivacyRisk {
  id: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  impact: string;
  mitigation: string;
}

export interface PrivacyControl {
  id: string;
  control: string;
  implemented: boolean;
  evidence: string;
}

export interface DataFlow {
  id: string;
  from: string;
  to: string;
  dataType: string;
  encrypted: boolean;
  purpose: string;
}

// ============================================================================
// THREAT MODEL RESULT
// ============================================================================

export interface ThreatModelResult {
  type: 'security.threatmodel.v1';
  timestamp: string;
  status: 'pass' | 'fail' | 'warn';
  threats: Threat[];
  mitigations: Mitigation[];
  links: ThreatMitigationLink[];
  coverage: number; // 0-1, % of threats with mitigations
  toolVersion: string;
}

export interface Threat {
  id: string;
  category: 'spoofing' | 'tampering' | 'repudiation' | 'information_disclosure' | 'denial_of_service' | 'elevation_of_privilege';
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  likelihood: 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
  component: string;
  attackVector: string;
}

export interface Mitigation {
  id: string;
  title: string;
  description: string;
  implemented: boolean;
  storyId?: string;
  nfrId?: string;
  evidence: string[];
}

export interface ThreatMitigationLink {
  threatId: string;
  mitigationId: string;
  effectiveness: 'complete' | 'partial' | 'none';
}

// ============================================================================
// DAST (RUNTIME SCAN) RESULT
// ============================================================================

export interface DASTScanResult {
  type: 'security.dast.v1';
  timestamp: string;
  status: 'pass' | 'fail' | 'warn';
  findings: DASTFinding[];
  authCoverage: number; // 0-1, % of auth flows tested
  baseUrl: string;
  toolVersion: string;
}

export interface DASTFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  owaspId?: string;
  title: string;
  description: string;
  url: string;
  method: string;
  parameter?: string;
  evidence: string;
  recommendation: string;
  confidence: number; // 0-1
}

// ============================================================================
// SUPPLY CHAIN / PROVENANCE RESULT
// ============================================================================

export interface SupplyChainResult {
  type: 'security.supplychain.v1';
  timestamp: string;
  status: 'pass' | 'fail' | 'warn';
  sbomUri: string;
  sbomFormat: 'cyclonedx' | 'spdx';
  signatures: ArtifactSignature[];
  verifications: SignatureVerification[];
  coverage: number; // 0-1, % of artifacts with SBOM + signatures
  toolVersion: string;
}

export interface ArtifactSignature {
  artifact: string;
  signatureUri: string;
  algorithm: string;
  publicKey: string;
  timestamp: string;
}

export interface SignatureVerification {
  artifact: string;
  verified: boolean;
  error?: string;
  timestamp: string;
}

// ============================================================================
// WAIVER
// ============================================================================

export interface Waiver {
  id: string;
  findingId: string;
  findingType: 'secret' | 'cve' | 'sast' | 'iac' | 'container' | 'dast';
  severity: 'high' | 'medium';
  owner: string;
  expiresAt: string;
  compensatingControl: string;
  justification: string;
  approvedBy: string;
  approvedAt: string;
  status: 'active' | 'expired' | 'revoked';
}

// ============================================================================
// GATE DECISION
// ============================================================================

export interface GateDecision {
  decision: 'pass' | 'fail' | 'escalate';
  overallScore: number; // 0-100
  reasons: string[];
  requiredActions?: string[];
  nextSteps: string[];
  timestamp: string;
}

// ============================================================================
// SECURITY ARTIFACT
// ============================================================================

export interface SecurityArtifact {
  id: string;
  type: 'sbom' | 'signature' | 'scan_report' | 'threat_model' | 'dpia' | 'waiver';
  name: string;
  uri: string;
  contentHash: string;
  sizeBytes: number;
  createdAt: string;
}
