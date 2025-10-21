# Multi-stage Dockerfile for tool.prd.traceMatrix
# Secure, non-root, read-only filesystem

FROM python:3.11-slim AS base

# Install security updates
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r tooluser && useradd -r -g tooluser -u 10001 tooluser

# Set working directory
WORKDIR /app

# Copy application
COPY app/main.py /app/main.py

# Set permissions
RUN chown -R tooluser:tooluser /app && \
    chmod 555 /app && \
    chmod 444 /app/main.py

# Switch to non-root user
USER tooluser

# Read-only filesystem
# Runtime will mount tmpfs for /tmp if needed

# Health check (not used in tool execution but good practice)
HEALTHCHECK NONE

# No exposed ports (stdin/stdout only)

# Entrypoint
ENTRYPOINT ["python", "/app/main.py"]
