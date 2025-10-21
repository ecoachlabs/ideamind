/**
 * IdeaMine Tools SDK - TypeScript Types
 * Core type definitions for Tool Registry, Runner, and execution
 */

// ============================================================================
// TOOL MANIFEST (tool.yaml)
// ============================================================================

export interface ToolManifest {
  name: string; // e.g., "tool.prd.traceMatrix"
  version: string; // SemVer: "1.2.0"
  summary: string;
  owner: string;
  capabilities: string[]; // ["traceability", "prd"]

  // Schemas
  input_schema: JSONSchema | { $ref: string };
  output_schema: JSONSchema | { $ref: string };

  // Runtime
  runtime: 'docker' | 'wasm';
  image?: string; // For Docker: "ghcr.io/ideamine/trace-matrix:1.2.0"
  entrypoint?: string[]; // For Docker: ["python", "/app/main.py"]
  module_path?: string; // For WASM: path to .wasm module

  // Resource limits
  timeout_ms: number; // Default: 60000
  cpu: string; // K8s format: "500m"
  memory: string; // K8s format: "512Mi"

  // Security
  security: {
    run_as_non_root: boolean;
    filesystem: 'read_only' | 'read_write';
    network: 'none' | 'restricted' | 'full';
  };

  // Egress policy
  egress: {
    allow: string[]; // ["s3://artifacts/*", "https://api.example.com"]
  };

  // Secrets (resolved by Vault)
  secrets?: string[]; // ["S3_READ_TOKEN", "API_KEY"]

  // Guardrails
  guardrails: {
    grounding_required: boolean;
    max_tokens: number;
  };

  // Metadata
  license?: string;
  tags?: string[];
}

// ============================================================================
// JSON SCHEMA
// ============================================================================

export interface JSONSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  additionalProperties?: boolean | JSONSchema;
  enum?: any[];
  const?: any;
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;

  // Validation keywords
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

export interface ToolExecutionRequest {
  toolId: string; // "tool.prd.traceMatrix"
  version: string; // "1.2.0"
  input: Record<string, any>;
  runId: string; // IdeaMine run identifier

  // Budget
  budget?: {
    ms?: number; // Max execution time
    cost_usd?: number; // Max cost
  };

  // Context
  agentId?: string;
  phase?: string;

  // Observability
  traceId?: string;
  spanId?: string;

  // Options
  skipCache?: boolean; // Bypass idempotence cache
}

export interface ToolExecutionResponse {
  ok: boolean;
  output?: Record<string, any>;

  // Artifacts (large outputs stored in S3)
  artifacts?: ToolArtifact[];

  // Metrics
  metrics: ToolExecutionMetrics;

  // Error (if ok = false)
  error?: ToolExecutionError;

  // Execution metadata
  executionId: string;
  cached?: boolean; // True if returned from idempotence cache
}

export interface ToolExecutionMetrics {
  duration_ms: number;
  cpu_ms?: number;
  memory_peak_mb?: number;
  cost_usd?: number;
  retry_count: number;

  // Timestamps
  started_at: string; // ISO 8601
  completed_at: string; // ISO 8601
}

export interface ToolExecutionError {
  type: 'validation' | 'timeout' | 'resource_limit' | 'runtime' | 'unknown';
  message: string;
  stack?: string;
  retryable: boolean;
}

export interface ToolArtifact {
  id: string;
  name: string;
  type: 'output' | 'log' | 'trace' | 'metric';
  storage_uri: string; // s3://bucket/key
  mime_type?: string;
  size_bytes: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// TOOL REGISTRY (ARMORY)
// ============================================================================

export interface ToolSearchQuery {
  q?: string; // Text search
  capabilities?: string[]; // Filter by capabilities
  tags?: string[]; // Filter by tags
  runtime?: 'docker' | 'wasm';
  owner?: string;
  limit?: number;
  offset?: number;
}

export interface ToolSearchResult {
  id: string;
  name: string;
  owner: string;
  summary: string;
  version: string; // Latest published version
  runtime: 'docker' | 'wasm';
  capabilities: string[];
  tags: string[];
  published_at: string;
  relevance?: number; // Search relevance score
}

export interface ToolVersionInfo {
  id: string;
  tool_id: string;
  name: string;
  version: string;
  manifest: ToolManifest;
  status: 'draft' | 'published' | 'deprecated' | 'archived';

  // Provenance
  sbom?: SBOM;
  signature?: string;
  digest?: string;

  // Metadata
  published_at?: string;
  deprecated_at?: string;
  deprecation_reason?: string;
  changelog?: string;
  breaking_changes?: string[];
}

export interface SBOM {
  bomFormat: string; // "SPDX" | "CycloneDX"
  specVersion: string;
  components: SBOMComponent[];
  dependencies?: any[];
}

export interface SBOMComponent {
  name: string;
  version: string;
  type: string;
  licenses?: string[];
  purl?: string; // Package URL
}

// ============================================================================
// TOOL ALLOWLISTS (POLICY)
// ============================================================================

export interface ToolAllowlist {
  id: string;
  tool_id: string;

  // Scope
  agent_id?: string;
  phase?: string;
  role?: string;

  // Policy
  policy?: Record<string, any>;
  max_executions_per_hour?: number;
  max_concurrent_executions?: number;

  // Metadata
  created_at: string;
  created_by: string;
  expires_at?: string;
  reason?: string;
}

export interface AccessCheckRequest {
  tool_id: string;
  agent_id?: string;
  phase?: string;
  role?: string;
}

export interface AccessCheckResponse {
  allowed: boolean;
  reason?: string;
  allowlist?: ToolAllowlist;
}

// ============================================================================
// STREAMING LOGS
// ============================================================================

export interface ToolLog {
  execution_id: string;
  stream: 'stdout' | 'stderr';
  line_number: number;
  content: string;
  timestamp: string;
}

export type ToolLogCallback = (log: ToolLog) => void;

// ============================================================================
// TOOL HANDLER (for tool authors)
// ============================================================================

export interface ToolHandlerContext {
  runId: string;
  executionId: string;
  agentId?: string;
  phase?: string;
  traceId?: string;
  spanId?: string;

  // Logger
  logger: ToolLogger;

  // Secrets (injected from Vault)
  secrets: Record<string, string>;
}

export interface ToolLogger {
  debug(message: string, meta?: Record<string, any>): void;
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
}

export type ToolHandler<TInput = any, TOutput = any> = (
  input: TInput,
  context: ToolHandlerContext
) => Promise<TOutput> | TOutput;

// ============================================================================
// IDEMPOTENCE
// ============================================================================

export interface IdempotenceCacheEntry {
  execution_key: string;
  execution_id: string;
  tool_id: string;
  version: string;
  created_at: string;
  expires_at: string;
  hit_count: number;
}

// ============================================================================
// VALUE OF INFORMATION (VoI)
// ============================================================================

export interface ToolVoIScore {
  use: boolean; // Should the tool be invoked?
  benefit: number; // 0-1: Expected value
  cost: number; // 0-1: Normalized cost
  latency: number; // 0-1: Normalized latency impact
  confidence: number; // 0-1: Confidence in the decision
  reason?: string;
}

export interface ToolVoIInput {
  tool: ToolVersionInfo;
  context: {
    budget_remaining_ms?: number;
    budget_remaining_usd?: number;
    phase: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
  };
}

// ============================================================================
// EVENTS
// ============================================================================

export interface ToolEvent {
  type: 'tool.discovered' | 'tool.executed' | 'tool.failed' | 'tool.cached';
  timestamp: string;
  toolId: string;
  version: string;
  executionId?: string;
  runId?: string;
  data?: Record<string, any>;
}

// ============================================================================
// CLIENT CONFIGURATION
// ============================================================================

export interface ToolClientConfig {
  // Service endpoints
  gateway_url: string; // Tool Gateway HTTP/gRPC endpoint
  registry_url?: string; // Tool Registry (Armory) endpoint

  // Authentication
  api_key?: string;
  auth_token?: string;

  // Defaults
  default_timeout_ms?: number;
  default_retry_attempts?: number;

  // Observability
  enable_tracing?: boolean;
  enable_metrics?: boolean;

  // Logging
  logger?: ToolLogger;
}

export interface ToolServerConfig {
  // Tool metadata
  manifest: ToolManifest;

  // Handler
  handler: ToolHandler;

  // Validation
  validate_input?: boolean;
  validate_output?: boolean;

  // Logging
  logger?: ToolLogger;
}

// ============================================================================
// HTTP/GRPC API TYPES
// ============================================================================

export interface PublishToolRequest {
  manifest: ToolManifest;
  signatures?: string[];
  sbom?: SBOM;
  published_by: string;
}

export interface PublishToolResponse {
  tool_id: string;
  version: string;
  status: 'published';
}

export interface DeprecateToolRequest {
  tool_id: string;
  version: string;
  reason: string;
}

export interface DeprecateToolResponse {
  success: boolean;
  deprecated_at: string;
}

// ============================================================================
// RUNNER INTERNAL TYPES
// ============================================================================

export interface SandboxConfig {
  runtime: 'docker' | 'wasm';
  image?: string;
  entrypoint?: string[];
  module_path?: string;

  // Resource limits
  timeout_ms: number;
  cpu: string;
  memory: string;

  // Security
  uid?: number; // For non-root execution
  readonly_fs: boolean;
  network_mode: 'none' | 'restricted' | 'full';
  egress_allow: string[];

  // Environment
  env: Record<string, string>;
  secrets: Record<string, string>;
}

export interface SandboxResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  cpu_ms?: number;
  memory_peak_mb?: number;

  // Errors
  error?: {
    type: 'timeout' | 'oom' | 'runtime' | 'unknown';
    message: string;
  };
}
