"""
IdeaMine Tools SDK - Python ToolClient
Client for agents to discover and execute tools via Tool Gateway
"""

import httpx
import hashlib
import json
import structlog
from typing import Optional, List
from datetime import datetime

from .types import (
    ToolClientConfig,
    ToolExecutionRequest,
    ToolExecutionResponse,
    ToolSearchQuery,
    ToolSearchResult,
    ToolVersionInfo,
    ToolLog,
    ToolLogCallback,
    AccessCheckResponse,
    ToolExecutionMetrics,
    ToolExecutionError,
    ToolArtifact,
)


class ToolClient:
    """Client for discovering and executing tools"""

    def __init__(self, config: ToolClientConfig):
        self.config = config
        self.logger = config.logger or structlog.get_logger()

        # Initialize HTTP client for gateway
        self.gateway_client = httpx.AsyncClient(
            base_url=config.gateway_url,
            timeout=config.default_timeout_ms / 1000.0,
            headers={
                "Content-Type": "application/json",
                **({"X-API-Key": config.api_key} if config.api_key else {}),
                **({"Authorization": f"Bearer {config.auth_token}"} if config.auth_token else {}),
            },
        )

        # Initialize HTTP client for registry (optional)
        self.registry_client = None
        if config.registry_url:
            self.registry_client = httpx.AsyncClient(
                base_url=config.registry_url,
                timeout=30.0,
                headers={
                    "Content-Type": "application/json",
                    **({"X-API-Key": config.api_key} if config.api_key else {}),
                    **({"Authorization": f"Bearer {config.auth_token}"} if config.auth_token else {}),
                },
            )

        self.logger.info("ToolClient initialized", gateway_url=config.gateway_url)

    async def close(self):
        """Close HTTP clients"""
        await self.gateway_client.aclose()
        if self.registry_client:
            await self.registry_client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    # ========================================================================
    # DISCOVERY
    # ========================================================================

    async def search(self, query: ToolSearchQuery) -> List[ToolSearchResult]:
        """Search for tools by capabilities, tags, or text query"""
        self.logger.debug("Searching tools", query=query.q)

        client = self.registry_client or self.gateway_client

        params = {
            "q": query.q,
            "capabilities": ",".join(query.capabilities) if query.capabilities else None,
            "tags": ",".join(query.tags) if query.tags else None,
            "runtime": query.runtime.value if query.runtime else None,
            "owner": query.owner,
            "limit": query.limit,
            "offset": query.offset,
        }
        # Remove None values
        params = {k: v for k, v in params.items() if v is not None}

        response = await client.get("/api/v1/tools/search", params=params)
        response.raise_for_status()

        data = response.json()
        results = []
        for item in data.get("results", []):
            results.append(ToolSearchResult(**item))

        self.logger.info("Tool search completed", result_count=len(results))
        return results

    async def get(self, tool_id: str, version: str) -> ToolVersionInfo:
        """Get specific tool version details"""
        self.logger.debug("Getting tool", tool_id=tool_id, version=version)

        client = self.registry_client or self.gateway_client

        response = await client.get(f"/api/v1/tools/{tool_id}@{version}")
        response.raise_for_status()

        data = response.json()
        return ToolVersionInfo(**data)

    async def get_latest(self, tool_id: str) -> ToolVersionInfo:
        """Get latest published version of a tool"""
        return await self.get(tool_id, "latest")

    async def check_access(
        self,
        tool_id: str,
        agent_id: Optional[str] = None,
        phase: Optional[str] = None,
    ) -> AccessCheckResponse:
        """Check if agent/phase has access to a tool"""
        self.logger.debug("Checking access", tool_id=tool_id, agent_id=agent_id, phase=phase)

        params = {
            "tool_id": tool_id,
            "agent_id": agent_id,
            "phase": phase,
        }
        params = {k: v for k, v in params.items() if v is not None}

        response = await self.gateway_client.get("/api/v1/access/check", params=params)
        response.raise_for_status()

        data = response.json()
        return AccessCheckResponse(**data)

    # ========================================================================
    # EXECUTION
    # ========================================================================

    async def execute(self, request: ToolExecutionRequest) -> ToolExecutionResponse:
        """Execute a tool"""
        start_time = datetime.now()

        self.logger.info(
            "Executing tool",
            tool_id=request.toolId,
            version=request.version,
            run_id=request.runId,
        )

        try:
            # Check access if agent/phase provided
            if request.agentId or request.phase:
                access = await self.check_access(request.toolId, request.agentId, request.phase)
                if not access.allowed:
                    raise ToolAccessDeniedError(request.toolId, access.reason)

            # Prepare execution payload
            payload = {
                "tool_id": request.toolId,
                "version": request.version,
                "input": request.input,
                "run_id": request.runId,
                "budget": request.budget,
                "agent_id": request.agentId,
                "phase": request.phase,
                "trace_id": request.traceId,
                "span_id": request.spanId,
                "skip_cache": request.skipCache,
            }
            # Remove None values
            payload = {k: v for k, v in payload.items() if v is not None}

            # Execute tool via gateway
            timeout_ms = (
                request.budget.get("ms", self.config.default_timeout_ms)
                if request.budget
                else self.config.default_timeout_ms
            )

            response = await self.gateway_client.post(
                "/api/v1/executions",
                json=payload,
                timeout=timeout_ms / 1000.0,
            )
            response.raise_for_status()

            data = response.json()
            duration = (datetime.now() - start_time).total_seconds() * 1000

            # Parse response
            execution_response = ToolExecutionResponse(
                ok=data.get("ok", True),
                executionId=data.get("executionId", ""),
                output=data.get("output"),
                artifacts=[ToolArtifact(**a) for a in data.get("artifacts", [])],
                metrics=ToolExecutionMetrics(**data.get("metrics", {})),
                error=ToolExecutionError(**data["error"]) if data.get("error") else None,
                cached=data.get("cached", False),
            )

            if execution_response.cached:
                self.logger.info("Tool execution returned from cache", execution_id=execution_response.executionId)

            self.logger.info(
                "Tool execution completed",
                execution_id=execution_response.executionId,
                ok=execution_response.ok,
                duration_ms=duration,
            )

            return execution_response

        except httpx.HTTPStatusError as e:
            duration = (datetime.now() - start_time).total_seconds() * 1000

            self.logger.error(
                "Tool execution failed",
                tool_id=request.toolId,
                error=str(e),
                status_code=e.response.status_code,
            )

            # Return error response
            return ToolExecutionResponse(
                ok=False,
                executionId="",
                metrics=ToolExecutionMetrics(
                    duration_ms=int(duration),
                    retry_count=0,
                    started_at=start_time.isoformat(),
                    completed_at=datetime.now().isoformat(),
                ),
                error=ToolExecutionError(
                    type="runtime",
                    message=str(e),
                    retryable=e.response.status_code >= 500,
                ),
            )

        except Exception as e:
            duration = (datetime.now() - start_time).total_seconds() * 1000

            self.logger.error("Tool execution failed", tool_id=request.toolId, error=str(e))

            return ToolExecutionResponse(
                ok=False,
                executionId="",
                metrics=ToolExecutionMetrics(
                    duration_ms=int(duration),
                    retry_count=0,
                    started_at=start_time.isoformat(),
                    completed_at=datetime.now().isoformat(),
                ),
                error=ToolExecutionError(
                    type="unknown",
                    message=str(e),
                    retryable=False,
                ),
            )

    async def execute_with_logs(
        self, request: ToolExecutionRequest, on_log: ToolLogCallback
    ) -> ToolExecutionResponse:
        """Execute tool with streaming logs"""
        # Start execution
        response = await self.execute(request)

        # Note: In production, implement WebSocket or SSE streaming
        # This is a simplified version

        return response

    async def get_execution(self, execution_id: str) -> ToolExecutionResponse:
        """Get execution result by ID"""
        self.logger.debug("Getting execution status", execution_id=execution_id)

        response = await self.gateway_client.get(f"/api/v1/executions/{execution_id}")
        response.raise_for_status()

        data = response.json()
        return ToolExecutionResponse(
            ok=data.get("ok", True),
            executionId=data.get("executionId", execution_id),
            output=data.get("output"),
            artifacts=[ToolArtifact(**a) for a in data.get("artifacts", [])],
            metrics=ToolExecutionMetrics(**data.get("metrics", {})),
            error=ToolExecutionError(**data["error"]) if data.get("error") else None,
            cached=data.get("cached", False),
        )

    # ========================================================================
    # UTILITY
    # ========================================================================

    def calculate_input_hash(self, tool_id: str, version: str, input_data: dict) -> str:
        """Calculate input hash for idempotence"""
        payload = json.dumps({"toolId": tool_id, "version": version, "input": input_data}, sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()


# ============================================================================
# EXCEPTIONS
# ============================================================================

class ToolExecutionError(Exception):
    """Tool execution error"""

    def __init__(self, message: str, type: str = "unknown", retryable: bool = False):
        super().__init__(message)
        self.type = type
        self.retryable = retryable


class ToolNotFoundError(Exception):
    """Tool not found error"""

    def __init__(self, tool_id: str, version: Optional[str] = None):
        message = f"Tool not found: {tool_id}" + (f"@{version}" if version else "")
        super().__init__(message)
        self.tool_id = tool_id
        self.version = version


class ToolAccessDeniedError(Exception):
    """Tool access denied error"""

    def __init__(self, tool_id: str, reason: Optional[str] = None):
        message = f"Access denied to tool: {tool_id}" + (f" - {reason}" if reason else "")
        super().__init__(message)
        self.tool_id = tool_id
        self.reason = reason
