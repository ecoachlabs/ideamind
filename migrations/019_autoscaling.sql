-- Autoscaling Tables
-- Enables dynamic worker pool scaling based on load

-- Scaling policies table
CREATE TABLE IF NOT EXISTS scaling_policies (
  policy_id VARCHAR(255) PRIMARY KEY,
  shard_id VARCHAR(255) NOT NULL REFERENCES shards(shard_id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  resource_type VARCHAR(10) NOT NULL, -- 'cpu', 'gpu'

  -- Worker limits
  min_workers INTEGER NOT NULL DEFAULT 1,
  max_workers INTEGER NOT NULL DEFAULT 100,

  -- Scaling triggers
  target_queue_depth INTEGER NOT NULL DEFAULT 10,
  target_cpu_utilization NUMERIC(3,2) NOT NULL DEFAULT 0.70, -- 0.70 = 70%
  target_memory_utilization NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  target_task_latency INTEGER NOT NULL DEFAULT 5000, -- milliseconds

  -- Scaling behavior
  scale_up_increment INTEGER NOT NULL DEFAULT 2,
  scale_down_decrement INTEGER NOT NULL DEFAULT 1,
  scale_up_cooldown INTEGER NOT NULL DEFAULT 60000, -- milliseconds
  scale_down_cooldown INTEGER NOT NULL DEFAULT 300000, -- milliseconds (5 min)

  -- Advanced
  predictive_scaling BOOLEAN NOT NULL DEFAULT false,
  graceful_shutdown BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,

  UNIQUE(shard_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_scaling_policies_shard_id ON scaling_policies(shard_id);
CREATE INDEX IF NOT EXISTS idx_scaling_policies_phase ON scaling_policies(phase);
CREATE INDEX IF NOT EXISTS idx_scaling_policies_created_at ON scaling_policies(created_at);

-- Scaling decisions table (audit log)
CREATE TABLE IF NOT EXISTS scaling_decisions (
  decision_id VARCHAR(255) PRIMARY KEY,
  policy_id VARCHAR(255) NOT NULL REFERENCES scaling_policies(policy_id) ON DELETE CASCADE,
  shard_id VARCHAR(255) NOT NULL,
  phase VARCHAR(50) NOT NULL,
  action VARCHAR(20) NOT NULL, -- 'scale_up', 'scale_down', 'no_change'
  current_workers INTEGER NOT NULL,
  target_workers INTEGER NOT NULL,
  reason TEXT NOT NULL,
  metrics JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'executing', 'completed', 'failed'
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_scaling_decisions_policy_id ON scaling_decisions(policy_id);
CREATE INDEX IF NOT EXISTS idx_scaling_decisions_shard_id ON scaling_decisions(shard_id);
CREATE INDEX IF NOT EXISTS idx_scaling_decisions_action ON scaling_decisions(action);
CREATE INDEX IF NOT EXISTS idx_scaling_decisions_status ON scaling_decisions(status);
CREATE INDEX IF NOT EXISTS idx_scaling_decisions_created_at ON scaling_decisions(created_at);

-- Workers table
CREATE TABLE IF NOT EXISTS workers (
  worker_id VARCHAR(255) PRIMARY KEY,
  shard_id VARCHAR(255) NOT NULL REFERENCES shards(shard_id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'initializing', -- 'initializing', 'idle', 'busy', 'draining', 'terminated'
  resource_type VARCHAR(10) NOT NULL, -- 'cpu', 'gpu'
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_task_at TIMESTAMP,
  terminated_at TIMESTAMP,
  current_task_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_workers_shard_id ON workers(shard_id);
CREATE INDEX IF NOT EXISTS idx_workers_phase ON workers(phase);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_started_at ON workers(started_at);
CREATE INDEX IF NOT EXISTS idx_workers_resource_type ON workers(resource_type);

-- Worker pool metrics table (time-series data)
CREATE TABLE IF NOT EXISTS worker_pool_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shard_id VARCHAR(255) NOT NULL,
  phase VARCHAR(50) NOT NULL,
  current_workers INTEGER NOT NULL,
  idle_workers INTEGER NOT NULL,
  busy_workers INTEGER NOT NULL,
  queue_depth INTEGER NOT NULL,
  cpu_utilization NUMERIC(3,2) NOT NULL,
  memory_utilization NUMERIC(3,2) NOT NULL,
  gpu_utilization NUMERIC(3,2),
  avg_task_latency INTEGER, -- milliseconds
  tasks_processed_per_minute INTEGER,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_pool_metrics_shard_id ON worker_pool_metrics(shard_id);
CREATE INDEX IF NOT EXISTS idx_worker_pool_metrics_phase ON worker_pool_metrics(phase);
CREATE INDEX IF NOT EXISTS idx_worker_pool_metrics_timestamp ON worker_pool_metrics(timestamp);

-- Comments
COMMENT ON TABLE scaling_policies IS 'Autoscaling policies for worker pools (per-shard, per-phase)';
COMMENT ON COLUMN scaling_policies.target_queue_depth IS 'Scale up if queue depth exceeds this threshold';
COMMENT ON COLUMN scaling_policies.target_cpu_utilization IS 'Target CPU utilization (0.0 to 1.0)';
COMMENT ON COLUMN scaling_policies.scale_up_cooldown IS 'Minimum milliseconds between scale-up actions';
COMMENT ON COLUMN scaling_policies.scale_down_cooldown IS 'Minimum milliseconds between scale-down actions';
COMMENT ON COLUMN scaling_policies.predictive_scaling IS 'Enable predictive scaling based on historical patterns';
COMMENT ON COLUMN scaling_policies.graceful_shutdown IS 'Drain workers before termination during scale-down';

COMMENT ON TABLE scaling_decisions IS 'Audit log of all autoscaling decisions';
COMMENT ON COLUMN scaling_decisions.action IS 'Scaling action: scale_up, scale_down, no_change';
COMMENT ON COLUMN scaling_decisions.metrics IS 'Worker pool metrics at decision time (JSON)';

COMMENT ON TABLE workers IS 'Worker instances in each shard/phase pool';
COMMENT ON COLUMN workers.status IS 'Worker status: initializing, idle, busy, draining, terminated';

COMMENT ON TABLE worker_pool_metrics IS 'Time-series metrics for worker pools (used for predictive scaling)';

-- Insert default scaling policies for global shard
INSERT INTO scaling_policies (
  policy_id,
  shard_id,
  phase,
  resource_type,
  min_workers,
  max_workers,
  target_queue_depth,
  target_cpu_utilization,
  target_memory_utilization,
  target_task_latency,
  scale_up_increment,
  scale_down_decrement,
  scale_up_cooldown,
  scale_down_cooldown,
  predictive_scaling,
  graceful_shutdown,
  metadata
) VALUES
  (
    'policy-global-intake',
    'shard-global-default',
    'intake',
    'cpu',
    2,
    10,
    5,
    0.70,
    0.70,
    5000,
    2,
    1,
    60000,
    300000,
    false,
    true,
    '{"default": true}'::jsonb
  ),
  (
    'policy-global-ideation',
    'shard-global-default',
    'ideation',
    'cpu',
    2,
    10,
    5,
    0.70,
    0.70,
    10000,
    2,
    1,
    60000,
    300000,
    false,
    true,
    '{"default": true}'::jsonb
  ),
  (
    'policy-global-build',
    'shard-global-default',
    'build',
    'cpu',
    4,
    20,
    10,
    0.75,
    0.75,
    30000,
    3,
    2,
    60000,
    300000,
    false,
    true,
    '{"default": true}'::jsonb
  ),
  (
    'policy-global-qa',
    'shard-global-default',
    'qa',
    'cpu',
    2,
    15,
    8,
    0.70,
    0.70,
    15000,
    2,
    1,
    60000,
    300000,
    false,
    true,
    '{"default": true}'::jsonb
  )
ON CONFLICT (shard_id, phase) DO NOTHING;
