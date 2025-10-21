"""
Tool Runner - Service Layer
Business logic for tool execution with idempotence, retry, and resource management
"""

import asyncpg
import httpx
import hashlib
import json
import structlog
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from uuid import uuid4

from .config import settings
from .executors.docker_executor import DockerExecutor

logger = structlog.get_logger()


class ToolRunnerService:
    """Service for executing tools with full lifecycle management"""

    def __init__(self, db_conn: asyncpg.Connection):
        self.db_conn = db_conn
        self.docker_executor = DockerExecutor() if settings.docker_enabled else None

        # HTTP client for Registry
        self.registry_client = httpx.AsyncClient(
            base_url=settings.registry_url,
            timeout=30.0,
        )

    async def execute(
        self,
        tool_id: str,
        version: str,
        input_data: Dict[str, Any],
        run_id: str,
        execution_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        phase: Optional[str] = None,
        trace_id: Optional[str] = None,
        span_id: Optional[str] = None,
        skip_cache: bool = False,
        budget_ms: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Execute a tool with full lifecycle:
        1. Check idempotence cache
        2. Get tool manifest from Registry
        3. Provision sandbox (Docker/WASM)
        4. Execute with timeout and resource limits
        5. Validate output
        6. Store results and artifacts
        7. Update cache

        Returns:
            Execution response with output, metrics, and artifacts
        """
        execution_id = execution_id or str(uuid4())
        start_time = datetime.now()

        logger.info(
            "Executing tool",
            execution_id=execution_id,
            tool_id=tool_id,
            version=version,
            run_id=run_id,
        )

        try:
            # 1. Check idempotence cache
            if not skip_cache and settings.cache_enabled:
                cached_result = await self._check_cache(tool_id, version, input_data)
                if cached_result:
                    logger.info("Returning cached result", execution_id=execution_id)
                    return {
                        **cached_result,
                        "cached": True,
                    }

            # 2. Get tool manifest from Registry
            tool_manifest = await self._get_tool_manifest(tool_id, version)

            # 3. Create execution record
            await self._create_execution_record(
                execution_id=execution_id,
                tool_id=tool_manifest["tool_id"],
                tool_name=tool_id,
                version=version,
                run_id=run_id,
                agent_id=agent_id,
                phase=phase,
                input_data=input_data,
                trace_id=trace_id,
                span_id=span_id,
            )

            # 4. Execute tool (with retry logic for infra errors)
            result = await self._execute_with_retry(
                execution_id=execution_id,
                tool_manifest=tool_manifest,
                input_data=input_data,
                run_id=run_id,
                agent_id=agent_id,
                phase=phase,
                budget_ms=budget_ms,
            )

            # 5. Update execution record
            await self._update_execution_record(
                execution_id=execution_id,
                status="succeeded" if result["ok"] else "failed",
                output=result.get("output"),
                error=result.get("error"),
                duration_ms=result["duration_ms"],
                cpu_ms=result.get("cpu_ms"),
                memory_peak_mb=result.get("memory_peak_mb"),
                exit_code=result.get("exit_code"),
            )

            # 6. Store in idempotence cache (if successful)
            if result["ok"] and settings.cache_enabled:
                await self._store_cache(tool_id, version, input_data, execution_id)

            logger.info(
                "Tool execution completed",
                execution_id=execution_id,
                ok=result["ok"],
                duration_ms=result["duration_ms"],
            )

            return {
                "ok": result["ok"],
                "executionId": execution_id,
                "output": result.get("output"),
                "error": result.get("error"),
                "metrics": {
                    "duration_ms": result["duration_ms"],
                    "cpu_ms": result.get("cpu_ms"),
                    "memory_peak_mb": result.get("memory_peak_mb"),
                    "retry_count": result.get("retry_count", 0),
                    "started_at": start_time.isoformat(),
                    "completed_at": datetime.now().isoformat(),
                },
                "artifacts": result.get("artifacts", []),
                "cached": False,
            }

        except Exception as e:
            logger.error("Tool execution failed", execution_id=execution_id, error=str(e))

            # Update execution record with error
            try:
                await self._update_execution_record(
                    execution_id=execution_id,
                    status="failed",
                    error={"type": "runtime", "message": str(e), "retryable": False},
                    duration_ms=int((datetime.now() - start_time).total_seconds() * 1000),
                )
            except:
                pass

            return {
                "ok": False,
                "executionId": execution_id,
                "error": {
                    "type": "runtime",
                    "message": str(e),
                    "retryable": False,
                },
                "metrics": {
                    "duration_ms": int((datetime.now() - start_time).total_seconds() * 1000),
                    "retry_count": 0,
                    "started_at": start_time.isoformat(),
                    "completed_at": datetime.now().isoformat(),
                },
            }

    async def _execute_with_retry(
        self,
        execution_id: str,
        tool_manifest: Dict[str, Any],
        input_data: Dict[str, Any],
        run_id: str,
        agent_id: Optional[str],
        phase: Optional[str],
        budget_ms: Optional[int],
    ) -> Dict[str, Any]:
        """Execute tool with retry logic for infrastructure errors"""
        max_attempts = settings.retry_max_attempts
        attempt = 0
        last_error = None

        manifest = tool_manifest["manifest"]
        timeout_ms = budget_ms or manifest.get("timeout_ms", settings.default_timeout_ms)

        while attempt < max_attempts:
            attempt += 1

            logger.info(
                "Executing tool attempt",
                execution_id=execution_id,
                attempt=attempt,
                max_attempts=max_attempts,
            )

            try:
                # Prepare context
                context = {
                    "runId": run_id,
                    "executionId": execution_id,
                    "agentId": agent_id,
                    "phase": phase,
                }

                # Get secrets from Vault (if enabled)
                secrets = {}
                if settings.vault_enabled and manifest.get("secrets"):
                    secrets = await self._get_secrets(manifest["secrets"])

                # Execute based on runtime
                runtime = manifest["runtime"]

                if runtime == "docker" and self.docker_executor:
                    result = await self.docker_executor.execute(
                        execution_id=execution_id,
                        image=manifest["image"],
                        entrypoint=manifest.get("entrypoint", []),
                        input_data=input_data,
                        context=context,
                        timeout_ms=timeout_ms,
                        cpu=manifest.get("cpu", settings.default_cpu),
                        memory=manifest.get("memory", settings.default_memory),
                        secrets=secrets,
                        egress_allow=manifest.get("egress", {}).get("allow", []),
                        filesystem_readonly=manifest.get("security", {}).get("filesystem") == "read_only",
                        network_restricted=manifest.get("security", {}).get("network") == "restricted",
                    )
                else:
                    raise ValueError(f"Unsupported runtime: {runtime}")

                # Check if error is retryable
                if not result["ok"] and result.get("error", {}).get("retryable") and attempt < max_attempts:
                    last_error = result["error"]
                    backoff_seconds = min(
                        settings.retry_backoff_base ** attempt,
                        settings.retry_backoff_max
                    )
                    logger.warn(
                        "Retryable error, backing off",
                        execution_id=execution_id,
                        attempt=attempt,
                        backoff_seconds=backoff_seconds,
                    )
                    await asyncio.sleep(backoff_seconds)
                    continue

                # Success or non-retryable error
                result["retry_count"] = attempt - 1
                return result

            except Exception as e:
                logger.error("Execution attempt failed", execution_id=execution_id, attempt=attempt, error=str(e))
                last_error = {"type": "runtime", "message": str(e), "retryable": True}

                if attempt < max_attempts:
                    backoff_seconds = min(
                        settings.retry_backoff_base ** attempt,
                        settings.retry_backoff_max
                    )
                    await asyncio.sleep(backoff_seconds)
                    continue

        # All retries exhausted
        return {
            "ok": False,
            "error": last_error or {"type": "runtime", "message": "All retry attempts failed", "retryable": False},
            "retry_count": max_attempts,
            "duration_ms": 0,
        }

    async def _get_tool_manifest(self, tool_id: str, version: str) -> Dict[str, Any]:
        """Get tool manifest from Registry"""
        logger.debug("Fetching tool manifest", tool_id=tool_id, version=version)

        response = await self.registry_client.get(f"/api/v1/tools/{tool_id}@{version}")
        response.raise_for_status()

        return response.json()

    async def _check_cache(self, tool_id: str, version: str, input_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Check idempotence cache"""
        input_hash = self._calculate_input_hash(tool_id, version, input_data)

        row = await self.db_conn.fetchrow(
            """
            SELECT e.id, e.output, e.duration_ms, e.cpu_usage_ms, e.memory_peak_bytes
            FROM idempotence_cache ic
            INNER JOIN executions e ON ic.execution_id = e.id
            INNER JOIN tool_versions tv ON ic.tool_version_id = tv.id
            INNER JOIN tools t ON tv.tool_id = t.id
            WHERE t.name = $1
              AND tv.version = $2
              AND ic.input_hash = $3
              AND ic.expires_at > NOW()
            """,
            tool_id,
            version,
            input_hash,
        )

        if row:
            # Increment cache hit count
            await self.db_conn.execute(
                "SELECT increment_cache_hit($1, $2)",
                row["id"],  # tool_version_id would be better but we have execution
                input_hash,
            )

            logger.info("Cache hit", tool_id=tool_id, version=version, execution_id=str(row["id"]))

            return {
                "ok": True,
                "executionId": str(row["id"]),
                "output": row["output"],
                "metrics": {
                    "duration_ms": row["duration_ms"],
                    "cpu_ms": row["cpu_usage_ms"],
                    "memory_peak_mb": row["memory_peak_bytes"] / (1024 * 1024) if row["memory_peak_bytes"] else None,
                },
            }

        return None

    async def _store_cache(self, tool_id: str, version: str, input_data: Dict[str, Any], execution_id: str):
        """Store execution in idempotence cache"""
        input_hash = self._calculate_input_hash(tool_id, version, input_data)
        ttl_minutes = settings.cache_ttl_min

        try:
            # Get tool_version_id
            tool_version_row = await self.db_conn.fetchrow(
                """
                SELECT tv.id
                FROM tool_versions tv
                INNER JOIN tools t ON tv.tool_id = t.id
                WHERE t.name = $1 AND tv.version = $2
                """,
                tool_id,
                version,
            )

            if not tool_version_row:
                logger.warn("Tool version not found for caching", tool_id=tool_id, version=version)
                return

            await self.db_conn.execute(
                """
                INSERT INTO idempotence_cache (tool_version_id, input_hash, execution_id, expires_at)
                VALUES ($1, $2, $3::uuid, NOW() + INTERVAL '%s minutes')
                ON CONFLICT (tool_version_id, input_hash) DO UPDATE
                  SET execution_id = $3::uuid, expires_at = NOW() + INTERVAL '%s minutes'
                """ % (ttl_minutes, ttl_minutes),
                tool_version_row["id"],
                input_hash,
                execution_id,
            )

            logger.debug("Stored in cache", execution_id=execution_id, ttl_minutes=ttl_minutes)

        except Exception as e:
            logger.error("Failed to store cache", error=str(e))

    def _calculate_input_hash(self, tool_id: str, version: str, input_data: Dict[str, Any]) -> str:
        """Calculate input hash for idempotence"""
        payload = json.dumps({"toolId": tool_id, "version": version, "input": input_data}, sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()

    async def _get_secrets(self, secret_names: list) -> Dict[str, str]:
        """Get secrets from Vault"""
        # TODO: Implement Vault integration
        logger.warn("Vault not implemented, returning empty secrets")
        return {}

    async def _create_execution_record(self, **kwargs):
        """Create execution record in database"""
        input_hash = self._calculate_input_hash(
            kwargs["tool_name"],
            kwargs["version"],
            kwargs["input_data"]
        )

        await self.db_conn.execute(
            """
            INSERT INTO executions (
                id, run_id, tool_id, tool_name, tool_version,
                agent_id, phase, input_hash, input, status,
                trace_id, span_id, created_at
            )
            VALUES (
                $1::uuid, $2, $3::uuid, $4, $5,
                $6, $7, $8, $9, 'running',
                $10, $11, NOW()
            )
            """,
            kwargs["execution_id"],
            kwargs["run_id"],
            kwargs["tool_id"],
            kwargs["tool_name"],
            kwargs["version"],
            kwargs.get("agent_id"),
            kwargs.get("phase"),
            input_hash,
            json.dumps(kwargs["input_data"]),
            kwargs.get("trace_id"),
            kwargs.get("span_id"),
        )

    async def _update_execution_record(self, execution_id: str, status: str, **kwargs):
        """Update execution record with results"""
        await self.db_conn.execute(
            """
            UPDATE executions
            SET status = $2,
                output = $3,
                error = $4,
                duration_ms = $5,
                cpu_usage_ms = $6,
                memory_peak_bytes = $7,
                exit_code = $8,
                completed_at = NOW()
            WHERE id = $1::uuid
            """,
            execution_id,
            status,
            json.dumps(kwargs.get("output")) if kwargs.get("output") else None,
            json.dumps(kwargs.get("error")) if kwargs.get("error") else None,
            kwargs.get("duration_ms"),
            kwargs.get("cpu_ms"),
            int(kwargs["memory_peak_mb"] * 1024 * 1024) if kwargs.get("memory_peak_mb") else None,
            kwargs.get("exit_code"),
        )


# Import asyncio at module level
import asyncio
