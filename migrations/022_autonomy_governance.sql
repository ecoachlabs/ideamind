-- Autonomy & Governance System Tables
-- Roadmap v1.0 - M1 (Autonomy Core) + M2 (Governance I)
--
-- M1 Components:
-- - Model Router: LLM routing by skill/cost/policy
-- - Determinism: Seeded execution + CAS cache
-- - Kill-Switch: Runaway detection & pause
--
-- M2 Components:
-- - API Breakage: Breaking change detection
-- - DB Migrator: Migration planning & rollback

-- ============================================================================
-- M1: Model Router
-- ============================================================================

-- Model usage tracking
CREATE TABLE IF NOT EXISTS model_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(255),
  model_id VARCHAR(100) NOT NULL,
  tokens INTEGER NOT NULL,
  cost_usd NUMERIC(10, 4) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_model_usage_tenant ON model_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_model ON model_usage(model_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_timestamp ON model_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_model_usage_run ON model_usage(run_id);

COMMENT ON TABLE model_usage IS 'Tracks model usage and costs for routing decisions';

-- ============================================================================
-- M1: Determinism & CAS
-- ============================================================================

-- CAS cache table
CREATE TABLE IF NOT EXISTS cas_cache (
  digest VARCHAR(64) PRIMARY KEY,
  artifact_uri TEXT NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  size BIGINT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  access_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cas_last_accessed ON cas_cache(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_cas_access_count ON cas_cache(access_count);

COMMENT ON TABLE cas_cache IS 'Content-addressed storage for deterministic caching';

-- Replay cache table
CREATE TABLE IF NOT EXISTS replay_cache (
  replay_hash VARCHAR(64) PRIMARY KEY,
  inputs JSONB NOT NULL,
  seed INTEGER NOT NULL,
  model_id VARCHAR(100),
  output_digest VARCHAR(64) NOT NULL REFERENCES cas_cache(digest) ON DELETE CASCADE,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_replay_timestamp ON replay_cache(timestamp);
CREATE INDEX IF NOT EXISTS idx_replay_model ON replay_cache(model_id);

COMMENT ON TABLE replay_cache IS 'Replay cache for exact-once task execution';

-- ============================================================================
-- M1: Kill-Switch
-- ============================================================================

-- Run snapshots table
CREATE TABLE IF NOT EXISTS run_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase VARCHAR(100) NOT NULL,
  state JSONB NOT NULL,
  paused_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reason JSONB NOT NULL,
  can_resume BOOLEAN DEFAULT false,
  resumed_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_run_snapshots_run_id ON run_snapshots(run_id);
CREATE INDEX IF NOT EXISTS idx_run_snapshots_paused_at ON run_snapshots(paused_at);
CREATE INDEX IF NOT EXISTS idx_run_snapshots_can_resume ON run_snapshots(can_resume);

COMMENT ON TABLE run_snapshots IS 'Snapshots of paused runs for resumption';

-- ============================================================================
-- M2: DB Migrator
-- ============================================================================

-- Schema migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  checksum VARCHAR(32) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
  rolled_back_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied ON schema_migrations(applied_at);

COMMENT ON TABLE schema_migrations IS 'Tracks applied database migrations';

-- ============================================================================
-- Views for Dashboards
-- ============================================================================

-- Model usage dashboard
CREATE OR REPLACE VIEW model_usage_dashboard AS
SELECT
  model_id,
  COUNT(*) as total_calls,
  SUM(tokens) as total_tokens,
  SUM(cost_usd) as total_cost,
  AVG(cost_usd) as avg_cost_per_call,
  MIN(timestamp) as first_used,
  MAX(timestamp) as last_used
FROM model_usage
WHERE timestamp > NOW() - INTERVAL '30 days'
GROUP BY model_id
ORDER BY total_cost DESC;

COMMENT ON VIEW model_usage_dashboard IS 'Model usage statistics (last 30 days)';

-- CAS cache efficiency
CREATE OR REPLACE VIEW cas_cache_stats AS
SELECT
  COUNT(*) as total_entries,
  SUM(size) as total_size_bytes,
  SUM(size) / 1024 / 1024 as total_size_mb,
  AVG(access_count) as avg_access_count,
  COUNT(*) FILTER (WHERE access_count > 1) * 100.0 / COUNT(*) as hit_rate_pct,
  COUNT(*) FILTER (WHERE last_accessed_at < NOW() - INTERVAL '7 days') as stale_entries
FROM cas_cache;

COMMENT ON VIEW cas_cache_stats IS 'CAS cache efficiency metrics';

-- Run pause statistics
CREATE OR REPLACE VIEW run_pause_stats AS
SELECT
  DATE_TRUNC('day', paused_at) as day,
  reason->>'type' as reason_type,
  COUNT(*) as pause_count,
  AVG(EXTRACT(EPOCH FROM (paused_at - runs.created_at))) / 3600 as avg_hours_before_pause,
  COUNT(*) FILTER (WHERE can_resume) as resumable_count
FROM run_snapshots
LEFT JOIN runs ON runs.id = run_snapshots.run_id
WHERE paused_at > NOW() - INTERVAL '30 days'
GROUP BY day, reason_type
ORDER BY day DESC, pause_count DESC;

COMMENT ON VIEW run_pause_stats IS 'Run pause statistics (last 30 days)';

-- Migration history
CREATE OR REPLACE VIEW migration_history AS
SELECT
  id,
  name,
  applied_at,
  rolled_back_at,
  CASE
    WHEN rolled_back_at IS NOT NULL THEN 'rolled_back'
    ELSE 'applied'
  END as status
FROM schema_migrations
ORDER BY applied_at DESC;

COMMENT ON VIEW migration_history IS 'Migration application history';
