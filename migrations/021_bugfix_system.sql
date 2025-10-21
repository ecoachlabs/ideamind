-- Bug-Fix System Tables
-- Autonomous bug detection, reproduction, fixing, and verification
-- Spec: IdeaMine Autonomous Bug-Fix System Spec v1.0

-- Bugs table - Main bug tracking
CREATE TABLE IF NOT EXISTS bugs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(500) NOT NULL,
  severity VARCHAR(10) NOT NULL, -- 'P0', 'P1', 'P2', 'P3'
  area VARCHAR(100) NOT NULL, -- 'backend', 'frontend', 'database', 'security', etc.
  type VARCHAR(50) NOT NULL, -- 'functional', 'performance', 'security', 'ux', 'data'
  status VARCHAR(50) NOT NULL DEFAULT 'new', -- 'new', 'triaged', 'reproducing', 'fixing', 'verifying', 'canary', 'fixed', 'regressed', 'flake', 'needs-signal'
  source VARCHAR(100) NOT NULL, -- 'qa_e2e', 'qa_load', 'security_dast', 'telemetry', 'beta', 'fuzzer', 'story_loop_ci'
  first_seen TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMP NOT NULL DEFAULT NOW(),
  fingerprint VARCHAR(64) NOT NULL, -- SHA256 hash for deduplication
  repro_id UUID, -- Reference to repro_artifacts
  fix_pr VARCHAR(255), -- PR URL/ID
  owner_agent VARCHAR(100), -- Agent currently working on it
  sla_at TIMESTAMP, -- SLA deadline based on severity
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status);
CREATE INDEX IF NOT EXISTS idx_bugs_severity ON bugs(severity);
CREATE INDEX IF NOT EXISTS idx_bugs_type ON bugs(type);
CREATE INDEX IF NOT EXISTS idx_bugs_area ON bugs(area);
CREATE INDEX IF NOT EXISTS idx_bugs_source ON bugs(source);
CREATE INDEX IF NOT EXISTS idx_bugs_fingerprint ON bugs(fingerprint);
CREATE INDEX IF NOT EXISTS idx_bugs_sla_at ON bugs(sla_at);
CREATE INDEX IF NOT EXISTS idx_bugs_created_at ON bugs(created_at);

COMMENT ON TABLE bugs IS 'Bug tracking for autonomous bug-fix system';
COMMENT ON COLUMN bugs.severity IS 'Priority: P0 (critical), P1 (high), P2 (medium), P3 (low)';
COMMENT ON COLUMN bugs.fingerprint IS 'SHA256 hash of stack signature for deduplication';
COMMENT ON COLUMN bugs.sla_at IS 'SLA deadline: P0=4h, P1=24h, P2=7d, P3=30d';

-- Repro artifacts table - Minimal reproducible cases
CREATE TABLE IF NOT EXISTS repro_artifacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'script', 'test', 'docker', 'curl', 'sql'
  uri TEXT NOT NULL, -- File path or URL
  sha256 VARCHAR(64) NOT NULL,
  env_spec JSONB NOT NULL DEFAULT '{}'::jsonb, -- Docker image, deps, env vars, seeds
  determinism_score NUMERIC(3,2) NOT NULL, -- 0.00 to 1.00 (1.00 = always reproduces)
  runs_passed INTEGER DEFAULT 0,
  runs_failed INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_repro_artifacts_bug_id ON repro_artifacts(bug_id);
CREATE INDEX IF NOT EXISTS idx_repro_artifacts_determinism_score ON repro_artifacts(determinism_score);

COMMENT ON TABLE repro_artifacts IS 'Minimal reproducible cases for bugs';
COMMENT ON COLUMN repro_artifacts.determinism_score IS 'Probability of reproducing bug (0.0-1.0)';
COMMENT ON COLUMN repro_artifacts.env_spec IS 'Environment specification: {docker_image, deps, env_vars, random_seed}';

-- RCA table - Root cause analysis
CREATE TABLE IF NOT EXISTS rca (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  first_bad_commit VARCHAR(40), -- Git SHA
  files TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], -- Files involved in bug
  root_cause TEXT NOT NULL, -- Human-readable root cause description
  evidence_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], -- Links to logs, traces, etc.
  causal_chain JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{step, artifact, reasoning}]
  confidence NUMERIC(3,2) NOT NULL, -- 0.00 to 1.00
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(bug_id)
);

CREATE INDEX IF NOT EXISTS idx_rca_bug_id ON rca(bug_id);
CREATE INDEX IF NOT EXISTS idx_rca_first_bad_commit ON rca(first_bad_commit);

COMMENT ON TABLE rca IS 'Root cause analysis for bugs';
COMMENT ON COLUMN rca.causal_chain IS 'Causal chain: defect → faulty code → trigger → effect';

-- Patches table - Fix patches/PRs
CREATE TABLE IF NOT EXISTS patches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pr_id VARCHAR(255) NOT NULL UNIQUE,
  bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  diff_uri TEXT NOT NULL, -- Path to diff file
  diff_sha256 VARCHAR(64) NOT NULL,
  lint_ok BOOLEAN DEFAULT false,
  tests_ok BOOLEAN DEFAULT false,
  sec_ok BOOLEAN DEFAULT false,
  perf_ok BOOLEAN DEFAULT false,
  coverage_ok BOOLEAN DEFAULT false,
  rationale TEXT NOT NULL, -- Why this fix works
  files_changed TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  lines_added INTEGER DEFAULT 0,
  lines_removed INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  merged_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_patches_bug_id ON patches(bug_id);
CREATE INDEX IF NOT EXISTS idx_patches_pr_id ON patches(pr_id);
CREATE INDEX IF NOT EXISTS idx_patches_created_at ON patches(created_at);

COMMENT ON TABLE patches IS 'Patches/PRs for bug fixes';
COMMENT ON COLUMN patches.rationale IS 'Explanation of why this fix addresses the root cause';

-- Tests table - Regression tests
CREATE TABLE IF NOT EXISTS bug_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL, -- 'unit', 'property', 'integration', 'e2e', 'mutation'
  path TEXT NOT NULL, -- Test file path
  was_failing BOOLEAN NOT NULL, -- Did it fail before fix?
  now_passing BOOLEAN NOT NULL, -- Does it pass after fix?
  mutation_kill_rate NUMERIC(3,2), -- 0.00 to 1.00 for mutation tests
  determinism_score NUMERIC(3,2) NOT NULL, -- 0.00 to 1.00 (flake detection)
  runs_passed INTEGER DEFAULT 0,
  runs_failed INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_bug_tests_bug_id ON bug_tests(bug_id);
CREATE INDEX IF NOT EXISTS idx_bug_tests_kind ON bug_tests(kind);
CREATE INDEX IF NOT EXISTS idx_bug_tests_determinism_score ON bug_tests(determinism_score);

COMMENT ON TABLE bug_tests IS 'Regression tests for bugs';
COMMENT ON COLUMN bug_tests.mutation_kill_rate IS 'Percentage of mutants killed by this test (0.0-1.0)';
COMMENT ON COLUMN bug_tests.determinism_score IS 'Test stability: 1.0 = no flake, <0.9 = flaky';

-- Bug events table - Event stream
CREATE TABLE IF NOT EXISTS bug_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- 'found', 'triaged', 'reproduced', 'rca.ready', 'patch.proposed', 'tests.authored', 'verified', 'canary.started', 'fixed', 'regressed'
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_bug_events_bug_id ON bug_events(bug_id);
CREATE INDEX IF NOT EXISTS idx_bug_events_event_type ON bug_events(event_type);
CREATE INDEX IF NOT EXISTS idx_bug_events_timestamp ON bug_events(timestamp);

COMMENT ON TABLE bug_events IS 'Event stream for bug lifecycle';

-- Flaky tests quarantine
CREATE TABLE IF NOT EXISTS flaky_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_path TEXT NOT NULL UNIQUE,
  bug_id UUID REFERENCES bugs(id) ON DELETE SET NULL,
  flake_rate NUMERIC(3,2) NOT NULL, -- 0.00 to 1.00
  total_runs INTEGER NOT NULL,
  failed_runs INTEGER NOT NULL,
  first_detected TIMESTAMP NOT NULL DEFAULT NOW(),
  last_flake TIMESTAMP NOT NULL DEFAULT NOW(),
  quarantined BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_flaky_tests_test_path ON flaky_tests(test_path);
CREATE INDEX IF NOT EXISTS idx_flaky_tests_quarantined ON flaky_tests(quarantined);
CREATE INDEX IF NOT EXISTS idx_flaky_tests_flake_rate ON flaky_tests(flake_rate);

COMMENT ON TABLE flaky_tests IS 'Quarantine for flaky tests';
COMMENT ON COLUMN flaky_tests.flake_rate IS 'Failure rate: failed_runs / total_runs';

-- Canary rollouts
CREATE TABLE IF NOT EXISTS canary_rollouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patch_id UUID NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  bug_id UUID NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  feature_flag VARCHAR(255) NOT NULL,
  traffic_pct INTEGER NOT NULL DEFAULT 0, -- 0 to 100
  monitors JSONB NOT NULL DEFAULT '[]'::jsonb, -- ['p95', 'error_rate', 'crash_rate']
  status VARCHAR(50) NOT NULL DEFAULT 'started', -- 'started', 'ramping', 'complete', 'rolled_back'
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  rolled_back_at TIMESTAMP,
  rollback_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_canary_rollouts_patch_id ON canary_rollouts(patch_id);
CREATE INDEX IF NOT EXISTS idx_canary_rollouts_bug_id ON canary_rollouts(bug_id);
CREATE INDEX IF NOT EXISTS idx_canary_rollouts_status ON canary_rollouts(status);

COMMENT ON TABLE canary_rollouts IS 'Canary deployments for bug fixes';
COMMENT ON COLUMN canary_rollouts.traffic_pct IS 'Percentage of traffic receiving fix (0-100)';

-- Views for dashboards
CREATE OR REPLACE VIEW bug_fix_funnel AS
SELECT
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) / 3600 as avg_hours
FROM bugs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY status
ORDER BY
  CASE status
    WHEN 'new' THEN 1
    WHEN 'triaged' THEN 2
    WHEN 'reproducing' THEN 3
    WHEN 'fixing' THEN 4
    WHEN 'verifying' THEN 5
    WHEN 'canary' THEN 6
    WHEN 'fixed' THEN 7
    ELSE 8
  END;

COMMENT ON VIEW bug_fix_funnel IS 'Bug-fix funnel for MTTR tracking';

-- Function to calculate SLA deadline based on severity
CREATE OR REPLACE FUNCTION calculate_bug_sla(severity VARCHAR)
RETURNS TIMESTAMP AS $$
BEGIN
  RETURN NOW() +
    CASE severity
      WHEN 'P0' THEN INTERVAL '4 hours'
      WHEN 'P1' THEN INTERVAL '24 hours'
      WHEN 'P2' THEN INTERVAL '7 days'
      WHEN 'P3' THEN INTERVAL '30 days'
      ELSE INTERVAL '7 days'
    END;
END;
$$ LANGUAGE plpgsql;

-- Trigger to set SLA on bug creation
CREATE OR REPLACE FUNCTION set_bug_sla()
RETURNS TRIGGER AS $$
BEGIN
  NEW.sla_at := calculate_bug_sla(NEW.severity);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_bug_sla
  BEFORE INSERT ON bugs
  FOR EACH ROW
  EXECUTE FUNCTION set_bug_sla();
