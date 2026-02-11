"""
Nexus LLM Engine - Ollama Integration
Handles all LLM inference through the Ollama API
"""

import aiohttp
import json
from typing import Optional, List, Dict, Any, AsyncGenerator
from dataclasses import dataclass


@dataclass
class GenerationConfig:
    """Configuration for LLM generation"""
    temperature: float = 0.7
    max_tokens: int = 2048
    top_p: float = 0.9
    top_k: int = 40
    repeat_penalty: float = 1.1
    stop: List[str] = None


class LLMEngine:
    """
    LLM Engine powered by Ollama
    
    Supports:
    - Text generation
    - Streaming responses
    - Context injection
    - Multiple models
    """
    
    def __init__(self, model: str = "llama3.2:3b", base_url: str = "http://localhost:11434"):
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.api_url = f"{self.base_url}/api"
    
    async def generate(
        self,
        prompt: str,
        context: List[Dict[str, Any]] = None,
        system_prompt: str = None,
        temperature: float = 0.7,
        max_tokens: int = 2048
    ) -> str:
        """Generate a complete response"""
        
        # Build the messages
        messages = []
        
        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt
            })
        
        # Add context if provided
        if context:
            context_text = self._format_context(context)
            messages.append({
                "role": "system",
                "content": f"Relevant context:\n{context_text}"
            })
        
        messages.append({
            "role": "user",
            "content": prompt
        })
        
        # Make the API request
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.api_url}/chat",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120)
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Ollama API error: {error_text}")
                
                result = await response.json()
                return result.get("message", {}).get("content", "")
    
    async def stream_generate(
        self,
        prompt: str,
        context: List[Dict[str, Any]] = None,
        system_prompt: str = None,
        temperature: float = 0.7
    ) -> AsyncGenerator[str, None]:
        """Stream response tokens for real-time output"""
        
        messages = []
        
        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt
            })
        
        if context:
            context_text = self._format_context(context)
            messages.append({
                "role": "system",
                "content": f"Relevant context:\n{context_text}"
            })
        
        messages.append({
            "role": "user",
            "content": prompt
        })
        
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": temperature
            }
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.api_url}/chat",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=300)
            ) as response:
                async for line in response.content:
                    if line:
                        try:
                            data = json.loads(line.decode())
                            content = data.get("message", {}).get("content", "")
                            if content:
                                yield content
                            
                            if data.get("done", False):
                                break
                        except json.JSONDecodeError:
                            continue
    
    async def embed(self, text: str) -> List[float]:
        """Generate embeddings for text"""
        
        payload = {
            "model": self.model,
            "prompt": text
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.api_url}/embeddings",
                json=payload
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Embedding error: {error_text}")
                
                result = await response.json()
                return result.get("embedding", [])
    
    async def list_models(self) -> List[str]:
        """List available models"""
        
        async with aiohttp.ClientSession() as session:
            # Short timeout for model listing to prevent startup hang
            async with session.get(
                f"{self.api_url}/tags",
                timeout=aiohttp.ClientTimeout(total=5)
            ) as response:
                result = await response.json()
                return [m["name"] for m in result.get("models", [])]
    
    async def check_health(self) -> bool:
        """Check if Ollama is running and accessible"""
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    self.base_url,
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as response:
                    return response.status == 200
        except Exception:
            return False
    
    def _format_context(self, context: List[Dict[str, Any]]) -> str:
        """Format context items for injection into prompt"""
        
        formatted = []
        for i, item in enumerate(context, 1):
            content = item.get("content", str(item))
            source = item.get("source", "unknown")
            score = item.get("score", 0)
            
            formatted.append(f"[{i}] (score: {score:.2f}, source: {source})\n{content}")
        
        return "\n\n".join(formatted)
    
    async def change_model(self, model: str) -> bool:
        """Switch to a different model"""
        
        # Pull the model if needed (non-streaming for auto-switch)
        try:
             async for _ in self.pull_model(model):
                 pass
             self.model = model
             return True
        except Exception:
             return False

    async def pull_model(self, model: str) -> AsyncGenerator[Dict[str, Any], None]:
        """Pull a model from the registry, yielding progress updates"""
        payload = {"name": model, "stream": True}
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.api_url}/pull",
                json=payload
            ) as response:
                if response.status != 200:
                    text = await response.text()
                    raise Exception(f"Failed to pull model: {text}")
                    
                async for line in response.content:
                    if line:
                        try:
                            data = json.loads(line.decode())
                            yield data
                        except json.JSONDecodeError:
                            continue

    async def delete_model(self, model: str) -> bool:
        """Delete a model"""
        payload = {"name": model}
        
        async with aiohttp.ClientSession() as session:
            async with session.delete(
                f"{self.api_url}/delete",
                json=payload
            ) as response:
                if response.status == 200:
                    return True
                if response.status == 404:
                    return True # Already gone
                return False
