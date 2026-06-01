"""
Nexus Error Knowledge Base - Common OS Error to Solution Mappings
Provides fast lookup for known error patterns and their corrections
"""

import re
from typing import Optional, Dict, List
from dataclasses import dataclass


@dataclass
class ErrorSolution:
    """A solution for a known error pattern"""
    pattern: str           # Regex pattern to match error
    category: str          # Error category (permission, network, file, etc.)
    solution: str          # Suggested correction
    action_hint: Optional[str] = None  # Optional specific action to try


class ErrorKnowledgeBase:
    """
    Error Knowledge Base - Maps common OS errors to solutions.
    
    Used by the Supervisor and Worker Agent to provide intelligent
    self-correction without requiring LLM inference for known issues.
    """
    
    # Built-in error mappings organized by category
    ERROR_MAPPINGS: List[Dict] = [
        # ===== Permission Errors =====
        {
            "pattern": r"permission denied|access denied|EACCES",
            "category": "permission",
            "solution": "The operation requires elevated privileges. Try running with sudo or changing file permissions.",
            "action_hint": "Use 'sudo' prefix or 'chmod' to adjust permissions"
        },
        {
            "pattern": r"operation not permitted|EPERM",
            "category": "permission",
            "solution": "The operation is not allowed by the system. Check if the file is locked or if SELinux/AppArmor is blocking it.",
            "action_hint": "Check file locks with 'lsof' or disable security policies temporarily"
        },
        
        # ===== File System Errors =====
        {
            "pattern": r"no such file or directory|ENOENT|FileNotFoundError",
            "category": "file",
            "solution": "The specified path does not exist. Verify the path is correct and the file/directory has been created.",
            "action_hint": "Use 'ls' or 'find' to locate the correct path"
        },
        {
            "pattern": r"file exists|EEXIST|FileExistsError",
            "category": "file",
            "solution": "A file or directory already exists at that path. Remove it first or use a different name.",
            "action_hint": "Remove with 'rm' or use '--force' flag if available"
        },
        {
            "pattern": r"not a directory|ENOTDIR",
            "category": "file",
            "solution": "Expected a directory but found a file. Check if the path is correct.",
            "action_hint": "Verify path with 'file' command"
        },
        {
            "pattern": r"is a directory|EISDIR",
            "category": "file",
            "solution": "Expected a file but found a directory. Use the correct operation for directories.",
            "action_hint": "Use 'rmdir' instead of 'rm' or add '-r' flag"
        },
        {
            "pattern": r"disk quota exceeded|EDQUOT|no space left|ENOSPC",
            "category": "disk",
            "solution": "The disk is full or quota exceeded. Free up space or request quota increase.",
            "action_hint": "Check disk usage with 'df -h' and clean up with 'du -sh *'"
        },
        {
            "pattern": r"read-only file system|EROFS",
            "category": "file",
            "solution": "The file system is mounted read-only. Remount with write permissions.",
            "action_hint": "Remount with 'mount -o remount,rw'"
        },
        
        # ===== Network Errors =====
        {
            "pattern": r"connection refused|ECONNREFUSED",
            "category": "network",
            "solution": "The target service is not running or blocking connections. Start the service or check firewall rules.",
            "action_hint": "Check if service is running with 'systemctl status' or 'netstat'"
        },
        {
            "pattern": r"connection timed out|ETIMEDOUT|timeout",
            "category": "network",
            "solution": "The network request took too long. Check network connectivity and try again.",
            "action_hint": "Test connectivity with 'ping' or 'curl'"
        },
        {
            "pattern": r"host not found|ENOENT.*resolve|Name or service not known|NXDOMAIN",
            "category": "network",
            "solution": "DNS lookup failed. Check if the hostname is correct and DNS is working.",
            "action_hint": "Verify DNS with 'nslookup' or 'dig'"
        },
        {
            "pattern": r"network is unreachable|ENETUNREACH",
            "category": "network",
            "solution": "Cannot reach the network. Check if network interface is up and routing is correct.",
            "action_hint": "Check interface with 'ip addr' and routing with 'ip route'"
        },
        
        # ===== Process Errors =====
        {
            "pattern": r"command not found|not recognized as.*command",
            "category": "process",
            "solution": "The command is not installed or not in PATH. Install it or use the full path.",
            "action_hint": "Install with package manager or find with 'which' / 'whereis'"
        },
        {
            "pattern": r"killed|SIGKILL|OOM|out of memory|MemoryError",
            "category": "process",
            "solution": "The process was killed due to memory exhaustion. Reduce memory usage or increase available memory.",
            "action_hint": "Check memory with 'free -h' and reduce batch sizes"
        },
        {
            "pattern": r"broken pipe|EPIPE|SIGPIPE",
            "category": "process",
            "solution": "The receiving process closed the connection. Check if the target process is still running.",
            "action_hint": "Check process status with 'ps aux | grep'"
        },
        
        # ===== Python/Runtime Errors =====
        {
            "pattern": r"ModuleNotFoundError|ImportError|No module named",
            "category": "python",
            "solution": "Required Python module is not installed. Install it with pip.",
            "action_hint": "Install with 'pip install <module_name>'"
        },
        {
            "pattern": r"SyntaxError",
            "category": "python",
            "solution": "There is a syntax error in the code. Check for typos, missing colons, or mismatched brackets.",
            "action_hint": "Review the line number mentioned in the error"
        },
        
        # ===== Docker Errors =====
        {
            "pattern": r"docker daemon.*not running|Cannot connect to.*Docker",
            "category": "docker",
            "solution": "Docker daemon is not running. Start the Docker service.",
            "action_hint": "Start with 'systemctl start docker' or 'service docker start'"
        },
        {
            "pattern": r"image.*not found|pull access denied",
            "category": "docker",
            "solution": "Docker image does not exist or requires authentication. Check image name or login to registry.",
            "action_hint": "Login with 'docker login' or verify image name"
        },
        
        # ===== Git Errors =====
        {
            "pattern": r"not a git repository",
            "category": "git",
            "solution": "The current directory is not a Git repository. Initialize or navigate to a repo.",
            "action_hint": "Initialize with 'git init' or 'cd' to correct directory"
        },
        {
            "pattern": r"merge conflict|CONFLICT",
            "category": "git",
            "solution": "There are merge conflicts that need manual resolution. Edit the conflicting files.",
            "action_hint": "Resolve conflicts, then 'git add' and 'git commit'"
        },
    ]
    
    def __init__(self, custom_mappings: Optional[List[Dict]] = None):
        self.mappings = self.ERROR_MAPPINGS.copy()
        
        if custom_mappings:
            self.mappings.extend(custom_mappings)
        
        # Compile patterns for efficiency
        self.compiled_patterns = []
        for mapping in self.mappings:
            try:
                compiled = re.compile(mapping["pattern"], re.IGNORECASE)
                self.compiled_patterns.append((compiled, mapping))
            except re.error:
                pass
    
    def lookup_correction(self, error_string: str) -> Optional[ErrorSolution]:
        """
        Look up a correction for the given error string.
        Returns None if no matching pattern is found.
        """
        if not error_string:
            return None
        
        for compiled, mapping in self.compiled_patterns:
            if compiled.search(error_string):
                return ErrorSolution(
                    pattern=mapping["pattern"],
                    category=mapping["category"],
                    solution=mapping["solution"],
                    action_hint=mapping.get("action_hint")
                )
        
        return None
    
    def get_category_solutions(self, category: str) -> List[ErrorSolution]:
        """Get all solutions for a specific error category"""
        return [
            ErrorSolution(
                pattern=m["pattern"],
                category=m["category"],
                solution=m["solution"],
                action_hint=m.get("action_hint")
            )
            for m in self.mappings if m["category"] == category
        ]
    
    def add_mapping(
        self,
        pattern: str,
        category: str,
        solution: str,
        action_hint: Optional[str] = None
    ):
        """Add a custom error mapping"""
        try:
            compiled = re.compile(pattern, re.IGNORECASE)
            mapping = {
                "pattern": pattern,
                "category": category,
                "solution": solution,
                "action_hint": action_hint
            }
            self.mappings.append(mapping)
            self.compiled_patterns.append((compiled, mapping))
        except re.error:
            pass
    
    def get_all_categories(self) -> List[str]:
        """Get all unique error categories"""
        return list(set(m["category"] for m in self.mappings))
