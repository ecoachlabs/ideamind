"""
Tool Registry (Armory) - Main Application
FastAPI service for tool discovery and registry
"""

import structlog
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List, Optional
from contextlib import asynccontextmanager

from .config import settings
from .database import init_db, close_db, get_db
from .models import (
    ToolSearchRequest,
    ToolSearchResponse,
    PublishRequest,
    PublishResponse,
    DeprecateRequest,
    ToolWithVersionResponse,
)
from .service import ToolRegistryService

# Initialize logger
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting Tool Registry (Armory)", environment=settings.environment)

    # Initialize database
    await init_db()

    yield

    # Cleanup
    await close_db()
    logger.info("Tool Registry (Armory) shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="IdeaMine Tool Registry (Armory)",
    description="Tool discovery and registry service",
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


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "armory"}


# Search tools
@app.get(f"{settings.api_prefix}/tools/search", response_model=ToolSearchResponse)
async def search_tools(
    q: Optional[str] = Query(None, description="Search query"),
    capabilities: Optional[str] = Query(None, description="Comma-separated capabilities"),
    tags: Optional[str] = Query(None, description="Comma-separated tags"),
    runtime: Optional[str] = Query(None, description="Runtime filter (docker, wasm)"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    service: ToolRegistryService = Depends(get_db),
):
    """
    Search for tools by query, capabilities, tags, and runtime
    """
    try:
        request = ToolSearchRequest(
            query=q,
            capabilities=capabilities.split(",") if capabilities else None,
            tags=tags.split(",") if tags else None,
            runtime=runtime,
            limit=limit,
            offset=offset,
        )

        results = await service.search_tools(request)

        return ToolSearchResponse(
            results=results,
            total=len(results),
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        logger.error("Tool search failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# Get tool by name and version
@app.get(
    f"{settings.api_prefix}/tools/{{name}}@{{version}}",
    response_model=ToolWithVersionResponse
)
async def get_tool(
    name: str,
    version: str,
    service: ToolRegistryService = Depends(get_db),
):
    """
    Get tool by name and version (use 'latest' for latest published version)
    """
    try:
        tool = await service.get_tool(name, version)
        if not tool:
            raise HTTPException(
                status_code=404,
                detail=f"Tool not found: {name}@{version}"
            )
        return tool
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get tool", error=str(e), name=name, version=version)
        raise HTTPException(status_code=500, detail=str(e))


# Publish tool
@app.post(f"{settings.api_prefix}/tools/publish", response_model=PublishResponse)
async def publish_tool(
    request: PublishRequest,
    service: ToolRegistryService = Depends(get_db),
):
    """
    Publish a new tool or tool version
    """
    try:
        result = await service.publish_tool(request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to publish tool", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# Deprecate tool
@app.post(f"{settings.api_prefix}/tools/deprecate")
async def deprecate_tool(
    request: DeprecateRequest,
    service: ToolRegistryService = Depends(get_db),
):
    """
    Deprecate a tool or specific version
    """
    try:
        await service.deprecate_tool(request)
        return {"message": "Tool deprecated successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to deprecate tool", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# Check access
@app.post(f"{settings.api_prefix}/tools/check-access")
async def check_access(
    tool_id: str,
    agent_id: Optional[str] = None,
    phase: Optional[str] = None,
    role: Optional[str] = None,
    service: ToolRegistryService = Depends(get_db),
):
    """
    Check if agent/phase/role has access to tool
    """
    try:
        has_access = await service.check_access(tool_id, agent_id, phase, role)
        return {"has_access": has_access}
    except Exception as e:
        logger.error("Failed to check access", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# List capabilities
@app.get(f"{settings.api_prefix}/capabilities")
async def list_capabilities(
    service: ToolRegistryService = Depends(get_db),
):
    """
    List all available capabilities
    """
    try:
        capabilities = await service.list_capabilities()
        return {"capabilities": capabilities}
    except Exception as e:
        logger.error("Failed to list capabilities", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# Error handler
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
