/**
 * Compliance Module
 *
 * Roadmap: M7 - Compliance Modes
 *
 * Components:
 * - License Guard: License scanner for OSS compliance
 * - IP Provenance: Track code origin (human vs AI)
 * - Terms Scanner: ToS and policy violation detection
 * - Compliance Frameworks: SOC2, GDPR, HIPAA presets
 */

// License Guard
export {
  LicenseGuard,
  type LicenseInfo,
  type Dependency,
  type LicenseScanResult,
  type LicenseViolation,
  type DependencyLicense,
  type CompliancePolicy,
  LICENSE_GUARD_MIGRATION,
} from './license-guard';

// IP Provenance
export {
  IPProvenanceTool,
  type CodeArtifact,
  type ProvenanceRecord,
  type ProvenanceSource,
  type Attribution,
  type ProvenanceReport,
  type ProvenanceArtifact,
  type IPRiskAssessment,
  type IPRisk,
  type AttributionEntry,
  type WatermarkDetection,
  IP_PROVENANCE_MIGRATION,
} from './ip-provenance';

// Terms Scanner
export {
  TermsScannerGuard,
  type TermsScanResult,
  type TermsViolation,
  type TermsWarning,
  type ViolationType,
  type ViolationCategory,
  type ProhibitedUseCase,
  type ComplianceFramework,
  type ComplianceRequirement,
  TERMS_SCANNER_MIGRATION,
} from './terms-scanner';
