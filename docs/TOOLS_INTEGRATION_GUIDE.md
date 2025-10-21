# IdeaMine Tools Infrastructure - Integration Guide

## Overview

The IdeaMine Tools Infrastructure provides a production-grade system for creating, discovering, and executing specialized tools across all 12 phases of the IdeaMine workflow.

This guide explains how the tools infrastructure integrates with existing IdeaMine agents and how to leverage tools in your phase coordinators.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      IdeaMine Agents                             │
│  (BaseAgent with Analyzer-inside-Agent pattern)                 │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  │ 1. Tool Discovery
                  │ 2. Tool Execution
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                      Tool Gateway                                │
│              (API Gateway - Port 8000)                           │
└─────────┬──────────────────────────┬────────────────────────────┘
          │                          │
          │ Discovery                │ Execution
          │                          │
┌─────────▼─────────┐     ┌──────────▼────────┐
│   Tool Registry   │     │    Tool Runner     │
│    (Armory)       │     │     (Engine)       │
│   Port 8001       │     │    Port 8002       │
│                   │     │                    │
│ - PostgreSQL      │     │ - Docker Executor  │
│ - Semantic Search │     │ - WASM Executor    │
│ - Versioning      │     │ - Idempotence      │
│ - Allowlists      │     │ - Retry Logic      │
└───────────────────┘     │ - Resource Limits  │
                          │ - Vault Secrets    │
                          └────────────────────┘
```

## Quick Start

### 1. Environment Setup

Set environment variables for tool infrastructure:

```bash
# Tool Gateway URL (required)
export TOOL_GATEWAY_URL="http://localhost:8000"

# Optional: Direct Registry URL (for faster discovery)
export TOOL_REGISTRY_URL="http://localhost:8001"

# Optional: API Authentication
export TOOL_API_KEY="your-api-key"
export TOOL_AUTH_TOKEN="your-jwt-token"
```

### 2. BaseAgent Integration

The `BaseAgent` class already integrates the Tools Infrastructure via the `ToolExecutor`:

```typescript
// packages/agent-sdk/src/base-agent.ts

export abstract class BaseAgent {
  protected executor: ToolExecutor;

  constructor(config: AgentConfig) {
    // ToolExecutor automatically connects to Tool Gateway
    this.executor = new ToolExecutor();
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    // 1. Plan execution
    const plan = await this.plan(input);

    // 2. Initial reasoning (without tools)
    let result = await this.reason(plan, input);

    // 3. Analyzer Loop: Iteratively improve with tools
    while (loopCount < maxLoops) {
      // Analyzer decides if tool can improve result
      const decision = await this.analyzer.analyze(plan, result, input);

      if (!decision.useTool) break;

      // Execute tool via ToolExecutor
      const toolResult = await this.executor.invoke({
        toolId: decision.toolId,
        toolVersion: decision.toolVersion || 'latest',
        input: decision.input,
        workflowRunId: input.workflowRunId,
        agentId: this.config.agentId,
      });

      // Verify if tool improved result
      const verification = await this.verifier.compare(result, toolResult);

      if (verification.improved) {
        result = await this.integrateToolOutput(result, toolResult);
      }
    }

    return output;
  }
}
```

**Key Points:**
- Tools are invoked **only when Analyzer decides they add value** (VoI > threshold)
- Tool results are **verified** before integration
- Tools that don't improve quality are **discarded**
- All tool executions are **logged** by Recorder

### 3. Using Tools in Phase Coordinators

#### Example: QA Phase with E2E Testing Tool

```typescript
// packages/agents/src/qa/qa-phase-coordinator-enhanced.ts

export class QAPhaseCoordinator extends EnhancedPhaseCoordinator {
  constructor() {
    super({
      phase: 'qa',
      agents: [
        new E2ETestRunnerAgent({
          agentId: 'e2e-test-runner',
          phase: 'qa',
          toolPolicy: {
            allowedTools: [
              'tool.qa.e2e',           // Playwright/Appium runner
              'tool.qa.visualDiff',    // Visual regression testing
              'tool.qa.flakyTriager',  // Flaky test detection
            ],
            maxToolInvocations: 5,
            voiThreshold: 0.3, // Lower threshold = more likely to use tools
          },
        }),
      ],
    });
  }
}

// packages/agents/src/qa/e2e-test-runner-agent.ts

export class E2ETestRunnerAgent extends BaseAgent {
  async reason(plan: ExecutionPlan, input: AgentInput): Promise<ReasoningResult> {
    // Initial reasoning: Identify test scenarios from PRD
    const testScenarios = await this.identifyTestScenarios(input);

    return {
      content: JSON.stringify(testScenarios),
      confidence: 0.6, // Medium confidence - tools can improve
      needsImprovement: true,
      reasoning: 'Identified test scenarios, but execution and validation needed',
    };
  }

  // Analyzer will decide to use tool.qa.e2e to actually execute tests
  // ToolExecutor will invoke the tool via Gateway → Runner → Docker
}
```

#### Example: PRD Phase with Traceability Matrix

```typescript
// packages/agents/src/prd/prd-writer-agent.ts

export class PRDWriterAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super({
      ...config,
      toolPolicy: {
        allowedTools: [
          'tool.prd.traceMatrix',    // RTM generator
          'tool.prd.storyCutter',    // User story generator
          'tool.prd.nfrPack',        // NFR generator
          'guard.AC_lint',           // Acceptance criteria validator
        ],
        maxToolInvocations: 3,
        voiThreshold: 0.4,
      },
    });
  }

  async integrateToolOutput(
    currentResult: ReasoningResult,
    toolResult: ToolInvocationResult,
    verification: VerifierResult
  ): Promise<ReasoningResult> {
    // Custom integration for RTM tool
    if (toolResult.toolId === 'tool.prd.traceMatrix') {
      const rtm = toolResult.output.rtm;

      return {
        ...currentResult,
        content: JSON.stringify({
          ...JSON.parse(currentResult.content),
          traceabilityMatrix: rtm,
        }),
        confidence: Math.min(currentResult.confidence + 0.2, 1.0),
        needsImprovement: false,
      };
    }

    return super.integrateToolOutput(currentResult, toolResult, verification);
  }
}
```

## Tool Discovery

### Discovering Tools by Capability

Agents can discover tools dynamically using the ToolClient:

```typescript
import { ToolClient } from '@ideamine/tool-sdk';

const toolClient = new ToolClient({
  gateway_url: process.env.TOOL_GATEWAY_URL,
});

// Search for QA tools
const qaTools = await toolClient.search({
  capabilities: ['qa', 'e2e-testing'],
  tags: ['phase:qa'],
  limit: 10,
});

console.log(qaTools);
// [
//   { name: 'tool.qa.e2e', version: '1.0.0', capabilities: ['qa', 'e2e-testing'], ... },
//   { name: 'tool.qa.visualDiff', version: '2.1.0', capabilities: ['qa', 'visual-testing'], ... },
// ]
```

### Getting Tool Details

```typescript
// Get specific tool version
const tool = await toolClient.get('tool.prd.traceMatrix', '1.2.0');

console.log(tool.manifest);
// {
//   name: 'tool.prd.traceMatrix',
//   version: '1.2.0',
//   summary: 'Build RTM linking use-cases → stories → tests',
//   input_schema: {...},
//   output_schema: {...},
//   timeout_ms: 60000,
//   ...
// }

// Get latest version
const latestTool = await toolClient.getLatest('tool.prd.traceMatrix');
```

## Tool Execution

### Direct Tool Invocation

While BaseAgent handles tool invocation automatically, you can also invoke tools directly:

```typescript
import { ToolClient } from '@ideamine/tool-sdk';

const toolClient = new ToolClient({
  gateway_url: process.env.TOOL_GATEWAY_URL,
});

const result = await toolClient.execute({
  toolId: 'tool.prd.traceMatrix',
  version: '1.2.0',
  input: {
    use_cases: [...],
    stories: [...],
    tests: [...],
  },
  runId: 'run-123',
  agentId: 'prd-writer',
  phase: 'prd',
  budget: {
    ms: 60000, // Max 60 seconds
  },
});

if (result.ok) {
  console.log('RTM generated:', result.output.rtm);
  console.log('Cached:', result.cached);
  console.log('Duration:', result.metrics.duration_ms, 'ms');
  console.log('Cost:', result.metrics.cost_usd, 'USD');
} else {
  console.error('Tool failed:', result.error);
}
```

### Streaming Logs

```typescript
const result = await toolClient.executeWithLogs(
  {
    toolId: 'tool.qa.e2e',
    version: '1.0.0',
    input: { test_suites: [...] },
    runId: 'run-123',
  },
  (log) => {
    console.log(`[${log.stream}] ${log.content}`);
  }
);
```

## Creating Custom Tools

### Using the CLI

```bash
# Install CLI
cd packages/tool-cli
pip install -e .

# Create new tool
ideamine-tools create tool.myteam.mytool --lang py --runtime docker

# Test locally
cd tool.myteam.mytool
ideamine-tools run . --input sample-input.json

# Publish to registry
ideamine-tools publish . --sign
```

### Tool Structure

```
tool.myteam.mytool/
├── tool.yaml               # Tool manifest
├── app/
│   └── main.py            # Handler implementation
├── schemas/
│   ├── input.schema.json  # JSON Schema for input validation
│   └── output.schema.json # JSON Schema for output validation
├── Dockerfile             # Secure Docker image
├── README.md
└── sample-input.json
```

### Example Tool Implementation

```python
# app/main.py
#!/usr/bin/env python3
import json
import sys

def handle(input_data: dict, context: dict) -> dict:
    """Main handler function"""

    # Access inputs (validated against input_schema)
    param1 = input_data['param1']
    param2 = input_data['param2']

    # Access context
    run_id = context.get('runId', 'unknown')
    agent_id = context.get('agentId')

    # Access secrets (injected by Runner from Vault)
    api_key = context.get('secrets', {}).get('API_KEY')

    # Implement tool logic
    result = {
        'output_field': f"Processed {param1} and {param2}",
        'metadata': {
            'run_id': run_id,
            'agent_id': agent_id,
        }
    }

    return result

if __name__ == "__main__":
    # Read from stdin (Runner protocol)
    payload = json.load(sys.stdin)
    input_data = payload.get("input", {})
    context = input_data.pop("_context", {})

    try:
        output = handle(input_data, context)
        print(json.dumps({"ok": True, "output": output}))
    except Exception as e:
        print(json.dumps({
            "ok": False,
            "error": {
                "type": "runtime",
                "message": str(e),
                "retryable": False
            }
        }))
        sys.exit(1)
```

## Access Control

### Configuring Allowlists

Tools can be restricted to specific agents, phases, or roles:

```sql
-- Allow PRD Writer Agent to use traceability tools
INSERT INTO allowlists (tool_id, agent_id, reason, created_by)
SELECT t.id, 'prd-writer', 'Core PRD functionality', 'admin'
FROM tools t
WHERE t.name IN ('tool.prd.traceMatrix', 'tool.prd.storyCutter', 'guard.AC_lint');

-- Allow all QA phase agents to use QA tools
INSERT INTO allowlists (tool_id, phase, reason, created_by)
SELECT t.id, 'qa', 'QA phase tools', 'admin'
FROM tools t
WHERE t.name LIKE 'tool.qa.%';

-- Rate limiting
UPDATE allowlists
SET max_executions_per_hour = 100
WHERE agent_id = 'e2e-test-runner';
```

### Checking Access Programmatically

```typescript
const access = await toolClient.checkAccess(
  'tool.qa.e2e',
  'e2e-test-runner',
  'qa'
);

if (!access.allowed) {
  console.error('Access denied:', access.reason);
}
```

## Observability

### Execution Metrics

All tool executions are tracked in the `executions` table with:
- Duration, CPU usage, memory peak
- Input/output hashes for idempotence
- Cost attribution
- Trace IDs for distributed tracing
- Retry counts
- Exit codes

### Querying Execution History

```sql
-- Get execution statistics for a tool
SELECT
  tool_name,
  tool_version,
  COUNT(*) as total_executions,
  COUNT(*) FILTER (WHERE status = 'succeeded') as successes,
  AVG(duration_ms) as avg_duration_ms,
  SUM(cost_cents) as total_cost_cents
FROM executions
WHERE tool_name = 'tool.prd.traceMatrix'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY tool_name, tool_version;
```

### OTEL Tracing

Tools automatically emit OpenTelemetry spans:

```
Span: agent.execute (PRDWriterAgent)
  ├─ Span: tool.execute.tool.prd.traceMatrix
  │   ├─ Attribute: tool.name = "tool.prd.traceMatrix"
  │   ├─ Attribute: tool.version = "1.2.0"
  │   ├─ Attribute: tool.execution.duration_ms = 1234
  │   ├─ Attribute: tool.execution.cost_usd = 0.02
  │   └─ Attribute: tool.cached = false
  └─ Span: verifier.compare
```

## Best Practices

### 1. Set Appropriate VoI Thresholds

```typescript
toolPolicy: {
  voiThreshold: 0.3, // Lower = use tools more aggressively
  maxToolInvocations: 5, // Prevent infinite loops
}
```

### 2. Use Allowlists for Security

Only grant tools to agents that need them. Never grant global `*` access.

### 3. Implement Custom Integration Logic

Override `integrateToolOutput()` to merge tool results intelligently:

```typescript
protected async integrateToolOutput(
  currentResult: ReasoningResult,
  toolResult: ToolInvocationResult
): Promise<ReasoningResult> {
  // Custom merge logic based on tool type
  switch (toolResult.toolId) {
    case 'tool.prd.traceMatrix':
      return this.mergeRTM(currentResult, toolResult);
    case 'tool.qa.e2e':
      return this.mergeE2EResults(currentResult, toolResult);
    default:
      return super.integrateToolOutput(currentResult, toolResult);
  }
}
```

### 4. Handle Tool Failures Gracefully

Tools can fail due to timeouts, resource limits, or logic errors. BaseAgent handles this automatically by continuing without the tool result.

### 5. Monitor Costs

Track tool execution costs in your budgets:

```typescript
agentInput.budget = {
  maxCostUsd: 1.0, // $1 max
  maxTokens: 100000,
};
```

## Troubleshooting

### Tool Not Found

```
Error: Tool not found: tool.myteam.mytool@1.0.0
```

**Solution:** Ensure tool is published to Registry. Check:
```bash
curl http://localhost:8001/api/v1/tools/search?q=mytool
```

### Access Denied

```
Error: Access denied to tool: tool.qa.e2e
```

**Solution:** Add allowlist entry for agent/phase:
```sql
INSERT INTO allowlists (tool_id, agent_id, created_by)
SELECT id, 'my-agent-id', 'admin' FROM tools WHERE name = 'tool.qa.e2e';
```

### Tool Timeout

```
Error: Tool execution exceeded timeout of 60000ms
```

**Solution:** Increase timeout in `tool.yaml`:
```yaml
timeout_ms: 120000  # 2 minutes
```

Or in execution request:
```typescript
budget: {
  ms: 120000, // 2 minutes
}
```

### Docker Image Not Found

```
Error: Docker image not found: ghcr.io/ideamine/mytool:1.0.0
```

**Solution:** Build and push Docker image:
```bash
docker build -t ghcr.io/ideamine/mytool:1.0.0 .
docker push ghcr.io/ideamine/mytool:1.0.0
```

## Next Steps

1. **Explore Existing Tools**: Browse the tools catalog in `/tools/`
2. **Create Your First Tool**: Use `ideamine-tools create` to scaffold a new tool
3. **Integrate Tools in Agents**: Update your phase coordinators to leverage relevant tools
4. **Monitor Usage**: Query `executions` table to track tool performance and costs
5. **Optimize VoI**: Tune `voiThreshold` based on actual improvement metrics

## References

- **Tool SDK Documentation**: `/packages/tool-sdk/README.md`
- **CLI Documentation**: `/packages/tool-cli/README.md`
- **Tools Catalog**: `/docs/TOOLS_CATALOG.md`
- **BaseAgent Source**: `/packages/agent-sdk/src/base-agent.ts`
- **Example Tools**: `/tools/prd/trace-matrix/`, `/tools/guard/citation-check/`
