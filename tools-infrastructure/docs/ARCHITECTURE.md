# IdeaMine Tools Infrastructure System - Architecture

## Executive Summary

The Tools Infrastructure System enables IdeaMine's 12-phase AI platform to leverage 100+ specialized tools through a secure, observable, and developer-friendly framework. The system comprises three core layers:

1. **Tool SDK** - Author tools once, run anywhere (Docker/WASM)
2. **Tool Runtime** - Execute tools in isolated, resource-limited sandboxes
3. **Tool Registry** - Catalog, version, and govern tool lifecycle

## Strategic Overview

**Core Approach**: Treat tools as first-class, versionable, signed artifacts with strong security defaults and comprehensive observability.

**Key Trade-offs**:
- **Docker vs WASM**: Docker for MVP (mature, familiar), WASM for future (faster cold start, smaller footprint)
- **Sync vs Async execution**: Async-first with streaming logs, but allow sync for sub-second tools
- **Centralized vs Federated registry**: Centralized PostgreSQL for MVP, federation-ready with tool URIs
- **Policy enforcement**: Compile-time allowlists + runtime guards (defense in depth)

## System Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AGENT LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ PRDWriter    │  │ E2ETestRunner│  │ ArchDesigner │  ... 12 phases   │
│  │ Agent        │  │ Agent        │  │ Agent        │                   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
│         │                 │                 │                            │
│         └─────────────────┴─────────────────┘                            │
│                           │                                              │
└───────────────────────────┼──────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    TOOL GATEWAY (HTTP/gRPC)                              │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  POST /v1/tools/discover   - Search tools by capability        │    │
│  │  POST /v1/tools/execute    - Submit execution request          │    │
│  │  GET  /v1/tools/stream/:id - Stream logs (SSE)                 │    │
│  │  GET  /v1/tools/result/:id - Get execution result              │    │
│  │  GET  /v1/tools/:id/status - Check execution status            │    │
│  └────────────────────────────────────────────────────────────────┘    │
│         │                    │                    │                      │
│         ▼                    ▼                    ▼                      │
│  ┌──────────┐        ┌──────────┐        ┌──────────┐                  │
│  │ Registry │        │  Runner  │        │Artifacts │                   │
│  │ Client   │        │  Client  │        │  Client  │                   │
│  └──────────┘        └──────────┘        └──────────┘                  │
└─────────┬───────────────────┬───────────────────┬───────────────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  TOOL REGISTRY  │  │  TOOL RUNNER    │  │ ARTIFACT STORE  │
│  (PostgreSQL)   │  │  (K8s Jobs)     │  │ (S3/MinIO)      │
│                 │  │                 │  │                 │
│  • Catalog      │  │  • Sandboxing   │  │  • Blobs        │
│  • Versions     │  │  • Execution    │  │  • Content-addr │
│  • Capabilities │  │  • Deduplication│  │  • Provenance   │
│  • Allowlists   │  │  • Observability│  │                 │
│  • Provenance   │  │  • Retry logic  │  │                 │
└─────────────────┘  └────────┬────────┘  └─────────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │  TOOL SANDBOX   │
                     │  (Docker/WASM)  │
                     │                 │
                     │  • Non-root     │
                     │  • Read-only FS │
                     │  • CPU/RAM limit│
                     │  • Egress deny  │
                     │  • Vault secrets│
                     └─────────────────┘
```

## Data Flow

### Tool Execution Flow

```
1. Agent requests tool via Tool Gateway
   ↓
2. Gateway queries Registry for tool metadata + policy check
   ↓
3. Gateway submits execution request to Runner
   ↓
4. Runner checks deduplication cache (hash-based)
   ↓
   Cache HIT → Return cached result
   ↓
   Cache MISS → Continue
   ↓
5. Runner creates K8s Job with security defaults
   ↓
6. Sandbox pulls tool image (signed, verified)
   ↓
7. Sandbox receives input via stdin (JSON)
   ↓
8. Tool handler processes input
   ↓
9. Tool writes output to stdout (JSON)
   ↓
10. Runner captures output + metrics (OTEL)
    ↓
11. Large artifacts → Artifact Store (S3)
    ↓
12. Runner caches result (10-60min TTL)
    ↓
13. Gateway streams logs to agent (SSE)
    ↓
14. Gateway returns result + artifact refs
    ↓
15. Recorder logs execution (provenance trail)
```

### Tool Publishing Flow

```
1. Developer writes tool using SDK
   ↓
2. Developer defines tool.yaml manifest
   ↓
3. Developer runs: ideamine-tools publish
   ↓
4. CLI validates tool.yaml + I/O schemas
   ↓
5. CLI builds Docker image OR WASM module
   ↓
6. CLI generates SBOM (Syft)
   ↓
7. CLI scans for vulnerabilities (Grype)
   ↓
8. CLI signs image with Cosign
   ↓
9. CLI pushes image to registry (Harbor/ECR)
   ↓
10. CLI registers metadata in Tool Registry
    ↓
11. Registry assigns immutable version (SemVer)
    ↓
12. Tool becomes discoverable to agents
```

## Integration with IdeaMine Level-2 Infrastructure

### BaseAgent Enhancement

```typescript
class BaseAgent {
  // NEW: Tool discovery and execution
  protected async discoverTools(capabilities: string[]): Promise<Tool[]> {
    return this.toolGateway.discover({ capabilities, phase: this.phase });
  }

  protected async executeTool<I, O>(
    toolId: string,
    input: I,
    options?: ToolExecutionOptions
  ): Promise<ToolResult<O>> {
    // Log intent
    await this.recorder.logEvent({
      type: 'TOOL_EXECUTION_REQUESTED',
      toolId,
      agentId: this.id,
      input: this.sanitize(input)
    });

    // Execute via gateway
    const result = await this.toolGateway.execute({
      toolId,
      input,
      agentId: this.id,
      phaseId: this.phase,
      options
    });

    // Log completion
    await this.recorder.logEvent({
      type: 'TOOL_EXECUTION_COMPLETED',
      toolId,
      executionId: result.executionId,
      status: result.status,
      metrics: result.metrics
    });

    return result;
  }
}
```

### Analyzer (VoI) Enhancement

```typescript
class Analyzer {
  async shouldInvokeTool(
    toolId: string,
    context: AnalysisContext
  ): Promise<VoIDecision> {
    // Estimate tool cost
    const toolMeta = await this.registry.getTool(toolId);
    const estimatedCost = this.estimateExecutionCost(toolMeta);

    // Estimate value
    const estimatedValue = this.estimateInformationValue(
      toolMeta.capabilities,
      context.uncertainties
    );

    // Factor in cached results
    const cacheHitProbability = await this.runner.getCacheHitProb(
      toolId,
      context.input
    );
    const effectiveCost = estimatedCost * (1 - cacheHitProbability);

    return {
      invoke: estimatedValue > effectiveCost,
      expectedValue: estimatedValue - effectiveCost,
      confidence: this.calculateConfidence(context)
    };
  }
}
```

### Recorder Enhancement

```typescript
class Recorder {
  async logToolExecution(execution: ToolExecution): Promise<void> {
    // Comprehensive logging
    await this.store.insert('tool_executions', {
      execution_id: execution.id,
      tool_id: execution.toolId,
      tool_version: execution.toolVersion,
      agent_id: execution.agentId,
      phase_id: execution.phaseId,
      input_hash: this.hashInput(execution.input),
      output_hash: this.hashOutput(execution.output),
      status: execution.status,
      started_at: execution.startedAt,
      completed_at: execution.completedAt,
      duration_ms: execution.durationMs,
      cpu_ms: execution.cpuMs,
      mem_peak_mb: execution.memPeakMb,
      cache_hit: execution.cacheHit,
      artifacts: execution.artifacts, // S3 refs
      provenance: {
        image_digest: execution.imageDigest,
        signature: execution.signature,
        sbom_ref: execution.sbomRef
      }
    });

    // OTEL trace
    this.tracer.recordSpan({
      name: `tool.${execution.toolId}`,
      attributes: {
        'tool.id': execution.toolId,
        'tool.version': execution.toolVersion,
        'execution.status': execution.status,
        'execution.cache_hit': execution.cacheHit
      },
      metrics: {
        duration_ms: execution.durationMs,
        cpu_ms: execution.cpuMs,
        mem_peak_mb: execution.memPeakMb
      }
    });
  }
}
```

### Gates Enhancement

```typescript
class QAGate extends BaseGate {
  async validate(context: GateContext): Promise<GateDecision> {
    // Require tool evidence for specific criteria
    const requiredTools = [
      'qa.e2e', // E2E test results
      'qa.coverage', // Code coverage
      'guard.flakyTriager' // Flaky test analysis
    ];

    const toolResults = await this.recorder.getToolExecutions({
      phaseId: context.phaseId,
      toolIds: requiredTools
    });

    // Validate each tool output
    for (const toolId of requiredTools) {
      const result = toolResults.find(r => r.toolId === toolId);
      if (!result) {
        return this.reject(`Missing required tool execution: ${toolId}`);
      }

      if (result.status !== 'SUCCESS') {
        return this.reject(`Tool execution failed: ${toolId}`);
      }

      // Validate tool output schema
      const tool = await this.registry.getTool(toolId);
      const isValid = await this.validateSchema(
        result.output,
        tool.outputSchema
      );
      if (!isValid) {
        return this.reject(`Invalid tool output: ${toolId}`);
      }
    }

    // Check E2E pass rate
    const e2eResult = toolResults.find(r => r.toolId === 'qa.e2e');
    if (e2eResult.output.passRate < 0.95) {
      return this.reject(`E2E pass rate too low: ${e2eResult.output.passRate}`);
    }

    return this.approve('All QA tool checks passed');
  }
}
```

### Dispatcher Enhancement

```typescript
class Dispatcher {
  // NEW: Tool execution events
  registerToolHandlers(): void {
    this.on('TOOL_EXECUTION_STARTED', async (event) => {
      // Notify monitoring systems
      await this.metrics.increment('tool.executions.started', {
        tool_id: event.toolId,
        phase_id: event.phaseId
      });
    });

    this.on('TOOL_EXECUTION_FAILED', async (event) => {
      // Trigger retry logic via Supervisor
      if (this.isRetriable(event.error)) {
        await this.supervisor.scheduleRetry({
          executionId: event.executionId,
          toolId: event.toolId,
          attempt: event.attempt
        });
      }

      // Alert on critical failures
      if (event.error.type === 'SECURITY_VIOLATION') {
        await this.alerting.criticalAlert({
          title: `Tool security violation: ${event.toolId}`,
          details: event.error
        });
      }
    });

    this.on('TOOL_CACHE_HIT', async (event) => {
      // Track cache efficiency
      await this.metrics.increment('tool.cache.hits', {
        tool_id: event.toolId
      });
    });
  }
}
```

### Supervisor Enhancement

```typescript
class Supervisor {
  async executeToolWithRetry(
    toolId: string,
    input: any,
    options: RetryOptions
  ): Promise<ToolResult> {
    const backoff = new ExponentialBackoff({
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      maxAttempts: 3
    });

    return this.retry(async () => {
      try {
        return await this.toolGateway.execute({ toolId, input });
      } catch (error) {
        // Only retry infrastructure errors, not logic errors
        if (this.isInfrastructureError(error)) {
          throw error; // Will trigger retry
        } else {
          // Logic/schema errors are not retriable
          throw new NonRetriableError(error);
        }
      }
    }, backoff);
  }

  private isInfrastructureError(error: any): boolean {
    return (
      error.code === 'SANDBOX_TIMEOUT' ||
      error.code === 'NETWORK_ERROR' ||
      error.code === 'RESOURCE_EXHAUSTED' ||
      error.code === 'SERVICE_UNAVAILABLE'
    );
  }
}
```

## Security Architecture

### Defense in Depth

```
Layer 1: Registry Policy Enforcement
├─ Allowlist checks before execution
├─ Capability-based access control
└─ Version pinning (no "latest")

Layer 2: Sandbox Isolation
├─ Non-root user (UID 10001)
├─ Read-only filesystem (except /tmp)
├─ No network access by default
├─ CPU/RAM/timeout limits
└─ seccomp/AppArmor profiles

Layer 3: Egress Control
├─ Deny-by-default
├─ Explicit allowlists per tool
└─ URL pattern matching

Layer 4: Secrets Management
├─ Vault-issued, short-lived tokens
├─ Scoped to specific tool execution
├─ Auto-revoked on container exit
└─ Never logged or cached

Layer 5: Provenance & Auditability
├─ Cosign image signatures
├─ SBOM with vulnerability scans
├─ Immutable execution logs
└─ Artifact content addressing
```

### Hallucination Guards

Tools that fetch external facts MUST be paired with hallucination guards:

```yaml
# tool.yaml for a research tool
name: tool.research.paperSearch
capabilities:
  - fact-retrieval
  - citation
requires_guards:
  - guard.citationCheck  # Verify citations exist and match claims
  - guard.factConsistency  # Check for contradictions

# Registry enforces guard execution
execution_policy:
  pre_guards: []
  post_guards:
    - guard.citationCheck
    - guard.factConsistency
  on_guard_failure: REJECT  # Don't return results if guards fail
```

### Policy Allowlist Engine

```typescript
interface PolicyAllowlist {
  agentId: string;
  phaseId: string;
  allowedTools: {
    toolId: string;
    versionConstraint: string; // SemVer range: "^1.0.0"
    conditions?: {
      maxExecutionsPerHour?: number;
      requiresApproval?: boolean;
      requiredGuards?: string[];
    };
  }[];
}

// Example: PRDWriterAgent allowlist
const prdWriterPolicy: PolicyAllowlist = {
  agentId: 'agent.prd.writer',
  phaseId: 'PRD',
  allowedTools: [
    {
      toolId: 'tool.prd.traceMatrix',
      versionConstraint: '^1.0.0',
      conditions: {
        maxExecutionsPerHour: 100
      }
    },
    {
      toolId: 'guard.RTM_validator',
      versionConstraint: '^1.0.0'
    },
    {
      toolId: 'tool.prd.storyCutter',
      versionConstraint: '^2.0.0',
      conditions: {
        requiredGuards: ['guard.acLint']
      }
    }
  ]
};
```

## Observability

### OTEL Integration

Every tool execution produces:

```typescript
// Trace span
span: {
  name: 'tool.prd.traceMatrix@1.2.3',
  attributes: {
    'tool.id': 'tool.prd.traceMatrix',
    'tool.version': '1.2.3',
    'tool.runtime': 'docker',
    'execution.id': 'exec_abc123',
    'execution.agent_id': 'agent.prd.writer',
    'execution.phase_id': 'PRD',
    'execution.cache_hit': false,
    'execution.status': 'SUCCESS',
    'input.hash': 'sha256:...',
    'output.hash': 'sha256:...',
  },
  metrics: {
    'execution.duration_ms': 1234,
    'execution.cpu_ms': 890,
    'execution.mem_peak_mb': 128,
    'execution.artifacts_count': 2,
    'execution.artifacts_size_bytes': 4096
  }
}

// Metrics
metrics: {
  'tool.executions.total': counter,
  'tool.executions.duration_ms': histogram,
  'tool.executions.cpu_ms': histogram,
  'tool.executions.mem_peak_mb': histogram,
  'tool.cache.hits': counter,
  'tool.cache.misses': counter,
  'tool.errors.total': counter,
  'tool.guards.triggered': counter
}

// Logs (structured JSON)
logs: [
  {
    timestamp: '2025-10-19T12:34:56.789Z',
    level: 'INFO',
    message: 'Tool execution started',
    tool_id: 'tool.prd.traceMatrix',
    execution_id: 'exec_abc123'
  },
  {
    timestamp: '2025-10-19T12:34:57.123Z',
    level: 'INFO',
    message: 'Processing 45 requirements',
    tool_id: 'tool.prd.traceMatrix',
    execution_id: 'exec_abc123',
    context: { requirement_count: 45 }
  }
]
```

### Cost Attribution

```typescript
// Track cost per execution
interface ExecutionCost {
  executionId: string;
  toolId: string;
  costs: {
    compute: {
      cpuCoreSeconds: number;
      memoryGBSeconds: number;
      estimatedUSD: number;
    };
    storage: {
      artifactsSizeBytes: number;
      estimatedUSD: number;
    };
    network: {
      egressBytes: number;
      estimatedUSD: number;
    };
  };
  totalUSD: number;
}

// Aggregate cost by phase/agent/tool
const costReport = {
  phase: 'PRD',
  agent: 'agent.prd.writer',
  period: '2025-10-01 to 2025-10-31',
  toolCosts: [
    {
      toolId: 'tool.prd.traceMatrix',
      executions: 1234,
      totalCostUSD: 12.34,
      avgCostPerExecution: 0.01
    }
  ],
  totalCostUSD: 123.45
};
```

## Architectural Decisions

### ADR-001: Docker for MVP, WASM for Future

**Status**: Accepted

**Context**: Need to choose runtime for tool execution.

**Decision**: Use Docker containers on Kubernetes Jobs for MVP, design for WASM migration.

**Rationale**:
- Docker: Mature, familiar, excellent tooling, supports all languages
- WASM: Faster cold start (<10ms vs 1-5s), smaller footprint (KB vs MB), better isolation
- Migration path: Abstract runtime interface, tools declare runtime in tool.yaml

**Consequences**:
- Accept slower cold starts initially
- Invest in runtime abstraction layer
- Design tool contract to be runtime-agnostic (stdin/stdout JSON)

### ADR-002: Idempotent Execution via Hash-Based Deduplication

**Status**: Accepted

**Context**: Many agents may request identical tool executions.

**Decision**: Cache results keyed by `hash(toolId@version + input)` with 10-60min TTL.

**Rationale**:
- Reduces cost and latency for repeated queries
- Enables safe retries (idempotent by design)
- TTL prevents stale data

**Consequences**:
- Must serialize inputs deterministically (canonical JSON)
- Cache invalidation on tool updates (version change)
- Non-deterministic tools must opt-out (cache_ttl: 0)

### ADR-003: Immutable Versioning (SemVer)

**Status**: Accepted

**Context**: Need version stability and reproducibility.

**Decision**: Immutable SemVer versions, no overwrites, no "latest" in production.

**Rationale**:
- Reproducible builds and audits
- Clear upgrade path (major = breaking, minor = features, patch = fixes)
- Prevents supply chain attacks (can't replace v1.0.0 with malicious code)

**Consequences**:
- Must publish new version for every change (even typos)
- Registry storage grows (mitigate with retention policy for unused versions)
- Requires version constraint syntax in allowlists

### ADR-004: Stdin/Stdout JSON Protocol

**Status**: Accepted

**Context**: Need simple, language-agnostic tool interface.

**Decision**: Tools read JSON from stdin, write JSON to stdout.

**Rationale**:
- Universal: Works in all languages (Python, TS, Go, Rust, etc.)
- Simple: No HTTP server boilerplate in tools
- Testable: Easy to test locally with echo/jq
- Debuggable: Can replay executions with saved inputs

**Consequences**:
- Streaming tools need chunk protocol (newline-delimited JSON)
- Large inputs/outputs must use artifact references
- Error handling via stderr + exit codes

### ADR-005: Secrets via Vault, Never Cached

**Status**: Accepted

**Context**: Tools may need API keys, DB credentials, etc.

**Decision**: Vault-issued, short-lived secrets injected at runtime, never logged or cached.

**Rationale**:
- Principle of least privilege (scoped to execution)
- Automatic revocation (expire on container exit)
- Audit trail (Vault logs all issuance)

**Consequences**:
- Adds latency (Vault API call before each execution)
- Requires Vault infrastructure
- Cache misses for executions with different secret scopes

## Performance Characteristics

### Target SLOs

```yaml
Tool Execution SLOs:
  cold_start_p95: 5s (Docker), 100ms (WASM future)
  warm_start_p95: 500ms
  cache_hit_rate: >60% (for idempotent tools)
  cache_lookup_p95: 10ms
  availability: 99.9%
  error_rate: <0.1% (infrastructure errors)

Tool Registry SLOs:
  search_latency_p95: 200ms
  publish_latency_p95: 10s
  availability: 99.95%

Artifact Store SLOs:
  upload_throughput: 10 MB/s
  download_latency_p95: 500ms
  availability: 99.99%
```

### Scalability

```
Expected Load (100 tools, 12 phases, 50 agents):
├─ Tool executions: 10,000/day (peak: 10/sec)
├─ Registry queries: 50,000/day (peak: 50/sec)
├─ Artifact storage: 100 GB/month
└─ Cost: ~$500/month (K8s + storage + egress)

Capacity Planning:
├─ K8s cluster: 10 nodes × 4 vCPU (40 concurrent executions)
├─ PostgreSQL: 2 vCPU, 8 GB RAM (10k qps)
├─ Redis cache: 4 GB (1M cached results)
└─ S3: Standard tier (artifacts), Intelligent-Tiering (logs)
```

## Deployment Architecture

```yaml
# Kubernetes namespace layout
namespaces:
  - ideamine-tools-registry     # Registry API + PostgreSQL
  - ideamine-tools-runner       # Runner API + Redis cache
  - ideamine-tools-gateway      # Gateway API (public-facing)
  - ideamine-tools-sandbox      # Isolated namespace for tool Jobs
  - ideamine-tools-artifacts    # MinIO (S3-compatible) or S3 gateway

# Security boundaries
network_policies:
  - Gateway can call Registry + Runner + Artifacts
  - Runner can create Jobs in sandbox namespace
  - Sandbox Jobs have NO egress by default (explicit allowlists)
  - Registry/Runner/Artifacts in private subnets (no internet)

# Resource quotas (per namespace)
quotas:
  sandbox:
    cpu: 40 cores
    memory: 160 GB
    pods: 100
    ephemeral-storage: 50 GB
```

## Future Enhancements

### Phase 2 (Post-MVP)

1. **WASM Runtime**: Migrate fast, stateless tools to WASM
2. **Federated Registry**: Multi-org tool sharing
3. **Smart Caching**: ML-based cache TTL optimization
4. **Tool Composition**: Chain tools (pipe output → input)
5. **Real-time Streaming**: WebSocket for long-running tools
6. **Cost Optimization**: Spot instances for batch tools

### Phase 3 (Advanced)

1. **Tool Marketplace**: Public registry for community tools
2. **Auto-scaling**: HPA based on queue depth
3. **Multi-region**: Deploy tools closer to data sources
4. **Tool Analytics**: Recommend tools based on phase/context
5. **Formal Verification**: Prove tool correctness (TLA+/Alloy)
6. **Quantum-safe Signatures**: Post-quantum cryptography

## Summary

This architecture provides:

- **Security**: Multi-layer defense, signed provenance, secrets management
- **Observability**: OTEL spans, cost attribution, audit trails
- **Developer Experience**: Simple SDK, CLI tooling, great docs
- **Scalability**: 10k executions/day, horizontal scaling
- **Flexibility**: Docker + WASM, sync + async, pure + stateful tools
- **Governance**: Versioning, allowlists, deprecation lifecycle

The system integrates seamlessly with IdeaMine's existing Level-2 infrastructure (Recorder, Supervisor, Dispatcher, Analyzer, Gates) and enables 100+ tools across 12 phases with production-grade quality.
