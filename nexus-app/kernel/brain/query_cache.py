"""
Nexus Query Cache — LRU cache for identical LLM queries.

Avoids re-running expensive LLM inference for recently-seen prompts.
Uses a TTL to prevent stale results and an LRU eviction policy.
"""

import asyncio
import hashlib
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Optional, Any, Dict


@dataclass
class CacheEntry:
    """Single cached result."""
    value: Any
    created_at: float
    hits: int = 0


class QueryCache:
    """
    Thread-safe, TTL-aware LRU cache for LLM query results.
    
    Usage:
        cache = QueryCache(max_size=256, ttl_seconds=300)
        
        key = cache.make_key(prompt, model, temperature)
        cached = cache.get(key)
        if cached is not None:
            return cached
        
        result = await llm.generate(prompt=prompt, ...)
        cache.put(key, result)
        return result
    """

    def __init__(self, max_size: int = 256, ttl_seconds: float = 300.0):
        """
        Args:
            max_size: Maximum number of entries (LRU eviction beyond this).
            ttl_seconds: Time-to-live for each entry in seconds.
        """
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._max_size = max_size
        self._ttl = ttl_seconds
        self._lock = asyncio.Lock()
        self._stats = {"hits": 0, "misses": 0, "evictions": 0}

    @staticmethod
    def make_key(prompt: str, model: str = "", temperature: float = 0.0) -> str:
        """Create a deterministic cache key from query parameters."""
        raw = f"{model}|{temperature:.2f}|{prompt}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    async def get(self, key: str) -> Optional[Any]:
        """
        Retrieve a cached result if it exists and hasn't expired.
        Moves entry to the end (most-recently-used).
        """
        async with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                self._stats["misses"] += 1
                return None

            # Check TTL
            if (time.monotonic() - entry.created_at) > self._ttl:
                del self._cache[key]
                self._stats["misses"] += 1
                return None

            # Move to end (most recently used)
            self._cache.move_to_end(key)
            entry.hits += 1
            self._stats["hits"] += 1
            return entry.value

    async def put(self, key: str, value: Any) -> None:
        """Store a result in the cache, evicting LRU entries if at capacity."""
        async with self._lock:
            # If key exists, update it
            if key in self._cache:
                self._cache.move_to_end(key)
                self._cache[key] = CacheEntry(value=value, created_at=time.monotonic())
                return

            # Evict oldest if at capacity
            while len(self._cache) >= self._max_size:
                self._cache.popitem(last=False)
                self._stats["evictions"] += 1

            self._cache[key] = CacheEntry(value=value, created_at=time.monotonic())

    async def invalidate(self, key: str) -> bool:
        """Remove a specific entry. Returns True if it existed."""
        async with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    async def clear(self) -> int:
        """Clear all entries. Returns the number removed."""
        async with self._lock:
            count = len(self._cache)
            self._cache.clear()
            return count

    async def prune_expired(self) -> int:
        """Remove all expired entries. Returns the number removed."""
        async with self._lock:
            now = time.monotonic()
            expired = [
                k for k, v in self._cache.items()
                if (now - v.created_at) > self._ttl
            ]
            for k in expired:
                del self._cache[k]
            return len(expired)

    @property
    def size(self) -> int:
        return len(self._cache)

    @property
    def stats(self) -> Dict[str, int]:
        total = self._stats["hits"] + self._stats["misses"]
        return {
            **self._stats,
            "size": len(self._cache),
            "hit_rate": round(self._stats["hits"] / total, 3) if total > 0 else 0.0,
        }
