-- Knowledge Refinery Table
-- Stores accumulated knowledge for semantic search and Q/A/V integration

CREATE TABLE IF NOT EXISTS knowledge_refinery (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('requirement', 'decision', 'pattern', 'constraint', 'lesson', 'fact')),
  source TEXT NOT NULL,  -- Phase or run ID that created this
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence JSONB NOT NULL DEFAULT '[]',  -- Array of evidence strings
  tags JSONB NOT NULL DEFAULT '[]',  -- Array of tag strings
  metadata JSONB DEFAULT '{}',
  embedding JSONB,  -- Vector embedding for semantic search
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_count INTEGER NOT NULL DEFAULT 0
);

-- Indexes for efficient queries
CREATE INDEX idx_knowledge_category ON knowledge_refinery(category);
CREATE INDEX idx_knowledge_source ON knowledge_refinery(source);
CREATE INDEX idx_knowledge_confidence ON knowledge_refinery(confidence DESC);
CREATE INDEX idx_knowledge_access_count ON knowledge_refinery(access_count DESC);
CREATE INDEX idx_knowledge_created_at ON knowledge_refinery(created_at DESC);
CREATE INDEX idx_knowledge_tags ON knowledge_refinery USING GIN(tags);

-- Full text search index
CREATE INDEX idx_knowledge_key_text ON knowledge_refinery USING GIN(to_tsvector('english', key));

-- View for most popular knowledge
CREATE OR REPLACE VIEW knowledge_most_accessed AS
SELECT 
  id,
  key,
  category,
  confidence,
  access_count,
  created_at
FROM knowledge_refinery
ORDER BY access_count DESC, created_at DESC
LIMIT 100;

-- View for high-confidence knowledge
CREATE OR REPLACE VIEW knowledge_high_confidence AS
SELECT 
  id,
  key,
  value,
  category,
  confidence,
  evidence,
  created_at
FROM knowledge_refinery
WHERE confidence >= 0.8
ORDER BY confidence DESC, created_at DESC;

-- Function to search knowledge by text
CREATE OR REPLACE FUNCTION search_knowledge(search_query TEXT, max_results INTEGER DEFAULT 10)
RETURNS TABLE (
  id TEXT,
  key TEXT,
  value JSONB,
  category TEXT,
  confidence NUMERIC,
  relevance REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    k.id,
    k.key,
    k.value,
    k.category,
    k.confidence,
    ts_rank(to_tsvector('english', k.key), plainto_tsquery('english', search_query)) AS relevance
  FROM knowledge_refinery k
  WHERE to_tsvector('english', k.key) @@ plainto_tsquery('english', search_query)
  ORDER BY relevance DESC, k.confidence DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE knowledge_refinery IS 'Stores accumulated knowledge for semantic search and autonomous answering';
COMMENT ON COLUMN knowledge_refinery.embedding IS 'Vector embedding for semantic similarity search';
COMMENT ON COLUMN knowledge_refinery.access_count IS 'Number of times this knowledge has been retrieved';
