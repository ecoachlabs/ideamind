# IdeaMine Quick Reference Guide

Quick reference for common development tasks.

## Quick Commands

```bash
# Installation
pnpm install

# Start infrastructure
pnpm docker:up

# Build all packages
pnpm build

# Start development
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Stop infrastructure
pnpm docker:down
```

## Database Quick Access

```bash
# Connect to PostgreSQL
docker exec -it ideamine-postgres psql -U ideamine -d ideamine

# Common queries
SELECT id, state, created_at FROM workflow_runs ORDER BY created_at DESC LIMIT 10;
SELECT * FROM phase_executions WHERE workflow_run_id = 'YOUR_ID';
SELECT * FROM artifacts WHERE workflow_run_id = 'YOUR_ID';
```

## NATS Quick Access

```bash
# List streams
nats stream list --server localhost:4222

# View stream
nats stream info WORKFLOWS --server localhost:4222

# Subscribe to events
nats sub 'workflow.>' --server localhost:4222
```

## Service URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| Grafana | http://localhost:3001 | admin/admin |
| MinIO | http://localhost:9001 | minioadmin/minioadmin |
| Prometheus | http://localhost:9090 | - |
| Jaeger | http://localhost:16686 | - |
| NATS Monitor | http://localhost:8222 | - |

## Key File Locations

```
Orchestrator:    packages/orchestrator-core/src/langgraph-orchestrator.ts
Database:        packages/orchestrator-core/src/database/
Event Bus:       packages/event-bus/src/nats-client.ts
DB Schema:       platform/database/init/01-schema.sql
Docker Compose:  docker-compose.yml
Environment:     .env
```

## Common Tasks

### Create a New Package

```bash
mkdir -p packages/my-package/src
cd packages/my-package

# Create package.json
cat > package.json <<EOF
{
  "name": "@ideamine/my-package",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  }
}
EOF

# Create tsconfig.json
cat > tsconfig.json <<EOF
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# Create index.ts
echo "export const hello = 'world';" > src/index.ts

# Install and build
cd ../..
pnpm install
pnpm build
```

### Add a New Service

```bash
mkdir -p services/my-service/src
cd services/my-service

# Use similar package.json structure as packages
# Add Fastify dependencies if HTTP service
pnpm add fastify @fastify/cors

# Build and run
pnpm build
pnpm dev
```

### Debug a Workflow

```bash
# 1. Get workflow ID from database
docker exec -it ideamine-postgres psql -U ideamine -d ideamine -c \
  "SELECT id, state FROM workflow_runs ORDER BY created_at DESC LIMIT 5;"

# 2. Get audit trail
docker exec -it ideamine-postgres psql -U ideamine -d ideamine -c \
  "SELECT timestamp, actor, action FROM audit_log WHERE workflow_run_id = 'ID' ORDER BY timestamp;"

# 3. View events in NATS
nats stream view WORKFLOWS --server localhost:4222

# 4. Check Jaeger trace
# Open http://localhost:16686 and search for workflow ID
```

## Troubleshooting

### Database won't start
```bash
docker-compose down -v
pnpm docker:up
```

### Build errors
```bash
pnpm clean
rm -rf node_modules
pnpm install
pnpm build
```

### Type errors
```bash
pnpm typecheck
# Fix errors in reported files
```

## Environment Variables

Required:
- `ANTHROPIC_API_KEY` - Claude API key
- `OPENAI_API_KEY` - OpenAI API key

Optional (have defaults):
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `NATS_SERVERS`
- `REDIS_URL`
- `MINIO_*` variables

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes, commit
git add .
git commit -m "Add my feature"

# Push and create PR
git push -u origin feature/my-feature
```

## Production Deployment

See `docs/DEPLOYMENT.md` for full guide.

Quick checklist:
- [ ] Set production environment variables
- [ ] Use managed PostgreSQL (not Docker)
- [ ] Use Redis cluster
- [ ] Use NATS cluster
- [ ] Configure TLS certificates
- [ ] Set up monitoring alerts
- [ ] Configure backups
- [ ] Test disaster recovery
