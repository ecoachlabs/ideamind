FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Semgrep
RUN pip install --no-cache-dir semgrep==1.45.0

# Install Bandit
RUN pip install --no-cache-dir bandit[toml]==1.7.5

# Install CodeQL CLI (optional, slower)
# Commented out for base image - can be enabled if needed
# RUN curl -L https://github.com/github/codeql-cli-binaries/releases/download/v2.15.0/codeql-linux64.zip -o /tmp/codeql.zip && \
#     unzip /tmp/codeql.zip -d /opt && \
#     rm /tmp/codeql.zip && \
#     ln -s /opt/codeql/codeql /usr/local/bin/codeql

# Install additional dependencies
RUN pip install --no-cache-dir pyyaml requests

# Create working directory
WORKDIR /workspace

# Copy entrypoint script
COPY entrypoint.py /entrypoint.py
RUN chmod +x /entrypoint.py

# Run as non-root user
RUN useradd -m -u 1000 scanner && \
    chown -R scanner:scanner /workspace
USER scanner

ENTRYPOINT ["python", "/entrypoint.py"]
