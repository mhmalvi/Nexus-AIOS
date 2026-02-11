"""
Nexus Memory Manager - Tiered Memory System
Coordinates between working, short-term, and long-term memory
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from enum import Enum
from datetime import datetime, timedelta

from .lancedb_store import LanceDBStore
from .rag_engine import RAGEngine
from .context_scheduler import ContextScheduler


class MemoryTier(Enum):
    """Memory tier enumeration"""
    WORKING = "working"       # Volatile, session-based (LLM context window)
    SHORT_TERM = "short_term" # Persistent, time-indexed (recent events)
    LONG_TERM = "long_term"   # Persistent, semantic-indexed (knowledge)


@dataclass
class MemoryEntry:
    """A single memory entry"""
    id: str
    content: str
    tier: MemoryTier
    metadata: Dict[str, Any]
    embedding: Optional[List[float]]
    created_at: datetime
    accessed_at: datetime
    access_count: int = 0
    score: float = 0.0


class MemoryManager:
    """
    Memory Manager - Coordinates the 3-tier memory hierarchy
    
    Tier 1 (Working): LLM context window - volatile, session-based
    Tier 2 (Short-term): Recent events - persistent, LRU-based
    Tier 3 (Long-term): Knowledge base - persistent, semantic
    """
    
    def __init__(
        self,
        db_path: str = "./data/lancedb",
        working_memory_limit: int = 10,
        short_term_ttl_hours: int = 24 * 7,  # 1 week
        embedding_model: str = "nomic-embed-text"
    ):
        self.db_path = db_path
        self.working_memory_limit = working_memory_limit
        self.short_term_ttl = timedelta(hours=short_term_ttl_hours)
        
        # Initialize stores
        self.db_store = LanceDBStore(db_path, embedding_model)
        self.rag_engine = RAGEngine(self.db_store)
        self.context_scheduler = ContextScheduler(
            working_limit=working_memory_limit
        )
        
        # Working memory (in-session only)
        self.working_memory: List[MemoryEntry] = []
    
    async def store(
        self,
        content: str,
        tier: str = "short_term",
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Store content in the specified memory tier"""
        
        tier_enum = MemoryTier(tier)
        entry_metadata = metadata or {}
        entry_metadata["tier"] = tier
        entry_metadata["stored_at"] = datetime.utcnow().isoformat()
        
        if tier_enum == MemoryTier.WORKING:
            # Working memory is in-session only
            entry = MemoryEntry(
                id=f"wm_{len(self.working_memory)}",
                content=content,
                tier=tier_enum,
                metadata=entry_metadata,
                embedding=None,
                created_at=datetime.utcnow(),
                accessed_at=datetime.utcnow()
            )
            
            # Apply LRU if at limit
            if len(self.working_memory) >= self.working_memory_limit:
                self.working_memory.pop(0)
            
            self.working_memory.append(entry)
            return entry.id
        
        else:
            # Short-term and long-term go to LanceDB
            table_name = f"{tier}_memory"
            entry_id = await self.db_store.add(
                content=content,
                metadata=entry_metadata,
                table_name=table_name
            )
            return entry_id
    
    async def retrieve(
        self,
        query: str,
        tier: str = "all",
        limit: int = 5,
        threshold: float = 0.5,
        # H-MEM parameters
        domain: Optional[str] = None,
        category: Optional[str] = None,
        max_abstraction: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Retrieve relevant memories using hybrid search and H-MEM filtering"""
        
        results = []
        
        if tier in ["all", "working"]:
            # Search working memory
            working_results = self._search_working_memory(query, limit)
            results.extend(working_results)
        
        if tier in ["all", "short_term"]:
            # Search short-term memory
            short_term_results = await self.db_store.search(
                query=query,
                table_name="short_term_memory",
                limit=limit,
                threshold=threshold,
                domain=domain,
                category=category,
                max_abstraction=max_abstraction
            )
            results.extend(short_term_results)
        
        if tier in ["all", "long_term"]:
            # Search long-term memory
            long_term_results = await self.db_store.search(
                query=query,
                table_name="long_term_memory",
                limit=limit,
                threshold=threshold,
                domain=domain,
                category=category,
                max_abstraction=max_abstraction
            )
            results.extend(long_term_results)
        
        # Use context scheduler to select best results
        scheduled = self.context_scheduler.schedule(
            results,
            query=query,
            max_tokens=4096
        )
        
        return scheduled
    
    async def rag_query(
        self,
        query: str,
        context_limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Perform RAG retrieval with reranking"""
        
        return await self.rag_engine.retrieve(
            query=query,
            limit=context_limit
        )
    
    def _search_working_memory(
        self,
        query: str,
        limit: int
    ) -> List[Dict[str, Any]]:
        """Simple keyword search in working memory"""
        
        query_lower = query.lower()
        results = []
        
        for entry in self.working_memory:
            content_lower = entry.content.lower()
            
            # Simple keyword matching score
            words = query_lower.split()
            matches = sum(1 for w in words if w in content_lower)
            score = matches / len(words) if words else 0
            
            if score > 0:
                results.append({
                    "id": entry.id,
                    "content": entry.content,
                    "score": score,
                    "tier": "working",
                    "metadata": entry.metadata
                })
        
        # Sort by score and limit
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]
    
    async def clear_tier(self, tier: str) -> int:
        """Clear all entries from a memory tier"""
        
        tier_enum = MemoryTier(tier)
        
        if tier_enum == MemoryTier.WORKING:
            count = len(self.working_memory)
            self.working_memory.clear()
            return count
        
        else:
            table_name = f"{tier}_memory"
            return await self.db_store.clear_table(table_name)
    
    async def cleanup_short_term(self) -> int:
        """Remove expired short-term memories"""
        
        cutoff = datetime.utcnow() - self.short_term_ttl
        return await self.db_store.delete_before(
            table_name="short_term_memory",
            before=cutoff
        )
    
    def get_stats(self) -> Dict[str, Any]:
        """Get memory system statistics"""
        
        return {
            "working_memory_count": len(self.working_memory),
            "working_memory_limit": self.working_memory_limit,
            "db_path": self.db_path,
            "short_term_ttl_hours": self.short_term_ttl.total_seconds() / 3600
        }
    
    async def promote_to_long_term(
        self,
        entry_id: str,
        from_tier: str = "short_term"
    ) -> str:
        """Promote an entry from short-term to long-term memory"""
        
        # Retrieve the entry
        entry = await self.db_store.get_by_id(
            entry_id,
            table_name=f"{from_tier}_memory"
        )
        
        if not entry:
            raise ValueError(f"Entry not found: {entry_id}")
        
        # Store in long-term
        new_id = await self.db_store.add(
            content=entry["content"],
            metadata={**entry.get("metadata", {}), "promoted_from": from_tier},
            table_name="long_term_memory"
        )
        
        # Optionally delete from short-term
        await self.db_store.delete(entry_id, f"{from_tier}_memory")
        
        return new_id
    
    # ========== Context Capsules Feature ==========
    
    async def summarize_to_capsule(
        self,
        entry_id: str,
        tier: str,
        brain  # Brain instance for LLM summarization
    ) -> str:
        """
        Create a 'Context Capsule' - a compressed summary of content.
        Stores both the original and the capsule for retrieval efficiency.
        """
        table_name = f"{tier}_memory"
        entry = await self.db_store.get_by_id(entry_id, table_name=table_name)
        
        if not entry:
            raise ValueError(f"Entry not found: {entry_id}")
        
        content = entry.get("content", "")
        
        # Use Brain to generate a concise summary
        summary_prompt = f"""Summarize the following content into a brief capsule (2-3 sentences max).
Extract the key facts and main points only.

Content:
{content}

Capsule Summary:"""
        
        summary = await brain.generate(
            prompt=summary_prompt,
            temperature=0.3,
            max_tokens=150
        )
        
        # Update the entry with capsule metadata
        updated_metadata = entry.get("metadata", {})
        updated_metadata["has_capsule"] = True
        updated_metadata["capsule_summary"] = summary.strip()
        updated_metadata["capsule_created_at"] = datetime.utcnow().isoformat()
        
        # Store the updated entry (re-add with same content but updated metadata)
        await self.db_store.update_metadata(
            entry_id=entry_id,
            table_name=table_name,
            metadata=updated_metadata
        )
        
        return summary.strip()
    
    async def retrieve_with_capsules(
        self,
        query: str,
        tier: str = "all",
        limit: int = 5,
        prefer_capsules: bool = True,
        max_tokens: int = 2000
    ) -> List[Dict[str, Any]]:
        """
        Retrieve memories, preferring capsule summaries when available.
        Uses full content only when capsule doesn't exist or when detail is needed.
        """
        results = await self.retrieve(query=query, tier=tier, limit=limit)
        
        if not prefer_capsules:
            return results
        
        # Replace content with capsule summaries where available
        token_estimate = 0
        capsule_results = []
        
        for result in results:
            metadata = result.get("metadata", {})
            
            if metadata.get("has_capsule") and metadata.get("capsule_summary"):
                # Use capsule summary (much shorter)
                capsule_content = metadata["capsule_summary"]
                token_estimate += len(capsule_content.split()) * 1.3
                
                capsule_results.append({
                    **result,
                    "content": capsule_content,
                    "is_capsule": True,
                    "original_available": True
                })
            else:
                # Use original content
                content = result.get("content", "")
                token_estimate += len(content.split()) * 1.3
                
                capsule_results.append({
                    **result,
                    "is_capsule": False
                })
            
            # Stop if we've exceeded token budget
            if token_estimate > max_tokens:
                break
        
        return capsule_results
