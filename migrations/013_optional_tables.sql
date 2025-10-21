-- ============================================================================
-- Migration 013: Optional Tables (Waivers and Release Dossiers)
-- Spec: UNIFIED_IMPLEMENTATION_SPEC_PART2.md Section 6.3
-- ============================================================================
-- Creates optional tables for advanced features:
--   - waivers: Track gate violation waivers with expiration
--   - release_dossiers: Store compiled release artifacts
--
-- These tables are optional and can be skipped if features not needed.
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- WAIVERS TABLE
-- ============================================================================
-- Tracks gate violation waivers with expiration and compensating controls
-- Allows specific gate failures to be waived with proper justification

CREATE TABLE IF NOT EXISTS waivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL,
  phase VARCHAR(50) NOT NULL,

  -- Violation details
  violation_type VARCHAR(100) NOT NULL,  -- e.g., 'critical_cves_max_exceeded', 'test_coverage_too_low'
  violation_details JSONB,               -- Details of the violation

  -- Waiver management
  owner VARCHAR(100) NOT NULL,           -- Person/team responsible for waiver
  justification TEXT NOT NULL,           -- Why this waiver is needed
  compensating_control TEXT,             -- Alternative control in place

  -- Expiration
  expires_at TIMESTAMPTZ NOT NULL,       -- When waiver expires

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'expired', 'revoked', 'closed')
  ),

  -- Approval
  approved_by VARCHAR(100),
  approved_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,

  -- Foreign keys
  CONSTRAINT fk_waivers_run FOREIGN KEY (run_id)
    REFERENCES workflow_runs(id) ON DELETE CASCADE
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_waivers_run_id ON waivers(run_id);
CREATE INDEX IF NOT EXISTS idx_waivers_phase ON waivers(phase);
CREATE INDEX IF NOT EXISTS idx_waivers_status ON waivers(status);
CREATE INDEX IF NOT EXISTS idx_waivers_expires_at ON waivers(expires_at);
CREATE INDEX IF NOT EXISTS idx_waivers_owner ON waivers(owner);
CREATE INDEX IF NOT EXISTS idx_waivers_violation_type ON waivers(violation_type);

-- ============================================================================
-- RELEASE DOSSIERS TABLE
-- ============================================================================
-- Stores compiled release artifacts for audit trail and reproducibility
-- Contains all artifacts needed for release: PRD, code, security pack, etc.

CREATE TABLE IF NOT EXISTS release_dossiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL UNIQUE,  -- One dossier per run

  -- Version information
  version VARCHAR(20) NOT NULL,
  release_name VARCHAR(100),

  -- Dossier content (comprehensive artifact compilation)
  content JSONB NOT NULL,  -- Complete ReleaseDossier object

  -- Metadata
  compiled_by VARCHAR(100),
  compilation_duration_ms INTEGER,

  -- Signatures
  signature_hash VARCHAR(64),  -- SHA256 of content for integrity
  signed_at TIMESTAMPTZ,

  -- Export tracking
  exported_formats JSONB DEFAULT '[]'::jsonb,  -- Array of exported formats (json, pdf, html)
  last_exported_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Foreign keys
  CONSTRAINT fk_release_dossiers_run FOREIGN KEY (run_id)
    REFERENCES workflow_runs(id) ON DELETE CASCADE
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_release_dossiers_run_id ON release_dossiers(run_id);
CREATE INDEX IF NOT EXISTS idx_release_dossiers_version ON release_dossiers(version);
CREATE INDEX IF NOT EXISTS idx_release_dossiers_created_at ON release_dossiers(created_at DESC);

-- GIN index for content queries
CREATE INDEX IF NOT EXISTS idx_release_dossiers_content_gin ON release_dossiers USING GIN (content);

-- ============================================================================
-- VIEWS FOR MONITORING
-- ============================================================================

-- Active waivers view
CREATE OR REPLACE VIEW active_waivers AS
SELECT
  w.id,
  w.run_id,
  w.phase,
  w.violation_type,
  w.owner,
  w.justification,
  w.compensating_control,
  w.expires_at,
  w.approved_by,
  w.created_at,
  EXTRACT(EPOCH FROM (w.expires_at - NOW())) AS seconds_until_expiration
FROM waivers w
WHERE w.status = 'active'
  AND w.expires_at > NOW()
ORDER BY w.expires_at ASC;

-- Expired waivers needing attention
CREATE OR REPLACE VIEW expired_waivers AS
SELECT
  w.id,
  w.run_id,
  w.phase,
  w.violation_type,
  w.owner,
  w.expires_at,
  w.created_at
FROM waivers w
WHERE w.status = 'active'
  AND w.expires_at <= NOW()
ORDER BY w.expires_at DESC;

-- Recent release dossiers
CREATE OR REPLACE VIEW recent_release_dossiers AS
SELECT
  rd.id,
  rd.run_id,
  rd.version,
  rd.release_name,
  rd.compiled_by,
  rd.created_at,
  rd.exported_formats,
  rd.signature_hash,
  (content->>'product_artifacts') AS product_artifacts_summary,
  (content->>'security_artifacts') AS security_artifacts_summary
FROM release_dossiers rd
ORDER BY rd.created_at DESC
LIMIT 100;

-- ============================================================================
-- FUNCTIONS FOR WAIVER MANAGEMENT
-- ============================================================================

-- Automatically expire waivers
CREATE OR REPLACE FUNCTION expire_waivers()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE waivers
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'active'
    AND expires_at <= NOW();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Revoke waiver
CREATE OR REPLACE FUNCTION revoke_waiver(waiver_id UUID, revoked_by VARCHAR(100), reason TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE waivers
  SET status = 'revoked',
      updated_at = NOW(),
      revoked_at = NOW(),
      violation_details = jsonb_set(
        COALESCE(violation_details, '{}'::jsonb),
        '{revocation}',
        jsonb_build_object(
          'revoked_by', revoked_by,
          'reason', reason,
          'revoked_at', NOW()
        )
      )
  WHERE id = waiver_id
    AND status = 'active';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Check if waiver exists for violation
CREATE OR REPLACE FUNCTION has_active_waiver(
  p_run_id UUID,
  p_phase VARCHAR(50),
  p_violation_type VARCHAR(100)
)
RETURNS BOOLEAN AS $$
DECLARE
  waiver_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM waivers
    WHERE run_id = p_run_id
      AND phase = p_phase
      AND violation_type = p_violation_type
      AND status = 'active'
      AND expires_at > NOW()
  ) INTO waiver_exists;

  RETURN waiver_exists;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTIONS FOR RELEASE DOSSIER
-- ============================================================================

-- Get dossier content size
CREATE OR REPLACE FUNCTION get_dossier_size(dossier_id UUID)
RETURNS INTEGER AS $$
DECLARE
  size_bytes INTEGER;
BEGIN
  SELECT pg_column_size(content)
  INTO size_bytes
  FROM release_dossiers
  WHERE id = dossier_id;

  RETURN size_bytes;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC MAINTENANCE
-- ============================================================================

-- Update updated_at timestamp on waiver changes
CREATE OR REPLACE FUNCTION update_waiver_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_waiver_timestamp
  BEFORE UPDATE ON waivers
  FOR EACH ROW
  EXECUTE FUNCTION update_waiver_timestamp();

-- Automatically calculate signature hash on dossier insert/update
CREATE OR REPLACE FUNCTION calculate_dossier_signature()
RETURNS TRIGGER AS $$
BEGIN
  NEW.signature_hash = encode(digest(NEW.content::text, 'sha256'), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_dossier_signature
  BEFORE INSERT OR UPDATE ON release_dossiers
  FOR EACH ROW
  WHEN (NEW.content IS NOT NULL)
  EXECUTE FUNCTION calculate_dossier_signature();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE waivers IS 'Tracks gate violation waivers with expiration and compensating controls';
COMMENT ON TABLE release_dossiers IS 'Stores compiled release artifacts for audit trail and reproducibility';

COMMENT ON COLUMN waivers.violation_type IS 'Type of gate violation being waived';
COMMENT ON COLUMN waivers.compensating_control IS 'Alternative control in place to mitigate risk';
COMMENT ON COLUMN waivers.expires_at IS 'When waiver expires and must be renewed';

COMMENT ON COLUMN release_dossiers.content IS 'Complete ReleaseDossier JSON object with all artifacts';
COMMENT ON COLUMN release_dossiers.signature_hash IS 'SHA256 hash of content for integrity verification';

-- ============================================================================
-- GRANTS (adjust for your security model)
-- ============================================================================

-- GRANT SELECT, INSERT, UPDATE ON waivers TO orchestrator_app;
-- GRANT SELECT, INSERT ON release_dossiers TO orchestrator_app;
-- GRANT EXECUTE ON FUNCTION expire_waivers() TO orchestrator_app;
-- GRANT EXECUTE ON FUNCTION revoke_waiver(UUID, VARCHAR, TEXT) TO orchestrator_app;
-- GRANT EXECUTE ON FUNCTION has_active_waiver(UUID, VARCHAR, VARCHAR) TO orchestrator_app;

-- ============================================================================
-- Migration complete
-- ============================================================================

-- Log success
DO $$
BEGIN
  RAISE NOTICE 'Optional Tables migration (v013) completed successfully';
  RAISE NOTICE 'Created tables: waivers, release_dossiers';
  RAISE NOTICE 'Created 5 views, 5 functions, and 2 triggers';
END $$;
