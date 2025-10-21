-- Clarification Loops Table
-- Tracks Q/A/V clarification cycles during phase execution

CREATE TABLE IF NOT EXISTS clarification_loops (
  id SERIAL PRIMARY KEY,
  run_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  questions_generated INTEGER NOT NULL DEFAULT 0,
  questions_answered INTEGER NOT NULL DEFAULT 0,
  grounding_score NUMERIC(3,2) DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'requires_human')),
  validation JSONB,  -- Full validation result
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, phase)
);

-- Indexes
CREATE INDEX idx_clarification_run_id ON clarification_loops(run_id);
CREATE INDEX idx_clarification_status ON clarification_loops(status);
CREATE INDEX idx_clarification_grounding ON clarification_loops(grounding_score DESC);

-- View for active clarification loops
CREATE OR REPLACE VIEW active_clarification_loops AS
SELECT 
  run_id,
  phase,
  attempt,
  max_attempts,
  questions_generated,
  questions_answered,
  grounding_score,
  status,
  created_at,
  updated_at
FROM clarification_loops
WHERE status = 'in_progress'
ORDER BY created_at DESC;

-- View for failed clarifications requiring human input
CREATE OR REPLACE VIEW clarifications_requiring_human AS
SELECT 
  run_id,
  phase,
  attempt,
  questions_generated,
  questions_answered,
  grounding_score,
  validation,
  created_at
FROM clarification_loops
WHERE status = 'requires_human'
ORDER BY created_at DESC;

COMMENT ON TABLE clarification_loops IS 'Tracks Q/A/V clarification cycles during phase execution';
COMMENT ON COLUMN clarification_loops.grounding_score IS 'Overall grounding score from validation (0.0 to 1.0)';
COMMENT ON COLUMN clarification_loops.validation IS 'Full ValidationResult from Q/A/V cycle';
