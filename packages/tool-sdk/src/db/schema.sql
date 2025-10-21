-- IdeaMine Tools Infrastructure - PostgreSQL Schema
-- Version: 1.0.0
-- Description: Schema for Tool Registry (Armory) with versioning, capabilities, and execution tracking

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For similarity search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For composite indexes

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE tool_runtime AS ENUM ('docker', 'wasm');
CREATE TYPE tool_status AS ENUM ('draft', 'published', 'deprecated', 'archived');
CREATE TYPE execution_status AS ENUM ('pending', 'running', 'succeeded', 'failed', 'timeout', 'cancelled');
CREATE TYPE artifact_type AS ENUM ('input', 'output', 'log', 'trace', 'metric');

-- ============================================================================
-- TOOLS TABLE
-- ============================================================================

CREATE TABLE tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE, -- e.g., "tool.prd.traceMatrix"
    owner VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    description TEXT,
    license VARCHAR(50) DEFAULT 'MIT',
    repository_url TEXT,
    documentation_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,

    -- Metadata for search
    tags TEXT[] DEFAULT '{}',

    -- Security
    verified BOOLEAN DEFAULT FALSE,
    signature_public_key TEXT,

    CONSTRAINT tools_name_format CHECK (name ~ '^[a-z][a-z0-9\._-]+$')
);

CREATE INDEX idx_tools_name ON tools(name);
CREATE INDEX idx_tools_owner ON tools(owner);
CREATE INDEX idx_tools_tags ON tools USING GIN(tags);
CREATE INDEX idx_tools_name_trgm ON tools USING GIN(name gin_trgm_ops);
CREATE INDEX idx_tools_summary_trgm ON tools USING GIN(summary gin_trgm_ops);

-- ============================================================================
-- TOOL VERSIONS TABLE
-- ============================================================================

CREATE TABLE tool_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL, -- SemVer: "1.2.0"
    status tool_status NOT NULL DEFAULT 'draft',

    -- Runtime configuration
    runtime tool_runtime NOT NULL,
    image TEXT NOT NULL, -- Docker image or WASM module path
    entrypoint TEXT[], -- ["python", "/app/main.py"]

    -- Resource limits
    timeout_ms INTEGER NOT NULL DEFAULT 60000,
    cpu VARCHAR(20) NOT NULL DEFAULT '500m', -- K8s format
    memory VARCHAR(20) NOT NULL DEFAULT '512Mi', -- K8s format

    -- Schema validation
    input_schema JSONB NOT NULL,
    output_schema JSONB NOT NULL,

    -- Security configuration
    run_as_non_root BOOLEAN DEFAULT TRUE,
    filesystem_readonly BOOLEAN DEFAULT TRUE,
    network_restricted BOOLEAN DEFAULT TRUE,
    egress_allow TEXT[] DEFAULT '{}', -- ["s3://artifacts/*"]
    secrets TEXT[] DEFAULT '{}', -- ["S3_READ_TOKEN"]

    -- Guardrails
    grounding_required BOOLEAN DEFAULT FALSE,
    max_tokens INTEGER DEFAULT 0,

    -- Supply chain security
    sbom JSONB, -- Software Bill of Materials
    signature TEXT, -- Cosign signature
    digest VARCHAR(255), -- SHA256 digest of image

    -- Metadata
    changelog TEXT,
    breaking_changes TEXT[],
    deprecated_at TIMESTAMPTZ,
    deprecation_reason TEXT,

    -- Timestamps
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,

    CONSTRAINT tool_versions_unique UNIQUE(tool_id, version),
    CONSTRAINT tool_versions_version_format CHECK (version ~ '^\d+\.\d+\.\d+(-[a-zA-Z0-9\.-]+)?$'),
    CONSTRAINT tool_versions_timeout_positive CHECK (timeout_ms > 0 AND timeout_ms <= 600000)
);

CREATE INDEX idx_tool_versions_tool_id ON tool_versions(tool_id);
CREATE INDEX idx_tool_versions_status ON tool_versions(status);
CREATE INDEX idx_tool_versions_version ON tool_versions(version);
CREATE INDEX idx_tool_versions_runtime ON tool_versions(runtime);
CREATE INDEX idx_tool_versions_composite ON tool_versions(tool_id, version, status);

-- ============================================================================
-- CAPABILITIES TABLE
-- ============================================================================

CREATE TABLE capabilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_version_id UUID NOT NULL REFERENCES tool_versions(id) ON DELETE CASCADE,
    capability VARCHAR(255) NOT NULL, -- e.g., "traceability", "prd", "citation"
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT capabilities_unique UNIQUE(tool_version_id, capability)
);

CREATE INDEX idx_capabilities_tool_version_id ON capabilities(tool_version_id);
CREATE INDEX idx_capabilities_capability ON capabilities(capability);
CREATE INDEX idx_capabilities_capability_trgm ON capabilities USING GIN(capability gin_trgm_ops);

-- ============================================================================
-- ALLOWLISTS TABLE
-- ============================================================================

CREATE TABLE allowlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,

    -- Scope: who can use this tool
    agent_id VARCHAR(255), -- Specific agent ID
    phase VARCHAR(100), -- Specific phase (e.g., "prd", "design")
    role VARCHAR(100), -- Role-based (e.g., "coordinator", "specialist")

    -- Policy
    policy JSONB NOT NULL DEFAULT '{}', -- Additional policy rules
    max_executions_per_hour INTEGER,
    max_concurrent_executions INTEGER DEFAULT 1,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ,
    reason TEXT,

    CONSTRAINT allowlists_scope_check CHECK (
        agent_id IS NOT NULL OR phase IS NOT NULL OR role IS NOT NULL
    )
);

CREATE INDEX idx_allowlists_tool_id ON allowlists(tool_id);
CREATE INDEX idx_allowlists_agent_id ON allowlists(agent_id);
CREATE INDEX idx_allowlists_phase ON allowlists(phase);
CREATE INDEX idx_allowlists_role ON allowlists(role);

-- ============================================================================
-- EXECUTIONS TABLE
-- ============================================================================

CREATE TABLE executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id VARCHAR(255) NOT NULL, -- IdeaMine run ID

    -- Tool reference
    tool_id UUID NOT NULL REFERENCES tools(id),
    tool_version_id UUID NOT NULL REFERENCES tool_versions(id),
    tool_name VARCHAR(255) NOT NULL,
    tool_version VARCHAR(50) NOT NULL,

    -- Execution context
    agent_id VARCHAR(255) NOT NULL,
    phase VARCHAR(100) NOT NULL,

    -- Input/output
    input_hash VARCHAR(64) NOT NULL, -- SHA256 for idempotence
    input JSONB NOT NULL,
    output JSONB,
    error JSONB,

    -- Status
    status execution_status NOT NULL DEFAULT 'pending',

    -- Resource usage
    duration_ms INTEGER,
    cpu_usage_ms INTEGER,
    memory_peak_bytes BIGINT,

    -- Execution details
    container_id VARCHAR(255),
    exit_code INTEGER,
    retry_count INTEGER DEFAULT 0,
    parent_execution_id UUID REFERENCES executions(id), -- For retries

    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Observability
    trace_id VARCHAR(255),
    span_id VARCHAR(255),

    -- Cost attribution
    cost_cents DECIMAL(10, 4),

    CONSTRAINT executions_status_timestamps CHECK (
        (status = 'pending' AND started_at IS NULL) OR
        (status = 'running' AND started_at IS NOT NULL AND completed_at IS NULL) OR
        (status IN ('succeeded', 'failed', 'timeout', 'cancelled') AND started_at IS NOT NULL AND completed_at IS NOT NULL)
    )
);

CREATE INDEX idx_executions_run_id ON executions(run_id);
CREATE INDEX idx_executions_tool_id ON executions(tool_id);
CREATE INDEX idx_executions_tool_version_id ON executions(tool_version_id);
CREATE INDEX idx_executions_agent_id ON executions(agent_id);
CREATE INDEX idx_executions_phase ON executions(phase);
CREATE INDEX idx_executions_status ON executions(status);
CREATE INDEX idx_executions_input_hash ON executions(input_hash);
CREATE INDEX idx_executions_created_at ON executions(created_at DESC);
CREATE INDEX idx_executions_trace_id ON executions(trace_id);
CREATE INDEX idx_executions_idempotence ON executions(tool_version_id, input_hash, created_at DESC);

-- ============================================================================
-- ARTIFACTS TABLE
-- ============================================================================

CREATE TABLE artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,

    -- Artifact details
    type artifact_type NOT NULL,
    name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    size_bytes BIGINT NOT NULL,

    -- Storage
    storage_uri TEXT NOT NULL, -- s3://bucket/key or file:///path
    storage_etag VARCHAR(255),

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,

    CONSTRAINT artifacts_size_positive CHECK (size_bytes >= 0)
);

CREATE INDEX idx_artifacts_execution_id ON artifacts(execution_id);
CREATE INDEX idx_artifacts_type ON artifacts(type);
CREATE INDEX idx_artifacts_created_at ON artifacts(created_at DESC);

-- ============================================================================
-- IDEMPOTENCE CACHE TABLE
-- ============================================================================

CREATE TABLE idempotence_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_version_id UUID NOT NULL REFERENCES tool_versions(id) ON DELETE CASCADE,
    input_hash VARCHAR(64) NOT NULL,
    execution_id UUID NOT NULL REFERENCES executions(id),

    -- Cache control
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    hit_count INTEGER DEFAULT 0,

    CONSTRAINT idempotence_cache_unique UNIQUE(tool_version_id, input_hash)
);

CREATE INDEX idx_idempotence_cache_lookup ON idempotence_cache(tool_version_id, input_hash, expires_at);
CREATE INDEX idx_idempotence_cache_expires_at ON idempotence_cache(expires_at);

-- ============================================================================
-- METRICS TABLE (Aggregated)
-- ============================================================================

CREATE TABLE tool_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    tool_version_id UUID REFERENCES tool_versions(id) ON DELETE CASCADE,

    -- Time bucket
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,

    -- Aggregated metrics
    execution_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    timeout_count INTEGER DEFAULT 0,

    -- Performance
    avg_duration_ms DECIMAL(10, 2),
    p50_duration_ms INTEGER,
    p95_duration_ms INTEGER,
    p99_duration_ms INTEGER,

    -- Resources
    avg_cpu_usage_ms DECIMAL(10, 2),
    avg_memory_peak_bytes BIGINT,

    -- Cost
    total_cost_cents DECIMAL(10, 4),

    -- Idempotence
    cache_hit_count INTEGER DEFAULT 0,
    cache_hit_rate DECIMAL(5, 4),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT tool_metrics_unique UNIQUE(tool_id, tool_version_id, period_start)
);

CREATE INDEX idx_tool_metrics_tool_id ON tool_metrics(tool_id);
CREATE INDEX idx_tool_metrics_tool_version_id ON tool_metrics(tool_version_id);
CREATE INDEX idx_tool_metrics_period ON tool_metrics(period_start DESC);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Latest version view
CREATE VIEW tool_latest_versions AS
SELECT DISTINCT ON (t.id)
    t.id AS tool_id,
    t.name,
    tv.id AS version_id,
    tv.version,
    tv.status,
    tv.runtime,
    tv.created_at
FROM tools t
INNER JOIN tool_versions tv ON t.id = tv.tool_id
WHERE tv.status = 'published'
ORDER BY t.id,
         string_to_array(tv.version, '.')::int[] DESC,
         tv.created_at DESC;

-- Tool search view with capabilities
CREATE VIEW tool_search_view AS
SELECT
    t.id,
    t.name,
    t.owner,
    t.summary,
    t.tags,
    tv.version,
    tv.status,
    tv.runtime,
    ARRAY_AGG(DISTINCT c.capability) FILTER (WHERE c.capability IS NOT NULL) AS capabilities,
    tv.published_at,
    tv.created_at
FROM tools t
INNER JOIN tool_versions tv ON t.id = tv.tool_id
LEFT JOIN capabilities c ON tv.id = c.tool_version_id
WHERE tv.status = 'published'
GROUP BY t.id, t.name, t.owner, t.summary, t.tags, tv.version, tv.status, tv.runtime, tv.published_at, tv.created_at;

-- Execution statistics view
CREATE VIEW execution_stats AS
SELECT
    e.tool_id,
    e.tool_name,
    e.tool_version,
    e.phase,
    COUNT(*) AS total_executions,
    COUNT(*) FILTER (WHERE e.status = 'succeeded') AS success_count,
    COUNT(*) FILTER (WHERE e.status = 'failed') AS failure_count,
    COUNT(*) FILTER (WHERE e.status = 'timeout') AS timeout_count,
    AVG(e.duration_ms) FILTER (WHERE e.status = 'succeeded') AS avg_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY e.duration_ms) FILTER (WHERE e.status = 'succeeded') AS p95_duration_ms,
    SUM(e.cost_cents) AS total_cost_cents,
    MAX(e.completed_at) AS last_execution_at
FROM executions e
WHERE e.completed_at > NOW() - INTERVAL '24 hours'
GROUP BY e.tool_id, e.tool_name, e.tool_version, e.phase;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tools_updated_at
    BEFORE UPDATE ON tools
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Clean expired idempotence cache entries
CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM idempotence_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Increment cache hit count
CREATE OR REPLACE FUNCTION increment_cache_hit(p_tool_version_id UUID, p_input_hash VARCHAR)
RETURNS void AS $$
BEGIN
    UPDATE idempotence_cache
    SET hit_count = hit_count + 1
    WHERE tool_version_id = p_tool_version_id
      AND input_hash = p_input_hash
      AND expires_at > NOW();
END;
$$ LANGUAGE plpgsql;

-- Search tools by text and capabilities
CREATE OR REPLACE FUNCTION search_tools(
    p_query TEXT DEFAULT NULL,
    p_capabilities TEXT[] DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_runtime tool_runtime DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    tool_id UUID,
    name VARCHAR,
    owner VARCHAR,
    summary TEXT,
    version VARCHAR,
    runtime tool_runtime,
    capabilities TEXT[],
    tags TEXT[],
    relevance REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        tsv.id,
        tsv.name,
        tsv.owner,
        tsv.summary,
        tsv.version,
        tsv.runtime,
        tsv.capabilities,
        tsv.tags,
        CASE
            WHEN p_query IS NOT NULL THEN
                similarity(tsv.name, p_query) * 0.5 +
                similarity(tsv.summary, p_query) * 0.5
            ELSE 1.0
        END AS relevance
    FROM tool_search_view tsv
    WHERE
        (p_query IS NULL OR
         tsv.name ILIKE '%' || p_query || '%' OR
         tsv.summary ILIKE '%' || p_query || '%')
        AND (p_capabilities IS NULL OR
             tsv.capabilities && p_capabilities)
        AND (p_tags IS NULL OR
             tsv.tags && p_tags)
        AND (p_runtime IS NULL OR
             tsv.runtime = p_runtime)
    ORDER BY relevance DESC, tsv.published_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Check if agent/phase has access to tool
CREATE OR REPLACE FUNCTION check_tool_access(
    p_tool_id UUID,
    p_agent_id VARCHAR DEFAULT NULL,
    p_phase VARCHAR DEFAULT NULL,
    p_role VARCHAR DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_has_access BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1
        FROM allowlists
        WHERE tool_id = p_tool_id
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (
              agent_id = p_agent_id OR
              phase = p_phase OR
              role = p_role
          )
    ) INTO v_has_access;

    RETURN v_has_access;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Create system user for migrations
INSERT INTO tools (name, owner, summary, created_by, tags)
VALUES ('system.noop', 'system', 'No-operation tool for testing', 'system', ARRAY['system', 'test'])
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE tools IS 'Registry of all available tools with metadata';
COMMENT ON TABLE tool_versions IS 'Versioned tool configurations with immutable releases';
COMMENT ON TABLE capabilities IS 'Searchable capabilities tags for tool discovery';
COMMENT ON TABLE allowlists IS 'Access control policies for tools by agent/phase/role';
COMMENT ON TABLE executions IS 'Audit log of all tool executions with traces';
COMMENT ON TABLE artifacts IS 'Storage references for large inputs/outputs/logs';
COMMENT ON TABLE idempotence_cache IS 'Deduplication cache for identical tool invocations';
COMMENT ON TABLE tool_metrics IS 'Aggregated performance and cost metrics';

-- ============================================================================
-- GRANTS (Adjust based on your security model)
-- ============================================================================

-- CREATE ROLE armory_service;
-- CREATE ROLE runner_service;
-- CREATE ROLE readonly_user;

-- GRANT SELECT, INSERT, UPDATE ON tools, tool_versions, capabilities TO armory_service;
-- GRANT SELECT, INSERT, UPDATE ON executions, artifacts, idempotence_cache TO runner_service;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
