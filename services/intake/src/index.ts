import { createIntakeClassifierAgent } from './intake-classifier-agent';
import { AgentInput } from '@ideamine/agent-sdk';
import { WorkflowState } from '@ideamine/event-schemas';

/**
 * Example: Running the intake classifier agent
 *
 * This demonstrates how to:
 * 1. Create an agent instance
 * 2. Prepare agent input
 * 3. Execute the agent
 * 4. Handle the output
 */
async function main() {
  console.log('=== IdeaMine Intake Service Example ===\n');

  // Create agent instance
  const agent = createIntakeClassifierAgent();

  // Prepare agent input
  const input: AgentInput = {
    workflowRunId: 'wf-001-example',
    phase: 'intake',
    artifacts: [
      {
        artifactId: 'idea-spec-001',
        type: 'IDEA_SPEC' as any,
        version: 1,
      },
    ],
    budget: {
      maxCostUsd: 100.0,
      currentCostUsd: 0,
      maxTokens: 1000000,
      currentTokens: 0,
      maxRetries: 3,
    },
    metadata: {
      userId: 'user-123',
      timestamp: new Date().toISOString(),
    },
  };

  try {
    console.log('Executing intake classifier agent...\n');

    // Execute agent
    const output = await agent.execute(input);

    console.log('\n=== Agent Execution Complete ===\n');
    console.log('Success:', output.success);
    console.log('Cost:', `$${output.costUsd.toFixed(4)}`);
    console.log('Tokens Used:', output.tokensUsed);
    console.log('Duration:', `${output.durationMs}ms`);
    console.log('Artifacts Generated:', output.artifacts.length);

    if (output.toolsInvoked && output.toolsInvoked.length > 0) {
      console.log('Tools Invoked:', output.toolsInvoked.join(', '));
    }

    if (output.error) {
      console.error('Error:', output.error);
    }

    console.log('\nArtifacts:', JSON.stringify(output.artifacts, null, 2));
  } catch (error) {
    console.error('Failed to execute agent:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export * from './intake-classifier-agent';
