"""
Tool Registry (Armory) - Database Layer
PostgreSQL async connection and queries
"""

import asyncpg
import structlog
from typing import Optional
from contextlib import asynccontextmanager

from .config import settings

logger = structlog.get_logger()

# Global connection pool
_pool: Optional[asyncpg.Pool] = None


# ============================================================================
# CONNECTION MANAGEMENT
# ============================================================================

async def init_db() -> None:
    """Initialize database connection pool"""
    global _pool

    if _pool is not None:
        logger.warn("Database pool already initialized")
        return

    logger.info("Initializing database connection pool")

    try:
        _pool = await asyncpg.create_pool(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            database=settings.db_name,
            min_size=settings.db_pool_min_size,
            max_size=settings.db_pool_max_size,
            command_timeout=settings.db_command_timeout,
        )

        # MEDIUM FIX: Don't log sensitive connection info
        logger.info(
            "Database pool initialized",
            host=settings.db_host,
            port=settings.db_port,
            database=settings.db_name,
        )

        # Test connection
        async with _pool.acquire() as conn:
            version = await conn.fetchval("SELECT version()")
            logger.info("Database connection successful", version=version)

    except Exception as e:
        logger.error("Failed to initialize database pool", error=str(e))
        raise


async def close_db() -> None:
    """Close database connection pool"""
    global _pool

    if _pool is None:
        return

    logger.info("Closing database connection pool")

    try:
        await _pool.close()
        _pool = None
        logger.info("Database pool closed")
    except Exception as e:
        logger.error("Error closing database pool", error=str(e))


def get_pool() -> asyncpg.Pool:
    """Get the global connection pool"""
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Call init_db() first.")
    return _pool


@asynccontextmanager
async def get_connection():
    """Get a database connection from the pool"""
    pool = get_pool()
    async with pool.acquire() as conn:
        yield conn


# ============================================================================
# DEPENDENCY INJECTION
# ============================================================================

async def get_db():
    """FastAPI dependency for database connection"""
    from .service import ToolRegistryService

    pool = get_pool()
    async with pool.acquire() as conn:
        yield ToolRegistryService(conn)
