"""
Tool Registry (Armory) - Configuration
Environment-based configuration using Pydantic Settings
"""

from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings"""

    # Service
    service_name: str = "armory"
    environment: str = Field(default="development", env="NODE_ENV")
    debug: bool = Field(default=False, env="DEBUG")
    log_level: str = Field(default="INFO", env="LOG_LEVEL")

    # API
    host: str = Field(default="0.0.0.0", env="HOST")
    port: int = Field(default=8001, env="PORT")
    api_prefix: str = "/api/v1"

    # Database
    # CRITICAL FIX: No default credentials - must be set via environment
    database_url: str = Field(env="DATABASE_URL")
    db_host: str = Field(default="localhost", env="DB_HOST")
    db_port: int = Field(default=5432, env="DB_PORT")
    db_user: str = Field(env="DB_USER")
    db_password: str = Field(env="DB_PASSWORD")
    db_name: str = Field(default="ideamine_tools", env="DB_NAME")
    db_pool_min_size: int = Field(default=10, env="DB_POOL_MIN_SIZE")
    db_pool_max_size: int = Field(default=20, env="DB_POOL_MAX_SIZE")
    db_command_timeout: int = Field(default=60, env="DB_COMMAND_TIMEOUT")

    # Security
    api_key_header: str = "Authorization"
    require_auth: bool = Field(default=True, env="REQUIRE_AUTH")
    allowed_origins: list[str] = Field(
        default=["http://localhost:3000", "http://localhost:8000"],
        env="ALLOWED_ORIGINS"
    )

    # Registry
    enable_tool_verification: bool = Field(default=True, env="ENABLE_TOOL_VERIFICATION")
    max_tool_size_mb: int = Field(default=500, env="MAX_TOOL_SIZE_MB")

    # Search
    search_results_limit: int = 100
    search_similarity_threshold: float = 0.1

    # Telemetry
    otel_enabled: bool = Field(default=False, env="OTEL_ENABLED")
    otel_endpoint: Optional[str] = Field(default=None, env="OTEL_EXPORTER_OTLP_ENDPOINT")

    # Storage (for SBOM, signatures)
    storage_backend: str = Field(default="local", env="STORAGE_BACKEND")  # local, s3
    storage_path: str = Field(default="/tmp/armory", env="STORAGE_PATH")
    s3_bucket: Optional[str] = Field(default=None, env="S3_BUCKET")
    s3_region: Optional[str] = Field(default="us-east-1", env="S3_REGION")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# Global settings instance
settings = Settings()
