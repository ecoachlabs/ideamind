-- IdeaMine Tools Infrastructure - PostgreSQL Schema
-- Version: 1.0.0
-- Purpose: Tool Registry, Execution Tracking, Policy Management

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- For hashing

-- =============================================================================
-- TOOLS CATALOG
-- =============================================================================

-- Core tool metadata (immutable per version)
CREATE TABLE tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_id VARCHAR(255) NOT NULL, -- e.g., "tool.prd.traceMatrix"
    version VARCHAR(50) NOT NULL, -- SemVer: "1.2.3"
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    runtime VARCHAR(20) NOT NULL CHECK (runtime IN ('docker', 'wasm')), -- Execution runtime

    -- Image/artifact references
    image_uri TEXT, -- Docker: "harbor.ideamine.io/tools/prd-trace:1.2.3", WASM: "s3://..."
    image_digest VARCHAR(255), -- SHA256 digest for verification

    -- Schemas (JSON Schema format)
    input_schema JSONB NOT NULL, -- JSON Schema for input validation
    output_schema JSONB NOT NULL, -- JSON Schema for output validation

    -- Resource limits
    cpu_limit VARCHAR(20) DEFAULT '1000m', -- K8s format: "1000m" = 1 core
    memory_limit VARCHAR(20) DEFAULT '512Mi', -- K8s format: "512Mi"
    timeout_seconds INTEGER DEFAULT 300, -- Max execution time
    ephemeral_storage VARCHAR(20) DEFAULT '1Gi',

    -- Security settings
    security_profile JSONB NOT NULL DEFAULT '{
        "runAsNonRoot": true,
        "runAsUser": 10001,
        "readOnlyRootFilesystem": true,
        "allowPrivilegeEscalation": false,
        "capabilities": {"drop": ["ALL"]}
    }'::jsonb,

    -- Network/egress policy
    egress_policy JSONB NOT NULL DEFAULT '{
        "default": "deny",
        "allowedHosts": [],
        "allowedCIDRs": []
    }'::jsonb,

    -- Secrets requirements (Vault paths)
    secrets_required JSONB DEFAULT '[]'::jsonb, -- ["vault/tools/api-key"]

    -- Execution behavior
    cache_ttl_seconds INTEGER DEFAULT 600, -- 10 minutes (0 = no cache)
    idempotent BOOLEAN DEFAULT true,
    retry_policy JSONB DEFAULT '{
        "maxAttempts": 3,
        "backoffMs": [1000, 2000, 4000],
        "retriableErrors": ["SANDBOX_TIMEOUT", "NETWORK_ERROR", "RESOURCE_EXHAUSTED"]
    }'::jsonb,

    -- Guards (hallucination protection)
    requires_guards JSONB DEFAULT '[]'::jsonb, -- Tool IDs of required guards

    -- Provenance & supply chain security
    signature TEXT, -- Cosign signature
    sbom_uri TEXT, -- S3 URI to SBOM (Syft/CycloneDX format)
    vulnerability_scan JSONB, -- Grype scan results

    -- Publishing metadata
    publisher_id VARCHAR(255) NOT NULL, -- User/org who published
    published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deprecated BOOLEAN DEFAULT false,
    deprecated_at TIMESTAMP WITH TIME ZONE,
    deprecation_reason TEXT,
    replacement_tool_id VARCHAR(255), -- Suggested replacement

    -- Audit
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    UNIQUE(tool_id, version), -- Immutable versions
    CHECK (version ~ '^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$') -- SemVer validation
);

-- Indexes for performance
CREATE INDEX idx_tools_tool_id ON tools(tool_id);
CREATE INDEX idx_tools_tool_id_version ON tools(tool_id, version);
CREATE INDEX idx_tools_deprecated ON tools(deprecated) WHERE deprecated = false;
CREATE INDEX idx_tools_published_at ON tools(published_at DESC);
CREATE INDEX idx_tools_runtime ON tools(runtime);

-- Full-text search on name + description
CREATE INDEX idx_tools_search ON tools USING GIN(to_tsvector('english', name || ' ' || description));

-- =============================================================================
-- TOOL CAPABILITIES (for semantic search)
-- =============================================================================

CREATE TABLE tool_capabilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_uuid UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    capability VARCHAR(255) NOT NULL, -- e.g., "traceability", "prd", "requirements"

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    UNIQUE(tool_uuid, capability)
);

CREATE INDEX idx_capabilities_capability ON tool_capabilities(capability);
CREATE INDEX idx_capabilities_tool_uuid ON tool_capabilities(tool_uuid);

-- Trigram index for fuzzy capability search
CREATE INDEX idx_capabilities_fuzzy ON tool_capabilities USING GIN(capability gin_trgm_ops);

-- =============================================================================
-- POLICY ALLOWLISTS
-- =============================================================================

CREATE TABLE policy_allowlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Scope
    agent_id VARCHAR(255), -- e.g., "agent.prd.writer" (NULL = all agents)
    phase_id VARCHAR(50), -- e.g., "PRD" (NULL = all phases)

    -- Tool access
    tool_id VARCHAR(255) NOT NULL, -- e.g., "tool.prd.traceMatrix"
    version_constraint VARCHAR(100) NOT NULL DEFAULT '*', -- SemVer range: "^1.0.0", ">=1.0.0 <2.0.0"

    -- Conditions
    max_executions_per_hour INTEGER, -- Rate limiting
    requires_approval BOOLEAN DEFAULT false, -- Human-in-the-loop
    required_guards JSONB DEFAULT '[]'::jsonb, -- Additional guards beyond tool's defaults

    -- Audit
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    enabled BOOLEAN DEFAULT true,

    -- Constraints
    UNIQUE(agent_id, phase_id, tool_id)
);

CREATE INDEX idx_allowlists_agent_phase ON policy_allowlists(agent_id, phase_id) WHERE enabled = true;
CREATE INDEX idx_allowlists_tool_id ON policy_allowlists(tool_id);

-- =============================================================================
-- TOOL EXECUTIONS
-- =============================================================================

CREATE TABLE tool_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id VARCHAR(255) NOT NULL UNIQUE, -- Human-readable: "exec_prd_trace_abc123"

    -- Tool reference
    tool_uuid UUID NOT NULL REFERENCES tools(id),
    tool_id VARCHAR(255) NOT NULL, -- Denormalized for query performance
    tool_version VARCHAR(50) NOT NULL,

    -- Context
    agent_id VARCHAR(255) NOT NULL,
    phase_id VARCHAR(50) NOT NULL,
    project_id VARCHAR(255), -- Optional: link to specific project

    -- Input/output (hashed for deduplication, full data in artifacts)
    input_hash VARCHAR(64) NOT NULL, -- SHA256 of canonical JSON input
    output_hash VARCHAR(64), -- SHA256 of output
    input_artifact_uri TEXT, -- S3 URI if input too large
    output_artifact_uri TEXT, -- S3 URI for output

    -- Execution state
    status VARCHAR(20) NOT NULL CHECK (status IN (
        'PENDING', 'QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED'
    )),
    error_type VARCHAR(100), -- "SCHEMA_VALIDATION_ERROR", "TIMEOUT", etc.
    error_message TEXT,
    error_stack TEXT,

    -- Timing
    queued_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER, -- Total wall-clock time

    -- Resource usage
    cpu_ms INTEGER, -- CPU time in milliseconds
    mem_peak_mb INTEGER, -- Peak memory usage
    disk_read_mb INTEGER,
    disk_write_mb INTEGER,
    network_egress_mb INTEGER,

    -- Caching
    cache_hit BOOLEAN DEFAULT false,
    cache_key VARCHAR(64), -- hash(tool_id@version + input_hash)

    -- Provenance
    image_digest VARCHAR(255), -- Actual image used (verified)
    signature_verified BOOLEAN,
    sandbox_id VARCHAR(255), -- K8s Job name or WASM instance ID
    node_name VARCHAR(255), -- K8s node for debugging

    -- Artifacts produced
    artifacts JSONB DEFAULT '[]'::jsonb, -- [{"uri": "s3://...", "size": 1234, "type": "image/png"}]

    -- Guards executed
    guards_executed JSONB DEFAULT '[]'::jsonb, -- [{"toolId": "guard.citationCheck", "status": "PASS"}]

    -- Audit
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_executions_tool_id ON tool_executions(tool_id, tool_version);
CREATE INDEX idx_executions_agent_phase ON tool_executions(agent_id, phase_id);
CREATE INDEX idx_executions_status ON tool_executions(status);
CREATE INDEX idx_executions_created_at ON tool_executions(created_at DESC);
CREATE INDEX idx_executions_cache_key ON tool_executions(cache_key) WHERE cache_hit = false;
CREATE INDEX idx_executions_input_hash ON tool_executions(input_hash); -- For deduplication

-- Partial index for active executions
CREATE INDEX idx_executions_active ON tool_executions(status, created_at)
    WHERE status IN ('PENDING', 'QUEUED', 'RUNNING');

-- =============================================================================
-- EXECUTION CACHE (for idempotent tools)
-- =============================================================================

CREATE TABLE execution_cache (
    cache_key VARCHAR(64) PRIMARY KEY, -- hash(tool_id@version + input_hash)

    -- Reference to original execution
    execution_id UUID NOT NULL REFERENCES tool_executions(id),

    -- Cached data
    output_hash VARCHAR(64) NOT NULL,
    output_artifact_uri TEXT,

    -- Metadata
    tool_id VARCHAR(255) NOT NULL,
    tool_version VARCHAR(50) NOT NULL,

    -- Expiration
    cached_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    hit_count INTEGER DEFAULT 0,
    last_hit_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_cache_expires_at ON execution_cache(expires_at);
CREATE INDEX idx_cache_tool_id ON execution_cache(tool_id);

-- Auto-cleanup expired cache entries
CREATE INDEX idx_cache_expired ON execution_cache(expires_at) WHERE expires_at < NOW();

-- =============================================================================
-- ARTIFACTS (for large blobs)
-- =============================================================================

CREATE TABLE artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Artifact identity
    uri TEXT NOT NULL UNIQUE, -- S3 URI: "s3://ideamine-tools/artifacts/sha256-abc123.json"
    content_hash VARCHAR(64) NOT NULL, -- SHA256 for content addressing

    -- Metadata
    content_type VARCHAR(255) NOT NULL, -- "application/json", "image/png", etc.
    size_bytes BIGINT NOT NULL,

    -- Provenance
    execution_id UUID REFERENCES tool_executions(id),
    artifact_type VARCHAR(50) NOT NULL CHECK (artifact_type IN (
        'input', 'output', 'log', 'sbom', 'report', 'screenshot', 'other'
    )),

    -- Lifecycle
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE, -- NULL = never expire
    accessed_at TIMESTAMP WITH TIME ZONE, -- For LRU eviction
    access_count INTEGER DEFAULT 0
);

CREATE INDEX idx_artifacts_content_hash ON artifacts(content_hash);
CREATE INDEX idx_artifacts_execution_id ON artifacts(execution_id);
CREATE INDEX idx_artifacts_expires_at ON artifacts(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_artifacts_type ON artifacts(artifact_type);

-- =============================================================================
-- TOOL USAGE METRICS (aggregated)
-- =============================================================================

CREATE TABLE tool_metrics_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    date DATE NOT NULL,
    tool_id VARCHAR(255) NOT NULL,
    tool_version VARCHAR(50) NOT NULL,

    -- Execution stats
    total_executions INTEGER NOT NULL DEFAULT 0,
    successful_executions INTEGER NOT NULL DEFAULT 0,
    failed_executions INTEGER NOT NULL DEFAULT 0,
    cache_hits INTEGER NOT NULL DEFAULT 0,

    -- Performance stats
    avg_duration_ms INTEGER,
    p50_duration_ms INTEGER,
    p95_duration_ms INTEGER,
    p99_duration_ms INTEGER,

    -- Resource stats
    total_cpu_ms BIGINT,
    total_mem_mb BIGINT,
    total_network_egress_mb BIGINT,

    -- Cost estimation (USD)
    estimated_cost_usd DECIMAL(10, 4),

    -- Audit
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    UNIQUE(date, tool_id, tool_version)
);

CREATE INDEX idx_metrics_date ON tool_metrics_daily(date DESC);
CREATE INDEX idx_metrics_tool_id ON tool_metrics_daily(tool_id);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Active tools (non-deprecated, latest versions)
CREATE VIEW active_tools AS
SELECT DISTINCT ON (tool_id)
    id,
    tool_id,
    version,
    name,
    description,
    runtime,
    published_at
FROM tools
WHERE deprecated = false
ORDER BY tool_id, version DESC;

-- Tool execution summary (last 24 hours)
CREATE VIEW tool_execution_summary_24h AS
SELECT
    tool_id,
    tool_version,
    COUNT(*) AS total_executions,
    COUNT(*) FILTER (WHERE status = 'SUCCESS') AS successful,
    COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
    COUNT(*) FILTER (WHERE cache_hit = true) AS cache_hits,
    AVG(duration_ms) FILTER (WHERE status = 'SUCCESS') AS avg_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE status = 'SUCCESS') AS p95_duration_ms
FROM tool_executions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY tool_id, tool_version;

-- Agent tool usage
CREATE VIEW agent_tool_usage AS
SELECT
    agent_id,
    phase_id,
    tool_id,
    COUNT(*) AS executions,
    COUNT(*) FILTER (WHERE status = 'SUCCESS') AS successful,
    AVG(duration_ms) AS avg_duration_ms
FROM tool_executions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY agent_id, phase_id, tool_id
ORDER BY executions DESC;

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Generate cache key
CREATE OR REPLACE FUNCTION generate_cache_key(
    p_tool_id VARCHAR,
    p_tool_version VARCHAR,
    p_input_hash VARCHAR
) RETURNS VARCHAR AS $$
BEGIN
    RETURN encode(digest(p_tool_id || '@' || p_tool_version || ':' || p_input_hash, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Check if tool is allowed for agent/phase
CREATE OR REPLACE FUNCTION is_tool_allowed(
    p_agent_id VARCHAR,
    p_phase_id VARCHAR,
    p_tool_id VARCHAR,
    p_tool_version VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
    v_allowed BOOLEAN := false;
    v_constraint VARCHAR;
BEGIN
    -- Check for exact match (agent + phase + tool)
    SELECT version_constraint INTO v_constraint
    FROM policy_allowlists
    WHERE agent_id = p_agent_id
      AND phase_id = p_phase_id
      AND tool_id = p_tool_id
      AND enabled = true;

    IF FOUND THEN
        -- TODO: Implement SemVer range checking
        -- For MVP, accept wildcard or exact match
        IF v_constraint = '*' OR v_constraint = p_tool_version THEN
            RETURN true;
        END IF;
    END IF;

    -- Check for wildcard agent (any agent in phase)
    SELECT version_constraint INTO v_constraint
    FROM policy_allowlists
    WHERE agent_id IS NULL
      AND phase_id = p_phase_id
      AND tool_id = p_tool_id
      AND enabled = true;

    IF FOUND THEN
        IF v_constraint = '*' OR v_constraint = p_tool_version THEN
            RETURN true;
        END IF;
    END IF;

    -- Check for wildcard phase (agent in any phase)
    SELECT version_constraint INTO v_constraint
    FROM policy_allowlists
    WHERE agent_id = p_agent_id
      AND phase_id IS NULL
      AND tool_id = p_tool_id
      AND enabled = true;

    IF FOUND THEN
        IF v_constraint = '*' OR v_constraint = p_tool_version THEN
            RETURN true;
        END IF;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

-- Increment cache hit count
CREATE OR REPLACE FUNCTION increment_cache_hit(p_cache_key VARCHAR) RETURNS VOID AS $$
BEGIN
    UPDATE execution_cache
    SET hit_count = hit_count + 1,
        last_hit_at = NOW()
    WHERE cache_key = p_cache_key;
END;
$$ LANGUAGE plpgsql;

-- Cleanup expired cache entries (run as scheduled job)
CREATE OR REPLACE FUNCTION cleanup_expired_cache() RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM execution_cache
    WHERE expires_at < NOW();

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tools_updated_at BEFORE UPDATE ON tools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_allowlists_updated_at BEFORE UPDATE ON policy_allowlists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_executions_updated_at BEFORE UPDATE ON tool_executions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-populate cache key on execution insert
CREATE OR REPLACE FUNCTION populate_cache_key()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.cache_key IS NULL THEN
        NEW.cache_key = generate_cache_key(NEW.tool_id, NEW.tool_version, NEW.input_hash);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER populate_execution_cache_key BEFORE INSERT ON tool_executions
    FOR EACH ROW EXECUTE FUNCTION populate_cache_key();

-- =============================================================================
-- SEED DATA (for testing)
-- =============================================================================

-- Example tool: tool.prd.traceMatrix
INSERT INTO tools (
    tool_id, version, name, description, runtime,
    image_uri, image_digest,
    input_schema, output_schema,
    cpu_limit, memory_limit, timeout_seconds,
    cache_ttl_seconds, idempotent,
    publisher_id
) VALUES (
    'tool.prd.traceMatrix',
    '1.0.0',
    'Requirements Traceability Matrix Generator',
    'Generates a traceability matrix linking requirements to test cases, code modules, and documentation',
    'docker',
    'harbor.ideamine.io/tools/prd-trace:1.0.0',
    'sha256:abc123def456',
    '{
        "type": "object",
        "required": ["requirements", "testCases"],
        "properties": {
            "requirements": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["id", "description"],
                    "properties": {
                        "id": {"type": "string"},
                        "description": {"type": "string"},
                        "priority": {"type": "string", "enum": ["P0", "P1", "P2", "P3"]}
                    }
                }
            },
            "testCases": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["id", "description", "requirementIds"],
                    "properties": {
                        "id": {"type": "string"},
                        "description": {"type": "string"},
                        "requirementIds": {"type": "array", "items": {"type": "string"}}
                    }
                }
            }
        }
    }',
    '{
        "type": "object",
        "required": ["matrix", "coverage"],
        "properties": {
            "matrix": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "requirementId": {"type": "string"},
                        "testCaseIds": {"type": "array", "items": {"type": "string"}},
                        "coverage": {"type": "number"}
                    }
                }
            },
            "coverage": {
                "type": "object",
                "properties": {
                    "total": {"type": "number"},
                    "tested": {"type": "number"},
                    "percentage": {"type": "number"}
                }
            },
            "gaps": {
                "type": "array",
                "items": {"type": "string"}
            }
        }
    }',
    '500m',
    '256Mi',
    60,
    600,
    true,
    'system'
);

-- Capabilities for tool.prd.traceMatrix
INSERT INTO tool_capabilities (tool_uuid, capability)
SELECT id, capability
FROM tools, unnest(ARRAY['traceability', 'prd', 'requirements', 'testing', 'coverage']) AS capability
WHERE tool_id = 'tool.prd.traceMatrix' AND version = '1.0.0';

-- Example guard: guard.citationCheck
INSERT INTO tools (
    tool_id, version, name, description, runtime,
    image_uri, image_digest,
    input_schema, output_schema,
    cpu_limit, memory_limit, timeout_seconds,
    cache_ttl_seconds, idempotent,
    publisher_id
) VALUES (
    'guard.citationCheck',
    '1.0.0',
    'Citation Hallucination Guard',
    'Verifies that citations in tool output actually exist and support the claims made',
    'docker',
    'harbor.ideamine.io/guards/citation-check:1.0.0',
    'sha256:def789ghi012',
    '{
        "type": "object",
        "required": ["claims", "citations"],
        "properties": {
            "claims": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["text", "citationIds"],
                    "properties": {
                        "text": {"type": "string"},
                        "citationIds": {"type": "array", "items": {"type": "string"}}
                    }
                }
            },
            "citations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["id", "source", "content"],
                    "properties": {
                        "id": {"type": "string"},
                        "source": {"type": "string"},
                        "content": {"type": "string"}
                    }
                }
            }
        }
    }',
    '{
        "type": "object",
        "required": ["valid", "violations"],
        "properties": {
            "valid": {"type": "boolean"},
            "violations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "claimText": {"type": "string"},
                        "citationId": {"type": "string"},
                        "reason": {"type": "string"},
                        "severity": {"type": "string", "enum": ["high", "medium", "low"]}
                    }
                }
            },
            "confidence": {"type": "number"}
        }
    }',
    '250m',
    '128Mi',
    30,
    300,
    true,
    'system'
);

-- Capabilities for guard.citationCheck
INSERT INTO tool_capabilities (tool_uuid, capability)
SELECT id, capability
FROM tools, unnest(ARRAY['hallucination-guard', 'citation', 'validation', 'fact-checking']) AS capability
WHERE tool_id = 'guard.citationCheck' AND version = '1.0.0';

-- Example allowlist: PRDWriterAgent can use both tools
INSERT INTO policy_allowlists (agent_id, phase_id, tool_id, version_constraint, created_by)
VALUES
    ('agent.prd.writer', 'PRD', 'tool.prd.traceMatrix', '^1.0.0', 'system'),
    ('agent.prd.writer', 'PRD', 'guard.citationCheck', '^1.0.0', 'system');

-- =============================================================================
-- MAINTENANCE
-- =============================================================================

-- Scheduled job: Cleanup expired cache (run hourly)
-- SELECT cleanup_expired_cache();

-- Vacuum and analyze (run daily)
-- VACUUM ANALYZE tools;
-- VACUUM ANALYZE tool_executions;
-- VACUUM ANALYZE execution_cache;

COMMENT ON TABLE tools IS 'Catalog of all tools with immutable versions';
COMMENT ON TABLE tool_capabilities IS 'Searchable capabilities for semantic tool discovery';
COMMENT ON TABLE policy_allowlists IS 'Agent/phase-specific tool access control';
COMMENT ON TABLE tool_executions IS 'Complete execution history with provenance';
COMMENT ON TABLE execution_cache IS 'Short-lived cache for idempotent tool results';
COMMENT ON TABLE artifacts IS 'Large binary/JSON artifacts with content addressing';
COMMENT ON TABLE tool_metrics_daily IS 'Aggregated daily metrics for cost/performance tracking';
