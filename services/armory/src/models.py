"""
Tool Registry (Armory) - Data Models
Pydantic models for API requests and responses
"""

from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


# ============================================================================
# ENUMS
# ============================================================================

class ToolRuntime(str, Enum):
    """Tool runtime type"""
    DOCKER = "docker"
    WASM = "wasm"


class ToolStatus(str, Enum):
    """Tool publication status"""
    DRAFT = "draft"
    PUBLISHED = "published"
    DEPRECATED = "deprecated"
    ARCHIVED = "archived"


# ============================================================================
# TOOL MANIFEST
# ============================================================================

class ToolSecurityConfig(BaseModel):
    """Security configuration for tool execution"""
    run_as_non_root: bool = True
    filesystem: str = Field("read_only", pattern="^(read_only|read_write)$")
    network: str = Field("restricted", pattern="^(none|restricted|full)$")


class ToolEgressConfig(BaseModel):
    """Egress policy configuration"""
    allow: List[str] = Field(default_factory=list, description="Allowed egress patterns")


class ToolGuardrails(BaseModel):
    """Guardrails configuration"""
    grounding_required: bool = False
    max_tokens: int = 0


class ToolManifest(BaseModel):
    """Tool manifest (tool.yaml)"""
    name: str = Field(..., regex=r"^[a-z][a-z0-9\._-]+$")
    version: str = Field(..., regex=r"^\d+\.\d+\.\d+(-[a-zA-Z0-9\.-]+)?$")
    summary: str = Field(..., min_length=10, max_length=500)
    owner: str
    capabilities: List[str] = Field(default_factory=list)

    # Schemas
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]

    # Runtime
    runtime: ToolRuntime
    image: Optional[str] = None
    entrypoint: Optional[List[str]] = None
    module_path: Optional[str] = None

    # Resource limits
    timeout_ms: int = Field(60000, gt=0, le=600000)
    cpu: str = Field("500m", regex=r"^\d+m?$")
    memory: str = Field("512Mi", regex=r"^\d+(Mi|Gi)$")

    # Security
    security: ToolSecurityConfig = Field(default_factory=ToolSecurityConfig)
    egress: ToolEgressConfig = Field(default_factory=ToolEgressConfig)
    secrets: List[str] = Field(default_factory=list)

    # Guardrails
    guardrails: ToolGuardrails = Field(default_factory=ToolGuardrails)

    # Metadata
    license: Optional[str] = None
    tags: List[str] = Field(default_factory=list)

    @validator('image')
    def validate_image(cls, v, values):
        if values.get('runtime') == ToolRuntime.DOCKER and not v:
            raise ValueError('image is required for docker runtime')
        return v

    @validator('module_path')
    def validate_module_path(cls, v, values):
        if values.get('runtime') == ToolRuntime.WASM and not v:
            raise ValueError('module_path is required for wasm runtime')
        return v


# ============================================================================
# SEARCH
# ============================================================================

class ToolSearchRequest(BaseModel):
    """Tool search request"""
    query: Optional[str] = None
    capabilities: Optional[List[str]] = None
    tags: Optional[str] = None
    runtime: Optional[ToolRuntime] = None
    owner: Optional[str] = None
    limit: int = Field(20, ge=1, le=100)
    offset: int = Field(0, ge=0)


class ToolSearchResultItem(BaseModel):
    """Individual search result"""
    id: str
    name: str
    owner: str
    summary: str
    version: str
    runtime: ToolRuntime
    capabilities: List[str]
    tags: List[str]
    published_at: datetime
    relevance: Optional[float] = None


class ToolSearchResponse(BaseModel):
    """Search results response"""
    results: List[ToolSearchResultItem]
    total: int
    limit: int
    offset: int


# ============================================================================
# TOOL VERSION
# ============================================================================

class SBOMComponent(BaseModel):
    """SBOM component"""
    name: str
    version: str
    type: str
    licenses: Optional[List[str]] = None
    purl: Optional[str] = None


class SBOM(BaseModel):
    """Software Bill of Materials"""
    bomFormat: str
    specVersion: str
    components: List[SBOMComponent]
    dependencies: Optional[List[Any]] = None


class ToolVersionResponse(BaseModel):
    """Tool version information"""
    id: str
    tool_id: str
    name: str
    version: str
    status: ToolStatus
    manifest: ToolManifest

    # Provenance
    sbom: Optional[SBOM] = None
    signature: Optional[str] = None
    digest: Optional[str] = None

    # Metadata
    published_at: Optional[datetime] = None
    deprecated_at: Optional[datetime] = None
    deprecation_reason: Optional[str] = None
    changelog: Optional[str] = None
    breaking_changes: Optional[List[str]] = None


class ToolWithVersionResponse(BaseModel):
    """Tool with latest version"""
    tool_id: str
    name: str
    owner: str
    summary: str
    version: ToolVersionResponse


# ============================================================================
# PUBLISH
# ============================================================================

class PublishRequest(BaseModel):
    """Publish tool request"""
    manifest: ToolManifest
    signatures: Optional[List[str]] = None
    sbom: Optional[SBOM] = None
    published_by: str
    changelog: Optional[str] = None
    breaking_changes: Optional[List[str]] = None


class PublishResponse(BaseModel):
    """Publish tool response"""
    tool_id: str
    version: str
    status: ToolStatus = ToolStatus.PUBLISHED


# ============================================================================
# DEPRECATE
# ============================================================================

class DeprecateRequest(BaseModel):
    """Deprecate tool request"""
    tool_id: str
    version: Optional[str] = None  # If None, deprecate all versions
    reason: str = Field(..., min_length=10)


# ============================================================================
# ACCESS CONTROL
# ============================================================================

class AccessCheckRequest(BaseModel):
    """Access check request"""
    tool_id: str
    agent_id: Optional[str] = None
    phase: Optional[str] = None
    role: Optional[str] = None


class AccessCheckResponse(BaseModel):
    """Access check response"""
    allowed: bool
    reason: Optional[str] = None


# ============================================================================
# ALLOWLIST
# ============================================================================

class CreateAllowlistRequest(BaseModel):
    """Create allowlist entry"""
    tool_id: str
    agent_id: Optional[str] = None
    phase: Optional[str] = None
    role: Optional[str] = None
    policy: Dict[str, Any] = Field(default_factory=dict)
    max_executions_per_hour: Optional[int] = None
    max_concurrent_executions: int = 1
    created_by: str
    expires_at: Optional[datetime] = None
    reason: Optional[str] = None

    @validator('agent_id', 'phase', 'role')
    def validate_scope(cls, v, values):
        """At least one scope must be provided"""
        if not any([
            values.get('agent_id'),
            values.get('phase'),
            values.get('role'),
            v
        ]):
            raise ValueError('At least one of agent_id, phase, or role must be provided')
        return v


class AllowlistResponse(BaseModel):
    """Allowlist entry"""
    id: str
    tool_id: str
    agent_id: Optional[str]
    phase: Optional[str]
    role: Optional[str]
    policy: Dict[str, Any]
    max_executions_per_hour: Optional[int]
    max_concurrent_executions: int
    created_at: datetime
    created_by: str
    expires_at: Optional[datetime]
    reason: Optional[str]
