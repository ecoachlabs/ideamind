/**
 * Example: Using ToolClient to discover and execute tools
 */

import { ToolClient, ToolExecutionRequest } from '@ideamine/tool-sdk';

async function main() {
  // Initialize the client
  const client = new ToolClient({
    gateway_url: process.env.IDEAMINE_GATEWAY_URL || 'http://localhost:8080',
    api_key: process.env.IDEAMINE_API_KEY,
    enable_tracing: true,
    default_timeout_ms: 30000,
    default_retry_attempts: 3,
  });

  console.log('=== Tool Discovery Example ===\n');

  // Search for tools
  const tools = await client.searchTools({
    q: 'traceability',
    capabilities: ['prd', 'traceability'],
    limit: 5,
  });

  console.log(`Found ${tools.length} tools:`);
  tools.forEach((tool) => {
    console.log(`  - ${tool.name} v${tool.version}`);
    console.log(`    ${tool.summary}`);
    console.log(`    Capabilities: ${tool.capabilities.join(', ')}`);
  });

  console.log('\n=== Tool Execution Example ===\n');

  // Get specific tool
  const toolInfo = await client.getTool('tool.prd.traceMatrix', '1.2.0');
  console.log(`Tool: ${toolInfo.name} v${toolInfo.version}`);
  console.log(`Status: ${toolInfo.status}`);
  console.log(`Runtime: ${toolInfo.manifest.runtime}`);

  // Check access
  const access = await client.checkAccess(
    'tool.prd.traceMatrix',
    'agent-coordinator',
    'prd'
  );

  if (!access.allowed) {
    console.error('Access denied:', access.reason);
    return;
  }

  console.log('Access granted');

  // Execute tool
  const request: ToolExecutionRequest = {
    toolId: 'tool.prd.traceMatrix',
    version: '1.2.0',
    input: {
      use_cases: [
        { id: 'UC-1', title: 'User Registration' },
        { id: 'UC-2', title: 'User Login' },
      ],
      stories: [
        { id: 'US-1', title: 'As a user, I want to register' },
        { id: 'US-2', title: 'As a user, I want to login' },
        { id: 'US-3', title: 'As a user, I want to reset password' },
      ],
    },
    runId: `run-${Date.now()}`,
    budget: {
      ms: 60000,
      cost_usd: 0.10,
    },
    agentId: 'agent-coordinator',
    phase: 'prd',
  };

  console.log('\nExecuting tool...');
  const result = await client.execute(request);

  if (result.ok) {
    console.log('✓ Execution succeeded');
    console.log('Output:', JSON.stringify(result.output, null, 2));
    console.log('\nMetrics:');
    console.log(`  Duration: ${result.metrics.duration_ms}ms`);
    console.log(`  Cost: $${result.metrics.cost_usd || 0}`);
    console.log(`  Cached: ${result.cached || false}`);

    if (result.artifacts && result.artifacts.length > 0) {
      console.log('\nArtifacts:');
      result.artifacts.forEach((artifact) => {
        console.log(`  - ${artifact.name} (${artifact.type})`);
        console.log(`    URI: ${artifact.storage_uri}`);
        console.log(`    Size: ${artifact.size_bytes} bytes`);
      });
    }
  } else {
    console.error('✗ Execution failed');
    console.error('Error:', result.error);
    console.error(`  Type: ${result.error?.type}`);
    console.error(`  Message: ${result.error?.message}`);
    console.error(`  Retryable: ${result.error?.retryable}`);
  }

  console.log('\n=== Streaming Execution Example ===\n');

  // Execute with streaming logs
  const streamResult = await client.executeWithStream(request, (log) => {
    console.log(`[${log.stream}] ${log.content}`);
  });

  console.log(`\nStream execution completed: ${streamResult.ok ? 'success' : 'failure'}`);
}

// Run example
main().catch((error) => {
  console.error('Example failed:', error);
  process.exit(1);
});
