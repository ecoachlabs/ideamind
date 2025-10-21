/**
 * IdeaMine Tools SDK - Tool Server
 * Server wrapper for tool handlers (stdin/stdout protocol)
 */

import {
  ToolServerConfig,
  ToolHandler,
  ToolHandlerContext,
  ToolLogger,
  ToolManifest,
} from '../types';
import { SchemaValidator, assertValid } from '../validation/schema-validator';
import {
  StdinHandler,
  StdoutWriter,
  createStdinHandler,
  createStdoutWriter,
} from './stdin-handler';
import { createServerLogger, createExecutionLogger } from './logger';
import { toToolExecutionError } from '../utils/errors';
import { generateExecutionId } from '../utils/crypto';

// ============================================================================
// TOOL SERVER
// ============================================================================

export class ToolServer {
  private manifest: ToolManifest;
  private handler: ToolHandler;
  private validator: SchemaValidator;
  private logger: ToolLogger;
  private validateInput: boolean;
  private validateOutput: boolean;
  private resolvedInputSchema?: any;
  private resolvedOutputSchema?: any;

  constructor(config: ToolServerConfig) {
    this.manifest = config.manifest;
    this.handler = config.handler;
    this.validateInput = config.validate_input ?? true;
    this.validateOutput = config.validate_output ?? true;

    // Initialize validator
    this.validator = new SchemaValidator();

    // Initialize logger
    this.logger =
      config.logger ||
      createServerLogger(
        this.manifest.name,
        this.manifest.version,
        process.env.LOG_LEVEL || 'info'
      );

    this.logger.info('ToolServer initialized', {
      tool: this.manifest.name,
      version: this.manifest.version,
      runtime: this.manifest.runtime,
    });
  }

  /**
   * Start server and process stdin/stdout
   */
  async start(): Promise<void> {
    this.logger.info('ToolServer starting', {
      tool: this.manifest.name,
      version: this.manifest.version,
    });

    const stdinHandler = createStdinHandler(this.logger);
    const stdoutWriter = createStdoutWriter(this.logger);

    try {
      // Read input from stdin
      const message = await stdinHandler.readMessage();

      this.logger.debug('Received input message');

      // Process request
      const result = await this.handleRequest(message.input);

      // Write output to stdout
      if (result.ok) {
        stdoutWriter.writeSuccess(result.output!);
      } else {
        stdoutWriter.writeError(result.error!);
      }

      this.logger.info('Request processed successfully');
    } catch (error) {
      this.logger.error('Fatal error processing request', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Write error to stdout
      stdoutWriter.writeError(toToolExecutionError(error));
    } finally {
      stdinHandler.close();
      stdoutWriter.flush();
    }
  }

  /**
   * Handle a single request (can be used for testing)
   */
  async handleRequest(input: any): Promise<{
    ok: boolean;
    output?: Record<string, any>;
    error?: {
      type: string;
      message: string;
      stack?: string;
      retryable: boolean;
    };
  }> {
    const executionId = generateExecutionId();
    const startTime = Date.now();

    this.logger.info('Handling request', { execution_id: executionId });

    // MEDIUM FIX: Enforce timeout from manifest
    const timeoutMs = (this.manifest as any).timeout_seconds
      ? (this.manifest as any).timeout_seconds * 1000
      : 300000; // Default 5 minutes

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Tool execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      // Validate input schema
      if (this.validateInput) {
        this.logger.debug('Validating input schema');

        const inputSchema = await this.resolveSchema(
          this.manifest.input_schema,
          'input'
        );

        if (inputSchema) {
          assertValid(
            this.validator,
            inputSchema,
            input,
            'Input validation failed'
          );
        }

        this.logger.debug('Input validation passed');
      }

      // Create handler context
      const context: ToolHandlerContext = {
        runId: (input._context?.runId as string) || 'unknown',
        executionId,
        agentId: input._context?.agentId,
        phase: input._context?.phase,
        traceId: input._context?.traceId,
        spanId: input._context?.spanId,
        logger: createExecutionLogger(this.logger, {
          runId: (input._context?.runId as string) || 'unknown',
          executionId,
          agentId: input._context?.agentId,
          phase: input._context?.phase,
          logger: this.logger,
          secrets: {},
        }),
        secrets: input._context?.secrets || {},
      };

      // Remove internal context from input
      const { _context, ...cleanInput } = input;

      // Execute handler with timeout enforcement
      this.logger.info('Executing handler');
      const output = await Promise.race([
        this.handler(cleanInput, context),
        timeoutPromise,
      ]);

      // Validate output schema
      if (this.validateOutput) {
        this.logger.debug('Validating output schema');

        const outputSchema = await this.resolveSchema(
          this.manifest.output_schema,
          'output'
        );

        if (outputSchema) {
          assertValid(
            this.validator,
            outputSchema,
            output,
            'Output validation failed'
          );
        }

        this.logger.debug('Output validation passed');
      }

      const duration = Date.now() - startTime;

      this.logger.info('Handler execution succeeded', {
        execution_id: executionId,
        duration_ms: duration,
      });

      return {
        ok: true,
        output: output as Record<string, any>,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error('Handler execution failed', {
        execution_id: executionId,
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        ok: false,
        error: toToolExecutionError(error),
      };
    }
  }

  /**
   * Get tool manifest
   */
  getManifest(): ToolManifest {
    return this.manifest;
  }

  /**
   * Get tool name
   */
  getToolName(): string {
    return this.manifest.name;
  }

  /**
   * Get tool version
   */
  getToolVersion(): string {
    return this.manifest.version;
  }

  /**
   * Resolve JSON Schema $ref pointers
   *
   * Handles both internal references (#/definitions/...) and external file references.
   * Results are cached to avoid redundant resolution.
   */
  private async resolveSchema(
    schema: any,
    schemaType: 'input' | 'output'
  ): Promise<any> {
    // Check cache
    if (schemaType === 'input' && this.resolvedInputSchema) {
      return this.resolvedInputSchema;
    }
    if (schemaType === 'output' && this.resolvedOutputSchema) {
      return this.resolvedOutputSchema;
    }

    // If no $ref, return as-is
    if (typeof schema !== 'object' || !schema || !('$ref' in schema)) {
      return schema;
    }

    try {
      // Try to use @apidevtools/json-schema-ref-parser if available
      const $RefParser = await import('@apidevtools/json-schema-ref-parser').catch(() => null);

      if ($RefParser) {
        this.logger.debug(`Resolving ${schemaType} schema $ref using json-schema-ref-parser`);
        const resolved = await $RefParser.default.dereference(schema);

        // Cache result
        if (schemaType === 'input') {
          this.resolvedInputSchema = resolved;
        } else {
          this.resolvedOutputSchema = resolved;
        }

        return resolved;
      }

      // Fallback: Simple internal $ref resolution
      this.logger.warn(`@apidevtools/json-schema-ref-parser not available, using simple $ref resolution`);
      const resolved = this.resolveInternalRef(schema, this.manifest);

      // Cache result
      if (schemaType === 'input') {
        this.resolvedInputSchema = resolved;
      } else {
        this.resolvedOutputSchema = resolved;
      }

      return resolved;
    } catch (error) {
      this.logger.error(`Failed to resolve ${schemaType} schema $ref`, {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return original schema if resolution fails
      return schema;
    }
  }

  /**
   * Simple internal $ref resolution for #/definitions/... patterns
   */
  private resolveInternalRef(schema: any, manifest: any): any {
    if (typeof schema !== 'object' || !schema) {
      return schema;
    }

    if ('$ref' in schema) {
      const ref = schema.$ref as string;

      // Handle #/definitions/... pattern
      if (ref.startsWith('#/definitions/')) {
        const defName = ref.substring('#/definitions/'.length);

        // Try to find in input_schema definitions
        if (manifest.input_schema?.definitions?.[defName]) {
          return manifest.input_schema.definitions[defName];
        }

        // Try to find in output_schema definitions
        if (manifest.output_schema?.definitions?.[defName]) {
          return manifest.output_schema.definitions[defName];
        }

        this.logger.warn(`Could not resolve internal $ref: ${ref}`);
        return schema;
      }

      // External refs not supported in fallback
      this.logger.warn(`External $ref not supported without json-schema-ref-parser: ${ref}`);
      return schema;
    }

    // Recursively resolve nested schemas
    const resolved: any = Array.isArray(schema) ? [] : {};
    for (const key in schema) {
      resolved[key] = this.resolveInternalRef(schema[key], manifest);
    }

    return resolved;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new ToolServer instance
 */
export function createToolServer(config: ToolServerConfig): ToolServer {
  return new ToolServer(config);
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

/**
 * Run tool server with handler
 * This is the main entry point for tool authors
 */
export async function runToolServer(config: ToolServerConfig): Promise<void> {
  const server = new ToolServer(config);
  await server.start();
}

/**
 * Create simple tool handler wrapper
 */
export function createHandler<TInput = any, TOutput = any>(
  handler: (input: TInput, context: ToolHandlerContext) => Promise<TOutput> | TOutput
): ToolHandler<TInput, TOutput> {
  return handler;
}
