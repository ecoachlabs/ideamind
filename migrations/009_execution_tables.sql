-- Migration 009: Execution Layer Tables
-- Creates tables for distributed task execution, checkpoints, events, and timers
-- Spec: UNIFIED_IMPLEMENTATION_SPEC.md Section 3.6

-- ============================================================================
-- TASKS TABLE
-- ============================================================================
-- Stores individual task executions (agents and tools)
-- Links to phases for budget tracking and provenance

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL,
  run_id UUID NOT NULL,

  -- Task specification
  type VARCHAR(10) NOT NULL CHECK (type IN ('agent', 'tool')),
  target VARCHAR(255) NOT NULL,  -- Agent class name or tool ID
  input JSONB NOT NULL DEFAULT '{}',

  -- Execution state
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'cancelled')
  ),
  retries INTEGER NOT NULL DEFAULT 0,

  -- Results
  result JSONB,
  error TEXT,

  -- Resource tracking
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  duration_ms INTEGER,

  -- Worker tracking
  worker_id VARCHAR(100),
  last_heartbeat_at TIMESTAMPTZ,

  -- Idempotence
  idempotence_key VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Foreign keys
  CONSTRAINT fk_tasks_run FOREIGN KEY (run_id)
    REFERENCES workflow_runs(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_phase_id ON tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_tasks_run_id ON tasks(run_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_idempotence ON tasks(idempotence_key) WHERE idempotence_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_worker ON tasks(worker_id) WHERE worker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);

-- ============================================================================
-- CHECKPOINTS TABLE
-- ============================================================================
-- Stores task checkpoints for resumability (20-50h runs)
-- Unique constraint ensures only one checkpoint per task

CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL UNIQUE,

  -- Checkpoint data
  token VARCHAR(255) NOT NULL,  -- Continuation token (e.g., 'step-2-complete')
  data JSONB NOT NULL,          -- Serialized state

  -- Metadata
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Foreign key
  CONSTRAINT fk_checkpoints_task FOREIGN KEY (task_id)
    REFERENCES tasks(id) ON DELETE CASCADE
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_checkpoints_task_id ON checkpoints(task_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_created_at ON checkpoints(created_at DESC);

-- ============================================================================
-- EVENTS TABLE
-- ============================================================================
-- Event log for audit trail and debugging
-- Supplements event bus with persistent storage

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event context
  run_id UUID NOT NULL,
  phase_id UUID,
  task_id UUID,

  -- Event details
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',

  -- Source tracking
  source VARCHAR(100),  -- Component that emitted event

  -- Timestamp
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
CREATE INDEX IF NOT EXISTS idx_events_phase_id ON events(phase_id) WHERE phase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);

-- Partition hint for high-volume environments (optional, commented out)
-- CREATE TABLE events_2025 PARTITION OF events FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- ============================================================================
-- TIMERS TABLE
-- ============================================================================
-- Durable timers for retries, timeouts, and scheduled actions
-- Supports timer resumption after service restart

CREATE TABLE IF NOT EXISTS timers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timer context
  task_id UUID,
  run_id UUID,
  phase_id UUID,

  -- Timer specification
  fire_at TIMESTAMPTZ NOT NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('retry', 'timeout', 'cleanup', 'custom')),
  payload JSONB NOT NULL DEFAULT '{}',

  -- State
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'fired', 'cancelled')
  ),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fired_at TIMESTAMPTZ,

  -- Foreign keys (optional, tasks may have been deleted)
  CONSTRAINT fk_timers_task FOREIGN KEY (task_id)
    REFERENCES tasks(id) ON DELETE SET NULL
);

-- Indexes for timer service queries
CREATE INDEX IF NOT EXISTS idx_timers_fire_at ON timers(fire_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_timers_status ON timers(status);
CREATE INDEX IF NOT EXISTS idx_timers_task_id ON timers(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timers_action ON timers(action);

-- ============================================================================
-- VIEWS FOR MONITORING
-- ============================================================================

-- Active tasks with last heartbeat
CREATE OR REPLACE VIEW active_tasks AS
SELECT
  t.id,
  t.phase_id,
  t.type,
  t.target,
  t.status,
  t.worker_id,
  t.last_heartbeat_at,
  t.started_at,
  EXTRACT(EPOCH FROM (NOW() - t.last_heartbeat_at)) AS seconds_since_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - t.started_at)) AS running_duration_seconds
FROM tasks t
WHERE t.status = 'running'
ORDER BY t.started_at DESC;

-- Task statistics by phase
CREATE OR REPLACE VIEW task_stats_by_phase AS
SELECT
  phase_id,
  COUNT(*) AS total_tasks,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed_tasks,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_tasks,
  COUNT(*) FILTER (WHERE status = 'running') AS running_tasks,
  AVG(duration_ms) FILTER (WHERE status = 'completed') AS avg_duration_ms,
  SUM(cost_usd) AS total_cost_usd,
  SUM(tokens_used) AS total_tokens
FROM tasks
GROUP BY phase_id;

-- Pending timers
CREATE OR REPLACE VIEW pending_timers AS
SELECT
  id,
  task_id,
  action,
  fire_at,
  EXTRACT(EPOCH FROM (fire_at - NOW())) AS seconds_until_fire,
  payload
FROM timers
WHERE status = 'pending' AND fire_at > NOW()
ORDER BY fire_at ASC;

-- ============================================================================
-- FUNCTIONS FOR CLEANUP
-- ============================================================================

-- Clean up old checkpoints (keep only latest per task)
CREATE OR REPLACE FUNCTION cleanup_old_checkpoints(days_to_keep INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM checkpoints
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL
  AND task_id NOT IN (
    SELECT task_id FROM tasks WHERE status IN ('running', 'pending')
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Clean up old events
CREATE OR REPLACE FUNCTION cleanup_old_events(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM events
  WHERE timestamp < NOW() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Clean up fired timers
CREATE OR REPLACE FUNCTION cleanup_fired_timers(days_to_keep INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM timers
  WHERE status = 'fired'
  AND fired_at < NOW() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANTS (adjust for your security model)
-- ============================================================================

-- GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO orchestrator_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON checkpoints TO orchestrator_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON events TO orchestrator_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON timers TO orchestrator_app;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE tasks IS 'Individual task executions (agents and tools) with status tracking';
COMMENT ON TABLE checkpoints IS 'Task checkpoints for resumability in long-running workflows';
COMMENT ON TABLE events IS 'Persistent event log for audit trail and debugging';
COMMENT ON TABLE timers IS 'Durable timers for retries, timeouts, and scheduled actions';

COMMENT ON COLUMN tasks.idempotence_key IS 'SHA256 hash for duplicate detection';
COMMENT ON COLUMN checkpoints.token IS 'Continuation token (e.g., step-2-complete)';
COMMENT ON COLUMN checkpoints.data IS 'Serialized checkpoint state (JSON)';
COMMENT ON COLUMN timers.fire_at IS 'When timer should fire (indexed for efficiency)';
