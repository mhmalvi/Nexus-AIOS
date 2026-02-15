"""
AETHER Cloud AI Engine — Multi-Provider LLM Backend with Automatic Fallback

Supports: OpenAI, Anthropic/Claude, Groq, Cerebras, Mistral, Gemini, OpenRouter, Ollama
Each provider uses the OpenAI-compatible /chat/completions API except:
  - Anthropic: uses /v1/messages with x-api-key auth and different SSE events
  - Ollama: uses /api/chat with NDJSON streaming

Fallback order: User's preferred provider → next available → Ollama (local)
"""

import aiohttp
import asyncio
import json
import time
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import (
    Optional, List, Dict, Any, AsyncGenerator, Callable, Awaitable, Tuple,
)

logger = logging.getLogger("aether.cloud_engine")


# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------

class ProviderID(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GROQ = "groq"
    CEREBRAS = "cerebras"
    MISTRAL = "mistral"
    GEMINI = "gemini"
    OPENROUTER = "openrouter"
    OLLAMA = "ollama"


@dataclass(frozen=True)
class ProviderSpec:
    """Static metadata for a cloud AI provider."""
    id: ProviderID
    name: str
    base_url: str
    chat_path: str  # appended to base_url
    auth_header: str  # header name for the API key
    auth_prefix: str  # e.g. "Bearer "
    default_model: str
    supports_streaming: bool = True
    max_retries: int = 2
    timeout_seconds: int = 120
    # Gemini uses a different request/response shape
    needs_translation: bool = False


PROVIDER_REGISTRY: Dict[ProviderID, ProviderSpec] = {
    ProviderID.OPENAI: ProviderSpec(
        id=ProviderID.OPENAI,
        name="OpenAI",
        base_url="https://api.openai.com/v1",
        chat_path="/chat/completions",
        auth_header="Authorization",
        auth_prefix="Bearer ",
        default_model="gpt-4o-mini",
    ),
    ProviderID.ANTHROPIC: ProviderSpec(
        id=ProviderID.ANTHROPIC,
        name="Anthropic",
        base_url="https://api.anthropic.com/v1",
        chat_path="/messages",
        auth_header="x-api-key",
        auth_prefix="",  # Anthropic uses raw key, no "Bearer " prefix
        default_model="claude-sonnet-4-20250514",
        needs_translation=True,  # Different request/response shape
    ),
    ProviderID.GROQ: ProviderSpec(
        id=ProviderID.GROQ,
        name="Groq",
        base_url="https://api.groq.com/openai/v1",
        chat_path="/chat/completions",
        auth_header="Authorization",
        auth_prefix="Bearer ",
        default_model="llama-3.3-70b-versatile",
    ),
    ProviderID.CEREBRAS: ProviderSpec(
        id=ProviderID.CEREBRAS,
        name="Cerebras",
        base_url="https://api.cerebras.ai/v1",
        chat_path="/chat/completions",
        auth_header="Authorization",
        auth_prefix="Bearer ",
        default_model="llama-3.3-70b",
    ),
    ProviderID.MISTRAL: ProviderSpec(
        id=ProviderID.MISTRAL,
        name="Mistral",
        base_url="https://api.mistral.ai/v1",
        chat_path="/chat/completions",
        auth_header="Authorization",
        auth_prefix="Bearer ",
        default_model="mistral-small-latest",
    ),
    ProviderID.GEMINI: ProviderSpec(
        id=ProviderID.GEMINI,
        name="Gemini",
        base_url="https://generativelanguage.googleapis.com/v1beta",
        chat_path="/openai/chat/completions",  # Gemini's OpenAI-compat endpoint
        auth_header="Authorization",
        auth_prefix="Bearer ",
        default_model="gemini-2.0-flash",
    ),
    ProviderID.OPENROUTER: ProviderSpec(
        id=ProviderID.OPENROUTER,
        name="OpenRouter",
        base_url="https://openrouter.ai/api/v1",
        chat_path="/chat/completions",
        auth_header="Authorization",
        auth_prefix="Bearer ",
        default_model="meta-llama/llama-3.3-70b-instruct",
    ),
    ProviderID.OLLAMA: ProviderSpec(
        id=ProviderID.OLLAMA,
        name="Ollama (Local)",
        base_url="http://localhost:11434/api",
        chat_path="/chat",
        auth_header="",  # Ollama needs no auth
        auth_prefix="",
        default_model="llama3.2:3b",
        timeout_seconds=5,  # fast fail for local inference check
    ),
}

# Default fallback order when provider = "auto"
# Fast free providers first → premium providers → local fallback
DEFAULT_FALLBACK_ORDER: List[ProviderID] = [
    ProviderID.GROQ,
    ProviderID.CEREBRAS,
    ProviderID.OPENAI,
    ProviderID.ANTHROPIC,
    ProviderID.MISTRAL,
    ProviderID.GEMINI,
    ProviderID.OPENROUTER,
    ProviderID.OLLAMA,
]


# ---------------------------------------------------------------------------
# Cooldown tracker — skip providers that recently errored
# ---------------------------------------------------------------------------

@dataclass
class ProviderCooldown:
    """Tracks failed providers to avoid hammering them."""
    failed_at: float = 0.0
    consecutive_failures: int = 0
    cooldown_until: float = 0.0

    def mark_failure(self) -> None:
        self.failed_at = time.monotonic()
        self.consecutive_failures += 1
        # Exponential backoff: 5s, 10s, 20s, 40s, max 120s
        backoff = min(5 * (2 ** (self.consecutive_failures - 1)), 120)
        self.cooldown_until = self.failed_at + backoff

    def mark_success(self) -> None:
        self.consecutive_failures = 0
        self.cooldown_until = 0.0

    def is_in_cooldown(self) -> bool:
        return time.monotonic() < self.cooldown_until

    @property
    def remaining_seconds(self) -> float:
        return max(0, self.cooldown_until - time.monotonic())


# ---------------------------------------------------------------------------
# Fallback attempt record
# ---------------------------------------------------------------------------

@dataclass
class FallbackAttempt:
    """Records one attempt in a fallback chain."""
    provider: str
    model: str
    error: str = ""
    status_code: int = 0
    latency_ms: float = 0.0


# ---------------------------------------------------------------------------
# Context Window Guard
# ---------------------------------------------------------------------------

CONTEXT_WINDOW_WARN_TOKENS = 32_000
CONTEXT_WINDOW_HARD_MIN_TOKENS = 16_000


@dataclass
class ContextWindowStatus:
    """Result of evaluating context window usage."""
    estimated_tokens: int
    budget_tokens: int
    should_warn: bool
    should_compact: bool

    @property
    def usage_pct(self) -> float:
        if self.budget_tokens <= 0:
            return 100.0
        return (self.estimated_tokens / self.budget_tokens) * 100


def estimate_tokens(text: str) -> int:
    """Fast token estimation (~4 chars per token for English)."""
    return max(1, len(text) // 4)


def estimate_messages_tokens(messages: List[Dict[str, Any]]) -> int:
    """Estimate total tokens across a message list."""
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, str):
            total += estimate_tokens(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict):
                    total += estimate_tokens(part.get("text", ""))
        total += 4  # per-message overhead
    return total


def evaluate_context_guard(
    messages: List[Dict[str, Any]],
    budget_tokens: int = 128_000,
) -> ContextWindowStatus:
    """Check if messages are approaching context window limits."""
    used = estimate_messages_tokens(messages)
    remaining = budget_tokens - used
    return ContextWindowStatus(
        estimated_tokens=used,
        budget_tokens=budget_tokens,
        should_warn=remaining < CONTEXT_WINDOW_WARN_TOKENS,
        should_compact=remaining < CONTEXT_WINDOW_HARD_MIN_TOKENS,
    )


# ---------------------------------------------------------------------------
# Cloud LLM Engine
# ---------------------------------------------------------------------------

class CloudLLMEngine:
    """
    AETHER's Cloud AI Engine.

    - Multi-provider with automatic fallback
    - Ollama ships as the default local LLM for privacy
    - Cloud providers recommended for power/speed
    - Context window guard prevents overflow
    - Cooldown tracker avoids hammering failed providers

    Usage:
        engine = CloudLLMEngine(config)
        response = await engine.generate("explain quantum computing")
        async for chunk in engine.stream_generate("write a poem"):
            print(chunk, end="")
    """

    def __init__(
        self,
        api_keys: Optional[Dict[str, str]] = None,
        preferred_provider: str = "auto",
        provider_models: Optional[Dict[str, str]] = None,
        ollama_host: str = "http://localhost:11434",
        on_fallback: Optional[Callable[[FallbackAttempt], Awaitable[None]]] = None,
    ):
        self.api_keys: Dict[str, str] = api_keys or {}
        self.preferred_provider = preferred_provider
        self.provider_models: Dict[str, str] = provider_models or {}
        self.ollama_host = ollama_host.rstrip("/")
        self.on_fallback = on_fallback

        # Cooldown state per provider
        self._cooldowns: Dict[str, ProviderCooldown] = {
            p.value: ProviderCooldown() for p in ProviderID
        }

        # Track the last-used provider for status reporting
        self.last_provider: Optional[str] = None
        self.last_model: Optional[str] = None
        self.last_latency_ms: float = 0.0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def generate(
        self,
        prompt: str,
        context: Optional[List[Dict[str, Any]]] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        messages: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """Generate a complete response with automatic fallback."""
        msgs = messages or self._build_messages(prompt, context, system_prompt)

        result = await self._run_with_fallback(
            msgs, temperature, max_tokens, stream=False
        )
        return result

    async def stream_generate(
        self,
        prompt: str,
        context: Optional[List[Dict[str, Any]]] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        messages: Optional[List[Dict[str, Any]]] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream response tokens with automatic fallback."""
        msgs = messages or self._build_messages(prompt, context, system_prompt)
        candidates = self._resolve_candidates()

        for i, (provider_id, model) in enumerate(candidates):
            spec = PROVIDER_REGISTRY.get(ProviderID(provider_id))
            if not spec:
                continue

            cooldown = self._cooldowns.get(provider_id)
            if cooldown and cooldown.is_in_cooldown():
                logger.debug(
                    "Skipping %s (cooldown %.0fs)",
                    provider_id, cooldown.remaining_seconds,
                )
                continue

            try:
                t0 = time.monotonic()
                async for chunk in self._stream_single_provider(
                    spec, model, msgs, temperature, max_tokens
                ):
                    yield chunk

                elapsed = (time.monotonic() - t0) * 1000
                self.last_provider = provider_id
                self.last_model = model
                self.last_latency_ms = elapsed
                if cooldown:
                    cooldown.mark_success()
                return  # success — stop fallback

            except Exception as e:
                elapsed = (time.monotonic() - t0) * 1000
                attempt = FallbackAttempt(
                    provider=provider_id, model=model,
                    error=str(e), latency_ms=elapsed,
                )
                logger.warning("Provider %s failed: %s", provider_id, e)
                if cooldown:
                    cooldown.mark_failure()
                if self.on_fallback:
                    await self.on_fallback(attempt)

        raise RuntimeError(
            "All AI providers failed. Please check your API keys in Settings, "
            "or ensure Ollama is running locally for offline mode."
        )

    async def embed(self, text: str, model: Optional[str] = None) -> List[float]:
        """Generate embeddings. Uses Ollama by default (local)."""
        embed_model = model or "nomic-embed-text"
        payload = {"model": embed_model, "prompt": text}
        url = f"{self.ollama_host}/api/embeddings"

        async with aiohttp.ClientSession() as session:
            async with session.post(
                url, json=payload,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"Embedding error: {await resp.text()}")
                result = await resp.json()
                return result.get("embedding", [])

    async def check_health(self) -> Dict[str, Any]:
        """Check which providers are available."""
        status = {}
        for pid in ProviderID:
            pid_str = pid.value
            cooldown = self._cooldowns.get(pid_str)

            if pid == ProviderID.OLLAMA:
                try:
                    async with aiohttp.ClientSession() as s:
                        async with s.get(
                            self.ollama_host,
                            timeout=aiohttp.ClientTimeout(total=3),
                        ) as r:
                            status[pid_str] = {
                                "available": r.status == 200,
                                "type": "local",
                            }
                except Exception:
                    status[pid_str] = {"available": False, "type": "local"}
            else:
                has_key = bool(self.api_keys.get(pid_str, "").strip())
                in_cooldown = cooldown.is_in_cooldown() if cooldown else False
                status[pid_str] = {
                    "available": has_key and not in_cooldown,
                    "has_key": has_key,
                    "in_cooldown": in_cooldown,
                    "type": "cloud",
                }
        return status

    def get_active_provider_info(self) -> Dict[str, Any]:
        """Return info about the last-used provider (for status bar)."""
        return {
            "provider": self.last_provider or "none",
            "model": self.last_model or "none",
            "latency_ms": round(self.last_latency_ms, 1),
        }

    # ------------------------------------------------------------------
    # Candidate resolution
    # ------------------------------------------------------------------

    def _resolve_candidates(self) -> List[Tuple[str, str]]:
        """
        Build the ordered list of (provider_id, model) to try.

        If preferred_provider is set and not 'auto', put it first.
        Then append remaining providers in DEFAULT_FALLBACK_ORDER,
        but only those that have an API key (or Ollama which needs none).
        """
        candidates: List[Tuple[str, str]] = []
        seen: set = set()

        def add(pid_str: str) -> None:
            if pid_str in seen:
                return
            pid = ProviderID(pid_str)
            spec = PROVIDER_REGISTRY.get(pid)
            if not spec:
                return
            # Skip cloud providers with no API key
            if pid != ProviderID.OLLAMA and not self.api_keys.get(pid_str, "").strip():
                return
            model = self.provider_models.get(pid_str, spec.default_model)
            candidates.append((pid_str, model))
            seen.add(pid_str)

        # 1. User's preferred provider first
        if self.preferred_provider and self.preferred_provider != "auto":
            add(self.preferred_provider)

        # 2. Remaining providers in default fallback order
        for pid in DEFAULT_FALLBACK_ORDER:
            add(pid.value)

        return candidates

    # ------------------------------------------------------------------
    # Message building
    # ------------------------------------------------------------------

    def _build_messages(
        self,
        prompt: str,
        context: Optional[List[Dict[str, Any]]] = None,
        system_prompt: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Build the OpenAI-format message list."""
        messages: List[Dict[str, Any]] = []

        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        if context:
            ctx_parts = []
            for i, item in enumerate(context, 1):
                content = item.get("content", str(item))
                source = item.get("source", "unknown")
                score = item.get("score", 0)
                ctx_parts.append(
                    f"[{i}] (relevance: {score:.2f}, source: {source})\n{content}"
                )
            messages.append({
                "role": "system",
                "content": f"Relevant context:\n\n{''.join(ctx_parts)}",
            })

        messages.append({"role": "user", "content": prompt})
        return messages

    # ------------------------------------------------------------------
    # Single-provider execution
    # ------------------------------------------------------------------

    async def _call_single_provider(
        self,
        spec: ProviderSpec,
        model: str,
        messages: List[Dict[str, Any]],
        temperature: float,
        max_tokens: int,
    ) -> str:
        """Call a single provider's chat completions endpoint (non-streaming)."""
        url, headers, payload = self._build_request(
            spec, model, messages, temperature, max_tokens, stream=False
        )

        async with aiohttp.ClientSession() as session:
            async with session.post(
                url, headers=headers, json=payload,
                timeout=aiohttp.ClientTimeout(total=spec.timeout_seconds),
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(
                        f"{spec.name} API error (HTTP {resp.status}): {body[:500]}"
                    )

                result = await resp.json()
                # Anthropic format
                if spec.id == ProviderID.ANTHROPIC:
                    content_blocks = result.get("content", [])
                    return "".join(
                        b.get("text", "") for b in content_blocks if b.get("type") == "text"
                    )
                # OpenAI-compat format
                choices = result.get("choices", [])
                if choices:
                    return choices[0].get("message", {}).get("content", "")
                # Ollama format
                return result.get("message", {}).get("content", "")

    async def _stream_single_provider(
        self,
        spec: ProviderSpec,
        model: str,
        messages: List[Dict[str, Any]],
        temperature: float,
        max_tokens: int,
    ) -> AsyncGenerator[str, None]:
        """Stream tokens from a single provider."""
        url, headers, payload = self._build_request(
            spec, model, messages, temperature, max_tokens, stream=True
        )

        async with aiohttp.ClientSession() as session:
            async with session.post(
                url, headers=headers, json=payload,
                timeout=aiohttp.ClientTimeout(total=spec.timeout_seconds),
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(
                        f"{spec.name} API error (HTTP {resp.status}): {body[:500]}"
                    )

                if spec.id == ProviderID.OLLAMA:
                    async for chunk in self._parse_ollama_stream(resp):
                        yield chunk
                elif spec.id == ProviderID.ANTHROPIC:
                    async for chunk in self._parse_anthropic_stream(resp):
                        yield chunk
                else:
                    async for chunk in self._parse_openai_stream(resp):
                        yield chunk

    # ------------------------------------------------------------------
    # Request building
    # ------------------------------------------------------------------

    def _build_request(
        self,
        spec: ProviderSpec,
        model: str,
        messages: List[Dict[str, Any]],
        temperature: float,
        max_tokens: int,
        stream: bool,
    ) -> Tuple[str, Dict[str, str], Dict[str, Any]]:
        """Build URL, headers, and payload for a provider request."""

        if spec.id == ProviderID.OLLAMA:
            url = f"{self.ollama_host}/api/chat"
            headers = {"Content-Type": "application/json"}
            payload = {
                "model": model,
                "messages": messages,
                "stream": stream,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens,
                },
            }

        elif spec.id == ProviderID.ANTHROPIC:
            # Anthropic Messages API — different format from OpenAI
            url = f"{spec.base_url}{spec.chat_path}"
            api_key = self.api_keys.get(spec.id.value, "")
            headers = {
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            }
            # Extract system prompt from messages (Anthropic uses a top-level `system` field)
            system_text = ""
            user_messages: List[Dict[str, Any]] = []
            for msg in messages:
                if msg.get("role") == "system":
                    system_text += ("\n\n" if system_text else "") + msg.get("content", "")
                else:
                    user_messages.append(msg)
            payload: Dict[str, Any] = {
                "model": model,
                "messages": user_messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "stream": stream,
            }
            if system_text:
                payload["system"] = system_text

        else:
            # OpenAI-compatible providers (OpenAI, Groq, Cerebras, Mistral, Gemini, OpenRouter)
            url = f"{spec.base_url}{spec.chat_path}"
            api_key = self.api_keys.get(spec.id.value, "")
            headers = {
                "Content-Type": "application/json",
                spec.auth_header: f"{spec.auth_prefix}{api_key}",
            }
            payload = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": stream,
            }
            # OpenRouter extra headers
            if spec.id == ProviderID.OPENROUTER:
                headers["HTTP-Referer"] = "https://aether-os.dev"
                headers["X-Title"] = "AETHER OS"

        return url, headers, payload

    # ------------------------------------------------------------------
    # Stream parsers
    # ------------------------------------------------------------------

    @staticmethod
    async def _parse_openai_stream(
        resp: aiohttp.ClientResponse,
    ) -> AsyncGenerator[str, None]:
        """Parse SSE stream from OpenAI-compatible APIs."""
        async for raw_line in resp.content:
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            if line.startswith("data: "):
                data_str = line[6:]
                if data_str == "[DONE]":
                    break
                try:
                    data = json.loads(data_str)
                    choices = data.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                except json.JSONDecodeError:
                    continue

    @staticmethod
    async def _parse_ollama_stream(
        resp: aiohttp.ClientResponse,
    ) -> AsyncGenerator[str, None]:
        """Parse Ollama's NDJSON stream."""
        async for raw_line in resp.content:
            if raw_line:
                try:
                    data = json.loads(raw_line.decode("utf-8", errors="replace"))
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done", False):
                        break
                except json.JSONDecodeError:
                    continue

    @staticmethod
    async def _parse_anthropic_stream(
        resp: aiohttp.ClientResponse,
    ) -> AsyncGenerator[str, None]:
        """Parse Anthropic's SSE stream (content_block_delta events)."""
        async for raw_line in resp.content:
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            if line.startswith("data: "):
                data_str = line[6:]
                if data_str == "[DONE]":
                    break
                try:
                    data = json.loads(data_str)
                    event_type = data.get("type", "")
                    if event_type == "content_block_delta":
                        delta = data.get("delta", {})
                        if delta.get("type") == "text_delta":
                            text = delta.get("text", "")
                            if text:
                                yield text
                    elif event_type == "message_stop":
                        break
                except json.JSONDecodeError:
                    continue

    # ------------------------------------------------------------------
    # Fallback runner
    # ------------------------------------------------------------------

    async def _run_with_fallback(
        self,
        messages: List[Dict[str, Any]],
        temperature: float,
        max_tokens: int,
        stream: bool = False,
    ) -> str:
        """Try each candidate provider in order until one succeeds."""
        candidates = self._resolve_candidates()
        attempts: List[FallbackAttempt] = []

        for i, (provider_id, model) in enumerate(candidates):
            spec = PROVIDER_REGISTRY.get(ProviderID(provider_id))
            if not spec:
                continue

            cooldown = self._cooldowns.get(provider_id)
            if cooldown and cooldown.is_in_cooldown():
                logger.debug(
                    "Skipping %s (cooldown %.0fs)",
                    provider_id, cooldown.remaining_seconds,
                )
                continue

            t0 = time.monotonic()
            try:
                result = await self._call_single_provider(
                    spec, model, messages, temperature, max_tokens,
                )
                elapsed = (time.monotonic() - t0) * 1000
                self.last_provider = provider_id
                self.last_model = model
                self.last_latency_ms = elapsed
                if cooldown:
                    cooldown.mark_success()

                if attempts:
                    logger.info(
                        "Succeeded with %s after %d fallback(s)",
                        provider_id, len(attempts),
                    )
                return result

            except Exception as e:
                elapsed = (time.monotonic() - t0) * 1000
                attempt = FallbackAttempt(
                    provider=provider_id, model=model,
                    error=str(e), latency_ms=elapsed,
                )
                attempts.append(attempt)
                logger.warning(
                    "Provider %s/%s failed (%.0fms): %s",
                    provider_id, model, elapsed, e,
                )
                if cooldown:
                    cooldown.mark_failure()
                if self.on_fallback:
                    await self.on_fallback(attempt)

        raise RuntimeError(
            "All AI providers failed. Please check your API keys in Settings, "
            "or ensure Ollama is running locally for offline mode.\n"
            f"Attempts: {[f'{a.provider}: {a.error}' for a in attempts]}"
        )
