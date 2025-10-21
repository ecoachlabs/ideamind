-- Knowledge Map Schema for QAQ/QAA/QV Triad System
-- Stores questions, answers, and validated bindings across all phases

-- ============================================================================
-- QUESTIONS TABLE
-- ============================================================================

CREATE TABLE questions (
  id VARCHAR(50) PRIMARY KEY,  -- e.g., "Q-001", "Q-INTAKE-042"
  phase VARCHAR(50) NOT NULL,  -- INTAKE, IDEATION, CRITIQUE, PRD, etc.
  run_id VARCHAR(255) NOT NULL,  -- Links to workflow run

  -- Question content
  text TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',  -- ["user", "scope", "nfr", etc.]

  -- Priority and dependencies
  priority DECIMAL(3, 2) NOT NULL,  -- 0.00 to 1.00 (impact × urgency)
  depends_on TEXT[] DEFAULT '{}',  -- ["Q-001", "Q-023"]

  -- Status
  status VARCHAR(20) DEFAULT 'open',  -- open, answered, rejected, carried_over

  -- Metadata
  generated_by VARCHAR(255) NOT NULL,  -- "QAQ-INTAKE-1"
  generated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Carry-over tracking
  originated_phase VARCHAR(50),  -- Original phase where question was created
  carried_from_phase VARCHAR(50),  -- If carried over from previous phase

  CONSTRAINT questions_priority_range CHECK (priority >= 0 AND priority <= 1),
  CONSTRAINT questions_status_valid CHECK (status IN ('open', 'answered', 'rejected', 'carried_over', 'superseded'))
);

CREATE INDEX idx_questions_phase ON questions(phase);
CREATE INDEX idx_questions_run_id ON questions(run_id);
CREATE INDEX idx_questions_status ON questions(status);
CREATE INDEX idx_questions_priority ON questions(priority DESC);
CREATE INDEX idx_questions_tags ON questions USING GIN(tags);
CREATE INDEX idx_questions_phase_status ON questions(phase, status);

-- Full-text search on question text
CREATE INDEX idx_questions_text_search ON questions USING GIN(to_tsvector('english', text));

-- ============================================================================
-- ANSWERS TABLE
-- ============================================================================

CREATE TABLE answers (
  id VARCHAR(50) PRIMARY KEY,  -- e.g., "A-001", "A-INTAKE-042"
  question_id VARCHAR(50) NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  run_id VARCHAR(255) NOT NULL,

  -- Answer content
  answer TEXT NOT NULL,

  -- Evidence and grounding
  evidence_ids TEXT[] DEFAULT '{}',  -- ["ide-123", "disc-456", "artifact-789"]
  evidence_types TEXT[] DEFAULT '{}',  -- ["IdeaSpec", "PRD", "APISpec"]
  assumptions TEXT[] DEFAULT '{}',  -- List of assumptions made
  unknowns TEXT[] DEFAULT '{}',  -- What we don't know yet

  -- Confidence and quality
  confidence DECIMAL(3, 2) NOT NULL,  -- 0.00 to 1.00

  -- Status
  status VARCHAR(20) DEFAULT 'proposed',  -- proposed, accepted, rejected

  -- Metadata
  generated_by VARCHAR(255) NOT NULL,  -- "QAA-INTAKE-1"
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  attempt_number INTEGER DEFAULT 1,  -- Retry counter

  CONSTRAINT answers_confidence_range CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT answers_status_valid CHECK (status IN ('proposed', 'accepted', 'rejected', 'superseded'))
);

CREATE INDEX idx_answers_question_id ON answers(question_id);
CREATE INDEX idx_answers_phase ON answers(phase);
CREATE INDEX idx_answers_run_id ON answers(run_id);
CREATE INDEX idx_answers_status ON answers(status);
CREATE INDEX idx_answers_confidence ON answers(confidence DESC);
CREATE INDEX idx_answers_evidence ON answers USING GIN(evidence_ids);

-- Full-text search on answer text
CREATE INDEX idx_answers_text_search ON answers USING GIN(to_tsvector('english', answer));

-- ============================================================================
-- BINDINGS (VALIDATIONS) TABLE
-- ============================================================================

CREATE TABLE bindings (
  id SERIAL PRIMARY KEY,
  question_id VARCHAR(50) NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_id VARCHAR(50) NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL,
  run_id VARCHAR(255) NOT NULL,

  -- Rubric scores (0.00 to 1.00)
  score_grounding DECIMAL(3, 2),  -- Citation quality
  score_completeness DECIMAL(3, 2),  -- Addresses full question
  score_specificity DECIMAL(3, 2),  -- Concrete vs hand-waving
  score_consistency DECIMAL(3, 2),  -- No conflicts with KM

  -- Overall decision
  decision VARCHAR(20) NOT NULL,  -- accept, reject

  -- Validation details
  reasons TEXT[] DEFAULT '{}',  -- Machine-readable rejection reasons
  hints TEXT[] DEFAULT '{}',  -- How to improve answer
  conflicts_with TEXT[] DEFAULT '{}',  -- IDs of conflicting Q/A pairs

  -- Metadata
  validated_by VARCHAR(255) NOT NULL,  -- "QV-INTAKE-1"
  validated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one binding per (question, answer) pair
  UNIQUE(question_id, answer_id),

  CONSTRAINT bindings_decision_valid CHECK (decision IN ('accept', 'reject')),
  CONSTRAINT bindings_scores_range CHECK (
    (score_grounding IS NULL OR (score_grounding >= 0 AND score_grounding <= 1)) AND
    (score_completeness IS NULL OR (score_completeness >= 0 AND score_completeness <= 1)) AND
    (score_specificity IS NULL OR (score_specificity >= 0 AND score_specificity <= 1)) AND
    (score_consistency IS NULL OR (score_consistency >= 0 AND score_consistency <= 1))
  )
);

CREATE INDEX idx_bindings_question_id ON bindings(question_id);
CREATE INDEX idx_bindings_answer_id ON bindings(answer_id);
CREATE INDEX idx_bindings_phase ON bindings(phase);
CREATE INDEX idx_bindings_decision ON bindings(decision);
CREATE INDEX idx_bindings_run_id ON bindings(run_id);

-- ============================================================================
-- KNOWLEDGE MAP NODES (Accepted Q/A pairs)
-- ============================================================================

CREATE TABLE km_nodes (
  id VARCHAR(50) PRIMARY KEY,  -- Same as question_id
  question_id VARCHAR(50) NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_id VARCHAR(50) NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  binding_id INTEGER NOT NULL REFERENCES bindings(id) ON DELETE CASCADE,

  phase VARCHAR(50) NOT NULL,
  run_id VARCHAR(255) NOT NULL,

  -- Composite content for search
  content TEXT NOT NULL,  -- "{question_text} | {answer_text}"

  -- Linked artifacts
  artifact_ids TEXT[] DEFAULT '{}',

  -- Theme/category
  themes TEXT[] DEFAULT '{}',  -- ["user-experience", "scalability", "security"]

  -- Status
  status VARCHAR(20) DEFAULT 'active',  -- active, superseded, deprecated
  superseded_by VARCHAR(50),  -- ID of newer KM node

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(question_id, answer_id)
);

CREATE INDEX idx_km_nodes_phase ON km_nodes(phase);
CREATE INDEX idx_km_nodes_run_id ON km_nodes(run_id);
CREATE INDEX idx_km_nodes_status ON km_nodes(status);
CREATE INDEX idx_km_nodes_themes ON km_nodes USING GIN(themes);
CREATE INDEX idx_km_nodes_artifacts ON km_nodes USING GIN(artifact_ids);

-- Full-text search on combined content
CREATE INDEX idx_km_nodes_content_search ON km_nodes USING GIN(to_tsvector('english', content));

-- ============================================================================
-- KNOWLEDGE MAP EDGES (Dependencies and relationships)
-- ============================================================================

CREATE TABLE km_edges (
  id SERIAL PRIMARY KEY,
  source_node_id VARCHAR(50) NOT NULL REFERENCES km_nodes(id) ON DELETE CASCADE,
  target_node_id VARCHAR(50) NOT NULL REFERENCES km_nodes(id) ON DELETE CASCADE,

  edge_type VARCHAR(50) NOT NULL,  -- depends_on, contradicts, supports, refines

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),

  UNIQUE(source_node_id, target_node_id, edge_type),

  CONSTRAINT km_edges_no_self_loop CHECK (source_node_id != target_node_id),
  CONSTRAINT km_edges_type_valid CHECK (edge_type IN ('depends_on', 'contradicts', 'supports', 'refines', 'supersedes'))
);

CREATE INDEX idx_km_edges_source ON km_edges(source_node_id);
CREATE INDEX idx_km_edges_target ON km_edges(target_node_id);
CREATE INDEX idx_km_edges_type ON km_edges(edge_type);

-- ============================================================================
-- CONFLICTS TABLE (Track contradictions)
-- ============================================================================

CREATE TABLE km_conflicts (
  id SERIAL PRIMARY KEY,
  node_a_id VARCHAR(50) NOT NULL REFERENCES km_nodes(id) ON DELETE CASCADE,
  node_b_id VARCHAR(50) NOT NULL REFERENCES km_nodes(id) ON DELETE CASCADE,

  conflict_type VARCHAR(50) NOT NULL,  -- contradiction, inconsistency, ambiguity
  description TEXT NOT NULL,

  -- Severity
  severity VARCHAR(20) DEFAULT 'medium',  -- low, medium, high, critical

  -- Resolution
  status VARCHAR(20) DEFAULT 'open',  -- open, investigating, resolved, accepted
  resolved_by VARCHAR(255),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Metadata
  detected_by VARCHAR(255) NOT NULL,  -- "guard.contradictionScan"
  detected_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(node_a_id, node_b_id),

  CONSTRAINT km_conflicts_severity_valid CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT km_conflicts_status_valid CHECK (status IN ('open', 'investigating', 'resolved', 'accepted'))
);

CREATE INDEX idx_km_conflicts_status ON km_conflicts(status);
CREATE INDEX idx_km_conflicts_severity ON km_conflicts(severity);
CREATE INDEX idx_km_conflicts_detected_at ON km_conflicts(detected_at DESC);

-- ============================================================================
-- BACKLOG (Unanswered high-priority questions)
-- ============================================================================

CREATE TABLE km_backlog (
  id SERIAL PRIMARY KEY,
  question_id VARCHAR(50) NOT NULL REFERENCES questions(id) ON DELETE CASCADE,

  source_phase VARCHAR(50) NOT NULL,
  target_phase VARCHAR(50) NOT NULL,  -- Where it's carried forward to

  reason VARCHAR(20) NOT NULL,  -- unanswered, needs_more_context, blocked
  blocking_dependencies TEXT[] DEFAULT '{}',

  priority DECIMAL(3, 2) NOT NULL,

  status VARCHAR(20) DEFAULT 'pending',  -- pending, in_progress, resolved

  carried_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,

  CONSTRAINT km_backlog_reason_valid CHECK (reason IN ('unanswered', 'needs_more_context', 'blocked', 'deferred')),
  CONSTRAINT km_backlog_status_valid CHECK (status IN ('pending', 'in_progress', 'resolved', 'dropped'))
);

CREATE INDEX idx_km_backlog_status ON km_backlog(status);
CREATE INDEX idx_km_backlog_target_phase ON km_backlog(target_phase);
CREATE INDEX idx_km_backlog_priority ON km_backlog(priority DESC);

-- ============================================================================
-- COVERAGE METRICS (Per phase)
-- ============================================================================

CREATE TABLE km_coverage (
  id SERIAL PRIMARY KEY,
  phase VARCHAR(50) NOT NULL,
  run_id VARCHAR(255) NOT NULL,

  -- Coverage stats
  total_themes INTEGER DEFAULT 0,
  covered_themes INTEGER DEFAULT 0,
  coverage_ratio DECIMAL(5, 2),  -- covered / total

  total_questions INTEGER DEFAULT 0,
  answered_questions INTEGER DEFAULT 0,
  accepted_answers INTEGER DEFAULT 0,
  rejected_answers INTEGER DEFAULT 0,

  high_priority_open INTEGER DEFAULT 0,  -- Questions with priority > 0.7 still open

  -- Acceptance metrics
  acceptance_rate DECIMAL(5, 2),  -- accepted / (accepted + rejected)
  avg_cycles_per_question DECIMAL(5, 2),  -- Avg regenerate loops
  avg_confidence DECIMAL(3, 2),

  -- Timestamps
  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(phase, run_id)
);

CREATE INDEX idx_km_coverage_phase ON km_coverage(phase);
CREATE INDEX idx_km_coverage_run_id ON km_coverage(run_id);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active Knowledge Map (all accepted Q/A pairs, not superseded)
CREATE VIEW km_active AS
SELECT
  kn.id,
  kn.phase,
  q.text AS question_text,
  a.answer AS answer_text,
  kn.themes,
  kn.artifact_ids,
  a.confidence,
  b.score_grounding,
  b.score_completeness,
  b.score_specificity,
  b.score_consistency,
  kn.created_at
FROM km_nodes kn
INNER JOIN questions q ON kn.question_id = q.id
INNER JOIN answers a ON kn.answer_id = a.id
INNER JOIN bindings b ON kn.binding_id = b.id
WHERE kn.status = 'active';

-- Open high-priority questions (need attention)
CREATE VIEW km_critical_questions AS
SELECT
  q.id,
  q.phase,
  q.text,
  q.priority,
  q.tags,
  q.depends_on,
  q.status,
  q.generated_at
FROM questions q
WHERE q.priority >= 0.7
  AND q.status IN ('open', 'carried_over')
ORDER BY q.priority DESC, q.generated_at ASC;

-- Conflicts requiring resolution
CREATE VIEW km_active_conflicts AS
SELECT
  c.id,
  c.conflict_type,
  c.severity,
  c.status,
  n1.phase AS phase_a,
  q1.text AS question_a,
  n2.phase AS phase_b,
  q2.text AS question_b,
  c.description,
  c.detected_at
FROM km_conflicts c
INNER JOIN km_nodes n1 ON c.node_a_id = n1.id
INNER JOIN km_nodes n2 ON c.node_b_id = n2.id
INNER JOIN questions q1 ON n1.question_id = q1.id
INNER JOIN questions q2 ON n2.question_id = q2.id
WHERE c.status IN ('open', 'investigating')
ORDER BY c.severity DESC, c.detected_at ASC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Calculate coverage for a phase/run
CREATE OR REPLACE FUNCTION calculate_km_coverage(p_phase VARCHAR, p_run_id VARCHAR)
RETURNS void AS $$
DECLARE
  v_total_questions INTEGER;
  v_answered INTEGER;
  v_accepted INTEGER;
  v_rejected INTEGER;
  v_high_priority_open INTEGER;
  v_acceptance_rate DECIMAL(5, 2);
BEGIN
  -- Count questions
  SELECT COUNT(*) INTO v_total_questions
  FROM questions
  WHERE phase = p_phase AND run_id = p_run_id;

  -- Count answered
  SELECT COUNT(DISTINCT q.id) INTO v_answered
  FROM questions q
  INNER JOIN answers a ON q.id = a.question_id
  WHERE q.phase = p_phase AND q.run_id = p_run_id;

  -- Count accepted
  SELECT COUNT(*) INTO v_accepted
  FROM bindings b
  WHERE b.phase = p_phase AND b.run_id = p_run_id AND b.decision = 'accept';

  -- Count rejected
  SELECT COUNT(*) INTO v_rejected
  FROM bindings b
  WHERE b.phase = p_phase AND b.run_id = p_run_id AND b.decision = 'reject';

  -- High priority open
  SELECT COUNT(*) INTO v_high_priority_open
  FROM questions
  WHERE phase = p_phase AND run_id = p_run_id
    AND priority >= 0.7 AND status IN ('open', 'carried_over');

  -- Acceptance rate
  IF (v_accepted + v_rejected) > 0 THEN
    v_acceptance_rate := (v_accepted::DECIMAL / (v_accepted + v_rejected)) * 100;
  ELSE
    v_acceptance_rate := 0;
  END IF;

  -- Insert/update coverage record
  INSERT INTO km_coverage (
    phase, run_id, total_questions, answered_questions,
    accepted_answers, rejected_answers, high_priority_open,
    acceptance_rate, calculated_at
  )
  VALUES (
    p_phase, p_run_id, v_total_questions, v_answered,
    v_accepted, v_rejected, v_high_priority_open,
    v_acceptance_rate, NOW()
  )
  ON CONFLICT (phase, run_id) DO UPDATE
  SET
    total_questions = EXCLUDED.total_questions,
    answered_questions = EXCLUDED.answered_questions,
    accepted_answers = EXCLUDED.accepted_answers,
    rejected_answers = EXCLUDED.rejected_answers,
    high_priority_open = EXCLUDED.high_priority_open,
    acceptance_rate = EXCLUDED.acceptance_rate,
    calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Create KM node from accepted binding
CREATE OR REPLACE FUNCTION create_km_node_from_binding(p_binding_id INTEGER)
RETURNS VARCHAR AS $$
DECLARE
  v_binding RECORD;
  v_question RECORD;
  v_answer RECORD;
  v_node_id VARCHAR;
BEGIN
  -- Get binding details
  SELECT * INTO v_binding FROM bindings WHERE id = p_binding_id;

  IF v_binding.decision != 'accept' THEN
    RAISE EXCEPTION 'Cannot create KM node from rejected binding';
  END IF;

  -- Get question and answer
  SELECT * INTO v_question FROM questions WHERE id = v_binding.question_id;
  SELECT * INTO v_answer FROM answers WHERE id = v_binding.answer_id;

  -- Use question ID as node ID
  v_node_id := v_question.id;

  -- Insert KM node
  INSERT INTO km_nodes (
    id, question_id, answer_id, binding_id,
    phase, run_id, content, artifact_ids,
    themes, status, created_at
  )
  VALUES (
    v_node_id, v_question.id, v_answer.id, p_binding_id,
    v_binding.phase, v_binding.run_id,
    v_question.text || ' | ' || v_answer.answer,
    v_answer.evidence_ids,
    v_question.tags,
    'active', NOW()
  )
  ON CONFLICT (question_id, answer_id) DO UPDATE
  SET updated_at = NOW();

  -- Update question status
  UPDATE questions SET status = 'answered' WHERE id = v_question.id;
  UPDATE answers SET status = 'accepted' WHERE id = v_answer.id;

  RETURN v_node_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE questions IS 'All questions generated by QAQ agents across phases';
COMMENT ON TABLE answers IS 'All answers generated by QAA agents';
COMMENT ON TABLE bindings IS 'Validation results from QV validators';
COMMENT ON TABLE km_nodes IS 'Accepted Q/A pairs forming the Knowledge Map';
COMMENT ON TABLE km_edges IS 'Relationships between KM nodes';
COMMENT ON TABLE km_conflicts IS 'Detected contradictions requiring resolution';
COMMENT ON TABLE km_backlog IS 'Unanswered questions carried forward to next phase';
COMMENT ON TABLE km_coverage IS 'Coverage metrics per phase';
