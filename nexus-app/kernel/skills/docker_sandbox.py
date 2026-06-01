"""
Nexus Docker Sandbox
Provides isolated execution environments for untrusted code.
Adopted from OpenClaw's Dockerfile.sandbox pattern.

Usage:
    sandbox = DockerSandbox()
    result = await sandbox.execute("echo Hello from sandbox")
    print(result.stdout)  # "Hello from sandbox"
"""

import asyncio
import logging
import os
import shutil
import uuid
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class SandboxResult:
    """Result from a sandboxed execution."""
    exit_code: int
    stdout: str
    stderr: str
    timed_out: bool = False
    container_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "exit_code": self.exit_code,
            "stdout": self.stdout[:4096],  # Cap output
            "stderr": self.stderr[:2048],
            "timed_out": self.timed_out,
        }


@dataclass
class SandboxConfig:
    """Configuration for sandbox containers."""
    image: str = "nexus-sandbox:latest"
    memory_limit: str = "512m"
    cpu_quota: int = 50000       # 50% of one CPU
    timeout_seconds: int = 30
    network: str = "none"        # No network by default
    read_only_root: bool = True
    work_dir: str = "/home/sandbox"
    user: str = "sandbox"
    mount_dirs: Dict[str, str] = field(default_factory=dict)  # host -> container


class DockerSandbox:
    """
    Docker-based sandboxing for untrusted code execution.
    
    Uses the Nexus sandbox image (based on OpenClaw's Dockerfile.sandbox)
    to run commands in an isolated environment with:
    - No network access (default)
    - Memory/CPU limits
    - Read-only root filesystem
    - Non-root user
    - Timeout enforcement
    """

    def __init__(self, config: Optional[SandboxConfig] = None):
        self.config = config or SandboxConfig()
        self._docker_available: Optional[bool] = None

    async def is_available(self) -> bool:
        """Check if Docker is available."""
        if self._docker_available is not None:
            return self._docker_available

        try:
            proc = await asyncio.create_subprocess_exec(
                "docker", "info",
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()
            self._docker_available = proc.returncode == 0
        except FileNotFoundError:
            self._docker_available = False

        return self._docker_available

    async def build_image(self) -> bool:
        """Build the sandbox Docker image from our Dockerfile."""
        dockerfile_content = self._generate_dockerfile()
        
        # Write Dockerfile to temp location
        tmp_dir = Path("/tmp/nexus-sandbox-build")
        tmp_dir.mkdir(parents=True, exist_ok=True)
        dockerfile = tmp_dir / "Dockerfile"
        dockerfile.write_text(dockerfile_content)
        
        try:
            proc = await asyncio.create_subprocess_exec(
                "docker", "build", "-t", self.config.image, "-f", str(dockerfile), str(tmp_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode != 0:
                logger.error(f"Failed to build sandbox image: {stderr.decode()}")
                return False
            logger.info(f"Sandbox image '{self.config.image}' built successfully")
            return True
        except Exception as e:
            logger.error(f"Docker build error: {e}")
            return False

    async def execute(
        self,
        command: str,
        timeout: Optional[int] = None,
        env: Optional[Dict[str, str]] = None,
        mount_dirs: Optional[Dict[str, str]] = None,
    ) -> SandboxResult:
        """
        Execute a command inside a sandboxed Docker container.
        
        Args:
            command: Shell command to execute
            timeout: Override default timeout (seconds)
            env: Additional environment variables
            mount_dirs: Additional host->container mount points
        
        Returns:
            SandboxResult with stdout, stderr, exit code
        """
        if not await self.is_available():
            return SandboxResult(
                exit_code=-1,
                stdout="",
                stderr="Docker is not available",
            )

        timeout = timeout or self.config.timeout_seconds
        container_name = f"nexus-sandbox-{uuid.uuid4().hex[:12]}"

        # Build docker run command
        docker_cmd = [
            "docker", "run",
            "--rm",
            "--name", container_name,
            "--memory", self.config.memory_limit,
            "--cpu-quota", str(self.config.cpu_quota),
            "--network", self.config.network,
            "--user", self.config.user,
            "--workdir", self.config.work_dir,
        ]

        if self.config.read_only_root:
            docker_cmd.append("--read-only")
            # Writable /tmp for temp files
            docker_cmd.extend(["--tmpfs", "/tmp:rw,noexec,nosuid,size=64m"])

        # Mount directories
        all_mounts = {**self.config.mount_dirs, **(mount_dirs or {})}
        for host_path, container_path in all_mounts.items():
            docker_cmd.extend(["-v", f"{host_path}:{container_path}:ro"])

        # Environment variables
        if env:
            for key, value in env.items():
                docker_cmd.extend(["-e", f"{key}={value}"])

        # Image + command
        docker_cmd.extend([self.config.image, "bash", "-c", command])

        try:
            proc = await asyncio.create_subprocess_exec(
                *docker_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=timeout
                )
                return SandboxResult(
                    exit_code=proc.returncode or 0,
                    stdout=stdout.decode(errors="replace"),
                    stderr=stderr.decode(errors="replace"),
                    container_id=container_name,
                )
            except asyncio.TimeoutError:
                # Kill the container
                await self._kill_container(container_name)
                return SandboxResult(
                    exit_code=-1,
                    stdout="",
                    stderr=f"Execution timed out after {timeout}s",
                    timed_out=True,
                    container_id=container_name,
                )

        except Exception as e:
            logger.error(f"Sandbox execution error: {e}")
            return SandboxResult(
                exit_code=-1,
                stdout="",
                stderr=str(e),
            )

    async def _kill_container(self, name: str):
        """Force-kill a running container."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "docker", "kill", name,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()
        except Exception:
            pass

    def _generate_dockerfile(self) -> str:
        """Generate the sandbox Dockerfile (based on OpenClaw pattern)."""
        return """FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \\
  && apt-get install -y --no-install-recommends \\
    bash \\
    ca-certificates \\
    curl \\
    git \\
    jq \\
    python3 \\
    python3-pip \\
    ripgrep \\
  && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash sandbox
USER sandbox
WORKDIR /home/sandbox

CMD ["sleep", "infinity"]
"""

    def get_status(self) -> Dict[str, Any]:
        """Get sandbox status info."""
        return {
            "image": self.config.image,
            "memory_limit": self.config.memory_limit,
            "timeout": self.config.timeout_seconds,
            "network": self.config.network,
            "docker_available": self._docker_available,
        }
