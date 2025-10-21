/**
 * IdeaMine Tools SDK - Tool Server
 * Wrapper for tool authors to implement handlers
 */

import { stdin, stdout } from 'process';
import { createInterface } from 'readline';
import {
  ToolServerOptions,
  ToolHandler,
  HandlerInput,
  HandlerOutput,
  Logger,
  ArtifactType,
} from './types';
import { createLogger } from './logger';
import { TelemetryManager } from './telemetry';
import { SchemaValidator } from './validator';

export class ToolServer {
  private handler: ToolHandler;
  private logger: Logger;
  private telemetry: TelemetryManager;
  private validator: SchemaValidator;
  private options: ToolServerOptions;

  constructor(options: ToolServerOptions) {
    this.options = options;
    this.handler = options.handler;
    this.logger = options.logger || createLogger(`tool-server:${options.config.name}`);
    this.validator = new SchemaValidator(this.logger);

    // Initialize telemetry
    this.telemetry = new TelemetryManager(
      {
        enabled: options.telemetry?.enabled || false,
        serviceName: options.telemetry?.serviceName || `tool:${options.config.name}`,
        endpoint: options.telemetry?.endpoint,
      },
      this.logger
    );

    // Validate configuration
    this.validator.validateToolConfig(options.config);

    this.logger.info('ToolServer initialized', {
      name: options.config.name,
      version: options.config.version,
      runtime: options.config.runtime,
    });
  }

  /**
   * Start server and listen for stdin/stdout protocol
   */
  async start(): Promise<void> {
    this.logger.info('ToolServer starting', {
      name: this.options.config.name,
      version: this.options.config.version,
    });

    // Read input from stdin
    const rl = createInterface({
      input: stdin,
      output: process.stderr, // Use stderr for logs, stdout for results
      terminal: false,
    });

    let inputBuffer = '';

    rl.on('line', (line) => {
      inputBuffer += line;
    });

    rl.on('close', async () => {
      try {
        // Parse input
        const payload = JSON.parse(inputBuffer);
        const result = await this.execute(payload);

        // Write output to stdout
        stdout.write(JSON.stringify(result) + '\n');

        // Graceful shutdown
        await this.shutdown();
        process.exit(0);
      } catch (error) {
        this.logger.error('Fatal error in tool execution', { error });

        // Write error to stdout
        const errorOutput: HandlerOutput = {
          ok: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : String(error),
            details: error instanceof Error ? error.stack : undefined,
          },
        };

        stdout.write(JSON.stringify(errorOutput) + '\n');

        await this.shutdown();
        process.exit(1);
      }
    });
  }

  /**
   * Execute handler with validation and telemetry
   */
  private async execute(payload: HandlerInput): Promise<HandlerOutput> {
    const startTime = Date.now();
    const runId = payload.context?.run_id || 'unknown';

    const span = this.telemetry.startExecutionSpan(
      this.options.config.name,
      this.options.config.version,
      runId,
      {
        agent_id: payload.context?.agent_id,
        phase: payload.context?.phase,
        trace_id: payload.context?.trace_id,
      }
    );

    try {
      this.logger.info('Executing handler', {
        name: this.options.config.name,
        version: this.options.config.version,
        runId,
      });

      // Validate input
      this.telemetry.addEvent(span, 'validation.input.start');
      const validationSpan = this.telemetry.startValidationSpan(
        'input',
        this.options.config.name
      );

      let validatedInput: any;
      try {
        validatedInput = this.validator.validateInput(
          payload.input,
          this.options.config.input_schema,
          this.options.config.name
        );
        this.telemetry.endSpan(validationSpan);
      } catch (error) {
        this.telemetry.endSpanWithError(validationSpan, error as Error);
        throw error;
      }

      this.telemetry.addEvent(span, 'validation.input.complete');

      // Execute handler
      this.telemetry.addEvent(span, 'handler.execute.start');

      const output = await this.handler(validatedInput, payload.context);

      this.telemetry.addEvent(span, 'handler.execute.complete');

      // Validate output
      this.telemetry.addEvent(span, 'validation.output.start');
      const outputValidationSpan = this.telemetry.startValidationSpan(
        'output',
        this.options.config.name
      );

      let validatedOutput: any;
      try {
        validatedOutput = this.validator.validateOutput(
          output,
          this.options.config.output_schema,
          this.options.config.name
        );
        this.telemetry.endSpan(outputValidationSpan);
      } catch (error) {
        this.telemetry.endSpanWithError(outputValidationSpan, error as Error);
        throw error;
      }

      this.telemetry.addEvent(span, 'validation.output.complete');

      const duration = Date.now() - startTime;

      this.logger.info('Handler execution succeeded', {
        name: this.options.config.name,
        duration,
      });

      this.telemetry.endSpan(span, {
        duration_ms: duration,
        success: true,
      });

      return {
        ok: true,
        output: validatedOutput,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error('Handler execution failed', {
        name: this.options.config.name,
        error,
        duration,
      });

      this.telemetry.endSpanWithError(span, error as Error);

      return {
        ok: false,
        error: {
          code: error instanceof Error && 'code' in error
            ? (error as any).code
            : 'HANDLER_ERROR',
          message: error instanceof Error ? error.message : String(error),
          details: error instanceof Error ? error.stack : undefined,
        },
      };
    }
  }

  /**
   * Helper for handlers to create artifacts
   */
  createArtifact(
    name: string,
    type: ArtifactType,
    data?: any,
    uri?: string
  ): { name: string; type: ArtifactType; data?: any; uri?: string } {
    return {
      name,
      type,
      data,
      uri,
    };
  }

  /**
   * Shutdown server gracefully
   */
  private async shutdown(): Promise<void> {
    await this.telemetry.shutdown();
    this.logger.info('ToolServer shutdown complete');
  }
}

/**
 * Helper function to run a tool handler
 */
export async function runToolHandler(
  options: ToolServerOptions
): Promise<void> {
  const server = new ToolServer(options);
  await server.start();
}
