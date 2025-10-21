"""
Tool Gateway - Main Application
API Gateway routing requests to Registry and Runner services
"""

import structlog
import httpx
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any
from pydantic import BaseModel

from .config import settings

# Initialize logger
logger = structlog.get_logger()

# HTTP clients for upstream services
registry_client: Optional[httpx.AsyncClient] = None
runner_client: Optional[httpx.AsyncClient] = None


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
    budget: Optional[Dict[str, int]] = None


# ============================================================================
# LIFECYCLE
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global registry_client, runner_client

    logger.info("Starting Tool Gateway", environment=settings.environment)

    # Initialize HTTP clients
    registry_client = httpx.AsyncClient(
        base_url=settings.registry_url,
        timeout=settings.default_timeout_seconds,
    )

    runner_client = httpx.AsyncClient(
        base_url=settings.runner_url,
        timeout=settings.execution_timeout_seconds,
    )

    logger.info(
        "HTTP clients initialized",
        registry_url=settings.registry_url,
        runner_url=settings.runner_url,
    )

    yield

    # Cleanup
    await registry_client.aclose()
    await runner_client.aclose()
    logger.info("Tool Gateway shutdown complete")


# ============================================================================
# APPLICATION
# ============================================================================

app = FastAPI(
    title="IdeaMine Tool Gateway",
    description="API Gateway for Tool Registry and Runner services",
    version="1.0.0",
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=f"{settings.api_prefix}/redoc",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "gateway",
        "upstreams": {
            "registry": settings.registry_url,
            "runner": settings.runner_url,
        }
    }


# ============================================================================
# TOOL DISCOVERY (PROXY TO REGISTRY)
# ============================================================================

@app.get(f"{settings.api_prefix}/tools/search")
async def search_tools(
    q: Optional[str] = Query(None),
    capabilities: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),
    runtime: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    limit: int = Query(20),
    offset: int = Query(0),
):
    """
    Search for tools (proxied to Registry)
    """
    try:
        params = {
            "q": q,
            "capabilities": capabilities,
            "tags": tags,
            "runtime": runtime,
            "owner": owner,
            "limit": limit,
            "offset": offset,
        }
        params = {k: v for k, v in params.items() if v is not None}

        response = await registry_client.get("/api/v1/tools/search", params=params)
        response.raise_for_status()

        return response.json()

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.error("Search tools failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{settings.api_prefix}/tools/{{name}}/versions/{{version}}")
async def get_tool(name: str, version: str):
    """
    Get tool by name and version (proxied to Registry)
    """
    try:
        response = await registry_client.get(f"/api/v1/tools/{name}@{version}")
        response.raise_for_status()

        return response.json()

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.error("Get tool failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{settings.api_prefix}/capabilities")
async def list_capabilities():
    """
    List all capabilities (proxied to Registry)
    """
    try:
        response = await registry_client.get("/api/v1/capabilities")
        response.raise_for_status()

        return response.json()

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.error("List capabilities failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ACCESS CONTROL (PROXY TO REGISTRY)
# ============================================================================

@app.get(f"{settings.api_prefix}/access/check")
async def check_access(
    tool_id: str = Query(...),
    agent_id: Optional[str] = Query(None),
    phase: Optional[str] = Query(None),
):
    """
    Check tool access (proxied to Registry)
    """
    try:
        params = {"tool_id": tool_id}
        if agent_id:
            params["agent_id"] = agent_id
        if phase:
            params["phase"] = phase

        response = await registry_client.post("/api/v1/tools/check-access", params=params)
        response.raise_for_status()

        return response.json()

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.error("Check access failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# TOOL EXECUTION (PROXY TO RUNNER)
# ============================================================================

@app.post(f"{settings.api_prefix}/executions")
async def execute_tool(request: ExecutionRequest):
    """
    Execute a tool (proxied to Runner)
    """
    try:
        logger.info(
            "Proxying execution request",
            tool_id=request.tool_id,
            version=request.version,
            run_id=request.run_id,
        )

        # Forward to Runner
        response = await runner_client.post(
            "/api/v1/executions",
            json=request.dict(),
            timeout=settings.execution_timeout_seconds,
        )
        response.raise_for_status()

        return response.json()

    except httpx.HTTPStatusError as e:
        logger.error(
            "Execution failed",
            tool_id=request.tool_id,
            status_code=e.response.status_code,
            error=str(e),
        )
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except httpx.TimeoutException as e:
        logger.error("Execution timeout", tool_id=request.tool_id)
        raise HTTPException(status_code=504, detail="Execution timeout")
    except Exception as e:
        logger.error("Execution failed", tool_id=request.tool_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{settings.api_prefix}/executions/{{execution_id}}")
async def get_execution(execution_id: str):
    """
    Get execution status (proxied to Runner)
    """
    try:
        response = await runner_client.get(f"/api/v1/executions/{execution_id}")
        response.raise_for_status()

        return response.json()

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.error("Get execution failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get(f"{settings.api_prefix}/executions/{{execution_id}}/logs")
async def get_execution_logs(
    execution_id: str,
    offset: int = Query(0),
    limit: int = Query(100),
):
    """
    Get execution logs
    TODO: Implement log streaming from Runner
    """
    # For now, return empty logs
    # In production, this would stream logs from the Runner/database
    return {"logs": [], "offset": offset, "has_more": False}


# ============================================================================
# TOOL PUBLISHING (PROXY TO REGISTRY)
# ============================================================================

@app.post(f"{settings.api_prefix}/tools/publish")
async def publish_tool(request: Request):
    """
    Publish a tool (proxied to Registry)
    """
    try:
        body = await request.json()

        response = await registry_client.post("/api/v1/tools/publish", json=body)
        response.raise_for_status()

        return response.json()

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.error("Publish tool failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post(f"{settings.api_prefix}/tools/deprecate")
async def deprecate_tool(request: Request):
    """
    Deprecate a tool (proxied to Registry)
    """
    try:
        body = await request.json()

        response = await registry_client.post("/api/v1/tools/deprecate", json=body)
        response.raise_for_status()

        return response.json()

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.error("Deprecate tool failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


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
    return JSONResponse(
        status_code=500,
        content={"message": "Internal server error", "detail": str(exc)},
    )


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
