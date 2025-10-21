-- ============================================================================
-- Migration 023: Experimentation, Compliance, Code Graph, and Ops (M6-M9)
-- ============================================================================
-- This migration adds:
-- M6: Synthetic Cohorts & Experimentation
-- M7: Compliance Modes (License, IP, Terms)
-- M8: Code Graph & Diff-Aware Gen
-- M9: Ops & DR (GPU Scheduler, DR Runner)
-- ============================================================================

-- ============================================================================
-- M6: Synthetic Cohorts & Experimentation
-- ============================================================================

-- Synthetic cohorts table
CREATE TABLE IF NOT EXISTS synthetic_cohorts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  size INTEGER NOT NULL,
  personas JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE synthetic_cohorts IS 'Synthetic persona cohorts for testing';

-- Experiments table
CREATE TABLE IF NOT EXISTS experiments (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  hypothesis TEXT NOT NULL,
  variants JSONB NOT NULL,
  metrics JSONB NOT NULL,
  duration INTEGER NOT NULL,
  traffic_allocation NUMERIC(3,2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE experiments IS 'A/B testing experiments';

-- Experiment results table
CREATE TABLE IF NOT EXISTS experiment_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id VARCHAR(100) REFERENCES experiments(id) ON DELETE CASCADE,
  variant VARCHAR(100) NOT NULL,
  metrics JSONB NOT NULL,
  sample_size INTEGER NOT NULL,
  p_value NUMERIC(10,8),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE experiment_results IS 'Experiment result data';

-- Metric violations table
CREATE TABLE IF NOT EXISTS metric_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id VARCHAR(100),
  violation_type VARCHAR(100) NOT NULL,
  details JSONB NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE metric_violations IS 'Statistical test violations';

-- ============================================================================
-- M7: Compliance Modes
-- ============================================================================

-- License scans table
CREATE TABLE IF NOT EXISTS license_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_name VARCHAR(100) NOT NULL,
  compliant BOOLEAN NOT NULL,
  total_dependencies INTEGER NOT NULL,
  violations_count INTEGER NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL,
  dependencies JSONB NOT NULL,
  violations JSONB NOT NULL,
  recommendations JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_license_scans_policy ON license_scans(policy_name);
CREATE INDEX IF NOT EXISTS idx_license_scans_compliant ON license_scans(compliant);
CREATE INDEX IF NOT EXISTS idx_license_scans_timestamp ON license_scans(created_at);

COMMENT ON TABLE license_scans IS 'License compliance scan results';

-- Compliance policies table
CREATE TABLE IF NOT EXISTS compliance_policies (
  name VARCHAR(100) PRIMARY KEY,
  project_license VARCHAR(100) NOT NULL,
  allowed_categories JSONB NOT NULL,
  blocked_licenses JSONB NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE compliance_policies IS 'License compliance policy definitions';

-- Code provenance table
CREATE TABLE IF NOT EXISTS code_provenance (
  artifact_id VARCHAR(100) PRIMARY KEY,
  artifact_type VARCHAR(50) NOT NULL,
  artifact_path TEXT NOT NULL,
  artifact_hash VARCHAR(64) NOT NULL,
  origin VARCHAR(50) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_name VARCHAR(500) NOT NULL,
  source_version VARCHAR(100),
  source_license VARCHAR(100),
  training_data_sources JSONB DEFAULT '[]'::jsonb,
  attribution JSONB NOT NULL,
  confidence NUMERIC(3,2) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provenance_path ON code_provenance(artifact_path);
CREATE INDEX IF NOT EXISTS idx_provenance_origin ON code_provenance(origin);
CREATE INDEX IF NOT EXISTS idx_provenance_hash ON code_provenance(artifact_hash);
CREATE INDEX IF NOT EXISTS idx_provenance_timestamp ON code_provenance(created_at);

COMMENT ON TABLE code_provenance IS 'IP provenance tracking for code artifacts';

-- Provenance reports table
CREATE TABLE IF NOT EXISTS provenance_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_path TEXT NOT NULL,
  total_artifacts INTEGER NOT NULL,
  by_origin JSONB NOT NULL,
  ai_percentage NUMERIC(5,2) NOT NULL,
  human_percentage NUMERIC(5,2) NOT NULL,
  hybrid_percentage NUMERIC(5,2) NOT NULL,
  risk_assessment JSONB NOT NULL,
  attribution_list JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_project ON provenance_reports(project_path);
CREATE INDEX IF NOT EXISTS idx_reports_timestamp ON provenance_reports(created_at);

COMMENT ON TABLE provenance_reports IS 'IP provenance compliance reports';

-- Terms scans table
CREATE TABLE IF NOT EXISTS terms_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  compliant BOOLEAN NOT NULL,
  violations_count INTEGER NOT NULL,
  warnings_count INTEGER NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL,
  violations JSONB NOT NULL,
  warnings JSONB NOT NULL,
  recommendations JSONB NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_terms_scans_compliant ON terms_scans(compliant);
CREATE INDEX IF NOT EXISTS idx_terms_scans_risk ON terms_scans(risk_score);
CREATE INDEX IF NOT EXISTS idx_terms_scans_timestamp ON terms_scans(created_at);

COMMENT ON TABLE terms_scans IS 'Terms of Service violation scans';

-- Compliance checks table
CREATE TABLE IF NOT EXISTS compliance_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework VARCHAR(50) NOT NULL,
  compliant BOOLEAN NOT NULL,
  passed JSONB NOT NULL,
  failed JSONB NOT NULL,
  recommendations JSONB NOT NULL,
  context JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_framework ON compliance_checks(framework);
CREATE INDEX IF NOT EXISTS idx_compliance_compliant ON compliance_checks(compliant);
CREATE INDEX IF NOT EXISTS idx_compliance_timestamp ON compliance_checks(created_at);

COMMENT ON TABLE compliance_checks IS 'Compliance framework checks (SOC2, GDPR, HIPAA)';

-- ============================================================================
-- M8: Code Graph & Diff-Aware Gen
-- ============================================================================

-- Code graph nodes table
CREATE TABLE IF NOT EXISTS code_graph_nodes (
  node_id VARCHAR(100) PRIMARY KEY,
  node_type VARCHAR(50) NOT NULL,
  name TEXT NOT NULL,
  file TEXT NOT NULL,
  line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  signature TEXT,
  complexity INTEGER,
  hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON code_graph_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_file ON code_graph_nodes(file);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_hash ON code_graph_nodes(hash);

COMMENT ON TABLE code_graph_nodes IS 'Code graph nodes (functions, classes, imports)';

-- Code graph edges table
CREATE TABLE IF NOT EXISTS code_graph_edges (
  edge_id VARCHAR(200) PRIMARY KEY,
  source VARCHAR(100) NOT NULL,
  target VARCHAR(100) NOT NULL,
  edge_type VARCHAR(50) NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON code_graph_edges(source);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON code_graph_edges(target);
CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON code_graph_edges(edge_type);

COMMENT ON TABLE code_graph_edges IS 'Code graph edges (calls, imports, dependencies)';

-- Code deltas table
CREATE TABLE IF NOT EXISTS code_deltas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file TEXT NOT NULL,
  description TEXT NOT NULL,
  total_lines_changed INTEGER NOT NULL,
  total_lines_original INTEGER NOT NULL,
  change_percentage NUMERIC(5,2) NOT NULL,
  preserved_formatting BOOLEAN NOT NULL,
  changes JSONB NOT NULL,
  rollback_patch TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_deltas_file ON code_deltas(file);
CREATE INDEX IF NOT EXISTS idx_deltas_percentage ON code_deltas(change_percentage);
CREATE INDEX IF NOT EXISTS idx_deltas_timestamp ON code_deltas(created_at);

COMMENT ON TABLE code_deltas IS 'Minimal code change deltas';

-- ============================================================================
-- M9: Ops & DR
-- ============================================================================

-- GPU resources table
CREATE TABLE IF NOT EXISTS gpu_resources (
  gpu_id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  model VARCHAR(100) NOT NULL,
  memory_gb INTEGER NOT NULL,
  compute_capability VARCHAR(20) NOT NULL,
  available BOOLEAN NOT NULL DEFAULT true,
  current_utilization NUMERIC(3,2) DEFAULT 0.0,
  temperature NUMERIC(5,2),
  power_usage_w NUMERIC(6,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gpu_available ON gpu_resources(available);

COMMENT ON TABLE gpu_resources IS 'GPU resource inventory';

-- GPU jobs table
CREATE TABLE IF NOT EXISTS gpu_jobs (
  job_id VARCHAR(100) PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  model_id VARCHAR(200) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  requested_memory_gb INTEGER NOT NULL,
  estimated_duration INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL,
  gpu_id VARCHAR(100),
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON gpu_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON gpu_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_gpu ON gpu_jobs(gpu_id);
CREATE INDEX IF NOT EXISTS idx_jobs_submitted ON gpu_jobs(submitted_at);

COMMENT ON TABLE gpu_jobs IS 'GPU job queue and history';

-- GPU quotas table
CREATE TABLE IF NOT EXISTS gpu_quotas (
  tenant_id VARCHAR(100) PRIMARY KEY,
  max_gpus INTEGER NOT NULL,
  max_memory_gb INTEGER NOT NULL,
  max_jobs_per_hour INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gpu_quotas IS 'Tenant GPU resource quotas';

-- DR drills table
CREATE TABLE IF NOT EXISTS dr_drills (
  drill_id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  drill_type VARCHAR(50) NOT NULL,
  schedule VARCHAR(100) NOT NULL,
  last_run TIMESTAMP,
  next_run TIMESTAMP NOT NULL,
  enabled BOOLEAN DEFAULT true,
  runbook TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE dr_drills IS 'Disaster recovery drill definitions';

-- DR executions table
CREATE TABLE IF NOT EXISTS dr_executions (
  execution_id VARCHAR(100) PRIMARY KEY,
  drill_id VARCHAR(100) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  status VARCHAR(50) NOT NULL,
  steps JSONB NOT NULL,
  metrics JSONB NOT NULL,
  issues JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_executions_drill ON dr_executions(drill_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON dr_executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_time ON dr_executions(start_time);

COMMENT ON TABLE dr_executions IS 'DR drill execution history';

-- Backup verifications table
CREATE TABLE IF NOT EXISTS backup_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  backup_id VARCHAR(200) NOT NULL,
  verified BOOLEAN NOT NULL,
  restorable BOOLEAN NOT NULL,
  corruption_detected BOOLEAN NOT NULL,
  verified_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backups_verified ON backup_verifications(backup_id);

COMMENT ON TABLE backup_verifications IS 'Backup verification results';

-- ============================================================================
-- Dashboard Views
-- ============================================================================

-- License compliance dashboard
CREATE OR REPLACE VIEW license_compliance_dashboard AS
SELECT
  policy_name,
  COUNT(*) as total_scans,
  SUM(CASE WHEN compliant THEN 1 ELSE 0 END) as compliant_count,
  AVG(risk_score) as avg_risk_score,
  AVG(violations_count) as avg_violations
FROM license_scans
GROUP BY policy_name;

COMMENT ON VIEW license_compliance_dashboard IS 'License compliance metrics by policy';

-- IP provenance dashboard
CREATE OR REPLACE VIEW ip_provenance_dashboard AS
SELECT
  origin,
  COUNT(*) as artifact_count,
  AVG(confidence) as avg_confidence,
  COUNT(DISTINCT artifact_path) as unique_files
FROM code_provenance
GROUP BY origin;

COMMENT ON VIEW ip_provenance_dashboard IS 'Code provenance metrics by origin';

-- GPU utilization dashboard
CREATE OR REPLACE VIEW gpu_utilization_dashboard AS
SELECT
  model,
  COUNT(*) as total_gpus,
  SUM(CASE WHEN available THEN 1 ELSE 0 END) as available_gpus,
  AVG(current_utilization) as avg_utilization,
  AVG(temperature) as avg_temperature
FROM gpu_resources
GROUP BY model;

COMMENT ON VIEW gpu_utilization_dashboard IS 'GPU resource utilization metrics';

-- DR drill compliance dashboard
CREATE OR REPLACE VIEW dr_compliance_dashboard AS
SELECT
  drill_type,
  COUNT(*) as total_executions,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_executions,
  AVG(CAST(metrics->>'rtoMinutes' AS NUMERIC)) as avg_rto_minutes,
  MAX(start_time) as last_execution
FROM dr_executions
GROUP BY drill_type;

COMMENT ON VIEW dr_compliance_dashboard IS 'DR drill compliance metrics';
