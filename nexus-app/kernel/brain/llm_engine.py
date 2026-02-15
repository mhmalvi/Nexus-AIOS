"""
AETHER LLM Engine — Unified AI Interface

This is the single entry point for all LLM operations in AETHER.
It wraps CloudLLMEngine (multi-provider) and adds:
- Automatic compaction when context window fills up
- Context window guard monitoring
- Seamless Ollama ↔ Cloud provider switching

Ollama ships as the DEFAULT for full privacy.
Cloud providers are recommended for power users.
"""

import logging
from typing import Optional, List, Dict, Any, AsyncGenerator

from .cloud_engine import (
    CloudLLMEngine,
    FallbackAttempt,
    evaluate_context_guard,
    ContextWindowStatus,
)
from .compaction import CompactionEngine, CompactionResult

logger = logging.getLogger("aether.llm_engine")


class LLMEngine:
    """
    AETHER's unified LLM Engine.

    Combines CloudLLMEngine (multi-provider fallback) with
    CompactionEngine (context window management).

    Usage:
        engine = LLMEngine(config)
        await engine.initialize()

        # Simple generation
        response = await engine.generate("explain quantum computing")

        # Streaming
        async for chunk in engine.stream_generate("write a poem"):
            print(chunk, end="")

        # With conversation history (auto-compacts if needed)
        response = await engine.generate(
            "what was the bug?",
            messages=conversation_history,
        )
    """

    def __init__(self, config=None):
        """
        Args:
            config: RuntimeConfig instance. If None, uses defaults
                    (Ollama local only).
        """
        self._config = config
        self._cloud_engine: Optional[CloudLLMEngine] = None
        self._compaction: Optional[CompactionEngine] = None
        self._initialized = False

        # Stats
        self.total_generations = 0
        self.total_fallbacks = 0
        self.total_compactions = 0

    async def initialize(self) -> None:
        """Initialize the engine with current config."""
        if self._config:
            api_keys = self._config.get("api_keys", {})
            preferred = self._config.get("ai_provider", "auto")
            provider_models = self._config.get("provider_models", {})
            ollama_host = self._config.get("ollama_host", "http://localhost:11434")
        else:
            api_keys = {}
            preferred = "auto"
            provider_models = {}
            ollama_host = "http://localhost:11434"

        self._cloud_engine = CloudLLMEngine(
            api_keys=api_keys,
            preferred_provider=preferred,
            provider_models=provider_models,
            ollama_host=ollama_host,
            on_fallback=self._on_fallback,
        )

        self._compaction = CompactionEngine(
            summarize_fn=self._summarize_for_compaction,
            max_chunk_tokens=8_000,
            keep_recent_messages=10,
        )

        self._initialized = True
        logger.info(
            "AETHER LLM Engine initialized (provider=%s, ollama=%s)",
            preferred, ollama_host,
        )

    async def reload_config(self) -> None:
        """Reload config (e.g., after user changes API keys in Settings)."""
        await self.initialize()

    # ------------------------------------------------------------------
    # Generation
    # ------------------------------------------------------------------

    async def generate(
        self,
        prompt: str,
        context: Optional[List[Dict[str, Any]]] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        messages: Optional[List[Dict[str, Any]]] = None,
        auto_compact: bool = True,
    ) -> str:
        """
        Generate a response, with automatic context compaction if needed.

        Args:
            prompt: User prompt.
            context: RAG context items.
            system_prompt: System instructions.
            temperature: Sampling temperature.
            max_tokens: Max response tokens.
            messages: Full conversation history (if provided, prompt is ignored).
            auto_compact: If True, compact history when approaching context limit.
        """
        self._ensure_initialized()
        msgs = messages

        # Auto-compact if history is provided and approaching limits
        if msgs and auto_compact and self._compaction:
            guard = evaluate_context_guard(msgs, budget_tokens=120_000)
            if guard.should_compact:
                logger.info(
                    "Context window at %.0f%% — triggering compaction",
                    guard.usage_pct,
                )
                result = await self._compaction.compact(msgs, budget_tokens=100_000)
                msgs = result.kept_messages
                self.total_compactions += 1
                logger.info(
                    "Compacted: %d → %d tokens (%.0f%% reduction)",
                    result.original_tokens, result.compacted_tokens,
                    result.compression_ratio * 100,
                )

        self.total_generations += 1

        return await self._cloud_engine.generate(
            prompt=prompt,
            context=context,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            messages=msgs,
        )

    async def stream_generate(
        self,
        prompt: str,
        context: Optional[List[Dict[str, Any]]] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        messages: Optional[List[Dict[str, Any]]] = None,
        auto_compact: bool = True,
    ) -> AsyncGenerator[str, None]:
        """Stream response tokens with auto-compaction."""
        self._ensure_initialized()
        msgs = messages

        if msgs and auto_compact and self._compaction:
            guard = evaluate_context_guard(msgs, budget_tokens=120_000)
            if guard.should_compact:
                result = await self._compaction.compact(msgs, budget_tokens=100_000)
                msgs = result.kept_messages
                self.total_compactions += 1

        self.total_generations += 1

        async for chunk in self._cloud_engine.stream_generate(
            prompt=prompt,
            context=context,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            messages=msgs,
        ):
            yield chunk

    # ------------------------------------------------------------------
    # Embeddings
    # ------------------------------------------------------------------

    async def embed(self, text: str, model: Optional[str] = None) -> List[float]:
        """Generate embeddings (uses Ollama by default for privacy)."""
        self._ensure_initialized()
        return await self._cloud_engine.embed(text, model)

    # ------------------------------------------------------------------
    # Status & Health
    # ------------------------------------------------------------------

    async def check_health(self) -> Dict[str, Any]:
        """Check provider availability."""
        self._ensure_initialized()
        health = await self._cloud_engine.check_health()
        health["_stats"] = {
            "total_generations": self.total_generations,
            "total_fallbacks": self.total_fallbacks,
            "total_compactions": self.total_compactions,
        }
        return health

    def get_active_provider(self) -> Dict[str, Any]:
        """Get info about the currently active provider."""
        if not self._cloud_engine:
            return {"provider": "not_initialized", "model": "", "latency_ms": 0}
        return self._cloud_engine.get_active_provider_info()

    def get_context_status(
        self, messages: List[Dict[str, Any]]
    ) -> ContextWindowStatus:
        """Evaluate context window usage for a message list."""
        return evaluate_context_guard(messages, budget_tokens=120_000)

    # ------------------------------------------------------------------
    # Backward compatibility (Ollama-style methods)
    # ------------------------------------------------------------------

    async def list_models(self) -> List[str]:
        """List available Ollama models (backward compat)."""
        import aiohttp
        host = "http://localhost:11434"
        if self._config:
            host = self._config.get("ollama_host", host)
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{host}/api/tags",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    result = await resp.json()
                    return [m["name"] for m in result.get("models", [])]
        except Exception:
            return []

    async def change_model(self, model: str) -> bool:
        """Switch the default Ollama model (backward compat)."""
        if self._config:
            if isinstance(self._config, dict):
                self._config["default_model"] = model
            else:
                await self._config.set("default_model", model)
        if self._cloud_engine:
            self._cloud_engine.provider_models["ollama"] = model
        return True

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _ensure_initialized(self) -> None:
        if not self._initialized or not self._cloud_engine:
            raise RuntimeError(
                "LLMEngine not initialized. Call `await engine.initialize()` first."
            )

    async def _on_fallback(self, attempt: FallbackAttempt) -> None:
        """Called when a provider fails and we fall back to the next one."""
        self.total_fallbacks += 1
        logger.warning(
            "Fallback #%d: %s/%s failed (%.0fms): %s",
            self.total_fallbacks,
            attempt.provider, attempt.model,
            attempt.latency_ms, attempt.error,
        )

    async def _summarize_for_compaction(self, text: str) -> str:
        """Use the LLM itself to summarize for compaction."""
        try:
            return await self._cloud_engine.generate(
                prompt=text,
                system_prompt=(
                    "You are a conversation summarizer. Produce a concise summary "
                    "that preserves key decisions, facts, and action items. "
                    "Use bullet points. Be thorough but brief."
                ),
                temperature=0.3,
                max_tokens=1024,
            )
        except Exception as e:
            logger.warning("Summarization for compaction failed: %s", e)
            # Truncation fallback
            return text[:2000] if len(text) > 2000 else text
