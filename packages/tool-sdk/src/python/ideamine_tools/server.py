"""
IdeaMine Tools SDK - Python Tool Server
Wrapper for tool authors to implement handlers
"""

import sys
import json
import time
from typing import Any, Callable, Optional, Awaitable, Union

import structlog

from .types import (
    ToolConfig,
    HandlerInput,
    HandlerOutput,
    HandlerContext,
    ArtifactType,
    ExecutionError as ExecutionErrorType,
)
from .logger import create_logger
from .telemetry import TelemetryManager
from .validator import SchemaValidator


# Type alias for handler functions
HandlerFunc = Union[
    Callable[[Any, Optional[HandlerContext]], Any],
    Callable[[Any, Optional[HandlerContext]], Awaitable[Any]]
]


class ToolServer:
    """Server wrapper for tool handlers"""

    def __init__(
        self,
        config: ToolConfig,
        handler: HandlerFunc,
        logger: Optional[structlog.BoundLogger] = None,
        telemetry_enabled: bool = False,
        telemetry_service_name: Optional[str] = None,
        telemetry_endpoint: Optional[str] = None,
    ):
        self.config = config
        self.handler = handler
        self.logger = logger or create_logger(f"tool-server:{config.name}")
        self.validator = SchemaValidator(self.logger)

        # Initialize telemetry
        self.telemetry = TelemetryManager(
            enabled=telemetry_enabled,
            service_name=telemetry_service_name or f"tool:{config.name}",
            endpoint=telemetry_endpoint,
            logger=self.logger,
        )

        # Validate configuration
        self.validator.validate_tool_config(config.dict())

        self.logger.info(
            "ToolServer initialized",
            name=config.name,
            version=config.version,
            runtime=config.runtime.value,
        )

    async def start(self) -> None:
        """Start server and listen for stdin/stdout protocol"""
        self.logger.info(
            "ToolServer starting",
            name=self.config.name,
            version=self.config.version,
        )

        try:
            # Read input from stdin
            input_data = sys.stdin.read()
            payload = json.loads(input_data)

            # Execute handler
            result = await self._execute(payload)

            # Write output to stdout
            sys.stdout.write(json.dumps(result.dict()) + "\n")
            sys.stdout.flush()

            # Graceful shutdown
            await self._shutdown()
            sys.exit(0)

        except Exception as error:
            self.logger.error("Fatal error in tool execution", error=str(error))

            # Write error to stdout
            error_output = HandlerOutput(
                ok=False,
                error=ExecutionErrorType(
                    code="INTERNAL_ERROR",
                    message=str(error),
                    details=getattr(error, "details", None),
                )
            )

            sys.stdout.write(json.dumps(error_output.dict()) + "\n")
            sys.stdout.flush()

            await self._shutdown()
            sys.exit(1)

    async def _execute(self, payload: dict) -> HandlerOutput:
        """Execute handler with validation and telemetry"""
        start_time = time.time()
        handler_input = HandlerInput(**payload)
        run_id = handler_input.context.run_id if handler_input.context else "unknown"

        span = self.telemetry.start_execution_span(
            self.config.name,
            self.config.version,
            run_id,
            {
                "agent_id": handler_input.context.agent_id if handler_input.context else None,
                "phase": handler_input.context.phase if handler_input.context else None,
                "trace_id": handler_input.context.trace_id if handler_input.context else None,
            }
        )

        try:
            self.logger.info(
                "Executing handler",
                name=self.config.name,
                version=self.config.version,
                run_id=run_id,
            )

            # Validate input
            self.telemetry.add_event(span, "validation.input.start")
            validation_span = self.telemetry.start_validation_span(
                "input", self.config.name
            )

            try:
                validated_input = self.validator.validate_input(
                    handler_input.input,
                    self.config.input_schema,
                    self.config.name
                )
                self.telemetry.end_span(validation_span)
            except Exception as e:
                self.telemetry.end_span_with_error(validation_span, e)
                raise

            self.telemetry.add_event(span, "validation.input.complete")

            # Execute handler
            self.telemetry.add_event(span, "handler.execute.start")

            # Handle both sync and async handlers
            import asyncio
            import inspect

            if inspect.iscoroutinefunction(self.handler):
                output = await self.handler(validated_input, handler_input.context)
            else:
                output = self.handler(validated_input, handler_input.context)

            self.telemetry.add_event(span, "handler.execute.complete")

            # Validate output
            self.telemetry.add_event(span, "validation.output.start")
            output_validation_span = self.telemetry.start_validation_span(
                "output", self.config.name
            )

            try:
                validated_output = self.validator.validate_output(
                    output,
                    self.config.output_schema,
                    self.config.name
                )
                self.telemetry.end_span(output_validation_span)
            except Exception as e:
                self.telemetry.end_span_with_error(output_validation_span, e)
                raise

            self.telemetry.add_event(span, "validation.output.complete")

            duration = int((time.time() - start_time) * 1000)

            self.logger.info(
                "Handler execution succeeded",
                name=self.config.name,
                duration=duration,
            )

            self.telemetry.end_span(span, {"duration_ms": duration, "success": True})

            return HandlerOutput(ok=True, output=validated_output)

        except Exception as error:
            duration = int((time.time() - start_time) * 1000)

            self.logger.error(
                "Handler execution failed",
                name=self.config.name,
                error=str(error),
                duration=duration,
            )

            self.telemetry.end_span_with_error(span, error)

            return HandlerOutput(
                ok=False,
                error=ExecutionErrorType(
                    code=getattr(error, "code", "HANDLER_ERROR"),
                    message=str(error),
                    details=getattr(error, "details", None),
                )
            )

    def create_artifact(
        self,
        name: str,
        type: ArtifactType,
        data: Optional[Any] = None,
        uri: Optional[str] = None
    ) -> dict:
        """Helper for handlers to create artifacts"""
        return {
            "name": name,
            "type": type.value,
            "data": data,
            "uri": uri,
        }

    async def _shutdown(self) -> None:
        """Shutdown server gracefully"""
        self.telemetry.shutdown()
        self.logger.info("ToolServer shutdown complete")


async def run_tool_handler(
    config: ToolConfig,
    handler: HandlerFunc,
    logger: Optional[structlog.BoundLogger] = None,
    telemetry_enabled: bool = False,
    telemetry_service_name: Optional[str] = None,
    telemetry_endpoint: Optional[str] = None,
) -> None:
    """
    Helper function to run a tool handler

    Args:
        config: Tool configuration
        handler: Handler function (sync or async)
        logger: Optional logger
        telemetry_enabled: Enable OpenTelemetry
        telemetry_service_name: Service name for telemetry
        telemetry_endpoint: OTLP endpoint
    """
    server = ToolServer(
        config=config,
        handler=handler,
        logger=logger,
        telemetry_enabled=telemetry_enabled,
        telemetry_service_name=telemetry_service_name,
        telemetry_endpoint=telemetry_endpoint,
    )
    await server.start()
