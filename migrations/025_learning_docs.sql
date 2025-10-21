-- Migration 025: Learning & Docs
-- Adds design critiques, telemetry events, dataset samples, and portal generations

-- Design Critiques
CREATE TABLE IF NOT EXISTS design_critiques (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id VARCHAR(100) NOT NULL,
  prd_artifact_id VARCHAR(100) NOT NULL,
  issues JSONB NOT NULL,
  critical_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  medium_count INTEGER NOT NULL DEFAULT 0,
  low_count INTEGER NOT NULL DEFAULT 0,
  overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_run ON design_critiques(run_id);
CREATE INDEX IF NOT EXISTS idx_design_score ON design_critiques(overall_score);

-- Learning Loop: Telemetry Events
CREATE TABLE IF NOT EXISTS telemetry_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id VARCHAR(100) NOT NULL,
  task_type VARCHAR(100) NOT NULL,
  success BOOLEAN NOT NULL,
  duration INTEGER NOT NULL,
  model_used VARCHAR(100) NOT NULL,
  input_hash VARCHAR(64) NOT NULL,
  output_hash VARCHAR(64) NOT NULL,
  human_feedback DECIMAL(3,2),
  origin VARCHAR(20) NOT NULL CHECK (origin IN ('human', 'ai-generated', 'hybrid')),
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_task ON telemetry_events(task_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry_events(created_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_model ON telemetry_events(model_used);

-- Dataset Samples for Learning
CREATE TABLE IF NOT EXISTS dataset_samples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  input_hash VARCHAR(64) NOT NULL,
  output_hash VARCHAR(64) NOT NULL,
  labeled_origin VARCHAR(20) NOT NULL,
  synthetic_confidence DECIMAL(3,2),
  included_in_training BOOLEAN DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dataset_hash ON dataset_samples(input_hash, output_hash);
CREATE INDEX IF NOT EXISTS idx_dataset_training ON dataset_samples(included_in_training);

-- Developer Portal Generations
CREATE TABLE IF NOT EXISTS portal_generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id VARCHAR(100) NOT NULL,
  portal_type VARCHAR(50) NOT NULL,
  content JSONB NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_run ON portal_generations(run_id);
CREATE INDEX IF NOT EXISTS idx_portal_type ON portal_generations(portal_type);
