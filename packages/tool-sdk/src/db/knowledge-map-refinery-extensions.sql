-- Knowledge Map Refinery Extensions
-- Enhances the base KM schema with Fission/Fusion, Entity Resolution, Versioning, and Embeddings
--
-- Migration: This adds new tables and columns without breaking existing data
-- Run after: knowledge-map-schema.sql

-- ============================================================================
-- EXTEND EXISTING TABLES
-- ============================================================================

-- Add Refinery columns to questions table
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64),  -- SHA-256 for idempotence
  ADD COLUMN IF NOT EXISTS parent_question_id VARCHAR(50),  -- For fission decomposition
  ADD COLUMN IF NOT EXISTS is_atomic BOOLEAN DEFAULT true,  -- False if compound question
  ADD COLUMN IF NOT EXISTS fission_tree_id VARCHAR(50);  -- Links to fission_trees table

CREATE INDEX IF NOT EXISTS idx_questions_content_hash ON questions(content_hash);
CREATE INDEX IF NOT EXISTS idx_questions_parent ON questions(parent_question_id);

-- Add Refinery columns to answers table
ALTER TABLE answers
  ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64),  -- SHA-256 for idempotence
  ADD COLUMN IF NOT EXISTS version VARCHAR(20) DEFAULT '1.0.0',  -- Semantic versioning
  ADD COLUMN IF NOT EXISTS canonical_answer_id VARCHAR(50),  -- For fusion: points to canonical
  ADD COLUMN IF NOT EXISTS is_canonical BOOLEAN DEFAULT false,  -- True if this is the fused answer
  ADD COLUMN IF NOT EXISTS fusion_cluster_id VARCHAR(50),  -- Links to fusion cluster
  ADD COLUMN IF NOT EXISTS provenance JSONB;  -- {tool_versions, sources, lineage}

CREATE INDEX IF NOT EXISTS idx_answers_content_hash ON answers(content_hash);
CREATE INDEX IF NOT EXISTS idx_answers_version ON answers(version);
CREATE INDEX IF NOT EXISTS idx_answers_canonical ON answers(canonical_answer_id);

-- Extend km_edges with new relationship types
-- (Already supports supersedes, derived_from via edge_type column)
ALTER TABLE km_edges DROP CONSTRAINT IF EXISTS km_edges_type_valid;
ALTER TABLE km_edges ADD CONSTRAINT km_edges_type_valid CHECK (
  edge_type IN (
    'depends_on',
    'contradicts',
    'supports',
    'refines',
    'supersedes',
    'derived_from',      -- Fission: atom derived from compound
    'fission_of',        -- Compound question fissed into atoms
    'fusion_of',         -- Canonical answer fused from multiple
    'binds_to',          -- Q binds to A
    'mentions',          -- Mentions an entity
    'owned_by'           -- Owned by artifact/phase
  )
);

-- ============================================================================
-- ENTITIES (Domain Ontology)
-- ============================================================================

CREATE TABLE IF NOT EXISTS entities (
  id VARCHAR(50) PRIMARY KEY,  -- e.g., "E-001", "E-ROLE-PM"
  canonical VARCHAR(255) NOT NULL,  -- Canonical name: "Product Manager"
  aliases TEXT[] DEFAULT '{}',  -- ["PM", "product mgr", "PdM"]
  type VARCHAR(50) NOT NULL,  -- role, tool, process, artifact, actor, concept
  source_ref VARCHAR(255),  -- Where entity was first defined

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(canonical, type)
);

CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_canonical ON entities(canonical);
CREATE INDEX idx_entities_aliases ON entities USING GIN(aliases);

COMMENT ON TABLE entities IS 'Domain entities for co-reference resolution and ontology linking';

-- ============================================================================
-- QUESTION-ENTITY LINKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS q_entities (
  question_id VARCHAR(50) NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  entity_id VARCHAR(50) NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  PRIMARY KEY (question_id, entity_id)
);

CREATE INDEX idx_q_entities_question ON q_entities(question_id);
CREATE INDEX idx_q_entities_entity ON q_entities(entity_id);

COMMENT ON TABLE q_entities IS 'Links questions to entities they mention';

-- ============================================================================
-- ANSWER-ENTITY LINKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS a_entities (
  answer_id VARCHAR(50) NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  entity_id VARCHAR(50) NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  PRIMARY KEY (answer_id, entity_id)
);

CREATE INDEX idx_a_entities_answer ON a_entities(answer_id);
CREATE INDEX idx_a_entities_entity ON a_entities(entity_id);

COMMENT ON TABLE a_entities IS 'Links answers to entities they mention';

-- ============================================================================
-- FISSION TREES (Question Decomposition)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fission_trees (
  id VARCHAR(50) PRIMARY KEY,  -- e.g., "FISSION-Q-001"
  root_question_id VARCHAR(50) NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  run_id VARCHAR(255) NOT NULL,

  -- Decomposition structure
  atoms JSONB NOT NULL,  -- [{id, type, text}, ...]
  edges JSONB NOT NULL,  -- [{src, rel, dst}, ...]

  -- Quality metrics
  coverage DECIMAL(3, 2),  -- 0.00 to 1.00 (how well atoms cover original)
  atom_count INTEGER,

  -- Provenance
  tool_id VARCHAR(100),  -- "refine.fission@1.0.0"
  generated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fission_coverage_range CHECK (coverage >= 0 AND coverage <= 1)
);

CREATE INDEX idx_fission_trees_root ON fission_trees(root_question_id);
CREATE INDEX idx_fission_trees_phase ON fission_trees(phase);
CREATE INDEX idx_fission_trees_run_id ON fission_trees(run_id);

COMMENT ON TABLE fission_trees IS 'Question decomposition trees (compound → atomic)';

-- ============================================================================
-- FUSION CLUSTERS (Answer Synthesis)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fusion_clusters (
  id VARCHAR(50) PRIMARY KEY,  -- e.g., "CLUSTER-23"
  topic VARCHAR(255) NOT NULL,
  phase VARCHAR(50) NOT NULL,
  run_id VARCHAR(255) NOT NULL,

  -- Canonical answer
  canonical_answer_id VARCHAR(50) REFERENCES answers(id) ON DELETE SET NULL,

  -- Contributing answers
  contributor_ids TEXT[] NOT NULL,  -- ["A-001", "A-002", "A-017"]

  -- Quality metrics
  consensus_confidence DECIMAL(3, 2),  -- 0.00 to 1.00
  fusion_compression_rate DECIMAL(5, 2),  -- Original count / canonical count
  cluster_purity DECIMAL(3, 2),  -- Semantic coherence

  -- Conflicts
  conflict_count INTEGER DEFAULT 0,
  conflicts JSONB,  -- [{answer_ids, description}]

  -- Provenance
  tool_id VARCHAR(100),  -- "refine.fusion@1.0.0"
  generated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fusion_consensus_range CHECK (consensus_confidence >= 0 AND consensus_confidence <= 1)
);

CREATE INDEX idx_fusion_clusters_phase ON fusion_clusters(phase);
CREATE INDEX idx_fusion_clusters_run_id ON fusion_clusters(run_id);
CREATE INDEX idx_fusion_clusters_canonical ON fusion_clusters(canonical_answer_id);

COMMENT ON TABLE fusion_clusters IS 'Answer fusion clusters (many → canonical)';

-- ============================================================================
-- KNOWLEDGE FRAMES (Structured Slots)
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_frames (
  id VARCHAR(50) PRIMARY KEY,  -- e.g., "FRAME-77"
  topic VARCHAR(255) NOT NULL,
  phase VARCHAR(50) NOT NULL,
  run_id VARCHAR(255) NOT NULL,

  -- Structured slots (Who/What/When/Where/Why/How)
  slots JSONB NOT NULL,  -- {who, what, when, where, why, how, metrics, caveats, exceptions}

  -- Evidence
  evidence_ids TEXT[] DEFAULT '{}',

  -- Lineage
  lineage JSONB,  -- {atoms: [...], clusters: [...], answers: [...]}

  -- Associated cluster
  fusion_cluster_id VARCHAR(50) REFERENCES fusion_clusters(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_frames_phase ON knowledge_frames(phase);
CREATE INDEX idx_knowledge_frames_run_id ON knowledge_frames(run_id);
CREATE INDEX idx_knowledge_frames_topic ON knowledge_frames(topic);
CREATE INDEX idx_knowledge_frames_cluster ON knowledge_frames(fusion_cluster_id);

COMMENT ON TABLE knowledge_frames IS 'Structured knowledge representations (Who/What/When/Where/Why/How)';

-- ============================================================================
-- EMBEDDINGS (Vector Search)
-- ============================================================================

CREATE TABLE IF NOT EXISTS embeddings (
  id VARCHAR(50) PRIMARY KEY,  -- Same as question_id or answer_id
  entity_type VARCHAR(20) NOT NULL,  -- 'question' or 'answer'
  entity_id VARCHAR(50) NOT NULL,  -- References questions.id or answers.id
  phase VARCHAR(50) NOT NULL,

  -- Embedding metadata (actual vector stored in Vector DB)
  embedding_model VARCHAR(100) NOT NULL,  -- "text-embedding-3-small", "embed-english-v3.0"
  embedding_dim INTEGER NOT NULL,  -- 1536, 1024, etc.
  vector_db VARCHAR(50) NOT NULL,  -- "qdrant", "weaviate", "pinecone"
  vector_id VARCHAR(100) NOT NULL,  -- ID in vector DB

  -- Content hash for cache invalidation
  content_hash VARCHAR(64) NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(entity_type, entity_id)
);

CREATE INDEX idx_embeddings_entity ON embeddings(entity_type, entity_id);
CREATE INDEX idx_embeddings_phase ON embeddings(phase);
CREATE INDEX idx_embeddings_content_hash ON embeddings(content_hash);

COMMENT ON TABLE embeddings IS 'Tracks which entities have vector embeddings in Vector DB';

-- ============================================================================
-- REFINERY AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS refinery_runs (
  id SERIAL PRIMARY KEY,
  run_id VARCHAR(255) NOT NULL,
  phase VARCHAR(50) NOT NULL,

  -- Input batch
  input_count INTEGER NOT NULL,

  -- Stage results
  stages JSONB NOT NULL,  -- {normalize: {...}, fission: {...}, fusion: {...}}

  -- Output metrics
  accepted_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,
  fission_coverage DECIMAL(3, 2),
  fusion_consensus DECIMAL(3, 2),

  -- Performance
  total_duration_ms INTEGER,
  total_cost_usd DECIMAL(10, 4),

  -- Gate decision
  gate_passed BOOLEAN,
  gate_failures TEXT[],

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  UNIQUE(run_id, phase)
);

CREATE INDEX idx_refinery_runs_run_id ON refinery_runs(run_id);
CREATE INDEX idx_refinery_runs_phase ON refinery_runs(phase);
CREATE INDEX idx_refinery_runs_started_at ON refinery_runs(started_at DESC);

COMMENT ON TABLE refinery_runs IS 'Audit log of Refinery pipeline executions';

-- ============================================================================
-- DELTA EVENTS (Published Changes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS km_delta_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(50) UNIQUE NOT NULL,  -- e.g., "EVT-001"
  event_type VARCHAR(50) NOT NULL,  -- kmap.delta.created, kmap.delta.updated, kmap.delta.superseded

  phase VARCHAR(50) NOT NULL,
  run_id VARCHAR(255) NOT NULL,

  -- Affected entities
  affected_nodes TEXT[] DEFAULT '{}',
  affected_edges TEXT[] DEFAULT '{}',

  -- Payload
  delta JSONB NOT NULL,  -- {added: [], updated: [], removed: []}

  -- Publishing status
  published_to TEXT[] DEFAULT '{}',  -- ["kafka", "redis", "webhook"]

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT km_delta_events_type_valid CHECK (
    event_type IN ('kmap.delta.created', 'kmap.delta.updated', 'kmap.delta.superseded', 'kmap.delta.conflict')
  )
);

CREATE INDEX idx_km_delta_events_event_id ON km_delta_events(event_id);
CREATE INDEX idx_km_delta_events_phase ON km_delta_events(phase);
CREATE INDEX idx_km_delta_events_run_id ON km_delta_events(run_id);
CREATE INDEX idx_km_delta_events_created_at ON km_delta_events(created_at DESC);

COMMENT ON TABLE km_delta_events IS 'Published delta events for cache warming and notifications';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Generate content hash for idempotence
CREATE OR REPLACE FUNCTION generate_content_hash(p_text TEXT)
RETURNS VARCHAR AS $$
BEGIN
  RETURN encode(digest(p_text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create entity if not exists
CREATE OR REPLACE FUNCTION upsert_entity(
  p_canonical VARCHAR,
  p_type VARCHAR,
  p_alias VARCHAR DEFAULT NULL
)
RETURNS VARCHAR AS $$
DECLARE
  v_entity_id VARCHAR;
  v_existing RECORD;
BEGIN
  -- Check if entity exists
  SELECT id INTO v_entity_id FROM entities
  WHERE canonical = p_canonical AND type = p_type;

  IF v_entity_id IS NULL THEN
    -- Create new entity
    v_entity_id := 'E-' || p_type || '-' || nextval('entities_seq');

    INSERT INTO entities (id, canonical, type, aliases)
    VALUES (v_entity_id, p_canonical, p_type, ARRAY[p_canonical]);
  ELSIF p_alias IS NOT NULL THEN
    -- Add alias if provided
    UPDATE entities
    SET aliases = array_append(aliases, p_alias),
        updated_at = NOW()
    WHERE id = v_entity_id
      AND NOT (p_alias = ANY(aliases));
  END IF;

  RETURN v_entity_id;
END;
$$ LANGUAGE plpgsql;

-- Sequence for entity IDs
CREATE SEQUENCE IF NOT EXISTS entities_seq START 1;

-- ============================================================================
-- UPDATED VIEWS
-- ============================================================================

-- Enhanced active KM view with Refinery data
CREATE OR REPLACE VIEW km_active_enhanced AS
SELECT
  kn.id,
  kn.phase,
  q.text AS question_text,
  q.is_atomic,
  q.parent_question_id,
  a.answer AS answer_text,
  a.version AS answer_version,
  a.is_canonical,
  a.canonical_answer_id,
  kn.themes,
  kn.artifact_ids,
  a.confidence,
  b.score_grounding,
  b.score_completeness,
  b.score_specificity,
  b.score_consistency,
  -- Entity mentions
  (SELECT array_agg(e.canonical) FROM q_entities qe
   JOIN entities e ON qe.entity_id = e.id
   WHERE qe.question_id = q.id) AS question_entities,
  (SELECT array_agg(e.canonical) FROM a_entities ae
   JOIN entities e ON ae.entity_id = e.id
   WHERE ae.answer_id = a.id) AS answer_entities,
  kn.created_at,
  kn.updated_at
FROM km_nodes kn
INNER JOIN questions q ON kn.question_id = q.id
INNER JOIN answers a ON kn.answer_id = a.id
INNER JOIN bindings b ON kn.binding_id = b.id
WHERE kn.status = 'active';

COMMENT ON VIEW km_active_enhanced IS 'Active Knowledge Map with Refinery enhancements (entities, fission, fusion)';

-- ============================================================================
-- PERMISSIONS (Optional - for multi-tenant setups)
-- ============================================================================

-- Grant read access to all KM tables
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO km_reader;

-- Grant write access to Refinery service
-- GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO km_refinery;

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================

/*
Migration Checklist:
1. ✅ Adds columns to existing tables (non-breaking, uses IF NOT EXISTS)
2. ✅ Creates new tables for Refinery features
3. ✅ Adds new indexes for performance
4. ✅ Extends km_edges constraint with new relationship types
5. ✅ Creates helper functions for common operations
6. ✅ Updates views with enhanced data

Safe to run on existing databases - won't delete or modify existing data.

To rollback (if needed):
- DROP TABLE IF EXISTS fission_trees, fusion_clusters, knowledge_frames, embeddings, refinery_runs, km_delta_events CASCADE;
- DROP TABLE IF EXISTS q_entities, a_entities CASCADE;
- DROP TABLE IF EXISTS entities CASCADE;
- ALTER TABLE questions DROP COLUMN IF EXISTS content_hash, parent_question_id, is_atomic, fission_tree_id;
- ALTER TABLE answers DROP COLUMN IF EXISTS content_hash, version, canonical_answer_id, is_canonical, fusion_cluster_id, provenance;
*/
