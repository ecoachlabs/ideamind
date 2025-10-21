"""
IdeaMine Tools SDK - Python Telemetry
OpenTelemetry integration for distributed tracing
"""

import os
from typing import Any, Dict, Optional
from contextlib import contextmanager

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes
from opentelemetry.trace import Span, Status, StatusCode, SpanKind
import structlog


class TelemetryManager:
    """OpenTelemetry manager for tool tracing"""

    def __init__(
        self,
        enabled: bool,
        service_name: str,
        endpoint: Optional[str] = None,
        logger: Optional[structlog.BoundLogger] = None
    ):
        self.enabled = enabled
        self.logger = logger or structlog.get_logger()
        self.tracer: Optional[trace.Tracer] = None
        self.provider: Optional[TracerProvider] = None

        if self.enabled:
            try:
                # Create resource with service information
                resource = Resource.create({
                    ResourceAttributes.SERVICE_NAME: service_name,
                    ResourceAttributes.SERVICE_VERSION: "1.0.0",
                })

                # Initialize provider
                self.provider = TracerProvider(resource=resource)

                # Configure exporter
                otlp_endpoint = (
                    endpoint or
                    os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT") or
                    "http://localhost:4318/v1/traces"
                )
                exporter = OTLPSpanExporter(endpoint=otlp_endpoint)

                # Add batch processor
                self.provider.add_span_processor(BatchSpanProcessor(exporter))

                # Register provider
                trace.set_tracer_provider(self.provider)

                # Get tracer
                self.tracer = trace.get_tracer(service_name)

                self.logger.info(
                    "OpenTelemetry initialized",
                    service=service_name,
                    endpoint=otlp_endpoint
                )
            except Exception as e:
                self.logger.error("Failed to initialize OpenTelemetry", error=str(e))
                self.enabled = False

    def start_execution_span(
        self,
        tool_name: str,
        version: str,
        run_id: str,
        attributes: Optional[Dict[str, Any]] = None
    ) -> Optional[Span]:
        """Start a new span for tool execution"""
        if not self.enabled or not self.tracer:
            return None

        try:
            span = self.tracer.start_span(
                f"tool.execute.{tool_name}",
                kind=SpanKind.INTERNAL,
                attributes={
                    "tool.name": tool_name,
                    "tool.version": version,
                    "run.id": run_id,
                    **(attributes or {})
                }
            )
            return span
        except Exception as e:
            self.logger.error("Failed to start span", error=str(e))
            return None

    def start_validation_span(
        self,
        schema_type: str,
        tool_name: str
    ) -> Optional[Span]:
        """Start a span for validation"""
        if not self.enabled or not self.tracer:
            return None

        try:
            span = self.tracer.start_span(
                f"tool.validate.{schema_type}",
                kind=SpanKind.INTERNAL,
                attributes={
                    "validation.type": schema_type,
                    "tool.name": tool_name,
                }
            )
            return span
        except Exception as e:
            self.logger.error("Failed to start validation span", error=str(e))
            return None

    def end_span(self, span: Optional[Span], attributes: Optional[Dict[str, Any]] = None) -> None:
        """End span with success"""
        if not span:
            return

        try:
            if attributes:
                span.set_attributes(attributes)
            span.set_status(Status(StatusCode.OK))
            span.end()
        except Exception as e:
            self.logger.error("Failed to end span", error=str(e))

    def end_span_with_error(self, span: Optional[Span], error: Exception) -> None:
        """End span with error"""
        if not span:
            return

        try:
            span.set_status(
                Status(StatusCode.ERROR, description=str(error))
            )
            span.record_exception(error)
            span.end()
        except Exception as e:
            self.logger.error("Failed to end span with error", error=str(e))

    def add_event(
        self,
        span: Optional[Span],
        name: str,
        attributes: Optional[Dict[str, Any]] = None
    ) -> None:
        """Add event to current span"""
        if not span:
            return

        try:
            span.add_event(name, attributes=attributes or {})
        except Exception as e:
            self.logger.error("Failed to add event to span", error=str(e))

    def shutdown(self) -> None:
        """Shutdown telemetry gracefully"""
        if self.provider:
            try:
                self.provider.shutdown()
                self.logger.info("OpenTelemetry shutdown complete")
            except Exception as e:
                self.logger.error("Failed to shutdown OpenTelemetry", error=str(e))

    @contextmanager
    def trace_execution(
        self,
        tool_name: str,
        version: str,
        run_id: str,
        attributes: Optional[Dict[str, Any]] = None
    ):
        """Context manager for automatic span tracking"""
        span = self.start_execution_span(tool_name, version, run_id, attributes)
        try:
            yield span
            self.end_span(span)
        except Exception as e:
            self.end_span_with_error(span, e)
            raise
