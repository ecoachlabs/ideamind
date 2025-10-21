#!/usr/bin/env python3
"""
IdeaMine Tools CLI
Command-line interface for tool development, testing, and publishing
"""

import click
import os
import json
import yaml
import subprocess
import sys
from pathlib import Path
from typing import Optional


@click.group()
@click.version_option(version="1.0.0")
def cli():
    """IdeaMine Tools CLI - Create, test, and publish tools"""
    pass


# ============================================================================
# CREATE COMMAND
# ============================================================================

@cli.command()
@click.argument("name")
@click.option("--runtime", type=click.Choice(["docker", "wasm"]), default="docker", help="Runtime type")
@click.option("--lang", type=click.Choice(["ts", "py"]), default="py", help="Programming language")
@click.option("--output", "-o", default=".", help="Output directory")
def create(name: str, runtime: str, lang: str, output: str):
    """
    Create a new tool from template

    NAME: Tool name (e.g., tool.myteam.mytool)
    """
    click.echo(f"Creating tool: {name}")
    click.echo(f"  Runtime: {runtime}")
    click.echo(f"  Language: {lang}")

    # Create directory structure
    tool_dir = Path(output) / name.replace(".", "/")
    tool_dir.mkdir(parents=True, exist_ok=True)

    # Create subdirectories
    (tool_dir / "app").mkdir(exist_ok=True)
    (tool_dir / "schemas").mkdir(exist_ok=True)

    # Create tool.yaml
    manifest = {
        "name": name,
        "version": "1.0.0",
        "summary": f"Tool {name} - Add description here",
        "owner": "my-team",
        "capabilities": ["example"],
        "input_schema": {"$ref": "schemas/input.schema.json"},
        "output_schema": {"$ref": "schemas/output.schema.json"},
        "runtime": runtime,
        "image": f"ghcr.io/ideamine/{name.split('.')[-1]}:1.0.0" if runtime == "docker" else None,
        "entrypoint": ["python", "/app/main.py"] if lang == "py" else ["node", "/app/main.js"],
        "module_path": f"/app/{name.split('.')[-1]}.wasm" if runtime == "wasm" else None,
        "timeout_ms": 60000,
        "cpu": "500m",
        "memory": "512Mi",
        "security": {
            "run_as_non_root": True,
            "filesystem": "read_only",
            "network": "none",
        },
        "egress": {"allow": []},
        "secrets": [],
        "guardrails": {
            "grounding_required": False,
            "max_tokens": 0,
        },
        "license": "MIT",
        "tags": ["example"],
    }

    with open(tool_dir / "tool.yaml", "w") as f:
        yaml.dump(manifest, f, default_flow_style=False, sort_keys=False)

    # Create input schema
    input_schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "example_input": {
                "type": "string",
                "description": "Example input field",
            }
        },
        "required": ["example_input"],
    }

    with open(tool_dir / "schemas" / "input.schema.json", "w") as f:
        json.dump(input_schema, f, indent=2)

    # Create output schema
    output_schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "example_output": {
                "type": "string",
                "description": "Example output field",
            }
        },
        "required": ["example_output"],
    }

    with open(tool_dir / "schemas" / "output.schema.json", "w") as f:
        json.dump(output_schema, f, indent=2)

    # Create handler
    if lang == "py":
        _create_python_handler(tool_dir / "app" / "main.py")
        _create_dockerfile_python(tool_dir / "Dockerfile")
    else:
        _create_typescript_handler(tool_dir / "app" / "main.ts")
        _create_dockerfile_typescript(tool_dir / "Dockerfile")

    # Create README
    readme = f"""# {name}

{manifest['summary']}

## Development

### Test locally
```bash
ideamine-tools run . --input sample-input.json
```

### Publish
```bash
ideamine-tools publish . --sign
```

## Input Schema

See `schemas/input.schema.json`

## Output Schema

See `schemas/output.schema.json`
"""

    with open(tool_dir / "README.md", "w") as f:
        f.write(readme)

    # Create sample input
    sample_input = {"example_input": "test value"}

    with open(tool_dir / "sample-input.json", "w") as f:
        json.dump(sample_input, f, indent=2)

    click.echo(f"\n✅ Tool created at: {tool_dir}")
    click.echo("\nNext steps:")
    click.echo(f"  1. cd {tool_dir}")
    click.echo(f"  2. Edit app/main.{lang} to implement your tool logic")
    click.echo("  3. Test: ideamine-tools run . --input sample-input.json")
    click.echo("  4. Publish: ideamine-tools publish .")


def _create_python_handler(path: Path):
    """Create Python handler template"""
    code = '''#!/usr/bin/env python3
"""
Tool handler implementation
"""

import json
import sys


def handle(input_data: dict, context: dict) -> dict:
    """
    Main handler function

    Args:
        input_data: Validated input matching input_schema
        context: Execution context (runId, executionId, secrets, etc.)

    Returns:
        Output matching output_schema
    """
    example_input = input_data["example_input"]

    # TODO: Implement your tool logic here
    result = f"Processed: {example_input}"

    return {
        "example_output": result
    }


if __name__ == "__main__":
    # Read input from stdin
    payload = json.load(sys.stdin)
    input_data = payload.get("input", {})

    # Extract context
    context = input_data.pop("_context", {})

    # Execute handler
    try:
        output = handle(input_data, context)
        print(json.dumps({"ok": True, "output": output}))
    except Exception as e:
        print(json.dumps({
            "ok": False,
            "error": {
                "type": "runtime",
                "message": str(e),
                "retryable": False
            }
        }))
        sys.exit(1)
'''

    with open(path, "w") as f:
        f.write(code)

    path.chmod(0o755)


def _create_typescript_handler(path: Path):
    """Create TypeScript handler template"""
    code = '''import * as fs from 'fs';

interface ToolInput {
  example_input: string;
}

interface ToolOutput {
  example_output: string;
}

interface ToolContext {
  runId: string;
  executionId: string;
  secrets: Record<string, string>;
}

function handle(input: ToolInput, context: ToolContext): ToolOutput {
  // TODO: Implement your tool logic here
  const result = `Processed: ${input.example_input}`;

  return {
    example_output: result,
  };
}

// Main entry point
async function main() {
  try {
    // Read from stdin
    const stdin = fs.readFileSync(0, 'utf-8');
    const payload = JSON.parse(stdin);
    const input = payload.input || {};

    // Extract context
    const context = input._context || {};
    delete input._context;

    // Execute handler
    const output = handle(input, context);

    // Write to stdout
    console.log(JSON.stringify({ ok: true, output }));
  } catch (error) {
    console.log(
      JSON.stringify({
        ok: false,
        error: {
          type: 'runtime',
          message: error.message,
          retryable: false,
        },
      })
    );
    process.exit(1);
  }
}

main();
'''

    with open(path, "w") as f:
        f.write(code)


def _create_dockerfile_python(path: Path):
    """Create Python Dockerfile"""
    dockerfile = '''FROM python:3.11-slim

# Create non-root user
RUN useradd -u 10001 -m tooluser

# Set working directory
WORKDIR /app

# Copy application
COPY app/main.py /app/main.py
COPY schemas /app/schemas

# Make handler executable
RUN chmod +x /app/main.py

# Switch to non-root user
USER 10001

# Entry point
ENTRYPOINT ["python", "/app/main.py"]
'''

    with open(path, "w") as f:
        f.write(dockerfile)


def _create_dockerfile_typescript(path: Path):
    """Create TypeScript Dockerfile"""
    dockerfile = '''FROM node:18-slim

# Create non-root user
RUN useradd -u 10001 -m tooluser

# Set working directory
WORKDIR /app

# Copy application
COPY app /app
COPY schemas /app/schemas

# Install dependencies (if package.json exists)
# RUN npm install

# Switch to non-root user
USER 10001

# Entry point
ENTRYPOINT ["node", "/app/main.js"]
'''

    with open(path, "w") as f:
        f.write(dockerfile)


# ============================================================================
# RUN COMMAND
# ============================================================================

@cli.command()
@click.argument("tool_dir", type=click.Path(exists=True))
@click.option("--input", "-i", required=True, type=click.Path(exists=True), help="Input JSON file")
@click.option("--runtime", type=click.Choice(["docker", "local"]), default="local", help="Run in Docker or locally")
def run(tool_dir: str, input: str, runtime: str):
    """
    Run a tool locally for testing

    TOOL_DIR: Path to tool directory containing tool.yaml
    """
    tool_dir = Path(tool_dir)
    manifest_path = tool_dir / "tool.yaml"

    if not manifest_path.exists():
        click.echo(f"❌ Error: tool.yaml not found in {tool_dir}", err=True)
        sys.exit(1)

    # Load manifest
    with open(manifest_path) as f:
        manifest = yaml.safe_load(f)

    # Load input
    with open(input) as f:
        input_data = json.load(f)

    click.echo(f"Running tool: {manifest['name']}")
    click.echo(f"  Version: {manifest['version']}")
    click.echo(f"  Runtime: {runtime}")

    if runtime == "docker":
        _run_docker(tool_dir, manifest, input_data)
    else:
        _run_local(tool_dir, manifest, input_data)


def _run_local(tool_dir: Path, manifest: dict, input_data: dict):
    """Run tool locally (without Docker)"""
    # Determine handler path
    if manifest.get("entrypoint", [])[0] == "python":
        handler_path = tool_dir / "app" / "main.py"
        cmd = ["python", str(handler_path)]
    else:
        handler_path = tool_dir / "app" / "main.ts"
        cmd = ["ts-node", str(handler_path)]

    if not handler_path.exists():
        click.echo(f"❌ Error: Handler not found at {handler_path}", err=True)
        sys.exit(1)

    # Prepare stdin payload
    payload = {"input": input_data}
    stdin_json = json.dumps(payload)

    # Execute
    try:
        result = subprocess.run(
            cmd,
            input=stdin_json,
            capture_output=True,
            text=True,
            timeout=manifest.get("timeout_ms", 60000) / 1000,
        )

        if result.returncode == 0:
            output = json.loads(result.stdout)
            if output.get("ok"):
                click.echo("\n✅ Success!")
                click.echo(json.dumps(output.get("output"), indent=2))
            else:
                click.echo("\n❌ Tool failed:")
                click.echo(json.dumps(output.get("error"), indent=2))
                sys.exit(1)
        else:
            click.echo("\n❌ Execution failed:")
            click.echo(f"stdout: {result.stdout}")
            click.echo(f"stderr: {result.stderr}")
            sys.exit(1)

    except subprocess.TimeoutExpired:
        click.echo(f"\n❌ Tool timeout ({manifest.get('timeout_ms')}ms)")
        sys.exit(1)
    except Exception as e:
        click.echo(f"\n❌ Error: {e}")
        sys.exit(1)


def _run_docker(tool_dir: Path, manifest: dict, input_data: dict):
    """Run tool in Docker container"""
    image_name = manifest.get("image", f"ideamine-tool-{manifest['name']}")

    # Build Docker image
    click.echo(f"\nBuilding Docker image: {image_name}")
    build_result = subprocess.run(
        ["docker", "build", "-t", image_name, str(tool_dir)],
        capture_output=True,
        text=True,
    )

    if build_result.returncode != 0:
        click.echo(f"❌ Docker build failed:\n{build_result.stderr}")
        sys.exit(1)

    # Run container
    click.echo(f"\nRunning container...")
    payload = {"input": input_data}
    stdin_json = json.dumps(payload)

    run_result = subprocess.run(
        ["docker", "run", "--rm", "-i", image_name],
        input=stdin_json,
        capture_output=True,
        text=True,
    )

    if run_result.returncode == 0:
        output = json.loads(run_result.stdout)
        if output.get("ok"):
            click.echo("\n✅ Success!")
            click.echo(json.dumps(output.get("output"), indent=2))
        else:
            click.echo("\n❌ Tool failed:")
            click.echo(json.dumps(output.get("error"), indent=2))
    else:
        click.echo(f"\n❌ Container failed:\n{run_result.stderr}")
        sys.exit(1)


# ============================================================================
# PUBLISH COMMAND
# ============================================================================

@cli.command()
@click.argument("tool_dir", type=click.Path(exists=True))
@click.option("--registry", default="http://localhost:8001", help="Registry URL")
@click.option("--sign", is_flag=True, help="Sign tool with Cosign")
@click.option("--published-by", default="cli", help="Publisher identifier")
def publish(tool_dir: str, registry: str, sign: bool, published_by: str):
    """
    Publish tool to registry

    TOOL_DIR: Path to tool directory containing tool.yaml
    """
    tool_dir = Path(tool_dir)
    manifest_path = tool_dir / "tool.yaml"

    if not manifest_path.exists():
        click.echo(f"❌ Error: tool.yaml not found in {tool_dir}", err=True)
        sys.exit(1)

    # Load manifest
    with open(manifest_path) as f:
        manifest = yaml.safe_load(f)

    click.echo(f"Publishing tool: {manifest['name']}")
    click.echo(f"  Version: {manifest['version']}")
    click.echo(f"  Registry: {registry}")

    # TODO: Implement actual publishing
    # This would:
    # 1. Build Docker image (if runtime=docker)
    # 2. Generate SBOM (using Syft)
    # 3. Sign image (using Cosign if --sign)
    # 4. POST to Registry API

    click.echo("\n⚠️  Publishing not yet implemented")
    click.echo("This would:")
    click.echo("  1. Build Docker image")
    click.echo("  2. Generate SBOM")
    click.echo("  3. Sign with Cosign (if --sign)")
    click.echo("  4. POST to Registry API")


if __name__ == "__main__":
    cli()
