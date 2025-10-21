-- IdeaMine Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workflow runs table
CREATE TABLE workflow_runs (
    id VARCHAR(255) PRIMARY KEY,
    state VARCHAR(50) NOT NULL,
    idea_spec_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    max_cost_usd DECIMAL(10,2) NOT NULL,
    current_cost_usd DECIMAL(10,2) DEFAULT 0,
    max_tokens INTEGER NOT NULL,
    current_tokens INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_workflow_runs_state ON workflow_runs(state);
CREATE INDEX idx_workflow_runs_user_id ON workflow_runs(user_id);
CREATE INDEX idx_workflow_runs_created_at ON workflow_runs(created_at DESC);

-- Phase executions table
CREATE TABLE phase_executions (
    id SERIAL PRIMARY KEY,
    workflow_run_id VARCHAR(255) NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    phase_id VARCHAR(100) NOT NULL,
    phase_name VARCHAR(255) NOT NULL,
    state VARCHAR(50) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cost_usd DECIMAL(10,4) DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    error TEXT,
    metadata JSONB
);

CREATE INDEX idx_phase_executions_workflow_run_id ON phase_executions(workflow_run_id);
CREATE INDEX idx_phase_executions_state ON phase_executions(state);

-- Agent executions table
CREATE TABLE agent_executions (
    id SERIAL PRIMARY KEY,
    phase_execution_id INTEGER NOT NULL REFERENCES phase_executions(id) ON DELETE CASCADE,
    agent_id VARCHAR(255) NOT NULL,
    agent_type VARCHAR(100) NOT NULL,
    state VARCHAR(50) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cost_usd DECIMAL(10,4) DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    tools_invoked TEXT[],
    error TEXT,
    metadata JSONB
);

CREATE INDEX idx_agent_executions_phase_execution_id ON agent_executions(phase_execution_id);
CREATE INDEX idx_agent_executions_agent_id ON agent_executions(agent_id);

-- Artifacts table (metadata, actual content in MinIO)
CREATE TABLE artifacts (
    id VARCHAR(255) PRIMARY KEY,
    workflow_run_id VARCHAR(255) NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    phase VARCHAR(100) NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    storage_path TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_artifacts_workflow_run_id ON artifacts(workflow_run_id);
CREATE INDEX idx_artifacts_type ON artifacts(type);
CREATE INDEX idx_artifacts_content_hash ON artifacts(content_hash);

-- Gate results table
CREATE TABLE gate_results (
    id SERIAL PRIMARY KEY,
    workflow_run_id VARCHAR(255) NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    gate_id VARCHAR(255) NOT NULL,
    gate_name VARCHAR(255) NOT NULL,
    phase VARCHAR(100) NOT NULL,
    result VARCHAR(20) NOT NULL,
    score DECIMAL(5,2),
    human_review_required BOOLEAN DEFAULT FALSE,
    evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    evidence JSONB
);

CREATE INDEX idx_gate_results_workflow_run_id ON gate_results(workflow_run_id);
CREATE INDEX idx_gate_results_result ON gate_results(result);

-- Tools registry table
CREATE TABLE tools (
    id VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    runtime VARCHAR(50) NOT NULL,
    docker_image VARCHAR(255),
    max_memory_mb INTEGER DEFAULT 512,
    max_cpu_cores DECIMAL(3,1) DEFAULT 1,
    timeout_seconds INTEGER DEFAULT 300,
    network_egress VARCHAR(50) DEFAULT 'none',
    estimated_cost_usd DECIMAL(10,4),
    approval_status VARCHAR(50) DEFAULT 'pending',
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    author VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    input_schema JSONB,
    output_schema JSONB,
    tags TEXT[],
    metadata JSONB,
    PRIMARY KEY (id, version)
);

CREATE INDEX idx_tools_approval_status ON tools(approval_status);
CREATE INDEX idx_tools_category ON tools(category);
CREATE INDEX idx_tools_tags ON tools USING GIN(tags);

-- Tool invocations table
CREATE TABLE tool_invocations (
    id VARCHAR(255) PRIMARY KEY,
    workflow_run_id VARCHAR(255) NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    agent_execution_id INTEGER REFERENCES agent_executions(id) ON DELETE CASCADE,
    tool_id VARCHAR(255) NOT NULL,
    tool_version VARCHAR(50) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    exit_code INTEGER,
    cost_usd DECIMAL(10,4) DEFAULT 0,
    duration_ms INTEGER,
    success BOOLEAN,
    error TEXT,
    FOREIGN KEY (tool_id, tool_version) REFERENCES tools(id, version)
);

CREATE INDEX idx_tool_invocations_workflow_run_id ON tool_invocations(workflow_run_id);
CREATE INDEX idx_tool_invocations_tool_id ON tool_invocations(tool_id, tool_version);

-- Audit log table
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    workflow_run_id VARCHAR(255) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    cost_usd DECIMAL(10,4),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    decision JSONB,
    metadata JSONB
);

CREATE INDEX idx_audit_log_workflow_run_id ON audit_log(workflow_run_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_actor ON audit_log(actor);

-- Events table (for event sourcing)
CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    workflow_run_id VARCHAR(255) NOT NULL,
    correlation_id VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    payload JSONB NOT NULL,
    metadata JSONB
);

CREATE INDEX idx_events_workflow_run_id ON events(workflow_run_id);
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);

-- Users table (for auth and access control)
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_users_email ON users(email);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_workflow_runs_updated_at BEFORE UPDATE ON workflow_runs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tools_updated_at BEFORE UPDATE ON tools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
