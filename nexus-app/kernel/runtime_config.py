"""
AETHER Runtime Config — Persistent, file-backed configuration store.

Loads from ~/.aether/config.json on startup and auto-saves on every update.
Thread-safe via asyncio.Lock. Falls back to defaults if the file is missing/corrupt.

AETHER ships with Ollama (local LLM) as the default for full privacy.
Cloud providers are optional but recommended for maximum performance.
"""

import asyncio
import json
import os
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, Optional

try:
    from security.key_vault import KeyVault
    _VAULT_AVAILABLE = True
except ImportError:
    _VAULT_AVAILABLE = False
    KeyVault = None


# Default configuration values
DEFAULT_CONFIG: Dict[str, Any] = {
    # ── AI Provider Settings ──────────────────────────────────────────
    # "auto" = try cloud providers first (if keys exist), fallback to Ollama
    # Set to a specific provider ID to prefer it: "groq", "cerebras", etc.
    "ai_provider": "auto",

    # Cloud Provider API Keys (user-provided, never shipped with defaults)
    "api_keys": {
        "openai": "",
        "anthropic": "",
        "groq": "",
        "cerebras": "",
        "mistral": "",
        "gemini": "",
        "openrouter": "",
    },

    # Per-provider model override (empty = use provider default)
    "provider_models": {
        "openai": "",         # default: gpt-4o-mini
        "anthropic": "",      # default: claude-sonnet-4-20250514
        "groq": "",           # default: llama-3.3-70b-versatile
        "cerebras": "",       # default: llama-3.3-70b
        "mistral": "",        # default: mistral-small-latest
        "gemini": "",         # default: gemini-2.0-flash
        "openrouter": "",     # default: meta-llama/llama-3.3-70b-instruct
        "ollama": "",         # default: llama3.2:3b
    },

    # ── Ollama (Local LLM — ships as default) ─────────────────────────
    "ollama_host": "http://localhost:11434",
    "default_model": "llama3.2:3b",  # Ollama default model

    # ── Generation Settings ───────────────────────────────────────────
    "temperature": 0.7,
    "max_tokens": 2048,

    # ── Model Router ──────────────────────────────────────────────────
    "enable_llm_routing": True,
    "routing_model": "llama3.2:1b",

    # ── Safety & Supervisor ───────────────────────────────────────────
    "require_approval_for_high_risk": True,
    "approval_timeout_seconds": 300,
    "enable_safety_checker": True,
    "enable_ast_command_audit": True,

    # ── Self-Destruct System ──────────────────────────────────────────
    "self_destruct": {
        "enabled": False,
        "soft_lock_attempts": 3,       # Lock screen after N failed auths
        "hard_lock_attempts": 5,       # Encrypt data after N failed auths
        "dead_man_switch_days": 0,     # 0 = disabled, >0 = auto-lock after N days
        "wipe_on_destruct": False,     # Full data wipe on destruct command
    },

    # ── 4-Tier Memory ─────────────────────────────────────────────────
    "memory": {
        "db_path": "~/.aether/memory/aether.lance",
        "session_db_path": "~/.aether/memory/sessions.db",
        "qmd_path": "~/.aether/memory/qmd/",
        "max_tier2_entries": 50000,
        "max_tier3_entries": 500000,
        "embedding_model": "nomic-embed-text",  # Local via Ollama
        "embedding_provider": "ollama",          # "ollama", "voyage", "gemini", "openai"
        "enable_hybrid_search": True,
        "auto_index_workspace": True,
    },

    # ── Voice ─────────────────────────────────────────────────────────
    "voice": {
        "enabled": False,
        "wake_word": "aether",
        "stt_model": "whisper-base",
        "tts_model": "en_US-lessac-medium",
        "tts_speed": 1.0,
        "ambient_mode": False,     # Passive listening when enabled
        "voice_confirmation": True,  # Require voice confirm for dangerous ops
    },

    # ── Performance ───────────────────────────────────────────────────
    "query_cache_size": 256,
    "query_cache_ttl_seconds": 300,
    "rate_limit_ms": 100,

    # ── UI ────────────────────────────────────────────────────────────
    "theme": "dark",
    "persona": "default",  # SOUL.md persona file name

    # ── OpenClaw Integration ──────────────────────────────────────────
    "enable_openclaw": False,
    "openclaw_gateway_url": "ws://localhost:8080/v1/s2s",
    "openclaw_channels": ["whatsapp", "discord"],

    # ── Agent Settings ────────────────────────────────────────────────
    "agents": {
        "max_subagents": 5,
        "subagent_timeout_seconds": 600,
        "default_tool_profile": "full",  # "minimal", "coding", "messaging", "full"
        "allow_remote_agent_creation": False,
    },
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
            self._path = Path.home() / ".aether" / "config.json"
        self._data: Dict[str, Any] = deepcopy(DEFAULT_CONFIG)
        self._lock = asyncio.Lock()
        self._vault = KeyVault() if _VAULT_AVAILABLE and KeyVault else None

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
                    # Decrypt API keys if vault is available
                    if self._vault and self._vault.available and "api_keys" in merged:
                        merged["api_keys"] = self._vault.decrypt_keys(merged["api_keys"])
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
        """Write current config to disk (must be called under lock).
        Sets restrictive file permissions (owner-only) on Unix systems
        since config may contain API keys.
        """
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            # Set directory permissions on Unix (owner-only access)
            if os.name != 'nt':
                try:
                    os.chmod(self._path.parent, 0o700)
                except OSError:
                    pass
            # Encrypt API keys before writing to disk
            data_to_write = deepcopy(self._data)
            if self._vault and self._vault.available and "api_keys" in data_to_write:
                data_to_write["api_keys"] = self._vault.encrypt_keys(data_to_write["api_keys"])
            tmp_path = self._path.with_suffix(".tmp")
            tmp_path.write_text(
                json.dumps(data_to_write, indent=2, sort_keys=True),
                encoding="utf-8",
            )
            # Atomic rename (works on Windows if same volume)
            tmp_path.replace(self._path)
            # Set file permissions on Unix (owner read/write only — contains API keys)
            if os.name != 'nt':
                try:
                    os.chmod(self._path, 0o600)
                except OSError:
                    pass
        except OSError as e:
            print(f"⚠️ Failed to persist config: {e}")
