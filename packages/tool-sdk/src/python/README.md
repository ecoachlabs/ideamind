# IdeaMine Tools SDK - Python

Production-grade SDK for building and consuming IdeaMine tools in Python.

## Installation

```bash
pip install ideamine-tool-sdk
```

## Quick Start

### For Tool Consumers (Agents)

```python
from ideamine_tools import ToolClient, ExecutionRequest

# Initialize client
client = ToolClient(
    registry_url="http://localhost:8001",
    runner_url="http://localhost:8002",
    telemetry_enabled=True
)

# Search for tools
results = client.search(
    ToolSearchRequest(
        query="traceability",
        capabilities=["prd", "traceability"]
    )
)

# Get tool
tool = client.get("tool.prd.traceMatrix", "1.2.0")

# Execute tool
result = client.run(
    ExecutionRequest(
        toolId="tool.prd.traceMatrix",
        version="1.2.0",
        input={"use_cases": [...], "stories": [...]},
        runId="run-123",
        agentId="prd-agent",
        phase="prd"
    )
)

if result.ok:
    print(result.output)
else:
    print(f"Error: {result.error.message}")
```

### For Tool Authors

```python
import asyncio
from ideamine_tools import ToolConfig, ToolRuntime, run_tool_handler

# Define configuration
config = ToolConfig(
    name="tool.example.calculator",
    version="1.0.0",
    summary="Simple calculator tool",
    owner="example-team",
    capabilities=["math", "calculation"],
    input_schema={
        "type": "object",
        "properties": {
            "a": {"type": "number"},
            "b": {"type": "number"},
            "operation": {"type": "string", "enum": ["add", "subtract", "multiply", "divide"]}
        },
        "required": ["a", "b", "operation"]
    },
    output_schema={
        "type": "object",
        "properties": {
            "result": {"type": "number"}
        },
        "required": ["result"]
    },
    runtime=ToolRuntime.DOCKER,
    image="ghcr.io/ideamine/calculator:1.0.0"
)

# Implement handler
async def calculate(input_data, context):
    a = input_data["a"]
    b = input_data["b"]
    op = input_data["operation"]

    if op == "add":
        result = a + b
    elif op == "subtract":
        result = a - b
    elif op == "multiply":
        result = a * b
    elif op == "divide":
        if b == 0:
            raise ValueError("Division by zero")
        result = a / b

    return {"result": result}

# Run server
if __name__ == "__main__":
    asyncio.run(run_tool_handler(
        config=config,
        handler=calculate,
        telemetry_enabled=True
    ))
```

## Features

- **Type-safe**: Full Pydantic models for all data structures
- **Validation**: Automatic JSON Schema validation for inputs/outputs
- **Observability**: Built-in OpenTelemetry tracing
- **Retries**: Automatic retry with exponential backoff
- **Idempotence**: Hash-based deduplication of identical requests
- **Security**: Access control, secrets management, resource limits

## License

MIT
