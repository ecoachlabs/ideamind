-- ============================================================================
-- Foundation Layer Database Migration (v008)
-- Spec: UNIFIED_IMPLEMENTATION_SPEC.md Section 1.7
-- ============================================================================
-- Creates core tables for phase execution tracking, evidence packs, and
-- assumptions registry. This migration establishes the foundation for all
-- orchestrator operations.
--
-- Tables Created:
--   1. phases - Phase execution state and metadata
--   2. assumptions - Assumptions flagged during Q/A/V process
--   3. evidence_packs - Gate evaluation evidence (generalized for all phases)
--
-- Enhancements to Existing Tables:
--   - runs: Add version and plan_hash columns
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. Enhance runs table with versioning and plan hash
-- ============================================================================

-- Add version column for deterministic replay
ALTER TABLE runs ADD COLUMN IF NOT EXISTS version VARCHAR(20) DEFAULT '1.0.0';

-- Add plan_hash for detecting plan changes
ALTER TABLE runs ADD COLUMN IF NOT EXISTS plan_hash VARCHAR(64);

-- Create index on plan_hash for quick lookups
CREATE INDEX IF NOT EXISTS idx_runs_plan_hash ON runs(plan_hash);

COMMENT ON COLUMN runs.version IS 'Run plan version for deterministic replay';
COMMENT ON COLUMN runs.plan_hash IS 'SHA256 hash of complete run plan for change detection';

-- ============================================================================
-- 2. Phases table - Track execution state per phase
-- ============================================================================

CREATE TABLE IF NOT EXISTS phases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'blocked')),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Budget tracking
  budgets JSONB NOT NULL DEFAULT '{}'::jsonb,
  usage JSONB DEFAULT '{}'::jsonb,

  -- Phase plan hash for deterministic replay
  plan_hash VARCHAR(64),

  -- Evidence pack reference
  evidence_pack_id UUID,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,

  -- Constraints
  UNIQUE(run_id, phase_id),
  CHECK (budgets IS NOT NULL),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_phases_run_id ON phases(run_id);
CREATE INDEX IF NOT EXISTS idx_phases_status ON phases(status);
CREATE INDEX IF NOT EXISTS idx_phases_phase_id ON phases(phase_id);
CREATE INDEX IF NOT EXISTS idx_phases_plan_hash ON phases(plan_hash);
CREATE INDEX IF NOT EXISTS idx_phases_completed_at ON phases(completed_at);

-- Comments
COMMENT ON TABLE phases IS 'Tracks execution state and metrics for each phase in a run';
COMMENT ON COLUMN phases.phase_id IS 'Phase identifier (e.g., intake, security, story-loop)';
COMMENT ON COLUMN phases.budgets IS 'Budget limits (tokens, tools_minutes, gpu_hours)';
COMMENT ON COLUMN phases.usage IS 'Actual usage recorded during execution';
COMMENT ON COLUMN phases.plan_hash IS 'SHA256 hash of phase plan for deterministic replay';
COMMENT ON COLUMN phases.evidence_pack_id IS 'Reference to evidence pack for gate evaluation';

-- ============================================================================
-- 3. Assumptions table - Track assumptions flagged during Q/A/V
-- ============================================================================

CREATE TABLE IF NOT EXISTS assumptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase_id VARCHAR(50) NOT NULL,

  -- Assumption details
  assumption TEXT NOT NULL,
  rationale TEXT,
  category VARCHAR(50),  -- e.g., 'technical', 'business', 'legal', 'security'

  -- Mitigation
  mitigation_task_id UUID,  -- Reference to task that will validate/mitigate
  mitigation_status VARCHAR(20) DEFAULT 'pending'
    CHECK (mitigation_status IN ('pending', 'in_progress', 'validated', 'waived', 'failed')),

  -- Status tracking
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'validated', 'invalidated', 'waived')),

  -- Ownership
  flagged_by VARCHAR(100),  -- Agent/tool that flagged this assumption
  owner VARCHAR(100),       -- Person/team responsible for validation

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  validated_at TIMESTAMP,
  waived_at TIMESTAMP,

  -- Constraints
  CHECK (assumption <> ''),
  CHECK (validated_at IS NULL OR validated_at >= created_at)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_assumptions_run_id ON assumptions(run_id);
CREATE INDEX IF NOT EXISTS idx_assumptions_phase_id ON assumptions(phase_id);
CREATE INDEX IF NOT EXISTS idx_assumptions_status ON assumptions(status);
CREATE INDEX IF NOT EXISTS idx_assumptions_mitigation_status ON assumptions(mitigation_status);
CREATE INDEX IF NOT EXISTS idx_assumptions_category ON assumptions(category);
CREATE INDEX IF NOT EXISTS idx_assumptions_created_at ON assumptions(created_at);

-- Comments
COMMENT ON TABLE assumptions IS 'Tracks assumptions flagged during Q/A/V process across all phases';
COMMENT ON COLUMN assumptions.assumption IS 'The assumption statement';
COMMENT ON COLUMN assumptions.rationale IS 'Why this assumption was made';
COMMENT ON COLUMN assumptions.mitigation_task_id IS 'Reference to task that will validate this assumption';
COMMENT ON COLUMN assumptions.category IS 'Assumption category for filtering and reporting';
COMMENT ON COLUMN assumptions.flagged_by IS 'Agent or tool that identified this assumption';

-- ============================================================================
-- 4. Evidence Packs table - Gate evaluation evidence (all phases)
-- ============================================================================

CREATE TABLE IF NOT EXISTS evidence_packs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase_id VARCHAR(50) NOT NULL,

  -- Evidence content
  artifacts JSONB NOT NULL DEFAULT '[]'::jsonb,           -- Array of artifact IDs
  guard_reports JSONB NOT NULL DEFAULT '[]'::jsonb,       -- Guard evaluation results
  qav_summary JSONB,                                      -- Q/A/V triad summary
  kmap_refs JSONB DEFAULT '[]'::jsonb,                    -- Knowledge Map references
  metrics JSONB,                                          -- Execution metrics

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,

  -- Constraints
  CHECK (artifacts IS NOT NULL),
  CHECK (guard_reports IS NOT NULL),
  UNIQUE(run_id, phase_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_evidence_packs_run_id ON evidence_packs(run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_packs_phase_id ON evidence_packs(phase_id);
CREATE INDEX IF NOT EXISTS idx_evidence_packs_created_at ON evidence_packs(created_at);

-- GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_evidence_packs_artifacts_gin ON evidence_packs USING GIN (artifacts);
CREATE INDEX IF NOT EXISTS idx_evidence_packs_guard_reports_gin ON evidence_packs USING GIN (guard_reports);

-- Comments
COMMENT ON TABLE evidence_packs IS 'Stores gate evaluation evidence for all phases (generalized structure)';
COMMENT ON COLUMN evidence_packs.artifacts IS 'Array of artifact IDs produced by this phase';
COMMENT ON COLUMN evidence_packs.guard_reports IS 'Guard evaluation results (contradictions, citations, etc.)';
COMMENT ON COLUMN evidence_packs.qav_summary IS 'Question/Answer/Validation triad summary (grounding scores, assumptions)';
COMMENT ON COLUMN evidence_packs.kmap_refs IS 'Knowledge Map frame IDs referenced or created';
COMMENT ON COLUMN evidence_packs.metrics IS 'Phase execution metrics (duration, tokens, cost)';

-- ============================================================================
-- 5. Create foreign key from phases to evidence_packs
-- ============================================================================

-- Note: Cannot add FK constraint in CREATE TABLE above due to circular dependency
-- evidence_packs must exist before phases can reference it
ALTER TABLE phases
  DROP CONSTRAINT IF EXISTS fk_phases_evidence_pack;

ALTER TABLE phases
  ADD CONSTRAINT fk_phases_evidence_pack
  FOREIGN KEY (evidence_pack_id)
  REFERENCES evidence_packs(id)
  ON DELETE SET NULL;

-- ============================================================================
-- 6. Migration metadata
-- ============================================================================

-- Create migrations tracking table if it doesn't exist
CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  version INTEGER UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Record this migration
INSERT INTO migrations (version, name)
VALUES (8, '008_foundation_tables')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- Migration complete
-- ============================================================================

-- Log success
DO $$
BEGIN
  RAISE NOTICE 'Foundation Layer migration (v008) completed successfully';
  RAISE NOTICE 'Created tables: phases, assumptions, evidence_packs';
  RAISE NOTICE 'Enhanced tables: runs (added version, plan_hash)';
END $$;
