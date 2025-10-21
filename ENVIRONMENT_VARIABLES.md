# Environment Variables Reference

**Complete guide to all environment variables used in IdeaMine**

---

## Quick Reference

| Category | Required in Production | Optional |
|----------|----------------------|----------|
| **Database** | DATABASE_URL or DB_* | DATABASE_POOL_SIZE, DB_SSL_* |
| **LLM APIs** | ANTHROPIC_API_KEY | OPENAI_API_KEY, GOOGLE_API_KEY |
| **Event Bus** | NATS_URL | NATS_CLUSTER_ID, NATS_SERVERS |
| **Vector DB** | - | QDRANT_URL, QDRANT_API_KEY |
| **Object Storage** | - | MINIO_* |
| **Logging** | - | LOG_LEVEL, LOG_FORMAT, LOG_FILE |
| **Telemetry** | - | OTEL_EXPORTER_OTLP_ENDPOINT |
| **Tool System** | - | TOOL_GATEWAY_URL, TOOL_REGISTRY_URL |

---

## Database Configuration

### DATABASE_URL (Recommended)

**Format**: `postgresql://user:password@host:port/database`

**Example**:
```bash
DATABASE_URL=postgresql://ideamine:ideamine_dev_password@localhost:5432/ideamine
```

**Used by**:
- `packages/orchestrator-core/src/database/connection.ts`
- All Knowledge Map clients
- Integration tests

**Production SSL**:
```bash
DATABASE_URL=postgresql://user:password@prod-db.example.com:5432/ideamine?sslmode=require
```

---

### Individual Database Variables (Alternative)

Use these **instead of** DATABASE_URL if you prefer:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ideamine
DB_USER=ideamine
DB_PASSWORD=<secure-password>  # REQUIRED in production
DB_MAX_CONNECTIONS=20
```

**Used by**:
- `packages/orchestrator-core/src/database/connection.ts:370-379`

---

### Database Pool Configuration

```bash
# Pool size (default: 20)
DATABASE_POOL_SIZE=20

# Or if using individual vars:
DB_MAX_CONNECTIONS=20
```

**Rule of thumb**: `pool_size = (2 * num_cpu_cores) + effective_spindle_count`

---

### Database SSL Configuration

```bash
# Enable SSL
DB_SSL=true

# CA certificate (for verifying server)
DB_SSL_CA=/path/to/ca-certificate.crt

# Client certificate (for mutual TLS)
DB_SSL_CERT=/path/to/client-cert.crt
DB_SSL_KEY=/path/to/client-key.key
```

**Used by**:
- `packages/orchestrator-core/src/database/connection.ts:345-348`

---

### Test Database

```bash
TEST_DATABASE_URL=postgresql://localhost:5432/ideamine_test
```

**Used by**:
- `packages/orchestrator-core/tests/setup.ts:24`
- `packages/orchestrator-core/tests/integration/*.test.ts`

---

### Python Knowledge Map Service

```bash
KM_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/knowledge_map
```

**Used by**:
- `services/knowledge-map/src/main.py:108`

**Note**: This uses a separate database. Set to main DATABASE_URL to share database.

---

## LLM API Keys

### Anthropic (Required)

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

**Used by**: 50+ agent files
- All QAQ/QAA/QV Knowledge Map agents
- All phase coordinators
- Verifier
- Story agents
- Critique agents
- Release agents
- And more...

**Get API Key**: https://console.anthropic.com/

**Cost**: ~$3-15 per workflow run (varies by complexity)

---

### OpenAI (Optional)

```bash
OPENAI_API_KEY=sk-...
```

**Used by**:
- `packages/agent-sdk/src/llm/openai-provider.ts:23`
- `packages/tools/src/intake/search-similar-ideas.ts` (embeddings)
- `packages/tool-sdk/src/tools/refine/embed.ts:134`

**Required for**: Embedding-based similarity search

**Get API Key**: https://platform.openai.com/api-keys

**Cost**: ~$0.13 per 1M tokens (embeddings)

---

### Google AI (Optional)

```bash
GOOGLE_API_KEY=...
```

**Used by**:
- `packages/agent-sdk/src/llm/google-provider.ts:23`

**Get API Key**: https://makersuite.google.com/app/apikey

---

### LLM Model Configuration

```bash
# Model selection
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
DEFAULT_LLM_MODEL=gpt-4-turbo-preview

# Generation parameters
DEFAULT_LLM_TEMPERATURE=0.7
DEFAULT_LLM_MAX_TOKENS=4096
```

**Used by**:
- `packages/agent-sdk/src/hubs/question-agent-hub.ts:46`
- `packages/agent-sdk/src/hubs/answer-agent-hub.ts:46`
- `packages/agent-sdk/src/hubs/validator-hub.ts:48`

---

### LLM Configuration File

```bash
LLM_CONFIG_PATH=/path/to/llm-config.json
```

**Default**: `./config/llm-config.json`

**Used by**:
- `packages/agent-sdk/src/llm/config-loader.ts:24`

---

## Event Bus (NATS)

### NATS Connection

```bash
# Single server
NATS_URL=nats://localhost:4222

# Multiple servers (comma-separated)
NATS_SERVERS=nats://server1:4222,nats://server2:4222,nats://server3:4222

# Cluster ID
NATS_CLUSTER_ID=ideamine-cluster
```

**Used by**:
- `packages/event-bus/src/nats-client.ts:301`

**Docker**: Already configured in docker-compose.yml ✅

---

## Vector Database (Qdrant)

```bash
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
```

**Used by**:
- `packages/tools/src/intake/search-similar-ideas.ts:65-66`

**Docker**: Already configured in docker-compose.yml ✅

---

## Object Storage (MinIO)

```bash
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
MINIO_ARTIFACTS_BUCKET=artifacts
MINIO_LOGS_BUCKET=logs
```

**Docker**: Already configured in docker-compose.yml ✅

**Production**: Use AWS S3 or other S3-compatible service

---

## Cache (Redis)

```bash
REDIS_URL=redis://localhost:6379
```

**Docker**: Already configured in docker-compose.yml ✅

---

## Secrets Management (Vault)

```bash
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=root
```

**Docker**: Already configured in docker-compose.yml (dev mode) ✅

**Production**: Use actual Vault server with proper authentication

---

## Tool System

```bash
# Tool Gateway
TOOL_GATEWAY_URL=http://localhost:8080

# Tool Registry
TOOL_REGISTRY_URL=http://localhost:8081

# Authentication
TOOL_API_KEY=
TOOL_AUTH_TOKEN=

# Tool Executor
TOOL_EXECUTOR_TIMEOUT_SECONDS=300
TOOL_EXECUTOR_MAX_MEMORY_MB=512
TOOL_EXECUTOR_MAX_CPU_CORES=1
DOCKER_HOST=unix:///var/run/docker.sock
```

**Used by**:
- `packages/agent-sdk/src/executor.ts:19-22`
- `packages/tool-sdk/examples/client-example.ts:10-11`

---

## Logging

```bash
# Log level: debug, info, warn, error
LOG_LEVEL=info

# Log format: json, pretty
LOG_FORMAT=json

# Log file path (production)
LOG_FILE=/var/log/ideamine/app.log
```

**Used by**:
- `packages/orchestrator-core/src/utils/logger.ts:44-45`
- `packages/tool-sdk/src/ts/logger.ts:11`
- `packages/tool-sdk/src/ts/utils/logger.ts:141-143`

**Default**: `LOG_LEVEL=info`, `LOG_FORMAT=json`

---

## Observability

### OpenTelemetry

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

**Used by**:
- `packages/tool-sdk/src/ts/telemetry.ts:47`

**Docker**: Jaeger configured in docker-compose.yml ✅

---

### Jaeger

```bash
JAEGER_ENDPOINT=http://localhost:14268/api/traces
```

**Docker**: Accessible at http://localhost:16686

---

### Prometheus

```bash
PROMETHEUS_PUSHGATEWAY=http://localhost:9091
```

**Docker**: Accessible at http://localhost:9090

---

## Workflow Configuration

```bash
# Budget defaults
DEFAULT_WORKFLOW_BUDGET_USD=100.00
DEFAULT_WORKFLOW_MAX_TOKENS=1000000
DEFAULT_WORKFLOW_MAX_RETRIES=3
```

---

## Security

```bash
# JWT secret for authentication
JWT_SECRET=your-secret-key-here

# CORS allowed origins
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

---

## Feature Flags

```bash
ENABLE_GATE_AUTO_APPROVAL=false
ENABLE_HUMAN_REVIEW=true
ENABLE_COST_ALERTS=true
ENABLE_TELEMETRY=true
```

---

## Application Environment

```bash
# Environment: development, staging, production
NODE_ENV=production

# Enable debug mode
DEBUG=true
```

**Used by**:
- Security validation (production checks)
- Logging behavior
- Error message detail
- PII redaction

---

## Complete Production Example

Create `.env` file:

```bash
# ====================
# CORE CONFIGURATION
# ====================
NODE_ENV=production

# ====================
# DATABASE
# ====================
DATABASE_URL=postgresql://ideamine:CHANGE_THIS_PASSWORD@prod-db.example.com:5432/ideamine?sslmode=require
DATABASE_POOL_SIZE=50

# ====================
# LLM APIS
# ====================
ANTHROPIC_API_KEY=sk-ant-CHANGE_THIS
OPENAI_API_KEY=sk-CHANGE_THIS

# ====================
# EVENT BUS
# ====================
NATS_URL=nats://nats.example.com:4222

# ====================
# VECTOR DATABASE
# ====================
QDRANT_URL=https://qdrant.example.com
QDRANT_API_KEY=CHANGE_THIS

# ====================
# OBJECT STORAGE (S3)
# ====================
MINIO_ENDPOINT=s3.amazonaws.com
MINIO_ACCESS_KEY=CHANGE_THIS
MINIO_SECRET_KEY=CHANGE_THIS
MINIO_USE_SSL=true
MINIO_ARTIFACTS_BUCKET=ideamine-artifacts-prod
MINIO_LOGS_BUCKET=ideamine-logs-prod

# ====================
# CACHE
# ====================
REDIS_URL=redis://redis.example.com:6379

# ====================
# SECRETS
# ====================
VAULT_ADDR=https://vault.example.com
VAULT_TOKEN=CHANGE_THIS

# ====================
# OBSERVABILITY
# ====================
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com:4318
JAEGER_ENDPOINT=https://jaeger.example.com/api/traces
PROMETHEUS_PUSHGATEWAY=https://pushgateway.example.com:9091

# ====================
# LOGGING
# ====================
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE=/var/log/ideamine/app.log

# ====================
# SECURITY
# ====================
JWT_SECRET=CHANGE_THIS_TO_SECURE_RANDOM_STRING
CORS_ORIGINS=https://app.example.com,https://admin.example.com

# ====================
# WORKFLOW
# ====================
DEFAULT_WORKFLOW_BUDGET_USD=200.00
DEFAULT_WORKFLOW_MAX_TOKENS=2000000
DEFAULT_WORKFLOW_MAX_RETRIES=5

# ====================
# FEATURE FLAGS
# ====================
ENABLE_GATE_AUTO_APPROVAL=false
ENABLE_HUMAN_REVIEW=true
ENABLE_COST_ALERTS=true
ENABLE_TELEMETRY=true
```

---

## Local Development Example

Create `.env` (from `.env.docker`):

```bash
# Use docker-compose service names for local development
DATABASE_URL=postgresql://ideamine:ideamine_dev_password@localhost:5432/ideamine
NATS_URL=nats://localhost:4222
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379

# Your API keys (required)
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
OPENAI_API_KEY=sk-YOUR_KEY_HERE

# Development settings
NODE_ENV=development
LOG_LEVEL=debug
LOG_FORMAT=pretty
ENABLE_TELEMETRY=false
```

---

## Environment Variable Validation

The codebase validates required environment variables in production:

### Database Connection

**File**: `packages/orchestrator-core/src/database/connection.ts:361`

```typescript
if (missing.length > 0 && process.env.NODE_ENV === 'production') {
  throw new Error(
    `Missing required database credentials: ${missing.join(', ')}. ` +
    `Set DATABASE_URL or individual DB_* variables. ` +
    `Never use default credentials in production.`
  );
}
```

### Anthropic API Key

**File**: `packages/agent-sdk/src/llm/anthropic-provider.ts:19`

```typescript
if (!apiKey) {
  throw new Error(
    'Anthropic API key required. Set ANTHROPIC_API_KEY environment variable or provide in config.'
  );
}

if (!apiKey.startsWith('sk-ant-')) {
  throw new Error(
    'Invalid Anthropic API key format. Key should start with "sk-ant-"'
  );
}
```

---

## Testing

### Test Environment Variables

```bash
# Set in test files
NODE_ENV=test
ANTHROPIC_API_KEY=test-api-key
TEST_DATABASE_URL=postgresql://localhost:5432/ideamine_test
DEBUG=false
```

**Files**:
- `packages/orchestrator-core/tests/setup.ts:8-25`
- `packages/agents/tests/setup.ts:6-7`

---

## Troubleshooting

### "Missing required database credentials"

**Cause**: DATABASE_URL or DB_PASSWORD not set in production

**Solution**:
```bash
export DATABASE_URL="postgresql://user:password@host:5432/database"
```

---

### "Anthropic API key required"

**Cause**: ANTHROPIC_API_KEY not set

**Solution**:
```bash
export ANTHROPIC_API_KEY="sk-ant-YOUR_KEY_HERE"
```

Get key from: https://console.anthropic.com/

---

### "Cannot connect to database"

**Cause**: Wrong DATABASE_URL or database not running

**Solution**:
```bash
# Verify format
echo $DATABASE_URL

# Test connection
psql "$DATABASE_URL" -c "SELECT 1;"
```

---

### "NATS connection failed"

**Cause**: NATS server not running or wrong URL

**Solution**:
```bash
# Start NATS with docker-compose
docker-compose up -d nats

# Verify NATS is running
docker-compose ps nats

# Check NATS URL
echo $NATS_URL
```

---

## Summary

**Total Environment Variables**: 50+

**Required for Minimal Setup**:
- `DATABASE_URL` (or `DB_*` vars)
- `ANTHROPIC_API_KEY`

**Recommended for Production**:
- All database SSL variables (`DB_SSL_*`)
- `NATS_URL` (when #1 in REMAINING_WORK_ITEMS.md is implemented)
- `LOG_LEVEL=info`
- `LOG_FORMAT=json`
- `NODE_ENV=production`

**All Defaults**: Documented in `.env.example` ✅

**Docker Setup**: Pre-configured in `.env.docker` ✅

---

**Document Version**: 1.0
**Last Updated**: 2025-10-19
**Status**: Complete ✅
