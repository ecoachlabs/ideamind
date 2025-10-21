import { z } from 'zod';
/**
 * Tool runtime environment
 */
export declare enum ToolRuntime {
    DOCKER = "docker",
    WASM = "wasm",
    NATIVE = "native"
}
/**
 * Tool approval status
 */
export declare enum ToolApprovalStatus {
    PENDING = "pending",
    APPROVED = "approved",
    REJECTED = "rejected",
    DEPRECATED = "deprecated"
}
/**
 * Tool category (aligned with readme.txt catalog)
 */
export declare enum ToolCategory {
    SHARED_PLATFORM = "shared-platform",
    INTAKE = "intake",
    IDEATION = "ideation",
    CRITIQUE = "critique",
    PRD = "prd",
    BIZDEV = "bizdev",
    ARCHITECTURE = "architecture",
    BUILD_SETUP = "build-setup",
    CODING = "coding",
    QA = "qa",
    RELEASE = "release",
    BETA = "beta",
    FEEDBACK = "feedback",
    AESTHETIC = "aesthetic",
    SECURITY = "security",
    GROWTH = "growth",
    OBSERVABILITY = "observability"
}
/**
 * Tool metadata schema
 */
export declare const ToolMetadataSchema: any;
export type ToolMetadata = z.infer<typeof ToolMetadataSchema>;
/**
 * Tool invocation request
 */
export declare const ToolInvocationRequestSchema: any;
export type ToolInvocationRequest = z.infer<typeof ToolInvocationRequestSchema>;
/**
 * Tool invocation response
 */
export declare const ToolInvocationResponseSchema: any;
export type ToolInvocationResponse = z.infer<typeof ToolInvocationResponseSchema>;
//# sourceMappingURL=tool-metadata.d.ts.map