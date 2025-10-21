FROM python:3.11-slim

# Install Trivy and OSV Scanner
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Trivy
RUN curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin v0.48.0

# Install OSV Scanner
RUN curl -L https://github.com/google/osv-scanner/releases/download/v1.4.3/osv-scanner_1.4.3_linux_amd64 -o /usr/local/bin/osv-scanner && \
    chmod +x /usr/local/bin/osv-scanner

# Install Python dependencies for parsing
RUN pip install --no-cache-dir pyyaml requests packaging

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
