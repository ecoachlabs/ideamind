-- Workflow Versioning Tables
-- Enables mid-run workflow upgrades and version management

-- Workflow versions table
CREATE TABLE IF NOT EXISTS workflow_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id VARCHAR(100) NOT NULL,
  version VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  phases TEXT[] NOT NULL,
  phase_configs JSONB NOT NULL DEFAULT '{}'::jsonb,
  breaking_changes BOOLEAN NOT NULL DEFAULT false,
  migration_notes TEXT,
  deprecated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(workflow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow_id ON workflow_versions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_version ON workflow_versions(version);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_deprecated ON workflow_versions(deprecated);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_created_at ON workflow_versions(created_at);

-- Add workflow_version column to runs table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'runs' AND column_name = 'workflow_version'
  ) THEN
    ALTER TABLE runs ADD COLUMN workflow_version VARCHAR(50) DEFAULT '1.0.0';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_runs_workflow_version ON runs(workflow_version);

-- Workflow upgrade log (tracks all upgrade attempts)
CREATE TABLE IF NOT EXISTS workflow_upgrade_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  from_version VARCHAR(50) NOT NULL,
  to_version VARCHAR(50) NOT NULL,
  current_phase VARCHAR(50),
  status VARCHAR(20) NOT NULL,
  steps_executed TEXT[] DEFAULT ARRAY[]::TEXT[],
  error_message TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  initiated_by VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_workflow_upgrade_log_run_id ON workflow_upgrade_log(run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_upgrade_log_status ON workflow_upgrade_log(status);
CREATE INDEX IF NOT EXISTS idx_workflow_upgrade_log_started_at ON workflow_upgrade_log(started_at);

-- Comments
COMMENT ON TABLE workflow_versions IS 'Registry of workflow versions with semver and phase definitions';
COMMENT ON COLUMN workflow_versions.version IS 'Semantic version (e.g., 1.2.3)';
COMMENT ON COLUMN workflow_versions.breaking_changes IS 'If true, cannot upgrade mid-run';
COMMENT ON COLUMN workflow_versions.deprecated IS 'If true, version should not be used for new runs';
COMMENT ON COLUMN workflow_versions.phase_configs IS 'Configuration for each phase in this version';

COMMENT ON TABLE workflow_upgrade_log IS 'Audit trail for all workflow version upgrades (mid-run and post-run)';
COMMENT ON COLUMN workflow_upgrade_log.status IS 'Status: started, completed, failed, rolled_back';

-- Insert initial workflow version (1.0.0)
INSERT INTO workflow_versions (
  workflow_id,
  version,
  description,
  phases,
  phase_configs,
  breaking_changes,
  created_by,
  metadata
) VALUES (
  'idea-to-ga',
  '1.0.0',
  'Initial IdeaMine workflow version with 13 phases',
  ARRAY['intake', 'ideation', 'critique', 'prd', 'bizdev', 'architecture', 'build', 'security', 'story-loop', 'qa', 'aesthetic', 'release', 'beta'],
  '{}'::jsonb,
  false,
  'system',
  '{"initial_version": true}'::jsonb
) ON CONFLICT (workflow_id, version) DO NOTHING;
