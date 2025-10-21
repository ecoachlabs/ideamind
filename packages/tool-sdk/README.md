# IdeaMine Tools SDK

Production-grade TypeScript SDK for building, discovering, and executing tools in the IdeaMine ecosystem.

## Overview

The IdeaMine Tools SDK provides a complete infrastructure for:

- **Tool Authors**: Wrap handlers with validation, logging, and telemetry
- **Agents**: Discover and execute tools with retry logic and observability
- **Infrastructure**: Manage tool registry, execution tracking, and access control

## Features

- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Validated**: Automatic JSON Schema validation for inputs and outputs
- **Observable**: Built-in OpenTelemetry integration for tracing and metrics
- **Resilient**: Exponential backoff retry with circuit breaker support
- **Secure**: Access control policies and idempotence guarantees
- **Production-Ready**: Structured logging, error handling, and resource management

## Installation

```bash
npm install @ideamine/tool-sdk
```

## Quick Start

### For Agents (Using Tools)

```typescript
import { ToolClient } from '@ideamine/tool-sdk';

// Initialize client
const client = new ToolClient({
  gateway_url: 'https://tools.ideamine.ai',
  api_key: process.env.IDEAMINE_API_KEY,
  enable_tracing: true,
});

// Search for tools
const tools = await client.searchTools({
  q: 'traceability',
  capabilities: ['prd', 'traceability'],
  limit: 10,
});

// Get tool details
const tool = await client.getTool('tool.prd.traceMatrix', '1.2.0');

// Execute tool
const result = await client.execute({
  toolId: 'tool.prd.traceMatrix',
  version: '1.2.0',
  input: {
    use_cases: [...],
    stories: [...],
  },
  runId: 'run-abc-123',
  budget: {
    ms: 60000, // 60 second timeout
    cost_usd: 0.10, // Max $0.10
  },
  agentId: 'agent-coordinator',
  phase: 'prd',
});

if (result.ok) {
  console.log('Output:', result.output);
  console.log('Metrics:', result.metrics);

  if (result.artifacts) {
    console.log('Artifacts:', result.artifacts);
  }
} else {
  console.error('Error:', result.error);
}
```

### For Tool Authors (Building Tools)

```typescript
import { runToolServer, createHandler } from '@ideamine/tool-sdk';

// Define your tool manifest
const manifest = {
  name: 'tool.prd.traceMatrix',
  version: '1.2.0',
  summary: 'Generate requirements traceability matrix',
  owner: 'ideamine',
  capabilities: ['traceability', 'prd'],

  input_schema: {
    type: 'object',
    properties: {
      use_cases: {
        type: 'array',
        items: { type: 'object' },
      },
      stories: {
        type: 'array',
        items: { type: 'object' },
      },
    },
    required: ['use_cases', 'stories'],
  },

  output_schema: {
    type: 'object',
    properties: {
      matrix: {
        type: 'array',
        items: { type: 'object' },
      },
      coverage: { type: 'number' },
    },
    required: ['matrix', 'coverage'],
  },

  runtime: 'docker',
  image: 'ghcr.io/ideamine/trace-matrix:1.2.0',
  entrypoint: ['node', '/app/index.js'],

  timeout_ms: 60000,
  cpu: '500m',
  memory: '512Mi',

  security: {
    run_as_non_root: true,
    filesystem: 'read_only',
    network: 'restricted',
  },

  egress: {
    allow: ['s3://artifacts/*'],
  },

  guardrails: {
    grounding_required: false,
    max_tokens: 0,
  },
};

// Define your handler
const handler = createHandler(async (input, context) => {
  context.logger.info('Processing traceability matrix', {
    use_cases: input.use_cases.length,
    stories: input.stories.length,
  });

  // Your tool logic here
  const matrix = generateMatrix(input.use_cases, input.stories);
  const coverage = calculateCoverage(matrix);

  context.logger.info('Matrix generated', { coverage });

  return {
    matrix,
    coverage,
  };
});

// Run server
await runToolServer({
  manifest,
  handler,
  validate_input: true,
  validate_output: true,
});
```

## Architecture

### Client Architecture

```
Agent
  └─> ToolClient
       ├─> HTTPTransport (with retry logic)
       ├─> SchemaValidator
       ├─> ToolTelemetry (OTEL)
       └─> Logger (Winston)
```

### Server Architecture

```
Tool Container
  └─> ToolServer
       ├─> StdinHandler (reads JSON from stdin)
       ├─> ToolHandler (your code)
       ├─> SchemaValidator
       ├─> Logger (writes to stderr)
       └─> StdoutWriter (writes JSON to stdout)
```

## API Reference

### ToolClient

#### Constructor

```typescript
const client = new ToolClient(config: ToolClientConfig);
```

**Config Options:**

```typescript
interface ToolClientConfig {
  gateway_url: string;           // Required: Tool Gateway endpoint
  registry_url?: string;          // Optional: Separate registry endpoint
  api_key?: string;               // API key for authentication
  auth_token?: string;            // Bearer token for authentication
  default_timeout_ms?: number;    // Default: 30000
  default_retry_attempts?: number; // Default: 3
  enable_tracing?: boolean;       // Default: true
  enable_metrics?: boolean;       // Default: true
  logger?: ToolLogger;            // Custom logger
}
```

#### Methods

##### searchTools(query)

Search for tools matching criteria.

```typescript
const results = await client.searchTools({
  q: 'search text',
  capabilities: ['prd', 'traceability'],
  tags: ['official'],
  runtime: 'docker',
  owner: 'ideamine',
  limit: 20,
  offset: 0,
});
```

##### getTool(toolId, version)

Get specific tool version.

```typescript
const tool = await client.getTool('tool.prd.traceMatrix', '1.2.0');
```

##### execute(request)

Execute a tool.

```typescript
const result = await client.execute({
  toolId: 'tool.prd.traceMatrix',
  version: '1.2.0',
  input: { ... },
  runId: 'run-123',
  budget: {
    ms: 60000,
    cost_usd: 0.10,
  },
  agentId: 'agent-coordinator',
  phase: 'prd',
  skipCache: false,
});
```

##### executeWithStream(request, logCallback)

Execute tool with streaming logs.

```typescript
const result = await client.executeWithStream(
  request,
  (log) => {
    console.log(`[${log.stream}] ${log.content}`);
  }
);
```

##### checkAccess(toolId, agentId?, phase?)

Check if access is allowed.

```typescript
const access = await client.checkAccess(
  'tool.prd.traceMatrix',
  'agent-coordinator',
  'prd'
);

if (access.allowed) {
  // Execute tool
}
```

### ToolServer

#### runToolServer(config)

Start tool server with handler.

```typescript
await runToolServer({
  manifest: toolManifest,
  handler: async (input, context) => {
    // Your logic
    return output;
  },
  validate_input: true,
  validate_output: true,
  logger: customLogger,
});
```

#### Handler Context

```typescript
interface ToolHandlerContext {
  runId: string;
  executionId: string;
  agentId?: string;
  phase?: string;
  traceId?: string;
  spanId?: string;
  logger: ToolLogger;
  secrets: Record<string, string>;
}
```

## Advanced Features

### Retry Logic

```typescript
import { withRetry, aggressiveRetryPolicy } from '@ideamine/tool-sdk';

const result = await withRetry(
  async () => {
    // Your operation
  },
  aggressiveRetryPolicy(),
  logger
);
```

### Circuit Breaker

```typescript
import { CircuitBreaker } from '@ideamine/tool-sdk';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 60000,
});

const result = await breaker.execute(async () => {
  // Your operation
});
```

### Telemetry

```typescript
import { ToolTelemetry } from '@ideamine/tool-sdk';

const telemetry = new ToolTelemetry('my-service', true);

const span = telemetry.startExecutionSpan(
  'tool.example',
  '1.0.0',
  executionId
);

try {
  // Your operation
  telemetry.recordSuccess(span, 'tool.example', '1.0.0', durationMs);
} catch (error) {
  telemetry.recordFailure(span, 'tool.example', '1.0.0', error);
} finally {
  telemetry.endSpan(span);
}
```

### Custom Validation

```typescript
import { SchemaValidator, assertValid } from '@ideamine/tool-sdk';

const validator = new SchemaValidator();

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number', minimum: 0 },
  },
  required: ['name'],
};

// Validate and throw on error
assertValid(validator, schema, data, 'Invalid input');

// Validate and check result
const result = validator.validate(schema, data);
if (!result.valid) {
  console.error(result.errors);
}
```

## Error Handling

All SDK errors extend `ToolSDKError`:

```typescript
import {
  ToolSDKError,
  ValidationError,
  ToolTimeoutError,
  ToolNotFoundError,
  AccessDeniedError,
  HTTPError,
  NetworkError,
} from '@ideamine/tool-sdk';

try {
  const result = await client.execute(request);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation failed:', error.errors);
  } else if (error instanceof ToolTimeoutError) {
    console.error('Timeout:', error.timeoutMs);
  } else if (error instanceof ToolNotFoundError) {
    console.error('Tool not found:', error.toolId, error.version);
  } else if (error instanceof AccessDeniedError) {
    console.error('Access denied:', error.toolId);
  } else if (error instanceof HTTPError) {
    console.error('HTTP error:', error.statusCode);
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
  }
}
```

## Best Practices

### For Agents

1. **Always check access before execution**
   ```typescript
   const access = await client.checkAccess(toolId, agentId, phase);
   if (!access.allowed) return;
   ```

2. **Set appropriate budgets**
   ```typescript
   budget: {
     ms: 60000,     // Reasonable timeout
     cost_usd: 0.10 // Cost limit
   }
   ```

3. **Handle errors gracefully**
   ```typescript
   if (!result.ok) {
     if (result.error.retryable) {
       // Retry logic
     } else {
       // Fail fast
     }
   }
   ```

4. **Use idempotence cache**
   ```typescript
   // Don't skip cache unless necessary
   skipCache: false
   ```

### For Tool Authors

1. **Validate inputs thoroughly**
   ```typescript
   validate_input: true
   ```

2. **Use structured logging**
   ```typescript
   context.logger.info('Processing', { itemCount: items.length });
   ```

3. **Handle errors explicitly**
   ```typescript
   try {
     // Your logic
   } catch (error) {
     context.logger.error('Failed', { error });
     throw error; // Will be caught and formatted
   }
   ```

4. **Keep handlers pure**
   ```typescript
   // Good: Pure function
   const handler = async (input, context) => {
     return processData(input);
   };

   // Bad: Side effects
   const handler = async (input, context) => {
     await writeToDatabase(input); // Don't do this
   };
   ```

5. **Document your schemas**
   ```typescript
   input_schema: {
     type: 'object',
     properties: {
       data: {
         type: 'array',
         description: 'Input data to process',
       },
     },
   }
   ```

## Examples

See the `/examples` directory for complete examples:

- `/examples/client-basic.ts` - Basic client usage
- `/examples/client-advanced.ts` - Advanced client patterns
- `/examples/server-basic.ts` - Basic tool server
- `/examples/server-with-secrets.ts` - Using secrets
- `/examples/retry-patterns.ts` - Retry strategies
- `/examples/telemetry.ts` - OTEL integration

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Test
npm test

# Clean
npm run clean
```

## License

MIT

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## Support

- Documentation: https://docs.ideamine.ai
- Issues: https://github.com/ideamine/tool-sdk/issues
- Discord: https://discord.gg/ideamine
