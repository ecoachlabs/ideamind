"""
IdeaMine Tools SDK - Python Validator
JSON Schema validation using jsonschema
"""

import re
from typing import Any, Dict
from jsonschema import Draft7Validator, ValidationError as JsonSchemaValidationError
from jsonschema.exceptions import SchemaError
import structlog

from .types import ValidationError, ToolConfig


class SchemaValidator:
    """JSON Schema validator with caching"""

    def __init__(self, logger: structlog.BoundLogger):
        self.logger = logger
        self.validators: Dict[str, Draft7Validator] = {}

    def _get_validator(self, schema: Dict[str, Any], key: str) -> Draft7Validator:
        """Get or create cached validator"""
        if key not in self.validators:
            try:
                validator = Draft7Validator(schema)
                # Check schema is valid
                validator.check_schema(schema)
                self.validators[key] = validator
                self.logger.debug("Schema compiled and cached", key=key)
            except SchemaError as e:
                self.logger.error("Failed to compile schema", key=key, error=str(e))
                raise ValidationError(
                    "Invalid schema definition",
                    details={"key": key, "error": str(e)}
                )

        return self.validators[key]

    def validate_input(
        self,
        input_data: Any,
        schema: Dict[str, Any],
        tool_name: str
    ) -> Any:
        """
        Validate input against schema

        Args:
            input_data: Input data to validate
            schema: JSON schema
            tool_name: Tool name for logging

        Returns:
            Validated input data

        Raises:
            ValidationError: If validation fails
        """
        key = f"{tool_name}:input"
        validator = self._get_validator(schema, key)

        errors = list(validator.iter_errors(input_data))
        if errors:
            formatted_errors = self._format_errors(errors)
            self.logger.warning(
                "Input validation failed",
                tool=tool_name,
                errors=formatted_errors
            )
            raise ValidationError(
                "Input validation failed",
                details={"tool": tool_name, "errors": formatted_errors}
            )

        self.logger.debug("Input validation succeeded", tool=tool_name)
        return input_data

    def validate_output(
        self,
        output_data: Any,
        schema: Dict[str, Any],
        tool_name: str
    ) -> Any:
        """
        Validate output against schema

        Args:
            output_data: Output data to validate
            schema: JSON schema
            tool_name: Tool name for logging

        Returns:
            Validated output data

        Raises:
            ValidationError: If validation fails
        """
        key = f"{tool_name}:output"
        validator = self._get_validator(schema, key)

        errors = list(validator.iter_errors(output_data))
        if errors:
            formatted_errors = self._format_errors(errors)
            self.logger.error(
                "Output validation failed",
                tool=tool_name,
                errors=formatted_errors
            )
            raise ValidationError(
                "Output validation failed",
                details={"tool": tool_name, "errors": formatted_errors}
            )

        self.logger.debug("Output validation succeeded", tool=tool_name)
        return output_data

    def validate_tool_config(self, config: Dict[str, Any]) -> None:
        """
        Validate tool configuration

        Args:
            config: Tool configuration dict

        Raises:
            ValidationError: If validation fails
        """
        required_fields = [
            "name",
            "version",
            "summary",
            "owner",
            "capabilities",
            "input_schema",
            "output_schema",
            "runtime",
            "image",
        ]

        missing = [field for field in required_fields if field not in config]
        if missing:
            raise ValidationError(
                "Missing required configuration fields",
                details={"missing": missing}
            )

        # Validate name format
        if not re.match(r"^[a-z][a-z0-9\._-]+$", config["name"]):
            raise ValidationError(
                "Invalid tool name format",
                details={
                    "name": config["name"],
                    "expected": "lowercase letters, numbers, dots, underscores, and hyphens"
                }
            )

        # Validate version format (SemVer)
        if not re.match(r"^\d+\.\d+\.\d+(-[a-zA-Z0-9\.-]+)?$", config["version"]):
            raise ValidationError(
                "Invalid version format",
                details={
                    "version": config["version"],
                    "expected": "SemVer (e.g., 1.2.3 or 1.2.3-beta.1)"
                }
            )

        # Validate runtime
        if config["runtime"] not in ["docker", "wasm"]:
            raise ValidationError(
                "Invalid runtime",
                details={
                    "runtime": config["runtime"],
                    "allowed": ["docker", "wasm"]
                }
            )

        # Validate capabilities
        if not isinstance(config["capabilities"], list) or len(config["capabilities"]) == 0:
            raise ValidationError("Capabilities must be a non-empty array")

        # Validate timeout
        timeout_ms = config.get("timeout_ms")
        if timeout_ms and (timeout_ms < 1000 or timeout_ms > 600000):
            raise ValidationError(
                "Timeout must be between 1000ms and 600000ms",
                details={"timeout_ms": timeout_ms}
            )

        self.logger.debug(
            "Tool config validation succeeded",
            name=config["name"],
            version=config["version"]
        )

    def _format_errors(self, errors: list) -> list:
        """Format jsonschema errors for better readability"""
        formatted = []
        for error in errors:
            formatted.append({
                "path": "/" + "/".join(str(p) for p in error.path) if error.path else "/",
                "message": error.message,
                "validator": error.validator,
                **({"received": error.instance} if error.instance is not None else {})
            })
        return formatted

    def clear_cache(self) -> None:
        """Clear validator cache"""
        self.validators.clear()
        self.logger.debug("Validator cache cleared")
