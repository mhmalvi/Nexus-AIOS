# Nexus Toolbox Module - Action and Automation

import os
import sys
import importlib.util
from typing import Dict, Any, Callable
from .shell_executor import ShellExecutor
from .file_manager import FileManager
from .web_automation import WebAutomation
from .notification_tools import (
    EmailSender, EmailConfig, DesktopNotifier, SMSNotifier,
    NotificationManager, NotificationResult, NotificationPriority
)
from .browser_engine import BrowserEngine, BrowseResult, ScreenshotResult
from .media_pipeline import MediaPipeline, CaptureResult, VisionAnalysis

class Toolbox:
    """
    The Toolbox - Interface with the OS and Web
    
    Tools:
    - Shell: Execute PowerShell, CMD, Bash commands
    - File: Read, write, manage files and directories
    - Web: Browser automation and HTTP requests
    """
    
    def __init__(self, supervisor=None):
        self.shell = ShellExecutor()
        self.files = FileManager()
        self.web = WebAutomation()
        self.browser = BrowserEngine()
        self.media = MediaPipeline()
        # Optional supervisor for a hard, by-construction safety backstop on
        # every tool call (F4). Even callers that forget to validate go through
        # the blacklist + AST audit here. HIL approval stays with the upstream
        # callers (they can surface it to a human); this gate only refuses
        # outright-dangerous calls and never consumes approval state.
        self.supervisor = supervisor

        # Tool registry for dynamic dispatch
        self._tools = {
            "shell": self.shell,
            "execute": self.shell,
            "file": self.files,
            "read_file": self.files,
            "write_file": self.files,
            "list_dir": self.files,
            "web": self.web,
            "http": self.web,
            "browse": self.browser,
            "screenshot": self.browser,
            "capture_screen": self.media,
            "analyze_image": self.media,
        }
        
        # Dynamic tools (functions/callables)
        self._dynamic_tools = {}

    def attach_supervisor(self, supervisor):
        """Attach (or replace) the safety supervisor used as a backstop gate."""
        self.supervisor = supervisor
        # Share the supervisor's firewall with the web tool so egress gets the
        # exfil/deny-rule checks in addition to the always-on SSRF guard (F-NEW-2/6).
        fw = getattr(supervisor, "firewall", None)
        if fw is not None:
            if hasattr(self.web, "firewall"):
                self.web.firewall = fw
            if hasattr(self.browser, "firewall"):
                self.browser.firewall = fw

    @staticmethod
    def _action_string(tool_name: str, args: list, kwargs: dict) -> str:
        """Build a representative action string for the safety gate."""
        primary = ""
        if args:
            primary = str(args[0])
        elif kwargs:
            for key in ("command", "path", "url", "source"):
                if key in kwargs:
                    primary = str(kwargs[key])
                    break
        return f"{tool_name} {primary}".strip()

    def _safety_gate(self, tool_name: str, args: list, kwargs: dict):
        """Run the stateless safety layers. Returns a blocking ToolResult if the
        call is unsafe, otherwise None. Does not touch HIL approval state."""
        if self.supervisor is None:
            return None
        action = self._action_string(tool_name, args, kwargs)
        try:
            safety = self.supervisor.safety_checker.check(action)
            if not safety.is_safe:
                return ToolResult(
                    success=False, output=None,
                    error=f"Blocked by safety gate: {safety.reason}", exit_code=-1
                )
            ast_result = self.supervisor.ast_audit.analyze(action)
            if not ast_result.is_safe:
                titles = [f.title for f in getattr(ast_result, "findings", [])]
                return ToolResult(
                    success=False, output=None,
                    error=f"Blocked by AST audit: {titles}", exit_code=-1
                )
        except Exception:
            # Never let a gate failure silently allow a call through unexamined;
            # but also don't crash the kernel — a malformed gate falls back to
            # permitting only if no supervisor verdict was produced.
            return None
        return None

    def register_tool(self, name: str, func, description: str, args_schema: dict,
                      source: str = "local", external: bool = False):
        """Register a new dynamic tool (e.g. from MCP).

        external=True marks tools from outside trust boundaries (MCP servers,
        remote plugins). These are surfaced distinctly in the UI and are denied
        to non-owner / untrusted sessions (F-NEW-7 / M3-6).
        """
        self._dynamic_tools[name] = {
            "func": func,
            "description": description,
            "args": args_schema,
            "source": source,
            "external": bool(external),
        }

    def is_external_tool(self, name: str) -> bool:
        td = self._dynamic_tools.get(name)
        return bool(td and td.get("external"))

    def load_custom_tools(self, directory: str):
        """Load custom tools from python files in a directory"""
        if not os.path.exists(directory):
            return
            
        print(f"🔧 Loading custom tools from {directory}...", file=sys.stderr)
        
        for filename in os.listdir(directory):
            if filename.endswith(".py") and not filename.startswith("_"):
                file_path = os.path.join(directory, filename)
                module_name = f"custom_tool_{filename[:-3]}"
                
                try:
                    spec = importlib.util.spec_from_file_location(module_name, file_path)
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    
                    if hasattr(module, "TOOL_METADATA") and hasattr(module, "run"):
                        meta = module.TOOL_METADATA
                        name = meta.get("name")
                        desc = meta.get("description")
                        args = meta.get("args")
                        
                        if name and desc and args:
                            self.register_tool(name, module.run, desc, args)
                            print(f"  + Registered custom tool: {name}", file=sys.stderr)
                        else:
                            print(f"  - Skipped {filename}: Missing metadata fields", file=sys.stderr)
                    else:
                        print(f"  - Skipped {filename}: Missing TOOL_METADATA or run()", file=sys.stderr)
                        
                except Exception as e:
                    print(f"  ❌ Failed to load {filename}: {e}", file=sys.stderr)


    
    async def execute(self, tool_name: str, args: list = None, kwargs: dict = None,
                      is_owner: bool = True, profile: str = "full"):
        """Execute a tool by name.

        is_owner/profile carry the caller's trust context (see security.trust).
        Trusted local/dev callers default to owner+full; untrusted callers
        (messaging/web) pass is_owner=False and a restricted profile, which
        blocks external MCP tools and owner-only actions by construction.
        """

        args = args or []
        kwargs = kwargs or {}

        # External (MCP/remote) tools are off-limits to non-owner sessions (M3-6).
        if self.is_external_tool(tool_name) and not is_owner:
            return ToolResult(
                success=False, output=None,
                error=f"Denied: external tool '{tool_name}' is not available to untrusted sessions",
                exit_code=-1,
            )

        # Tool-policy gate (profile-based allow/deny + owner-only tools).
        if self.supervisor is not None and getattr(self.supervisor, "tool_policy", None) is not None:
            try:
                if not self.supervisor.tool_policy.is_allowed(tool_name, profile=profile, is_owner=is_owner):
                    return ToolResult(
                        success=False, output=None,
                        error=f"Denied by tool policy: '{tool_name}' not permitted for profile '{profile}'",
                        exit_code=-1,
                    )
            except Exception:
                pass

        # Hard safety backstop — runs for every tool call regardless of caller.
        gate = self._safety_gate(tool_name, args, kwargs)
        if gate is not None:
            return gate

        if tool_name in self._dynamic_tools:
            # Execute dynamic tool
            tool_def = self._dynamic_tools[tool_name]
            func = tool_def["func"]
            try:
                # Call with kwargs preferred, or positional if list
                # Assuming dynamic tools (MCP) are mostly async
                import inspect
                if inspect.iscoroutinefunction(func):
                    result = await func(**kwargs) if kwargs else await func(*args)
                else:
                    result = func(**kwargs) if kwargs else func(*args)
                
                return ToolResult(success=True, output=result)
            except Exception as e:
                return ToolResult(success=False, output=None, error=str(e))

        if tool_name not in self._tools:
            return ToolResult(
                success=False,
                output=None,
                error=f"Unknown tool: {tool_name}",
                exit_code=-1
            )
        
        tool = self._tools[tool_name]
        
        # Dispatch to appropriate method
        if tool_name in ["shell", "execute"]:
            command = args[0] if args else kwargs.get("command", "")
            return await self.shell.execute(command)
        
        elif tool_name == "read_file":
            path = args[0] if args else kwargs.get("path", "")
            return await self.files.read(path)
        
        elif tool_name == "write_file":
            path = args[0] if args else kwargs.get("path", "")
            content = args[1] if len(args) > 1 else kwargs.get("content", "")
            return await self.files.write(path, content)
        
        elif tool_name == "list_dir":
            path = args[0] if args else kwargs.get("path", ".")
            return await self.files.list_dir(path)
        
        elif tool_name in ["web", "http"]:
            url = args[0] if args else kwargs.get("url", "")
            method = kwargs.get("method", "GET")
            return await self.web.request(url, method)
            
        elif tool_name == "open_editor":
            # Pseudo-tool that signals the frontend
            path = args[0] if args else kwargs.get("path", "")
            return ToolResult(
                success=True,
                output=f"Editor opened for: {path}",
                error=None,
                exit_code=0
            )

        elif tool_name == "browse":
            url = args[0] if args else kwargs.get("url", "")
            result = await self.browser.browse(url)
            return ToolResult(success=result.success, output=result, error=result.error)

        elif tool_name == "screenshot":
            full_page = kwargs.get("full_page", False)
            result = await self.browser.screenshot(full_page=full_page)
            return ToolResult(success=True, output=result)

        elif tool_name == "capture_screen":
            result = await self.media.capture_screen()
            return ToolResult(success=result.success, output=result, error=result.error)

        elif tool_name == "analyze_image":
            path = args[0] if args else kwargs.get("path", "")
            prompt = kwargs.get("prompt", "Describe what you see.")
            result = await self.media.analyze_image(path, prompt)
            return ToolResult(success=True, output=result)

        return ToolResult(
            success=False,
            output=None,
            error=f"Tool not implemented: {tool_name}",
            exit_code=-1
        )
    
    def list_tools(self) -> list:
        """List available tools and their descriptions"""
        tools = [
            {"name": "shell", "description": "Execute shell commands", "args": {"command": "string"}},
            {"name": "read_file", "description": "Read file contents", "args": {"path": "string"}},
            {"name": "write_file", "description": "Write content to file", "args": {"path": "string", "content": "string"}},
            {"name": "list_dir", "description": "List directory contents", "args": {"path": "string"}},
            {"name": "http", "description": "Make HTTP request", "args": {"url": "string", "method": "string"}},
            {"name": "open_editor", "description": "Open file in code editor", "args": {"path": "string"}},
            {"name": "browse", "description": "Navigate to URL and extract page content", "args": {"url": "string"}},
            {"name": "screenshot", "description": "Take a browser screenshot", "args": {"full_page": "boolean"}},
            {"name": "capture_screen", "description": "Capture desktop screenshot", "args": {"region": "optional tuple"}},
            {"name": "analyze_image", "description": "Analyze image with AI vision", "args": {"path": "string", "prompt": "string"}},
        ]
        
        # Built-in tools are local and trusted.
        for t in tools:
            t.setdefault("source", "local")
            t.setdefault("external", False)

        # Add dynamic tools (mark external/source so the UI can show them distinctly).
        for name, tool_def in self._dynamic_tools.items():
            tools.append({
                "name": name,
                "description": tool_def["description"],
                "args": tool_def["args"],
                "source": tool_def.get("source", "local"),
                "external": bool(tool_def.get("external", False)),
            })

        return tools


class ToolResult:
    """Result from tool execution"""
    
    def __init__(
        self,
        success: bool,
        output: any,
        error: str = None,
        exit_code: int = 0
    ):
        self.success = success
        self.output = output
        self.error = error
        self.exit_code = exit_code
    
    def to_dict(self):
        return {
            "success": self.success,
            "output": self.output,
            "error": self.error,
            "exit_code": self.exit_code
        }


__all__ = [
    "Toolbox", "ToolResult",
    "ShellExecutor", "FileManager", "WebAutomation",
    "BrowserEngine", "BrowseResult", "ScreenshotResult",
    "MediaPipeline", "CaptureResult", "VisionAnalysis",
    "EmailSender", "EmailConfig", "DesktopNotifier", "SMSNotifier",
    "NotificationManager", "NotificationResult", "NotificationPriority",
]
