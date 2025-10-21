# IdeaMine

IdeaMine is an autonomous software development platform that automates the complete lifecycle from idea submission to general availability deployment.

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker and Docker Compose
- Git

### Setup

1. **Clone the repository** (if using Git):
   ```bash
   git clone <repository-url>
   cd Ideamind
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Copy environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your API keys (OpenAI, Anthropic, etc.)

4. **Start infrastructure services**:
   ```bash
   pnpm docker:up
   ```

   This starts:
   - PostgreSQL (port 5432) - Workflow state database
   - NATS (port 4222) - Event bus
   - Qdrant (port 6333) - Vector database for RAG
   - MinIO (port 9000/9001) - S3-compatible artifact storage
   - Redis (port 6379) - Cache
   - Vault (port 8200) - Secrets management
   - Prometheus (port 9090) - Metrics
   - Grafana (port 3001) - Dashboards
   - Jaeger (port 16686) - Distributed tracing

5. **Build packages**:
   ```bash
   pnpm build
   ```

6. **Run tests**:
   ```bash
   pnpm test
   ```

### Development

Start development mode with hot reload:
```bash
pnpm dev
```

### Access Points

- **Grafana Dashboard**: http://localhost:3001 (admin/admin)
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)
- **Jaeger UI**: http://localhost:16686
- **Prometheus**: http://localhost:9090
- **NATS Monitoring**: http://localhost:8222

## Architecture

IdeaMine implements a **Nine "Doers" Architecture**:

1. **Orchestrators** - Plan and route work through the 12-phase pipeline
2. **Agents** - Think and decide using LLMs with Analyzer-inside-Agent pattern
3. **Tools** - Execute specialized tasks in sandboxed environments
4. **Executors** - Run tools safely in Docker/WASM containers
5. **Gatekeepers** - Enforce quality gates with evidence-based evaluation
6. **Triggers** - Start and resume workflows
7. **Supervisors** - Monitor health and handle failures
8. **Dispatchers** - Queue and route work
9. **Recorders** - Audit trail and event publishing

### Twelve-Phase Pipeline

1. **Intake** - Project spin-up and idea validation
2. **Ideation** - Deep strategy and competitive analysis
3. **Critique** - Red-team review (MANDATORY)
4. **PRD** - Product requirements document
5. **BizDev** - Business viability analysis (MANDATORY)
6. **Architecture** - System design and planning
7. **Build** - Repository and environment setup
8. **Story Loop** - Iterative code implementation
9. **QA** - Testing and reliability validation
10. **Aesthetic** - UI/UX polish (MANDATORY)
11. **Release** - Packaging and deployment
12. **Beta** - Distribution and telemetry
13. **Feedback** - User feedback processing
14. **GA** - General availability release

## Project Structure

```
ideamine/
├── docs/                    # Documentation
│   ├── PRD.md              # Product Requirements Document
│   ├── ARCHITECTURE.md     # System Architecture
│   └── IMPLEMENTATION_ROADMAP.md
├── packages/               # Shared packages
│   ├── agent-sdk/         # Analyzer-inside-Agent framework
│   ├── tool-sdk/          # Tool interface and registry client
│   ├── event-schemas/     # Event type definitions
│   ├── artifact-schemas/  # Artifact type definitions
│   └── orchestrator-core/ # Workflow engine core
├── apps/                  # Application services
│   ├── orchestrator/      # Main orchestration service
│   ├── api-gateway/       # Auth and routing
│   └── admin-console/     # Control plane UI
├── services/              # Phase-specific services
│   ├── intake/
│   ├── reasoning/
│   ├── prd/
│   └── ...
└── platform/              # Infrastructure
    ├── database/          # SQL schemas
    ├── event-bus/         # NATS configuration
    └── observability/     # Prometheus, Grafana
```

## Key Concepts

### Analyzer-inside-Agent Pattern

Every agent follows this execution pattern:

1. **Planner** - Draft execution plan
2. **Reasoning** - Initial attempt without tools
3. **Analyzer Loop** - Iteratively improve with tools
   - Calculate Value-of-Information (VoI) score
   - Invoke tool if VoI exceeds threshold
   - Verify if tool improved quality
   - Keep improvement or discard
4. **Recorder** - Publish events and audit trail

### Event-Driven Architecture

- All state changes published as events to NATS
- Event sourcing for workflow durability
- Pub/sub for loose coupling between services
- Replay events to rebuild state

### Stage Gates

Each phase can have quality gates that must pass:

- Evidence-based evaluation using rubrics
- Automated checks + optional human review
- Block workflow until gate passes
- Configurable pass/warn/fail thresholds

## Documentation

- [Product Requirements Document](docs/PRD.md)
- [System Architecture](docs/ARCHITECTURE.md)
- [Implementation Roadmap](docs/IMPLEMENTATION_ROADMAP.md)

## Development Workflow

1. Create feature branch
2. Make changes
3. Run tests: `pnpm test`
4. Run linter: `pnpm lint`
5. Build: `pnpm build`
6. Create pull request

## Monitoring

### Metrics

Key metrics tracked in Prometheus:

- Workflow success rate
- Average time per phase
- Cost per workflow
- Tool invocation counts
- Gate pass/fail rates

### Logging

- Structured JSON logs
- Correlation IDs for request tracing
- Log levels: error, warn, info, debug

### Tracing

- OpenTelemetry instrumentation
- Distributed tracing via Jaeger
- End-to-end workflow visibility

## Security

- Sandboxed tool execution (Docker containers)
- Network egress controls per tool
- Secrets stored in HashiCorp Vault
- RBAC for workflow operations
- Audit trail for all actions
- Cost attribution and budget guards

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[License TBD]

## Support

- GitHub Issues: [Link TBD]
- Documentation: [Link TBD]
- Slack Community: [Link TBD]
