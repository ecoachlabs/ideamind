/**
 * Tracing Module
 *
 * OpenTelemetry integration for distributed tracing.
 */

export {
  OTelTracer,
  OTelConfig,
  SpanAttributes,
  initializeTracer,
  getTracer,
  isTracerInitialized,
  shutdownTracer,
  Trace,
  Span,
  Context,
  SpanStatusCode,
} from './otel';
