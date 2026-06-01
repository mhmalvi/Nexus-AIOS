"""
Nexus Phase 2 Architecture Tests
Validates the new architectural components: QueryCache and RuntimeConfig.
"""

import pytest
import asyncio
import os
import sys
import json
import time
from pathlib import Path

# Add kernel to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'kernel'))

from brain.query_cache import QueryCache
from runtime_config import RuntimeConfig, DEFAULT_CONFIG


@pytest.mark.asyncio
class TestQueryCache:
    """Test the LRU + TTL Query Cache."""

    async def test_cache_miss_returns_none(self):
        cache = QueryCache()
        key = cache.make_key("test prompt")
        assert await cache.get(key) is None

    async def test_cache_hit(self):
        cache = QueryCache()
        key = cache.make_key("test prompt")
        await cache.put(key, "cached response")
        
        result = await cache.get(key)
        assert result == "cached response"
        assert cache._stats["hits"] == 1

    async def test_ttl_expiry(self):
        # Short TTL for testing
        cache = QueryCache(ttl_seconds=0.1)
        key = cache.make_key("test prompt")
        await cache.put(key, "response")
        
        # Immediate fetch should hit
        assert await cache.get(key) == "response"
        
        # Wait for expiry
        await asyncio.sleep(0.2)
        assert await cache.get(key) is None
        assert cache._stats["misses"] == 1

    async def test_lru_eviction(self):
        # Max size 2
        cache = QueryCache(max_size=2)
        
        k1 = cache.make_key("1")
        k2 = cache.make_key("2")
        k3 = cache.make_key("3")
        
        await cache.put(k1, "v1")
        await cache.put(k2, "v2")
        
        # Access k1 to make it MRU (k2 becomes LRU)
        await cache.get(k1)
        
        # Add k3, should evict k2 (LRU)
        await cache.put(k3, "v3")
        
        assert await cache.get(k1) == "v1"  # Still there
        assert await cache.get(k3) == "v3"  # Just added
        assert await cache.get(k2) is None  # Evicted


@pytest.mark.asyncio
class TestRuntimeConfig:
    """Test the persistent RuntimeConfig."""

    @pytest.fixture
    def temp_config(self, tmp_path):
        """Create a config pointing to a temp file."""
        config_path = tmp_path / "config.json"
        return RuntimeConfig(str(config_path))

    async def test_load_defaults_if_missing(self, temp_config):
        await temp_config.load()
        assert temp_config.get("default_model") == DEFAULT_CONFIG["default_model"]
        # Should have created the file
        assert temp_config._path.exists()

    async def test_persist_changes(self, temp_config):
        await temp_config.load()
        
        # Change a value
        await temp_config.set("temperature", 0.99)
        assert temp_config.get("temperature") == 0.99
        
        # Verify file on disk
        content = json.loads(temp_config._path.read_text())
        assert content["temperature"] == 0.99

    async def test_merge_defaults(self, temp_config):
        """Test that existing config merges with new defaults."""
        # Create a partial config file
        temp_config._path.write_text(json.dumps({"custom_key": "val", "temperature": 0.1}))
        
        await temp_config.load()
        
        # Should have custom value
        assert temp_config.get("custom_key") == "val"
        # Should have preserved disk value
        assert temp_config.get("temperature") == 0.1
        # Should have loaded missing default
        assert temp_config.get("max_tokens") == DEFAULT_CONFIG["max_tokens"]

    async def test_reset(self, temp_config):
        await temp_config.load()
        await temp_config.set("temperature", 0.0)
        
        await temp_config.reset("temperature")
        assert temp_config.get("temperature") == DEFAULT_CONFIG["temperature"]


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
