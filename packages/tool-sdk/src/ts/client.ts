/**
 * IdeaMine Tools SDK - Tool Client
 * Client for agents to discover and invoke tools
 */

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import {
  ToolClientOptions,
  ExecutionRequest,
  ExecutionResult,
  ExecutionStatus,
  ToolSearchRequest,
  ToolSearchResult,
  ToolWithVersion,
  Logger,
  ExecutionError,
  TimeoutError,
  NotFoundError,
  AccessDeniedError,
} from './types';
import { createLogger } from './logger';
import { TelemetryManager } from './telemetry';
import { SchemaValidator } from './validator';

export class ToolClient {
  private registryClient: AxiosInstance;
  private runnerClient: AxiosInstance;
  private logger: Logger;
  private telemetry: TelemetryManager;
  private validator: SchemaValidator;
  private options: ToolClientOptions;

  constructor(options: ToolClientOptions) {
    this.options = options;
    this.logger = options.logger || createLogger('tool-client');
    this.validator = new SchemaValidator(this.logger);

    // Initialize HTTP clients
    this.registryClient = axios.create({
      baseURL: options.registryUrl,
      timeout: options.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(options.apiKey && { Authorization: `Bearer ${options.apiKey}` }),
      },
    });

    this.runnerClient = axios.create({
      baseURL: options.runnerUrl,
      timeout: options.timeout || 120000,
      headers: {
        'Content-Type': 'application/json',
        ...(options.apiKey && { Authorization: `Bearer ${options.apiKey}` }),
      },
    });

    // Initialize telemetry
    this.telemetry = new TelemetryManager(
      {
        enabled: options.telemetry?.enabled || false,
        serviceName: options.telemetry?.serviceName || 'tool-client',
        endpoint: options.telemetry?.endpoint,
      },
      this.logger
    );

    this.logger.info('ToolClient initialized', {
      registryUrl: options.registryUrl,
      runnerUrl: options.runnerUrl,
      telemetry: options.telemetry?.enabled || false,
    });
  }

  /**
   * Search for tools by query and capabilities
   */
  async search(request: ToolSearchRequest): Promise<ToolSearchResult[]> {
    const span = this.telemetry.startExecutionSpan(
      'tool.search',
      '1.0.0',
      'client',
      { query: request.query }
    );

    try {
      this.logger.info('Searching for tools', request);

      const response = await this.registryClient.get('/tools/search', {
        params: {
          q: request.query,
          capabilities: request.capabilities?.join(','),
          tags: request.tags?.join(','),
          runtime: request.runtime,
          limit: request.limit || 20,
          offset: request.offset || 0,
        },
      });

      const results = response.data.results || [];
      this.logger.info('Tools search completed', {
        count: results.length,
        query: request.query,
      });

      this.telemetry.endSpan(span, { result_count: results.length });
      return results;
    } catch (error) {
      this.logger.error('Tool search failed', { error, request });
      this.telemetry.endSpanWithError(span, error as Error);
      throw this.handleError(error);
    }
  }

  /**
   * Get tool by name and version
   */
  async get(name: string, version?: string): Promise<ToolWithVersion> {
    const span = this.telemetry.startExecutionSpan(
      'tool.get',
      version || 'latest',
      'client',
      { tool_name: name }
    );

    try {
      this.logger.info('Getting tool', { name, version });

      const endpoint = version
        ? `/tools/${name}@${version}`
        : `/tools/${name}@latest`;

      const response = await this.registryClient.get(endpoint);

      if (!response.data) {
        throw new NotFoundError(`Tool not found: ${name}@${version || 'latest'}`);
      }

      this.logger.info('Tool retrieved', {
        name: response.data.name,
        version: response.data.version_info.version,
      });

      this.telemetry.endSpan(span, {
        tool_id: response.data.id,
        version: response.data.version_info.version,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to get tool', { error, name, version });
      this.telemetry.endSpanWithError(span, error as Error);
      throw this.handleError(error);
    }
  }

  /**
   * Execute a tool with input
   */
  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    const executionId = uuidv4();
    const startTime = Date.now();

    // Create comprehensive span
    const span = this.telemetry.startExecutionSpan(
      request.toolId,
      request.version,
      request.runId,
      {
        execution_id: executionId,
        agent_id: request.agentId,
        phase: request.phase,
        trace_id: request.context?.trace_id,
      }
    );

    try {
      this.logger.info('Executing tool', {
        executionId,
        toolId: request.toolId,
        version: request.version,
        runId: request.runId,
        agentId: request.agentId,
        phase: request.phase,
      });

      // Get tool metadata for validation
      const tool = await this.get(request.toolId, request.version);

      // Validate input
      this.telemetry.addEvent(span, 'validation.input.start');
      const validationSpan = this.telemetry.startValidationSpan('input', request.toolId);

      try {
        this.validator.validateInput(
          request.input,
          tool.version_info.input_schema,
          request.toolId
        );
        this.telemetry.endSpan(validationSpan);
      } catch (error) {
        this.telemetry.endSpanWithError(validationSpan, error as Error);
        throw error;
      }

      this.telemetry.addEvent(span, 'validation.input.complete');

      // Compute input hash for idempotence
      const inputHash = this.computeInputHash(tool.version_info.id, request.input);

      // Execute via runner
      this.telemetry.addEvent(span, 'execution.start');

      const response = await this.runnerClient.post(
        '/execute',
        {
          execution_id: executionId,
          tool_id: tool.id,
          tool_version_id: tool.version_info.id,
          tool_name: request.toolId,
          tool_version: request.version,
          input: request.input,
          input_hash: inputHash,
          run_id: request.runId,
          agent_id: request.agentId,
          phase: request.phase,
          budget: request.budget,
          context: {
            trace_id: request.context?.trace_id || span?.spanContext?.().traceId,
            span_id: request.context?.span_id || span?.spanContext?.().spanId,
          },
        },
        {
          timeout: request.budget?.ms || tool.version_info.timeout_ms,
        }
      );

      const result: ExecutionResult = response.data;

      // Validate output if succeeded
      if (result.ok && result.output) {
        this.telemetry.addEvent(span, 'validation.output.start');
        const outputValidationSpan = this.telemetry.startValidationSpan('output', request.toolId);

        try {
          this.validator.validateOutput(
            result.output,
            tool.version_info.output_schema,
            request.toolId
          );
          this.telemetry.endSpan(outputValidationSpan);
        } catch (error) {
          this.telemetry.endSpanWithError(outputValidationSpan, error as Error);
          throw error;
        }

        this.telemetry.addEvent(span, 'validation.output.complete');
      }

      const duration = Date.now() - startTime;

      this.logger.info('Tool execution completed', {
        executionId,
        toolId: request.toolId,
        status: result.status,
        duration,
        cached: result.cached,
      });

      this.telemetry.endSpan(span, {
        execution_id: executionId,
        status: result.status,
        duration_ms: duration,
        cached: result.cached || false,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error('Tool execution failed', {
        executionId,
        toolId: request.toolId,
        error,
        duration,
      });

      this.telemetry.endSpanWithError(span, error as Error);

      // Handle timeout
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        throw new TimeoutError('Tool execution timeout', {
          executionId,
          toolId: request.toolId,
          timeout: request.budget?.ms,
        });
      }

      throw this.handleError(error);
    }
  }

  /**
   * Execute tool with automatic retries
   */
  async runWithRetry(
    request: ExecutionRequest,
    maxRetries?: number
  ): Promise<ExecutionResult> {
    const retries = maxRetries ?? this.options.retryAttempts ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          this.logger.info('Retrying tool execution', {
            attempt,
            maxRetries: retries,
            backoffMs: backoff,
            toolId: request.toolId,
          });

          await new Promise(resolve => setTimeout(resolve, backoff));
        }

        return await this.run(request);
      } catch (error) {
        lastError = error as Error;

        // Don't retry validation errors or access denied
        if (
          error instanceof NotFoundError ||
          error instanceof AccessDeniedError
        ) {
          throw error;
        }

        if (attempt === retries) {
          this.logger.error('Tool execution failed after retries', {
            toolId: request.toolId,
            attempts: retries + 1,
            error,
          });
        }
      }
    }

    throw lastError || new ExecutionError('Tool execution failed after retries');
  }

  /**
   * Check if agent has access to tool
   */
  async checkAccess(
    toolId: string,
    agentId: string,
    phase?: string
  ): Promise<boolean> {
    try {
      const response = await this.registryClient.post('/tools/check-access', {
        tool_id: toolId,
        agent_id: agentId,
        phase,
      });

      return response.data.has_access || false;
    } catch (error) {
      this.logger.error('Failed to check tool access', { error, toolId, agentId });
      return false;
    }
  }

  /**
   * Compute hash for idempotence
   */
  private computeInputHash(versionId: string, input: any): string {
    const payload = JSON.stringify({
      version_id: versionId,
      input,
    });

    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Handle and normalize errors
   */
  private handleError(error: any): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      if (status === 404) {
        return new NotFoundError(message);
      } else if (status === 403) {
        return new AccessDeniedError(message);
      } else if (status === 408 || error.code === 'ECONNABORTED') {
        return new TimeoutError(message);
      } else {
        return new ExecutionError(message, {
          status,
          details: error.response?.data,
        });
      }
    }

    return error;
  }

  /**
   * Shutdown client gracefully
   */
  async shutdown(): Promise<void> {
    await this.telemetry.shutdown();
    this.logger.info('ToolClient shutdown complete');
  }
}
