/**
 * IdeaMine Tools SDK - Tool Client
 * Client for agents to discover and execute tools
 */

import {
  ToolClientConfig,
  ToolSearchQuery,
  ToolSearchResult,
  ToolVersionInfo,
  ToolExecutionRequest,
  ToolExecutionResponse,
  ToolLogCallback,
  ToolLog,
  AccessCheckResponse,
  ToolExecutionMetrics,
} from '../types';
import { HTTPTransport, buildQueryString } from './http-transport';
import {
  ToolNotFoundError,
  ToolTimeoutError,
  AccessDeniedError,
  ConfigurationError,
  toToolExecutionError,
} from '../utils/errors';
import { generateExecutionId, computeInputHash } from '../utils/crypto';
import { ToolTelemetry } from '../utils/telemetry';
import { createClientLogger, WinstonToolLogger, NoOpLogger } from '../utils/logger';

// ============================================================================
// TOOL CLIENT
// ============================================================================

export class ToolClient {
  private transport: HTTPTransport;
  private registryTransport?: HTTPTransport;
  private telemetry: ToolTelemetry;
  private logger: WinstonToolLogger | NoOpLogger;
  private config: ToolClientConfig;

  constructor(config: ToolClientConfig) {
    this.config = config;

    // Validate configuration
    if (!config.gateway_url) {
      throw new ConfigurationError('gateway_url is required', 'gateway_url');
    }

    // Initialize logger
    this.logger = config.logger
      ? (config.logger as WinstonToolLogger)
      : (new NoOpLogger() as any);

    // Initialize telemetry
    this.telemetry = new ToolTelemetry(
      'ideamine-tools-client',
      config.enable_tracing ?? true
    );

    // Initialize HTTP transport for gateway
    this.transport = new HTTPTransport({
      baseURL: config.gateway_url,
      timeout: config.default_timeout_ms || 30000,
      apiKey: config.api_key,
      authToken: config.auth_token,
      retry: {
        maxAttempts: config.default_retry_attempts || 3,
      },
      logger: this.logger,
    });

    // Initialize registry transport if provided
    if (config.registry_url) {
      this.registryTransport = new HTTPTransport({
        baseURL: config.registry_url,
        timeout: 10000,
        apiKey: config.api_key,
        authToken: config.auth_token,
        logger: this.logger,
      });
    }

    this.logger.info('ToolClient initialized', {
      gateway_url: config.gateway_url,
      registry_url: config.registry_url,
    });
  }

  // ==========================================================================
  // DISCOVERY METHODS
  // ==========================================================================

  /**
   * Search for tools matching query
   */
  async searchTools(query: ToolSearchQuery): Promise<ToolSearchResult[]> {
    this.logger.debug('Searching tools', { query });

    try {
      const queryString = buildQueryString({
        q: query.q,
        capabilities: query.capabilities?.join(','),
        tags: query.tags?.join(','),
        runtime: query.runtime,
        owner: query.owner,
        limit: query.limit || 20,
        offset: query.offset || 0,
      });

      const transport = this.registryTransport || this.transport;
      const results = await transport.get<ToolSearchResult[]>(
        `/api/v1/tools/search${queryString}`
      );

      this.logger.info('Tool search completed', {
        query,
        resultCount: results.length,
      });

      return results;
    } catch (error) {
      this.logger.error('Tool search failed', {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get specific tool version information
   */
  async getTool(toolId: string, version: string): Promise<ToolVersionInfo> {
    this.logger.debug('Getting tool', { toolId, version });

    try {
      const transport = this.registryTransport || this.transport;
      const tool = await transport.get<ToolVersionInfo>(
        `/api/v1/tools/${encodeURIComponent(toolId)}/versions/${encodeURIComponent(version)}`
      );

      // Check if tool is deprecated
      if (tool.status === 'deprecated') {
        this.logger.warn('Tool is deprecated', {
          toolId,
          version,
          reason: tool.deprecation_reason,
        });
      }

      this.logger.info('Tool retrieved', { toolId, version, status: tool.status });

      return tool;
    } catch (error) {
      if ((error as any).statusCode === 404) {
        throw new ToolNotFoundError(toolId, version);
      }
      throw error;
    }
  }

  /**
   * Get latest version of a tool
   */
  async getLatestTool(toolId: string): Promise<ToolVersionInfo> {
    this.logger.debug('Getting latest tool version', { toolId });

    try {
      const transport = this.registryTransport || this.transport;
      const tool = await transport.get<ToolVersionInfo>(
        `/api/v1/tools/${encodeURIComponent(toolId)}/versions/latest`
      );

      this.logger.info('Latest tool retrieved', {
        toolId,
        version: tool.version,
      });

      return tool;
    } catch (error) {
      if ((error as any).statusCode === 404) {
        throw new ToolNotFoundError(toolId);
      }
      throw error;
    }
  }

  // ==========================================================================
  // EXECUTION METHODS
  // ==========================================================================

  /**
   * Execute a tool
   */
  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    const executionId = generateExecutionId();
    const startTime = Date.now();

    this.logger.info('Executing tool', {
      executionId,
      toolId: request.toolId,
      version: request.version,
      runId: request.runId,
    });

    // Start tracing span
    const span = this.telemetry.startExecutionSpan(
      request.toolId,
      request.version,
      executionId
    );

    try {
      // Check access if agent/phase provided
      if (request.agentId || request.phase) {
        const hasAccess = await this.checkAccess(
          request.toolId,
          request.agentId,
          request.phase
        );

        if (!hasAccess.allowed) {
          throw new AccessDeniedError(
            request.toolId,
            hasAccess.reason,
            { agentId: request.agentId, phase: request.phase }
          );
        }
      }

      // Prepare execution payload
      const payload = {
        tool_id: request.toolId,
        version: request.version,
        input: request.input,
        run_id: request.runId,
        execution_id: executionId,
        budget: request.budget,
        agent_id: request.agentId,
        phase: request.phase,
        trace_id: request.traceId || span.spanContext().traceId,
        span_id: request.spanId || span.spanContext().spanId,
        skip_cache: request.skipCache || false,
      };

      // Execute tool via gateway
      const response = await this.transport.post<ToolExecutionResponse>(
        '/api/v1/executions',
        payload,
        {
          timeout: request.budget?.ms || this.config.default_timeout_ms || 60000,
        }
      );

      const duration = Date.now() - startTime;

      // Record success
      this.telemetry.recordSuccess(
        span,
        request.toolId,
        request.version,
        duration,
        response.metrics.cost_usd
      );

      // Log cache hit
      if (response.cached) {
        this.logger.info('Tool execution returned from cache', {
          executionId,
          toolId: request.toolId,
        });
        this.telemetry.recordCacheHit(request.toolId, request.version);
      }

      this.logger.info('Tool execution completed', {
        executionId,
        toolId: request.toolId,
        ok: response.ok,
        cached: response.cached,
        duration_ms: duration,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Record failure
      this.telemetry.recordFailure(
        span,
        request.toolId,
        request.version,
        error instanceof Error ? error : new Error(String(error)),
        duration
      );

      this.logger.error('Tool execution failed', {
        executionId,
        toolId: request.toolId,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: duration,
      });

      // Return error response
      return {
        ok: false,
        executionId,
        error: toToolExecutionError(error),
        metrics: {
          duration_ms: duration,
          retry_count: 0,
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
        },
      };
    } finally {
      this.telemetry.endSpan(span);
    }
  }

  /**
   * Execute tool with streaming logs
   */
  async executeWithStream(
    request: ToolExecutionRequest,
    logCallback: ToolLogCallback
  ): Promise<ToolExecutionResponse> {
    const executionId = generateExecutionId();

    this.logger.info('Executing tool with streaming', {
      executionId,
      toolId: request.toolId,
    });

    // Start execution (non-blocking)
    const executionPromise = this.execute({ ...request });

    // Poll for logs
    const logPollingPromise = this.pollExecutionLogs(executionId, logCallback);

    // Wait for execution to complete
    const response = await executionPromise;

    // Stop log polling
    // Note: In production, you'd use WebSockets or Server-Sent Events
    // This is a simplified polling implementation

    return response;
  }

  /**
   * Poll for execution logs (simplified implementation)
   */
  private async pollExecutionLogs(
    executionId: string,
    callback: ToolLogCallback
  ): Promise<void> {
    let offset = 0;
    const pollIntervalMs = 500;
    const maxPolls = 120; // 1 minute max
    let polls = 0;

    while (polls < maxPolls) {
      try {
        const logs = await this.transport.get<ToolLog[]>(
          `/api/v1/executions/${executionId}/logs?offset=${offset}`
        );

        for (const log of logs) {
          callback(log);
          offset++;
        }

        if (logs.length === 0) {
          // No more logs, wait before next poll
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        polls++;
      } catch (error) {
        this.logger.warn('Log polling failed', {
          executionId,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }
  }

  // ==========================================================================
  // ACCESS CONTROL
  // ==========================================================================

  /**
   * Check if access is allowed to a tool
   */
  async checkAccess(
    toolId: string,
    agentId?: string,
    phase?: string
  ): Promise<AccessCheckResponse> {
    this.logger.debug('Checking tool access', { toolId, agentId, phase });

    try {
      const queryString = buildQueryString({
        tool_id: toolId,
        agent_id: agentId,
        phase,
      });

      const response = await this.transport.get<AccessCheckResponse>(
        `/api/v1/access/check${queryString}`
      );

      this.logger.debug('Access check result', {
        toolId,
        allowed: response.allowed,
      });

      return response;
    } catch (error) {
      this.logger.error('Access check failed', {
        toolId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fail closed - deny access on error
      return {
        allowed: false,
        reason: 'Access check failed',
      };
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Get execution status
   */
  async getExecutionStatus(executionId: string): Promise<ToolExecutionResponse> {
    this.logger.debug('Getting execution status', { executionId });

    try {
      const response = await this.transport.get<ToolExecutionResponse>(
        `/api/v1/executions/${executionId}`
      );

      return response;
    } catch (error) {
      this.logger.error('Failed to get execution status', {
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cancel execution
   */
  async cancelExecution(executionId: string): Promise<void> {
    this.logger.info('Cancelling execution', { executionId });

    try {
      await this.transport.post(`/api/v1/executions/${executionId}/cancel`);

      this.logger.info('Execution cancelled', { executionId });
    } catch (error) {
      this.logger.error('Failed to cancel execution', {
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update authentication
   */
  setAuthToken(token: string): void {
    this.transport.setAuthToken(token);
    if (this.registryTransport) {
      this.registryTransport.setAuthToken(token);
    }
  }

  /**
   * Update API key
   */
  setApiKey(apiKey: string): void {
    this.transport.setApiKey(apiKey);
    if (this.registryTransport) {
      this.registryTransport.setApiKey(apiKey);
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new ToolClient instance
 */
export function createToolClient(config: ToolClientConfig): ToolClient {
  return new ToolClient(config);
}
