"""
Nexus Model Router - Multi-Model Intent Routing
Routes user intents to appropriate LLM models for efficiency.

Features:
- Intent classification using small/fast LLM
- Model profiles (routing, execution, embedding)
- Automatic model switching
- Fallback handling
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)


class IntentCategory(Enum):
    """Categories for intent classification."""
    FILE_OPERATION = "file_op"         # File/directory operations
    CODE_GENERATION = "code_gen"       # Writing/modifying code
    CODE_ANALYSIS = "code_analysis"    # Understanding/explaining code
    RAG_QUERY = "rag_query"            # Knowledge retrieval
    SYSTEM_COMMAND = "system_cmd"      # Shell/system operations
    WEB_SEARCH = "web_search"          # Web lookups
    CALCULATION = "calculation"        # Math/logic
    CONVERSATION = "conversation"      # General chat
    TASK_PLANNING = "task_planning"    # Multi-step task decomposition
    UNKNOWN = "unknown"


@dataclass
class ModelProfile:
    """Profile for an LLM model."""
    name: str                          # Model name (e.g., "llama3.2:3b")
    purpose: str                       # What this model is for
    context_window: int = 4096         # Context window size
    speed_rating: int = 5              # 1-10 speed rating
    capability_rating: int = 5         # 1-10 capability rating
    best_for: List[IntentCategory] = field(default_factory=list)


@dataclass
class RoutingDecision:
    """Result of model routing."""
    model: str                         # Selected model name
    intent_category: IntentCategory    # Classified intent
    confidence: float                  # Confidence in classification
    reasoning: str                     # Why this model was selected


class ModelRouter:
    """
    Model Router for Multi-Model LLM Architecture.
    
    Uses a small, fast LLM to classify user intents and route to
    the most appropriate model for execution.
    
    Architecture per LLA spec:
    - Routing Model: Small LLM (phi3:mini, llama3.2:1b) for intent classification
    - Execution Model: Large LLM (llama3.2:3b, llama3:8b) for actual work
    - Embedding Model: Specialized model for vector embeddings
    
    Usage:
        router = ModelRouter(llm_engine)
        decision = await router.route("Write a Python function to sort a list")
        # decision.model = "llama3:8b" (code generation needs capable model)
        # decision.intent_category = IntentCategory.CODE_GENERATION
    """
    
    # Default model profiles
    DEFAULT_PROFILES = {
        "routing": ModelProfile(
            name="llama3.2:1b",
            purpose="Intent classification and routing",
            context_window=4096,
            speed_rating=9,
            capability_rating=4,
            best_for=[IntentCategory.UNKNOWN]
        ),
        "fast": ModelProfile(
            name="llama3.2:3b",
            purpose="Quick responses and simple tasks",
            context_window=4096,
            speed_rating=7,
            capability_rating=6,
            best_for=[
                IntentCategory.CONVERSATION,
                IntentCategory.RAG_QUERY,
                IntentCategory.CALCULATION
            ]
        ),
        "capable": ModelProfile(
            name="llama3:8b",
            purpose="Complex reasoning and code generation",
            context_window=8192,
            speed_rating=4,
            capability_rating=8,
            best_for=[
                IntentCategory.CODE_GENERATION,
                IntentCategory.CODE_ANALYSIS,
                IntentCategory.TASK_PLANNING
            ]
        ),
        "embedding": ModelProfile(
            name="nomic-embed-text",
            purpose="Text embeddings for RAG",
            context_window=8192,
            speed_rating=10,
            capability_rating=0
        )
    }
    
    # Intent classification patterns (fast path - no LLM needed)
    INTENT_PATTERNS = {
        IntentCategory.FILE_OPERATION: [
            r"\b(create|delete|move|copy|rename|zip|unzip|compress|extract)\b.*\b(file|folder|directory)\b",
            r"\b(read|write|save|open)\b.*\b(file|document)\b",
            r"\blist\s+(files|directories|folders)\b",
        ],
        IntentCategory.CODE_GENERATION: [
            r"\b(write|create|generate|implement|code|build)\b.*\b(function|class|script|program|code)\b",
            r"\b(add|implement)\b.*\b(feature|method|endpoint)\b",
        ],
        IntentCategory.CODE_ANALYSIS: [
            r"\b(explain|analyze|review|understand|debug)\b.*\b(code|function|class|error)\b",
            r"\bwhat\s+does\b.*\b(code|function|do)\b",
        ],
        IntentCategory.SYSTEM_COMMAND: [
            r"\b(run|execute|install|uninstall)\b",
            r"\b(start|stop|restart)\b.*\b(service|process|server)\b",
            r"\bgit\s+\w+",
            r"\bnpm\s+\w+",
            r"\bpip\s+\w+",
        ],
        IntentCategory.WEB_SEARCH: [
            r"\b(search|find|look\s+up|google)\b.*\b(web|internet|online)\b",
            r"\bwhat\s+is\b",
            r"\bwho\s+is\b",
        ],
        IntentCategory.CALCULATION: [
            r"\b(calculate|compute|solve|convert)\b",
            r"\bhow\s+much\b",
            r"\d+\s*[\+\-\*\/\^]\s*\d+",
        ],
    }
    
    def __init__(
        self,
        llm_engine=None,
        profiles: Optional[Dict[str, ModelProfile]] = None,
        enable_llm_routing: bool = True,
        default_model: str = "llama3.2:3b"
    ):
        self.llm = llm_engine
        self.profiles = profiles or self.DEFAULT_PROFILES.copy()
        self.enable_llm_routing = enable_llm_routing
        self.default_model = default_model
        self._available_models: List[str] = []
        self._routing_lock = asyncio.Lock()  # Protects model switching during classification
        
    async def initialize(self):
        """Initialize router and detect available models."""
        if self.llm:
            try:
                self._available_models = await self.llm.list_models()
                logger.info(f"Available models: {self._available_models}")
            except Exception as e:
                logger.warning(f"Could not list models: {e}")
    
    def set_profile(self, profile_type: str, profile: ModelProfile):
        """Set or update a model profile."""
        self.profiles[profile_type] = profile
    
    async def route(self, intent: str, context: Optional[Dict[str, Any]] = None) -> RoutingDecision:
        """
        Route an intent to the best model.
        
        Args:
            intent: User's intent/query
            context: Optional context (e.g., current file type, task history)
            
        Returns:
            RoutingDecision with model selection and reasoning
        """
        # First, try fast pattern matching
        category, confidence = self._pattern_classify(intent)
        
        if confidence >= 0.8:
            # High confidence from patterns, skip LLM routing
            model = self._select_model_for_category(category)
            return RoutingDecision(
                model=model,
                intent_category=category,
                confidence=confidence,
                reasoning=f"Pattern match: {category.value}"
            )
        
        # Use LLM routing if enabled and available (serialized via lock)
        if self.enable_llm_routing and self.llm:
            async with self._routing_lock:
                try:
                    llm_category, llm_confidence = await self._llm_classify(intent)
                    if llm_confidence > confidence:
                        category = llm_category
                        confidence = llm_confidence
                except Exception as e:
                    logger.debug(f"LLM routing failed, using pattern result: {e}")
        
        # Select appropriate model
        model = self._select_model_for_category(category)
        
        # Apply context-based adjustments
        if context:
            model = self._adjust_for_context(model, category, context)
        
        return RoutingDecision(
            model=model,
            intent_category=category,
            confidence=confidence,
            reasoning=f"Category: {category.value}, selected for capability"
        )
    
    def _pattern_classify(self, intent: str) -> Tuple[IntentCategory, float]:
        """Classify intent using regex patterns (fast path)."""
        intent_lower = intent.lower()
        
        for category, patterns in self.INTENT_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, intent_lower, re.IGNORECASE):
                    return category, 0.85
        
        # Default to conversation/general
        return IntentCategory.CONVERSATION, 0.5
    
    async def _llm_classify(self, intent: str) -> Tuple[IntentCategory, float]:
        """Classify intent using routing LLM.
        
        Note: Caller MUST hold self._routing_lock before calling this method
        to prevent concurrent model switching.
        """
        routing_model = self.profiles.get("routing")
        if not routing_model:
            return IntentCategory.UNKNOWN, 0.0
        
        # Switch to routing model temporarily
        original_model = self.llm.model
        try:
            self.llm.model = routing_model.name
            
            prompt = f"""Classify this user intent into exactly ONE category:
- file_op: File/folder operations (create, delete, move, etc.)
- code_gen: Writing or generating code
- code_analysis: Explaining or reviewing code
- rag_query: Looking up information from documents
- system_cmd: Running system commands or installations
- web_search: Searching the internet
- calculation: Math or conversions
- conversation: General chat or questions
- task_planning: Complex multi-step tasks

User intent: "{intent}"

Reply with ONLY the category name, nothing else."""

            response = await self.llm.generate(
                prompt=prompt,
                temperature=0.1,
                max_tokens=20
            )
            
            # Parse response
            response_clean = response.strip().lower().replace("_", "")
            
            category_map = {
                "fileop": IntentCategory.FILE_OPERATION,
                "codegen": IntentCategory.CODE_GENERATION,
                "codeanalysis": IntentCategory.CODE_ANALYSIS,
                "ragquery": IntentCategory.RAG_QUERY,
                "systemcmd": IntentCategory.SYSTEM_COMMAND,
                "websearch": IntentCategory.WEB_SEARCH,
                "calculation": IntentCategory.CALCULATION,
                "conversation": IntentCategory.CONVERSATION,
                "taskplanning": IntentCategory.TASK_PLANNING,
            }
            
            for key, cat in category_map.items():
                if key in response_clean:
                    return cat, 0.9
            
            return IntentCategory.CONVERSATION, 0.6
            
        finally:
            # Restore original model
            self.llm.model = original_model
    
    def _select_model_for_category(self, category: IntentCategory) -> str:
        """Select the best model for an intent category."""
        # Find profiles that list this category as best_for
        for profile_name, profile in self.profiles.items():
            if category in profile.best_for:
                # Check if model is available
                if not self._available_models or profile.name in self._available_models:
                    return profile.name
        
        # Fallback logic based on category complexity
        if category in [IntentCategory.CODE_GENERATION, IntentCategory.TASK_PLANNING]:
            # Need capable model
            capable = self.profiles.get("capable")
            if capable and (not self._available_models or capable.name in self._available_models):
                return capable.name
        
        # Default to fast model for everything else
        fast = self.profiles.get("fast")
        if fast and (not self._available_models or fast.name in self._available_models):
            return fast.name
        
        return self.default_model
    
    def _adjust_for_context(
        self,
        model: str,
        category: IntentCategory,
        context: Dict[str, Any]
    ) -> str:
        """Adjust model selection based on context."""
        
        # If working with a large codebase, prefer larger context window
        if context.get("file_count", 0) > 10:
            capable = self.profiles.get("capable")
            if capable and capable.context_window >= 8192:
                return capable.name
        
        # If user prefers speed
        if context.get("prefer_speed", False):
            fast = self.profiles.get("fast")
            if fast:
                return fast.name
        
        # If user prefers quality
        if context.get("prefer_quality", False):
            capable = self.profiles.get("capable")
            if capable:
                return capable.name
        
        return model
    
    def get_model_for_purpose(self, purpose: str) -> str:
        """Get model for a specific purpose (routing, fast, capable, embedding)."""
        profile = self.profiles.get(purpose)
        if profile:
            return profile.name
        return self.default_model
    
    def get_routing_stats(self) -> Dict[str, Any]:
        """Get routing configuration and statistics."""
        return {
            "profiles": {
                name: {
                    "model": p.name,
                    "purpose": p.purpose,
                    "speed": p.speed_rating,
                    "capability": p.capability_rating 
                }
                for name, p in self.profiles.items()
            },
            "available_models": self._available_models,
            "llm_routing_enabled": self.enable_llm_routing,
            "default_model": self.default_model
        }


# Convenience function for quick classification
async def classify_intent(intent: str, llm=None) -> IntentCategory:
    """Quick intent classification without full routing."""
    router = ModelRouter(llm_engine=llm, enable_llm_routing=False)
    decision = await router.route(intent)
    return decision.intent_category
