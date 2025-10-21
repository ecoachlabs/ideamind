#!/bin/bash

# Apply Performance Indexes to Database
# This script applies all performance optimization indexes to the IdeaMine database

set -e  # Exit on error

echo "================================================"
echo "IdeaMine Database Index Migration"
echo "================================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    echo ""
    echo "Please set DATABASE_URL before running this script:"
    echo "  export DATABASE_URL=postgresql://user:password@localhost:5432/ideamine"
    echo ""
    echo "Or run with inline environment variable:"
    echo "  DATABASE_URL=postgresql://... ./scripts/apply-indexes.sh"
    echo ""
    exit 1
fi

echo "✓ DATABASE_URL is set"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ ERROR: psql command not found"
    echo ""
    echo "Please install PostgreSQL client tools:"
    echo "  - macOS: brew install postgresql"
    echo "  - Ubuntu/Debian: sudo apt-get install postgresql-client"
    echo "  - Windows: Install from https://www.postgresql.org/download/windows/"
    echo ""
    exit 1
fi

echo "✓ psql is available"
echo ""

# Test database connection
echo "Testing database connection..."
if ! psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "❌ ERROR: Cannot connect to database"
    echo ""
    echo "Please check:"
    echo "  1. Database is running"
    echo "  2. DATABASE_URL is correct"
    echo "  3. Network connectivity"
    echo ""
    exit 1
fi

echo "✓ Database connection successful"
echo ""

# Confirm before applying
echo "This will create 40+ indexes on your database."
echo "Estimated time: 1-5 minutes depending on data size"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Migration cancelled."
    exit 0
fi

echo ""
echo "Applying indexes..."
echo ""

# Apply the migration
MIGRATION_FILE="packages/orchestrator-core/migrations/001_performance_indexes.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ ERROR: Migration file not found: $MIGRATION_FILE"
    exit 1
fi

# Run migration with output
psql "$DATABASE_URL" -f "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "================================================"
    echo "✅ Migration completed successfully!"
    echo "================================================"
    echo ""
    echo "Indexes applied:"
    echo "  - workflow_runs: 3 indexes"
    echo "  - phase_executions: 2 indexes"
    echo "  - agent_executions: 2 indexes"
    echo "  - gate_results: 2 indexes"
    echo "  - artifacts: 3 indexes"
    echo "  - audit_log: 3 indexes"
    echo "  - events: 3 indexes"
    echo "  - questions: 4 indexes"
    echo "  - answers: 1 index"
    echo "  - bindings: 2 indexes"
    echo "  - km_nodes: 2 indexes"
    echo "  - km_edges: 1 index"
    echo "  - km_conflicts: 1 index"
    echo "  - refinery tables: 4 indexes"
    echo ""
    echo "Expected performance improvement: 10-100x faster queries"
    echo ""
else
    echo ""
    echo "❌ Migration failed. Check error messages above."
    exit 1
fi
