# Knowledge Map - Deployment Guide

## Pre-Deployment Checklist

### ✅ 1. Database Setup

- [ ] PostgreSQL 12+ installed and running
- [ ] Database created: `ideamine` (production) or `ideamine_test` (testing)
- [ ] Core schema applied: `knowledge-map-schema.sql`
- [ ] Refinery extensions applied: `knowledge-map-refinery-extensions.sql`
- [ ] Optional: pg_trgm extension enabled for fuzzy matching

**Commands**:
```bash
# Create database
createdb ideamine

# Apply schemas
psql ideamine -f packages/tool-sdk/src/db/knowledge-map-schema.sql
psql ideamine -f packages/tool-sdk/src/db/knowledge-map-refinery-extensions.sql

# Enable pg_trgm (optional, for fuzzy duplicate detection)
psql ideamine -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# Verify tables
psql ideamine -c "\dt"
# Should see: questions, answers, bindings, km_nodes, km_edges, refinery_runs, etc.
```

### ✅ 2. Dependencies Installed

- [ ] Node.js 18+ installed
- [ ] All workspace packages built
- [ ] Environment variables configured

**Commands**:
```bash
# Install dependencies
npm install

# Build workspace packages
npm run build --workspaces

# Verify Knowledge Map module
cd packages/orchestrator-core
npm run build
```

### ✅ 3. Environment Configuration

- [ ] `DATABASE_URL` set (production database)
- [ ] `TEST_DATABASE_URL` set (test database)
- [ ] `OPENAI_API_KEY` set (for contradiction detection)
- [ ] `ANTHROPIC_API_KEY` set (for LLM providers)

**Example `.env` file**:
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ideamine
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/ideamine_test

# LLM Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional
NODE_ENV=production
LOG_LEVEL=info
```

### ✅ 4. Run Tests

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Coverage thresholds met (70% lines, 65% functions)

**Commands**:
```bash
cd packages/orchestrator-core

# Run all tests
npm test

# Run integration tests specifically
npm run test:integration

# Check coverage
npm run test:coverage
```

## Deployment Steps

### Step 1: Database Migration

Run the migration script in production:

```bash
# Backup existing database first!
pg_dump ideamine > backup_$(date +%Y%m%d_%H%M%S).sql

# Apply migrations
psql $DATABASE_URL -f packages/tool-sdk/src/db/knowledge-map-schema.sql
psql $DATABASE_URL -f packages/tool-sdk/src/db/knowledge-map-refinery-extensions.sql

# Verify migration
psql $DATABASE_URL -c "SELECT COUNT(*) FROM questions;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM km_nodes;"
```

### Step 2: Deploy Application Code

**Option A: Build and Deploy Manually**

```bash
# Build all packages
npm run build --workspaces

# Deploy build artifacts
rsync -av packages/orchestrator-core/dist/ production:/app/orchestrator-core/
rsync -av packages/agent-sdk/dist/ production:/app/agent-sdk/
rsync -av packages/tool-sdk/dist/ production:/app/tool-sdk/
```

**Option B: Docker Deployment**

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy workspace files
COPY package*.json ./
COPY packages/ ./packages/

# Install dependencies
RUN npm ci --production

# Build
RUN npm run build --workspaces

# Start application
CMD ["node", "packages/orchestrator-core/dist/index.js"]
```

```bash
# Build image
docker build -t ideamine-orchestrator:latest .

# Run container
docker run -d \
  --name ideamine-orchestrator \
  -e DATABASE_URL=$DATABASE_URL \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  ideamine-orchestrator:latest
```

### Step 3: Enable Knowledge Map in Coordinators

Update your phase coordinators to enable Knowledge Map:

**Before**:
```typescript
const prdCoordinator = new PRDCoordinator({
  agents: [...],
});
```

**After**:
```typescript
import { Pool } from 'pg';

const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const prdCoordinator = new PRDCoordinator({
  agents: [...],
  enableKnowledgeMap: true,   // ✅ Enable KM
  enableRefinery: true,        // ✅ Enable Refinery (optional)
  dbPool,                      // ✅ Required for carry-over + contradiction detection
  knowledgeMapConnectionString: process.env.DATABASE_URL,
});
```

### Step 4: Configure Monitoring

**Database Monitoring**:
```sql
-- Create monitoring views
CREATE OR REPLACE VIEW km_health AS
SELECT
  'questions' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE status = 'open') AS open_count,
  COUNT(*) FILTER (WHERE status = 'partial') AS partial_count,
  COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_count
FROM questions

UNION ALL

SELECT
  'km_nodes' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active = true) AS active_count,
  COUNT(*) FILTER (WHERE is_active = false) AS superseded_count,
  NULL
FROM km_nodes;

-- Check health
SELECT * FROM km_health;
```

**Application Logging**:
```typescript
// Add structured logging
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'km-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'km-combined.log' }),
  ],
});

// Log KM operations
logger.info('Knowledge Map generation started', {
  phase: 'PRD',
  runId: 'run-123',
  carryOverCount: 5,
});
```

### Step 5: Verify Deployment

**Smoke Tests**:

```bash
# 1. Check database connectivity
psql $DATABASE_URL -c "SELECT 1;"

# 2. Check table counts
psql $DATABASE_URL -c "SELECT COUNT(*) FROM questions;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM km_nodes;"

# 3. Run a simple query
psql $DATABASE_URL -c "SELECT * FROM km_health;"

# 4. Test coordinator
node -e "
const { PRDCoordinator } = require('./packages/orchestrator-core/dist');
const { Pool } = require('pg');

const dbPool = new Pool({ connectionString: process.env.DATABASE_URL });
const coordinator = new PRDCoordinator({
  enableKnowledgeMap: true,
  dbPool,
  knowledgeMapConnectionString: process.env.DATABASE_URL,
});

console.log('✅ Coordinator initialized successfully');
dbPool.end();
"
```

**Integration Test in Production** (using test database):

```bash
# Run against test database
TEST_DATABASE_URL=postgresql://localhost:5432/ideamine_test npm run test:integration

# Expected output:
# ✓ Carry-Over Logic (5 tests)
# ✓ Contradiction Detection (2 tests)
# ✓ KM Query Tool (2 tests)
# ✓ KM Supersede Tool (1 test)
# ✓ KM Resolve Tool (2 tests)
#
# Test Suites: 1 passed, 1 total
# Tests:       12 passed, 12 total
```

## Post-Deployment

### Monitoring Dashboard

Create a monitoring dashboard with these key metrics:

```sql
-- 1. Question Resolution Rate
SELECT
  phase,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'resolved') / COUNT(*), 2) AS resolution_rate_pct,
  COUNT(*) AS total_questions
FROM questions
GROUP BY phase
ORDER BY phase;

-- 2. Carry-Over Load
SELECT
  phase,
  COUNT(*) AS carry_over_count,
  AVG(priority) AS avg_priority,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400) AS avg_age_days
FROM questions
WHERE status IN ('open', 'partial')
GROUP BY phase
ORDER BY phase;

-- 3. Contradiction Detection Rate
SELECT
  phase,
  COUNT(*) AS total_validations,
  COUNT(*) FILTER (WHERE score_consistency = 0.0) AS conflicts_detected,
  ROUND(100.0 * COUNT(*) FILTER (WHERE score_consistency = 0.0) / COUNT(*), 2) AS conflict_rate_pct
FROM bindings
GROUP BY phase
ORDER BY phase;

-- 4. Knowledge Growth
SELECT
  DATE(created_at) AS date,
  COUNT(*) AS new_nodes
FROM km_nodes
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 5. Top Unresolved Questions
SELECT
  id,
  phase,
  text,
  priority,
  status,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400 AS age_days
FROM questions
WHERE status IN ('open', 'partial')
ORDER BY priority DESC, age_days DESC
LIMIT 20;
```

### Alerting

Set up alerts for:

1. **High Carry-Over Count**:
   - Alert if > 100 unresolved questions in any phase
   - Action: Review question generation and validation logic

2. **High Conflict Rate**:
   - Alert if contradiction rate > 10% in any phase
   - Action: Review existing KM for outdated knowledge

3. **Database Performance**:
   - Alert if query latency > 5s
   - Action: Add indexes, optimize queries, or scale database

4. **Connection Pool Exhaustion**:
   - Alert if pool connections > 80% utilized
   - Action: Increase pool size or investigate connection leaks

### Maintenance Tasks

**Daily**:
```bash
# Check for conflicts
psql $DATABASE_URL -c "
SELECT COUNT(*) AS conflict_count
FROM questions q
INNER JOIN bindings b ON q.id = b.question_id
WHERE b.decision = 'accept'
GROUP BY q.id
HAVING COUNT(DISTINCT b.answer_id) > 1;
"
```

**Weekly**:
```bash
# Vacuum and analyze
psql $DATABASE_URL -c "VACUUM ANALYZE questions;"
psql $DATABASE_URL -c "VACUUM ANALYZE answers;"
psql $DATABASE_URL -c "VACUUM ANALYZE bindings;"
psql $DATABASE_URL -c "VACUUM ANALYZE km_nodes;"

# Check index health
psql $DATABASE_URL -c "
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
"
```

**Monthly**:
```bash
# Archive old data (optional)
psql $DATABASE_URL -c "
INSERT INTO questions_archive
SELECT * FROM questions
WHERE created_at < NOW() - INTERVAL '90 days'
  AND status = 'resolved';

DELETE FROM questions
WHERE created_at < NOW() - INTERVAL '90 days'
  AND status = 'resolved';
"
```

## Rollback Plan

If issues occur after deployment:

### Option 1: Quick Rollback

```bash
# 1. Disable Knowledge Map in coordinators
# Set enableKnowledgeMap: false in config

# 2. Revert to previous application version
git revert <commit-hash>
npm run build --workspaces

# 3. Restart application
pm2 restart ideamine-orchestrator
```

### Option 2: Database Rollback

```bash
# 1. Stop application
pm2 stop ideamine-orchestrator

# 2. Restore database backup
psql -c "DROP DATABASE ideamine;"
psql -c "CREATE DATABASE ideamine;"
psql ideamine < backup_YYYYMMDD_HHMMSS.sql

# 3. Restart application
pm2 start ideamine-orchestrator
```

## Performance Tuning

### Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_questions_phase_status
  ON questions(phase, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_questions_priority
  ON questions(priority DESC)
  WHERE status IN ('open', 'partial');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bindings_decision
  ON bindings(decision)
  WHERE decision = 'accept';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_km_nodes_active
  ON km_nodes(is_active, created_at DESC)
  WHERE is_active = true;

-- Analyze query performance
EXPLAIN ANALYZE
SELECT * FROM questions
WHERE phase = 'PRD' AND status IN ('open', 'partial')
ORDER BY priority DESC
LIMIT 50;
```

### Connection Pool Tuning

```typescript
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Tune based on your workload
  max: 20,                      // Max connections (adjust based on load)
  min: 2,                       // Min idle connections
  idleTimeoutMillis: 30000,     // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Timeout for new connections

  // Health checks
  allowExitOnIdle: false,
  application_name: 'ideamine-orchestrator',
});

// Monitor pool health
dbPool.on('connect', (client) => {
  console.log('New database connection established');
});

dbPool.on('error', (err, client) => {
  console.error('Unexpected database error:', err);
});
```

## Security Considerations

1. **Database Access**:
   - Use separate database users for read/write operations
   - Restrict network access with firewall rules
   - Enable SSL for database connections

2. **API Keys**:
   - Store in secure key vault (AWS Secrets Manager, HashiCorp Vault)
   - Rotate keys regularly
   - Use environment-specific keys

3. **Connection Strings**:
   - Never commit connection strings to Git
   - Use environment variables or secret management
   - Encrypt backups

## Troubleshooting

### Issue: Slow Query Performance

**Symptoms**: Queries take > 5 seconds

**Diagnosis**:
```sql
-- Check slow queries
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**Solution**:
- Add missing indexes
- Optimize query filters
- Increase database resources

### Issue: Connection Pool Exhausted

**Symptoms**: `too many clients already` error

**Diagnosis**:
```sql
-- Check active connections
SELECT
  datname,
  usename,
  application_name,
  state,
  COUNT(*)
FROM pg_stat_activity
GROUP BY datname, usename, application_name, state;
```

**Solution**:
- Increase `max` in connection pool config
- Fix connection leaks (ensure `dbPool.end()` is called)
- Add connection limits per application

### Issue: High Carry-Over Count

**Symptoms**: > 100 unresolved questions carrying over

**Diagnosis**:
```sql
SELECT
  phase,
  COUNT(*) AS unresolved_count,
  AVG(priority) AS avg_priority
FROM questions
WHERE status IN ('open', 'partial')
GROUP BY phase
ORDER BY unresolved_count DESC;
```

**Solution**:
- Review question quality (are they too broad?)
- Improve answer coverage (run QAA agent more times)
- Lower validation thresholds temporarily
- Increase phase duration

## Support Contacts

- **Database Issues**: DBA team
- **Application Issues**: DevOps team
- **Knowledge Map Features**: See `/KNOWLEDGE_MAP_FEATURES_SUMMARY.md`
- **Integration Tests**: See `/packages/orchestrator-core/tests/README.md`

## Additional Resources

- [Knowledge Map Features Summary](/KNOWLEDGE_MAP_FEATURES_SUMMARY.md)
- [Knowledge Map Module README](/packages/orchestrator-core/src/knowledge-map/README.md)
- [Integration Tests Guide](/packages/orchestrator-core/tests/README.md)
- [Refinery Integration](/REFINERY_INTEGRATION_FIX.md)
- [Refinery Implementation](/REFINERY_IMPLEMENTATION_SUMMARY.md)

---

**Deployment Status**: ✅ Ready for Production

**Last Updated**: 2025-10-19
