-- Missing Tables for New Features
-- Adds tables required by recently implemented components

-- Signals table (for SignalManager)
CREATE TABLE IF NOT EXISTS signals (
  signal_id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(20) NOT NULL, -- 'pause', 'resume', 'retry', 'cancel'
  target_type VARCHAR(20) NOT NULL, -- 'run', 'phase', 'task'
  target_id VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  sent_by VARCHAR(255) NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'acknowledged', 'ignored'
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_signals_target ON signals(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_sent_at ON signals(sent_at);

COMMENT ON TABLE signals IS 'Temporal-style signals for orchestrator control (pause, resume, retry, cancel)';
COMMENT ON COLUMN signals.target_type IS 'Signal target: run, phase, task';
COMMENT ON COLUMN signals.type IS 'Signal type: pause, resume, retry, cancel';
COMMENT ON COLUMN signals.status IS 'Status: pending (not yet processed), acknowledged (processed), ignored';

-- Heartbeats table (for HeartbeatAPI)
CREATE TABLE IF NOT EXISTS heartbeats (
  id VARCHAR(255) PRIMARY KEY,
  task_id VARCHAR(255) NOT NULL,
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  progress_pct NUMERIC(5,2) NOT NULL, -- 0.00 to 100.00
  eta TIMESTAMP,
  metrics JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_task_id ON heartbeats(task_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_run_id ON heartbeats(run_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp ON heartbeats(timestamp);

COMMENT ON TABLE heartbeats IS 'Task heartbeats for progress monitoring and stall detection';
COMMENT ON COLUMN heartbeats.progress_pct IS 'Progress percentage (0-100)';
COMMENT ON COLUMN heartbeats.eta IS 'Estimated time of completion';

-- Gate evaluations table (for GatesAPI)
CREATE TABLE IF NOT EXISTS gate_evaluations (
  id VARCHAR(255) PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL, -- 'pass', 'fail', 'warn'
  score NUMERIC(5,2) NOT NULL,
  threshold NUMERIC(5,2) NOT NULL,
  decision_reasons TEXT[] DEFAULT ARRAY[]::TEXT[],
  blocking_violations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  evidence_pack_id VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_gate_evaluations_run_id ON gate_evaluations(run_id);
CREATE INDEX IF NOT EXISTS idx_gate_evaluations_phase ON gate_evaluations(phase);
CREATE INDEX IF NOT EXISTS idx_gate_evaluations_status ON gate_evaluations(status);
CREATE INDEX IF NOT EXISTS idx_gate_evaluations_created_at ON gate_evaluations(created_at);

COMMENT ON TABLE gate_evaluations IS 'Gate evaluation results for all phases';
COMMENT ON COLUMN gate_evaluations.status IS 'Gate result: pass, fail, warn';
COMMENT ON COLUMN gate_evaluations.score IS 'Overall gate score (0-100)';
COMMENT ON COLUMN gate_evaluations.blocking_violations IS 'Violations that block phase progression';

-- Knowledge frames table (for Knowledge Refinery)
CREATE TABLE IF NOT EXISTS knowledge_frames (
  id VARCHAR(255) PRIMARY KEY,
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  question_id VARCHAR(255) NOT NULL,
  answer_id VARCHAR(255) NOT NULL,
  frame_type VARCHAR(20) NOT NULL, -- 'factual', 'procedural', 'constraint', 'assumption'
  content TEXT NOT NULL,
  evidence_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  confidence NUMERIC(3,2) NOT NULL, -- 0.00 to 1.00
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_knowledge_frames_run_id ON knowledge_frames(run_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_frames_phase ON knowledge_frames(phase);
CREATE INDEX IF NOT EXISTS idx_knowledge_frames_frame_type ON knowledge_frames(frame_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_frames_question_id ON knowledge_frames(question_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_frames_created_at ON knowledge_frames(created_at);

COMMENT ON TABLE knowledge_frames IS 'Atomic knowledge frames from Q/A/V Refinery pipeline';
COMMENT ON COLUMN knowledge_frames.frame_type IS 'Frame type: factual, procedural, constraint, assumption';
COMMENT ON COLUMN knowledge_frames.confidence IS 'Confidence score 0.00 to 1.00';

-- Add missing columns to tasks table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'last_heartbeat_at'
  ) THEN
    ALTER TABLE tasks ADD COLUMN last_heartbeat_at TIMESTAMP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'progress_pct'
  ) THEN
    ALTER TABLE tasks ADD COLUMN progress_pct NUMERIC(5,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'eta'
  ) THEN
    ALTER TABLE tasks ADD COLUMN eta TIMESTAMP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'idempotence_key'
  ) THEN
    ALTER TABLE tasks ADD COLUMN idempotence_key VARCHAR(64);
    CREATE INDEX IF NOT EXISTS idx_tasks_idempotence_key ON tasks(idempotence_key);
  END IF;
END $$;

-- Add missing columns to waivers table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'waivers' AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE waivers ADD COLUMN approved_by VARCHAR(255);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'waivers' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE waivers ADD COLUMN approved_at TIMESTAMP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'waivers' AND column_name = 'revoked_at'
  ) THEN
    ALTER TABLE waivers ADD COLUMN revoked_at TIMESTAMP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'waivers' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE waivers ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;
END $$;
