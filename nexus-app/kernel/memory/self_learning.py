"""
Nexus Self-Learning System
Learns from approved actions, corrections, and user preferences to improve over time.

Features:
- Pattern extraction from approved actions
- Learning from error corrections
- User preference storage
- Similar action suggestions
- Command shortcut detection
"""

import asyncio
import json
import logging
import uuid
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from collections import Counter

logger = logging.getLogger(__name__)


class PatternType(Enum):
    """Types of learned patterns."""
    COMMAND_PATTERN = "command_pattern"      # Recurring command structures
    PREFERENCE = "preference"                 # User preferences
    CORRECTION = "correction"                 # Error corrections
    SHORTCUT = "shortcut"                     # Frequently used sequences
    INTENT_MAPPING = "intent_mapping"         # Intent to action mappings


@dataclass
class LearningEntry:
    """A single learned pattern or preference."""
    id: str
    pattern_type: PatternType
    pattern: str                              # The pattern template or key
    value: Any                                # The learned value/action
    confidence: float = 0.5                   # Confidence in this learning
    frequency: int = 1                        # How often this was observed
    last_used: datetime = field(default_factory=datetime.utcnow)
    created_at: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "pattern_type": self.pattern_type.value,
            "pattern": self.pattern,
            "value": self.value,
            "confidence": self.confidence,
            "frequency": self.frequency,
            "last_used": self.last_used.isoformat(),
            "created_at": self.created_at.isoformat(),
            "metadata": self.metadata
        }


@dataclass
class ActionRecord:
    """Record of an approved action for learning."""
    action_id: str
    intent: str                               # Original user intent
    tool: str                                 # Tool used
    args: Dict[str, Any]                      # Tool arguments
    result: str                               # Action result
    approved: bool = True                     # Was it approved
    timestamp: datetime = field(default_factory=datetime.utcnow)
    correction: Optional[str] = None         # Any correction applied
    user_feedback: Optional[str] = None      # User feedback if any


class SelfLearningEngine:
    """
    Self-Learning Engine - Learns from user interactions to improve over time.
    
    Learning Sources:
    1. Approved Actions - Extract patterns from HIL-approved actions
    2. Corrections - Learn from error corrections and retries
    3. Preferences - Store explicit user preferences
    4. Shortcuts - Detect frequently used command sequences
    
    Usage:
        engine = SelfLearningEngine(memory_store)
        
        # Learn from an approved action
        await engine.learn_from_approval(action_record)
        
        # Get suggestions for a new intent
        suggestions = await engine.suggest_action(intent)
        
        # Store explicit preference
        await engine.learn_user_preference("editor", "vscode")
    """
    
    # Table names in LanceDB
    TABLE_PATTERNS = "learning_patterns"
    TABLE_ACTIONS = "learning_actions"
    TABLE_PREFERENCES = "learning_preferences"
    
    # Minimum observations before high confidence
    MIN_FREQUENCY_HIGH_CONFIDENCE = 5
    
    # Confidence thresholds
    CONFIDENCE_HIGH = 0.8
    CONFIDENCE_MEDIUM = 0.5
    CONFIDENCE_LOW = 0.3
    
    def __init__(
        self,
        store=None,
        enable_pattern_learning: bool = True,
        enable_preference_learning: bool = True,
        max_entries: int = 10000
    ):
        self.store = store
        self.enable_pattern_learning = enable_pattern_learning
        self.enable_preference_learning = enable_preference_learning
        self.max_entries = max_entries
        
        # In-memory caches
        self._patterns: Dict[str, LearningEntry] = {}
        self._action_history: List[ActionRecord] = []
        self._preferences: Dict[str, Any] = {}
        self._command_counter: Counter = Counter()
        
        # Pattern templates for extraction
        self._command_templates = [
            # File operations
            (r"(zip|compress|archive)\s+(.+)\s+(to|into)\s+(.+)", "file_archive"),
            (r"(delete|remove)\s+(.+)", "file_delete"),
            (r"(copy|move)\s+(.+)\s+(to|into)\s+(.+)", "file_copy_move"),
            (r"(find|search)\s+(.+)\s+(in|under)\s+(.+)", "file_search"),
            # System operations
            (r"(run|execute)\s+(.+)", "system_run"),
            (r"(install|uninstall)\s+(.+)", "system_package"),
            # Code operations
            (r"(analyze|review)\s+(.+)", "code_analyze"),
            (r"(summarize|explain)\s+(.+)", "text_summarize"),
        ]
    
    async def initialize(self):
        """Initialize the learning engine, loading existing patterns."""
        if self.store:
            await self._load_patterns()
            await self._load_preferences()
        logger.info("Self-learning engine initialized")
    
    async def _load_patterns(self):
        """Load existing patterns from storage."""
        try:
            results = await self.store.search(
                query="*",
                table_name=self.TABLE_PATTERNS,
                limit=self.max_entries,
                use_hybrid=False
            )
            
            for r in results:
                metadata = r.get("metadata", {})
                entry = LearningEntry(
                    id=r.get("id", str(uuid.uuid4())),
                    pattern_type=PatternType(metadata.get("pattern_type", "command_pattern")),
                    pattern=metadata.get("pattern", ""),
                    value=metadata.get("value"),
                    confidence=metadata.get("confidence", 0.5),
                    frequency=metadata.get("frequency", 1),
                    metadata=metadata
                )
                self._patterns[entry.pattern] = entry
                
        except Exception as e:
            logger.debug(f"Could not load patterns: {e}")
    
    async def _load_preferences(self):
        """Load existing preferences from storage."""
        try:
            results = await self.store.search(
                query="*",
                table_name=self.TABLE_PREFERENCES,
                limit=1000,
                use_hybrid=False
            )
            
            for r in results:
                key = r.get("metadata", {}).get("key", "")
                value = r.get("metadata", {}).get("value")
                if key:
                    self._preferences[key] = value
                    
        except Exception as e:
            logger.debug(f"Could not load preferences: {e}")
    
    async def learn_from_approval(self, record: ActionRecord) -> Optional[LearningEntry]:
        """
        Learn from an approved action.
        
        Extracts patterns from the intent-to-action mapping and stores
        for future suggestions.
        
        Args:
            record: The approved action record
            
        Returns:
            LearningEntry if a pattern was learned
        """
        if not self.enable_pattern_learning:
            return None
        
        # Store the action record
        self._action_history.append(record)
        
        # Trim history if too large
        if len(self._action_history) > self.max_entries:
            self._action_history = self._action_history[-self.max_entries:]
        
        # Count the command for shortcut detection
        command_key = f"{record.tool}:{json.dumps(record.args, sort_keys=True)}"
        self._command_counter[command_key] += 1
        
        # Extract pattern from intent
        pattern_key = self._extract_pattern(record.intent)
        
        if pattern_key:
            # Update or create pattern entry
            if pattern_key in self._patterns:
                entry = self._patterns[pattern_key]
                entry.frequency += 1
                entry.last_used = datetime.utcnow()
                # Increase confidence with frequency
                entry.confidence = min(
                    self.CONFIDENCE_HIGH,
                    entry.confidence + 0.1
                )
            else:
                entry = LearningEntry(
                    id=str(uuid.uuid4()),
                    pattern_type=PatternType.COMMAND_PATTERN,
                    pattern=pattern_key,
                    value={
                        "tool": record.tool,
                        "args_template": record.args,
                        "example_intent": record.intent
                    },
                    confidence=self.CONFIDENCE_LOW,
                    metadata={"source": "approval"}
                )
                self._patterns[pattern_key] = entry
            
            # Persist to storage
            await self._save_pattern(entry)
            
            logger.debug(f"Learned pattern: {pattern_key} -> {record.tool}")
            return entry
        
        return None
    
    async def learn_from_correction(
        self,
        original_action: str,
        correction: str,
        error: str
    ) -> Optional[LearningEntry]:
        """
        Learn from an error correction.
        
        Stores the mapping from error -> correction for future use.
        
        Args:
            original_action: The action that failed
            correction: The correction that was applied
            error: The error message
            
        Returns:
            LearningEntry for the correction pattern
        """
        if not self.enable_pattern_learning:
            return None
        
        # Create a normalized error key
        error_key = self._normalize_error(error)
        pattern_key = f"correction:{error_key}"
        
        entry = LearningEntry(
            id=str(uuid.uuid4()),
            pattern_type=PatternType.CORRECTION,
            pattern=pattern_key,
            value={
                "original": original_action,
                "correction": correction,
                "error": error
            },
            confidence=self.CONFIDENCE_MEDIUM,
            metadata={"source": "self_correction"}
        )
        
        self._patterns[pattern_key] = entry
        await self._save_pattern(entry)
        
        logger.info(f"Learned correction for error: {error_key[:50]}...")
        return entry
    
    async def learn_user_preference(
        self,
        key: str,
        value: Any,
        source: str = "explicit"
    ) -> bool:
        """
        Store a user preference.
        
        Args:
            key: Preference key (e.g., "editor", "theme", "default_shell")
            value: Preference value
            source: How this was learned ("explicit", "inferred")
            
        Returns:
            True if stored successfully
        """
        if not self.enable_preference_learning:
            return False
        
        self._preferences[key] = value
        
        # Persist to storage
        if self.store:
            try:
                await self.store.add(
                    content=f"preference:{key}={value}",
                    metadata={
                        "key": key,
                        "value": value,
                        "source": source,
                        "timestamp": datetime.utcnow().isoformat()
                    },
                    table_name=self.TABLE_PREFERENCES
                )
            except Exception as e:
                logger.error(f"Failed to store preference: {e}")
                return False
        
        logger.info(f"Stored preference: {key} = {value}")
        return True
    
    async def get_user_preference(self, key: str, default: Any = None) -> Any:
        """Get a user preference."""
        return self._preferences.get(key, default)
    
    async def suggest_action(
        self,
        intent: str,
        limit: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Suggest actions based on learned patterns.
        
        Args:
            intent: The user's intent
            limit: Maximum suggestions to return
            
        Returns:
            List of suggested actions with confidence scores
        """
        suggestions = []
        
        # Extract pattern from intent
        pattern_key = self._extract_pattern(intent)
        
        # Check for exact pattern match
        if pattern_key and pattern_key in self._patterns:
            entry = self._patterns[pattern_key]
            suggestions.append({
                "source": "pattern_match",
                "pattern": pattern_key,
                "action": entry.value,
                "confidence": entry.confidence,
                "frequency": entry.frequency
            })
        
        # Find similar past actions
        similar = await self.get_similar_past_actions(intent, limit=limit)
        for action in similar:
            suggestions.append({
                "source": "similar_action",
                "intent": action.intent,
                "action": {
                    "tool": action.tool,
                    "args": action.args
                },
                "confidence": 0.6,  # Similarity-based
                "frequency": 1
            })
        
        # Sort by confidence and return top results
        suggestions.sort(key=lambda x: x["confidence"], reverse=True)
        return suggestions[:limit]
    
    async def get_similar_past_actions(
        self,
        intent: str,
        limit: int = 5
    ) -> List[ActionRecord]:
        """
        Find similar past actions based on intent.
        
        Args:
            intent: The current intent to match
            limit: Maximum number of results
            
        Returns:
            List of similar past action records
        """
        # Simple keyword matching for now
        # In production, use vector similarity
        intent_words = set(intent.lower().split())
        
        scored_actions = []
        for action in self._action_history:
            action_words = set(action.intent.lower().split())
            overlap = len(intent_words & action_words)
            if overlap > 0:
                score = overlap / max(len(intent_words), len(action_words))
                scored_actions.append((score, action))
        
        # Sort by score descending
        scored_actions.sort(key=lambda x: x[0], reverse=True)
        
        return [action for _, action in scored_actions[:limit]]
    
    async def get_correction_for_error(self, error: str) -> Optional[str]:
        """
        Get a learned correction for an error.
        
        Args:
            error: The error message
            
        Returns:
            Suggested correction or None
        """
        error_key = self._normalize_error(error)
        pattern_key = f"correction:{error_key}"
        
        if pattern_key in self._patterns:
            entry = self._patterns[pattern_key]
            return entry.value.get("correction")
        
        return None
    
    async def detect_shortcuts(self, min_frequency: int = 3) -> List[Dict[str, Any]]:
        """
        Detect frequently used command sequences that could become shortcuts.
        
        Args:
            min_frequency: Minimum times a command must be used
            
        Returns:
            List of potential shortcuts
        """
        shortcuts = []
        
        for command_key, count in self._command_counter.most_common(10):
            if count >= min_frequency:
                parts = command_key.split(":", 1)
                tool = parts[0]
                args = json.loads(parts[1]) if len(parts) > 1 else {}
                
                shortcuts.append({
                    "tool": tool,
                    "args": args,
                    "frequency": count,
                    "potential_name": self._suggest_shortcut_name(tool, args)
                })
        
        return shortcuts
    
    async def analyze_patterns(self) -> Dict[str, Any]:
        """
        Analyze learned patterns and provide insights.
        
        Returns:
            Analysis of learned patterns
        """
        pattern_types = Counter()
        high_confidence = 0
        
        for entry in self._patterns.values():
            pattern_types[entry.pattern_type.value] += 1
            if entry.confidence >= self.CONFIDENCE_HIGH:
                high_confidence += 1
        
        return {
            "total_patterns": len(self._patterns),
            "total_actions": len(self._action_history),
            "total_preferences": len(self._preferences),
            "pattern_distribution": dict(pattern_types),
            "high_confidence_patterns": high_confidence,
            "potential_shortcuts": len(await self.detect_shortcuts()),
            "most_used_tools": self._get_most_used_tools(5)
        }
    
    def get_learning_stats(self) -> Dict[str, Any]:
        """Get current learning statistics."""
        return {
            "patterns_learned": len(self._patterns),
            "actions_observed": len(self._action_history),
            "preferences_stored": len(self._preferences),
            "unique_commands": len(self._command_counter),
            "enabled": {
                "patterns": self.enable_pattern_learning,
                "preferences": self.enable_preference_learning
            }
        }
    
    # ---- Private Methods ----
    
    def _extract_pattern(self, intent: str) -> Optional[str]:
        """Extract a pattern key from an intent."""
        import re
        
        intent_lower = intent.lower().strip()
        
        for pattern, pattern_type in self._command_templates:
            if re.search(pattern, intent_lower):
                return f"{pattern_type}:{hash(intent_lower) % 10000}"
        
        # Fallback: use first verb/word as pattern
        words = intent_lower.split()
        if words:
            first_word = words[0]
            if first_word in ["zip", "run", "delete", "find", "analyze", "summarize",
                             "install", "create", "move", "copy", "open", "close"]:
                return f"action:{first_word}"
        
        return None
    
    def _normalize_error(self, error: str) -> str:
        """Normalize an error message for pattern matching."""
        import re
        
        # Remove specific paths, numbers, etc.
        normalized = error.lower()
        normalized = re.sub(r'[/\\][^\s]+', '<PATH>', normalized)
        normalized = re.sub(r'\d+', '<NUM>', normalized)
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        
        # Truncate to reasonable length
        return normalized[:200]
    
    def _suggest_shortcut_name(self, tool: str, args: Dict[str, Any]) -> str:
        """Suggest a name for a potential shortcut."""
        if tool == "shell" and args:
            cmd = str(args.get("command", args))[:20]
            return f"quick_{cmd.replace(' ', '_')}"
        return f"shortcut_{tool}"
    
    def _get_most_used_tools(self, limit: int = 5) -> List[Tuple[str, int]]:
        """Get the most frequently used tools."""
        tool_counts = Counter()
        for action in self._action_history:
            tool_counts[action.tool] += 1
        return tool_counts.most_common(limit)
    
    async def _save_pattern(self, entry: LearningEntry):
        """Persist a pattern to storage."""
        if not self.store:
            return
        
        try:
            await self.store.add(
                content=f"pattern:{entry.pattern}",
                metadata={
                    "pattern_type": entry.pattern_type.value,
                    "pattern": entry.pattern,
                    "value": entry.value,
                    "confidence": entry.confidence,
                    "frequency": entry.frequency,
                    "last_used": entry.last_used.isoformat()
                },
                table_name=self.TABLE_PATTERNS
            )
        except Exception as e:
            logger.error(f"Failed to save pattern: {e}")
    
    async def clear_all(self):
        """Clear all learned data (use with caution)."""
        self._patterns.clear()
        self._action_history.clear()
        self._preferences.clear()
        self._command_counter.clear()
        
        if self.store:
            try:
                await self.store.clear_table(self.TABLE_PATTERNS)
                await self.store.clear_table(self.TABLE_PREFERENCES)
                await self.store.clear_table(self.TABLE_ACTIONS)
            except Exception:
                pass
        
        logger.info("Cleared all learned data")


# Convenience function for creating action records
def create_action_record(
    intent: str,
    tool: str,
    args: Dict[str, Any],
    result: str,
    approved: bool = True
) -> ActionRecord:
    """Create an ActionRecord for learning."""
    return ActionRecord(
        action_id=str(uuid.uuid4()),
        intent=intent,
        tool=tool,
        args=args,
        result=result,
        approved=approved
    )
