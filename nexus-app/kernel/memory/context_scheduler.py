"""
Nexus Context Scheduler - Token Budget Management
Manages the flow of information into the LLM context window

Supports:
- Token budget scheduling
- Multi-model routing based on task type
- Context compression
"""

from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum


class TaskCategory(Enum):
    """Categories for intent routing"""
    RAG_QUERY = "rag_query"      # Knowledge retrieval
    CODE_GEN = "code_gen"        # Code generation/editing
    FILE_OP = "file_op"          # File system operations
    SYSTEM_CMD = "system_cmd"    # System commands
    GENERAL = "general"          # General conversation
    PLANNING = "planning"        # Multi-step planning


@dataclass
class ModelAssignment:
    """Result from model routing"""
    model: str
    category: TaskCategory
    confidence: float
    reason: str


@dataclass
class ContextCapsule:
    """A packaged unit of context optimized for token efficiency"""
    id: str
    content: str
    summary: Optional[str]
    key_facts: List[str]
    token_count: int
    priority: float
    source: str


class ContextScheduler:
    """
    Context Scheduler - Manages LLM context window budget
    
    Responsibilities:
    - Select most relevant context within token budget
    - Balance recency vs relevance
    - Compress context when needed
    - Route intents to appropriate models
    - Prioritize based on task requirements
    """
    
    # Approximate tokens per character (for estimation)
    TOKENS_PER_CHAR = 0.25
    
    # Model assignments per category
    # Format: category -> (model_name, reason)
    MODEL_ASSIGNMENTS: Dict[TaskCategory, Tuple[str, str]] = {
        TaskCategory.RAG_QUERY: ("llama3.2:3b", "Fast model for knowledge retrieval"),
        TaskCategory.CODE_GEN: ("qwen2.5-coder:7b", "Code-optimized for generation"),
        TaskCategory.FILE_OP: ("phi3:mini", "Small model sufficient for file ops"),
        TaskCategory.SYSTEM_CMD: ("phi3:mini", "Fast execution for system commands"),
        TaskCategory.GENERAL: ("llama3.2:3b", "Balanced general-purpose model"),
        TaskCategory.PLANNING: ("llama3.2:latest", "Larger model for complex planning"),
    }
    
    # Keywords for intent classification
    CATEGORY_KEYWORDS: Dict[TaskCategory, List[str]] = {
        TaskCategory.RAG_QUERY: [
            "what is", "explain", "tell me about", "describe", "how does",
            "define", "meaning of", "search", "find information", "look up"
        ],
        TaskCategory.CODE_GEN: [
            "write code", "generate code", "function", "class", "implement",
            "refactor", "debug", "fix bug", "add feature", "code", "script",
            "python", "javascript", "typescript", "rust", "programming"
        ],
        TaskCategory.FILE_OP: [
            "create file", "delete file", "move file", "copy file", "rename",
            "list files", "open file", "save file", "read file", "write file",
            "folder", "directory", "path", "zip", "archive", "compress"
        ],
        TaskCategory.SYSTEM_CMD: [
            "run command", "execute", "terminal", "shell", "bash", "powershell",
            "cmd", "sudo", "install", "update", "restart", "stop", "start service"
        ],
        TaskCategory.PLANNING: [
            "plan", "step by step", "organize", "schedule", "multi-step",
            "workflow", "automate", "routine", "sequence", "batch"
        ],
    }
    
    def __init__(
        self,
        working_limit: int = 10,
        max_context_tokens: int = 4096
    ):
        self.working_limit = working_limit
        self.max_context_tokens = max_context_tokens
    
    def route_intent(self, intent: str) -> ModelAssignment:
        """
        Route an intent to the appropriate model based on task category.
        
        Uses keyword matching to classify the intent, then returns
        the optimal model for that category.
        """
        intent_lower = intent.lower()
        
        # Score each category based on keyword matches
        scores: Dict[TaskCategory, int] = {}
        
        for category, keywords in self.CATEGORY_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in intent_lower)
            if score > 0:
                scores[category] = score
        
        # Select highest scoring category, default to GENERAL
        if scores:
            best_category = max(scores, key=scores.get)
            confidence = min(scores[best_category] / 3.0, 1.0)  # Normalize to 0-1
        else:
            best_category = TaskCategory.GENERAL
            confidence = 0.5
        
        # Get model assignment
        model, reason = self.MODEL_ASSIGNMENTS.get(
            best_category,
            ("llama3.2:3b", "Default fallback model")
        )
        
        return ModelAssignment(
            model=model,
            category=best_category,
            confidence=confidence,
            reason=reason
        )
    
    def schedule(
        self,
        candidates: List[Dict[str, Any]],
        query: str,
        max_tokens: int = None
    ) -> List[Dict[str, Any]]:
        """
        Select and order context items within token budget
        
        Uses a greedy algorithm:
        1. Score each candidate based on relevance and recency
        2. Sort by score
        3. Add items until token budget exhausted
        """
        
        budget = max_tokens or self.max_context_tokens
        
        if not candidates:
            return []
        
        # Score and estimate tokens for each candidate
        scored = []
        for item in candidates:
            content = item.get("content", "")
            token_estimate = int(len(content) * self.TOKENS_PER_CHAR)
            
            # Combined score: relevance (from search) + recency bonus
            relevance_score = item.get("score", 0.5)
            tier = item.get("tier", "long_term")
            recency_bonus = 0.2 if tier == "working" else (0.1 if tier == "short_term" else 0)
            
            combined_score = relevance_score + recency_bonus
            
            scored.append({
                **item,
                "combined_score": combined_score,
                "token_estimate": token_estimate
            })
        
        # Sort by combined score
        scored.sort(key=lambda x: x["combined_score"], reverse=True)
        
        # Greedy selection within budget
        selected = []
        used_tokens = 0
        
        for item in scored:
            item_tokens = item["token_estimate"]
            
            if used_tokens + item_tokens <= budget:
                selected.append(item)
                used_tokens += item_tokens
            elif item_tokens > budget * 0.5:
                # If item is too large, try to compress it
                compressed = self._compress_context(item, budget - used_tokens)
                if compressed:
                    selected.append(compressed)
                    used_tokens += compressed["token_estimate"]
        
        return selected
    
    def _compress_context(
        self,
        item: Dict[str, Any],
        available_tokens: int
    ) -> Optional[Dict[str, Any]]:
        """Compress context to fit within available tokens"""
        
        content = item.get("content", "")
        target_chars = int(available_tokens / self.TOKENS_PER_CHAR)
        
        if target_chars < 50:  # Too little space
            return None
        
        # Simple truncation with ellipsis
        if len(content) > target_chars:
            truncated = content[:target_chars - 3] + "..."
            return {
                **item,
                "content": truncated,
                "token_estimate": int(len(truncated) * self.TOKENS_PER_CHAR),
                "compressed": True
            }
        
        return item
    
    def create_capsule(
        self,
        content: str,
        source: str,
        priority: float = 0.5
    ) -> ContextCapsule:
        """Create a context capsule with multiple representations"""
        
        # Generate summary (in production, use LLM)
        summary = self._create_summary(content)
        
        # Extract key facts (in production, use NER/LLM)
        key_facts = self._extract_key_facts(content)
        
        token_count = int(len(content) * self.TOKENS_PER_CHAR)
        
        return ContextCapsule(
            id=f"cap_{hash(content) % 10000}",
            content=content,
            summary=summary,
            key_facts=key_facts,
            token_count=token_count,
            priority=priority,
            source=source
        )
    
    def _create_summary(self, content: str, max_length: int = 100) -> str:
        """Create a brief summary (simplified)"""
        
        if len(content) <= max_length:
            return content
        
        # Simple extractive summarization: first sentence
        sentences = content.split(". ")
        if sentences:
            return sentences[0][:max_length]
        
        return content[:max_length]
    
    def _extract_key_facts(self, content: str, max_facts: int = 3) -> List[str]:
        """Extract key facts from content (simplified)"""
        
        # In production, use NER or LLM
        sentences = content.split(". ")
        return sentences[:max_facts]
    
    def estimate_tokens(self, text: str) -> int:
        """Estimate token count for text"""
        return int(len(text) * self.TOKENS_PER_CHAR)
    
    def format_for_prompt(
        self,
        items: List[Dict[str, Any]],
        include_sources: bool = True
    ) -> str:
        """Format selected context items for LLM prompt"""
        
        formatted = []
        for i, item in enumerate(items, 1):
            content = item.get("content", "")
            source = item.get("tier", "unknown")
            score = item.get("score", 0)
            
            if include_sources:
                formatted.append(f"[{i}] (source: {source}, relevance: {score:.2f})\n{content}")
            else:
                formatted.append(f"[{i}] {content}")
        
        return "\n\n".join(formatted)
