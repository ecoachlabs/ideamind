/**
 * IdeaMine Tools SDK - TypeScript Types
 * Core type definitions for tool infrastructure
 */

import { JSONSchemaType } from 'ajv';

// ============================================================================
// ENUMS
// ============================================================================

export enum ToolRuntime {
  DOCKER = 'docker',
  WASM = 'wasm',
}

export enum ToolStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
  ARCHIVED = 'archived',
}

export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled',
}

export enum ArtifactType {
  INPUT = 'input',
  OUTPUT = 'output',
  LOG = 'log',
  TRACE = 'trace',
  METRIC = 'metric',
}

// ============================================================================
// TOOL CONFIGURATION
// ============================================================================

export interface ToolConfig {
  name: string;
  version: string;
  summary: string;
  owner: string;
  capabilities: string[];
  input_schema: JSONSchemaType<any>;
  output_schema: JSONSchemaType<any>;
  runtime: ToolRuntime;
  image: string;
  entrypoint?: string[];
  timeout_ms?: number;
  cpu?: string;
  memory?: string;
  egress?: {
    allow: string[];
  };
  secrets?: string[];
  license?: string;
  security?: {
    run_as_non_root?: boolean;
    filesystem?: 'read_only' | 'read_write';
    network?: 'restricted' | 'unrestricted';
  };
  guardrails?: {
    grounding_required?: boolean;
    max_tokens?: number;
  };
}

// ============================================================================
// TOOL METADATA
// ============================================================================

export interface Tool {
  id: string;
  name: string;
  owner: string;
  summary: string;
  description?: string;
  license?: string;
  repository_url?: string;
  documentation_url?: string;
  tags: string[];
  verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface ToolVersion {
  id: string;
  tool_id: string;
  version: string;
  status: ToolStatus;
  runtime: ToolRuntime;
  image: string;
  entrypoint: string[];
  timeout_ms: number;
  cpu: string;
  memory: string;
  input_schema: JSONSchemaType<any>;
  output_schema: JSONSchemaType<any>;
  run_as_non_root: boolean;
  filesystem_readonly: boolean;
  network_restricted: boolean;
  egress_allow: string[];
  secrets: string[];
  grounding_required: boolean;
  max_tokens: number;
  sbom?: object;
  signature?: string;
  digest?: string;
  published_at?: string;
  created_at: string;
}

export interface ToolWithVersion extends Tool {
  version_info: ToolVersion;
  capabilities: string[];
}

// ============================================================================
// EXECUTION
// ============================================================================

export interface ExecutionRequest {
  toolId: string;
  version: string;
  input: any;
  runId: string;
  agentId: string;
  phase: string;
  budget?: {
    ms?: number;
    cost_cents?: number;
  };
  context?: {
    trace_id?: string;
    span_id?: string;
  };
}

export interface ExecutionResult {
  id: string;
  ok: boolean;
  output?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  status: ExecutionStatus;
  duration_ms?: number;
  metrics?: ExecutionMetrics;
  artifacts?: Artifact[];
  cached?: boolean;
}

export interface ExecutionMetrics {
  cpu_usage_ms?: number;
  memory_peak_bytes?: number;
  cost_cents?: number;
  exit_code?: number;
}

export interface Execution {
  id: string;
  run_id: string;
  tool_id: string;
  tool_version_id: string;
  tool_name: string;
  tool_version: string;
  agent_id: string;
  phase: string;
  input_hash: string;
  input: any;
  output?: any;
  error?: any;
  status: ExecutionStatus;
  duration_ms?: number;
  cpu_usage_ms?: number;
  memory_peak_bytes?: number;
  container_id?: string;
  exit_code?: number;
  retry_count: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  trace_id?: string;
  span_id?: string;
  cost_cents?: number;
}

// ============================================================================
// ARTIFACTS
// ============================================================================

export interface Artifact {
  id: string;
  execution_id: string;
  type: ArtifactType;
  name: string;
  mime_type?: string;
  size_bytes: number;
  storage_uri: string;
  storage_etag?: string;
  metadata?: Record<string, any>;
  created_at: string;
  expires_at?: string;
}

// ============================================================================
// SEARCH & DISCOVERY
// ============================================================================

export interface ToolSearchRequest {
  query?: string;
  capabilities?: string[];
  tags?: string[];
  runtime?: ToolRuntime;
  limit?: number;
  offset?: number;
}

export interface ToolSearchResult {
  tool_id: string;
  name: string;
  owner: string;
  summary: string;
  version: string;
  runtime: ToolRuntime;
  capabilities: string[];
  tags: string[];
  relevance: number;
}

// ============================================================================
// REGISTRY API
// ============================================================================

export interface PublishRequest {
  config: ToolConfig;
  sbom?: object;
  signature?: string;
  digest?: string;
}

export interface PublishResponse {
  tool_id: string;
  version_id: string;
  name: string;
  version: string;
  status: ToolStatus;
}

export interface DeprecateRequest {
  toolId: string;
  version?: string;
  reason: string;
}

// ============================================================================
// HANDLER PROTOCOL
// ============================================================================

export interface HandlerInput<T = any> {
  input: T;
  context?: {
    run_id?: string;
    agent_id?: string;
    phase?: string;
    trace_id?: string;
  };
}

export interface HandlerOutput<T = any> {
  ok: boolean;
  output?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  artifacts?: {
    name: string;
    type: ArtifactType;
    data?: any;
    uri?: string;
  }[];
}

export type ToolHandler<TInput = any, TOutput = any> = (
  input: TInput,
  context?: HandlerInput['context']
) => Promise<TOutput> | TOutput;

// ============================================================================
// CLIENT OPTIONS
// ============================================================================

export interface ToolClientOptions {
  registryUrl: string;
  runnerUrl: string;
  apiKey?: string;
  timeout?: number;
  retryAttempts?: number;
  logger?: Logger;
  telemetry?: {
    enabled: boolean;
    serviceName?: string;
    endpoint?: string;
  };
}

export interface ToolServerOptions {
  config: ToolConfig;
  handler: ToolHandler;
  logger?: Logger;
  telemetry?: {
    enabled: boolean;
    serviceName?: string;
    endpoint?: string;
  };
}

// ============================================================================
// LOGGING
// ============================================================================

export interface Logger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
}

// ============================================================================
// ERRORS
// ============================================================================

export class ToolError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export class ValidationError extends ToolError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class ExecutionError extends ToolError {
  constructor(message: string, details?: any) {
    super(message, 'EXECUTION_ERROR', details);
    this.name = 'ExecutionError';
  }
}

export class TimeoutError extends ToolError {
  constructor(message: string, details?: any) {
    super(message, 'TIMEOUT_ERROR', details);
    this.name = 'TimeoutError';
  }
}

export class NotFoundError extends ToolError {
  constructor(message: string, details?: any) {
    super(message, 'NOT_FOUND', details);
    this.name = 'NotFoundError';
  }
}

export class AccessDeniedError extends ToolError {
  constructor(message: string, details?: any) {
    super(message, 'ACCESS_DENIED', details);
    this.name = 'AccessDeniedError';
  }
}
