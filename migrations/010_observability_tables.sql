-- Migration 010: Observability Layer Tables
-- Creates tables for Run Ledger and Metrics Collection
-- Spec: UNIFIED_IMPLEMENTATION_SPEC_PART2.md Section 5 (Observability Layer)

-- ============================================================================
-- LEDGER TABLE (Immutable Append-Only Log)
-- ============================================================================
-- Captures all tasks, gates, decisions, artifacts, costs, signatures
-- Provides complete audit trail and provenance for entire run

CREATE TABLE IF NOT EXISTS ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Entry type
  type VARCHAR(20) NOT NULL CHECK (type IN ('task', 'gate', 'decision', 'artifact', 'cost', 'signature')),

  -- Entry data (JSON)
  data JSONB NOT NULL,

  -- Provenance tracking
  provenance JSONB NOT NULL  -- { who, when, tool_version, inputs }
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ledger_run_id ON ledger(run_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger(type);
CREATE INDEX IF NOT EXISTS idx_ledger_timestamp ON ledger(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_run_type ON ledger(run_id, type);

-- ============================================================================
-- PHASE METRICS TABLE
-- ============================================================================
-- Stores structured metrics for each phase execution
-- Enables performance analysis, cost tracking, and quality monitoring

CREATE TABLE IF NOT EXISTS phase_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  phase VARCHAR(50) NOT NULL,

  -- Metrics data (PhaseMetrics object)
  data JSONB NOT NULL,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for querying and aggregation
CREATE INDEX IF NOT EXISTS idx_phase_metrics_run_id ON phase_metrics(run_id);
CREATE INDEX IF NOT EXISTS idx_phase_metrics_phase ON phase_metrics(phase);
CREATE INDEX IF NOT EXISTS idx_phase_metrics_created_at ON phase_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase_metrics_run_phase ON phase_metrics(run_id, phase);

-- Index for cost queries
CREATE INDEX IF NOT EXISTS idx_phase_metrics_cost ON phase_metrics ((data->>'cost_usd'));

-- Index for duration queries
CREATE INDEX IF NOT EXISTS idx_phase_metrics_duration ON phase_metrics ((data->>'duration_ms'));

-- ============================================================================
-- VIEWS FOR MONITORING & ANALYSIS
-- ============================================================================

-- Run timeline view
CREATE OR REPLACE VIEW run_timeline AS
SELECT
  l.run_id,
  l.timestamp,
  l.type,
  l.data,
  l.provenance
FROM ledger l
ORDER BY l.run_id, l.timestamp ASC;

-- Phase performance view
CREATE OR REPLACE VIEW phase_performance AS
SELECT
  phase,
  COUNT(*) as execution_count,
  AVG((data->>'duration_ms')::int) as avg_duration_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (data->>'duration_ms')::int) as median_duration_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (data->>'duration_ms')::int) as p95_duration_ms,
  AVG((data->>'cost_usd')::float) as avg_cost_usd,
  SUM((data->>'cost_usd')::float) as total_cost_usd,
  COUNT(CASE WHEN (data->>'gate_pass')::boolean = true THEN 1 END)::float / COUNT(*) as success_rate
FROM phase_metrics
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY phase;

-- Cost by phase view
CREATE OR REPLACE VIEW cost_by_phase AS
SELECT
  pm.run_id,
  pm.phase,
  (pm.data->>'cost_usd')::float as cost_usd,
  (pm.data->>'tokens_used')::int as tokens_used,
  (pm.data->>'tools_minutes_used')::float as tools_minutes_used,
  pm.created_at
FROM phase_metrics pm
ORDER BY pm.created_at DESC;

-- Gate success metrics view
CREATE OR REPLACE VIEW gate_success_metrics AS
SELECT
  phase,
  COUNT(*) as total_evaluations,
  COUNT(CASE WHEN (data->>'gate_pass')::boolean = true THEN 1 END) as passes,
  COUNT(CASE WHEN (data->>'gate_pass')::boolean = false THEN 1 END) as failures,
  AVG((data->>'gate_score')::float) as avg_gate_score,
  AVG((data->>'gate_retries')::int) as avg_retries
FROM phase_metrics
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY phase;

-- Recent run summary view
CREATE OR REPLACE VIEW recent_run_summary AS
SELECT
  pm.run_id,
  MIN(pm.created_at) as started_at,
  MAX(pm.created_at) as completed_at,
  COUNT(DISTINCT pm.phase) as phases_completed,
  SUM((pm.data->>'duration_ms')::int) as total_duration_ms,
  SUM((pm.data->>'cost_usd')::float) as total_cost_usd,
  SUM((pm.data->>'tokens_used')::int) as total_tokens,
  COUNT(CASE WHEN (pm.data->>'gate_pass')::boolean = true THEN 1 END)::float /
    COUNT(*) as gate_pass_rate
FROM phase_metrics pm
GROUP BY pm.run_id
ORDER BY MIN(pm.created_at) DESC
LIMIT 100;

-- ============================================================================
-- FUNCTIONS FOR ANALYSIS
-- ============================================================================

-- Get cost breakdown for run
CREATE OR REPLACE FUNCTION get_cost_breakdown(p_run_id UUID)
RETURNS TABLE (
  phase VARCHAR(50),
  cost_usd NUMERIC,
  tokens_used INTEGER,
  tools_minutes_used NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (data->>'phase')::VARCHAR(50) as phase,
    (data->>'cost_usd')::NUMERIC as cost_usd,
    (data->>'tokens_used')::INTEGER as tokens_used,
    (data->>'tools_minutes_used')::NUMERIC as tools_minutes_used
  FROM ledger
  WHERE run_id = p_run_id
    AND type = 'cost'
  ORDER BY timestamp ASC;
END;
$$ LANGUAGE plpgsql;

-- Get gate evaluation history
CREATE OR REPLACE FUNCTION get_gate_history(p_run_id UUID)
RETURNS TABLE (
  phase VARCHAR(50),
  pass BOOLEAN,
  score NUMERIC,
  timestamp TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (data->>'phase')::VARCHAR(50) as phase,
    (data->>'pass')::BOOLEAN as pass,
    (data->>'score')::NUMERIC as score,
    timestamp
  FROM ledger
  WHERE run_id = p_run_id
    AND type = 'gate'
  ORDER BY timestamp ASC;
END;
$$ LANGUAGE plpgsql;

-- Calculate average phase duration
CREATE OR REPLACE FUNCTION get_avg_phase_duration(p_phase VARCHAR(50), p_days INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
  avg_duration INTEGER;
BEGIN
  SELECT AVG((data->>'duration_ms')::int)::INTEGER
  INTO avg_duration
  FROM phase_metrics
  WHERE phase = p_phase
    AND created_at > NOW() - (p_days || ' days')::INTERVAL;

  RETURN COALESCE(avg_duration, 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Clean up old ledger entries (for runs older than retention period)
CREATE OR REPLACE FUNCTION cleanup_old_ledger_entries(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM ledger
  WHERE timestamp < NOW() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Clean up old phase metrics
CREATE OR REPLACE FUNCTION cleanup_old_phase_metrics(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM phase_metrics
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE ledger IS 'Immutable append-only log of all run events (tasks, gates, decisions, artifacts, costs, signatures)';
COMMENT ON TABLE phase_metrics IS 'Structured metrics for phase executions (duration, cost, quality, success rate)';

COMMENT ON COLUMN ledger.provenance IS 'Provenance information: who created entry, when, tool version, input artifacts';
COMMENT ON COLUMN phase_metrics.data IS 'PhaseMetrics JSON object with all metrics for the phase execution';

-- ============================================================================
-- GRANTS (adjust for your security model)
-- ============================================================================

-- GRANT SELECT, INSERT ON ledger TO orchestrator_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON phase_metrics TO orchestrator_app;
-- GRANT EXECUTE ON FUNCTION get_cost_breakdown(UUID) TO orchestrator_app;
-- GRANT EXECUTE ON FUNCTION get_gate_history(UUID) TO orchestrator_app;
