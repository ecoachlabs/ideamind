"""
IdeaMine Tools SDK - Python Logger
Structured logging using structlog
"""

import sys
import logging
import structlog
from typing import Any, Dict, Optional


def create_logger(service_name: str, level: Optional[str] = None) -> structlog.BoundLogger:
    """
    Create a structured logger instance

    Args:
        service_name: Service name for logging context
        level: Log level (DEBUG, INFO, WARNING, ERROR). Defaults to INFO or LOG_LEVEL env var.

    Returns:
        Configured structlog logger
    """
    import os

    # Determine log level
    log_level = level or os.getenv("LOG_LEVEL", "INFO").upper()
    numeric_level = getattr(logging, log_level, logging.INFO)

    # Configure standard logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=numeric_level,
    )

    # Configure structlog
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer() if os.getenv("NODE_ENV") == "production"
            else structlog.dev.ConsoleRenderer(colors=True),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(numeric_level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Return logger with service context
    return structlog.get_logger().bind(service=service_name)


# Default logger instance
default_logger = create_logger("tool-sdk")
