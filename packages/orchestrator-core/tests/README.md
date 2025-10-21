# Knowledge Map Testing Guide

## Overview

This directory contains integration tests for the Knowledge Map system, including:
- Carry-over logic (cross-phase question propagation)
- Contradiction detection (conflict identification)
- Management tools (query, supersede, resolve)

## Prerequisites

### 1. PostgreSQL Database

You need a PostgreSQL database with the Knowledge Map schema. The tests use a separate test database to avoid affecting production data.

**Create test database**:
```bash
# Create database
createdb ideamine_test

# Run schema migrations
psql ideamine_test -f ../../tool-sdk/src/db/knowledge-map-schema.sql
psql ideamine_test -f ../../tool-sdk/src/db/knowledge-map-refinery-extensions.sql

# Optional: Enable pg_trgm extension for fuzzy matching
psql ideamine_test -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

### 2. Environment Variables

Set the test database URL:

```bash
export TEST_DATABASE_URL="postgresql://localhost:5432/ideamine_test"
```

**Optional**: Enable debug logging:
```bash
export DEBUG=true
```

### 3. Install Dependencies

From the orchestrator-core package directory:

```bash
npm install
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Integration Tests Only

```bash
npm run test:integration
```

### Run with Coverage

```bash
npm run test:coverage
```

### Watch Mode (for development)

```bash
npm run test:watch
```

### Run Specific Test Suite

```bash
npm test -- knowledge-map-integration
```

### Run with Debug Logging

```bash
DEBUG=true npm test
```

## Test Structure

```
tests/
├── setup.ts                          # Global test setup
├── integration/
│   └── knowledge-map-integration.test.ts  # Full KM pipeline tests
└── README.md                         # This file
```

## Test Suites

### 1. Carry-Over Logic Tests

Tests question propagation across phases:
- ✅ Load unresolved questions from previous phases
- ✅ Update question statuses based on answer acceptance
- ✅ Mark questions as carried over with edge tracking

### 2. Contradiction Detection Tests

Tests conflict identification:
- ✅ Detect numeric value conflicts
- ✅ Return consistency score (0.0 or 1.0)
- ✅ Provide detailed conflict descriptions

### 3. KM Query Tool Tests

Tests knowledge search and retrieval:
- ✅ Query by text search (question/answer/tags)
- ✅ Get unresolved questions by phase
- ✅ Query specific questions by ID

### 4. KM Supersede Tool Tests

Tests knowledge supersession:
- ✅ Mark old node as superseded by new node
- ✅ Track supersession history (recursive chain)
- ✅ Maintain edge relationships

### 5. KM Resolve Tool Tests

Tests contradiction resolution:
- ✅ Resolve conflicts by choosing correct answer
- ✅ Reject conflicting answers
- ✅ Update question status to 'resolved'
- ✅ Get all conflicts in Knowledge Map

## Test Data Cleanup

Tests automatically clean up test data before and after each run. Test data is identified by:
- IDs starting with `TEST-`
- IDs starting with `Q-IDEATION-` or `Q-PRD-`
- Run IDs matching test patterns

If tests fail and leave data behind, you can manually clean up:

```sql
-- Clean up test data
DELETE FROM km_edges WHERE id LIKE 'EDGE-%' OR id LIKE '%TEST%';
DELETE FROM km_nodes WHERE id LIKE 'KM-%' OR id LIKE '%TEST%';
DELETE FROM bindings WHERE question_id LIKE '%TEST%' OR question_id LIKE 'Q-%';
DELETE FROM answers WHERE question_id LIKE '%TEST%' OR question_id LIKE 'Q-%';
DELETE FROM questions WHERE id LIKE '%TEST%' OR id LIKE 'Q-%';
```

## Troubleshooting

### Database Connection Errors

**Error**: `Connection refused` or `database does not exist`

**Solution**:
1. Ensure PostgreSQL is running: `pg_isready`
2. Check database exists: `psql -l | grep ideamine_test`
3. Verify connection string is correct

### Schema Errors

**Error**: `relation "questions" does not exist`

**Solution**: Run schema migrations (see Prerequisites above)

### Timeout Errors

**Error**: `Exceeded timeout of 30000 ms`

**Solution**:
1. Check database performance (slow queries)
2. Ensure test database is not under heavy load
3. Increase timeout in `jest.config.js` if needed

### Import/Module Errors

**Error**: `Cannot find module '@ideamine/tool-sdk'`

**Solution**:
1. Run `npm install` in orchestrator-core
2. Build dependencies: `cd ../tool-sdk && npm run build`
3. Check `moduleNameMapper` in `jest.config.js`

## Performance

**Typical test duration**:
- Full suite: ~15-30 seconds
- Individual test suite: ~5-10 seconds

**Database requirements**:
- Storage: ~50MB for test data
- Connections: 1-5 concurrent connections
- Performance: Should run on any modern PostgreSQL instance

## Continuous Integration

For CI/CD pipelines, use:

```bash
# Install dependencies
npm ci

# Run tests with coverage
npm run test:coverage

# Check coverage thresholds (70% lines, 65% functions)
```

**Example GitHub Actions workflow**:

```yaml
name: Knowledge Map Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: ideamine_test
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run migrations
        run: |
          psql -h localhost -U postgres ideamine_test -f ../../tool-sdk/src/db/knowledge-map-schema.sql
          psql -h localhost -U postgres ideamine_test -f ../../tool-sdk/src/db/knowledge-map-refinery-extensions.sql
        env:
          PGPASSWORD: postgres

      - name: Run tests
        run: npm run test:coverage
        env:
          TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/ideamine_test
```

## Writing New Tests

To add new tests, follow this structure:

```typescript
describe('Feature Name', () => {
  beforeAll(async () => {
    // Setup test data
  });

  afterAll(async () => {
    // Cleanup test data
  });

  it('should do something', async () => {
    // Arrange
    const testData = createTestData();

    // Act
    const result = await systemUnderTest.execute(testData);

    // Assert
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });
});
```

## Coverage Goals

Current coverage thresholds:
- **Branches**: 60%
- **Functions**: 65%
- **Lines**: 70%
- **Statements**: 70%

To view detailed coverage report:

```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

## Support

For issues or questions:
1. Check the main documentation: `/KNOWLEDGE_MAP_FEATURES_SUMMARY.md`
2. Review test failures for specific error messages
3. Enable debug logging: `DEBUG=true npm test`
4. Check database logs for connection/query issues
