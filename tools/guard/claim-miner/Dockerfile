FROM python:3.11-slim

# Create non-root user
RUN useradd -u 10001 -m -s /bin/bash tooluser

# Set working directory
WORKDIR /app

# Copy application
COPY app/main.py /app/main.py

# Make script executable
RUN chmod +x /app/main.py

# Switch to non-root user
USER 10001

# Set entrypoint
ENTRYPOINT ["python", "/app/main.py"]
