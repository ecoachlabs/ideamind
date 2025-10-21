/**
 * IdeaMine Tools SDK - OpenTelemetry Integration
 * Distributed tracing for tool executions
 */

import { trace, context, Span, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { Logger } from './types';

export interface TelemetryConfig {
  enabled: boolean;
  serviceName: string;
  endpoint?: string;
  sampleRate?: number;
}

export class TelemetryManager {
  private provider?: NodeTracerProvider;
  private tracer: any;
  private enabled: boolean;
  private logger: Logger;

  constructor(config: TelemetryConfig, logger: Logger) {
    this.enabled = config.enabled;
    this.logger = logger;

    if (this.enabled) {
      try {
        // Create resource with service information
        const resource = Resource.default().merge(
          new Resource({
            [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
            [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
          })
        );

        // Initialize provider
        this.provider = new NodeTracerProvider({
          resource,
        });

        // Configure exporter
        const endpoint = config.endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';
        const exporter = new OTLPTraceExporter({
          url: endpoint,
        });

        // Add batch processor
        this.provider.addSpanProcessor(new BatchSpanProcessor(exporter));

        // Register provider
        this.provider.register();

        // Get tracer
        this.tracer = trace.getTracer(config.serviceName);

        this.logger.info('OpenTelemetry initialized', {
          service: config.serviceName,
          endpoint,
        });
      } catch (error) {
        this.logger.error('Failed to initialize OpenTelemetry', { error });
        this.enabled = false;
      }
    }
  }

  /**
   * Start a new span for a tool execution
   */
  startExecutionSpan(
    toolName: string,
    version: string,
    runId: string,
    attributes?: Record<string, any>
  ): Span | null {
    if (!this.enabled || !this.tracer) {
      return null;
    }

    try {
      const span = this.tracer.startSpan(
        `tool.execute.${toolName}`,
        {
          kind: SpanKind.INTERNAL,
          attributes: {
            'tool.name': toolName,
            'tool.version': version,
            'run.id': runId,
            ...attributes,
          },
        }
      );

      return span;
    } catch (error) {
      this.logger.error('Failed to start span', { error });
      return null;
    }
  }

  /**
   * Start a span for validation
   */
  startValidationSpan(
    schemaType: 'input' | 'output',
    toolName: string
  ): Span | null {
    if (!this.enabled || !this.tracer) {
      return null;
    }

    try {
      const span = this.tracer.startSpan(
        `tool.validate.${schemaType}`,
        {
          kind: SpanKind.INTERNAL,
          attributes: {
            'validation.type': schemaType,
            'tool.name': toolName,
          },
        }
      );

      return span;
    } catch (error) {
      this.logger.error('Failed to start validation span', { error });
      return null;
    }
  }

  /**
   * End span with success
   */
  endSpan(span: Span | null, attributes?: Record<string, any>): void {
    if (!span) return;

    try {
      if (attributes) {
        span.setAttributes(attributes);
      }
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    } catch (error) {
      this.logger.error('Failed to end span', { error });
    }
  }

  /**
   * End span with error
   */
  endSpanWithError(span: Span | null, error: Error | string): void {
    if (!span) return;

    try {
      const errorMessage = typeof error === 'string' ? error : error.message;
      const errorStack = typeof error === 'string' ? undefined : error.stack;

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage,
      });

      span.recordException({
        name: 'ToolError',
        message: errorMessage,
        stack: errorStack,
      } as any);

      span.end();
    } catch (err) {
      this.logger.error('Failed to end span with error', { err });
    }
  }

  /**
   * Add event to current span
   */
  addEvent(span: Span | null, name: string, attributes?: Record<string, any>): void {
    if (!span) return;

    try {
      span.addEvent(name, attributes);
    } catch (error) {
      this.logger.error('Failed to add event to span', { error });
    }
  }

  /**
   * Shutdown telemetry gracefully
   */
  async shutdown(): Promise<void> {
    if (this.provider) {
      try {
        await this.provider.shutdown();
        this.logger.info('OpenTelemetry shutdown complete');
      } catch (error) {
        this.logger.error('Failed to shutdown OpenTelemetry', { error });
      }
    }
  }
}

/**
 * Helper to run function with automatic span tracking
 */
export async function withSpan<T>(
  telemetry: TelemetryManager,
  spanName: string,
  attributes: Record<string, any>,
  fn: (span: Span | null) => Promise<T>
): Promise<T> {
  const span = telemetry.startExecutionSpan(spanName, '1.0.0', 'unknown', attributes);

  try {
    const result = await fn(span);
    telemetry.endSpan(span);
    return result;
  } catch (error) {
    telemetry.endSpanWithError(span, error as Error);
    throw error;
  }
}
