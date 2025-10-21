-- ============================================================================
-- Migration 024: Priority, Quotas, Deliberation, and Budget Infrastructure
-- ============================================================================
-- Description: Adds support for priority scheduling, multi-tenant quotas,
--              reasoning quality evaluation, and budget-based preemption
-- Author: IdeaMine Phase 1 Implementation
-- Date: 2025-10-21
-- Dependencies: Requires UUID extension and tasks table from previous migrations
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. PRIORITY & PREEMPTION SYSTEM
-- ============================================================================

-- Add priority columns to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS priority_class VARCHAR(10) DEFAULT 'P2'
    CHECK (priority_class IN ('P0', 'P1', 'P2', 'P3')),
  ADD COLUMN IF NOT EXISTS preempted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS preemption_reason TEXT,
  ADD COLUMN IF NOT EXISTS preempted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS preemption_count INTEGER DEFAULT 0;

-- Add comment
COMMENT ON COLUMN tasks.priority_class IS 'Priority class: P0 (critical, never preempt), P1 (high, preempt P2/P3), P2 (normal, default), P3 (low, first to preempt)';
COMMENT ON COLUMN tasks.preempted IS 'Whether this task has been preempted due to resource constraints';
COMMENT ON COLUMN tasks.preemption_count IS 'Number of times this task has been preempted';

-- Create priority queue view
CREATE OR REPLACE VIEW v_priority_queue AS
SELECT
  id,
  priority_class,
  status,
  created_at,
  preempted,
  preemption_count,
  CASE
    WHEN priority_class = 'P0' THEN 1000
    WHEN priority_class = 'P1' THEN 100
    WHEN priority_class = 'P2' THEN 10
    WHEN priority_class = 'P3' THEN 1
    ELSE 5
  END as priority_weight,
  -- Calculate wait time in seconds
  EXTRACT(EPOCH FROM (NOW() - created_at)) as wait_time_seconds
FROM tasks
WHERE status IN ('pending', 'queued', 'preempted')
ORDER BY priority_weight DESC, created_at ASC;

-- Preemption history table
CREATE TABLE IF NOT EXISTS preemption_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id VARCHAR(100) NOT NULL,
  preempted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resumed_at TIMESTAMP,
  reason TEXT NOT NULL,
  resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN ('cpu', 'memory', 'budget', 'gpu', 'quota')),
  resource_threshold DECIMAL(5,2), -- e.g., 0.80 for 80%
  priority_class VARCHAR(10) NOT NULL,
  checkpoint_id VARCHAR(100), -- Link to checkpoint for resumption
  metadata JSONB DEFAULT '{}'::jsonb,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_preemption_task ON preemption_history(task_id);
CREATE INDEX idx_preemption_time ON preemption_history(preempted_at);
CREATE INDEX idx_preemption_resource ON preemption_history(resource_type, preempted_at);

-- ============================================================================
-- 2. DELIBERATION SCORING (Reasoning Quality)
-- ============================================================================

CREATE TABLE IF NOT EXISTS deliberation_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id VARCHAR(100) NOT NULL,
  run_id VARCHAR(100),

  -- Quality scores (0-1 range)
  depth_score DECIMAL(3,2) NOT NULL CHECK (depth_score BETWEEN 0 AND 1),
  coherence_score DECIMAL(3,2) NOT NULL CHECK (coherence_score BETWEEN 0 AND 1),
  relevance_score DECIMAL(3,2) NOT NULL CHECK (relevance_score BETWEEN 0 AND 1),
  overall_score DECIMAL(3,2) NOT NULL CHECK (overall_score BETWEEN 0 AND 1),

  -- Token usage
  thinking_tokens INTEGER NOT NULL CHECK (thinking_tokens >= 0),
  max_tokens_allowed INTEGER NOT NULL DEFAULT 2000,

  -- Recommendation
  recommendation VARCHAR(20) NOT NULL CHECK (recommendation IN ('pass', 'review', 'fallback', 'reject')),

  -- Reasoning breakdown
  reasoning_steps INTEGER DEFAULT 0,
  logical_issues INTEGER DEFAULT 0,
  off_topic_segments INTEGER DEFAULT 0,

  -- Context
  model_used VARCHAR(100),
  evaluated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,

  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_deliberation_task ON deliberation_scores(task_id);
CREATE INDEX idx_deliberation_run ON deliberation_scores(run_id);
CREATE INDEX idx_deliberation_score ON deliberation_scores(overall_score);
CREATE INDEX idx_deliberation_recommendation ON deliberation_scores(recommendation);
CREATE INDEX idx_deliberation_time ON deliberation_scores(evaluated_at);

-- View for low-quality reasoning
CREATE OR REPLACE VIEW v_low_quality_reasoning AS
SELECT
  ds.*,
  t.status as task_status,
  t.priority_class
FROM deliberation_scores ds
JOIN tasks t ON ds.task_id = t.id
WHERE ds.overall_score < 0.6
  OR ds.recommendation IN ('fallback', 'reject')
ORDER BY ds.evaluated_at DESC;

-- ============================================================================
-- 3. MULTI-TENANT QUOTAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_quotas (
  tenant_id VARCHAR(100) PRIMARY KEY,

  -- Resource quotas
  max_cpu_cores INTEGER NOT NULL DEFAULT 10,
  max_memory_gb INTEGER NOT NULL DEFAULT 32,
  max_storage_gb INTEGER NOT NULL DEFAULT 100,
  max_tokens_per_day INTEGER NOT NULL DEFAULT 1000000,
  max_cost_per_day_usd DECIMAL(10,2) NOT NULL DEFAULT 100.00,
  max_gpus INTEGER NOT NULL DEFAULT 2,
  max_concurrent_runs INTEGER NOT NULL DEFAULT 5,

  -- Burst allowance (temporary overage)
  burst_cpu_cores INTEGER DEFAULT 0,
  burst_memory_gb INTEGER DEFAULT 0,
  burst_duration_minutes INTEGER DEFAULT 60,

  -- Throttling settings
  throttle_enabled BOOLEAN DEFAULT true,
  throttle_threshold DECIMAL(3,2) DEFAULT 0.90 CHECK (throttle_threshold BETWEEN 0 AND 1),

  -- Metadata
  tier VARCHAR(50) DEFAULT 'standard', -- free, standard, premium, enterprise
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Tenant usage tracking (time-series data)
CREATE TABLE IF NOT EXISTS tenant_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN ('cpu', 'memory', 'storage', 'tokens', 'cost', 'gpu', 'concurrent_runs')),
  amount NUMERIC NOT NULL,
  unit VARCHAR(20) NOT NULL, -- cores, GB, tokens, USD, count
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  run_id VARCHAR(100),
  task_id VARCHAR(100),
  metadata JSONB DEFAULT '{}'::jsonb,

  FOREIGN KEY (tenant_id) REFERENCES tenant_quotas(tenant_id) ON DELETE CASCADE
);

CREATE INDEX idx_usage_tenant_time ON tenant_usage(tenant_id, recorded_at);
CREATE INDEX idx_usage_tenant_resource ON tenant_usage(tenant_id, resource_type, recorded_at);
CREATE INDEX idx_usage_resource_time ON tenant_usage(resource_type, recorded_at);

-- Quota violations log
CREATE TABLE IF NOT EXISTS quota_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  quota_value NUMERIC NOT NULL,
  actual_value NUMERIC NOT NULL,
  overage_amount NUMERIC NOT NULL,
  overage_percent DECIMAL(5,2) NOT NULL,

  -- Action taken
  action_taken VARCHAR(50) NOT NULL CHECK (action_taken IN ('throttle', 'pause', 'alert', 'reject', 'burst_allowed')),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Context
  violation_time TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,
  run_id VARCHAR(100),
  task_id VARCHAR(100),
  metadata JSONB DEFAULT '{}'::jsonb,

  FOREIGN KEY (tenant_id) REFERENCES tenant_quotas(tenant_id) ON DELETE CASCADE
);

CREATE INDEX idx_violations_tenant ON quota_violations(tenant_id, violation_time);
CREATE INDEX idx_violations_resource ON quota_violations(resource_type, violation_time);
CREATE INDEX idx_violations_severity ON quota_violations(severity, violation_time);
CREATE INDEX idx_violations_unresolved ON quota_violations(resolved_at) WHERE resolved_at IS NULL;

-- Current tenant usage aggregation view
CREATE OR REPLACE VIEW v_tenant_usage_current AS
SELECT
  tq.tenant_id,
  tq.tier,

  -- CPU usage
  COALESCE(SUM(CASE WHEN tu.resource_type = 'cpu' AND tu.recorded_at > NOW() - INTERVAL '1 hour' THEN tu.amount ELSE 0 END), 0) as cpu_used,
  tq.max_cpu_cores as cpu_quota,
  ROUND(COALESCE(SUM(CASE WHEN tu.resource_type = 'cpu' AND tu.recorded_at > NOW() - INTERVAL '1 hour' THEN tu.amount ELSE 0 END), 0) / NULLIF(tq.max_cpu_cores, 0) * 100, 2) as cpu_percent,

  -- Memory usage
  COALESCE(SUM(CASE WHEN tu.resource_type = 'memory' AND tu.recorded_at > NOW() - INTERVAL '1 hour' THEN tu.amount ELSE 0 END), 0) as memory_used_gb,
  tq.max_memory_gb as memory_quota_gb,
  ROUND(COALESCE(SUM(CASE WHEN tu.resource_type = 'memory' AND tu.recorded_at > NOW() - INTERVAL '1 hour' THEN tu.amount ELSE 0 END), 0) / NULLIF(tq.max_memory_gb, 0) * 100, 2) as memory_percent,

  -- Storage usage
  COALESCE(SUM(CASE WHEN tu.resource_type = 'storage' THEN tu.amount ELSE 0 END), 0) as storage_used_gb,
  tq.max_storage_gb as storage_quota_gb,
  ROUND(COALESCE(SUM(CASE WHEN tu.resource_type = 'storage' THEN tu.amount ELSE 0 END), 0) / NULLIF(tq.max_storage_gb, 0) * 100, 2) as storage_percent,

  -- Tokens (daily)
  COALESCE(SUM(CASE WHEN tu.resource_type = 'tokens' AND tu.recorded_at > NOW() - INTERVAL '1 day' THEN tu.amount ELSE 0 END), 0) as tokens_used_today,
  tq.max_tokens_per_day as tokens_quota_per_day,
  ROUND(COALESCE(SUM(CASE WHEN tu.resource_type = 'tokens' AND tu.recorded_at > NOW() - INTERVAL '1 day' THEN tu.amount ELSE 0 END), 0) / NULLIF(tq.max_tokens_per_day, 0) * 100, 2) as tokens_percent,

  -- Cost (daily)
  COALESCE(SUM(CASE WHEN tu.resource_type = 'cost' AND tu.recorded_at > NOW() - INTERVAL '1 day' THEN tu.amount ELSE 0 END), 0) as cost_spent_today_usd,
  tq.max_cost_per_day_usd as cost_quota_per_day_usd,
  ROUND(COALESCE(SUM(CASE WHEN tu.resource_type = 'cost' AND tu.recorded_at > NOW() - INTERVAL '1 day' THEN tu.amount ELSE 0 END), 0) / NULLIF(tq.max_cost_per_day_usd, 0) * 100, 2) as cost_percent,

  -- GPU usage
  COALESCE(SUM(CASE WHEN tu.resource_type = 'gpu' AND tu.recorded_at > NOW() - INTERVAL '1 hour' THEN tu.amount ELSE 0 END), 0) as gpus_used,
  tq.max_gpus as gpus_quota,
  ROUND(COALESCE(SUM(CASE WHEN tu.resource_type = 'gpu' AND tu.recorded_at > NOW() - INTERVAL '1 hour' THEN tu.amount ELSE 0 END), 0) / NULLIF(tq.max_gpus, 0) * 100, 2) as gpu_percent,

  -- Concurrent runs
  COALESCE(SUM(CASE WHEN tu.resource_type = 'concurrent_runs' AND tu.recorded_at > NOW() - INTERVAL '5 minutes' THEN tu.amount ELSE 0 END), 0) as concurrent_runs_active,
  tq.max_concurrent_runs as concurrent_runs_quota,
  ROUND(COALESCE(SUM(CASE WHEN tu.resource_type = 'concurrent_runs' AND tu.recorded_at > NOW() - INTERVAL '5 minutes' THEN tu.amount ELSE 0 END), 0) / NULLIF(tq.max_concurrent_runs, 0) * 100, 2) as concurrent_runs_percent,

  -- Throttling status
  tq.throttle_enabled,
  tq.throttle_threshold,
  CASE
    WHEN tq.throttle_enabled AND (
      COALESCE(SUM(CASE WHEN tu.resource_type = 'cpu' AND tu.recorded_at > NOW() - INTERVAL '1 hour' THEN tu.amount ELSE 0 END), 0) / NULLIF(tq.max_cpu_cores, 0) >= tq.throttle_threshold
      OR COALESCE(SUM(CASE WHEN tu.resource_type = 'memory' AND tu.recorded_at > NOW() - INTERVAL '1 hour' THEN tu.amount ELSE 0 END), 0) / NULLIF(tq.max_memory_gb, 0) >= tq.throttle_threshold
      OR COALESCE(SUM(CASE WHEN tu.resource_type = 'cost' AND tu.recorded_at > NOW() - INTERVAL '1 day' THEN tu.amount ELSE 0 END), 0) / NULLIF(tq.max_cost_per_day_usd, 0) >= tq.throttle_threshold
    ) THEN true
    ELSE false
  END as should_throttle

FROM tenant_quotas tq
LEFT JOIN tenant_usage tu ON tq.tenant_id = tu.tenant_id
GROUP BY tq.tenant_id, tq.tier, tq.max_cpu_cores, tq.max_memory_gb, tq.max_storage_gb,
         tq.max_tokens_per_day, tq.max_cost_per_day_usd, tq.max_gpus, tq.max_concurrent_runs,
         tq.throttle_enabled, tq.throttle_threshold;

-- ============================================================================
-- 4. BUDGET GUARD & ENFORCEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS budget_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id VARCHAR(100) NOT NULL,
  tenant_id VARCHAR(100),

  -- Budget tracking
  budget_total DECIMAL(10,2) NOT NULL,
  budget_spent DECIMAL(10,2) NOT NULL,
  budget_remaining DECIMAL(10,2) NOT NULL,
  budget_percent_used DECIMAL(5,2) NOT NULL,

  -- Event details
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('warn', 'throttle', 'pause', 'resume', 'preempt')),
  threshold_type VARCHAR(20) NOT NULL CHECK (threshold_type IN ('warn', 'throttle', 'pause')),
  threshold_percent DECIMAL(5,2) NOT NULL,

  -- Actions taken
  action_taken VARCHAR(100) NOT NULL,
  tasks_affected JSONB DEFAULT '[]'::jsonb, -- Array of task IDs
  priority_classes_preempted JSONB DEFAULT '[]'::jsonb, -- e.g., ['P3'] or ['P2', 'P3']

  -- Context
  triggered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_budget_run ON budget_events(run_id, triggered_at);
CREATE INDEX idx_budget_tenant ON budget_events(tenant_id, triggered_at);
CREATE INDEX idx_budget_type ON budget_events(event_type, triggered_at);
CREATE INDEX idx_budget_unresolved ON budget_events(resolved_at) WHERE resolved_at IS NULL;

-- Budget status view
CREATE OR REPLACE VIEW v_budget_status AS
SELECT
  run_id,
  tenant_id,
  budget_total,
  budget_spent,
  budget_remaining,
  budget_percent_used,
  CASE
    WHEN budget_percent_used >= 95 THEN 'critical'
    WHEN budget_percent_used >= 80 THEN 'warning'
    WHEN budget_percent_used >= 50 THEN 'caution'
    ELSE 'healthy'
  END as status,
  MAX(triggered_at) as last_event_time,
  COUNT(*) FILTER (WHERE event_type = 'preempt') as preemption_count,
  COUNT(*) FILTER (WHERE event_type = 'pause') as pause_count
FROM budget_events
GROUP BY run_id, tenant_id, budget_total, budget_spent, budget_remaining, budget_percent_used
ORDER BY budget_percent_used DESC;

-- ============================================================================
-- 5. PRIORITY INDEXES
-- ============================================================================

-- Composite indexes for priority scheduling
CREATE INDEX IF NOT EXISTS idx_tasks_priority_status ON tasks(priority_class, status, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_preempted ON tasks(preempted, priority_class) WHERE preempted = true;

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function to get preemption candidates
CREATE OR REPLACE FUNCTION get_preemption_candidates(
  resource_type_param VARCHAR,
  threshold_percent_param DECIMAL,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  task_id VARCHAR,
  priority_class VARCHAR,
  status VARCHAR,
  wait_time_seconds NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.priority_class,
    t.status,
    EXTRACT(EPOCH FROM (NOW() - t.created_at)) as wait_time_seconds
  FROM tasks t
  WHERE t.status IN ('running', 'queued')
    AND t.priority_class IN ('P3', 'P2') -- P0 and P1 never preempted
    AND t.preempted = false
  ORDER BY
    CASE t.priority_class
      WHEN 'P3' THEN 1  -- Preempt P3 first
      WHEN 'P2' THEN 2
      ELSE 99
    END ASC,
    t.created_at DESC -- Preempt newest tasks first (haven't invested much time yet)
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old usage records (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_usage_records(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM tenant_usage
  WHERE recorded_at < NOW() - (retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate tenant health score (0-100)
CREATE OR REPLACE FUNCTION calculate_tenant_health(tenant_id_param VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  health_score INTEGER := 100;
  usage_record RECORD;
BEGIN
  SELECT * INTO usage_record FROM v_tenant_usage_current WHERE tenant_id = tenant_id_param;

  IF NOT FOUND THEN
    RETURN 100; -- No usage, healthy
  END IF;

  -- Deduct points for high usage
  IF usage_record.cpu_percent > 90 THEN health_score := health_score - 20;
  ELSIF usage_record.cpu_percent > 75 THEN health_score := health_score - 10;
  END IF;

  IF usage_record.memory_percent > 90 THEN health_score := health_score - 20;
  ELSIF usage_record.memory_percent > 75 THEN health_score := health_score - 10;
  END IF;

  IF usage_record.cost_percent > 95 THEN health_score := health_score - 30;
  ELSIF usage_record.cost_percent > 80 THEN health_score := health_score - 15;
  END IF;

  -- Deduct points for recent violations
  health_score := health_score - (
    SELECT COUNT(*) * 5
    FROM quota_violations
    WHERE tenant_id = tenant_id_param
      AND violation_time > NOW() - INTERVAL '1 hour'
      AND resolved_at IS NULL
  );

  -- Ensure minimum 0
  IF health_score < 0 THEN
    health_score := 0;
  END IF;

  RETURN health_score;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

-- Auto-update tenant_quotas.updated_at
CREATE OR REPLACE FUNCTION update_tenant_quotas_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_tenant_quotas_timestamp
BEFORE UPDATE ON tenant_quotas
FOR EACH ROW
EXECUTE FUNCTION update_tenant_quotas_timestamp();

-- ============================================================================
-- 8. DEFAULT DATA
-- ============================================================================

-- Insert default tenant for testing (can be removed in production)
INSERT INTO tenant_quotas (tenant_id, tier, max_cpu_cores, max_memory_gb, max_storage_gb, max_tokens_per_day, max_cost_per_day_usd, max_gpus, max_concurrent_runs)
VALUES ('default-tenant', 'standard', 10, 32, 100, 1000000, 100.00, 2, 5)
ON CONFLICT (tenant_id) DO NOTHING;

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================

COMMENT ON TABLE preemption_history IS 'Tracks all task preemptions for resource management and analytics';
COMMENT ON TABLE deliberation_scores IS 'Evaluates Chain-of-Thought reasoning quality to prevent low-quality outputs';
COMMENT ON TABLE tenant_quotas IS 'Resource quotas per tenant for multi-tenant isolation and fairness';
COMMENT ON TABLE tenant_usage IS 'Time-series usage tracking for quota enforcement and billing';
COMMENT ON TABLE quota_violations IS 'Log of quota violations and enforcement actions';
COMMENT ON TABLE budget_events IS 'Budget threshold events and preemption triggers';

COMMENT ON VIEW v_priority_queue IS 'Priority-ordered queue of pending/preempted tasks';
COMMENT ON VIEW v_low_quality_reasoning IS 'Tasks with low deliberation scores requiring review';
COMMENT ON VIEW v_tenant_usage_current IS 'Real-time tenant resource usage aggregation';
COMMENT ON VIEW v_budget_status IS 'Budget status per run with alerting thresholds';

COMMENT ON FUNCTION get_preemption_candidates IS 'Returns tasks eligible for preemption based on priority and resource usage';
COMMENT ON FUNCTION cleanup_old_usage_records IS 'Removes usage records older than retention period';
COMMENT ON FUNCTION calculate_tenant_health IS 'Calculates tenant health score (0-100) based on usage and violations';

-- ============================================================================
-- END OF MIGRATION 024
-- ============================================================================
