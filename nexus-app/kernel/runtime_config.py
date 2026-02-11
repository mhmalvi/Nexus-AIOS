"""
Nexus Runtime Config — Persistent, file-backed configuration store.

Loads from ~/.nexus/config.json on startup and auto-saves on every update.
Thread-safe via asyncio.Lock. Falls back to defaults if the file is missing/corrupt.
"""

import asyncio
import json
import os
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, Optional


# Default configuration values
DEFAULT_CONFIG: Dict[str, Any] = {
    # LLM settings
    "default_model": "llama3.2:3b",
    "ollama_host": "http://localhost:11434",
    "temperature": 0.7,
    "max_tokens": 2048,

    # Safety settings
    "require_approval_for_high_risk": True,
    "approval_timeout_seconds": 300,
    "enable_safety_checker": True,

    # Model router settings
    "enable_llm_routing": True,
    "routing_model": "llama3.2:1b",

    # Memory settings
    "memory_db_path": "~/.nexus/memory/nexus.lance",
    "max_memory_entries": 10000,

    # Performance
    "query_cache_size": 256,
    "query_cache_ttl_seconds": 300,
    "rate_limit_ms": 100,

    # Voice
    "enable_voice": False,
    "voice_model": "en_US-lessac-medium",

    # UI
    "theme": "dark",

    # OpenClaw Integration
    "enable_openclaw": False,
    "openclaw_gateway_url": "ws://localhost:8080/v1/s2s",
    "openclaw_channels": ["whatsapp", "discord"],
}


class RuntimeConfig:
    """
    Persistent runtime config backed by a JSON file.

    Usage:
        config = RuntimeConfig()
        await config.load()

        model = config.get("default_model")          # "llama3.2:3b"
        await config.set("default_model", "mistral")  # saves to disk immediately
        await config.set_many({"temperature": 0.5, "max_tokens": 4096})
    """

    def __init__(self, config_path: Optional[str] = None):
        if config_path:
            self._path = Path(config_path)
        else:
            self._path = Path.home() / ".nexus" / "config.json"
        self._data: Dict[str, Any] = deepcopy(DEFAULT_CONFIG)
        self._lock = asyncio.Lock()

    async def load(self) -> None:
        """Load config from disk, merging with defaults."""
        async with self._lock:
            if self._path.exists():
                try:
                    raw = self._path.read_text(encoding="utf-8")
                    disk_data = json.loads(raw)
                    # Merge: disk values override defaults, but new default keys are added
                    merged = deepcopy(DEFAULT_CONFIG)
                    merged.update(disk_data)
                    self._data = merged
                except (json.JSONDecodeError, OSError) as e:
                    print(f"⚠️ Config file corrupt, using defaults: {e}")
                    self._data = deepcopy(DEFAULT_CONFIG)
            else:
                self._data = deepcopy(DEFAULT_CONFIG)
                # Save defaults to disk so the file exists
                self._persist()

    def get(self, key: str, default: Any = None) -> Any:
        """Get a config value (synchronous, no lock needed for reads)."""
        return self._data.get(key, default)

    def get_all(self) -> Dict[str, Any]:
        """Get a copy of the entire config dict."""
        return deepcopy(self._data)

    async def set(self, key: str, value: Any) -> None:
        """Set a config value and persist to disk."""
        async with self._lock:
            self._data[key] = value
            self._persist()

    async def set_many(self, updates: Dict[str, Any]) -> None:
        """Update multiple config values atomically and persist."""
        async with self._lock:
            self._data.update(updates)
            self._persist()

    async def reset(self, key: Optional[str] = None) -> None:
        """Reset a key (or all keys) to defaults and persist."""
        async with self._lock:
            if key:
                self._data[key] = DEFAULT_CONFIG.get(key)
            else:
                self._data = deepcopy(DEFAULT_CONFIG)
            self._persist()

    def _persist(self) -> None:
        """Write current config to disk (must be called under lock)."""
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = self._path.with_suffix(".tmp")
            tmp_path.write_text(
                json.dumps(self._data, indent=2, sort_keys=True),
                encoding="utf-8",
            )
            # Atomic rename (works on Windows if same volume)
            tmp_path.replace(self._path)
        except OSError as e:
            print(f"⚠️ Failed to persist config: {e}")
