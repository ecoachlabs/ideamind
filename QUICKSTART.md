# IdeaMine Orchestrator - Quick Start Guide

**Get from zero to first production run in under 30 minutes!**

---

## Prerequisites

Ensure you have installed:
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Docker (for Jaeger and workers)

---

## Step 1: Install Dependencies (5 minutes)

**Note:** This project uses `pnpm` as the package manager.

```bash
# Install pnpm if not already installed
npm install -g pnpm

# Install all workspace dependencies (from root directory)
pnpm install

# This will install all dependencies for all packages including:
# - OpenTelemetry packages for tracing
# - PostgreSQL client (pg)
# - Redis client (ioredis)
# - All other orchestrator dependencies
```

---

## Step 2: Database Setup (5 minutes)

### Create Database

```bash
# Create database
createdb ideamine

# Set environment variable
export DATABASE_URL="postgresql://localhost:5432/ideamine"
```

### Run All Migrations

```bash
# Run migrations in order
psql $DATABASE_URL -f migrations/008_foundation_tables.sql
psql $DATABASE_URL -f migrations/009_execution_tables.sql
psql $DATABASE_URL -f migrations/010_observability_tables.sql
psql $DATABASE_URL -f migrations/011_knowledge_refinery.sql
psql $DATABASE_URL -f migrations/012_clarification_loops.sql
psql $DATABASE_URL -f migrations/013_optional_tables.sql

# Or use the pnpm script
cd packages/orchestrator-core
pnpm run db:migrate
cd ../..
```

### Verify Tables

```bash
psql $DATABASE_URL -c "\dt"
```

You should see 15 tables:
- workflow_runs, phases, tasks, checkpoints, events, timers
- assumptions, evidence_packs, ledger, phase_metrics
- knowledge_refinery, clarification_loops
- waivers, release_dossiers
- artifacts

---

## Step 3: Start Required Services (5 minutes)

### Start Redis

```bash
# Using Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Or using local Redis
redis-server
```

### Start Jaeger (for tracing)

```bash
# Start Jaeger all-in-one
cd packages/orchestrator-core
pnpm run jaeger:start

# Access Jaeger UI at http://localhost:16686
```

### Verify Services

```bash
# Check Redis
redis-cli ping
# Should return: PONG

# Check Jaeger
curl http://localhost:14268/api/traces
# Should return: (empty response is OK)
```

---

## Step 4: Configure Environment (2 minutes)

Create `.env` file in root:

```bash
cat > .env << 'EOF'
# Database
DATABASE_URL=postgresql://localhost:5432/ideamine

# Redis
REDIS_URL=redis://localhost:6379

# Anthropic API
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# OpenTelemetry
JAEGER_ENDPOINT=http://localhost:14268/api/traces
OTEL_SERVICE_NAME=ideamine-orchestrator

# Node Environment
NODE_ENV=development

# API Configuration (if using API layer)
PORT=9002
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
EOF
```

**Important:** Replace `your_anthropic_api_key_here` with your actual Anthropic API key.

---

## Step 5: Build Project (3 minutes)

```bash
# Build all packages (from root)
pnpm run build

# Or build specific packages
cd packages/orchestrator-core && pnpm run build
cd ../api && pnpm run build
cd ../..
```

---

## Step 6: Run Tests (5 minutes)

### Unit Tests

```bash
cd packages/orchestrator-core
pnpm test
```

### Integration Tests

```bash
pnpm run test:integration
```

### Acceptance Tests (10 criteria)

```bash
pnpm run test:acceptance
```

All tests should pass ✅

---

## Step 7: First Orchestration Run (5 minutes)

Create a simple test script:

```typescript
// test-run.ts
import { EnhancedOrchestrator } from './packages/orchestrator-core/src/enhanced-orchestrator';
import { initializeTracer } from './packages/orchestrator-core/src/tracing';
import { Pool } from 'pg';

async function main() {
  // Initialize tracing
  initializeTracer({
    serviceName: 'ideamine-orchestrator',
    jaegerEndpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    environment: 'development',
  });

  // Initialize database
  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // Initialize orchestrator
  const orchestrator = new EnhancedOrchestrator({
    db,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  });

  console.log('🚀 Starting orchestration run...\n');

  // Execute orchestration
  const result = await orchestrator.execute({
    runId: `test_run_${Date.now()}`,
    idea: {
      name: 'Simple Todo App',
      description: 'A basic todo list application for personal task management',
      category: 'productivity',
    },
    phases: ['intake', 'ideation'],
    budgets: {
      tokens: 100000,
      tools_minutes: 60,
    },
  });

  console.log('\n✅ Orchestration complete!');
  console.log('Status:', result.status);
  console.log('Duration:', result.duration_ms, 'ms');
  console.log('Phases completed:', result.phases_completed);
  console.log('Total cost:', result.total_cost_usd);

  // View traces in Jaeger
  console.log('\n📊 View traces at: http://localhost:16686');

  await db.end();
}

main().catch(console.error);
```

Run it:

```bash
ts-node test-run.ts
```

---

## Step 8: View Results (2 minutes)

### Check Database

```bash
# View runs
psql $DATABASE_URL -c "SELECT id, status, created_at FROM workflow_runs ORDER BY created_at DESC LIMIT 5;"

# View phases
psql $DATABASE_URL -c "SELECT phase_id, status, started_at FROM phases ORDER BY started_at DESC LIMIT 10;"

# View metrics
psql $DATABASE_URL -c "SELECT * FROM phase_metrics ORDER BY created_at DESC LIMIT 5;"
```

### Check Jaeger Traces

1. Open http://localhost:16686
2. Select service: `ideamine-orchestrator`
3. Click "Find Traces"
4. Click on your run to see distributed trace

### Check Ledger

```bash
psql $DATABASE_URL -c "SELECT type, timestamp FROM ledger WHERE run_id = 'YOUR_RUN_ID' ORDER BY timestamp;"
```

---

## Optional: Start API Server

If you want to use the REST API:

```bash
cd packages/api

# Create .env
cat > .env << 'EOF'
PORT=9002
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000
DATABASE_URL=postgresql://localhost:5432/ideamine
ANTHROPIC_API_KEY=your_anthropic_api_key_here
JWT_SECRET=your_jwt_secret_here
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF

# Build and start
pnpm run build
pnpm start
```

Test API:

```bash
# Health check
curl http://localhost:9002/api/health

# List agents
curl http://localhost:9002/api/agents

# Create run
curl -X POST http://localhost:9002/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "runId": "api_test_001",
    "phases": ["intake"],
    "initialContext": {
      "idea": {
        "name": "Test App",
        "description": "Testing via API"
      }
    }
  }'
```

---

## Performance Testing

### Throughput Test

```bash
cd packages/orchestrator-core
pnpm run test:performance
```

Expected results:
- 1 worker: ~10 tasks/sec
- 10 workers: ~80 tasks/sec
- 50 workers: ~300 tasks/sec

### Soak Test (24 hours)

```bash
pnpm run test:soak
```

This will run continuously for 24 hours. You can stop anytime with Ctrl+C.

### Chaos Test

```bash
pnpm run test:chaos
```

Randomly kills worker containers to test resilience.

---

## Troubleshooting

### Database Connection Failed

```bash
# Check PostgreSQL is running
pg_isready

# Check DATABASE_URL is correct
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1;"
```

### Redis Connection Failed

```bash
# Check Redis is running
redis-cli ping

# Check REDIS_URL
echo $REDIS_URL
```

### Jaeger Not Showing Traces

```bash
# Check Jaeger is running
docker ps | grep jaeger

# Check logs
pnpm run jaeger:logs

# Restart Jaeger
pnpm run jaeger:stop
pnpm run jaeger:start
```

### API Key Invalid

```bash
# Verify API key is set
echo $ANTHROPIC_API_KEY

# Test API key
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
```

---

## Common Commands

```bash
# Development
pnpm run dev                    # Watch mode for all packages
pnpm run build                  # Build all packages
pnpm run typecheck              # Type checking

# Testing
pnpm test                       # Unit tests
pnpm run test:integration       # Integration tests
pnpm run test:acceptance        # Acceptance tests
pnpm run test:coverage          # Coverage report
pnpm run test:performance       # Performance benchmarks
pnpm run test:soak             # 24-hour soak test
pnpm run test:chaos            # Chaos engineering tests

# Database
pnpm run db:migrate            # Run latest migration
psql $DATABASE_URL -f migrations/XXX.sql  # Run specific migration

# Monitoring
pnpm run jaeger:start          # Start Jaeger
pnpm run jaeger:stop           # Stop Jaeger
pnpm run jaeger:logs           # View Jaeger logs

# Cleanup
docker stop redis jaeger      # Stop services
docker rm redis jaeger        # Remove containers
dropdb ideamine              # Drop database (CAUTION!)
```

---

## Production Deployment

### Environment Variables

Set these in production:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://prod-host:5432/ideamine
REDIS_URL=redis://prod-host:6379
ANTHROPIC_API_KEY=sk-ant-...
JAEGER_ENDPOINT=http://jaeger:14268/api/traces
OTEL_SERVICE_NAME=ideamine-orchestrator

# API (if using)
PORT=9002
JWT_SECRET=<strong-random-secret>
RATE_LIMIT_MAX_REQUESTS=1000
```

### Docker Deployment

```bash
# Build orchestrator image
docker build -f docker/Dockerfile.orchestrator -t ideamine-orchestrator .

# Build worker image
docker build -f docker/Dockerfile.worker -t ideamine-worker .

# Build API image
docker build -f docker/Dockerfile.api -t ideamine-api .

# Run with docker-compose
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Kubernetes Deployment

```bash
# Apply configurations
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/orchestrator.yaml
kubectl apply -f k8s/worker.yaml
kubectl apply -f k8s/api.yaml

# Check status
kubectl get pods -n ideamine
```

---

## Next Steps

1. **Read the Documentation**
   - `GAP_ANALYSIS.md` - Detailed system analysis
   - `API_LAYER_SESSION.md` - API documentation
   - `FINAL_IMPLEMENTATION_COMPLETE.md` - Complete feature list

2. **Explore Test Fixtures**
   - `tests/fixtures/demo-ideas.json` - Sample ideas
   - `tests/fixtures/mock-responses.json` - Mock data

3. **Run Example Orchestrations**
   - Simple: Todo app
   - Medium: IoT dashboard
   - Complex: E-commerce marketplace
   - Very complex: AI healthcare platform

4. **Monitor Your System**
   - Jaeger: http://localhost:16686 - Distributed tracing
   - Grafana: Set up dashboards for metrics
   - Database: Query phase_metrics table

5. **Scale Your Deployment**
   - Add more workers
   - Enable horizontal pod autoscaling
   - Set up read replicas for database

---

## Getting Help

- **Documentation**: Check `/docs` folder
- **Examples**: See `tests/fixtures/` for sample data
- **Issues**: Create issue with logs and configuration
- **Logs**: Check `pino` logs for detailed debugging

---

## Success Checklist

- [ ] PostgreSQL 15 tables created
- [ ] Redis connected
- [ ] Jaeger running
- [ ] Environment variables set
- [ ] Dependencies installed
- [ ] Project built successfully
- [ ] Unit tests passing
- [ ] First orchestration run completed
- [ ] Traces visible in Jaeger
- [ ] API responding (if using)

**If all checked, you're ready for production! 🚀**

---

**Estimated time:** 30 minutes
**Difficulty:** Intermediate
**Status:** Production Ready ✅
