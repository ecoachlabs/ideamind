# IdeaMine Platform - Setup Guide

This guide will walk you through setting up the IdeaMine platform from scratch.

## Prerequisites

Ensure you have the following installed:

- **Node.js** >= 20.0.0
- **pnpm** >= 8.0.0
- **Docker** and **Docker Compose** >= 2.0
- **Git** >= 2.0

### Verify Prerequisites

```bash
node --version  # Should be >= 20.0.0
pnpm --version  # Should be >= 8.0.0
docker --version
docker-compose --version
git --version
```

## Quick Start (5 minutes)

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd Ideamind

# Install all dependencies using pnpm workspaces
pnpm install
```

This will install dependencies for all packages and services in the monorepo.

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and add your API keys
nano .env  # or use your preferred editor
```

Required environment variables:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ideamine
DB_USER=ideamine
DB_PASSWORD=ideamine_dev_password
DB_MAX_CONNECTIONS=20

# NATS
NATS_SERVERS=nats://localhost:4222

# Redis
REDIS_URL=redis://localhost:6379

# LLM API Keys (Required)
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here

# MinIO (Artifact Storage)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=artifacts

# Observability (Optional)
PROMETHEUS_URL=http://localhost:9090
GRAFANA_URL=http://localhost:3001
JAEGER_URL=http://localhost:16686
```

### 3. Start Infrastructure Services

```bash
# Start all infrastructure services with Docker Compose
pnpm docker:up

# Wait for services to be healthy (takes ~30 seconds)
# You can monitor with:
pnpm docker:logs
```

This starts:
- **PostgreSQL** (port 5432) - Primary database
- **Redis** (port 6379) - Caching and queues
- **NATS** (port 4222) - Event bus
- **Qdrant** (port 6333) - Vector database
- **MinIO** (port 9000/9001) - Artifact storage
- **Vault** (port 8200) - Secrets management
- **Prometheus** (port 9090) - Metrics
- **Grafana** (port 3001) - Dashboards
- **Jaeger** (port 16686) - Distributed tracing

### 4. Build Packages

```bash
# Build all packages in dependency order
pnpm build

# This compiles:
# - @ideamine/event-schemas
# - @ideamine/artifact-schemas
# - @ideamine/orchestrator-core
# - @ideamine/event-bus
# - @ideamine/agent-sdk
# - @ideamine/tool-sdk
# - All services
```

### 5. Run Database Migrations

```bash
# Database schema is automatically initialized via Docker init scripts
# Verify database is ready:
docker exec ideamine-postgres psql -U ideamine -d ideamine -c "\dt"

# You should see tables: workflow_runs, phase_executions, artifacts, etc.
```

### 6. Start Development Servers

```bash
# Start all services in development mode with hot reload
pnpm dev

# This starts:
# - Orchestrator service
# - API Gateway
# - Intake service
# - All other phase services
```

### 7. Verify Installation

Open your browser and check:

- **Grafana Dashboard**: http://localhost:3001 (admin/admin)
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)
- **Jaeger UI**: http://localhost:16686
- **Prometheus**: http://localhost:9090
- **NATS Monitoring**: http://localhost:8222

## Architecture Overview

### Monorepo Structure

```
ideamine/
├── packages/              # Shared libraries
│   ├── orchestrator-core/ # Workflow engine with LangGraph
│   ├── event-bus/         # NATS Jetstream client
│   ├── agent-sdk/         # Analyzer-inside-Agent framework
│   ├── tool-sdk/          # Tool interface and execution
│   ├── event-schemas/     # Event type definitions
│   └── artifact-schemas/  # Artifact type definitions
├── services/              # Microservices (one per phase)
│   ├── intake/            # Intake & Spin-Up service
│   ├── reasoning/         # Deep Ideation service
│   ├── prd/               # PRD Generation service
│   └── ...                # Other phase services
├── apps/                  # Application services
│   ├── orchestrator/      # Main orchestration service
│   ├── api-gateway/       # Auth and routing
│   └── admin-console/     # Control plane UI
├── platform/              # Infrastructure
│   ├── database/          # PostgreSQL schemas and migrations
│   ├── event-bus/         # NATS configuration
│   └── observability/     # Prometheus, Grafana configs
└── docs/                  # Documentation
```

### Key Components

#### 1. Orchestration Engine

Location: `packages/orchestrator-core/`

- **WorkflowEngine**: Main workflow execution engine
- **LangGraphOrchestrator**: LangGraph-based state machine for 12-phase pipeline
- **PhaseOrchestrator**: Individual phase execution coordinator
- **Database Repositories**:
  - WorkflowRepository (workflow runs, phases, agents, gates)
  - ArtifactRepository (artifact metadata)
  - AuditRepository (audit logs and events)

#### 2. Event Bus

Location: `packages/event-bus/`

- **NatsClient**: NATS Jetstream client with stream management
- **EventPublisher**: High-level event publishing API
- **Streams**:
  - WORKFLOWS: workflow lifecycle events
  - PHASES: phase execution events
  - AGENTS: agent execution and tool invocation events
  - GATES: quality gate evaluation events
  - TOOLS: tool execution events

#### 3. Database Schema

Location: `platform/database/init/01-schema.sql`

**Core Tables:**
- `workflow_runs`: Workflow execution state
- `phase_executions`: Phase execution tracking
- `agent_executions`: Agent execution tracking
- `artifacts`: Artifact metadata (content in MinIO)
- `gate_results`: Quality gate results
- `audit_log`: Immutable audit trail
- `events`: Event sourcing log
- `tools`: Tool registry with approval workflow
- `tool_invocations`: Tool execution tracking
- `users`: User management

## Development Workflow

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @ideamine/orchestrator-core test

# Run tests in watch mode
pnpm --filter @ideamine/orchestrator-core test:watch
```

### Linting and Type Checking

```bash
# Lint all packages
pnpm lint

# Type check all packages
pnpm typecheck

# Fix linting issues
pnpm lint:fix
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @ideamine/orchestrator-core build

# Clean all builds
pnpm clean
```

### Working with Docker Services

```bash
# Start all services
pnpm docker:up

# Stop all services
pnpm docker:down

# View logs
pnpm docker:logs

# View logs for specific service
docker logs -f ideamine-postgres
docker logs -f ideamine-nats

# Restart a service
docker restart ideamine-postgres

# Execute commands in a service
docker exec -it ideamine-postgres psql -U ideamine -d ideamine
docker exec -it ideamine-redis redis-cli
```

## Database Management

### Connecting to PostgreSQL

```bash
# Via Docker
docker exec -it ideamine-postgres psql -U ideamine -d ideamine

# Via local psql client
psql -h localhost -p 5432 -U ideamine -d ideamine
```

### Common Queries

```sql
-- View all workflow runs
SELECT id, state, user_id, created_at FROM workflow_runs ORDER BY created_at DESC LIMIT 10;

-- View phases for a workflow
SELECT phase_name, state, cost_usd, started_at, completed_at
FROM phase_executions
WHERE workflow_run_id = 'your-workflow-id'
ORDER BY id;

-- View artifacts for a workflow
SELECT type, phase, created_by, size_bytes, created_at
FROM artifacts
WHERE workflow_run_id = 'your-workflow-id';

-- View audit logs
SELECT timestamp, actor, action, resource_type
FROM audit_log
WHERE workflow_run_id = 'your-workflow-id'
ORDER BY timestamp DESC
LIMIT 20;

-- Get workflow statistics
SELECT state, COUNT(*) as count
FROM workflow_runs
GROUP BY state;
```

### Database Backups

```bash
# Backup database
docker exec ideamine-postgres pg_dump -U ideamine ideamine > backup.sql

# Restore database
docker exec -i ideamine-postgres psql -U ideamine ideamine < backup.sql
```

## Event Bus Management

### NATS CLI

```bash
# Install NATS CLI
brew install nats-io/nats-tools/nats  # macOS
# or download from: https://github.com/nats-io/natscli

# List streams
nats stream list --server localhost:4222

# View stream info
nats stream info WORKFLOWS --server localhost:4222

# View messages in a stream
nats stream view WORKFLOWS --server localhost:4222

# Publish a test message
nats pub workflow.test '{"test": "message"}' --server localhost:4222

# Subscribe to a subject
nats sub 'workflow.>' --server localhost:4222
```

## Observability

### Prometheus Queries

Access Prometheus at http://localhost:9090

Example queries:
```promql
# Workflow throughput (workflows/minute)
rate(workflow_created_total[5m]) * 60

# Average workflow duration
avg(workflow_duration_seconds)

# Phase execution time by phase
avg(phase_duration_seconds) by (phase)

# LLM cost per workflow
sum(agent_cost_usd) by (workflow_id)

# Gate pass rate
rate(gate_passed_total[1h]) / rate(gate_evaluated_total[1h])
```

### Grafana Dashboards

Access Grafana at http://localhost:3001 (admin/admin)

Pre-configured dashboards:
- **Workflow Overview**: Active workflows, throughput, success rate
- **Phase Performance**: Duration, cost, failure rate by phase
- **Agent Metrics**: LLM usage, cost, token consumption
- **Gate Metrics**: Pass rates, evaluation time, escalations
- **Infrastructure**: Database, Redis, NATS health

### Distributed Tracing

Access Jaeger at http://localhost:16686

- View end-to-end workflow traces
- Inspect phase and agent execution spans
- Analyze performance bottlenecks
- Debug failures with full context

## Troubleshooting

### Docker Services Won't Start

```bash
# Check if ports are already in use
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :4222  # NATS

# Kill conflicting processes or change ports in docker-compose.yml

# Remove old containers and volumes
docker-compose down -v
pnpm docker:up
```

### Database Connection Errors

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check PostgreSQL logs
docker logs ideamine-postgres

# Verify credentials in .env match docker-compose.yml

# Test connection
docker exec ideamine-postgres psql -U ideamine -d ideamine -c "SELECT 1"
```

### NATS Connection Issues

```bash
# Check if NATS is running
docker ps | grep nats

# Check NATS logs
docker logs ideamine-nats

# Verify NATS is listening
curl http://localhost:8222/healthz

# Check NATS info
curl http://localhost:8222/varz | jq
```

### Build Errors

```bash
# Clear all builds
pnpm clean

# Clear pnpm cache
pnpm store prune

# Reinstall dependencies
rm -rf node_modules
pnpm install

# Rebuild
pnpm build
```

### API Key Issues

```bash
# Verify .env file exists
ls -la .env

# Check environment variables are loaded
echo $ANTHROPIC_API_KEY
echo $OPENAI_API_KEY

# Restart services after changing .env
pnpm docker:down
pnpm docker:up
```

## Next Steps

### Creating Your First Workflow

See `docs/EXAMPLES.md` for complete examples of:
- Submitting an idea via API
- Monitoring workflow progress
- Accessing generated artifacts
- Interacting with the admin console

### Implementing Custom Agents

See `docs/AGENT_SDK.md` for:
- Analyzer-inside-Agent pattern
- Tool integration
- Value-of-Information scoring
- Agent testing and debugging

### Adding Custom Tools

See `docs/TOOL_SDK.md` for:
- Tool interface specification
- Sandboxed execution
- Tool approval workflow
- Tool registry integration

### Deploying to Production

See `docs/DEPLOYMENT.md` for:
- Kubernetes deployment
- Scaling configuration
- Security hardening
- Monitoring and alerting
- Backup and disaster recovery

## Support

- **Documentation**: `/docs` directory
- **Issues**: GitHub Issues (when repository is public)
- **Architecture Decisions**: `docs/ADR/` directory

## License

[License TBD]
