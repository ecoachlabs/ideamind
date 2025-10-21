/**
 * Database entity types matching the PostgreSQL schema
 */

export interface WorkflowRunRow {
  id: string;
  state: string;
  idea_spec_id: string;
  user_id: string;
  max_cost_usd: number;
  current_cost_usd: number;
  max_tokens: number;
  current_tokens: number;
  max_retries: number;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
  metadata?: Record<string, any>;
}

export interface PhaseExecutionRow {
  id: number;
  workflow_run_id: string;
  phase_id: string;
  phase_name: string;
  state: string;
  started_at?: Date;
  completed_at?: Date;
  cost_usd: number;
  retry_count: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AgentExecutionRow {
  id: number;
  phase_execution_id: number;
  agent_id: string;
  agent_type: string;
  state: string;
  started_at?: Date;
  completed_at?: Date;
  cost_usd: number;
  tokens_used: number;
  tools_invoked: string[];
  error?: string;
  metadata?: Record<string, any>;
}

export interface ArtifactRow {
  id: string;
  workflow_run_id: string;
  type: string;
  phase: string;
  created_by: string;
  content_hash: string;
  storage_path: string;
  size_bytes: number;
  version: number;
  created_at: Date;
  metadata?: Record<string, any>;
}

export interface GateResultRow {
  id: number;
  workflow_run_id: string;
  gate_id: string;
  gate_name: string;
  phase: string;
  result: 'PASS' | 'FAIL' | 'WARN';
  score?: number;
  human_review_required: boolean;
  evaluated_at: Date;
  evidence?: Record<string, any>;
}

export interface AuditLogRow {
  id: number;
  workflow_run_id: string;
  actor: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  cost_usd?: number;
  timestamp: Date;
  decision?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface EventRow {
  id: number;
  event_id: string;
  event_type: string;
  workflow_run_id: string;
  correlation_id?: string;
  timestamp: Date;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ToolRow {
  id: string;
  version: string;
  name: string;
  description?: string;
  category: string;
  runtime: string;
  docker_image?: string;
  max_memory_mb: number;
  max_cpu_cores: number;
  timeout_seconds: number;
  network_egress: string;
  estimated_cost_usd?: number;
  approval_status: string;
  approved_by?: string;
  approved_at?: Date;
  author: string;
  created_at: Date;
  updated_at: Date;
  input_schema?: Record<string, any>;
  output_schema?: Record<string, any>;
  tags: string[];
  metadata?: Record<string, any>;
}

export interface ToolInvocationRow {
  id: string;
  workflow_run_id: string;
  agent_execution_id?: number;
  tool_id: string;
  tool_version: string;
  started_at: Date;
  completed_at?: Date;
  exit_code?: number;
  cost_usd: number;
  duration_ms?: number;
  success?: boolean;
  error?: string;
}

export interface UserRow {
  id: string;
  email: string;
  name?: string;
  role: string;
  created_at: Date;
  updated_at: Date;
  metadata?: Record<string, any>;
}
