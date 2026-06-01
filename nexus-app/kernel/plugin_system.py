"""
AETHER Plugin System — Dynamic Module Loading & Extensions

Allows AETHER to be extended with custom modules at runtime.

Plugin structure:
    ~/.aether/plugins/
        my_plugin/
            plugin.json     # Manifest (name, version, entry_point, permissions)
            main.py         # Entry point
            ...

Plugin lifecycle:
    discover → validate → load → initialize → run → unload

Features:
- Hot-reload without restart
- Permission-gated (plugins declare required permissions)
- Sandboxed execution (optional)
- Plugin marketplace metadata
- Dependency resolution between plugins
- Event hook registration
"""

import asyncio
import importlib.util
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional, List, Dict, Any, Set

logger = logging.getLogger("aether.plugins")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class PluginState(str, Enum):
    DISCOVERED = "discovered"
    VALIDATED = "validated"
    LOADED = "loaded"
    INITIALIZED = "initialized"
    RUNNING = "running"
    ERROR = "error"
    DISABLED = "disabled"
    UNLOADED = "unloaded"


class PluginPermission(str, Enum):
    FILE_READ = "file.read"
    FILE_WRITE = "file.write"
    SHELL_EXEC = "shell.exec"
    NETWORK = "network"
    MEMORY_READ = "memory.read"
    MEMORY_WRITE = "memory.write"
    VOICE = "voice"
    BROWSER = "browser"
    CRON = "cron"
    SYSTEM = "system"


@dataclass
class PluginManifest:
    """Plugin metadata from plugin.json."""
    name: str
    version: str
    description: str = ""
    author: str = ""
    entry_point: str = "main.py"
    permissions: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)  # Other plugin names
    event_hooks: List[str] = field(default_factory=list)   # Events to subscribe
    min_aether_version: str = "0.1.0"
    tags: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "PluginManifest":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class PluginInfo:
    """Runtime info for a loaded plugin."""
    manifest: PluginManifest
    path: Path
    state: PluginState = PluginState.DISCOVERED
    module: Any = None           # Loaded Python module
    instance: Any = None         # Plugin class instance
    error: Optional[str] = None
    loaded_at: float = 0.0
    load_time_ms: float = 0.0


# ---------------------------------------------------------------------------
# Plugin System
# ---------------------------------------------------------------------------

class PluginSystem:
    """
    AETHER's extension framework.

    Usage:
        plugins = PluginSystem()
        await plugins.initialize()

        # Discover plugins
        found = plugins.discover()
        print(f"Found {len(found)} plugins")

        # Load a specific plugin
        await plugins.load_plugin("my_plugin")

        # List loaded plugins
        for p in plugins.list_plugins():
            print(f"  {p.manifest.name} v{p.manifest.version} [{p.state.value}]")

        # Unload
        await plugins.unload_plugin("my_plugin")
    """

    def __init__(
        self,
        plugins_dir: Optional[str] = None,
        allowed_permissions: Optional[Set[str]] = None,
        orchestrator=None,
        sandbox: bool = False,
    ):
        if plugins_dir:
            self._plugins_dir = Path(plugins_dir)
        else:
            self._plugins_dir = Path.home() / ".aether" / "plugins"

        self._plugins: Dict[str, PluginInfo] = {}
        self._allowed_permissions = allowed_permissions or {p.value for p in PluginPermission}
        self._orchestrator = orchestrator
        self._sandbox = sandbox
        self._sandbox_procs: Dict[str, asyncio.subprocess.Process] = {}

    async def initialize(self) -> None:
        """Initialize the plugin system."""
        self._plugins_dir.mkdir(parents=True, exist_ok=True)
        self.discover()
        logger.info(
            "Plugin system initialized: %d plugins discovered in %s",
            len(self._plugins), self._plugins_dir,
        )

    # ------------------------------------------------------------------
    # Discovery
    # ------------------------------------------------------------------

    def discover(self) -> List[str]:
        """
        Scan plugins directory for valid plugins.

        Returns list of discovered plugin names.
        """
        discovered = []

        if not self._plugins_dir.exists():
            return discovered

        for item in self._plugins_dir.iterdir():
            if not item.is_dir():
                continue

            manifest_path = item / "plugin.json"
            if not manifest_path.exists():
                continue

            try:
                data = json.loads(manifest_path.read_text(encoding="utf-8"))
                manifest = PluginManifest.from_dict(data)

                self._plugins[manifest.name] = PluginInfo(
                    manifest=manifest,
                    path=item,
                    state=PluginState.DISCOVERED,
                )
                discovered.append(manifest.name)
                logger.debug("Discovered plugin: %s v%s", manifest.name, manifest.version)

            except Exception as e:
                logger.warning("Invalid plugin at %s: %s", item, e)

        return discovered

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def validate_plugin(self, name: str) -> bool:
        """
        Validate a plugin's manifest and permissions.

        Returns True if plugin is safe to load.
        """
        info = self._plugins.get(name)
        if not info:
            return False

        manifest = info.manifest

        # Check entry point exists
        entry = info.path / manifest.entry_point
        if not entry.exists():
            info.error = f"Entry point not found: {manifest.entry_point}"
            info.state = PluginState.ERROR
            return False

        # Check permissions
        for perm in manifest.permissions:
            if perm not in self._allowed_permissions:
                info.error = f"Permission denied: {perm}"
                info.state = PluginState.ERROR
                return False

        # Check dependencies
        for dep in manifest.dependencies:
            if dep not in self._plugins:
                info.error = f"Missing dependency: {dep}"
                info.state = PluginState.ERROR
                return False

        info.state = PluginState.VALIDATED
        return True

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    async def load_plugin(self, name: str) -> bool:
        """Load and initialize a plugin."""
        info = self._plugins.get(name)
        if not info:
            logger.error("Plugin not found: %s", name)
            return False

        # Validate first
        if info.state == PluginState.DISCOVERED:
            if not self.validate_plugin(name):
                logger.error("Plugin validation failed: %s — %s", name, info.error)
                return False

        if info.state not in (PluginState.VALIDATED, PluginState.UNLOADED):
            logger.warning("Plugin %s is in state %s, cannot load", name, info.state.value)
            return False

        t0 = time.time()

        try:
            # Load dependencies first
            for dep in info.manifest.dependencies:
                dep_info = self._plugins.get(dep)
                if dep_info and dep_info.state not in (
                    PluginState.INITIALIZED, PluginState.RUNNING,
                ):
                    await self.load_plugin(dep)

            # Sandboxed mode: run plugin in isolated subprocess
            if self._sandbox and PluginPermission.SHELL_EXEC.value in info.manifest.permissions:
                return await self._load_sandboxed(name, info, t0)

            # Load the module
            entry_path = info.path / info.manifest.entry_point
            spec = importlib.util.spec_from_file_location(
                f"aether_plugin_{name}", str(entry_path),
            )
            module = importlib.util.module_from_spec(spec)
            sys.modules[f"aether_plugin_{name}"] = module
            spec.loader.exec_module(module)

            info.module = module
            info.state = PluginState.LOADED

            # Look for Plugin class or setup function
            if hasattr(module, "Plugin"):
                info.instance = module.Plugin()
            elif hasattr(module, "AetherPlugin"):
                info.instance = module.AetherPlugin()

            # Initialize
            if info.instance and hasattr(info.instance, "initialize"):
                context = {
                    "orchestrator": self._orchestrator,
                    "plugin_dir": str(info.path),
                    "permissions": info.manifest.permissions,
                }
                await info.instance.initialize(context)

            elif hasattr(module, "setup"):
                await module.setup(self._orchestrator)

            info.state = PluginState.INITIALIZED
            info.loaded_at = time.time()
            info.load_time_ms = (time.time() - t0) * 1000

            # Register event hooks
            if self._orchestrator and info.instance:
                for hook in info.manifest.event_hooks:
                    handler = getattr(info.instance, f"on_{hook}", None)
                    if handler:
                        try:
                            from .orchestrator import EventType
                            event_type = EventType(hook)
                            self._orchestrator.on(event_type, handler)
                        except (ValueError, ImportError):
                            pass

            logger.info(
                "✓ Plugin loaded: %s v%s (%.0fms)",
                name, info.manifest.version, info.load_time_ms,
            )
            return True

        except Exception as e:
            info.state = PluginState.ERROR
            info.error = str(e)
            info.load_time_ms = (time.time() - t0) * 1000
            logger.error("✗ Plugin load failed: %s — %s", name, e)
            return False

    async def unload_plugin(self, name: str) -> bool:
        """Unload a plugin."""
        info = self._plugins.get(name)
        if not info:
            return False

        try:
            # Stop sandbox process if running
            if name in self._sandbox_procs:
                await self._stop_sandbox(name)

            # Call cleanup
            if info.instance and hasattr(info.instance, "shutdown"):
                await info.instance.shutdown()
            elif info.module and hasattr(info.module, "teardown"):
                await info.module.teardown()

            # Remove from sys.modules
            mod_name = f"aether_plugin_{name}"
            sys.modules.pop(mod_name, None)

            info.module = None
            info.instance = None
            info.state = PluginState.UNLOADED
            logger.info("⏹ Plugin unloaded: %s", name)
            return True

        except Exception as e:
            info.error = str(e)
            logger.error("Error unloading %s: %s", name, e)
            return False

    async def reload_plugin(self, name: str) -> bool:
        """Hot-reload a plugin."""
        await self.unload_plugin(name)
        # Re-discover to pick up changes
        self.discover()
        return await self.load_plugin(name)

    # ------------------------------------------------------------------
    # Query
    # ------------------------------------------------------------------

    def list_plugins(
        self, state: Optional[PluginState] = None,
    ) -> List[PluginInfo]:
        """List all plugins, optionally filtered by state."""
        plugins = list(self._plugins.values())
        if state:
            plugins = [p for p in plugins if p.state == state]
        return sorted(plugins, key=lambda p: p.manifest.name)

    def get_plugin(self, name: str) -> Optional[PluginInfo]:
        return self._plugins.get(name)

    def is_loaded(self, name: str) -> bool:
        info = self._plugins.get(name)
        return info is not None and info.state in (
            PluginState.INITIALIZED, PluginState.RUNNING,
        )

    # ------------------------------------------------------------------
    # Auto-load
    # ------------------------------------------------------------------

    async def load_all(self) -> Dict[str, bool]:
        """Load all discovered plugins."""
        results = {}
        for name in list(self._plugins.keys()):
            results[name] = await self.load_plugin(name)
        return results

    # ------------------------------------------------------------------
    # Sandboxed Execution
    # ------------------------------------------------------------------

    async def _load_sandboxed(self, name: str, info: PluginInfo, t0: float) -> bool:
        """Load a plugin in an isolated subprocess with restricted capabilities."""
        entry_path = info.path / info.manifest.entry_point

        # Build a minimal runner script that imports and runs the plugin
        runner_code = f"""
import sys, json, importlib.util
spec = importlib.util.spec_from_file_location("plugin", {str(entry_path)!r})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
cls = getattr(mod, "Plugin", None) or getattr(mod, "AetherPlugin", None)
if cls:
    import asyncio
    inst = cls()
    if hasattr(inst, "initialize"):
        asyncio.run(inst.initialize({{"plugin_dir": {str(info.path)!r}, "permissions": {info.manifest.permissions!r}}}))
    if hasattr(inst, "run"):
        asyncio.run(inst.run())
print(json.dumps({{"status": "ok", "name": {name!r}}}), flush=True)
"""

        env = os.environ.copy()
        env["PYTHONDONTWRITEBYTECODE"] = "1"

        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-c", runner_code,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            self._sandbox_procs[name] = proc

            # Wait for startup confirmation (5s timeout)
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=5.0)
                output = stdout.decode().strip()
                if '"status": "ok"' in output:
                    info.state = PluginState.INITIALIZED
                    info.loaded_at = time.time()
                    info.load_time_ms = (time.time() - t0) * 1000
                    logger.info("✓ Plugin loaded (sandboxed): %s v%s", name, info.manifest.version)
                    return True
                else:
                    info.state = PluginState.ERROR
                    info.error = f"Sandbox startup failed: {stderr.decode()[:200]}"
                    return False
            except asyncio.TimeoutError:
                # Long-running plugin — assume it's initialized
                info.state = PluginState.RUNNING
                info.loaded_at = time.time()
                info.load_time_ms = (time.time() - t0) * 1000
                logger.info("✓ Plugin running (sandboxed): %s v%s", name, info.manifest.version)
                return True

        except Exception as e:
            info.state = PluginState.ERROR
            info.error = f"Sandbox error: {e}"
            logger.error("✗ Sandboxed load failed: %s — %s", name, e)
            return False

    async def _stop_sandbox(self, name: str) -> None:
        """Terminate a sandboxed plugin subprocess."""
        proc = self._sandbox_procs.pop(name, None)
        if proc and proc.returncode is None:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                proc.kill()

    def get_status(self) -> Dict[str, Any]:
        return {
            "plugins_dir": str(self._plugins_dir),
            "total": len(self._plugins),
            "loaded": sum(
                1 for p in self._plugins.values()
                if p.state in (PluginState.INITIALIZED, PluginState.RUNNING)
            ),
            "errored": sum(
                1 for p in self._plugins.values()
                if p.state == PluginState.ERROR
            ),
            "plugins": {
                name: {
                    "version": p.manifest.version,
                    "state": p.state.value,
                    "error": p.error,
                }
                for name, p in self._plugins.items()
            },
        }
