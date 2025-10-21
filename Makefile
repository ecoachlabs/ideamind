# IdeaMine Development Makefile

.PHONY: help install build dev test lint clean docker-up docker-down docker-logs setup

# Default target
help:
	@echo "IdeaMine Development Commands:"
	@echo ""
	@echo "  make setup        - Complete project setup (install + docker + build)"
	@echo "  make install      - Install dependencies"
	@echo "  make build        - Build all packages"
	@echo "  make dev          - Run development mode with hot reload"
	@echo "  make test         - Run tests"
	@echo "  make lint         - Run linter"
	@echo "  make typecheck    - Run TypeScript type checking"
	@echo "  make clean        - Clean build artifacts"
	@echo "  make docker-up    - Start infrastructure services"
	@echo "  make docker-down  - Stop infrastructure services"
	@echo "  make docker-logs  - View infrastructure logs"
	@echo ""

# Complete setup
setup: install docker-up build
	@echo "✅ Setup complete! Run 'make dev' to start development."

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	pnpm install

# Build all packages
build:
	@echo "🔨 Building packages..."
	pnpm build

# Development mode
dev:
	@echo "🚀 Starting development mode..."
	pnpm dev

# Run tests
test:
	@echo "🧪 Running tests..."
	pnpm test

# Lint code
lint:
	@echo "🔍 Linting code..."
	pnpm lint

# Type check
typecheck:
	@echo "📝 Type checking..."
	pnpm typecheck

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	pnpm clean

# Start Docker infrastructure
docker-up:
	@echo "🐳 Starting infrastructure services..."
	docker-compose up -d
	@echo "⏳ Waiting for services to be healthy..."
	@sleep 5
	@echo "✅ Services started:"
	@echo "  - PostgreSQL: localhost:5432"
	@echo "  - NATS: localhost:4222"
	@echo "  - Qdrant: localhost:6333"
	@echo "  - MinIO: localhost:9000 (console: 9001)"
	@echo "  - Redis: localhost:6379"
	@echo "  - Vault: localhost:8200"
	@echo "  - Prometheus: localhost:9090"
	@echo "  - Grafana: localhost:3001 (admin/admin)"
	@echo "  - Jaeger: localhost:16686"

# Stop Docker infrastructure
docker-down:
	@echo "🛑 Stopping infrastructure services..."
	docker-compose down

# View Docker logs
docker-logs:
	@echo "📋 Viewing infrastructure logs..."
	docker-compose logs -f

# Initialize database
db-init:
	@echo "💾 Initializing database..."
	docker-compose exec postgres psql -U ideamine -d ideamine -f /docker-entrypoint-initdb.d/01-schema.sql

# Database migrations
db-migrate:
	@echo "🔄 Running database migrations..."
	# TODO: Add migration command when migration tool is configured

# Run intake agent example
run-intake:
	@echo "🤖 Running intake agent example..."
	cd services/intake && pnpm start

# Run full workflow example
run-workflow:
	@echo "🔄 Running full workflow example..."
	# TODO: Add workflow runner command

# Format code
format:
	@echo "✨ Formatting code..."
	pnpm exec prettier --write .

# Security audit
audit:
	@echo "🔒 Running security audit..."
	pnpm audit

# Update dependencies
update-deps:
	@echo "⬆️  Updating dependencies..."
	pnpm update --latest

# Generate documentation
docs:
	@echo "📚 Generating documentation..."
	# TODO: Add documentation generation command

# Check health of infrastructure
health-check:
	@echo "🏥 Checking infrastructure health..."
	@curl -s http://localhost:5432 > /dev/null && echo "✅ PostgreSQL: OK" || echo "❌ PostgreSQL: DOWN"
	@curl -s http://localhost:8222/healthz > /dev/null && echo "✅ NATS: OK" || echo "❌ NATS: DOWN"
	@curl -s http://localhost:6333/healthz > /dev/null && echo "✅ Qdrant: OK" || echo "❌ Qdrant: DOWN"
	@curl -s http://localhost:9000/minio/health/live > /dev/null && echo "✅ MinIO: OK" || echo "❌ MinIO: DOWN"
	@curl -s http://localhost:6379 > /dev/null && echo "✅ Redis: OK" || echo "❌ Redis: DOWN"
	@curl -s http://localhost:9090/-/healthy > /dev/null && echo "✅ Prometheus: OK" || echo "❌ Prometheus: DOWN"
	@curl -s http://localhost:3001/api/health > /dev/null && echo "✅ Grafana: OK" || echo "❌ Grafana: DOWN"
