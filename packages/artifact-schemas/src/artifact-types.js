"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArtifactReferenceSchema = exports.ArtifactMetadataSchema = exports.ArtifactType = void 0;
const zod_1 = require("zod");
/**
 * Artifact types produced by different phases
 */
var ArtifactType;
(function (ArtifactType) {
    // Intake phase
    ArtifactType["IDEA_SPEC"] = "IDEA_SPEC";
    ArtifactType["INTAKE_SUMMARY"] = "INTAKE_SUMMARY";
    // Ideation phase
    ArtifactType["STRATEGY_DOC"] = "STRATEGY_DOC";
    ArtifactType["COMPETITIVE_ANALYSIS"] = "COMPETITIVE_ANALYSIS";
    ArtifactType["TECH_STACK_PROPOSAL"] = "TECH_STACK_PROPOSAL";
    // Critique phase
    ArtifactType["CRITIQUE_REPORT"] = "CRITIQUE_REPORT";
    ArtifactType["RISK_ASSESSMENT"] = "RISK_ASSESSMENT";
    // PRD phase
    ArtifactType["PRD_DOCUMENT"] = "PRD_DOCUMENT";
    ArtifactType["USER_PERSONAS"] = "USER_PERSONAS";
    ArtifactType["FEATURE_SPECS"] = "FEATURE_SPECS";
    // BizDev phase
    ArtifactType["VIABILITY_ANALYSIS"] = "VIABILITY_ANALYSIS";
    ArtifactType["GO_TO_MARKET_PLAN"] = "GO_TO_MARKET_PLAN";
    ArtifactType["PRICING_MODEL"] = "PRICING_MODEL";
    // Architecture phase
    ArtifactType["ARCHITECTURE_DOC"] = "ARCHITECTURE_DOC";
    ArtifactType["API_SPEC"] = "API_SPEC";
    ArtifactType["DATA_MODEL"] = "DATA_MODEL";
    ArtifactType["INFRASTRUCTURE_PLAN"] = "INFRASTRUCTURE_PLAN";
    // Build phase
    ArtifactType["REPOSITORY_CONFIG"] = "REPOSITORY_CONFIG";
    ArtifactType["CI_CD_CONFIG"] = "CI_CD_CONFIG";
    ArtifactType["DEV_ENVIRONMENT"] = "DEV_ENVIRONMENT";
    // Story loop phase
    ArtifactType["SOURCE_CODE"] = "SOURCE_CODE";
    ArtifactType["TEST_SUITE"] = "TEST_SUITE";
    ArtifactType["CODE_REVIEW_REPORT"] = "CODE_REVIEW_REPORT";
    // QA phase
    ArtifactType["TEST_RESULTS"] = "TEST_RESULTS";
    ArtifactType["SECURITY_SCAN_REPORT"] = "SECURITY_SCAN_REPORT";
    ArtifactType["PERFORMANCE_REPORT"] = "PERFORMANCE_REPORT";
    // Aesthetic phase
    ArtifactType["UI_AUDIT_REPORT"] = "UI_AUDIT_REPORT";
    ArtifactType["ACCESSIBILITY_REPORT"] = "ACCESSIBILITY_REPORT";
    // Release phase
    ArtifactType["RELEASE_PACKAGE"] = "RELEASE_PACKAGE";
    ArtifactType["DEPLOYMENT_CONFIG"] = "DEPLOYMENT_CONFIG";
    ArtifactType["RELEASE_NOTES"] = "RELEASE_NOTES";
    // Beta phase
    ArtifactType["BETA_ANALYTICS"] = "BETA_ANALYTICS";
    ArtifactType["USER_FEEDBACK"] = "USER_FEEDBACK";
    // Docs & Growth phase
    ArtifactType["DOCUMENTATION"] = "DOCUMENTATION";
    ArtifactType["MARKETING_CONTENT"] = "MARKETING_CONTENT";
})(ArtifactType || (exports.ArtifactType = ArtifactType = {}));
/**
 * Base artifact metadata
 */
exports.ArtifactMetadataSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    type: zod_1.z.nativeEnum(ArtifactType),
    workflowRunId: zod_1.z.string(),
    phase: zod_1.z.string(),
    createdBy: zod_1.z.string(), // agentId or userId
    createdAt: zod_1.z.string().datetime(),
    version: zod_1.z.number().int().positive(),
    contentHash: zod_1.z.string(), // SHA-256 hash for content-addressed storage
    storagePath: zod_1.z.string(), // MinIO/S3 path
    sizeBytes: zod_1.z.number().int().nonnegative(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
/**
 * Artifact reference for linking between phases
 */
exports.ArtifactReferenceSchema = zod_1.z.object({
    artifactId: zod_1.z.string().uuid(),
    type: zod_1.z.nativeEnum(ArtifactType),
    version: zod_1.z.number().int().positive(),
});
//# sourceMappingURL=artifact-types.js.map