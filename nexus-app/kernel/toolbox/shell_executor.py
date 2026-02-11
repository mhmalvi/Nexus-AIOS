"""
Nexus Shell Executor - Command Line Interface
Executes shell commands with platform-specific handling
"""

import asyncio
import platform
import subprocess
from typing import Optional, Dict, Any
from dataclasses import dataclass


@dataclass
class ExecutionResult:
    """Result from command execution"""
    success: bool
    output: str
    error: str
    exit_code: int
    command: str
    duration_ms: float


class ShellExecutor:
    """
    Shell Executor - Platform-agnostic command execution
    
    Supports:
    - PowerShell (Windows)
    - CMD (Windows)
    - Bash (Linux/macOS)
    - Zsh (macOS)
    """
    
    def __init__(self):
        self.platform = platform.system().lower()
        self.default_shell = self._get_default_shell()
        self.timeout = 60  # Default timeout in seconds
    
    def _get_default_shell(self) -> str:
        """Get the default shell for the current platform"""
        if self.platform == "windows":
            return "powershell"
        elif self.platform == "darwin":
            return "zsh"
        else:
            return "bash"
    
    async def execute(
        self,
        command: str,
        shell: Optional[str] = None,
        cwd: Optional[str] = None,
        timeout: Optional[int] = None,
        env: Optional[Dict[str, str]] = None
    ) -> ExecutionResult:
        """Execute a command and return the result"""
        
        import time
        start_time = time.time()
        
        shell = shell or self.default_shell
        timeout = timeout or self.timeout
        
        try:
            # Build the command based on shell
            if shell == "powershell":
                full_command = ["powershell", "-NoProfile", "-Command", command]
            elif shell == "cmd":
                full_command = ["cmd", "/c", command]
            else:
                full_command = [shell, "-c", command]
            
            # Execute asynchronously
            process = await asyncio.create_subprocess_exec(
                *full_command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=env
            )
            
            # Wait for completion with timeout
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=timeout
                )
            except asyncio.TimeoutError:
                process.kill()
                return ExecutionResult(
                    success=False,
                    output="",
                    error=f"Command timed out after {timeout} seconds",
                    exit_code=-1,
                    command=command,
                    duration_ms=(time.time() - start_time) * 1000
                )
            
            duration_ms = (time.time() - start_time) * 1000
            
            return ExecutionResult(
                success=process.returncode == 0,
                output=stdout.decode("utf-8", errors="replace").strip(),
                error=stderr.decode("utf-8", errors="replace").strip(),
                exit_code=process.returncode or 0,
                command=command,
                duration_ms=duration_ms
            )
            
        except Exception as e:
            return ExecutionResult(
                success=False,
                output="",
                error=str(e),
                exit_code=-1,
                command=command,
                duration_ms=(time.time() - start_time) * 1000
            )
    
    async def execute_script(
        self,
        script: str,
        shell: Optional[str] = None,
        cwd: Optional[str] = None
    ) -> ExecutionResult:
        """Execute a multi-line script"""
        
        import tempfile
        import os
        
        shell = shell or self.default_shell
        
        # Determine script extension
        if shell == "powershell":
            ext = ".ps1"
        elif shell == "cmd":
            ext = ".bat"
        else:
            ext = ".sh"
        
        # Write script to temp file
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=ext,
            delete=False
        ) as f:
            f.write(script)
            script_path = f.name
        
        try:
            # Execute the script
            if shell == "powershell":
                command = f"& '{script_path}'"
            elif shell == "cmd":
                command = script_path
            else:
                command = f"chmod +x '{script_path}' && '{script_path}'"
            
            result = await self.execute(command, shell=shell, cwd=cwd)
            
        finally:
            # Clean up temp file
            try:
                os.unlink(script_path)
            except Exception:
                pass
        
        return result
    
    async def get_environment(self) -> Dict[str, str]:
        """Get current environment variables"""
        
        if self.platform == "windows":
            result = await self.execute("Get-ChildItem Env: | ForEach-Object { \"$($_.Name)=$($_.Value)\" }")
        else:
            result = await self.execute("env")
        
        env = {}
        if result.success:
            for line in result.output.split("\n"):
                if "=" in line:
                    key, value = line.split("=", 1)
                    env[key.strip()] = value.strip()
        
        return env
    
    async def which(self, program: str) -> Optional[str]:
        """Find the path to an executable"""
        
        if self.platform == "windows":
            result = await self.execute(f"(Get-Command {program} -ErrorAction SilentlyContinue).Source")
        else:
            result = await self.execute(f"which {program}")
        
        if result.success and result.output:
            return result.output
        return None
