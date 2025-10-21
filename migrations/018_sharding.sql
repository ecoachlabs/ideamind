-- Sharding Tables
-- Enables tenant/project partitioning for horizontal scaling

-- Shards table
CREATE TABLE IF NOT EXISTS shards (
  shard_id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL, -- 'tenant', 'project', 'global'
  tenant_id VARCHAR(255),
  project_id VARCHAR(255),
  worker_pools JSONB NOT NULL DEFAULT '{}'::jsonb,
  resources JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'draining', 'offline'
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(name)
);

CREATE INDEX IF NOT EXISTS idx_shards_type ON shards(type);
CREATE INDEX IF NOT EXISTS idx_shards_tenant_id ON shards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shards_project_id ON shards(project_id);
CREATE INDEX IF NOT EXISTS idx_shards_status ON shards(status);
CREATE INDEX IF NOT EXISTS idx_shards_created_at ON shards(created_at);

-- Shard assignments table
CREATE TABLE IF NOT EXISTS shard_assignments (
  run_id UUID PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  tenant_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(255),
  shard_id VARCHAR(255) NOT NULL REFERENCES shards(shard_id) ON DELETE RESTRICT,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  sticky BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_shard_assignments_shard_id ON shard_assignments(shard_id);
CREATE INDEX IF NOT EXISTS idx_shard_assignments_tenant_id ON shard_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shard_assignments_project_id ON shard_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_shard_assignments_assigned_at ON shard_assignments(assigned_at);

-- Shard rebalancing log
CREATE TABLE IF NOT EXISTS shard_rebalancing_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  from_shard_id VARCHAR(255) NOT NULL,
  to_shard_id VARCHAR(255) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL, -- 'started', 'completed', 'failed'
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_shard_rebalancing_log_run_id ON shard_rebalancing_log(run_id);
CREATE INDEX IF NOT EXISTS idx_shard_rebalancing_log_from_shard ON shard_rebalancing_log(from_shard_id);
CREATE INDEX IF NOT EXISTS idx_shard_rebalancing_log_to_shard ON shard_rebalancing_log(to_shard_id);
CREATE INDEX IF NOT EXISTS idx_shard_rebalancing_log_status ON shard_rebalancing_log(status);
CREATE INDEX IF NOT EXISTS idx_shard_rebalancing_log_started_at ON shard_rebalancing_log(started_at);

-- Comments
COMMENT ON TABLE shards IS 'Shards for tenant/project partitioning with consistent hashing';
COMMENT ON COLUMN shards.type IS 'Shard type: tenant (dedicated to one tenant), project (dedicated to one project), global (shared)';
COMMENT ON COLUMN shards.worker_pools IS 'Worker pool configuration per phase: {phase: {minWorkers, maxWorkers, resourceType}}';
COMMENT ON COLUMN shards.resources IS 'Resource limits: {cpuLimit: "4000m", memoryLimit: "16Gi", gpuLimit: 2}';
COMMENT ON COLUMN shards.status IS 'Shard status: active (accepting new runs), draining (no new runs), offline (maintenance)';

COMMENT ON TABLE shard_assignments IS 'Run-to-shard assignments with sticky sessions';
COMMENT ON COLUMN shard_assignments.sticky IS 'If true, run stays on this shard for entire lifecycle';

COMMENT ON TABLE shard_rebalancing_log IS 'Audit trail for shard rebalancing operations';
COMMENT ON COLUMN shard_rebalancing_log.reason IS 'Reason for rebalancing: maintenance, scaling, failure, load_balancing';

-- Insert default global shard
INSERT INTO shards (
  shard_id,
  name,
  type,
  worker_pools,
  resources,
  status,
  metadata
) VALUES (
  'shard-global-default',
  'Default Global Shard',
  'global',
  '{
    "intake": {"minWorkers": 2, "maxWorkers": 10, "currentWorkers": 2, "resourceType": "cpu"},
    "ideation": {"minWorkers": 2, "maxWorkers": 10, "currentWorkers": 2, "resourceType": "cpu"},
    "build": {"minWorkers": 4, "maxWorkers": 20, "currentWorkers": 4, "resourceType": "cpu"},
    "qa": {"minWorkers": 2, "maxWorkers": 15, "currentWorkers": 2, "resourceType": "cpu"}
  }'::jsonb,
  '{
    "cpuLimit": "8000m",
    "memoryLimit": "32Gi"
  }'::jsonb,
  'active',
  '{"default": true, "created_by": "system"}'::jsonb
) ON CONFLICT (shard_id) DO NOTHING;
