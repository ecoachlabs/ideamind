"""
IdeaMine Tools SDK - Python Types
Core type definitions using Pydantic
"""

from enum import Enum
from typing import Any, Dict, List, Optional, Union
from datetime import datetime
from pydantic import BaseModel, Field, validator


# ============================================================================
# ENUMS
# ============================================================================


class ToolRuntime(str, Enum):
    """Tool runtime environment"""
    DOCKER = "docker"
    WASM = "wasm"


class ToolStatus(str, Enum):
    """Tool publication status"""
    DRAFT = "draft"
    PUBLISHED = "published"
    DEPRECATED = "deprecated"
    ARCHIVED = "archived"


class ExecutionStatus(str, Enum):
    """Tool execution status"""
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


class ArtifactType(str, Enum):
    """Artifact type"""
    INPUT = "input"
    OUTPUT = "output"
    LOG = "log"
    TRACE = "trace"
    METRIC = "metric"


# ============================================================================
# TOOL CONFIGURATION
# ============================================================================


class SecurityConfig(BaseModel):
    """Security configuration for tool execution"""
    run_as_non_root: bool = True
    filesystem: str = "read_only"
    network: str = "restricted"


class EgressConfig(BaseModel):
    """Egress policy configuration"""
    allow: List[str] = Field(default_factory=list)


class GuardrailsConfig(BaseModel):
    """Guardrails configuration"""
    grounding_required: bool = False
    max_tokens: int = 0


class ToolConfig(BaseModel):
    """Tool configuration from tool.yaml"""
    name: str
    version: str
    summary: str
    owner: str
    capabilities: List[str]
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]
    runtime: ToolRuntime
    image: str
    entrypoint: Optional[List[str]] = None
    timeout_ms: int = 60000
    cpu: str = "500m"
    memory: str = "512Mi"
    egress: Optional[EgressConfig] = None
    secrets: List[str] = Field(default_factory=list)
    license: str = "MIT"
    security: Optional[SecurityConfig] = None
    guardrails: Optional[GuardrailsConfig] = None

    @validator("name")
    def validate_name(cls, v: str) -> str:
        import re
        if not re.match(r"^[a-z][a-z0-9\._-]+$", v):
            raise ValueError("Invalid tool name format")
        return v

    @validator("version")
    def validate_version(cls, v: str) -> str:
        import re
        if not re.match(r"^\d+\.\d+\.\d+(-[a-zA-Z0-9\.-]+)?$", v):
            raise ValueError("Invalid version format (expected SemVer)")
        return v

    @validator("timeout_ms")
    def validate_timeout(cls, v: int) -> int:
        if v < 1000 or v > 600000:
            raise ValueError("Timeout must be between 1000ms and 600000ms")
        return v


# ============================================================================
# TOOL METADATA
# ============================================================================


class Tool(BaseModel):
    """Tool registry entry"""
    id: str
    name: str
    owner: str
    summary: str
    description: Optional[str] = None
    license: Optional[str] = None
    repository_url: Optional[str] = None
    documentation_url: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    verified: bool = False
    created_at: datetime
    updated_at: datetime


class ToolVersion(BaseModel):
    """Tool version metadata"""
    id: str
    tool_id: str
    version: str
    status: ToolStatus
    runtime: ToolRuntime
    image: str
    entrypoint: List[str]
    timeout_ms: int
    cpu: str
    memory: str
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]
    run_as_non_root: bool
    filesystem_readonly: bool
    network_restricted: bool
    egress_allow: List[str]
    secrets: List[str]
    grounding_required: bool
    max_tokens: int
    sbom: Optional[Dict[str, Any]] = None
    signature: Optional[str] = None
    digest: Optional[str] = None
    published_at: Optional[datetime] = None
    created_at: datetime


class ToolWithVersion(Tool):
    """Tool with version information"""
    version_info: ToolVersion
    capabilities: List[str]


# ============================================================================
# EXECUTION
# ============================================================================


class ExecutionBudget(BaseModel):
    """Execution budget constraints"""
    ms: Optional[int] = None
    cost_cents: Optional[float] = None


class ExecutionContext(BaseModel):
    """Execution context"""
    trace_id: Optional[str] = None
    span_id: Optional[str] = None


class ExecutionRequest(BaseModel):
    """Tool execution request"""
    toolId: str
    version: str
    input: Any
    runId: str
    agentId: str
    phase: str
    budget: Optional[ExecutionBudget] = None
    context: Optional[ExecutionContext] = None


class ExecutionError(BaseModel):
    """Execution error details"""
    code: str
    message: str
    details: Optional[Any] = None


class ExecutionMetrics(BaseModel):
    """Execution metrics"""
    cpu_usage_ms: Optional[int] = None
    memory_peak_bytes: Optional[int] = None
    cost_cents: Optional[float] = None
    exit_code: Optional[int] = None


class Artifact(BaseModel):
    """Execution artifact"""
    id: str
    execution_id: str
    type: ArtifactType
    name: str
    mime_type: Optional[str] = None
    size_bytes: int
    storage_uri: str
    storage_etag: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    expires_at: Optional[datetime] = None


class ExecutionResult(BaseModel):
    """Tool execution result"""
    id: str
    ok: bool
    output: Optional[Any] = None
    error: Optional[ExecutionError] = None
    status: ExecutionStatus
    duration_ms: Optional[int] = None
    metrics: Optional[ExecutionMetrics] = None
    artifacts: List[Artifact] = Field(default_factory=list)
    cached: bool = False


class Execution(BaseModel):
    """Full execution record"""
    id: str
    run_id: str
    tool_id: str
    tool_version_id: str
    tool_name: str
    tool_version: str
    agent_id: str
    phase: str
    input_hash: str
    input: Any
    output: Optional[Any] = None
    error: Optional[Any] = None
    status: ExecutionStatus
    duration_ms: Optional[int] = None
    cpu_usage_ms: Optional[int] = None
    memory_peak_bytes: Optional[int] = None
    container_id: Optional[str] = None
    exit_code: Optional[int] = None
    retry_count: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    cost_cents: Optional[float] = None


# ============================================================================
# SEARCH & DISCOVERY
# ============================================================================


class ToolSearchRequest(BaseModel):
    """Tool search request"""
    query: Optional[str] = None
    capabilities: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    runtime: Optional[ToolRuntime] = None
    limit: int = 20
    offset: int = 0


class ToolSearchResult(BaseModel):
    """Tool search result"""
    tool_id: str
    name: str
    owner: str
    summary: str
    version: str
    runtime: ToolRuntime
    capabilities: List[str]
    tags: List[str]
    relevance: float


# ============================================================================
# REGISTRY API
# ============================================================================


class PublishRequest(BaseModel):
    """Tool publish request"""
    config: ToolConfig
    sbom: Optional[Dict[str, Any]] = None
    signature: Optional[str] = None
    digest: Optional[str] = None


class PublishResponse(BaseModel):
    """Tool publish response"""
    tool_id: str
    version_id: str
    name: str
    version: str
    status: ToolStatus


class DeprecateRequest(BaseModel):
    """Tool deprecation request"""
    toolId: str
    version: Optional[str] = None
    reason: str


# ============================================================================
# HANDLER PROTOCOL
# ============================================================================


class HandlerContext(BaseModel):
    """Handler execution context"""
    run_id: Optional[str] = None
    agent_id: Optional[str] = None
    phase: Optional[str] = None
    trace_id: Optional[str] = None


class HandlerInput(BaseModel):
    """Handler input wrapper"""
    input: Any
    context: Optional[HandlerContext] = None


class HandlerArtifact(BaseModel):
    """Handler artifact output"""
    name: str
    type: ArtifactType
    data: Optional[Any] = None
    uri: Optional[str] = None


class HandlerOutput(BaseModel):
    """Handler output wrapper"""
    ok: bool
    output: Optional[Any] = None
    error: Optional[ExecutionError] = None
    artifacts: List[HandlerArtifact] = Field(default_factory=list)


# ============================================================================
# EXCEPTIONS
# ============================================================================


class ToolError(Exception):
    """Base tool error"""
    def __init__(self, message: str, code: str = "TOOL_ERROR", details: Any = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details


class ValidationError(ToolError):
    """Validation error"""
    def __init__(self, message: str, details: Any = None):
        super().__init__(message, "VALIDATION_ERROR", details)


class ExecutionError(ToolError):
    """Execution error"""
    def __init__(self, message: str, details: Any = None):
        super().__init__(message, "EXECUTION_ERROR", details)


class TimeoutError(ToolError):
    """Timeout error"""
    def __init__(self, message: str, details: Any = None):
        super().__init__(message, "TIMEOUT_ERROR", details)


class NotFoundError(ToolError):
    """Not found error"""
    def __init__(self, message: str, details: Any = None):
        super().__init__(message, "NOT_FOUND", details)


class AccessDeniedError(ToolError):
    """Access denied error"""
    def __init__(self, message: str, details: Any = None):
        super().__init__(message, "ACCESS_DENIED", details)
