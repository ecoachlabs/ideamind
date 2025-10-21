-- Migration 024: Priority & Quotas
-- Adds priority classes, deliberation scoring, tenant quotas, and quota violations

-- Priority & Preemption
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority_class VARCHAR(10) DEFAULT 'P2';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS preempted BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS preemption_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS preempted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority_class, status);

-- Deliberation Scoring
CREATE TABLE IF NOT EXISTS deliberation_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id VARCHAR(100) NOT NULL REFERENCES tasks(id),
  depth_score DECIMAL(3,2) NOT NULL CHECK (depth_score BETWEEN 0 AND 1),
  coherence_score DECIMAL(3,2) NOT NULL CHECK (coherence_score BETWEEN 0 AND 1),
  relevance_score DECIMAL(3,2) NOT NULL CHECK (relevance_score BETWEEN 0 AND 1),
  overall_score DECIMAL(3,2) NOT NULL CHECK (overall_score BETWEEN 0 AND 1),
  thinking_tokens INTEGER NOT NULL,
  recommendation VARCHAR(20) NOT NULL CHECK (recommendation IN ('pass', 'review', 'fallback')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliberation_task ON deliberation_scores(task_id);
CREATE INDEX IF NOT EXISTS idx_deliberation_score ON deliberation_scores(overall_score);

-- Multi-Tenant Quotas
CREATE TABLE IF NOT EXISTS tenant_quotas (
  tenant_id VARCHAR(100) PRIMARY KEY,
  max_cpu_cores INTEGER NOT NULL DEFAULT 10,
  max_memory_gb INTEGER NOT NULL DEFAULT 32,
  max_storage_gb INTEGER NOT NULL DEFAULT 100,
  max_tokens_per_day INTEGER NOT NULL DEFAULT 1000000,
  max_cost_per_day_usd DECIMAL(10,2) NOT NULL DEFAULT 100.00,
  max_gpus INTEGER NOT NULL DEFAULT 2,
  max_concurrent_runs INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Tenant Usage Tracking
CREATE TABLE IF NOT EXISTS tenant_usage (
  tenant_id VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  amount NUMERIC NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, resource_type, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant_time ON tenant_usage(tenant_id, recorded_at);

-- Quota Violations
CREATE TABLE IF NOT EXISTS quota_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  quota_value NUMERIC NOT NULL,
  actual_value NUMERIC NOT NULL,
  violation_time TIMESTAMP NOT NULL DEFAULT NOW(),
  action_taken VARCHAR(50) NOT NULL CHECK (action_taken IN ('throttle', 'pause', 'alert', 'reject'))
);

CREATE INDEX IF NOT EXISTS idx_violations_tenant ON quota_violations(tenant_id, violation_time);
