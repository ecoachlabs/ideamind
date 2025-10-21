"""
Tool Registry (Armory) Service
PostgreSQL-backed tool catalog with versioning, capabilities, and access control
"""

from .config import settings
from .models import (
    ToolManifest,
    ToolSearchRequest,
    ToolSearchResponse,
    PublishRequest,
    PublishResponse,
    DeprecateRequest,
    ToolWithVersionResponse,
)
from .service import ToolRegistryService
from .database import init_db, close_db, get_db

__all__ = [
    "settings",
    "ToolManifest",
    "ToolSearchRequest",
    "ToolSearchResponse",
    "PublishRequest",
    "PublishResponse",
    "DeprecateRequest",
    "ToolWithVersionResponse",
    "ToolRegistryService",
    "init_db",
    "close_db",
    "get_db",
]
