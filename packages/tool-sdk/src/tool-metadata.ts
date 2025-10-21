import { z } from 'zod';

/**
 * Tool runtime environment
 */
export enum ToolRuntime {
  DOCKER = 'docker',
  WASM = 'wasm',
  NATIVE = 'native',
}

/**
 * Tool approval status
 */
export enum ToolApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  DEPRECATED = 'deprecated',
}

/**
 * Tool category (aligned with readme.txt catalog)
 */
export enum ToolCategory {
  SHARED_PLATFORM = 'shared-platform',
  INTAKE = 'intake',
  IDEATION = 'ideation',
  CRITIQUE = 'critique',
  PRD = 'prd',
  BIZDEV = 'bizdev',
  ARCHITECTURE = 'architecture',
  BUILD_SETUP = 'build-setup',
  CODING = 'coding',
  QA = 'qa',
  RELEASE = 'release',
  BETA = 'beta',
  FEEDBACK = 'feedback',
  AESTHETIC = 'aesthetic',
  SECURITY = 'security',
  GROWTH = 'growth',
  OBSERVABILITY = 'observability',
}

/**
 * Tool metadata schema
 */
export const ToolMetadataSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.nativeEnum(ToolCategory),
  runtime: z.nativeEnum(ToolRuntime),

  // Docker runtime configuration
  dockerImage: z.string().optional(),

  // Resource limits
  maxMemoryMb: z.number().int().positive().default(512),
  maxCpuCores: z.number().positive().default(1),
  timeoutSeconds: z.number().int().positive().default(300),

  // Network configuration
  networkEgress: z.enum(['none', 'restricted', 'full']).default('none'),
  allowedDomains: z.array(z.string()).optional(),

  // Cost estimation
  estimatedCostUsd: z.number().nonnegative().optional(),
  billingModel: z.enum(['per-invocation', 'per-second', 'per-mb']).optional(),

  // Input/output schemas (Zod schemas serialized as JSON Schema)
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),

  // Approval workflow
  approvalStatus: z.nativeEnum(ToolApprovalStatus).default(ToolApprovalStatus.PENDING),
  approvedBy: z.string().optional(),
  approvedAt: z.string().datetime().optional(),

  // Metadata
  author: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  tags: z.array(z.string()).optional(),
});

export type ToolMetadata = z.infer<typeof ToolMetadataSchema>;

/**
 * Tool invocation request
 */
export const ToolInvocationRequestSchema = z.object({
  toolId: z.string(),
  version: z.string().default('latest'),
  input: z.record(z.unknown()),
  timeout: z.number().int().positive().optional(),
  context: z.object({
    workflowRunId: z.string(),
    agentId: z.string(),
  }),
});

export type ToolInvocationRequest = z.infer<typeof ToolInvocationRequestSchema>;

/**
 * Tool invocation response
 */
export const ToolInvocationResponseSchema = z.object({
  success: z.boolean(),
  output: z.record(z.unknown()),
  costUsd: z.number().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  exitCode: z.number().int().optional(),
  error: z.string().optional(),
  logs: z.string().optional(),
});

export type ToolInvocationResponse = z.infer<typeof ToolInvocationResponseSchema>;
