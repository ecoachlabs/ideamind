/**
 * IdeaMine Tools SDK - OpenTelemetry Integration
 * Tracing and metrics for tool executions
 */

import {
  trace,
  Span,
  SpanStatusCode,
  Tracer,
  Context,
  context,
} from '@opentelemetry/api';
import {
  Counter,
  Histogram,
  metrics,
  MeterProvider,
} from '@opentelemetry/api';

// ============================================================================
// TELEMETRY CLASS
// ============================================================================

export class ToolTelemetry {
  private tracer: Tracer;
  private enabled: boolean;

  // Metrics
  private executionCounter?: Counter;
  private durationHistogram?: Histogram;
  private costCounter?: Counter;

  constructor(serviceName: string = 'ideamine-tools', enabled: boolean = true) {
    this.enabled = enabled;

    if (this.enabled) {
      this.tracer = trace.getTracer(serviceName, '1.0.0');
      this.initializeMetrics(serviceName);
    } else {
      // No-op tracer when disabled
      this.tracer = trace.getTracer('noop');
    }
  }

  /**
   * Initialize OpenTelemetry metrics
   */
  private initializeMetrics(serviceName: string): void {
    const meter = metrics.getMeter(serviceName, '1.0.0');

    // Counter: Total tool executions
    this.executionCounter = meter.createCounter('tool.executions.total', {
      description: 'Total number of tool executions',
    });

    // Histogram: Execution duration
    this.durationHistogram = meter.createHistogram('tool.execution.duration', {
      description: 'Tool execution duration in milliseconds',
      unit: 'ms',
    });

    // Counter: Total cost
    this.costCounter = meter.createCounter('tool.execution.cost', {
      description: 'Total cost of tool executions in USD',
      unit: 'usd',
    });
  }

  /**
   * Start a new span for tool execution
   */
  startExecutionSpan(
    toolName: string,
    version: string,
    executionId: string,
    parentContext?: Context
  ): Span {
    if (!this.enabled) {
      return trace.getTracer('noop').startSpan('noop');
    }

    const ctx = parentContext || context.active();

    return this.tracer.startSpan(
      `tool.execute.${toolName}`,
      {
        attributes: {
          'tool.name': toolName,
          'tool.version': version,
          'tool.execution.id': executionId,
        },
      },
      ctx
    );
  }

  /**
   * Record successful execution
   */
  recordSuccess(
    span: Span,
    toolName: string,
    version: string,
    durationMs: number,
    costUsd?: number
  ): void {
    if (!this.enabled) return;

    span.setStatus({ code: SpanStatusCode.OK });
    span.setAttribute('tool.execution.duration_ms', durationMs);

    if (costUsd !== undefined) {
      span.setAttribute('tool.execution.cost_usd', costUsd);
    }

    // Record metrics
    this.executionCounter?.add(1, {
      'tool.name': toolName,
      'tool.version': version,
      'tool.status': 'success',
    });

    this.durationHistogram?.record(durationMs, {
      'tool.name': toolName,
      'tool.version': version,
    });

    if (costUsd !== undefined) {
      this.costCounter?.add(costUsd, {
        'tool.name': toolName,
        'tool.version': version,
      });
    }
  }

  /**
   * Record failed execution
   */
  recordFailure(
    span: Span,
    toolName: string,
    version: string,
    error: Error,
    durationMs?: number
  ): void {
    if (!this.enabled) return;

    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });

    span.recordException(error);
    span.setAttribute('tool.error.type', error.name);
    span.setAttribute('tool.error.message', error.message);

    if (durationMs !== undefined) {
      span.setAttribute('tool.execution.duration_ms', durationMs);
    }

    // Record metrics
    this.executionCounter?.add(1, {
      'tool.name': toolName,
      'tool.version': version,
      'tool.status': 'failure',
      'tool.error.type': error.name,
    });

    if (durationMs !== undefined) {
      this.durationHistogram?.record(durationMs, {
        'tool.name': toolName,
        'tool.version': version,
        'tool.status': 'failure',
      });
    }
  }

  /**
   * Record cached execution (idempotence hit)
   */
  recordCacheHit(toolName: string, version: string): void {
    if (!this.enabled) return;

    this.executionCounter?.add(1, {
      'tool.name': toolName,
      'tool.version': version,
      'tool.status': 'cached',
    });
  }

  /**
   * Add custom attributes to active span
   */
  addAttributes(attributes: Record<string, string | number | boolean>): void {
    if (!this.enabled) return;

    const span = trace.getActiveSpan();
    if (span) {
      Object.entries(attributes).forEach(([key, value]) => {
        span.setAttribute(key, value);
      });
    }
  }

  /**
   * Add event to active span
   */
  addEvent(name: string, attributes?: Record<string, any>): void {
    if (!this.enabled) return;

    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }

  /**
   * End a span
   */
  endSpan(span: Span): void {
    if (!this.enabled) return;
    span.end();
  }

  /**
   * Execute function within a span
   */
  async withSpan<T>(
    name: string,
    attributes: Record<string, any>,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    if (!this.enabled) {
      return fn(trace.getTracer('noop').startSpan('noop'));
    }

    const span = this.tracer.startSpan(name, { attributes });

    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract trace ID and span ID from active context
 */
export function getTraceContext(): { traceId?: string; spanId?: string } {
  const span = trace.getActiveSpan();

  if (!span) {
    return {};
  }

  const spanContext = span.spanContext();

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

/**
 * Inject trace context into metadata
 */
export function injectTraceContext(
  metadata: Record<string, any>
): Record<string, any> {
  const { traceId, spanId } = getTraceContext();

  return {
    ...metadata,
    ...(traceId && { trace_id: traceId }),
    ...(spanId && { span_id: spanId }),
  };
}

// ============================================================================
// SINGLETON INSTANCE (optional convenience)
// ============================================================================

export const defaultTelemetry = new ToolTelemetry('ideamine-tools', true);
