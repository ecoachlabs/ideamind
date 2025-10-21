-- ============================================================================
-- Migration 026: Learning-Ops Infrastructure
-- ============================================================================
--
-- Enables autonomous neural learning system with:
-- - Composite Run Loss (CRL) tracking
-- - Versioned policy store
-- - Experiment tracking
-- - Offline replay for evaluation
-- - Shadow/canary deployments
-- - Skill cards for doer performance
-- - Enhanced dataset curation
--
-- Dependencies:
-- - Migration 025 (Learning & Docs)
-- - Existing: runs, tasks, artifacts, telemetry_events, dataset_samples tables
--
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CRL (Composite Run Loss) Tables
-- ============================================================================

-- CRL results for each run
CREATE TABLE IF NOT EXISTS crl_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id VARCHAR(200) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),

  -- CRL terms (normalized 0-1 or 0-N)
  gate_pass DECIMAL(5, 4) DEFAULT 0,
  contradictions DECIMAL(5, 4) DEFAULT 0,
  grounding DECIMAL(5, 4) DEFAULT 0,
  cost_over_budget_pct DECIMAL(5, 4) DEFAULT 0,
  latency_p95_norm DECIMAL(5, 4) DEFAULT 0,
  security_criticals INT DEFAULT 0,
  api_breakages INT DEFAULT 0,
  db_migration_fail INT DEFAULT 0,
  rag_coverage DECIMAL(5, 4) DEFAULT 0,

  -- Composite loss
  loss_value DECIMAL(10, 6) NOT NULL,

  -- Weights used for this computation
  weights JSONB NOT NULL,

  -- Full breakdown for debugging
  breakdown JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT fk_crl_run FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crl_results_run_id ON crl_results(run_id);
CREATE INDEX IF NOT EXISTS idx_crl_results_timestamp ON crl_results(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_crl_results_loss_value ON crl_results(loss_value);

COMMENT ON TABLE crl_results IS 'Composite Run Loss (CRL) tracking for each run';

-- ============================================================================
-- Policy Store Tables
-- ============================================================================

-- Versioned policies with provenance
CREATE TABLE IF NOT EXISTS policies (
  id VARCHAR(200) PRIMARY KEY,
  doer VARCHAR(100) NOT NULL,
  phase VARCHAR(50) NOT NULL,
  version VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',

  -- Policy artifact (prompts, hparams, router rules, tools, weights)
  prompts JSONB NOT NULL DEFAULT '{}'::jsonb,
  hparams JSONB NOT NULL DEFAULT '{}'::jsonb,
  router_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  tools_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
  weights JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Provenance
  parent_policy_id VARCHAR(200),
  experiment_id VARCHAR(200),
  lineage JSONB DEFAULT '[]'::jsonb,
  signature TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_policy_parent FOREIGN KEY (parent_policy_id) REFERENCES policies(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_policies_doer ON policies(doer);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_doer_status ON policies(doer, status);

COMMENT ON TABLE policies IS 'Versioned policy store with provenance tracking';

-- Policy promotion audit log
CREATE TABLE IF NOT EXISTS policy_promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id VARCHAR(200) NOT NULL,
  from_status VARCHAR(20) NOT NULL,
  to_status VARCHAR(20) NOT NULL,
  rationale TEXT,
  promoted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  promoted_by VARCHAR(100),

  CONSTRAINT fk_promotion_policy FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_policy_promotions_policy_id ON policy_promotions(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_promotions_promoted_at ON policy_promotions(promoted_at DESC);

COMMENT ON TABLE policy_promotions IS 'Audit log for policy lifecycle promotions';

-- ============================================================================
-- Experiment Registry
-- ============================================================================

-- Track learning experiments
CREATE TABLE IF NOT EXISTS experiments (
  id VARCHAR(200) PRIMARY KEY,
  doer VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Experiment configuration
  config JSONB NOT NULL,

  -- Results
  policy_id VARCHAR(200),
  metrics JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,

  CONSTRAINT fk_experiment_policy FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_experiments_doer ON experiments(doer);
CREATE INDEX IF NOT EXISTS idx_experiments_type ON experiments(type);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);

COMMENT ON TABLE experiments IS 'Learning experiment tracking registry';

-- ============================================================================
-- Offline Replayer
-- ============================================================================

-- Offline replay sessions
CREATE TABLE IF NOT EXISTS offline_replays (
  id VARCHAR(200) PRIMARY KEY,
  policy_id VARCHAR(200) NOT NULL,
  replay_runs JSONB NOT NULL DEFAULT '[]'::jsonb,
  seeds JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Aggregate results
  crl_avg DECIMAL(10, 6),
  crl_std DECIMAL(10, 6),
  stability_score DECIMAL(5, 4),

  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,

  CONSTRAINT fk_replay_policy FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_offline_replays_policy_id ON offline_replays(policy_id);
CREATE INDEX IF NOT EXISTS idx_offline_replays_status ON offline_replays(status);

COMMENT ON TABLE offline_replays IS 'Offline deterministic policy evaluation sessions';

-- ============================================================================
-- Shadow/Canary Controller
-- ============================================================================

-- Shadow and canary deployments
CREATE TABLE IF NOT EXISTS shadow_deployments (
  id VARCHAR(200) PRIMARY KEY,
  doer VARCHAR(100) NOT NULL,
  mode VARCHAR(20) NOT NULL,
  candidate_policy_id VARCHAR(200) NOT NULL,
  control_policy_id VARCHAR(200) NOT NULL,
  allocation_pct INT DEFAULT 0,

  -- Canary configuration
  min_jobs INT DEFAULT 100,
  max_duration_hours INT DEFAULT 48,
  auto_promote BOOLEAN DEFAULT false,
  safety_thresholds JSONB DEFAULT '{}'::jsonb,

  status VARCHAR(20) NOT NULL DEFAULT 'active',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,

  CONSTRAINT fk_shadow_candidate FOREIGN KEY (candidate_policy_id) REFERENCES policies(id) ON DELETE CASCADE,
  CONSTRAINT fk_shadow_control FOREIGN KEY (control_policy_id) REFERENCES policies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shadow_deployments_doer ON shadow_deployments(doer);
CREATE INDEX IF NOT EXISTS idx_shadow_deployments_status ON shadow_deployments(status);

COMMENT ON TABLE shadow_deployments IS 'Shadow and canary deployment tracking';

-- Deployment routing decisions
CREATE TABLE IF NOT EXISTS deployment_routings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deployment_id VARCHAR(200) NOT NULL,
  task_id VARCHAR(200) NOT NULL,
  route VARCHAR(20) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_routing_deployment FOREIGN KEY (deployment_id) REFERENCES shadow_deployments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_deployment_routings_deployment_id ON deployment_routings(deployment_id);
CREATE INDEX IF NOT EXISTS idx_deployment_routings_task_id ON deployment_routings(task_id);

COMMENT ON TABLE deployment_routings IS 'Individual task routing decisions for shadow/canary';

-- ============================================================================
-- Skill Cards
-- ============================================================================

-- Per-doer skill cards
CREATE TABLE IF NOT EXISTS skill_cards (
  id VARCHAR(200) PRIMARY KEY,
  doer VARCHAR(100) NOT NULL UNIQUE,

  -- Auto-generated strengths/weaknesses
  strengths JSONB DEFAULT '[]'::jsonb,
  weaknesses JSONB DEFAULT '[]'::jsonb,
  best_models JSONB DEFAULT '[]'::jsonb,
  failure_modes JSONB DEFAULT '[]'::jsonb,

  -- Loss trends
  loss_delta_7d DECIMAL(10, 6),
  loss_delta_30d DECIMAL(10, 6),

  -- Current policy
  current_policy VARCHAR(200),

  -- Recent experiments
  experiments JSONB DEFAULT '[]'::jsonb,

  last_refreshed TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_skill_card_policy FOREIGN KEY (current_policy) REFERENCES policies(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_skill_cards_doer ON skill_cards(doer);

COMMENT ON TABLE skill_cards IS 'Auto-generated skill cards showing per-doer performance';

-- ============================================================================
-- Learning Curator Enhancements
-- ============================================================================

-- Enhance existing dataset_samples table (if needed)
-- ALTER TABLE dataset_samples ADD COLUMN IF NOT EXISTS contamination_check JSONB DEFAULT '{}'::jsonb;
-- ALTER TABLE dataset_samples ADD COLUMN IF NOT EXISTS diversity_score DECIMAL(5, 4);

-- Golden dataset for regression testing
CREATE TABLE IF NOT EXISTS golden_datasets (
  id VARCHAR(200) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  sample_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  frozen BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE golden_datasets IS 'Frozen golden datasets for regression testing';

-- Learning progress tracking
CREATE TABLE IF NOT EXISTS learning_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doer VARCHAR(100) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  crl_value DECIMAL(10, 6) NOT NULL,
  policy_version VARCHAR(50),
  experiment_id VARCHAR(200),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_learning_progress_doer ON learning_progress(doer);
CREATE INDEX IF NOT EXISTS idx_learning_progress_timestamp ON learning_progress(timestamp);

COMMENT ON TABLE learning_progress IS 'Historical learning progress tracking for doers';

-- ============================================================================
-- Views for analytics
-- ============================================================================

-- CRL trend by doer
CREATE OR REPLACE VIEW v_crl_trend_by_doer AS
SELECT
  r.doer,
  DATE_TRUNC('day', cr.timestamp) as date,
  AVG(cr.loss_value) as avg_loss,
  STDDEV(cr.loss_value) as std_loss,
  COUNT(*) as run_count
FROM crl_results cr
JOIN runs r ON r.id = cr.run_id
GROUP BY r.doer, DATE_TRUNC('day', cr.timestamp);

-- Policy performance comparison
CREATE OR REPLACE VIEW v_policy_performance AS
SELECT
  sd.doer,
  sd.candidate_policy_id,
  sd.control_policy_id,
  AVG(CASE WHEN dr.route = 'candidate' THEN cr.loss_value END) as candidate_avg_loss,
  AVG(CASE WHEN dr.route = 'control' THEN cr.loss_value END) as control_avg_loss,
  COUNT(CASE WHEN dr.route = 'candidate' THEN 1 END) as candidate_count,
  COUNT(CASE WHEN dr.route = 'control' THEN 1 END) as control_count
FROM shadow_deployments sd
JOIN deployment_routings dr ON dr.deployment_id = sd.id
JOIN tasks t ON t.id = dr.task_id
JOIN crl_results cr ON cr.run_id = t.run_id
GROUP BY sd.doer, sd.candidate_policy_id, sd.control_policy_id;

-- Experiment success rate
CREATE OR REPLACE VIEW v_experiment_success_rate AS
SELECT
  doer,
  type,
  COUNT(*) FILTER (WHERE status = 'completed' AND (metrics->>'crlDelta')::float < 0) as successful,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) as total,
  CASE
    WHEN COUNT(*) FILTER (WHERE status = 'completed') > 0
    THEN COUNT(*) FILTER (WHERE status = 'completed' AND (metrics->>'crlDelta')::float < 0)::float /
         COUNT(*) FILTER (WHERE status = 'completed')::float
    ELSE 0
  END as success_rate
FROM experiments
GROUP BY doer, type;

-- ============================================================================
-- Triggers for automatic updates
-- ============================================================================

-- Update policy updated_at on change
CREATE OR REPLACE FUNCTION update_policy_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_policy_updated
BEFORE UPDATE ON policies
FOR EACH ROW
EXECUTE FUNCTION update_policy_timestamp();

-- Record learning progress on CRL computation
CREATE OR REPLACE FUNCTION record_learning_progress()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO learning_progress (doer, crl_value, timestamp)
  SELECT r.doer, NEW.loss_value, NOW()
  FROM runs r
  WHERE r.id = NEW.run_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_crl_progress
AFTER INSERT ON crl_results
FOR EACH ROW
EXECUTE FUNCTION record_learning_progress();

-- ============================================================================
-- Initial data
-- ============================================================================

-- Create default golden dataset
INSERT INTO golden_datasets (id, name, description, frozen)
VALUES ('golden_baseline', 'Baseline Golden Dataset', 'Initial golden dataset for regression testing', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Grants (adjust as needed for your security model)
-- ============================================================================

-- Grant read access to learning tables
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO learning_readonly;

-- ============================================================================
-- Migration complete
-- ============================================================================

-- Record migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (26, 'learning_ops_infrastructure', NOW())
ON CONFLICT (version) DO NOTHING;

COMMENT ON SCHEMA public IS 'IdeaMine v3.0.0 with Learning-Ops (Migration 026)';
