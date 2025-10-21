-- Performance Optimization Indexes
-- MEDIUM PRIORITY FIX #17: Recommended database indexes
-- Generated: 2025-10-19
--
-- Purpose: Optimize query performance for production workloads
-- Expected improvement: 10-100x faster queries on large datasets
--
-- Run with: psql $DATABASE_URL -f migrations/001_performance_indexes.sql

-- ============================================================================
-- WORKFLOW_RUNS TABLE INDEXES
-- ============================================================================

-- Composite index for filtering by user and state
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_runs_user_state
ON workflow_runs(user_id, state, created_at DESC);

-- Index for filtering by state with time ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_runs_state_created
ON workflow_runs(state, created_at DESC);

-- Index for cost tracking queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_runs_cost
ON workflow_runs(current_cost_usd DESC)
WHERE state IN ('running', 'paused');

-- ============================================================================
-- PHASE_EXECUTIONS TABLE INDEXES
-- ============================================================================

-- Index for loading phases by workflow
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_phase_executions_workflow
ON phase_executions(workflow_run_id, id);

-- Index for phase analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_phase_executions_phase_state
ON phase_executions(phase_name, state, completed_at DESC);

-- ============================================================================
-- AGENT_EXECUTIONS TABLE INDEXES
-- ============================================================================

-- Index for loading agents by phase
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_executions_phase
ON agent_executions(phase_execution_id, id);

-- Index for agent performance analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_executions_type_cost
ON agent_executions(agent_type, cost_usd DESC, completed_at DESC)
WHERE state = 'completed';

-- ============================================================================
-- GATE_RESULTS TABLE INDEXES
-- ============================================================================

-- Index for loading gates by workflow
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gate_results_workflow
ON gate_results(workflow_run_id, evaluated_at DESC);

-- Index for gate analytics by phase
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gate_results_phase_result
ON gate_results(phase, result, evaluated_at DESC);

-- ============================================================================
-- ARTIFACTS TABLE INDEXES
-- ============================================================================

-- Composite index for artifact queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_artifacts_workflow_type
ON artifacts(workflow_run_id, type, version DESC);

-- Index for deduplication by content hash
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_artifacts_hash
ON artifacts(content_hash)
WHERE content_hash IS NOT NULL;

-- Index for phase-based artifact queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_artifacts_phase
ON artifacts(phase, created_at DESC);

-- ============================================================================
-- AUDIT_LOG TABLE INDEXES
-- ============================================================================

-- Composite index for workflow audit trail
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_workflow_timestamp
ON audit_log(workflow_run_id, timestamp DESC);

-- Index for actor activity queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_actor_action
ON audit_log(actor, action, timestamp DESC);

-- Index for event correlation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_correlation
ON audit_log(correlation_id, timestamp)
WHERE correlation_id IS NOT NULL;

-- ============================================================================
-- EVENTS TABLE INDEXES
-- ============================================================================

-- Index for workflow event timeline
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_workflow_timestamp
ON events(workflow_run_id, timestamp ASC);

-- Index for event type queries with correlation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_type_correlation
ON events(event_type, correlation_id, timestamp)
WHERE correlation_id IS NOT NULL;

-- Index for recent events
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_recent
ON events(timestamp DESC)
WHERE timestamp > NOW() - INTERVAL '7 days';

-- ============================================================================
-- KNOWLEDGE MAP INDEXES
-- ============================================================================

-- Composite index for question queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_questions_run_phase_status
ON questions(run_id, phase, status, priority DESC);

-- Index for high-priority open questions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_questions_priority_open
ON questions(priority DESC, created_at)
WHERE status IN ('open', 'partial');

-- Index for question full-text search (if pg_trgm enabled)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_questions_text_trgm
ON questions USING gin(text gin_trgm_ops);

-- Index for tag-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_questions_tags
ON questions USING gin(tags);

-- Index for answers by question
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_answers_question
ON answers(question_id, created_at DESC);

-- Index for bindings by question and decision
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bindings_question_decision
ON bindings(question_id, decision, validated_at DESC);

-- Unique index to prevent duplicate accepted bindings
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_bindings_accepted_question
ON bindings (question_id)
WHERE decision = 'accept';

-- Index for KM nodes by run and phase
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_km_nodes_run_phase
ON km_nodes(run_id, phase, created_at DESC)
WHERE is_active = true;

-- Index for active nodes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_km_nodes_active
ON km_nodes(is_active, created_at DESC)
WHERE is_active = true;

-- Index for KM conflicts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_km_conflicts_run_severity
ON km_conflicts(run_id, severity, resolved)
WHERE resolved = false;

-- Index for KM edges by type
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_km_edges_type
ON km_edges(edge_type, source_node_id, created_at DESC);

-- ============================================================================
-- REFINERY INDEXES
-- ============================================================================

-- Index for refinery runs by workflow
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refinery_runs_workflow
ON refinery_runs(workflow_run_id, phase, started_at DESC);

-- Index for atomic questions by refinery run
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atomic_questions_run
ON atomic_questions(refinery_run_id, created_at);

-- Index for canonical answers by refinery run
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_canonical_answers_run
ON canonical_answers(refinery_run_id, consensus_confidence DESC);

-- Index for knowledge frames by run and phase
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_frames_run_phase
ON knowledge_frames(refinery_run_id, phase, created_at DESC);

-- ============================================================================
-- POST-CREATION ANALYSIS
-- ============================================================================

-- Analyze tables to update statistics
ANALYZE workflow_runs;
ANALYZE phase_executions;
ANALYZE agent_executions;
ANALYZE gate_results;
ANALYZE artifacts;
ANALYZE audit_log;
ANALYZE events;
ANALYZE questions;
ANALYZE answers;
ANALYZE bindings;
ANALYZE km_nodes;
ANALYZE km_edges;
ANALYZE km_conflicts;
ANALYZE refinery_runs;
ANALYZE atomic_questions;
ANALYZE canonical_answers;
ANALYZE knowledge_frames;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check index usage after running workload
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Check table sizes
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
