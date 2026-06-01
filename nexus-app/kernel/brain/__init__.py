# AETHER Brain Module — AI Reasoning Engine with Multi-Provider Fallback

from .llm_engine import LLMEngine
from .cloud_engine import CloudLLMEngine, ProviderID, FallbackAttempt
from .compaction import CompactionEngine, CompactionResult
from .planner import Planner
from .intent_parser import IntentParser
from .model_router import ModelRouter, IntentCategory, RoutingDecision, ModelProfile
from .intent_dispatcher import IntentDispatcher, DispatchResult


class Brain:
    """
    The AETHER Brain — Core reasoning component.

    Supports:
    - Multi-provider AI (Groq/Cerebras/Mistral/Gemini/OpenRouter + Ollama local)
    - Automatic model fallback with cooldowns
    - Context window guard + adaptive compaction
    - Task planning and intent classification
    - Streaming responses

    Ollama is the DEFAULT backend for privacy.
    Cloud providers are recommended for power users.
    """

    def __init__(self, config=None):
        """
        Args:
            config: RuntimeConfig instance. If None, uses Ollama defaults.
        """
        self._config = config
        self.llm = LLMEngine(config=config)
        self.router = ModelRouter(llm_engine=self.llm)
        self.planner = Planner(llm=self.llm)
        self.intent_parser = IntentParser(llm=self.llm)

    async def initialize(self):
        """Initialize brain components."""
        await self.llm.initialize()
        await self.router.initialize()

    async def reload_config(self):
        """Reload after config changes (e.g., user adds an API key)."""
        await self.llm.reload_config()

    async def generate(
        self,
        prompt: str,
        context: list = None,
        system_prompt: str = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        messages: list = None,
    ) -> str:
        """Generate a response using the best available AI provider."""
        return await self.llm.generate(
            prompt=prompt,
            context=context or [],
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            messages=messages,
        )

    async def plan(self, task_description: str, available_tools: list) -> list:
        """Generate a multi-step plan for a task."""
        return await self.planner.create_plan(
            task=task_description,
            tools=available_tools,
        )

    async def parse_intent(self, user_input: str) -> dict:
        """Parse user intent from natural language."""
        return await self.intent_parser.parse(user_input)

    async def stream_generate(
        self,
        prompt: str,
        context: list = None,
        system_prompt: str = None,
        messages: list = None,
    ):
        """Stream response tokens."""
        async for chunk in self.llm.stream_generate(
            prompt=prompt,
            context=context or [],
            system_prompt=system_prompt,
            messages=messages,
        ):
            yield chunk

    async def check_health(self) -> dict:
        """Check which AI providers are available."""
        return await self.llm.check_health()

    def get_active_provider(self) -> dict:
        """Get info about the currently active provider."""
        return self.llm.get_active_provider()

    @property
    def model(self) -> str:
        """Get the currently active model name."""
        info = self.llm.get_active_provider()
        return info.get("model", "unknown")

    async def change_model(self, model: str) -> bool:
        """Change the active model (Ollama backward compat)."""
        return await self.llm.change_model(model)

    # -- Backward compat for Ollama-specific features --

    async def pull_model(self, model: str):
        """Pull an Ollama model."""
        import aiohttp, json
        host = "http://localhost:11434"
        if self._config:
            host = self._config.get("ollama_host", host)
        payload = {"name": model, "stream": True}
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{host}/api/pull", json=payload) as resp:
                if resp.status != 200:
                    raise Exception(f"Failed to pull model: {await resp.text()}")
                async for line in resp.content:
                    if line:
                        try:
                            yield json.loads(line.decode())
                        except json.JSONDecodeError:
                            continue

    async def delete_model(self, model: str) -> bool:
        """Delete an Ollama model."""
        import aiohttp
        host = "http://localhost:11434"
        if self._config:
            host = self._config.get("ollama_host", host)
        async with aiohttp.ClientSession() as session:
            async with session.delete(
                f"{host}/api/delete", json={"name": model}
            ) as resp:
                return resp.status in (200, 404)

    async def list_models(self) -> list:
        """List available models (delegates to LLM engine)."""
        return await self.llm.list_models()


__all__ = [
    "Brain",
    "LLMEngine",
    "CloudLLMEngine",
    "CompactionEngine",
    "CompactionResult",
    "ProviderID",
    "FallbackAttempt",
    "Planner",
    "IntentParser",
    "ModelRouter",
    "IntentCategory",
    "RoutingDecision",
    "ModelProfile",
    "IntentDispatcher",
    "DispatchResult",
]
