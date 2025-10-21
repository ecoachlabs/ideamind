"""
Tool Runner (Engine) - Main Application
FastAPI service for executing tools in isolated sandboxes
"""

import structlog
import asyncpg
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any
from pydantic import BaseModel

from .config import settings
from .service import ToolRunnerService

# Initialize logger
logger = structlog.get_logger()

# Global connection pool
_pool: Optional[asyncpg.Pool] = None


# ============================================================================
# MODELS
# ============================================================================

class ExecutionRequest(BaseModel):
    """Tool execution request"""
    tool_id: str
    version: str
    input: Dict[str, Any]
    run_id: str
    execution_id: Optional[str] = None
    agent_id: Optional[str] = None
    phase: Optional[str] = None
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    skip_cache: bool = False
    budget: Optional[Dict[str, int]] = None  # {"ms": 60000}


class ExecutionResponse(BaseModel):
    """Tool execution response"""
    ok: bool
    executionId: str
    output: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None
    metrics: Dict[str, Any]
    artifacts: list = []
    cached: bool = False


# ============================================================================
# DATABASE
# ============================================================================

async def init_db():
    """Initialize database connection pool"""
    global _pool

    if _pool is not None:
        return

    logger.info("Initializing database connection pool")

    _pool = await asyncpg.create_pool(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
        min_size=settings.db_pool_min_size,
        max_size=settings.db_pool_max_size,
        command_timeout=settings.db_command_timeout,
    )

    logger.info("Database pool initialized")


async def close_db():
    """Close database connection pool"""
    global _pool

    if _pool is None:
        return

    logger.info("Closing database connection pool")
    await _pool.close()
    _pool = None


def get_pool() -> asyncpg.Pool:
    """Get database pool"""
    if _pool is None:
        raise RuntimeError("Database pool not initialized")
    return _pool


async def get_db():
    """FastAPI dependency for database connection"""
    pool = get_pool()
    async with pool.acquire() as conn:
        yield ToolRunnerService(conn)


# ============================================================================
# APP LIFECYCLE
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting Tool Runner (Engine)", environment=settings.environment)

    # Initialize database
    await init_db()

    yield

    # Cleanup
    await close_db()
    logger.info("Tool Runner (Engine) shutdown complete")


# ============================================================================
# APPLICATION
# ============================================================================

app = FastAPI(
    title="IdeaMine Tool Runner (Engine)",
    description="Tool execution service with Docker/WASM sandboxing",
    version="1.0.0",
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=f"{settings.api_prefix}/redoc",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure as needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# ROUTES
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "runner"}


@app.post(f"{settings.api_prefix}/executions", response_model=ExecutionResponse)
async def execute_tool(
    request: ExecutionRequest,
    service: ToolRunnerService = Depends(get_db),
):
    """
    Execute a tool in isolated sandbox

    This endpoint:
    1. Checks idempotence cache (unless skip_cache=true)
    2. Fetches tool manifest from Registry
    3. Provisions Docker/WASM sandbox
    4. Executes tool with resource limits and timeout
    5. Validates output against schema
    6. Stores results and updates cache
    7. Returns execution result with metrics
    """
    try:
        logger.info(
            "Received execution request",
            tool_id=request.tool_id,
            version=request.version,
            run_id=request.run_id,
        )

        result = await service.execute(
            tool_id=request.tool_id,
            version=request.version,
            input_data=request.input,
            run_id=request.run_id,
            execution_id=request.execution_id,
            agent_id=request.agent_id,
            phase=request.phase,
            trace_id=request.trace_id,
            span_id=request.span_id,
            skip_cache=request.skip_cache,
            budget_ms=request.budget.get("ms") if request.budget else None,
        )

        return ExecutionResponse(**result)

    except Exception as e:
        logger.error("Execution request failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{settings.api_prefix}/executions/{{execution_id}}", response_model=ExecutionResponse)
async def get_execution(
    execution_id: str,
    service: ToolRunnerService = Depends(get_db),
):
    """
    Get execution status and result by ID
    """
    try:
        # Fetch from database
        row = await service.db_conn.fetchrow(
            """
            SELECT
                id, status, output, error,
                duration_ms, cpu_usage_ms, memory_peak_bytes,
                created_at, completed_at
            FROM executions
            WHERE id = $1::uuid
            """,
            execution_id,
        )

        if not row:
            raise HTTPException(status_code=404, detail="Execution not found")

        return ExecutionResponse(
            ok=row["status"] == "succeeded",
            executionId=str(row["id"]),
            output=row["output"],
            error=row["error"],
            metrics={
                "duration_ms": row["duration_ms"] or 0,
                "cpu_ms": row["cpu_usage_ms"],
                "memory_peak_mb": row["memory_peak_bytes"] / (1024 * 1024) if row["memory_peak_bytes"] else None,
                "started_at": row["created_at"].isoformat() if row["created_at"] else None,
                "completed_at": row["completed_at"].isoformat() if row["completed_at"] else None,
            },
            cached=False,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get execution", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post(f"{settings.api_prefix}/executions/{{execution_id}}/cancel")
async def cancel_execution(execution_id: str):
    """
    Cancel a running execution
    """
    # TODO: Implement execution cancellation
    # This would require tracking running containers and killing them
    raise HTTPException(status_code=501, detail="Not implemented")


# ============================================================================
# ERROR HANDLER
# ============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(
        "Unhandled exception",
        error=str(exc),
        path=request.url.path,
    )
    return {
        "message": "Internal server error",
        "detail": str(exc),
    }


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
