"""
AETHER Intent Dispatcher — Voice/Text Intent Classification & Routing

Classifies natural language input into actionable intents and routes
them to the appropriate handler (CLI command, agent task, tool call, etc.).

Features:
- Pattern-based intent classification with confidence scoring
- Priority routing with fallback chains
- Slot extraction (entities, parameters)
- Conversation context awareness
- Custom intent registration
"""

import logging
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List, Dict, Any, Callable, Awaitable, Tuple

logger = logging.getLogger("aether.intent")


class IntentCategory(str, Enum):
    COMMAND = "command"          # /slash commands
    QUESTION = "question"       # general Q&A
    TASK = "task"               # "do X for me"
    NAVIGATION = "navigation"   # "open settings", "go to..."
    SYSTEM = "system"           # "what's my CPU usage"
    MEMORY = "memory"           # "remember X", "what did I say about..."
    AGENT = "agent"             # "spawn agent", "check agent status"
    FILE = "file"               # "open file", "create file"
    VOICE = "voice"             # "speak louder", "stop listening"
    SEARCH = "search"           # "search for...", "find..."
    CONVERSATION = "conversation"  # chitchat, greeting
    UNKNOWN = "unknown"


@dataclass
class Intent:
    """A classified intent with extracted slots."""
    category: IntentCategory
    action: str           # e.g., "open_file", "spawn_agent"
    confidence: float     # 0.0 - 1.0
    slots: Dict[str, Any] = field(default_factory=dict)  # extracted entities
    raw_text: str = ""
    source: str = "text"  # "text" or "voice"

    @property
    def is_confident(self) -> bool:
        return self.confidence >= 0.6


@dataclass
class IntentResult:
    """Result of dispatching an intent."""
    intent: Intent
    handled: bool = False
    response: str = ""
    handler_name: str = ""
    duration_ms: float = 0.0
    error: Optional[str] = None


@dataclass
class IntentPattern:
    """A pattern for matching intents."""
    category: IntentCategory
    action: str
    patterns: List[str]  # regex patterns
    slot_extractors: Dict[str, str] = field(default_factory=dict)  # slot_name -> regex
    priority: int = 0
    compiled: List[Any] = field(default_factory=list, repr=False)

    def __post_init__(self):
        self.compiled = [re.compile(p, re.IGNORECASE) for p in self.patterns]


class IntentDispatcher:
    """
    Classifies text/voice input into intents and routes to handlers.

    Usage:
        dispatcher = IntentDispatcher()
        dispatcher.register_handler("open_file", my_file_handler)
        result = await dispatcher.dispatch("open the readme file")
    """

    def __init__(self):
        self._patterns: List[IntentPattern] = []
        self._handlers: Dict[str, Callable[[Intent], Awaitable[IntentResult]]] = {}
        self._fallback: Optional[Callable[[Intent], Awaitable[IntentResult]]] = None
        self._history: List[IntentResult] = []
        self._register_defaults()

    def register_pattern(self, pattern: IntentPattern) -> None:
        self._patterns.append(pattern)
        self._patterns.sort(key=lambda p: p.priority, reverse=True)

    def register_handler(self, action: str,
                         handler: Callable[[Intent], Awaitable[IntentResult]]) -> None:
        self._handlers[action] = handler

    def set_fallback(self, handler: Callable[[Intent], Awaitable[IntentResult]]) -> None:
        self._fallback = handler

    def classify(self, text: str, source: str = "text") -> Intent:
        """Classify text into an intent."""
        text_clean = text.strip()

        # Direct slash command
        if text_clean.startswith("/"):
            parts = text_clean.split(None, 1)
            return Intent(
                category=IntentCategory.COMMAND,
                action=parts[0].lstrip("/"),
                confidence=1.0,
                slots={"args": parts[1] if len(parts) > 1 else ""},
                raw_text=text_clean,
                source=source,
            )

        # Pattern matching
        best_match: Optional[Tuple[IntentPattern, float, Dict]] = None
        best_score = 0.0

        for pattern in self._patterns:
            for compiled in pattern.compiled:
                match = compiled.search(text_clean)
                if match:
                    score = len(match.group(0)) / max(len(text_clean), 1)
                    score = min(score + 0.3, 1.0)  # boost for any match

                    if score > best_score:
                        # Extract slots
                        slots = {}
                        for slot_name, slot_regex in pattern.slot_extractors.items():
                            slot_match = re.search(slot_regex, text_clean, re.I)
                            if slot_match:
                                slots[slot_name] = slot_match.group(1)
                        best_match = (pattern, score, slots)
                        best_score = score

        if best_match:
            pat, score, slots = best_match
            return Intent(
                category=pat.category, action=pat.action,
                confidence=score, slots=slots,
                raw_text=text_clean, source=source,
            )

        # Fallback: conversation/unknown
        if self._is_greeting(text_clean):
            return Intent(category=IntentCategory.CONVERSATION, action="greeting",
                          confidence=0.8, raw_text=text_clean, source=source)
        if text_clean.endswith("?"):
            return Intent(category=IntentCategory.QUESTION, action="ask",
                          confidence=0.5, raw_text=text_clean, source=source)

        return Intent(category=IntentCategory.UNKNOWN, action="unknown",
                      confidence=0.1, raw_text=text_clean, source=source)

    async def dispatch(self, text: str, source: str = "text") -> IntentResult:
        """Classify and dispatch an intent to its handler."""
        intent = self.classify(text, source)
        t0 = time.time()

        handler = self._handlers.get(intent.action)
        if handler:
            try:
                result = await handler(intent)
                result.duration_ms = (time.time() - t0) * 1000
                result.handler_name = intent.action
                self._history.append(result)
                return result
            except Exception as e:
                logger.error("Handler '%s' failed: %s", intent.action, e)
                result = IntentResult(intent=intent, error=str(e))
                self._history.append(result)
                return result

        # Try fallback handler for AI/LLM routing
        if self._fallback:
            try:
                result = await self._fallback(intent)
                result.duration_ms = (time.time() - t0) * 1000
                result.handler_name = "fallback"
                self._history.append(result)
                return result
            except Exception as e:
                return IntentResult(intent=intent, error=str(e))

        return IntentResult(
            intent=intent, handled=False,
            response=f"No handler for intent: {intent.action}",
            duration_ms=(time.time() - t0) * 1000,
        )

    def get_history(self, limit: int = 20) -> List[IntentResult]:
        return self._history[-limit:]

    def _is_greeting(self, text: str) -> bool:
        greetings = ["hello", "hi", "hey", "yo", "sup", "greetings",
                     "good morning", "good afternoon", "good evening", "howdy"]
        return text.lower().strip().rstrip("!.,") in greetings

    def _register_defaults(self) -> None:
        """Register built-in intent patterns."""
        defaults = [
            # ── File operations ──
            IntentPattern(IntentCategory.FILE, "open_file",
                          [r"\b(?:open|show|display|read)\b.*\b(?:file|document)\b"],
                          {"filename": r"(?:file|document)\s+['\"]?(\S+)['\"]?"},
                          priority=5),
            IntentPattern(IntentCategory.FILE, "create_file",
                          [r"\b(?:create|make|new)\b.*\b(?:file|document)\b"],
                          {"filename": r"(?:file|document)\s+(?:called\s+)?['\"]?(\S+)['\"]?"},
                          priority=5),
            IntentPattern(IntentCategory.FILE, "edit_file",
                          [r"\b(?:edit|modify|change|update)\b.*\b(?:file|document)\b"],
                          {"filename": r"(?:file|document)\s+['\"]?(\S+)['\"]?"},
                          priority=5),

            # ── Agent operations ──
            IntentPattern(IntentCategory.AGENT, "spawn_agent",
                          [r"\b(?:spawn|create|start|launch)\b.*\b(?:agent|worker)\b",
                           r"\brun\s+(?:a\s+)?(?:agent|worker)\b"],
                          {"agent_type": r"(?:agent|worker)\s+(?:called\s+)?['\"]?(\S+)['\"]?"},
                          priority=6),
            IntentPattern(IntentCategory.AGENT, "list_agents",
                          [r"\b(?:list|show|display)\b.*\b(?:agents?|workers?)\b",
                           r"\bwhat agents?\b"],
                          priority=5),
            IntentPattern(IntentCategory.AGENT, "stop_agent",
                          [r"\b(?:stop|kill|terminate)\b.*\b(?:agent|worker)\b"],
                          {"agent_name": r"(?:agent|worker)\s+['\"]?(\S+)['\"]?"},
                          priority=6),

            # ── Memory operations ──
            IntentPattern(IntentCategory.MEMORY, "remember",
                          [r"\b(?:remember|store|save|memorize)\b",
                           r"\bdon'?t\s+forget\b"],
                          {"content": r"(?:remember|store|save|memorize)\s+(?:that\s+)?(.+)"},
                          priority=5),
            IntentPattern(IntentCategory.MEMORY, "recall",
                          [r"\b(?:recall|what\s+(?:do\s+)?(?:you|i)\s+know|what\s+did\s+(?:i|we)\s+say)\b",
                           r"\b(?:search|find)\s+(?:in\s+)?memory\b"],
                          {"query": r"(?:about|regarding|for)\s+(.+)"},
                          priority=5),

            # ── Navigation ──
            IntentPattern(IntentCategory.NAVIGATION, "open_app",
                          [r"\b(?:open|launch|start|go\s+to)\b.*\b(?:settings?|terminal|browser|editor|chat)\b"],
                          {"app": r"(?:open|launch|start|go\s+to)\s+(?:the\s+)?(\w+)"},
                          priority=4),

            # ── System ──
            IntentPattern(IntentCategory.SYSTEM, "system_status",
                          [r"\b(?:system|cpu|ram|memory|disk)\s+(?:status|usage|info)\b",
                           r"\bhow\s+(?:is|are)\s+(?:the\s+)?(?:system|resources)\b"],
                          priority=4),
            IntentPattern(IntentCategory.SYSTEM, "run_command",
                          [r"\b(?:run|execute)\s+(?:command|shell)\b"],
                          {"command": r"(?:run|execute)\s+(?:command\s+)?['\"]?(.+?)['\"]?\s*$"},
                          priority=5),

            # ── Search ──
            IntentPattern(IntentCategory.SEARCH, "web_search",
                          [r"\b(?:search|google|look\s+up|find)\b.*\b(?:for|about|on|web|online)\b"],
                          {"query": r"(?:search|google|look\s+up|find)\s+(?:for\s+|about\s+|on\s+)?(.+)"},
                          priority=4),
            IntentPattern(IntentCategory.SEARCH, "file_search",
                          [r"\b(?:find|search|locate)\b.*\bfile\b"],
                          {"query": r"(?:find|search|locate)\s+(?:the\s+)?(?:file\s+)?(.+)"},
                          priority=5),

            # ── Voice ──
            IntentPattern(IntentCategory.VOICE, "voice_on",
                          [r"\b(?:start|enable|turn\s+on)\s+(?:voice|listening)\b"],
                          priority=7),
            IntentPattern(IntentCategory.VOICE, "voice_off",
                          [r"\b(?:stop|disable|turn\s+off|mute)\s+(?:voice|listening)\b"],
                          priority=7),
            IntentPattern(IntentCategory.VOICE, "speak",
                          [r"\b(?:say|speak|read\s+aloud|read\s+out)\b"],
                          {"text": r"(?:say|speak)\s+(.+)"},
                          priority=6),

            # ── Task delegation ──
            IntentPattern(IntentCategory.TASK, "do_task",
                          [r"\b(?:please|can\s+you|could\s+you|would\s+you)\b.*\b(?:do|make|create|build|write|generate)\b"],
                          priority=2),
        ]

        for pat in defaults:
            self.register_pattern(pat)
