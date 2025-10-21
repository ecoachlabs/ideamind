FROM python:3.11-slim

# Install TruffleHog and Gitleaks
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install TruffleHog via pip
RUN pip install --no-cache-dir truffleHog3==3.63.0

# Install Gitleaks
RUN curl -sSfL https://github.com/gitleaks/gitleaks/releases/download/v8.18.0/gitleaks_8.18.0_linux_x64.tar.gz | \
    tar -xz -C /usr/local/bin && \
    chmod +x /usr/local/bin/gitleaks

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
