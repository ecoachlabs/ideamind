"""
IdeaMine Tools SDK - Python Tool Client
Client for agents to discover and invoke tools
"""

import hashlib
import json
import time
from typing import List, Optional
from uuid import uuid4

import httpx
import structlog

from .types import (
    ExecutionRequest,
    ExecutionResult,
    ExecutionStatus,
    ToolSearchRequest,
    ToolSearchResult,
    ToolWithVersion,
    ExecutionError as ExecutionErrorType,
    NotFoundError,
    AccessDeniedError,
    TimeoutError,
    ExecutionError,
)
from .logger import create_logger
from .telemetry import TelemetryManager
from .validator import SchemaValidator


class ToolClient:
    """Client for discovering and invoking tools"""

    def __init__(
        self,
        registry_url: str,
        runner_url: str,
        api_key: Optional[str] = None,
        timeout: int = 30,
        retry_attempts: int = 3,
        logger: Optional[structlog.BoundLogger] = None,
        telemetry_enabled: bool = False,
        telemetry_service_name: str = "tool-client",
        telemetry_endpoint: Optional[str] = None,
    ):
        self.registry_url = registry_url.rstrip("/")
        self.runner_url = runner_url.rstrip("/")
        self.timeout = timeout
        self.retry_attempts = retry_attempts
        self.logger = logger or create_logger("tool-client")
        self.validator = SchemaValidator(self.logger)

        # Setup HTTP clients
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        self.registry_client = httpx.Client(
            base_url=self.registry_url,
            timeout=timeout,
            headers=headers,
        )

        self.runner_client = httpx.Client(
            base_url=self.runner_url,
            timeout=120,  # Longer timeout for execution
            headers=headers,
        )

        # Initialize telemetry
        self.telemetry = TelemetryManager(
            enabled=telemetry_enabled,
            service_name=telemetry_service_name,
            endpoint=telemetry_endpoint,
            logger=self.logger,
        )

        self.logger.info(
            "ToolClient initialized",
            registry_url=registry_url,
            runner_url=runner_url,
            telemetry=telemetry_enabled,
        )

    def search(self, request: ToolSearchRequest) -> List[ToolSearchResult]:
        """
        Search for tools by query and capabilities

        Args:
            request: Search request with filters

        Returns:
            List of matching tools

        Raises:
            ExecutionError: If search fails
        """
        span = self.telemetry.start_execution_span(
            "tool.search", "1.0.0", "client", {"query": request.query}
        )

        try:
            self.logger.info("Searching for tools", **request.dict(exclude_none=True))

            params = {
                "limit": request.limit,
                "offset": request.offset,
            }
            if request.query:
                params["q"] = request.query
            if request.capabilities:
                params["capabilities"] = ",".join(request.capabilities)
            if request.tags:
                params["tags"] = ",".join(request.tags)
            if request.runtime:
                params["runtime"] = request.runtime.value

            response = self.registry_client.get("/tools/search", params=params)
            response.raise_for_status()

            data = response.json()
            results = [ToolSearchResult(**r) for r in data.get("results", [])]

            self.logger.info(
                "Tools search completed",
                count=len(results),
                query=request.query,
            )

            self.telemetry.end_span(span, {"result_count": len(results)})
            return results

        except httpx.HTTPError as e:
            self.logger.error("Tool search failed", error=str(e))
            self.telemetry.end_span_with_error(span, e)
            raise self._handle_error(e)

    def get(self, name: str, version: Optional[str] = None) -> ToolWithVersion:
        """
        Get tool by name and version

        Args:
            name: Tool name
            version: Tool version (or 'latest')

        Returns:
            Tool with version information

        Raises:
            NotFoundError: If tool not found
            ExecutionError: If request fails
        """
        version_str = version or "latest"
        span = self.telemetry.start_execution_span(
            "tool.get", version_str, "client", {"tool_name": name}
        )

        try:
            self.logger.info("Getting tool", name=name, version=version_str)

            endpoint = f"/tools/{name}@{version_str}"
            response = self.registry_client.get(endpoint)
            response.raise_for_status()

            data = response.json()
            tool = ToolWithVersion(**data)

            self.logger.info(
                "Tool retrieved",
                name=tool.name,
                version=tool.version_info.version,
            )

            self.telemetry.end_span(
                span,
                {"tool_id": tool.id, "version": tool.version_info.version}
            )

            return tool

        except httpx.HTTPError as e:
            self.logger.error("Failed to get tool", error=str(e), name=name, version=version_str)
            self.telemetry.end_span_with_error(span, e)
            raise self._handle_error(e)

    def run(self, request: ExecutionRequest) -> ExecutionResult:
        """
        Execute a tool with input

        Args:
            request: Execution request

        Returns:
            Execution result with output or error

        Raises:
            ValidationError: If input/output validation fails
            TimeoutError: If execution times out
            ExecutionError: If execution fails
        """
        execution_id = str(uuid4())
        start_time = time.time()

        span = self.telemetry.start_execution_span(
            request.toolId,
            request.version,
            request.runId,
            {
                "execution_id": execution_id,
                "agent_id": request.agentId,
                "phase": request.phase,
                "trace_id": request.context.trace_id if request.context else None,
            }
        )

        try:
            self.logger.info(
                "Executing tool",
                execution_id=execution_id,
                tool_id=request.toolId,
                version=request.version,
                run_id=request.runId,
                agent_id=request.agentId,
                phase=request.phase,
            )

            # Get tool metadata for validation
            tool = self.get(request.toolId, request.version)

            # Validate input
            self.telemetry.add_event(span, "validation.input.start")
            validation_span = self.telemetry.start_validation_span("input", request.toolId)

            try:
                self.validator.validate_input(
                    request.input,
                    tool.version_info.input_schema,
                    request.toolId
                )
                self.telemetry.end_span(validation_span)
            except Exception as e:
                self.telemetry.end_span_with_error(validation_span, e)
                raise

            self.telemetry.add_event(span, "validation.input.complete")

            # Compute input hash for idempotence
            input_hash = self._compute_input_hash(tool.version_info.id, request.input)

            # Execute via runner
            self.telemetry.add_event(span, "execution.start")

            timeout = (
                request.budget.ms / 1000 if request.budget and request.budget.ms
                else tool.version_info.timeout_ms / 1000
            )

            payload = {
                "execution_id": execution_id,
                "tool_id": tool.id,
                "tool_version_id": tool.version_info.id,
                "tool_name": request.toolId,
                "tool_version": request.version,
                "input": request.input,
                "input_hash": input_hash,
                "run_id": request.runId,
                "agent_id": request.agentId,
                "phase": request.phase,
                "budget": request.budget.dict() if request.budget else None,
                "context": request.context.dict() if request.context else None,
            }

            response = self.runner_client.post(
                "/execute",
                json=payload,
                timeout=timeout,
            )
            response.raise_for_status()

            result = ExecutionResult(**response.json())

            # Validate output if succeeded
            if result.ok and result.output is not None:
                self.telemetry.add_event(span, "validation.output.start")
                output_validation_span = self.telemetry.start_validation_span(
                    "output", request.toolId
                )

                try:
                    self.validator.validate_output(
                        result.output,
                        tool.version_info.output_schema,
                        request.toolId
                    )
                    self.telemetry.end_span(output_validation_span)
                except Exception as e:
                    self.telemetry.end_span_with_error(output_validation_span, e)
                    raise

                self.telemetry.add_event(span, "validation.output.complete")

            duration = int((time.time() - start_time) * 1000)

            self.logger.info(
                "Tool execution completed",
                execution_id=execution_id,
                tool_id=request.toolId,
                status=result.status.value,
                duration=duration,
                cached=result.cached,
            )

            self.telemetry.end_span(
                span,
                {
                    "execution_id": execution_id,
                    "status": result.status.value,
                    "duration_ms": duration,
                    "cached": result.cached,
                }
            )

            return result

        except httpx.TimeoutException as e:
            duration = int((time.time() - start_time) * 1000)
            self.logger.error(
                "Tool execution timeout",
                execution_id=execution_id,
                tool_id=request.toolId,
                duration=duration,
            )
            self.telemetry.end_span_with_error(span, e)

            raise TimeoutError(
                "Tool execution timeout",
                details={
                    "execution_id": execution_id,
                    "tool_id": request.toolId,
                    "timeout": timeout,
                }
            )

        except Exception as e:
            duration = int((time.time() - start_time) * 1000)
            self.logger.error(
                "Tool execution failed",
                execution_id=execution_id,
                tool_id=request.toolId,
                error=str(e),
                duration=duration,
            )
            self.telemetry.end_span_with_error(span, e)
            raise self._handle_error(e)

    def run_with_retry(
        self,
        request: ExecutionRequest,
        max_retries: Optional[int] = None
    ) -> ExecutionResult:
        """
        Execute tool with automatic retries

        Args:
            request: Execution request
            max_retries: Maximum retry attempts (defaults to client setting)

        Returns:
            Execution result

        Raises:
            ExecutionError: If all retries fail
        """
        retries = max_retries if max_retries is not None else self.retry_attempts
        last_error: Optional[Exception] = None

        for attempt in range(retries + 1):
            try:
                if attempt > 0:
                    backoff = min(1.0 * (2 ** (attempt - 1)), 30.0)
                    self.logger.info(
                        "Retrying tool execution",
                        attempt=attempt,
                        max_retries=retries,
                        backoff_sec=backoff,
                        tool_id=request.toolId,
                    )
                    time.sleep(backoff)

                return self.run(request)

            except (NotFoundError, AccessDeniedError):
                # Don't retry these errors
                raise
            except Exception as e:
                last_error = e
                if attempt == retries:
                    self.logger.error(
                        "Tool execution failed after retries",
                        tool_id=request.toolId,
                        attempts=retries + 1,
                        error=str(e),
                    )

        raise last_error or ExecutionError("Tool execution failed after retries")

    def check_access(
        self,
        tool_id: str,
        agent_id: str,
        phase: Optional[str] = None
    ) -> bool:
        """
        Check if agent has access to tool

        Args:
            tool_id: Tool ID
            agent_id: Agent ID
            phase: Optional phase

        Returns:
            True if access is granted
        """
        try:
            response = self.registry_client.post(
                "/tools/check-access",
                json={
                    "tool_id": tool_id,
                    "agent_id": agent_id,
                    "phase": phase,
                }
            )
            response.raise_for_status()
            return response.json().get("has_access", False)
        except Exception as e:
            self.logger.error(
                "Failed to check tool access",
                error=str(e),
                tool_id=tool_id,
                agent_id=agent_id,
            )
            return False

    def _compute_input_hash(self, version_id: str, input_data: any) -> str:
        """Compute hash for idempotence"""
        payload = json.dumps({
            "version_id": version_id,
            "input": input_data,
        }, sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()

    def _handle_error(self, error: Exception) -> Exception:
        """Handle and normalize errors"""
        if isinstance(error, httpx.HTTPStatusError):
            status = error.response.status_code
            try:
                message = error.response.json().get("message", str(error))
            except:
                message = str(error)

            if status == 404:
                return NotFoundError(message)
            elif status == 403:
                return AccessDeniedError(message)
            elif status == 408:
                return TimeoutError(message)
            else:
                return ExecutionError(message, details={"status": status})
        elif isinstance(error, httpx.TimeoutException):
            return TimeoutError(str(error))

        return error

    def shutdown(self) -> None:
        """Shutdown client gracefully"""
        self.registry_client.close()
        self.runner_client.close()
        self.telemetry.shutdown()
        self.logger.info("ToolClient shutdown complete")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()
