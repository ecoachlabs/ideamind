-- Sagas & Compensation Tables
-- Tracks distributed transactions with compensating actions

-- Sagas table
CREATE TABLE IF NOT EXISTS sagas (
  saga_id VARCHAR(255) PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL,
  steps JSONB NOT NULL,
  step_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sagas_run_id ON sagas(run_id);
CREATE INDEX IF NOT EXISTS idx_sagas_phase ON sagas(phase);
CREATE INDEX IF NOT EXISTS idx_sagas_status ON sagas(status);
CREATE INDEX IF NOT EXISTS idx_sagas_started_at ON sagas(started_at);

-- Saga compensation log (detailed audit trail)
CREATE TABLE IF NOT EXISTS saga_compensation_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  saga_id VARCHAR(255) NOT NULL REFERENCES sagas(saga_id) ON DELETE CASCADE,
  step_id VARCHAR(255) NOT NULL,
  action_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  error_message TEXT,
  executed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_saga_compensation_log_saga_id ON saga_compensation_log(saga_id);
CREATE INDEX IF NOT EXISTS idx_saga_compensation_log_step_id ON saga_compensation_log(step_id);
CREATE INDEX IF NOT EXISTS idx_saga_compensation_log_executed_at ON saga_compensation_log(executed_at);

-- Comments
COMMENT ON TABLE sagas IS 'Distributed transactions with compensating actions (sagas pattern)';
COMMENT ON COLUMN sagas.status IS 'Status: pending, running, completed, failed, compensating, compensated, compensation_failed';
COMMENT ON COLUMN sagas.steps IS 'Saga step definitions (id, name, description only - actions not stored)';
COMMENT ON COLUMN sagas.step_results IS 'Execution results for each step (status, result, error, timestamps)';
COMMENT ON TABLE saga_compensation_log IS 'Detailed audit trail for saga compensation actions';
COMMENT ON COLUMN saga_compensation_log.action_type IS 'Type: execute, compensate';
