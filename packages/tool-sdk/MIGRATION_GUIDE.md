# Migration Guide - Resolving Type Conflicts

## Overview

The new SDK implementation is complete but needs type reconciliation with existing files. This guide provides step-by-step instructions to resolve conflicts.

## Option 1: Clean Slate (Recommended)

### Step 1: Backup Legacy Files
```bash
cd /mnt/c/Users/victo/Ideamind/packages/tool-sdk
mkdir -p src/legacy
mv src/client.ts src/legacy/
mv src/server.ts src/legacy/
mv src/logger.ts src/legacy/
mv src/telemetry.ts src/legacy/
mv src/validator.ts src/legacy/
mv src/registry-client.ts src/legacy/
mv src/tool-interface.ts src/legacy/
mv src/tool-metadata.ts src/legacy/
mv src/types.ts src/legacy/
```

### Step 2: Update Main Index
```bash
# The main index.ts should already point to ts/index.ts
# Verify src/index.ts exists and exports from ts/
```

### Step 3: Install Dependencies
```bash
npm install
```

### Step 4: Build
```bash
npm run clean
npm run build
```

## Option 2: Gradual Migration

### Step 1: Add Missing Type Exports

Edit `/packages/tool-sdk/src/ts/types/index.ts` and add any missing exports:

```typescript
// Add these type aliases for backward compatibility
export type ToolClientConfig = {
  gateway_url: string;
  registry_url?: string;
  api_key?: string;
  auth_token?: string;
  default_timeout_ms?: number;
  default_retry_attempts?: number;
  enable_tracing?: boolean;
  enable_metrics?: boolean;
  logger?: ToolLogger;
};

export type ToolSearchQuery = {
  q?: string;
  capabilities?: string[];
  tags?: string[];
  runtime?: 'docker' | 'wasm';
  owner?: string;
  limit?: number;
  offset?: number;
};

export type ToolVersionInfo = {
  id: string;
  tool_id: string;
  name: string;
  version: string;
  manifest: ToolManifest;
  status: 'draft' | 'published' | 'deprecated' | 'archived';
  sbom?: SBOM;
  signature?: string;
  digest?: string;
  published_at?: string;
  deprecated_at?: string;
  deprecation_reason?: string;
  changelog?: string;
  breaking_changes?: string[];
};

export type ToolExecutionRequest = {
  toolId: string;
  version: string;
  input: Record<string, any>;
  runId: string;
  budget?: {
    ms?: number;
    cost_usd?: number;
  };
  agentId?: string;
  phase?: string;
  traceId?: string;
  spanId?: string;
  skipCache?: boolean;
};

export type ToolExecutionResponse = {
  ok: boolean;
  output?: Record<string, any>;
  artifacts?: ToolArtifact[];
  metrics: ToolExecutionMetrics;
  error?: ToolExecutionError;
  executionId: string;
  cached?: boolean;
};

export type ToolExecutionMetrics = {
  duration_ms: number;
  cpu_ms?: number;
  memory_peak_mb?: number;
  cost_usd?: number;
  retry_count: number;
  started_at: string;
  completed_at: string;
};

export type ToolLog = {
  execution_id: string;
  stream: 'stdout' | 'stderr';
  line_number: number;
  content: string;
  timestamp: string;
};

export type ToolLogCallback = (log: ToolLog) => void;

export type AccessCheckResponse = {
  allowed: boolean;
  reason?: string;
  allowlist?: ToolAllowlist;
};

export interface ToolLogger {
  debug(message: string, meta?: Record<string, any>): void;
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
}
```

### Step 2: Update tsconfig.json

Ensure Node.js types are included:

```json
{
  "compilerOptions": {
    "types": ["node"],
    "lib": ["ES2020"]
  }
}
```

### Step 3: Incremental Build

Test each component:

```bash
# Test types
npm run typecheck -- --noEmit src/ts/types/index.ts

# Test utils
npm run typecheck -- --noEmit src/ts/utils/*.ts

# Test client
npm run typecheck -- --noEmit src/ts/client/*.ts

# Test server
npm run typecheck -- --noEmit src/ts/server/*.ts

# Full build
npm run build
```

## Quick Fix Commands

### Fix: Missing @types/node
```bash
npm install --save-dev @types/node
```

### Fix: Unused imports
Enable or disable in tsconfig.json:
```json
{
  "compilerOptions": {
    "noUnusedLocals": false,
    "noUnusedParameters": false
  }
}
```

### Fix: Implicit any
Add explicit types or disable:
```json
{
  "compilerOptions": {
    "noImplicitAny": false
  }
}
```

## Verification Checklist

After migration:

- [ ] `npm run typecheck` passes without errors
- [ ] `npm run build` completes successfully
- [ ] `npm run lint` passes (or warnings only)
- [ ] Examples compile: `tsc examples/*.ts --noEmit`
- [ ] Unit tests pass: `npm test` (if tests exist)
- [ ] Client example runs: `node dist/examples/client-example.js`
- [ ] Server example runs: `node dist/examples/server-example.js`

## Testing the SDK

### Test Client
```bash
# Set environment variables
export IDEAMINE_GATEWAY_URL="http://localhost:8080"
export IDEAMINE_API_KEY="your-api-key"

# Run client example
node dist/examples/client-example.js
```

### Test Server
```bash
# Send test input via stdin
echo '{"input":{"text":"Hello world"}}' | node dist/examples/server-example.js
```

Expected output:
```json
{"ok":true,"output":{"word_count":2,"sentence_count":1,...}}
```

## Common Issues

### Issue: Cannot find module 'axios'
**Solution**: `npm install axios`

### Issue: Cannot find module 'winston'
**Solution**: `npm install winston`

### Issue: Cannot find module '@opentelemetry/api'
**Solution**: `npm install @opentelemetry/api`

### Issue: Type conflicts between files
**Solution**: Use Option 1 (Clean Slate) to remove legacy files

### Issue: Build output missing
**Solution**: Check `outDir` in tsconfig.json matches `main` in package.json

## Next Steps

After successful migration:

1. **Write Tests**: Add Jest tests for client and server
2. **Documentation**: Update inline documentation
3. **Examples**: Add more comprehensive examples
4. **CI/CD**: Set up GitHub Actions for automated testing
5. **Publishing**: Prepare for npm publication

## Support

If you encounter issues:

1. Check the IMPLEMENTATION_SUMMARY.md for architecture details
2. Review the README.md for usage examples
3. Examine the examples/ directory for working code
4. Check TypeScript compiler output for specific errors

## Rollback

To rollback to legacy implementation:

```bash
# Restore legacy files
mv src/legacy/* src/

# Remove new implementation
rm -rf src/ts/client src/ts/server

# Rebuild
npm run clean
npm run build
```
