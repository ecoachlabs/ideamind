-- Auto-Doer Factory Tables
-- Tracks dynamically spawned agents, tools, and executors

-- Spawned agents table
CREATE TABLE IF NOT EXISTS spawned_agents (
  agent_id VARCHAR(255) PRIMARY KEY,
  template_id VARCHAR(255) NOT NULL,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  ephemeral BOOLEAN NOT NULL DEFAULT true,
  code_path TEXT NOT NULL,
  inputs_schema JSONB NOT NULL,
  outputs_schema JSONB NOT NULL,
  tools TEXT[] NOT NULL,
  budgets JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  spawned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  destroyed_at TIMESTAMP,
  execution_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spawned_agents_run_id ON spawned_agents(run_id);
CREATE INDEX IF NOT EXISTS idx_spawned_agents_phase ON spawned_agents(phase);
CREATE INDEX IF NOT EXISTS idx_spawned_agents_status ON spawned_agents(status);
CREATE INDEX IF NOT EXISTS idx_spawned_agents_ephemeral ON spawned_agents(ephemeral);

-- Spawned tools table
CREATE TABLE IF NOT EXISTS spawned_tools (
  tool_id VARCHAR(255) PRIMARY KEY,
  template_id VARCHAR(255) NOT NULL,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  ephemeral BOOLEAN NOT NULL DEFAULT true,
  tool_dir TEXT NOT NULL,
  handler_type VARCHAR(20) NOT NULL,
  sandbox VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  spawned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  destroyed_at TIMESTAMP,
  execution_count INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10,4) DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spawned_tools_run_id ON spawned_tools(run_id);
CREATE INDEX IF NOT EXISTS idx_spawned_tools_phase ON spawned_tools(phase);
CREATE INDEX IF NOT EXISTS idx_spawned_tools_status ON spawned_tools(status);
CREATE INDEX IF NOT EXISTS idx_spawned_tools_sandbox ON spawned_tools(sandbox);

-- Spawned executors table
CREATE TABLE IF NOT EXISTS spawned_executors (
  executor_id VARCHAR(255) PRIMARY KEY,
  template_id VARCHAR(255) NOT NULL,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  executor_type VARCHAR(20) NOT NULL,
  task_spec JSONB NOT NULL,
  resources JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  spawned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  destroyed_at TIMESTAMP,
  exit_code INTEGER,
  logs TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spawned_executors_run_id ON spawned_executors(run_id);
CREATE INDEX IF NOT EXISTS idx_spawned_executors_phase ON spawned_executors(phase);
CREATE INDEX IF NOT EXISTS idx_spawned_executors_status ON spawned_executors(status);
CREATE INDEX IF NOT EXISTS idx_spawned_executors_type ON spawned_executors(executor_type);

-- Agent templates table
CREATE TABLE IF NOT EXISTS agent_templates (
  template_id VARCHAR(255) PRIMARY KEY,
  role VARCHAR(255) NOT NULL,
  description TEXT,
  inputs_schema JSONB NOT NULL,
  outputs_schema JSONB NOT NULL,
  tools TEXT[] NOT NULL,
  model VARCHAR(100),
  system_prompt TEXT,
  budgets JSONB NOT NULL,
  builtin BOOLEAN NOT NULL DEFAULT false,
  created_by VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_templates_role ON agent_templates(role);
CREATE INDEX IF NOT EXISTS idx_agent_templates_builtin ON agent_templates(builtin);

-- Tool templates table
CREATE TABLE IF NOT EXISTS tool_templates (
  template_id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version VARCHAR(50) NOT NULL,
  input_schema JSONB NOT NULL,
  output_schema JSONB NOT NULL,
  handler_type VARCHAR(20) NOT NULL,
  handler_code TEXT NOT NULL,
  dependencies TEXT[],
  sandbox VARCHAR(20) NOT NULL,
  builtin BOOLEAN NOT NULL DEFAULT false,
  created_by VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_templates_name ON tool_templates(name);
CREATE INDEX IF NOT EXISTS idx_tool_templates_sandbox ON tool_templates(sandbox);
CREATE INDEX IF NOT EXISTS idx_tool_templates_builtin ON tool_templates(builtin);

-- Executor templates table
CREATE TABLE IF NOT EXISTS executor_templates (
  template_id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  image VARCHAR(255),
  wasm_module VARCHAR(255),
  function_name VARCHAR(255),
  resources JSONB NOT NULL,
  env JSONB,
  builtin BOOLEAN NOT NULL DEFAULT false,
  created_by VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_executor_templates_type ON executor_templates(type);
CREATE INDEX IF NOT EXISTS idx_executor_templates_builtin ON executor_templates(builtin);

-- Comments
COMMENT ON TABLE spawned_agents IS 'Dynamically created agents from templates';
COMMENT ON TABLE spawned_tools IS 'Dynamically created tools from templates';
COMMENT ON TABLE spawned_executors IS 'Dynamically provisioned executors (K8s Jobs, WASM, Lambda)';
COMMENT ON TABLE agent_templates IS 'Templates for spawning agents';
COMMENT ON TABLE tool_templates IS 'Templates for spawning tools';
COMMENT ON TABLE executor_templates IS 'Templates for spawning executors';

COMMENT ON COLUMN spawned_agents.ephemeral IS 'If true, agent will be destroyed after use';
COMMENT ON COLUMN spawned_tools.sandbox IS 'Sandbox type: wasm, docker, native';
COMMENT ON COLUMN spawned_executors.executor_type IS 'Type: k8s-job, wasm, lambda';
