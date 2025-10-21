"""
Knowledge Map Service with RAG

Provides semantic search and retrieval over validated Q/A pairs.
Integrates with PostgreSQL + pgvector for vector similarity search.

Endpoints:
- POST /api/v1/search - Semantic search over KM
- POST /api/v1/nodes - Insert new KM node
- GET /api/v1/coverage - Get coverage metrics
- POST /api/v1/conflicts/detect - Detect conflicts
- GET /api/v1/suggest - Suggest questions based on gaps
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import asyncpg
import os
from datetime import datetime

# TODO: Integrate with vector DB (pgvector, Pinecone, Weaviate)
# For now, use simple PostgreSQL queries

app = FastAPI(
    title="Knowledge Map Service",
    description="Semantic search and RAG over validated Q/A pairs",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection pool
db_pool: Optional[asyncpg.Pool] = None


# =============================================================================
# Models
# =============================================================================

class SearchRequest(BaseModel):
    query: str = Field(..., description="Natural language query")
    phase: Optional[str] = Field(None, description="Filter by phase")
    limit: int = Field(10, ge=1, le=100, description="Max results")
    threshold: float = Field(0.7, ge=0.0, le=1.0, description="Similarity threshold")


class SearchResult(BaseModel):
    node_id: str
    question: str
    answer: str
    phase: str
    similarity_score: float
    tags: List[str]
    created_at: str


class KMNode(BaseModel):
    node_id: str
    question_id: str
    answer_id: str
    phase: str
    run_id: str
    question: str
    answer: str
    evidence_ids: List[str]
    tags: List[str]


class CoverageMetrics(BaseModel):
    phase: str
    run_id: str
    total_questions: int
    answered_questions: int
    coverage_ratio: float
    acceptance_rate: float
    high_priority_open: int


class ConflictDetectionRequest(BaseModel):
    new_answer: Dict[str, Any]
    phase: Optional[str] = None


class ConflictResult(BaseModel):
    has_conflicts: bool
    conflicts: List[Dict[str, Any]]
    consistency_score: float


# =============================================================================
# Lifecycle
# =============================================================================

@app.on_event("startup")
async def startup():
    """Initialize database connection pool"""
    global db_pool

    database_url = os.getenv("KM_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/knowledge_map")

    try:
        db_pool = await asyncpg.create_pool(
            database_url,
            min_size=2,
            max_size=10,
            command_timeout=30
        )
        print("[KM Service] Connected to Knowledge Map database")
    except Exception as e:
        print(f"[KM Service] Failed to connect to database: {e}")
        # Service can start without DB for development
        db_pool = None


@app.on_event("shutdown")
async def shutdown():
    """Close database connection pool"""
    if db_pool:
        await db_pool.close()
        print("[KM Service] Database connection closed")


# =============================================================================
# Endpoints
# =============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "knowledge-map",
        "version": "1.0.0",
        "db_connected": db_pool is not None
    }


@app.post("/api/v1/search", response_model=List[SearchResult])
async def search_knowledge_map(request: SearchRequest):
    """
    Semantic search over Knowledge Map using vector similarity.

    TODO: Implement actual vector search with pgvector or dedicated vector DB.
    Current implementation uses simple text search.
    """
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            # TODO: Replace with vector similarity search
            # For now, use simple text search with pg_trgm
            query = """
                SELECT
                    n.node_id,
                    n.question,
                    n.answer,
                    n.phase,
                    n.tags,
                    n.created_at,
                    -- Mock similarity score (replace with vector cosine similarity)
                    CASE
                        WHEN n.question ILIKE '%' || $1 || '%' THEN 0.9
                        WHEN n.answer ILIKE '%' || $1 || '%' THEN 0.8
                        ELSE 0.7
                    END as similarity_score
                FROM km_nodes n
                WHERE (n.question ILIKE '%' || $1 || '%' OR n.answer ILIKE '%' || $1 || '%')
                    AND ($2::text IS NULL OR n.phase = $2)
                ORDER BY similarity_score DESC
                LIMIT $3
            """

            rows = await conn.fetch(query, request.query, request.phase, request.limit)

            results = [
                SearchResult(
                    node_id=row['node_id'],
                    question=row['question'],
                    answer=row['answer'],
                    phase=row['phase'],
                    similarity_score=row['similarity_score'],
                    tags=row['tags'] or [],
                    created_at=row['created_at'].isoformat()
                )
                for row in rows
            ]

            return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@app.get("/api/v1/coverage/{phase}/{run_id}", response_model=CoverageMetrics)
async def get_coverage_metrics(phase: str, run_id: str):
    """
    Get Knowledge Map coverage metrics for a phase.
    """
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            # Query from km_coverage view
            query = """
                SELECT
                    phase,
                    run_id,
                    total_questions,
                    answered_questions,
                    coverage_ratio,
                    acceptance_rate
                FROM km_coverage
                WHERE phase = $1 AND run_id = $2
            """

            row = await conn.fetchrow(query, phase.upper(), run_id)

            if not row:
                # Return empty metrics if no data
                return CoverageMetrics(
                    phase=phase,
                    run_id=run_id,
                    total_questions=0,
                    answered_questions=0,
                    coverage_ratio=0.0,
                    acceptance_rate=0.0,
                    high_priority_open=0
                )

            # Count high-priority open questions
            high_priority_query = """
                SELECT COUNT(*)
                FROM questions
                WHERE phase = $1 AND run_id = $2 AND status = 'open' AND priority >= 0.8
            """
            high_priority_count = await conn.fetchval(high_priority_query, phase.upper(), run_id)

            return CoverageMetrics(
                phase=row['phase'],
                run_id=row['run_id'],
                total_questions=row['total_questions'],
                answered_questions=row['answered_questions'],
                coverage_ratio=float(row['coverage_ratio']),
                acceptance_rate=float(row['acceptance_rate']),
                high_priority_open=high_priority_count or 0
            )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get coverage: {str(e)}")


@app.post("/api/v1/conflicts/detect", response_model=ConflictResult)
async def detect_conflicts(request: ConflictDetectionRequest):
    """
    Detect conflicts between new answer and existing Knowledge Map.

    TODO: Integrate with guard.contradictionScan tool for sophisticated detection.
    Current implementation is a placeholder.
    """
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            # Get existing KM nodes
            query = """
                SELECT node_id, question, answer, phase, tags
                FROM km_nodes
                WHERE ($1::text IS NULL OR phase = $1)
                LIMIT 100
            """

            rows = await conn.fetch(query, request.phase)

            # TODO: Call guard.contradictionScan tool here
            # For now, return mock result
            conflicts = []

            # Simple heuristic: check for similar questions with different answers
            new_question = request.new_answer.get('question', '')
            new_answer_text = request.new_answer.get('answer', '')

            for row in rows:
                # Simple keyword overlap check
                if any(word in row['question'].lower() for word in new_question.lower().split() if len(word) > 4):
                    # Check if answers differ significantly
                    if row['answer'] != new_answer_text:
                        conflicts.append({
                            "conflict_with": row['node_id'],
                            "conflict_type": "potential",
                            "description": f"Similar question with different answer detected",
                            "severity": "medium"
                        })

            consistency_score = 1.0 if len(conflicts) == 0 else max(0.5, 1.0 - (len(conflicts) * 0.1))

            return ConflictResult(
                has_conflicts=len(conflicts) > 0,
                conflicts=conflicts,
                consistency_score=consistency_score
            )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conflict detection failed: {str(e)}")


@app.get("/api/v1/suggest/{phase}/{run_id}")
async def suggest_questions(phase: str, run_id: str, limit: int = 5):
    """
    Suggest questions based on Knowledge Map gaps.

    Identifies priority themes with low coverage and suggests relevant questions.
    """
    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        async with db_pool.acquire() as conn:
            # Find themes with low coverage
            query = """
                SELECT DISTINCT unnest(tags) as tag, COUNT(*) as count
                FROM km_nodes
                WHERE phase = $1 AND run_id = $2
                GROUP BY tag
                ORDER BY count ASC
                LIMIT $3
            """

            rows = await conn.fetch(query, phase.upper(), run_id, limit)

            suggestions = [
                {
                    "suggested_theme": row['tag'],
                    "current_coverage": row['count'],
                    "suggested_question": f"What are the requirements for {row['tag']}?",
                    "priority": 0.8
                }
                for row in rows
            ]

            return {"suggestions": suggestions}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Question suggestion failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
