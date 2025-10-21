"""
IdeaMine Tools SDK - Python Types
Type definitions for Tool Registry, Runner, and execution
"""

from typing import Dict, List, Optional, Any, Literal, Protocol, Callable
from dataclasses import dataclass, field
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


class ExecutionStatus(str, Enum):
    """Execution status"""
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


# ============================================================================
# TOOL MANIFEST
# ============================================================================

@dataclass
class ToolSecurityConfig:
    """Security configuration for tool execution"""
    run_as_non_root: bool = True
    filesystem: Literal["read_only", "read_write"] = "read_only"
    network: Literal["none", "restricted", "full"] = "restricted"


@dataclass
class ToolEgressConfig:
    """Egress policy configuration"""
    allow: List[str] = field(default_factory=list)


@dataclass
class ToolGuardrails:
    """Guardrails configuration"""
    grounding_required: bool = False
    max_tokens: int = 0


@dataclass
class ToolManifest:
    """Tool manifest (tool.yaml)"""
    name: str
    version: str
    summary: str
    owner: str
    capabilities: List[str]

    # Schemas
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]

    # Runtime
    runtime: ToolRuntime
    image: Optional[str] = None
    entrypoint: Optional[List[str]] = None
    module_path: Optional[str] = None

    # Resource limits
    timeout_ms: int = 60000
    cpu: str = "500m"
    memory: str = "512Mi"

    # Security
    security: ToolSecurityConfig = field(default_factory=ToolSecurityConfig)
    egress: ToolEgressConfig = field(default_factory=ToolEgressConfig)
    secrets: List[str] = field(default_factory=list)

    # Guardrails
    guardrails: ToolGuardrails = field(default_factory=ToolGuardrails)

    # Metadata
    license: Optional[str] = None
    tags: List[str] = field(default_factory=list)


# ============================================================================
# TOOL EXECUTION
# ============================================================================

@dataclass
class ToolExecutionRequest:
    """Tool execution request"""
    toolId: str
    version: str
    input: Dict[str, Any]
    runId: str

    # Budget
    budget: Optional[Dict[str, int]] = None  # {"ms": 60000, "cost_usd": 0.1}

    # Context
    agentId: Optional[str] = None
    phase: Optional[str] = None

    # Observability
    traceId: Optional[str] = None
    spanId: Optional[str] = None

    # Options
    skipCache: bool = False


@dataclass
class ToolExecutionMetrics:
    """Execution metrics"""
    duration_ms: int
    cpu_ms: Optional[int] = None
    memory_peak_mb: Optional[int] = None
    cost_usd: Optional[float] = None
    retry_count: int = 0

    # Timestamps
    started_at: str = ""
    completed_at: str = ""


@dataclass
class ToolExecutionError:
    """Execution error details"""
    type: Literal["validation", "timeout", "resource_limit", "runtime", "unknown"]
    message: str
    stack: Optional[str] = None
    retryable: bool = False


@dataclass
class ToolArtifact:
    """Tool artifact reference"""
    id: str
    name: str
    type: Literal["output", "log", "trace", "metric"]
    storage_uri: str
    mime_type: Optional[str] = None
    size_bytes: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolExecutionResponse:
    """Tool execution response"""
    ok: bool
    executionId: str
    metrics: ToolExecutionMetrics

    output: Optional[Dict[str, Any]] = None
    artifacts: List[ToolArtifact] = field(default_factory=list)
    error: Optional[ToolExecutionError] = None
    cached: bool = False


# ============================================================================
# TOOL REGISTRY
# ============================================================================

@dataclass
class ToolSearchQuery:
    """Tool search query"""
    q: Optional[str] = None
    capabilities: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    runtime: Optional[ToolRuntime] = None
    owner: Optional[str] = None
    limit: int = 20
    offset: int = 0


@dataclass
class ToolSearchResult:
    """Individual search result"""
    id: str
    name: str
    owner: str
    summary: str
    version: str
    runtime: ToolRuntime
    capabilities: List[str]
    tags: List[str]
    published_at: str
    relevance: Optional[float] = None


@dataclass
class ToolVersionInfo:
    """Tool version information"""
    id: str
    tool_id: str
    name: str
    version: str
    manifest: ToolManifest
    status: ToolStatus

    # Provenance
    sbom: Optional[Dict[str, Any]] = None
    signature: Optional[str] = None
    digest: Optional[str] = None

    # Metadata
    published_at: Optional[str] = None
    deprecated_at: Optional[str] = None
    deprecation_reason: Optional[str] = None
    changelog: Optional[str] = None
    breaking_changes: Optional[List[str]] = None


# ============================================================================
# ACCESS CONTROL
# ============================================================================

@dataclass
class AccessCheckResponse:
    """Access check response"""
    allowed: bool
    reason: Optional[str] = None


# ============================================================================
# TOOL HANDLER
# ============================================================================

class ToolLogger(Protocol):
    """Logger protocol for tool handlers"""

    def debug(self, message: str, **meta: Any) -> None: ...
    def info(self, message: str, **meta: Any) -> None: ...
    def warn(self, message: str, **meta: Any) -> None: ...
    def error(self, message: str, **meta: Any) -> None: ...


@dataclass
class ToolHandlerContext:
    """Context passed to tool handlers"""
    runId: str
    executionId: str
    agentId: Optional[str] = None
    phase: Optional[str] = None
    traceId: Optional[str] = None
    spanId: Optional[str] = None

    # Logger
    logger: Optional[ToolLogger] = None

    # Secrets (injected from Vault)
    secrets: Dict[str, str] = field(default_factory=dict)


# Handler function signature
ToolHandler = Callable[[Dict[str, Any], ToolHandlerContext], Dict[str, Any]]


# ============================================================================
# CONFIGURATION
# ============================================================================

@dataclass
class ToolClientConfig:
    """Tool client configuration"""
    gateway_url: str
    registry_url: Optional[str] = None

    # Authentication
    api_key: Optional[str] = None
    auth_token: Optional[str] = None

    # Defaults
    default_timeout_ms: int = 30000
    default_retry_attempts: int = 3

    # Observability
    enable_tracing: bool = True
    enable_metrics: bool = True

    # Logging
    logger: Optional[ToolLogger] = None


@dataclass
class ToolServerConfig:
    """Tool server configuration"""
    manifest: ToolManifest
    handler: ToolHandler

    # Validation
    validate_input: bool = True
    validate_output: bool = True

    # Logging
    logger: Optional[ToolLogger] = None


# ============================================================================
# LOGS
# ============================================================================

@dataclass
class ToolLog:
    """Tool execution log entry"""
    execution_id: str
    stream: Literal["stdout", "stderr"]
    line_number: int
    content: str
    timestamp: str


# Callback for streaming logs
ToolLogCallback = Callable[[ToolLog], None]
