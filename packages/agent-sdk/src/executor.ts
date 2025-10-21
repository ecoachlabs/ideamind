import { ToolInvocationContext, ToolInvocationResult } from './types';
import { ToolClient, ToolClientConfig } from '../../../tool-sdk/src/ts/client';

/**
 * ToolExecutor: Invokes tools via Tool Gateway
 *
 * Handles:
 * - Tool invocation via HTTP to Tool Gateway
 * - Timeout management
 * - Error handling and retries
 * - Cost tracking
 */
export class ToolExecutor {
  private toolClient: ToolClient;

  constructor(config?: Partial<ToolClientConfig>) {
    // Initialize ToolClient with Gateway URL
    this.toolClient = new ToolClient({
      gateway_url: process.env.TOOL_GATEWAY_URL || config?.gateway_url || 'http://localhost:8000',
      registry_url: process.env.TOOL_REGISTRY_URL || config?.registry_url,
      api_key: process.env.TOOL_API_KEY || config?.api_key,
      auth_token: process.env.TOOL_AUTH_TOKEN || config?.auth_token,
      default_timeout_ms: 60000,
      default_retry_attempts: 3,
      enable_tracing: true,
      enable_metrics: true,
    });
  }

  /**
   * Invoke a tool via Tool Gateway
   */
  async invoke(context: ToolInvocationContext): Promise<ToolInvocationResult> {
    const startTime = Date.now();

    try {
      console.log(`[ToolExecutor] Invoking tool: ${context.toolId} (version: ${context.toolVersion})`);

      // Execute tool via ToolClient
      const response = await this.toolClient.execute({
        toolId: context.toolId,
        version: context.toolVersion,
        input: context.input,
        runId: context.workflowRunId,
        agentId: context.agentId,
        phase: context.phase,
        budget: {
          ms: context.timeout || 60000,
          cost_usd: context.budget?.maxCostUsd,
        },
        skipCache: false,
      });

      if (response.ok) {
        console.log(`[ToolExecutor] Tool executed successfully (cached: ${response.cached})`);

        return {
          success: true,
          output: response.output || {},
          costUsd: response.metrics.cost_usd || 0,
          durationMs: response.metrics.duration_ms,
          exitCode: 0,
          cached: response.cached,
          executionId: response.executionId,
          artifacts: response.artifacts,
        };
      } else {
        console.error(`[ToolExecutor] Tool execution failed:`, response.error);

        return {
          success: false,
          output: {},
          costUsd: response.metrics.cost_usd || 0,
          durationMs: response.metrics.duration_ms,
          error: response.error?.message || 'Tool execution failed',
          errorType: response.error?.type,
        };
      }
    } catch (error) {
      console.error(`[ToolExecutor] Tool invocation error:`, error);

      return {
        success: false,
        output: {},
        costUsd: 0,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        errorType: 'runtime',
      };
    }
  }
}
