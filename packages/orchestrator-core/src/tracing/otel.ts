/**
 * OpenTelemetry Integration
 *
 * Provides distributed tracing for the IdeaMine orchestrator.
 * Integrates with Jaeger for trace visualization and analysis.
 *
 * Features:
 * - Automatic span creation for runs, phases, and tasks
 * - Trace context propagation across distributed workers
 * - Custom span attributes for orchestrator-specific metadata
 * - Error tracking and status recording
 * - Integration with existing logging infrastructure
 */

import { trace, context, SpanStatusCode, Span, Tracer, Context } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

/**
 * OpenTelemetry configuration
 */
export interface OTelConfig {
  /**
   * Service name for traces
   * Default: 'ideamine-orchestrator'
   */
  serviceName?: string;

  /**
   * Service version
   * Default: '1.0.0'
   */
  serviceVersion?: string;

  /**
   * Jaeger endpoint
   * Default: 'http://localhost:14268/api/traces'
   */
  jaegerEndpoint?: string;

  /**
   * Enable tracing
   * Default: true
   */
  enabled?: boolean;

  /**
   * Sample rate (0.0 to 1.0)
   * Default: 1.0 (sample all)
   */
  sampleRate?: number;

  /**
   * Use batch processor (recommended for production)
   * Default: true
   */
  useBatchProcessor?: boolean;

  /**
   * Environment (development, staging, production)
   */
  environment?: string;
}

/**
 * Span attribute keys
 */
export const SpanAttributes = {
  // Run attributes
  RUN_ID: 'ideamine.run.id',
  RUN_VERSION: 'ideamine.run.version',
  RUN_PLAN_HASH: 'ideamine.run.plan_hash',

  // Phase attributes
  PHASE_ID: 'ideamine.phase.id',
  PHASE_STATUS: 'ideamine.phase.status',
  PHASE_PARALLELISM: 'ideamine.phase.parallelism',

  // Task attributes
  TASK_ID: 'ideamine.task.id',
  TASK_TYPE: 'ideamine.task.type',
  TASK_TARGET: 'ideamine.task.target',
  TASK_RETRIES: 'ideamine.task.retries',

  // Agent attributes
  AGENT_NAME: 'ideamine.agent.name',
  AGENT_MODEL: 'ideamine.agent.model',

  // Tool attributes
  TOOL_ID: 'ideamine.tool.id',
  TOOL_VERSION: 'ideamine.tool.version',

  // Budget attributes
  TOKENS_USED: 'ideamine.budget.tokens_used',
  COST_USD: 'ideamine.budget.cost_usd',
  TOOLS_MINUTES: 'ideamine.budget.tools_minutes',

  // Gate attributes
  GATE_PASSED: 'ideamine.gate.passed',
  GATE_SCORE: 'ideamine.gate.score',
  GATE_RETRIES: 'ideamine.gate.retries',

  // Error attributes
  ERROR_TYPE: 'ideamine.error.type',
  ERROR_MESSAGE: 'ideamine.error.message',
  ERROR_STACK: 'ideamine.error.stack',
} as const;

/**
 * OpenTelemetry Tracer Wrapper
 *
 * Provides high-level tracing API for orchestrator components.
 */
export class OTelTracer {
  private tracer: Tracer;
  private provider: NodeTracerProvider | null = null;
  private config: Required<OTelConfig>;

  constructor(config: OTelConfig = {}) {
    this.config = {
      serviceName: config.serviceName ?? 'ideamine-orchestrator',
      serviceVersion: config.serviceVersion ?? '1.0.0',
      jaegerEndpoint: config.jaegerEndpoint ?? 'http://localhost:14268/api/traces',
      enabled: config.enabled ?? true,
      sampleRate: config.sampleRate ?? 1.0,
      useBatchProcessor: config.useBatchProcessor ?? true,
      environment: config.environment ?? process.env.NODE_ENV ?? 'development',
    };

    if (this.config.enabled) {
      this.initializeProvider();
    }

    this.tracer = trace.getTracer(
      this.config.serviceName,
      this.config.serviceVersion
    );
  }

  /**
   * Initialize OpenTelemetry provider with Jaeger exporter
   */
  private initializeProvider(): void {
    // Create resource with service information
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.environment,
    });

    // Create provider
    this.provider = new NodeTracerProvider({
      resource,
    });

    // Create Jaeger exporter
    const jaegerExporter = new JaegerExporter({
      endpoint: this.config.jaegerEndpoint,
    });

    // Add span processor
    const spanProcessor = this.config.useBatchProcessor
      ? new BatchSpanProcessor(jaegerExporter)
      : new SimpleSpanProcessor(jaegerExporter);

    this.provider.addSpanProcessor(spanProcessor);

    // Register provider
    this.provider.register();
  }

  /**
   * Start a run span
   *
   * Creates top-level span for entire orchestration run.
   *
   * @param runId - Run identifier
   * @param attributes - Additional attributes
   * @returns Span instance
   */
  startRunSpan(runId: string, attributes: Record<string, any> = {}): Span {
    const span = this.tracer.startSpan(`run.${runId}`, {
      attributes: {
        [SpanAttributes.RUN_ID]: runId,
        ...attributes,
      },
    });

    return span;
  }

  /**
   * Start a phase span
   *
   * Creates span for phase execution within a run.
   *
   * @param runId - Run identifier
   * @param phaseId - Phase identifier
   * @param parentSpan - Parent run span
   * @param attributes - Additional attributes
   * @returns Span instance
   */
  startPhaseSpan(
    runId: string,
    phaseId: string,
    parentSpan?: Span,
    attributes: Record<string, any> = {}
  ): Span {
    const parentContext = parentSpan
      ? trace.setSpan(context.active(), parentSpan)
      : context.active();

    const span = this.tracer.startSpan(
      `phase.${phaseId}`,
      {
        attributes: {
          [SpanAttributes.RUN_ID]: runId,
          [SpanAttributes.PHASE_ID]: phaseId,
          ...attributes,
        },
      },
      parentContext
    );

    return span;
  }

  /**
   * Start a task span
   *
   * Creates span for individual task (agent or tool) execution.
   *
   * @param runId - Run identifier
   * @param phaseId - Phase identifier
   * @param taskId - Task identifier
   * @param taskType - Task type (agent or tool)
   * @param target - Agent name or tool ID
   * @param parentSpan - Parent phase span
   * @param attributes - Additional attributes
   * @returns Span instance
   */
  startTaskSpan(
    runId: string,
    phaseId: string,
    taskId: string,
    taskType: 'agent' | 'tool',
    target: string,
    parentSpan?: Span,
    attributes: Record<string, any> = {}
  ): Span {
    const parentContext = parentSpan
      ? trace.setSpan(context.active(), parentSpan)
      : context.active();

    const span = this.tracer.startSpan(
      `task.${taskType}.${target}`,
      {
        attributes: {
          [SpanAttributes.RUN_ID]: runId,
          [SpanAttributes.PHASE_ID]: phaseId,
          [SpanAttributes.TASK_ID]: taskId,
          [SpanAttributes.TASK_TYPE]: taskType,
          [SpanAttributes.TASK_TARGET]: target,
          ...attributes,
        },
      },
      parentContext
    );

    return span;
  }

  /**
   * Start a tool span
   *
   * Creates span for tool invocation within a task.
   *
   * @param toolId - Tool identifier
   * @param toolVersion - Tool version
   * @param parentSpan - Parent task span
   * @param attributes - Additional attributes
   * @returns Span instance
   */
  startToolSpan(
    toolId: string,
    toolVersion: string,
    parentSpan?: Span,
    attributes: Record<string, any> = {}
  ): Span {
    const parentContext = parentSpan
      ? trace.setSpan(context.active(), parentSpan)
      : context.active();

    const span = this.tracer.startSpan(
      `tool.${toolId}`,
      {
        attributes: {
          [SpanAttributes.TOOL_ID]: toolId,
          [SpanAttributes.TOOL_VERSION]: toolVersion,
          ...attributes,
        },
      },
      parentContext
    );

    return span;
  }

  /**
   * Record event on span
   *
   * Adds event annotation to span timeline.
   *
   * @param span - Span to annotate
   * @param eventName - Event name
   * @param attributes - Event attributes
   */
  recordSpanEvent(
    span: Span,
    eventName: string,
    attributes?: Record<string, any>
  ): void {
    span.addEvent(eventName, attributes);
  }

  /**
   * Set span attributes
   *
   * Adds or updates span attributes.
   *
   * @param span - Span to update
   * @param attributes - Attributes to set
   */
  setSpanAttributes(span: Span, attributes: Record<string, any>): void {
    span.setAttributes(attributes);
  }

  /**
   * End span with success
   *
   * Marks span as successfully completed.
   *
   * @param span - Span to end
   * @param attributes - Final attributes
   */
  endSpan(span: Span, attributes?: Record<string, any>): void {
    if (attributes) {
      span.setAttributes(attributes);
    }
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  /**
   * End span with error
   *
   * Marks span as failed and records error details.
   *
   * @param span - Span to end
   * @param error - Error object
   */
  endSpanWithError(span: Span, error: Error): void {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });

    span.setAttributes({
      [SpanAttributes.ERROR_TYPE]: error.name,
      [SpanAttributes.ERROR_MESSAGE]: error.message,
      [SpanAttributes.ERROR_STACK]: error.stack || '',
    });

    span.recordException(error);
    span.end();
  }

  /**
   * Execute function with automatic span
   *
   * Wraps function execution in span with automatic error handling.
   *
   * @param spanName - Span name
   * @param fn - Function to execute
   * @param attributes - Span attributes
   * @returns Function result
   */
  async withSpan<T>(
    spanName: string,
    fn: (span: Span) => Promise<T>,
    attributes?: Record<string, any>
  ): Promise<T> {
    const span = this.tracer.startSpan(spanName, { attributes });

    try {
      const result = await fn(span);
      this.endSpan(span);
      return result;
    } catch (error) {
      this.endSpanWithError(span, error as Error);
      throw error;
    }
  }

  /**
   * Shutdown tracer provider
   *
   * Flushes pending spans and shuts down exporter.
   * Call on application shutdown.
   */
  async shutdown(): Promise<void> {
    if (this.provider) {
      await this.provider.shutdown();
    }
  }

  /**
   * Force flush pending spans
   *
   * Exports all pending spans immediately.
   * Useful before application shutdown.
   */
  async flush(): Promise<void> {
    if (this.provider) {
      await this.provider.forceFlush();
    }
  }
}

/**
 * Global tracer instance
 */
let globalTracer: OTelTracer | null = null;

/**
 * Initialize global tracer
 *
 * Should be called once at application startup.
 *
 * @param config - OpenTelemetry configuration
 * @returns Global tracer instance
 */
export function initializeTracer(config?: OTelConfig): OTelTracer {
  if (globalTracer) {
    throw new Error('Tracer already initialized');
  }

  globalTracer = new OTelTracer(config);
  return globalTracer;
}

/**
 * Get global tracer instance
 *
 * @returns Global tracer instance
 * @throws Error if tracer not initialized
 */
export function getTracer(): OTelTracer {
  if (!globalTracer) {
    throw new Error('Tracer not initialized. Call initializeTracer() first.');
  }

  return globalTracer;
}

/**
 * Check if tracer is initialized
 *
 * @returns True if tracer is initialized
 */
export function isTracerInitialized(): boolean {
  return globalTracer !== null;
}

/**
 * Shutdown global tracer
 *
 * Call on application shutdown.
 */
export async function shutdownTracer(): Promise<void> {
  if (globalTracer) {
    await globalTracer.shutdown();
    globalTracer = null;
  }
}

/**
 * Trace decorator for methods
 *
 * Automatically creates spans for decorated methods.
 *
 * @param spanName - Optional custom span name
 * @returns Method decorator
 */
export function Trace(spanName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      if (!isTracerInitialized()) {
        return originalMethod.apply(this, args);
      }

      const tracer = getTracer();
      const name = spanName || `${target.constructor.name}.${propertyKey}`;

      return tracer.withSpan(name, async (span) => {
        return originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}

/**
 * Export utilities
 */
export { Span, Context, SpanStatusCode };
