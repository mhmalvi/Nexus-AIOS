"""
Nexus Intent Validator - Action Alignment Checking
Ensures actions match the user's original intent

Supports:
- Keyword-based fast checks
- LLM-based semantic validation (for critical actions)
"""

import asyncio
import aiohttp
import json
from typing import Optional
from dataclasses import dataclass


@dataclass
class AlignmentResult:
    """Result from intent alignment check"""
    is_aligned: bool
    confidence: float
    reason: Optional[str]
    semantic_check: bool = False  # True if LLM was used


class IntentValidator:
    """
    Intent Validator - Ensures Action-Intent Alignment
    
    Checks that proposed actions logically support
    the user's original request.
    """
    
    # Misalignment indicators
    MISALIGNMENT_PATTERNS = [
        # Scope expansion
        ("all files", ["specific file", "this file"]),
        ("entire system", ["this folder", "current directory"]),
        ("recursively", ["only this"]),
        
        # Action escalation
        ("delete", ["read", "view", "show"]),
        ("modify", ["display", "list"]),
        ("execute", ["explain", "describe"]),
        
        # Suspicious additions
        ("download", []),  # Downloading when not asked
        ("upload", []),    # Uploading when not asked
        ("network", []),   # Network access when not asked
    ]
    
    # Intent categories for matching
    INTENT_CATEGORIES = {
        "read": ["show", "display", "view", "list", "read", "get", "find", "search"],
        "write": ["write", "create", "save", "update", "edit", "modify", "change"],
        "delete": ["delete", "remove", "clear", "clean", "erase", "drop"],
        "execute": ["run", "execute", "start", "launch", "open"],
        "organize": ["move", "copy", "rename", "organize", "sort", "archive", "zip"],
    }
    
    def __init__(self):
        pass
    
    def check_alignment(
        self,
        action: str,
        intent: str
    ) -> AlignmentResult:
        """Check if action aligns with intent"""
        
        action_lower = action.lower()
        intent_lower = intent.lower()
        
        # Extract intent category
        intent_category = self._categorize_intent(intent_lower)
        action_category = self._categorize_intent(action_lower)
        
        # Check for obvious misalignment
        if self._has_misalignment_pattern(action_lower, intent_lower):
            return AlignmentResult(
                is_aligned=False,
                confidence=0.9,
                reason="Action appears to exceed the scope of the original intent"
            )
        
        # Check category alignment
        if intent_category and action_category:
            if intent_category != action_category:
                # Some category transitions are acceptable
                if not self._is_acceptable_transition(intent_category, action_category):
                    return AlignmentResult(
                        is_aligned=False,
                        confidence=0.7,
                        reason=f"Action category '{action_category}' differs from intent category '{intent_category}'"
                    )
        
        # Check for suspicious keywords
        suspicious = self._check_suspicious_keywords(action_lower, intent_lower)
        if suspicious:
            return AlignmentResult(
                is_aligned=False,
                confidence=0.8,
                reason=suspicious
            )
        
        return AlignmentResult(
            is_aligned=True,
            confidence=0.85,
            reason=None
        )
    
    def _categorize_intent(self, text: str) -> Optional[str]:
        """Categorize text into intent category"""
        
        for category, keywords in self.INTENT_CATEGORIES.items():
            for keyword in keywords:
                if keyword in text:
                    return category
        
        return None
    
    def _has_misalignment_pattern(self, action: str, intent: str) -> bool:
        """Check for misalignment patterns"""
        
        for risky_term, safe_terms in self.MISALIGNMENT_PATTERNS:
            if risky_term in action:
                # Check if intent has corresponding safe term
                if safe_terms:
                    if any(safe in intent for safe in safe_terms):
                        return True
                else:
                    # If no safe terms, risky term shouldn't appear unless in intent
                    if risky_term not in intent:
                        return True
        
        return False
    
    def _is_acceptable_transition(self, intent_cat: str, action_cat: str) -> bool:
        """Check if category transition is acceptable"""
        
        # Read -> anything is usually fine as support action
        if intent_cat == "read":
            return action_cat in ["read"]
        
        # Write might need read first
        if intent_cat == "write":
            return action_cat in ["read", "write"]
        
        # Organize might need read and write
        if intent_cat == "organize":
            return action_cat in ["read", "write", "organize"]
        
        # Delete should only be delete or read (for confirmation)
        if intent_cat == "delete":
            return action_cat in ["read", "delete"]
        
        return intent_cat == action_cat
    
    def _check_suspicious_keywords(self, action: str, intent: str) -> Optional[str]:
        """Check for suspicious keywords in action that aren't in intent"""
        
        suspicious = [
            ("hack", "Action contains suspicious term 'hack'"),
            ("bypass", "Action attempts to bypass security"),
            ("exploit", "Action contains exploit-related term"),
            ("inject", "Action contains injection-related term"),
            ("sudo", "Action requests elevated privileges not in original request"),
            ("admin", "Action requests admin access not in original request"),
        ]
        
        for keyword, reason in suspicious:
            if keyword in action and keyword not in intent:
                return reason
        
        return None
    
    async def validate_with_llm(
        self,
        action: str,
        intent: str,
        model: str = "phi3:mini",
        base_url: str = "http://localhost:11434"
    ) -> AlignmentResult:
        """
        Semantic validation using LLM
        
        Uses a small, fast model to determine if the proposed action
        logically supports the user's original intent.
        """
        
        # First do fast keyword check
        fast_result = self.check_alignment(action, intent)
        if not fast_result.is_aligned:
            return fast_result
        
        # For high-risk actions, use LLM validation
        system_prompt = """You are a security auditor for an AI operating system.
Your job is to determine if a proposed ACTION aligns with the user's INTENT.

Respond with ONLY a JSON object:
{
    "aligned": true/false,
    "confidence": 0.0-1.0,
    "reason": "brief explanation"
}

Rules:
- Actions should NOT exceed the scope of the intent
- Deleting when asked to read = MISALIGNED
- Downloading when not requested = MISALIGNED
- Network access when not requested = MISALIGNED
- Reading before writing = ALIGNED (supporting action)"""

        user_prompt = f"""INTENT: "{intent}"
ACTION: "{action}"

Is this action aligned with the intent?"""

        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "stream": False,
                    "options": {
                        "temperature": 0.1,  # Low temp for consistent evaluation
                        "num_predict": 256
                    }
                }
                
                async with session.post(
                    f"{base_url}/api/chat",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if response.status != 200:
                        # Fall back to keyword check on LLM failure
                        return AlignmentResult(
                            is_aligned=fast_result.is_aligned,
                            confidence=fast_result.confidence,
                            reason="LLM unavailable, using keyword check",
                            semantic_check=False
                        )
                    
                    result = await response.json()
                    content = result.get("message", {}).get("content", "")
                    
                    # Parse JSON response
                    try:
                        # Handle markdown code blocks
                        if "```" in content:
                            content = content.split("```")[1]
                            if content.startswith("json"):
                                content = content[4:]
                        
                        parsed = json.loads(content.strip())
                        
                        return AlignmentResult(
                            is_aligned=parsed.get("aligned", True),
                            confidence=parsed.get("confidence", 0.5),
                            reason=parsed.get("reason", None),
                            semantic_check=True
                        )
                    except json.JSONDecodeError:
                        # If parsing fails, check for keywords in response
                        is_aligned = "misaligned" not in content.lower() and "not aligned" not in content.lower()
                        return AlignmentResult(
                            is_aligned=is_aligned,
                            confidence=0.6,
                            reason=content[:200] if not is_aligned else None,
                            semantic_check=True
                        )
                        
        except asyncio.TimeoutError:
            return AlignmentResult(
                is_aligned=fast_result.is_aligned,
                confidence=fast_result.confidence,
                reason="LLM timeout, using keyword check",
                semantic_check=False
            )
        except Exception as e:
            return AlignmentResult(
                is_aligned=fast_result.is_aligned,
                confidence=fast_result.confidence,
                reason=f"LLM error: {str(e)[:50]}",
                semantic_check=False
            )

