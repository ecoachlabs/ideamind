"""
IdeaMine Tools SDK - Python ToolServer
Server wrapper for tool handlers (stdin/stdout protocol)
"""

import sys
import json
import structlog
from typing import Dict, Any, Optional
from jsonschema import validate, ValidationError as JsonSchemaValidationError

from .types import (
    ToolServerConfig,
    ToolHandler,
    ToolHandlerContext,
    ToolManifest,
    ToolLogger,
)


class ToolServer:
    """Server for tool handlers (stdin/stdout protocol)"""

    def __init__(self, config: ToolServerConfig):
        self.manifest = config.manifest
        self.handler = config.handler
        self.validate_input = config.validate_input
        self.validate_output = config.validate_output

        # Initialize logger
        self.logger = config.logger or structlog.get_logger()

        self.logger.info(
            "ToolServer initialized",
            tool=self.manifest.name,
            version=self.manifest.version,
            runtime=self.manifest.runtime.value,
        )

    def start(self):
        """Start server and process stdin/stdout"""
        self.logger.info("ToolServer starting", tool=self.manifest.name, version=self.manifest.version)

        try:
            # Read input from stdin
            input_data = self._read_stdin()

            self.logger.debug("Received input message")

            # Process request
            result = self.handle_request(input_data.get("input", {}))

            # Write output to stdout
            if result["ok"]:
                self._write_stdout({"ok": True, "output": result["output"]})
            else:
                self._write_stdout({"ok": False, "error": result["error"]})

            self.logger.info("Request processed successfully")

        except Exception as e:
            self.logger.error("Fatal error processing request", error=str(e))

            # Write error to stdout
            self._write_stdout({
                "ok": False,
                "error": {
                    "type": "runtime",
                    "message": str(e),
                    "retryable": False,
                }
            })
            sys.exit(1)

    def handle_request(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle a single request (can be used for testing)"""
        self.logger.info("Handling request")

        try:
            # Validate input schema
            if self.validate_input:
                self.logger.debug("Validating input schema")

                try:
                    validate(instance=input_data, schema=self.manifest.input_schema)
                except JsonSchemaValidationError as e:
                    raise ToolValidationError(f"Input validation failed: {e.message}")

                self.logger.debug("Input validation passed")

            # Extract context
            context_data = input_data.get("_context", {})

            # Create handler context
            context = ToolHandlerContext(
                runId=context_data.get("runId", "unknown"),
                executionId=context_data.get("executionId", "unknown"),
                agentId=context_data.get("agentId"),
                phase=context_data.get("phase"),
                traceId=context_data.get("traceId"),
                spanId=context_data.get("spanId"),
                logger=self.logger,
                secrets=context_data.get("secrets", {}),
            )

            # Remove internal context from input
            clean_input = {k: v for k, v in input_data.items() if k != "_context"}

            # Execute handler
            self.logger.info("Executing handler")
            output = self.handler(clean_input, context)

            # Validate output schema
            if self.validate_output:
                self.logger.debug("Validating output schema")

                try:
                    validate(instance=output, schema=self.manifest.output_schema)
                except JsonSchemaValidationError as e:
                    raise ToolValidationError(f"Output validation failed: {e.message}")

                self.logger.debug("Output validation passed")

            self.logger.info("Handler execution succeeded")

            return {"ok": True, "output": output}

        except ToolValidationError as e:
            self.logger.error("Validation error", error=str(e))
            return {
                "ok": False,
                "error": {
                    "type": "validation",
                    "message": str(e),
                    "retryable": False,
                }
            }

        except Exception as e:
            self.logger.error("Handler execution failed", error=str(e))
            return {
                "ok": False,
                "error": {
                    "type": "runtime",
                    "message": str(e),
                    "stack": self._get_stack_trace(e),
                    "retryable": False,
                }
            }

    def _read_stdin(self) -> Dict[str, Any]:
        """Read JSON from stdin"""
        try:
            data = sys.stdin.read()
            return json.loads(data)
        except json.JSONDecodeError as e:
            raise ToolProtocolError(f"Invalid JSON in stdin: {e}")

    def _write_stdout(self, data: Dict[str, Any]):
        """Write JSON to stdout"""
        try:
            json.dump(data, sys.stdout)
            sys.stdout.flush()
        except Exception as e:
            self.logger.error("Failed to write to stdout", error=str(e))
            raise

    def _get_stack_trace(self, exception: Exception) -> Optional[str]:
        """Get stack trace from exception"""
        import traceback
        return "".join(traceback.format_exception(type(exception), exception, exception.__traceback__))


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def run_tool_server(config: ToolServerConfig):
    """Run tool server with handler - main entry point for tool authors"""
    server = ToolServer(config)
    server.start()


def create_handler(fn):
    """Decorator to create a tool handler"""
    return fn


# ============================================================================
# EXCEPTIONS
# ============================================================================

class ToolProtocolError(Exception):
    """Protocol error (stdin/stdout)"""
    pass


class ToolValidationError(Exception):
    """Validation error"""
    pass


# ============================================================================
# SIMPLE LOGGER IMPLEMENTATION
# ============================================================================

class SimpleLogger:
    """Simple logger implementation for tools without structlog"""

    def __init__(self, tool_name: str):
        self.tool_name = tool_name

    def debug(self, message: str, **meta):
        self._log("DEBUG", message, meta)

    def info(self, message: str, **meta):
        self._log("INFO", message, meta)

    def warn(self, message: str, **meta):
        self._log("WARN", message, meta)

    def error(self, message: str, **meta):
        self._log("ERROR", message, meta)

    def _log(self, level: str, message: str, meta: Dict[str, Any]):
        meta_str = " ".join(f"{k}={v}" for k, v in meta.items()) if meta else ""
        print(f"[{level}] {self.tool_name}: {message} {meta_str}", file=sys.stderr)
