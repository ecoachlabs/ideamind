"""
Tool Registry (Armory) - Service Layer
Business logic for tool registry operations
"""

import asyncpg
import structlog
import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import UUID

from .models import (
    ToolSearchRequest,
    ToolSearchResultItem,
    PublishRequest,
    PublishResponse,
    DeprecateRequest,
    ToolWithVersionResponse,
    ToolVersionResponse,
    ToolManifest,
    ToolStatus,
    CreateAllowlistRequest,
    AllowlistResponse,
)

logger = structlog.get_logger()


class ToolRegistryService:
    """Service for tool registry operations"""

    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    # ========================================================================
    # SEARCH
    # ========================================================================

    async def search_tools(
        self, request: ToolSearchRequest
    ) -> List[ToolSearchResultItem]:
        """
        Search for tools using PostgreSQL function
        """
        logger.info("Searching tools", query=request.query, capabilities=request.capabilities)

        try:
            # Call the search_tools function from schema
            rows = await self.conn.fetch(
                """
                SELECT * FROM search_tools(
                    p_query := $1,
                    p_capabilities := $2,
                    p_tags := $3,
                    p_runtime := $4,
                    p_limit := $5,
                    p_offset := $6
                )
                """,
                request.query,
                request.capabilities,
                [request.tags] if request.tags else None,
                request.runtime.value if request.runtime else None,
                request.limit,
                request.offset,
            )

            results = []
            for row in rows:
                results.append(
                    ToolSearchResultItem(
                        id=str(row["tool_id"]),
                        name=row["name"],
                        owner=row["owner"],
                        summary=row["summary"],
                        version=row["version"],
                        runtime=row["runtime"],
                        capabilities=row["capabilities"] or [],
                        tags=row["tags"] or [],
                        published_at=row["published_at"],  # Assuming this field exists
                        relevance=row.get("relevance"),
                    )
                )

            logger.info("Tool search completed", result_count=len(results))
            return results

        except Exception as e:
            logger.error("Tool search failed", error=str(e))
            raise

    # ========================================================================
    # GET TOOL
    # ========================================================================

    async def get_tool(
        self, name: str, version: str
    ) -> Optional[ToolWithVersionResponse]:
        """
        Get tool by name and version (use 'latest' for latest version)
        """
        logger.debug("Getting tool", name=name, version=version)

        try:
            if version == "latest":
                # Get latest published version
                row = await self.conn.fetchrow(
                    """
                    SELECT
                        t.id as tool_id,
                        t.name,
                        t.owner,
                        t.summary,
                        tv.id as version_id,
                        tv.version,
                        tv.status,
                        tv.runtime,
                        tv.image,
                        tv.entrypoint,
                        tv.timeout_ms,
                        tv.cpu,
                        tv.memory,
                        tv.input_schema,
                        tv.output_schema,
                        tv.run_as_non_root,
                        tv.filesystem_readonly,
                        tv.network_restricted,
                        tv.egress_allow,
                        tv.secrets,
                        tv.grounding_required,
                        tv.max_tokens,
                        tv.sbom,
                        tv.signature,
                        tv.digest,
                        tv.published_at,
                        tv.deprecated_at,
                        tv.deprecation_reason,
                        tv.changelog,
                        tv.breaking_changes,
                        ARRAY_AGG(DISTINCT c.capability) FILTER (WHERE c.capability IS NOT NULL) as capabilities
                    FROM tools t
                    INNER JOIN tool_versions tv ON t.id = tv.tool_id
                    LEFT JOIN capabilities c ON tv.id = c.tool_version_id
                    WHERE t.name = $1
                      AND tv.status = 'published'
                    GROUP BY t.id, t.name, t.owner, t.summary, tv.id
                    ORDER BY string_to_array(tv.version, '.')::int[] DESC
                    LIMIT 1
                    """,
                    name,
                )
            else:
                # Get specific version
                row = await self.conn.fetchrow(
                    """
                    SELECT
                        t.id as tool_id,
                        t.name,
                        t.owner,
                        t.summary,
                        tv.id as version_id,
                        tv.version,
                        tv.status,
                        tv.runtime,
                        tv.image,
                        tv.entrypoint,
                        tv.timeout_ms,
                        tv.cpu,
                        tv.memory,
                        tv.input_schema,
                        tv.output_schema,
                        tv.run_as_non_root,
                        tv.filesystem_readonly,
                        tv.network_restricted,
                        tv.egress_allow,
                        tv.secrets,
                        tv.grounding_required,
                        tv.max_tokens,
                        tv.sbom,
                        tv.signature,
                        tv.digest,
                        tv.published_at,
                        tv.deprecated_at,
                        tv.deprecation_reason,
                        tv.changelog,
                        tv.breaking_changes,
                        ARRAY_AGG(DISTINCT c.capability) FILTER (WHERE c.capability IS NOT NULL) as capabilities
                    FROM tools t
                    INNER JOIN tool_versions tv ON t.id = tv.tool_id
                    LEFT JOIN capabilities c ON tv.id = c.tool_version_id
                    WHERE t.name = $1 AND tv.version = $2
                    GROUP BY t.id, t.name, t.owner, t.summary, tv.id
                    """,
                    name,
                    version,
                )

            if not row:
                return None

            # Build manifest
            manifest = ToolManifest(
                name=row["name"],
                version=row["version"],
                summary=row["summary"],
                owner=row["owner"],
                capabilities=row["capabilities"] or [],
                input_schema=row["input_schema"],
                output_schema=row["output_schema"],
                runtime=row["runtime"],
                image=row["image"],
                entrypoint=row["entrypoint"],
                timeout_ms=row["timeout_ms"],
                cpu=row["cpu"],
                memory=row["memory"],
                security={
                    "run_as_non_root": row["run_as_non_root"],
                    "filesystem": "read_only" if row["filesystem_readonly"] else "read_write",
                    "network": "restricted" if row["network_restricted"] else "full",
                },
                egress={"allow": row["egress_allow"] or []},
                secrets=row["secrets"] or [],
                guardrails={
                    "grounding_required": row["grounding_required"],
                    "max_tokens": row["max_tokens"],
                },
            )

            # Build version response
            version_response = ToolVersionResponse(
                id=str(row["version_id"]),
                tool_id=str(row["tool_id"]),
                name=row["name"],
                version=row["version"],
                status=row["status"],
                manifest=manifest,
                sbom=row["sbom"],
                signature=row["signature"],
                digest=row["digest"],
                published_at=row["published_at"],
                deprecated_at=row["deprecated_at"],
                deprecation_reason=row["deprecation_reason"],
                changelog=row["changelog"],
                breaking_changes=row["breaking_changes"],
            )

            return ToolWithVersionResponse(
                tool_id=str(row["tool_id"]),
                name=row["name"],
                owner=row["owner"],
                summary=row["summary"],
                version=version_response,
            )

        except Exception as e:
            logger.error("Failed to get tool", error=str(e), name=name, version=version)
            raise

    # ========================================================================
    # PUBLISH
    # ========================================================================

    async def publish_tool(self, request: PublishRequest) -> PublishResponse:
        """
        Publish a new tool or new version of existing tool
        """
        logger.info("Publishing tool", name=request.manifest.name, version=request.manifest.version)

        try:
            async with self.conn.transaction():
                # Check if tool exists
                tool_row = await self.conn.fetchrow(
                    "SELECT id FROM tools WHERE name = $1",
                    request.manifest.name,
                )

                if not tool_row:
                    # Create new tool
                    tool_id = await self.conn.fetchval(
                        """
                        INSERT INTO tools (name, owner, summary, created_by)
                        VALUES ($1, $2, $3, $4)
                        RETURNING id
                        """,
                        request.manifest.name,
                        request.manifest.owner,
                        request.manifest.summary,
                        request.published_by,
                    )
                    logger.info("Created new tool", tool_id=str(tool_id))
                else:
                    tool_id = tool_row["id"]

                # Check if version already exists
                version_exists = await self.conn.fetchval(
                    """
                    SELECT EXISTS(
                        SELECT 1 FROM tool_versions
                        WHERE tool_id = $1 AND version = $2
                    )
                    """,
                    tool_id,
                    request.manifest.version,
                )

                if version_exists:
                    raise ValueError(
                        f"Version {request.manifest.version} already exists for tool {request.manifest.name}"
                    )

                # Insert tool version
                version_id = await self.conn.fetchval(
                    """
                    INSERT INTO tool_versions (
                        tool_id, version, status, runtime, image, entrypoint,
                        timeout_ms, cpu, memory,
                        input_schema, output_schema,
                        run_as_non_root, filesystem_readonly, network_restricted,
                        egress_allow, secrets,
                        grounding_required, max_tokens,
                        sbom, signature, digest,
                        changelog, breaking_changes,
                        published_at, created_by
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6,
                        $7, $8, $9,
                        $10, $11,
                        $12, $13, $14,
                        $15, $16,
                        $17, $18,
                        $19, $20, $21,
                        $22, $23,
                        NOW(), $24
                    )
                    RETURNING id
                    """,
                    tool_id,
                    request.manifest.version,
                    ToolStatus.PUBLISHED.value,
                    request.manifest.runtime.value,
                    request.manifest.image,
                    request.manifest.entrypoint,
                    request.manifest.timeout_ms,
                    request.manifest.cpu,
                    request.manifest.memory,
                    json.dumps(request.manifest.input_schema),
                    json.dumps(request.manifest.output_schema),
                    request.manifest.security.run_as_non_root,
                    request.manifest.security.filesystem == "read_only",
                    request.manifest.security.network == "restricted",
                    request.manifest.egress.allow,
                    request.manifest.secrets,
                    request.manifest.guardrails.grounding_required,
                    request.manifest.guardrails.max_tokens,
                    json.dumps(request.sbom.dict()) if request.sbom else None,
                    request.signatures[0] if request.signatures else None,
                    None,  # digest - would be computed from image
                    request.changelog,
                    request.breaking_changes,
                    request.published_by,
                )

                # Insert capabilities
                if request.manifest.capabilities:
                    for capability in request.manifest.capabilities:
                        await self.conn.execute(
                            """
                            INSERT INTO capabilities (tool_version_id, capability)
                            VALUES ($1, $2)
                            ON CONFLICT (tool_version_id, capability) DO NOTHING
                            """,
                            version_id,
                            capability,
                        )

                logger.info(
                    "Tool published successfully",
                    tool_id=str(tool_id),
                    version=request.manifest.version,
                )

                return PublishResponse(
                    tool_id=str(tool_id),
                    version=request.manifest.version,
                    status=ToolStatus.PUBLISHED,
                )

        except ValueError:
            raise
        except Exception as e:
            logger.error("Failed to publish tool", error=str(e))
            raise

    # ========================================================================
    # DEPRECATE
    # ========================================================================

    async def deprecate_tool(self, request: DeprecateRequest) -> None:
        """
        Deprecate a tool or specific version
        """
        logger.info("Deprecating tool", tool_id=request.tool_id, version=request.version)

        try:
            if request.version:
                # Deprecate specific version
                result = await self.conn.execute(
                    """
                    UPDATE tool_versions tv
                    SET status = 'deprecated',
                        deprecated_at = NOW(),
                        deprecation_reason = $3
                    FROM tools t
                    WHERE tv.tool_id = t.id
                      AND t.id = $1::uuid
                      AND tv.version = $2
                    """,
                    request.tool_id,
                    request.version,
                    request.reason,
                )
            else:
                # Deprecate all versions
                result = await self.conn.execute(
                    """
                    UPDATE tool_versions
                    SET status = 'deprecated',
                        deprecated_at = NOW(),
                        deprecation_reason = $2
                    WHERE tool_id = $1::uuid
                    """,
                    request.tool_id,
                    request.reason,
                )

                # Also mark tool as deprecated
                await self.conn.execute(
                    """
                    UPDATE tools
                    SET updated_at = NOW()
                    WHERE id = $1::uuid
                    """,
                    request.tool_id,
                )

            logger.info("Tool deprecated", tool_id=request.tool_id, version=request.version)

        except Exception as e:
            logger.error("Failed to deprecate tool", error=str(e))
            raise

    # ========================================================================
    # ACCESS CONTROL
    # ========================================================================

    async def check_access(
        self,
        tool_id: str,
        agent_id: Optional[str] = None,
        phase: Optional[str] = None,
        role: Optional[str] = None,
    ) -> bool:
        """
        Check if agent/phase/role has access to tool
        """
        logger.debug("Checking access", tool_id=tool_id, agent_id=agent_id, phase=phase)

        try:
            # Use the check_tool_access function from schema
            has_access = await self.conn.fetchval(
                """
                SELECT check_tool_access($1::uuid, $2, $3, $4)
                """,
                tool_id,
                agent_id,
                phase,
                role,
            )

            return bool(has_access)

        except Exception as e:
            logger.error("Access check failed", error=str(e))
            # Fail closed - deny access on error
            return False

    # ========================================================================
    # CAPABILITIES
    # ========================================================================

    async def list_capabilities(self) -> List[str]:
        """
        List all available capabilities
        """
        logger.debug("Listing capabilities")

        try:
            rows = await self.conn.fetch(
                """
                SELECT DISTINCT capability
                FROM capabilities
                ORDER BY capability
                """
            )

            return [row["capability"] for row in rows]

        except Exception as e:
            logger.error("Failed to list capabilities", error=str(e))
            raise
