/**
 * Migration 025: Phase 2 Components
 *
 * Database schema for:
 * - Design Critic Agent (architecture review, PRD critique)
 * - Telemetry Logger (structured event logging)
 * - Dataset Curator (synthetic detection, quality filtering)
 * - Docs Portal Agent (documentation generation)
 * - Explain Agent (decision explainability, trace-to-knowledge)
 *
 * Status: Production-ready
 * Dependencies: 024_priority_quotas_deliberation.sql
 */

-- ============================================================================
-- Design Critic Agent Tables
-- ============================================================================

-- Design reviews for PRDs, APIs, architectures
CREATE TABLE IF NOT EXISTS design_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artifact_id VARCHAR(100) NOT NULL,
  artifact_type VARCHAR(50) NOT NULL CHECK (artifact_type IN ('prd', 'api', 'architecture', 'ui', 'database')),
  run_id VARCHAR(100),
  reviewer VARCHAR(100) DEFAULT 'design-critic-agent',

  -- Review scores (0-100)
  overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  ux_score INTEGER CHECK (ux_score BETWEEN 0 AND 100),
  accessibility_score INTEGER CHECK (accessibility_score BETWEEN 0 AND 100),
  performance_score INTEGER CHECK (performance_score BETWEEN 0 AND 100),
  scalability_score INTEGER CHECK (scalability_score BETWEEN 0 AND 100),
  security_score INTEGER CHECK (security_score BETWEEN 0 AND 100),

  -- Issue counts
  critical_count INTEGER DEFAULT 0,
  high_count INTEGER DEFAULT 0,
  medium_count INTEGER DEFAULT 0,
  low_count INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  reviewed_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT design_reviews_artifact_idx UNIQUE (artifact_id, reviewed_at)
);

CREATE INDEX IF NOT EXISTS idx_design_reviews_artifact ON design_reviews(artifact_id);
CREATE INDEX IF NOT EXISTS idx_design_reviews_run ON design_reviews(run_id);
CREATE INDEX IF NOT EXISTS idx_design_reviews_score ON design_reviews(overall_score);
CREATE INDEX IF NOT EXISTS idx_design_reviews_reviewed_at ON design_reviews(reviewed_at DESC);

-- Individual design issues found during review
CREATE TABLE IF NOT EXISTS design_issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id UUID NOT NULL REFERENCES design_reviews(id) ON DELETE CASCADE,

  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  category VARCHAR(50) NOT NULL CHECK (category IN ('ux', 'accessibility', 'performance', 'scalability', 'security', 'maintainability', 'testability')),

  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(200),
  suggestion TEXT,

  -- Impact assessment
  impact_area VARCHAR(100),
  effort_estimate VARCHAR(20) CHECK (effort_estimate IN ('trivial', 'small', 'medium', 'large', 'xlarge')),

  -- Resolution tracking
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'in_progress', 'resolved', 'wont_fix')),
  resolved_at TIMESTAMP,
  resolution_notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_design_issues_review ON design_issues(review_id);
CREATE INDEX IF NOT EXISTS idx_design_issues_severity ON design_issues(severity);
CREATE INDEX IF NOT EXISTS idx_design_issues_category ON design_issues(category);
CREATE INDEX IF NOT EXISTS idx_design_issues_status ON design_issues(status);

-- ============================================================================
-- Telemetry Logger Tables
-- ============================================================================

-- Enhanced telemetry events (extending existing table if exists)
DO $$
BEGIN
  -- Add columns if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'telemetry_events') THEN
    ALTER TABLE telemetry_events
      ADD COLUMN IF NOT EXISTS event_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'info',
      ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS parent_event_id UUID,
      ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMP DEFAULT NOW();
  ELSE
    -- Create table if it doesn't exist
    CREATE TABLE telemetry_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      task_id VARCHAR(100),
      run_id VARCHAR(100),
      tenant_id VARCHAR(100),

      event_type VARCHAR(50) NOT NULL,
      severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warn', 'error', 'critical')),

      -- Legacy fields (for compatibility)
      task_type VARCHAR(50),
      success BOOLEAN,
      duration INTEGER,
      model_used VARCHAR(100),
      origin VARCHAR(100),

      -- Enhanced fields
      tags JSONB DEFAULT '{}'::jsonb,
      metrics JSONB DEFAULT '{}'::jsonb,
      context JSONB DEFAULT '{}'::jsonb,

      -- Correlation
      correlation_id VARCHAR(100),
      parent_event_id UUID REFERENCES telemetry_events(id),

      recorded_at TIMESTAMP DEFAULT NOW()
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_telemetry_events_task ON telemetry_events(task_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_run ON telemetry_events(run_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_tenant ON telemetry_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_type ON telemetry_events(event_type);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_severity ON telemetry_events(severity);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_recorded_at ON telemetry_events(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_correlation ON telemetry_events(correlation_id);

-- Telemetry metrics rollup (hourly aggregations)
CREATE TABLE IF NOT EXISTS telemetry_metrics_rollup (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(100),
  metric_name VARCHAR(100) NOT NULL,
  metric_type VARCHAR(20) NOT NULL CHECK (metric_type IN ('counter', 'gauge', 'histogram', 'summary')),

  -- Time bucket
  bucket_hour TIMESTAMP NOT NULL,

  -- Aggregated values
  count INTEGER DEFAULT 0,
  sum DECIMAL(20,4) DEFAULT 0,
  min DECIMAL(20,4),
  max DECIMAL(20,4),
  avg DECIMAL(20,4),
  p50 DECIMAL(20,4),
  p95 DECIMAL(20,4),
  p99 DECIMAL(20,4),

  -- Tags for grouping
  tags JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT telemetry_metrics_rollup_unique UNIQUE (tenant_id, metric_name, bucket_hour, tags)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_metrics_tenant ON telemetry_metrics_rollup(tenant_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_metrics_name ON telemetry_metrics_rollup(metric_name);
CREATE INDEX IF NOT EXISTS idx_telemetry_metrics_bucket ON telemetry_metrics_rollup(bucket_hour DESC);

-- ============================================================================
-- Dataset Curator Tables
-- ============================================================================

-- Dataset artifacts for training/fine-tuning
CREATE TABLE IF NOT EXISTS dataset_artifacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artifact_id VARCHAR(100) NOT NULL UNIQUE,

  -- Content
  content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('code', 'text', 'prd', 'api', 'test', 'documentation')),
  content_hash VARCHAR(64) NOT NULL,
  content_size INTEGER NOT NULL,

  -- Origin tracking
  origin VARCHAR(50) NOT NULL CHECK (origin IN ('human', 'synthetic', 'mixed', 'unknown')),
  origin_confidence DECIMAL(3,2) CHECK (origin_confidence BETWEEN 0 AND 1),
  generation_model VARCHAR(100),

  -- Quality scores
  quality_score DECIMAL(3,2) CHECK (quality_score BETWEEN 0 AND 1),
  toxicity_score DECIMAL(3,2) CHECK (toxicity_score BETWEEN 0 AND 1),
  pii_detected BOOLEAN DEFAULT false,

  -- Curation status
  curation_status VARCHAR(20) DEFAULT 'pending' CHECK (curation_status IN ('pending', 'approved', 'rejected', 'flagged')),
  curation_reason TEXT,
  curated_by VARCHAR(100),
  curated_at TIMESTAMP,

  -- Lineage
  parent_artifact_id VARCHAR(100),
  run_id VARCHAR(100),
  task_id VARCHAR(100),

  -- Metadata
  tags JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dataset_artifacts_origin ON dataset_artifacts(origin);
CREATE INDEX IF NOT EXISTS idx_dataset_artifacts_quality ON dataset_artifacts(quality_score);
CREATE INDEX IF NOT EXISTS idx_dataset_artifacts_status ON dataset_artifacts(curation_status);
CREATE INDEX IF NOT EXISTS idx_dataset_artifacts_run ON dataset_artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_dataset_artifacts_hash ON dataset_artifacts(content_hash);

-- Dataset quality metrics
CREATE TABLE IF NOT EXISTS dataset_quality_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artifact_id VARCHAR(100) NOT NULL REFERENCES dataset_artifacts(artifact_id) ON DELETE CASCADE,

  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(10,4) NOT NULL,
  metric_type VARCHAR(20) CHECK (metric_type IN ('quality', 'toxicity', 'bias', 'diversity', 'coverage')),

  measured_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_dataset_quality_artifact ON dataset_quality_metrics(artifact_id);
CREATE INDEX IF NOT EXISTS idx_dataset_quality_name ON dataset_quality_metrics(metric_name);

-- ============================================================================
-- Docs Portal Agent Tables
-- ============================================================================

-- Documentation portals generated for runs
CREATE TABLE IF NOT EXISTS documentation_portals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id VARCHAR(100) NOT NULL,
  tenant_id VARCHAR(100),

  -- Portal metadata
  portal_name VARCHAR(200) NOT NULL,
  portal_url VARCHAR(500),
  portal_version VARCHAR(50),

  -- Generation status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  generation_started_at TIMESTAMP,
  generation_completed_at TIMESTAMP,

  -- Content stats
  api_docs_count INTEGER DEFAULT 0,
  guide_count INTEGER DEFAULT 0,
  example_count INTEGER DEFAULT 0,
  sdk_count INTEGER DEFAULT 0,

  -- Quality metrics
  completeness_score DECIMAL(3,2) CHECK (completeness_score BETWEEN 0 AND 1),
  clarity_score DECIMAL(3,2) CHECK (clarity_score BETWEEN 0 AND 1),

  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentation_portals_run ON documentation_portals(run_id);
CREATE INDEX IF NOT EXISTS idx_documentation_portals_tenant ON documentation_portals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documentation_portals_status ON documentation_portals(status);

-- Documentation sections within portals
CREATE TABLE IF NOT EXISTS documentation_sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portal_id UUID NOT NULL REFERENCES documentation_portals(id) ON DELETE CASCADE,

  section_type VARCHAR(50) NOT NULL CHECK (section_type IN ('api', 'guide', 'tutorial', 'reference', 'example', 'sdk', 'quickstart')),
  section_title VARCHAR(200) NOT NULL,
  section_slug VARCHAR(200) NOT NULL,

  -- Content
  content TEXT NOT NULL,
  content_format VARCHAR(20) DEFAULT 'markdown' CHECK (content_format IN ('markdown', 'html', 'asciidoc', 'rst')),

  -- Ordering
  display_order INTEGER DEFAULT 0,
  parent_section_id UUID REFERENCES documentation_sections(id),

  -- Metadata
  tags JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentation_sections_portal ON documentation_sections(portal_id);
CREATE INDEX IF NOT EXISTS idx_documentation_sections_type ON documentation_sections(section_type);
CREATE INDEX IF NOT EXISTS idx_documentation_sections_slug ON documentation_sections(section_slug);

-- ============================================================================
-- Explain Agent Tables
-- ============================================================================

-- Decision records for explainability
CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id VARCHAR(100) NOT NULL UNIQUE,

  run_id VARCHAR(100),
  task_id VARCHAR(100),
  tenant_id VARCHAR(100),

  -- Decision metadata
  decision_type VARCHAR(50) NOT NULL CHECK (decision_type IN ('model_selection', 'routing', 'preemption', 'quota', 'budget', 'quality', 'other')),
  decision_maker VARCHAR(100) NOT NULL, -- component that made decision

  -- Decision details
  decision_summary VARCHAR(500) NOT NULL,
  rationale TEXT NOT NULL,

  -- Context that led to decision
  input_context JSONB DEFAULT '{}'::jsonb,
  constraints JSONB DEFAULT '{}'::jsonb,

  -- Alternatives considered
  alternatives JSONB DEFAULT '[]'::jsonb,
  selected_option VARCHAR(200) NOT NULL,

  -- Outcome
  outcome VARCHAR(20) CHECK (outcome IN ('success', 'failure', 'partial', 'reverted', 'unknown')),
  outcome_metrics JSONB DEFAULT '{}'::jsonb,

  -- Traceability
  knowledge_map_refs JSONB DEFAULT '[]'::jsonb,
  parent_decision_id VARCHAR(100),

  decided_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_decisions_run ON decisions(run_id);
CREATE INDEX IF NOT EXISTS idx_decisions_task ON decisions(task_id);
CREATE INDEX IF NOT EXISTS idx_decisions_tenant ON decisions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_decisions_type ON decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_decisions_maker ON decisions(decision_maker);
CREATE INDEX IF NOT EXISTS idx_decisions_decided_at ON decisions(decided_at DESC);

-- Explanation cache (pre-computed explanations for common queries)
CREATE TABLE IF NOT EXISTS explanation_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id VARCHAR(100) NOT NULL REFERENCES decisions(decision_id) ON DELETE CASCADE,

  explanation_type VARCHAR(50) NOT NULL CHECK (explanation_type IN ('summary', 'detailed', 'technical', 'business')),
  audience VARCHAR(50) CHECK (audience IN ('developer', 'product', 'executive', 'customer')),

  explanation TEXT NOT NULL,
  format VARCHAR(20) DEFAULT 'markdown' CHECK (format IN ('markdown', 'html', 'json', 'plain')),

  -- Freshness
  generated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,

  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT explanation_cache_unique UNIQUE (decision_id, explanation_type, audience)
);

CREATE INDEX IF NOT EXISTS idx_explanation_cache_decision ON explanation_cache(decision_id);
CREATE INDEX IF NOT EXISTS idx_explanation_cache_type ON explanation_cache(explanation_type);

-- ============================================================================
-- Views for Phase 2 Components
-- ============================================================================

-- View: Recent design reviews with issue summary
CREATE OR REPLACE VIEW v_recent_design_reviews AS
SELECT
  dr.id,
  dr.artifact_id,
  dr.artifact_type,
  dr.run_id,
  dr.overall_score,
  dr.critical_count,
  dr.high_count,
  dr.medium_count,
  dr.low_count,
  dr.reviewed_at,
  COALESCE(di.issue_count, 0) as total_issues,
  CASE
    WHEN dr.critical_count > 0 THEN 'critical'
    WHEN dr.high_count > 0 THEN 'high'
    WHEN dr.medium_count > 0 THEN 'medium'
    WHEN dr.low_count > 0 THEN 'low'
    ELSE 'clean'
  END as severity_level
FROM design_reviews dr
LEFT JOIN (
  SELECT review_id, COUNT(*) as issue_count
  FROM design_issues
  GROUP BY review_id
) di ON dr.id = di.review_id
ORDER BY dr.reviewed_at DESC;

-- View: Dataset quality overview
CREATE OR REPLACE VIEW v_dataset_quality_overview AS
SELECT
  curation_status,
  origin,
  COUNT(*) as artifact_count,
  AVG(quality_score) as avg_quality_score,
  AVG(origin_confidence) as avg_origin_confidence,
  COUNT(*) FILTER (WHERE pii_detected = true) as pii_count,
  COUNT(*) FILTER (WHERE toxicity_score > 0.7) as high_toxicity_count
FROM dataset_artifacts
GROUP BY curation_status, origin;

-- View: Telemetry event summary by hour
CREATE OR REPLACE VIEW v_telemetry_hourly_summary AS
SELECT
  DATE_TRUNC('hour', recorded_at) as hour,
  tenant_id,
  event_type,
  severity,
  COUNT(*) as event_count,
  COUNT(DISTINCT task_id) as unique_tasks,
  COUNT(DISTINCT run_id) as unique_runs
FROM telemetry_events
WHERE recorded_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', recorded_at), tenant_id, event_type, severity
ORDER BY hour DESC, event_count DESC;

-- View: Documentation portal overview
CREATE OR REPLACE VIEW v_documentation_portal_overview AS
SELECT
  dp.id,
  dp.run_id,
  dp.portal_name,
  dp.status,
  dp.api_docs_count,
  dp.guide_count,
  dp.example_count,
  dp.sdk_count,
  dp.completeness_score,
  dp.clarity_score,
  COALESCE(ds.section_count, 0) as total_sections,
  dp.created_at
FROM documentation_portals dp
LEFT JOIN (
  SELECT portal_id, COUNT(*) as section_count
  FROM documentation_sections
  GROUP BY portal_id
) ds ON dp.id = ds.portal_id
ORDER BY dp.created_at DESC;

-- ============================================================================
-- Functions for Phase 2 Components
-- ============================================================================

-- Function: Get design review summary for run
CREATE OR REPLACE FUNCTION get_design_review_summary(p_run_id VARCHAR)
RETURNS TABLE (
  total_reviews INTEGER,
  avg_score DECIMAL,
  total_critical INTEGER,
  total_high INTEGER,
  total_medium INTEGER,
  total_low INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_reviews,
    ROUND(AVG(overall_score), 2) as avg_score,
    SUM(critical_count)::INTEGER as total_critical,
    SUM(high_count)::INTEGER as total_high,
    SUM(medium_count)::INTEGER as total_medium,
    SUM(low_count)::INTEGER as total_low
  FROM design_reviews
  WHERE run_id = p_run_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Get telemetry metrics for tenant
CREATE OR REPLACE FUNCTION get_telemetry_metrics(
  p_tenant_id VARCHAR,
  p_metric_name VARCHAR,
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  bucket_hour TIMESTAMP,
  count INTEGER,
  avg DECIMAL,
  p95 DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tmr.bucket_hour,
    tmr.count,
    tmr.avg,
    tmr.p95
  FROM telemetry_metrics_rollup tmr
  WHERE tmr.tenant_id = p_tenant_id
    AND tmr.metric_name = p_metric_name
    AND tmr.bucket_hour > NOW() - (p_hours || ' hours')::INTERVAL
  ORDER BY tmr.bucket_hour DESC;
END;
$$ LANGUAGE plpgsql;

-- Function: Detect synthetic content (placeholder for ML model)
CREATE OR REPLACE FUNCTION detect_synthetic_content(p_content TEXT)
RETURNS DECIMAL AS $$
DECLARE
  synthetic_score DECIMAL;
BEGIN
  -- Placeholder: In production, this would call ML model
  -- For now, use simple heuristics

  -- Check for AI markers
  IF p_content ILIKE '%as an ai%' OR p_content ILIKE '%language model%' THEN
    synthetic_score := 0.9;
  ELSIF LENGTH(p_content) > 10000 AND p_content ~ '([.!?]\s+){20,}' THEN
    -- Very long with many sentences = likely synthetic
    synthetic_score := 0.7;
  ELSE
    synthetic_score := 0.3;
  END IF;

  RETURN ROUND(synthetic_score, 2);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Triggers for Phase 2 Components
-- ============================================================================

-- Trigger: Update dataset_artifacts.updated_at on modification
CREATE OR REPLACE FUNCTION update_dataset_artifacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dataset_artifacts_updated_at
  BEFORE UPDATE ON dataset_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION update_dataset_artifacts_updated_at();

-- Trigger: Update documentation_sections.updated_at on modification
CREATE OR REPLACE FUNCTION update_documentation_sections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documentation_sections_updated_at
  BEFORE UPDATE ON documentation_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_documentation_sections_updated_at();

-- ============================================================================
-- Initial Data / Seed Data
-- ============================================================================

-- No seed data required for Phase 2

-- ============================================================================
-- Migration Complete
-- ============================================================================

COMMENT ON TABLE design_reviews IS 'Design reviews for PRDs, APIs, and architectures';
COMMENT ON TABLE design_issues IS 'Individual issues found during design reviews';
COMMENT ON TABLE telemetry_events IS 'Structured telemetry events and logs';
COMMENT ON TABLE telemetry_metrics_rollup IS 'Hourly rollup of telemetry metrics';
COMMENT ON TABLE dataset_artifacts IS 'Curated dataset artifacts for training';
COMMENT ON TABLE dataset_quality_metrics IS 'Quality metrics for dataset artifacts';
COMMENT ON TABLE documentation_portals IS 'Generated documentation portals';
COMMENT ON TABLE documentation_sections IS 'Sections within documentation portals';
COMMENT ON TABLE decisions IS 'Decision records for explainability';
COMMENT ON TABLE explanation_cache IS 'Cached explanations for decisions';
