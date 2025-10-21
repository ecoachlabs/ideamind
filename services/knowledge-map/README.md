# Knowledge Map Service with RAG

RESTful API service for semantic search and retrieval over validated Question/Answer pairs in the IdeaMine Knowledge Map.

## Features

- **Semantic Search**: Query the Knowledge Map using natural language
- **Coverage Metrics**: Track Q/A coverage across phases
- **Conflict Detection**: Identify contradictions between Q/A pairs
- **Question Suggestions**: Generate questions for underexplored themes
- **Vector Similarity**: (TODO) Integrate pgvector or dedicated vector DB

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│           Knowledge Map Service (Port 8003)             │
│                                                         │
│  Endpoints:                                            │
│  - POST /api/v1/search         (Semantic search)      │
│  - GET  /api/v1/coverage/{...} (Coverage metrics)     │
│  - POST /api/v1/conflicts      (Conflict detection)   │
│  - GET  /api/v1/suggest/{...}  (Question suggestions) │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ asyncpg
                 │
┌────────────────▼────────────────────────────────────────┐
│              PostgreSQL + pgvector                      │
│                                                         │
│  Tables:                                               │
│  - questions                                           │
│  - answers                                             │
│  - bindings                                            │
│  - km_nodes                                            │
│  - km_edges                                            │
│  - km_coverage (view)                                  │
└─────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- Python 3.11+
- PostgreSQL 15+ with Knowledge Map schema
- (Optional) pgvector extension for vector similarity

### Setup

```bash
cd services/knowledge-map

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export KM_DATABASE_URL="postgresql://user:pass@localhost:5432/knowledge_map"

# Run service
python src/main.py
```

Service will start on `http://localhost:8003`

### Docker

```bash
docker build -t ideamine/knowledge-map:latest .
docker run -p 8003:8003 \
  -e KM_DATABASE_URL="postgresql://..." \
  ideamine/knowledge-map:latest
```

## API Usage

### 1. Semantic Search

Search the Knowledge Map using natural language:

```bash
curl -X POST http://localhost:8003/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the NFR requirements for API latency?",
    "phase": "PRD",
    "limit": 10,
    "threshold": 0.7
  }'
```

**Response:**

```json
[
  {
    "node_id": "km-prd-042",
    "question": "What is the NFR for API response time under peak load?",
    "answer": "API p95 latency must be < 200ms under 10,000 RPS [evidence:NFR-DOC-001]",
    "phase": "PRD",
    "similarity_score": 0.92,
    "tags": ["nfr", "performance", "api"],
    "created_at": "2025-01-15T10:30:00Z"
  }
]
```

### 2. Get Coverage Metrics

```bash
curl http://localhost:8003/api/v1/coverage/PRD/run-abc123
```

**Response:**

```json
{
  "phase": "PRD",
  "run_id": "run-abc123",
  "total_questions": 45,
  "answered_questions": 38,
  "coverage_ratio": 0.84,
  "acceptance_rate": 0.89,
  "high_priority_open": 2
}
```

### 3. Detect Conflicts

```bash
curl -X POST http://localhost:8003/api/v1/conflicts/detect \
  -H "Content-Type: application/json" \
  -d '{
    "new_answer": {
      "question": "How long do we retain user data?",
      "answer": "User data is retained for 90 days"
    },
    "phase": "PRD"
  }'
```

**Response:**

```json
{
  "has_conflicts": true,
  "conflicts": [
    {
      "conflict_with": "km-prd-089",
      "conflict_type": "value",
      "description": "Conflicting retention periods: 90 days vs 1 year",
      "severity": "high"
    }
  ],
  "consistency_score": 0.75
}
```

### 4. Suggest Questions

```bash
curl http://localhost:8003/api/v1/suggest/ARCH/run-abc123?limit=5
```

**Response:**

```json
{
  "suggestions": [
    {
      "suggested_theme": "scalability",
      "current_coverage": 2,
      "suggested_question": "What are the horizontal scaling requirements?",
      "priority": 0.85
    }
  ]
}
```

## Integration with QAQ/QAA/QV Agents

The Knowledge Map service is called by:

1. **Validator Hub**: After Q/A validation, accepted bindings are inserted into KM
2. **Answer Agents**: Query KM for existing answers to avoid duplication
3. **Gatekeepers**: Check KM coverage metrics before allowing phase completion

### Example: Validator Integration

```python
from httpx import AsyncClient

# After QV validator accepts binding
async def persist_to_km(binding):
    async with AsyncClient() as client:
        # Insert into KM via service API
        response = await client.post(
            "http://localhost:8003/api/v1/nodes",
            json={
                "node_id": f"km-{binding['phase']}-{binding['id']}",
                "question_id": binding['question_id'],
                "answer_id": binding['answer_id'],
                "phase": binding['phase'],
                "run_id": binding['run_id'],
                "question": binding['question'],
                "answer": binding['answer'],
                "evidence_ids": binding['evidence_ids'],
                "tags": binding['tags']
            }
        )
        return response.json()
```

## Vector Search Implementation (TODO)

Current implementation uses simple text search with pg_trgm. For production, integrate with:

### Option 1: pgvector (PostgreSQL extension)

```sql
-- Enable pgvector
CREATE EXTENSION vector;

-- Add embedding column to km_nodes
ALTER TABLE km_nodes ADD COLUMN embedding vector(1536);

-- Create index
CREATE INDEX ON km_nodes USING ivfflat (embedding vector_cosine_ops);
```

Then generate embeddings:

```python
from sentence_transformers import SentenceTransformer
import asyncpg

model = SentenceTransformer('all-MiniLM-L6-v2')

async def index_km_node(node):
    # Generate embedding
    text = f"{node['question']} {node['answer']}"
    embedding = model.encode(text).tolist()

    # Store in database
    async with db_pool.acquire() as conn:
        await conn.execute(
            "UPDATE km_nodes SET embedding = $1 WHERE node_id = $2",
            embedding, node['node_id']
        )
```

### Option 2: Dedicated Vector DB (Pinecone, Weaviate, Qdrant)

```python
import pinecone

pinecone.init(api_key="...", environment="us-west1-gcp")
index = pinecone.Index("knowledge-map")

# Index Q/A pair
index.upsert(vectors=[
    {
        "id": node_id,
        "values": embedding,
        "metadata": {
            "question": question,
            "answer": answer,
            "phase": phase,
            "tags": tags
        }
    }
])

# Search
results = index.query(
    vector=query_embedding,
    top_k=10,
    filter={"phase": "PRD"}
)
```

## Performance Considerations

### Caching

Add Redis caching for frequently queried nodes:

```python
import redis.asyncio as redis

redis_client = await redis.from_url("redis://localhost")

@app.get("/api/v1/search")
async def search(request: SearchRequest):
    cache_key = f"search:{hash(request.json())}"

    # Check cache
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    # Query database
    results = await query_km(request)

    # Cache for 5 minutes
    await redis_client.setex(cache_key, 300, json.dumps(results))

    return results
```

### Read Replicas

For high-traffic deployments, use PostgreSQL read replicas:

```python
# Write pool (primary)
write_pool = await asyncpg.create_pool(PRIMARY_DB_URL)

# Read pool (replica)
read_pool = await asyncpg.create_pool(REPLICA_DB_URL)

@app.get("/api/v1/search")
async def search(request: SearchRequest):
    # Use read replica for queries
    async with read_pool.acquire() as conn:
        return await conn.fetch(query, ...)
```

## Monitoring

### Health Check

```bash
curl http://localhost:8003/health
```

### Metrics

Expose Prometheus metrics:

```python
from prometheus_fastapi_instrumentator import Instrumentator

Instrumentator().instrument(app).expose(app)
```

Then scrape at `http://localhost:8003/metrics`

## Development

### Run Tests

```bash
pytest tests/ -v
```

### Generate API Docs

FastAPI auto-generates OpenAPI docs at:
- Swagger UI: http://localhost:8003/docs
- ReDoc: http://localhost:8003/redoc

## Roadmap

- [ ] Implement pgvector integration for true semantic search
- [ ] Add embedding generation pipeline (OpenAI, Sentence-Transformers)
- [ ] Integrate with guard.contradictionScan tool for sophisticated conflict detection
- [ ] Add GraphQL API for complex queries
- [ ] Implement real-time updates via WebSockets
- [ ] Add audit logging for all queries and modifications
- [ ] Implement rate limiting and authentication
- [ ] Add batch import/export APIs
- [ ] Create KM visualization dashboard (see `/docs/KM_DASHBOARD.md`)

## References

- **Knowledge Map Schema**: `/packages/tool-sdk/src/db/knowledge-map-schema.sql`
- **QAQ/QAA/QV Hubs**: `/packages/agent-sdk/src/hubs/`
- **EnhancedPhaseCoordinator**: `/packages/orchestrator-core/src/base/enhanced-phase-coordinator.ts`
- **Guard Tools**: `/tools/guard/`
