"""
Tool Runner (Engine) - Configuration
Environment-based configuration
"""

from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings"""

    # Service
    service_name: str = "runner"
    environment: str = Field(default="development", env="NODE_ENV")
    debug: bool = Field(default=False, env="DEBUG")
    log_level: str = Field(default="INFO", env="LOG_LEVEL")

    # API
    host: str = Field(default="0.0.0.0", env="HOST")
    port: int = Field(default=8002, env="PORT")
    api_prefix: str = "/api/v1"

    # Database (for executions tracking)
    db_host: str = Field(default="localhost", env="DB_HOST")
    db_port: int = Field(default=5432, env="DB_PORT")
    db_user: str = Field(default="ideamine", env="DB_USER")
    db_password: str = Field(default="ideamine", env="DB_PASSWORD")
    db_name: str = Field(default="ideamine_tools", env="DB_NAME")
    db_pool_min_size: int = Field(default=10, env="DB_POOL_MIN_SIZE")
    db_pool_max_size: int = Field(default=20, env="DB_POOL_MAX_SIZE")
    db_command_timeout: int = Field(default=60, env="DB_COMMAND_TIMEOUT")

    # Tool Registry
    registry_url: str = Field(default="http://localhost:8001", env="REGISTRY_URL")

    # Execution backends
    default_backend: str = Field(default="docker", env="DEFAULT_BACKEND")  # docker, wasm
    docker_enabled: bool = Field(default=True, env="DOCKER_ENABLED")
    wasm_enabled: bool = Field(default=False, env="WASM_ENABLED")

    # Docker backend
    docker_host: Optional[str] = Field(default=None, env="DOCKER_HOST")  # e.g., "unix:///var/run/docker.sock"
    docker_network: str = Field(default="ideamine-tools", env="DOCKER_NETWORK")

    # Kubernetes backend
    k8s_enabled: bool = Field(default=False, env="K8S_ENABLED")
    k8s_namespace: str = Field(default="ideamine-tools", env="K8S_NAMESPACE")
    k8s_job_ttl: int = Field(default=600, env="K8S_JOB_TTL")  # seconds

    # Resource limits (defaults if not specified in tool.yaml)
    default_timeout_ms: int = Field(default=60000, env="DEFAULT_TIMEOUT_MS")
    default_cpu: str = Field(default="500m", env="DEFAULT_CPU")
    default_memory: str = Field(default="512Mi", env="DEFAULT_MEMORY")
    max_timeout_ms: int = Field(default=600000, env="MAX_TIMEOUT_MS")  # 10 minutes max

    # Vault (secrets management)
    vault_enabled: bool = Field(default=False, env="VAULT_ENABLED")
    vault_url: Optional[str] = Field(default=None, env="VAULT_URL")
    vault_token: Optional[str] = Field(default=None, env="VAULT_TOKEN")
    vault_mount_path: str = Field(default="secret", env="VAULT_MOUNT_PATH")

    # Artifact storage
    storage_backend: str = Field(default="local", env="STORAGE_BACKEND")  # local, s3
    storage_path: str = Field(default="/tmp/runner/artifacts", env="STORAGE_PATH")
    s3_bucket: Optional[str] = Field(default=None, env="S3_BUCKET")
    s3_region: str = Field(default="us-east-1", env="S3_REGION")
    s3_endpoint: Optional[str] = Field(default=None, env="S3_ENDPOINT")  # For MinIO

    # Idempotence cache
    cache_ttl_min: int = Field(default=10, env="CACHE_TTL_MIN")  # minutes
    cache_ttl_max: int = Field(default=60, env="CACHE_TTL_MAX")  # minutes
    cache_enabled: bool = Field(default=True, env="CACHE_ENABLED")

    # Retry
    retry_max_attempts: int = Field(default=3, env="RETRY_MAX_ATTEMPTS")
    retry_backoff_base: float = Field(default=2.0, env="RETRY_BACKOFF_BASE")
    retry_backoff_max: int = Field(default=60, env="RETRY_BACKOFF_MAX")  # seconds

    # Security
    egress_deny_by_default: bool = Field(default=True, env="EGRESS_DENY_BY_DEFAULT")
    allow_privileged: bool = Field(default=False, env="ALLOW_PRIVILEGED")

    # Telemetry
    otel_enabled: bool = Field(default=False, env="OTEL_ENABLED")
    otel_endpoint: Optional[str] = Field(default=None, env="OTEL_EXPORTER_OTLP_ENDPOINT")

    # Cleanup
    cleanup_on_success: bool = Field(default=True, env="CLEANUP_ON_SUCCESS")
    cleanup_on_failure: bool = Field(default=False, env="CLEANUP_ON_FAILURE")
    cleanup_delay_seconds: int = Field(default=300, env="CLEANUP_DELAY_SECONDS")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# Global settings instance
settings = Settings()
