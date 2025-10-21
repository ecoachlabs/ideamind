"""
Tool Gateway - Configuration
Environment-based configuration
"""

from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings"""

    # Service
    service_name: str = "gateway"
    environment: str = Field(default="development", env="NODE_ENV")
    debug: bool = Field(default=False, env="DEBUG")
    log_level: str = Field(default="INFO", env="LOG_LEVEL")

    # API
    host: str = Field(default="0.0.0.0", env="HOST")
    port: int = Field(default=8000, env="PORT")
    api_prefix: str = "/api/v1"

    # Upstream services
    registry_url: str = Field(default="http://localhost:8001", env="REGISTRY_URL")
    runner_url: str = Field(default="http://localhost:8002", env="RUNNER_URL")

    # Security
    api_key_header: str = "X-API-Key"
    require_auth: bool = Field(default=False, env="REQUIRE_AUTH")
    allowed_origins: list[str] = Field(
        default=["http://localhost:3000", "http://localhost:8000"],
        env="ALLOWED_ORIGINS"
    )

    # Rate limiting
    rate_limit_enabled: bool = Field(default=False, env="RATE_LIMIT_ENABLED")
    rate_limit_requests_per_minute: int = Field(default=60, env="RATE_LIMIT_RPM")

    # Timeout
    default_timeout_seconds: int = Field(default=60, env="DEFAULT_TIMEOUT_SECONDS")
    execution_timeout_seconds: int = Field(default=600, env="EXECUTION_TIMEOUT_SECONDS")  # 10 min

    # Telemetry
    otel_enabled: bool = Field(default=False, env="OTEL_ENABLED")
    otel_endpoint: Optional[str] = Field(default=None, env="OTEL_EXPORTER_OTLP_ENDPOINT")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# Global settings instance
settings = Settings()
