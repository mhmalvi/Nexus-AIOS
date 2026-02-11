# Nexus Brain Module - LLM Reasoning Engine

from .llm_engine import LLMEngine
from .planner import Planner
from .intent_parser import IntentParser
from .model_router import ModelRouter, IntentCategory, RoutingDecision, ModelProfile

class Brain:
    """
    The Brain - Core reasoning component powered by local LLMs
    
    Handles:
    - Natural language understanding
    - Response generation
    - Task planning
    - Intent classification
    """
    
    def __init__(self, model: str = "llama3.2:3b", base_url: str = "http://localhost:11434"):
        self.model = model
        self.base_url = base_url
        
        self.llm = LLMEngine(model=model, base_url=base_url)
        self.router = ModelRouter(llm_engine=self.llm)
        self.planner = Planner(llm=self.llm)
        self.intent_parser = IntentParser(llm=self.llm)

    async def initialize(self):
        """Initialize brain components"""
        await self.router.initialize()
    
    async def generate(
        self,
        prompt: str,
        context: list = None,
        system_prompt: str = None,
        temperature: float = 0.7,
        max_tokens: int = 2048
    ) -> str:
        """Generate a response using the LLM"""
        return await self.llm.generate(
            prompt=prompt,
            context=context or [],
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens
        )
    
    async def plan(self, task_description: str, available_tools: list) -> list:
        """Generate a multi-step plan for a task"""
        return await self.planner.create_plan(
            task=task_description,
            tools=available_tools
        )
    
    async def parse_intent(self, user_input: str) -> dict:
        """Parse user intent from natural language"""
        return await self.intent_parser.parse(user_input)
    
    async def stream_generate(
        self,
        prompt: str,
        context: list = None,
        system_prompt: str = None
    ):
        """Stream response tokens"""
        async for chunk in self.llm.stream_generate(
            prompt=prompt,
            context=context or [],
            system_prompt=system_prompt
        ):
            yield chunk

    async def pull_model(self, model: str):
        """Pull a model"""
        async for progress in self.llm.pull_model(model):
            yield progress

    async def delete_model(self, model: str) -> bool:
        """Delete a model"""
        return await self.llm.delete_model(model)


__all__ = ["Brain", "LLMEngine", "Planner", "IntentParser", "ModelRouter", "IntentCategory", "RoutingDecision", "ModelProfile"]

