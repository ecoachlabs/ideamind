-- Continuation Tokens Table
-- Enables resumable long-running activities (20-50 hour runs)

-- Continuation tokens table
CREATE TABLE IF NOT EXISTS continuation_tokens (
  token_id VARCHAR(255) PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  activity_id VARCHAR(255) NOT NULL,
  activity_type VARCHAR(100) NOT NULL,
  chunk_index INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_items TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  remaining_items TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  progress NUMERIC(5,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  resumed_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_continuation_tokens_run_id ON continuation_tokens(run_id);
CREATE INDEX IF NOT EXISTS idx_continuation_tokens_activity_id ON continuation_tokens(activity_id);
CREATE INDEX IF NOT EXISTS idx_continuation_tokens_phase ON continuation_tokens(phase);
CREATE INDEX IF NOT EXISTS idx_continuation_tokens_expires_at ON continuation_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_continuation_tokens_created_at ON continuation_tokens(created_at);

-- Activity chunks table (tracks chunk execution)
CREATE TABLE IF NOT EXISTS activity_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  activity_id VARCHAR(255) NOT NULL,
  chunk_index INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  chunk_size INTEGER NOT NULL,
  items TEXT[] NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  results JSONB,
  error_message TEXT,
  continuation_token_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, activity_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_activity_chunks_run_id ON activity_chunks(run_id);
CREATE INDEX IF NOT EXISTS idx_activity_chunks_activity_id ON activity_chunks(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_chunks_status ON activity_chunks(status);
CREATE INDEX IF NOT EXISTS idx_activity_chunks_chunk_index ON activity_chunks(chunk_index);

-- Comments
COMMENT ON TABLE continuation_tokens IS 'Resumable tokens for long-running chunked activities (20-50h runs)';
COMMENT ON COLUMN continuation_tokens.chunk_index IS 'Next chunk to process (0-indexed)';
COMMENT ON COLUMN continuation_tokens.state IS 'Execution state to resume from';
COMMENT ON COLUMN continuation_tokens.progress IS 'Progress 0.0000 to 1.0000';
COMMENT ON COLUMN continuation_tokens.expires_at IS 'Token expires after 24 hours by default';

COMMENT ON TABLE activity_chunks IS 'Tracks execution of individual chunks within chunked activities';
COMMENT ON COLUMN activity_chunks.status IS 'Status: pending, running, completed, failed';
