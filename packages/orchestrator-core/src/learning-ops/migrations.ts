/**
 * Learning-Ops Database Migrations
 *
 * Complete migration for Learning-Ops system
 * Migration 026: Learning-Ops Infrastructure
 */

import { CRL_COMPUTE_MIGRATION } from './crl-compute';
import { POLICY_STORE_MIGRATION } from './policy-store';
import { EXPERIMENT_REGISTRY_MIGRATION } from './experiment-registry';
import { OFFLINE_REPLAYER_MIGRATION } from './offline-replayer';
import { SHADOW_CANARY_MIGRATION } from './shadow-canary';
import { SKILL_CARDS_MIGRATION } from './skill-cards';
import { LEARNING_CURATOR_MIGRATION } from './learning-curator';

export const LEARNING_OPS_MIGRATION = `
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

${CRL_COMPUTE_MIGRATION}

${POLICY_STORE_MIGRATION}

${EXPERIMENT_REGISTRY_MIGRATION}

${OFFLINE_REPLAYER_MIGRATION}

${SHADOW_CANARY_MIGRATION}

${SKILL_CARDS_MIGRATION}

${LEARNING_CURATOR_MIGRATION}

-- ============================================================================
-- Additional tables and indexes
-- ============================================================================

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
`;
