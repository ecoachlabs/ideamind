/**
 * Memory Vault Database Migrations
 *
 * Migration 027: Central Memory Vault Infrastructure
 */

export const MEMORY_VAULT_MIGRATION = `
-- ============================================================================
-- Migration 027: Central Memory Vault Infrastructure
-- ============================================================================
--
-- Creates the unified memory system for knowledge storage, organization,
-- and distribution across all runs and phases
--
-- Dependencies:
-- - Migration 026 (Learning-Ops)
-- - Existing: runs, tasks, artifacts tables
--
-- ============================================================================

-- Enable UUID and JSONB extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Knowledge Frames
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_frames (
  id VARCHAR(200) PRIMARY KEY,
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('ephemeral', 'run', 'tenant', 'global')),
  theme VARCHAR(200) NOT NULL,
  summary TEXT NOT NULL,
  claims JSONB NOT NULL DEFAULT '[]'::jsonb,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  parents JSONB NOT NULL DEFAULT '[]'::jsonb,
  children JSONB NOT NULL DEFAULT '[]'::jsonb,
  version VARCHAR(50) NOT NULL DEFAULT 'v1.0.0',
  provenance JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ttl BIGINT,
  pinned BOOLEAN DEFAULT false,
  tags JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_knowledge_frames_scope ON knowledge_frames(scope);
CREATE INDEX IF NOT EXISTS idx_knowledge_frames_theme ON knowledge_frames(theme);
CREATE INDEX IF NOT EXISTS idx_knowledge_frames_scope_theme ON knowledge_frames(scope, theme);
CREATE INDEX IF NOT EXISTS idx_knowledge_frames_created_at ON knowledge_frames(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_frames_pinned ON knowledge_frames(pinned) WHERE pinned = true;
CREATE INDEX IF NOT EXISTS idx_knowledge_frames_tags ON knowledge_frames USING GIN (tags);

COMMENT ON TABLE knowledge_frames IS 'Central knowledge frames with claims, citations, and provenance';

-- ============================================================================
-- QA Bindings
-- ============================================================================

CREATE TABLE IF NOT EXISTS qa_bindings (
  qid VARCHAR(200) PRIMARY KEY,
  aid VARCHAR(200) NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  validator_score DECIMAL(5, 4) DEFAULT 0.8,
  accepted BOOLEAN DEFAULT true,
  grounding DECIMAL(5, 4) DEFAULT 0.0,
  contradictions INT DEFAULT 0,
  citations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  phase VARCHAR(50),
  run_id VARCHAR(200),
  doer VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_qa_bindings_phase ON qa_bindings(phase);
CREATE INDEX IF NOT EXISTS idx_qa_bindings_run_id ON qa_bindings(run_id);
CREATE INDEX IF NOT EXISTS idx_qa_bindings_doer ON qa_bindings(doer);
CREATE INDEX IF NOT EXISTS idx_qa_bindings_accepted ON qa_bindings(accepted) WHERE accepted = true;
CREATE INDEX IF NOT EXISTS idx_qa_bindings_grounding ON qa_bindings(grounding DESC);

COMMENT ON TABLE qa_bindings IS 'Question-Answer-Validation bindings for knowledge capture';

-- ============================================================================
-- Signals (Metrics/Telemetry)
-- ============================================================================

CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id VARCHAR(200) NOT NULL,
  task_id VARCHAR(200),
  gate_scores JSONB DEFAULT '{}'::jsonb,
  cost DECIMAL(10, 4),
  time BIGINT,
  model VARCHAR(100),
  tool VARCHAR(100),
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_run_id ON signals(run_id);
CREATE INDEX IF NOT EXISTS idx_signals_task_id ON signals(task_id);
CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_signals_model ON signals(model);

COMMENT ON TABLE signals IS 'Telemetry and metrics signals from runs and tasks';

-- ============================================================================
-- Memory Subscriptions
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_subscriptions (
  id VARCHAR(200) PRIMARY KEY,
  topic VARCHAR(200) NOT NULL,
  doer VARCHAR(100),
  phase VARCHAR(50),
  theme VARCHAR(200),
  callback TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_subscriptions_topic ON memory_subscriptions(topic);
CREATE INDEX IF NOT EXISTS idx_memory_subscriptions_doer ON memory_subscriptions(doer);
CREATE INDEX IF NOT EXISTS idx_memory_subscriptions_phase ON memory_subscriptions(phase);
CREATE INDEX IF NOT EXISTS idx_memory_subscriptions_theme ON memory_subscriptions(theme);

COMMENT ON TABLE memory_subscriptions IS 'Pub/sub subscriptions for memory updates';

-- ============================================================================
-- Memory Deltas (Event Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_deltas (
  id SERIAL PRIMARY KEY,
  topic VARCHAR(200) NOT NULL,
  frame_ids JSONB DEFAULT '[]'::jsonb,
  policy_ids JSONB DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_memory_deltas_topic ON memory_deltas(topic);
CREATE INDEX IF NOT EXISTS idx_memory_deltas_timestamp ON memory_deltas(timestamp DESC);

COMMENT ON TABLE memory_deltas IS 'Event log for memory updates (pub/sub)';

-- ============================================================================
-- Enhance existing artifacts table (if needed)
-- ============================================================================

-- Add memory vault specific columns to artifacts if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='artifacts' AND column_name='sha256') THEN
    ALTER TABLE artifacts ADD COLUMN sha256 VARCHAR(64);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='artifacts' AND column_name='metadata') THEN
    ALTER TABLE artifacts ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ============================================================================
-- Views for Analytics
-- ============================================================================

-- Knowledge coverage by theme and scope
CREATE OR REPLACE VIEW v_knowledge_coverage AS
SELECT
  scope,
  theme,
  COUNT(*) as frame_count,
  AVG(ARRAY_LENGTH(CAST(claims AS TEXT[]), 1)) as avg_claims_per_frame,
  AVG(ARRAY_LENGTH(CAST(citations AS TEXT[]), 1)) as avg_citations_per_frame,
  AVG(CASE
    WHEN pinned THEN 1.0
    WHEN ttl IS NULL THEN 1.0 - (EXTRACT(EPOCH FROM (NOW() - created_at)) / 31536000000)
    ELSE 1.0 - (EXTRACT(EPOCH FROM (NOW() - created_at)) * 1000 / ttl)
  END) as avg_freshness
FROM knowledge_frames
GROUP BY scope, theme
ORDER BY scope, theme;

-- QA quality metrics
CREATE OR REPLACE VIEW v_qa_quality AS
SELECT
  COALESCE(doer, 'all') as doer,
  COALESCE(phase, 'all') as phase,
  COUNT(*) as total_bindings,
  COUNT(*) FILTER (WHERE accepted = true) as accepted_count,
  AVG(grounding) as avg_grounding,
  AVG(contradictions::float) as avg_contradictions,
  AVG(validator_score) as avg_validator_score
FROM qa_bindings
GROUP BY ROLLUP(doer, phase);

-- Signal aggregates by run
CREATE OR REPLACE VIEW v_signal_aggregates AS
SELECT
  run_id,
  COUNT(*) as signal_count,
  AVG(cost) as avg_cost,
  SUM(cost) as total_cost,
  AVG(time) as avg_time,
  JSONB_OBJECT_AGG(model, count) as model_counts
FROM (
  SELECT
    run_id,
    cost,
    time,
    model,
    COUNT(*) as count
  FROM signals
  GROUP BY run_id, cost, time, model
) sub
GROUP BY run_id;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at timestamp for knowledge frames
CREATE OR REPLACE FUNCTION update_knowledge_frame_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_knowledge_frame_updated
BEFORE UPDATE ON knowledge_frames
FOR EACH ROW
EXECUTE FUNCTION update_knowledge_frame_timestamp();

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to clean up expired frames
CREATE OR REPLACE FUNCTION cleanup_expired_frames()
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM knowledge_frames
  WHERE pinned = false
    AND ttl IS NOT NULL
    AND (EXTRACT(EPOCH FROM (NOW() - created_at)) * 1000) > ttl;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate frame freshness
CREATE OR REPLACE FUNCTION calculate_freshness(
  created_at_param TIMESTAMP,
  ttl_param BIGINT,
  pinned_param BOOLEAN
)
RETURNS DECIMAL AS $$
BEGIN
  IF pinned_param THEN
    RETURN 1.0;
  END IF;

  DECLARE
    age_ms BIGINT := EXTRACT(EPOCH FROM (NOW() - created_at_param)) * 1000;
    ttl BIGINT := COALESCE(ttl_param, 31536000000); -- Default 1 year
  BEGIN
    IF age_ms >= ttl THEN
      RETURN 0.0;
    END IF;

    RETURN 1.0 - (age_ms::DECIMAL / ttl::DECIMAL);
  END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Initial Data
-- ============================================================================

-- Create some default global knowledge frames (optional)
INSERT INTO knowledge_frames (
  id, scope, theme, summary, claims, citations, provenance, version, pinned
) VALUES (
  'frame_default_coding_standards',
  'global',
  'CODING.standards',
  'General coding standards and best practices',
  '["Use meaningful variable names", "Write comments for complex logic", "Follow DRY principle"]'::jsonb,
  '["https://google.github.io/styleguide/", "https://github.com/airbnb/javascript"]'::jsonb,
  '{"who": "system", "when": "2024-01-01T00:00:00Z", "tools": [], "inputs": []}'::jsonb,
  'v1.0.0',
  true
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Grants (adjust for your security model)
-- ============================================================================

-- GRANT SELECT, INSERT ON knowledge_frames TO memory_writer;
-- GRANT SELECT ON knowledge_frames TO memory_reader;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Record migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (27, 'memory_vault_infrastructure', NOW())
ON CONFLICT (version) DO NOTHING;

COMMENT ON SCHEMA public IS 'IdeaMine v3.0.0 with Memory Vault (Migration 027)';
`;
