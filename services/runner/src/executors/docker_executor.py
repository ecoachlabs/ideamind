"""
Tool Runner - Docker Executor
Executes tools in Docker containers with resource limits and isolation
"""

import docker
import json
import asyncio
import structlog
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

from ..config import settings

logger = structlog.get_logger()


class DockerExecutor:
    """Executes tools in Docker containers"""

    def __init__(self):
        # Initialize Docker client
        if settings.docker_host:
            self.client = docker.DockerClient(base_url=settings.docker_host)
        else:
            self.client = docker.from_env()

        logger.info("DockerExecutor initialized", docker_host=settings.docker_host or "default")

    async def execute(
        self,
        execution_id: str,
        image: str,
        entrypoint: List[str],
        input_data: Dict[str, Any],
        context: Dict[str, Any],
        timeout_ms: int,
        cpu: str,
        memory: str,
        secrets: Dict[str, str],
        egress_allow: List[str],
        filesystem_readonly: bool = True,
        network_restricted: bool = True,
    ) -> Dict[str, Any]:
        """
        Execute tool in Docker container

        Args:
            execution_id: Unique execution identifier
            image: Docker image to run
            entrypoint: Command to execute
            input_data: Input data for tool
            context: Execution context (runId, agentId, etc.)
            timeout_ms: Execution timeout in milliseconds
            cpu: CPU limit (e.g., "500m")
            memory: Memory limit (e.g., "512Mi")
            secrets: Secret key-value pairs to inject as env vars
            egress_allow: Allowed egress patterns
            filesystem_readonly: Whether filesystem should be read-only
            network_restricted: Whether network should be restricted

        Returns:
            Execution result with output, logs, and metrics
        """
        container_name = f"ideamine-tool-{execution_id}"
        start_time = datetime.now()

        logger.info(
            "Starting Docker execution",
            execution_id=execution_id,
            image=image,
            timeout_ms=timeout_ms,
        )

        try:
            # Prepare input payload (stdin)
            payload = {
                "input": {
                    **input_data,
                    "_context": context,
                }
            }
            stdin_data = json.dumps(payload)

            # Prepare environment variables (secrets)
            environment = {
                **secrets,
                "EXECUTION_ID": execution_id,
                "RUN_ID": context.get("runId", ""),
            }

            # Parse resource limits
            nano_cpus = self._parse_cpu(cpu)
            mem_limit = self._parse_memory(memory)

            # Network mode
            network_mode = "none" if network_restricted else settings.docker_network

            # Pull image if not exists
            try:
                self.client.images.get(image)
                logger.debug("Image already exists", image=image)
            except docker.errors.ImageNotFound:
                logger.info("Pulling image", image=image)
                self.client.images.pull(image)
                logger.info("Image pulled successfully", image=image)

            # Create and run container
            container = self.client.containers.run(
                image=image,
                command=entrypoint,
                name=container_name,
                detach=True,
                stdin_open=True,
                stdout=True,
                stderr=True,
                remove=False,  # We'll remove manually after reading logs
                environment=environment,
                network_mode=network_mode,
                nano_cpus=nano_cpus,
                mem_limit=mem_limit,
                read_only=filesystem_readonly,
                user="10001:10001" if filesystem_readonly else None,  # Non-root user
                security_opt=["no-new-privileges:true"],
                cap_drop=["ALL"],  # Drop all capabilities
            )

            logger.info("Container started", container_id=container.id[:12])

            # Write input to stdin
            container_socket = container.attach_socket(params={"stdin": 1, "stream": 1})
            container_socket._sock.sendall(stdin_data.encode())
            container_socket.close()

            # Wait for container with timeout
            timeout_seconds = timeout_ms / 1000.0
            exit_code = None
            timed_out = False

            try:
                exit_code = container.wait(timeout=timeout_seconds)["StatusCode"]
            except Exception as e:
                logger.warn("Container timeout or error", error=str(e))
                timed_out = True
                # Kill container on timeout
                try:
                    container.kill()
                except:
                    pass

            # Get logs
            stdout = container.logs(stdout=True, stderr=False).decode("utf-8")
            stderr = container.logs(stdout=False, stderr=True).decode("utf-8")

            # Calculate duration
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            # Get container stats (CPU/memory usage)
            stats = self._get_container_stats(container)

            # Parse output from stdout
            output = None
            error = None
            ok = False

            if not timed_out and exit_code == 0:
                try:
                    result = json.loads(stdout)
                    ok = result.get("ok", False)
                    output = result.get("output")
                    error = result.get("error")
                except json.JSONDecodeError:
                    error = {
                        "type": "runtime",
                        "message": "Failed to parse tool output as JSON",
                        "retryable": False,
                    }

            elif timed_out:
                error = {
                    "type": "timeout",
                    "message": f"Tool execution exceeded timeout of {timeout_ms}ms",
                    "retryable": True,
                }

            else:
                error = {
                    "type": "runtime",
                    "message": f"Tool exited with code {exit_code}",
                    "retryable": False,
                }

            # Cleanup container
            try:
                container.remove(force=True)
                logger.debug("Container removed", container_id=container.id[:12])
            except:
                pass

            logger.info(
                "Docker execution completed",
                execution_id=execution_id,
                ok=ok,
                duration_ms=duration_ms,
                timed_out=timed_out,
            )

            return {
                "ok": ok,
                "output": output,
                "error": error,
                "exit_code": exit_code,
                "duration_ms": duration_ms,
                "cpu_ms": stats.get("cpu_ms"),
                "memory_peak_mb": stats.get("memory_peak_mb"),
                "stdout": stdout,
                "stderr": stderr,
                "timed_out": timed_out,
            }

        except docker.errors.ImageNotFound as e:
            logger.error("Image not found", image=image, error=str(e))
            return {
                "ok": False,
                "error": {
                    "type": "runtime",
                    "message": f"Docker image not found: {image}",
                    "retryable": False,
                },
                "duration_ms": int((datetime.now() - start_time).total_seconds() * 1000),
            }

        except Exception as e:
            logger.error("Docker execution failed", execution_id=execution_id, error=str(e))
            return {
                "ok": False,
                "error": {
                    "type": "runtime",
                    "message": f"Docker execution failed: {str(e)}",
                    "retryable": True,
                },
                "duration_ms": int((datetime.now() - start_time).total_seconds() * 1000),
            }

    def _parse_cpu(self, cpu: str) -> int:
        """Parse K8s CPU format to Docker nano_cpus"""
        # "500m" -> 0.5 CPU -> 500000000 nano_cpus
        if cpu.endswith("m"):
            millis = int(cpu[:-1])
            return int(millis * 1_000_000)  # 1m = 1,000,000 nano_cpus
        else:
            cores = float(cpu)
            return int(cores * 1_000_000_000)  # 1 CPU = 1,000,000,000 nano_cpus

    def _parse_memory(self, memory: str) -> str:
        """Parse K8s memory format to Docker format"""
        # "512Mi" -> "512m" (Docker uses 'm' for MiB)
        # "1Gi" -> "1g"
        if memory.endswith("Mi"):
            return memory[:-2] + "m"
        elif memory.endswith("Gi"):
            return memory[:-2] + "g"
        elif memory.endswith("M"):
            return memory.lower()
        elif memory.endswith("G"):
            return memory.lower()
        else:
            return memory

    def _get_container_stats(self, container) -> Dict[str, Any]:
        """Get container resource usage stats"""
        try:
            stats = container.stats(stream=False)

            # Calculate CPU usage
            cpu_delta = stats["cpu_stats"]["cpu_usage"]["total_usage"] - \
                        stats["precpu_stats"]["cpu_usage"]["total_usage"]
            system_delta = stats["cpu_stats"]["system_cpu_usage"] - \
                          stats["precpu_stats"]["system_cpu_usage"]

            cpu_percent = (cpu_delta / system_delta) * 100.0 if system_delta > 0 else 0

            # Get memory usage
            memory_usage_mb = stats["memory_stats"]["usage"] / (1024 * 1024)
            memory_max_mb = stats["memory_stats"]["max_usage"] / (1024 * 1024)

            return {
                "cpu_percent": cpu_percent,
                "cpu_ms": None,  # Not directly available
                "memory_usage_mb": memory_usage_mb,
                "memory_peak_mb": memory_max_mb,
            }

        except Exception as e:
            logger.warn("Failed to get container stats", error=str(e))
            return {}

    def cleanup_old_containers(self, max_age_hours: int = 24):
        """Cleanup old tool containers"""
        try:
            cutoff = datetime.now() - timedelta(hours=max_age_hours)

            containers = self.client.containers.list(
                all=True,
                filters={"name": "ideamine-tool-"}
            )

            for container in containers:
                created = datetime.fromisoformat(container.attrs["Created"].replace("Z", "+00:00"))
                if created < cutoff:
                    logger.info("Removing old container", container_id=container.id[:12])
                    container.remove(force=True)

        except Exception as e:
            logger.error("Failed to cleanup old containers", error=str(e))
