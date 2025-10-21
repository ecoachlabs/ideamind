import { z } from 'zod';

/**
 * Artifact types produced by different phases
 */
export enum ArtifactType {
  // Intake phase
  IDEA_SPEC = 'IDEA_SPEC',
  INTAKE_SUMMARY = 'INTAKE_SUMMARY',

  // Ideation phase
  STRATEGY_DOC = 'STRATEGY_DOC',
  COMPETITIVE_ANALYSIS = 'COMPETITIVE_ANALYSIS',
  TECH_STACK_PROPOSAL = 'TECH_STACK_PROPOSAL',

  // Critique phase
  CRITIQUE_REPORT = 'CRITIQUE_REPORT',
  RISK_ASSESSMENT = 'RISK_ASSESSMENT',

  // PRD phase
  PRD_DOCUMENT = 'PRD_DOCUMENT',
  USER_PERSONAS = 'USER_PERSONAS',
  FEATURE_SPECS = 'FEATURE_SPECS',

  // BizDev phase
  VIABILITY_ANALYSIS = 'VIABILITY_ANALYSIS',
  GO_TO_MARKET_PLAN = 'GO_TO_MARKET_PLAN',
  PRICING_MODEL = 'PRICING_MODEL',

  // Architecture phase
  ARCHITECTURE_DOC = 'ARCHITECTURE_DOC',
  API_SPEC = 'API_SPEC',
  DATA_MODEL = 'DATA_MODEL',
  INFRASTRUCTURE_PLAN = 'INFRASTRUCTURE_PLAN',

  // Build phase
  REPOSITORY_CONFIG = 'REPOSITORY_CONFIG',
  CI_CD_CONFIG = 'CI_CD_CONFIG',
  DEV_ENVIRONMENT = 'DEV_ENVIRONMENT',

  // Story loop phase
  SOURCE_CODE = 'SOURCE_CODE',
  TEST_SUITE = 'TEST_SUITE',
  CODE_REVIEW_REPORT = 'CODE_REVIEW_REPORT',

  // QA phase
  TEST_RESULTS = 'TEST_RESULTS',
  SECURITY_SCAN_REPORT = 'SECURITY_SCAN_REPORT',
  PERFORMANCE_REPORT = 'PERFORMANCE_REPORT',

  // Aesthetic phase
  UI_AUDIT_REPORT = 'UI_AUDIT_REPORT',
  ACCESSIBILITY_REPORT = 'ACCESSIBILITY_REPORT',

  // Release phase
  RELEASE_PACKAGE = 'RELEASE_PACKAGE',
  DEPLOYMENT_CONFIG = 'DEPLOYMENT_CONFIG',
  RELEASE_NOTES = 'RELEASE_NOTES',

  // Beta phase
  BETA_ANALYTICS = 'BETA_ANALYTICS',
  USER_FEEDBACK = 'USER_FEEDBACK',

  // Docs & Growth phase
  DOCUMENTATION = 'DOCUMENTATION',
  MARKETING_CONTENT = 'MARKETING_CONTENT',
}

/**
 * Base artifact metadata
 */
export const ArtifactMetadataSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(ArtifactType),
  workflowRunId: z.string(),
  phase: z.string(),
  createdBy: z.string(), // agentId or userId
  createdAt: z.string().datetime(),
  version: z.number().int().positive(),
  contentHash: z.string(), // SHA-256 hash for content-addressed storage
  storagePath: z.string(), // MinIO/S3 path
  sizeBytes: z.number().int().nonnegative(),
  metadata: z.record(z.unknown()).optional(),
});

export type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>;

/**
 * Artifact reference for linking between phases
 */
export const ArtifactReferenceSchema = z.object({
  artifactId: z.string().uuid(),
  type: z.nativeEnum(ArtifactType),
  version: z.number().int().positive(),
});

export type ArtifactReference = z.infer<typeof ArtifactReferenceSchema>;
