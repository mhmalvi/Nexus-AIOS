"""
AETHER Compaction Engine — Adaptive Context Window Summarization

When conversation history grows too large for the model's context window,
this engine compresses older messages into summaries while preserving
essential information.

Inspired by OpenClaw's compaction.ts — ported to Python with AETHER enhancements.
"""

import asyncio
import logging
import math
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Callable, Awaitable

logger = logging.getLogger("aether.compaction")


# ---------------------------------------------------------------------------
# Token estimation (fast, no tokenizer dependency)
# ---------------------------------------------------------------------------

def estimate_tokens(text: str) -> int:
    """Approximate token count (~4 chars per token for English)."""
    return max(1, len(text) // 4)


def messages_token_count(messages: List[Dict[str, Any]]) -> int:
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
        total += 4  # per-message overhead (role, separators)
    return total


# ---------------------------------------------------------------------------
# Chunking — split messages into manageable groups
# ---------------------------------------------------------------------------

@dataclass
class MessageChunk:
    """A group of messages that fits within a token budget."""
    messages: List[Dict[str, Any]]
    token_count: int
    index: int  # chunk number


def chunk_messages_by_tokens(
    messages: List[Dict[str, Any]],
    max_chunk_tokens: int = 8_000,
) -> List[MessageChunk]:
    """
    Split a message list into chunks where each chunk fits
    within max_chunk_tokens.

    System messages are always kept in the first chunk.
    """
    if not messages:
        return []

    chunks: List[MessageChunk] = []
    current_msgs: List[Dict[str, Any]] = []
    current_tokens = 0
    chunk_idx = 0

    for msg in messages:
        msg_tokens = estimate_tokens(msg.get("content", "")) + 4
        # System messages always start a new chunk (they're context-setting)
        if msg.get("role") == "system" and current_msgs:
            chunks.append(MessageChunk(
                messages=current_msgs,
                token_count=current_tokens,
                index=chunk_idx,
            ))
            current_msgs = []
            current_tokens = 0
            chunk_idx += 1

        if current_tokens + msg_tokens > max_chunk_tokens and current_msgs:
            chunks.append(MessageChunk(
                messages=current_msgs,
                token_count=current_tokens,
                index=chunk_idx,
            ))
            current_msgs = []
            current_tokens = 0
            chunk_idx += 1

        current_msgs.append(msg)
        current_tokens += msg_tokens

    if current_msgs:
        chunks.append(MessageChunk(
            messages=current_msgs,
            token_count=current_tokens,
            index=chunk_idx,
        ))

    return chunks


# ---------------------------------------------------------------------------
# Compaction result
# ---------------------------------------------------------------------------

@dataclass
class CompactionResult:
    """Result of compacting conversation history."""
    summary: str
    kept_messages: List[Dict[str, Any]]
    dropped_messages: int
    dropped_tokens: int
    original_tokens: int
    compacted_tokens: int

    @property
    def compression_ratio(self) -> float:
        if self.original_tokens <= 0:
            return 0.0
        return 1.0 - (self.compacted_tokens / self.original_tokens)


# ---------------------------------------------------------------------------
# Compaction Engine
# ---------------------------------------------------------------------------

class CompactionEngine:
    """
    Adaptive context window compaction.

    Strategy:
    1. Estimate total tokens across the conversation history
    2. If under budget, no compaction needed
    3. If over budget, split old messages into chunks
    4. Summarize each chunk using the LLM
    5. Replace old messages with a single summary message
    6. Keep recent messages intact (recency bias)

    Usage:
        engine = CompactionEngine(summarize_fn=my_llm_summarizer)
        result = await engine.compact(messages, budget_tokens=120_000)
        # result.kept_messages is the new message list
    """

    SUMMARIZE_PROMPT = (
        "You are a conversation summarizer. Condense the following conversation "
        "into a concise summary that preserves:\n"
        "- Key decisions and conclusions\n"
        "- Important facts, names, and numbers\n"
        "- Action items and commitments\n"
        "- Technical details that might be referenced later\n\n"
        "Be thorough but concise. Use bullet points.\n\n"
        "Conversation to summarize:\n{conversation}"
    )

    def __init__(
        self,
        summarize_fn: Optional[Callable[[str], Awaitable[str]]] = None,
        max_chunk_tokens: int = 8_000,
        keep_recent_messages: int = 10,
        keep_recent_share: float = 0.3,
    ):
        """
        Args:
            summarize_fn: Async function that takes text and returns a summary.
                          If None, uses a basic truncation fallback.
            max_chunk_tokens: Max tokens per chunk when splitting for summarization.
            keep_recent_messages: Minimum number of recent messages to keep uncompacted.
            keep_recent_share: Fraction of budget reserved for recent messages (0.0–1.0).
        """
        self.summarize_fn = summarize_fn
        self.max_chunk_tokens = max_chunk_tokens
        self.keep_recent_messages = keep_recent_messages
        self.keep_recent_share = keep_recent_share

    async def compact(
        self,
        messages: List[Dict[str, Any]],
        budget_tokens: int = 120_000,
        previous_summary: Optional[str] = None,
    ) -> CompactionResult:
        """
        Compact conversation history to fit within budget_tokens.

        Args:
            messages: Full conversation message list.
            budget_tokens: Target token budget to fit within.
            previous_summary: Optional previous compaction summary to build on.

        Returns:
            CompactionResult with the new message list.
        """
        original_tokens = messages_token_count(messages)

        # Already within budget — no compaction needed
        if original_tokens <= budget_tokens:
            return CompactionResult(
                summary="",
                kept_messages=messages,
                dropped_messages=0,
                dropped_tokens=0,
                original_tokens=original_tokens,
                compacted_tokens=original_tokens,
            )

        logger.info(
            "Compacting: %d tokens → target %d tokens (%d messages)",
            original_tokens, budget_tokens, len(messages),
        )

        # Split into "old" (to summarize) and "recent" (to keep)
        split_point = self._find_split_point(messages, budget_tokens)

        old_messages = messages[:split_point]
        recent_messages = messages[split_point:]

        if not old_messages:
            # Can't compact further — return recent messages anyway
            return CompactionResult(
                summary="",
                kept_messages=recent_messages,
                dropped_messages=0,
                dropped_tokens=0,
                original_tokens=original_tokens,
                compacted_tokens=messages_token_count(recent_messages),
            )

        # Summarize old messages
        summary = await self._summarize_messages(old_messages, previous_summary)

        # Build new message list
        summary_msg = {
            "role": "system",
            "content": (
                f"[COMPACTED CONTEXT — Earlier conversation summary]\n\n{summary}"
            ),
        }

        kept_messages = [summary_msg] + recent_messages
        compacted_tokens = messages_token_count(kept_messages)
        dropped_tokens = messages_token_count(old_messages)

        logger.info(
            "Compaction complete: %d → %d tokens (%.0f%% reduction, %d messages dropped)",
            original_tokens, compacted_tokens,
            (1 - compacted_tokens / original_tokens) * 100,
            len(old_messages),
        )

        return CompactionResult(
            summary=summary,
            kept_messages=kept_messages,
            dropped_messages=len(old_messages),
            dropped_tokens=dropped_tokens,
            original_tokens=original_tokens,
            compacted_tokens=compacted_tokens,
        )

    def _find_split_point(
        self,
        messages: List[Dict[str, Any]],
        budget_tokens: int,
    ) -> int:
        """
        Find the index where old messages end and recent messages begin.

        Strategy: keep the most recent N messages (or fraction of budget),
        summarize everything else.
        """
        # Reserve a portion of budget for recent messages
        recent_budget = int(budget_tokens * self.keep_recent_share)

        # Walk backwards from the end, counting tokens
        recent_tokens = 0
        split_from_end = 0

        for i in range(len(messages) - 1, -1, -1):
            msg_tokens = estimate_tokens(messages[i].get("content", "")) + 4
            if recent_tokens + msg_tokens > recent_budget:
                break
            recent_tokens += msg_tokens
            split_from_end += 1
            if split_from_end >= len(messages) - 1:
                break  # keep at least 1 old message

        # Ensure minimum recent messages
        split_from_end = max(split_from_end, self.keep_recent_messages)
        split_from_end = min(split_from_end, len(messages) - 1)

        return len(messages) - split_from_end

    async def _summarize_messages(
        self,
        messages: List[Dict[str, Any]],
        previous_summary: Optional[str] = None,
    ) -> str:
        """
        Summarize a list of messages into a compact text.

        Uses chunked summarization for large message sets.
        """
        # Build conversation text
        chunks = chunk_messages_by_tokens(messages, self.max_chunk_tokens)

        if not chunks:
            return previous_summary or ""

        summaries: List[str] = []

        if previous_summary:
            summaries.append(f"Previous context:\n{previous_summary}")

        for chunk in chunks:
            conversation_text = self._format_messages(chunk.messages)

            if self.summarize_fn:
                try:
                    prompt = self.SUMMARIZE_PROMPT.format(
                        conversation=conversation_text
                    )
                    summary = await self.summarize_fn(prompt)
                    summaries.append(summary)
                except Exception as e:
                    logger.warning(
                        "Summarization failed for chunk %d, using truncation: %s",
                        chunk.index, e,
                    )
                    summaries.append(self._truncation_fallback(conversation_text))
            else:
                summaries.append(self._truncation_fallback(conversation_text))

        # If we have multiple chunk summaries, optionally merge them
        if len(summaries) == 1:
            return summaries[0]

        # Merge summaries (could re-summarize, but keeps it simple for now)
        return "\n\n---\n\n".join(summaries)

    @staticmethod
    def _format_messages(messages: List[Dict[str, Any]]) -> str:
        """Format messages into readable conversation text."""
        parts = []
        for msg in messages:
            role = msg.get("role", "unknown").upper()
            content = msg.get("content", "")
            if isinstance(content, list):
                content = " ".join(
                    p.get("text", "") for p in content if isinstance(p, dict)
                )
            parts.append(f"{role}: {content}")
        return "\n\n".join(parts)

    @staticmethod
    def _truncation_fallback(text: str, max_chars: int = 2000) -> str:
        """Fallback: just truncate to last N characters when summarization fails."""
        if len(text) <= max_chars:
            return text
        return f"[...truncated...]\n{text[-max_chars:]}"


# ---------------------------------------------------------------------------
# Convenience: prune history for context sharing (subagents, etc.)
# ---------------------------------------------------------------------------

def prune_history_for_context_share(
    messages: List[Dict[str, Any]],
    max_tokens: int = 4_000,
    max_history_share: float = 0.5,
) -> Dict[str, Any]:
    """
    Prune conversation history for sharing with subagents.

    Returns only the most recent messages that fit within the token budget.
    Useful when spawning a subagent that needs some parent context.
    """
    budget = int(max_tokens * max_history_share)
    kept: List[Dict[str, Any]] = []
    kept_tokens = 0

    # Walk backwards, keeping recent messages
    for msg in reversed(messages):
        msg_tokens = estimate_tokens(msg.get("content", "")) + 4
        if kept_tokens + msg_tokens > budget:
            break
        kept.insert(0, msg)
        kept_tokens += msg_tokens

    dropped = len(messages) - len(kept)
    return {
        "messages": kept,
        "dropped_messages": dropped,
        "dropped_tokens": messages_token_count(messages) - kept_tokens,
        "kept_tokens": kept_tokens,
        "budget_tokens": budget,
    }
