"""
Nexus LanceDB Store - Multimodal Vector Database
Provides hybrid search combining vector and full-text retrieval
"""

import os
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import uuid
import asyncio

logger = logging.getLogger(__name__)

# Embedding dimensions per model. nomic-embed-text produces 768-dim vectors;
# the historical 384 fallback caused dimension mismatches / silent degradation.
_EMBEDDING_DIMS = {
    "nomic-embed-text": 768,
    "mxbai-embed-large": 1024,
    "all-minilm": 384,
}


def _sql_literal(value: Any) -> str:
    """Render a value as a safe single-quoted SQL string literal.

    LanceDB filter clauses were previously built by raw f-string
    interpolation, allowing a value containing ``'`` to break out of the
    predicate (filter/predicate injection, F-NEW-3). We escape embedded
    single quotes per the SQL standard (``'`` -> ``''``) and strip NULs.
    """
    s = str(value).replace("\x00", "")
    return "'" + s.replace("'", "''") + "'"


class LanceDBStore:
    """
    LanceDB Store - Multimodal Lakehouse for Agentic State
    
    Features:
    - Vector embeddings for semantic search
    - Full-text indexing for keyword search
    - Hybrid search with RRF fusion
    - Zero-copy schema evolution
    """
    
    def __init__(
        self,
        db_path: str = "./data/lancedb",
        embedding_model: str = "nomic-embed-text"
    ):
        self.db_path = db_path
        self.embedding_model = embedding_model
        self.embedding_dim = _EMBEDDING_DIMS.get(embedding_model, 768)
        self.db = None
        self._initialized = False
        
        # Ensure directory exists
        os.makedirs(db_path, exist_ok=True)
    
    async def _ensure_initialized(self):
        """Lazy initialization of LanceDB"""
        if self._initialized:
            return
        
        try:
            import lancedb
            self.db = lancedb.connect(self.db_path)
            self._initialized = True
        except ImportError:
            print("Warning: lancedb not installed. Using mock store.")
            self.db = None
            self._initialized = True
    
    async def add(
        self,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        table_name: str = "default",
        # H-MEM fields
        domain: Optional[str] = None,
        category: Optional[str] = None,
        abstraction_level: int = 0  # 0=episode, 1=category, 2=domain
    ) -> str:
        """
        Add content to the store with hierarchical memory fields.
        
        Args:
            content: The text content to store
            metadata: Optional metadata dict
            table_name: Target table name
            domain: High-level domain (e.g., "work", "personal", "system")
            category: Category within domain (e.g., "projects", "finance")
            abstraction_level: 0=episode, 1=category summary, 2=domain summary
        """
        
        await self._ensure_initialized()
        
        entry_id = str(uuid.uuid4())
        entry_metadata = metadata or {}
        entry_metadata["id"] = entry_id
        entry_metadata["created_at"] = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        
        if self.db is None:
            # Mock storage
            return entry_id
        
        # Generate embedding
        embedding = await self._get_embedding(content)
        
        data = [{
            "id": entry_id,
            "content": content,
            "metadata": entry_metadata,
            "vector": embedding,
            "created_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            # H-MEM hierarchical fields
            "domain": domain or "general",
            "category": category or "uncategorized",
            "abstraction_level": abstraction_level
        }]
        
        # Add to table (create if doesn't exist)
        try:
            table = self.db.open_table(table_name)
            table.add(data)
        except Exception:
            # Table doesn't exist, create it
            self.db.create_table(table_name, data)
        
        return entry_id
    
    async def search(
        self,
        query: str,
        table_name: str = "default",
        limit: int = 5,
        threshold: float = 0.0,
        use_hybrid: bool = True,
        # H-MEM filters
        domain: Optional[str] = None,
        category: Optional[str] = None,
        max_abstraction: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Perform hybrid search (vector + full-text) with H-MEM filtering.
        
        Args:
            query: Search query text
            table_name: Target table
            limit: Max results
            threshold: Min similarity score
            use_hybrid: Use RRF fusion
            domain: Filter by domain (e.g., "work", "personal")
            category: Filter by category within domain
            max_abstraction: Max abstraction level (0=episodes only)
        """
        
        await self._ensure_initialized()
        
        if self.db is None:
            return []
        
        try:
            table = self.db.open_table(table_name)
        except Exception:
            return []
        
        # Build H-MEM filter clause
        filter_clause = None
        filters = []
        if domain:
            filters.append(f"domain = {_sql_literal(domain)}")
        if category:
            filters.append(f"category = {_sql_literal(category)}")
        if max_abstraction is not None:
            filters.append(f"abstraction_level <= {int(max_abstraction)}")
        if filters:
            filter_clause = " AND ".join(filters)
        
        # Generate query embedding
        query_embedding = await self._get_embedding(query)
        
        if use_hybrid:
            # Hybrid search with RRF fusion
            results = await self._hybrid_search(
                table, query, query_embedding, limit, threshold, filter_clause
            )
        else:
            # Vector-only search
            search_query = table.search(query_embedding).limit(limit)
            if filter_clause:
                search_query = search_query.where(filter_clause)
            results = search_query.to_list()
        
        # Format results with H-MEM fields
        formatted = []
        for r in results:
            # Hybrid results carry a normalized "score"; vector-only results
            # expose a raw "_distance" we convert to a similarity.
            if "score" in r:
                score = r["score"]
            else:
                score = 1 - r.get("_distance", 0.5)
            if score >= threshold:
                formatted.append({
                    "id": r.get("id"),
                    "content": r.get("content"),
                    "score": score,
                    "metadata": r.get("metadata", {}),
                    "tier": table_name.replace("_memory", ""),
                    # H-MEM fields
                    "domain": r.get("domain", "general"),
                    "category": r.get("category", "uncategorized"),
                    "abstraction_level": r.get("abstraction_level", 0)
                })
        
        return formatted
    
    async def _hybrid_search(
        self,
        table,
        query: str,
        query_embedding: List[float],
        limit: int,
        threshold: float,
        filter_clause: Optional[str] = None
    ) -> List[Dict]:
        """Perform hybrid search with Reciprocal Rank Fusion and H-MEM filtering"""
        
        # Vector search with optional filter
        vector_query = table.search(query_embedding).limit(limit * 2)
        if filter_clause:
            vector_query = vector_query.where(filter_clause)
        vector_results = vector_query.to_list()
        
        # Full-text search (if available) with optional filter
        try:
            fts_query = table.search(query, query_type="fts").limit(limit * 2)
            if filter_clause:
                fts_query = fts_query.where(filter_clause)
            fts_results = fts_query.to_list()
        except Exception:
            fts_results = []
        
        # RRF Fusion with k=60
        k = 60
        scores = {}
        
        # Add vector search ranks
        for rank, result in enumerate(vector_results):
            entry_id = result.get("id")
            scores[entry_id] = scores.get(entry_id, 0) + 1 / (k + rank + 1)
            result["_rrf_score"] = scores[entry_id]
        
        # Add FTS ranks
        for rank, result in enumerate(fts_results):
            entry_id = result.get("id")
            scores[entry_id] = scores.get(entry_id, 0) + 1 / (k + rank + 1)
        
        # Merge and sort by RRF score
        merged = {r.get("id"): r for r in vector_results}
        for r in fts_results:
            if r.get("id") not in merged:
                merged[r.get("id")] = r
        
        # Normalize RRF scores into a [0,1] similarity so the caller's threshold
        # filter is meaningful. Raw RRF scores are tiny (~1/61 ≈ 0.016); the top
        # hit becomes 1.0 and the rest scale relative to it.
        max_rrf = max(scores.values()) if scores else 0.0
        for entry_id, result in merged.items():
            rrf = scores.get(entry_id, 0.0)
            norm = (rrf / max_rrf) if max_rrf > 0 else 0.0
            result["_rrf_score"] = rrf
            result["score"] = norm          # normalized similarity for ranking/threshold
            result["_distance"] = 1 - norm  # keep distance coherent with score

        sorted_results = sorted(
            merged.values(),
            key=lambda x: scores.get(x.get("id"), 0),
            reverse=True
        )

        return sorted_results[:limit]
    
    async def _get_embedding(self, text: str) -> List[float]:
        """Get embedding for text using Ollama"""
        
        try:
            import aiohttp
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "http://localhost:11434/api/embeddings",
                    json={"model": self.embedding_model, "prompt": text}
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        embedding = result.get("embedding")
                        if embedding:
                            return embedding
                        logger.error("Embedding endpoint returned empty vector for model %s", self.embedding_model)
                    else:
                        logger.error("Embedding request failed: HTTP %s", response.status)
        except Exception as e:
            logger.error("Embedding request error (%s): %s", self.embedding_model, e)

        # Fallback: zero vector sized to the configured model so we don't
        # corrupt the index with a wrong-dimension vector (F-NEW-4).
        return [0.0] * self.embedding_dim
    
    async def get_by_id(
        self,
        entry_id: str,
        table_name: str = "default"
    ) -> Optional[Dict[str, Any]]:
        """Get entry by ID"""
        
        await self._ensure_initialized()
        
        if self.db is None:
            return None
        
        try:
            table = self.db.open_table(table_name)
            results = table.search().where(f"id = {_sql_literal(entry_id)}").to_list()
            return results[0] if results else None
        except Exception:
            return None
    
    async def delete(
        self,
        entry_id: str,
        table_name: str = "default"
    ) -> bool:
        """Delete entry by ID"""
        
        await self._ensure_initialized()
        
        if self.db is None:
            return False
        
        try:
            table = self.db.open_table(table_name)
            table.delete(f"id = {_sql_literal(entry_id)}")
            return True
        except Exception:
            return False
    
    async def delete_before(
        self,
        table_name: str,
        before: datetime
    ) -> int:
        """Delete entries older than a timestamp"""
        
        await self._ensure_initialized()
        
        if self.db is None:
            return 0
        
        try:
            table = self.db.open_table(table_name)
            before_str = before.isoformat()
            table.delete(f"created_at < {_sql_literal(before_str)}")
            return 1  # LanceDB doesn't return delete count
        except Exception:
            return 0
    
    async def list_rows(
        self,
        table_name: str,
        where: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """List rows via a real table scan (optionally filtered by a predicate).

        Replaces the old `search(query="*")` pseudo-scan that embedded a
        meaningless "*" vector and ran hybrid RRF just to enumerate rows.
        Returns raw row dicts (id/content/metadata/...).
        """
        await self._ensure_initialized()
        if self.db is None:
            return []
        try:
            table = self.db.open_table(table_name)
            query = table.search()  # no vector → plain scan in this LanceDB version
            if where:
                query = query.where(where)
            if limit:
                query = query.limit(limit)
            return query.to_list()
        except Exception:
            return []

    async def delete_where(self, table_name: str, where: str) -> bool:
        """Delete all rows matching a SQL predicate in a single operation.

        Callers must pass a safe predicate; use `_sql_literal()` for any value
        that derives from untrusted input.
        """
        await self._ensure_initialized()
        if self.db is None:
            return False
        try:
            table = self.db.open_table(table_name)
            table.delete(where)
            return True
        except Exception:
            return False

    async def clear_table(self, table_name: str) -> int:
        """Clear all entries from a table"""
        
        await self._ensure_initialized()
        
        if self.db is None:
            return 0
        
        try:
            self.db.drop_table(table_name)
            return 1
        except Exception:
            return 0
    
    async def update_metadata(
        self,
        entry_id: str,
        table_name: str,
        metadata: Dict[str, Any]
    ) -> bool:
        """Update metadata for an existing entry"""
        
        await self._ensure_initialized()
        
        if self.db is None:
            return False
        
        try:
            table = self.db.open_table(table_name)
            
            # Get existing entry
            results = table.search().where(f"id = {_sql_literal(entry_id)}").to_list()
            if not results:
                return False
            
            entry = results[0]
            
            # Update entry with new metadata
            updated_data = [{
                "id": entry_id,
                "content": entry.get("content"),
                "metadata": metadata,
                "vector": entry.get("vector"),
                "created_at": entry.get("created_at")
            }]
            
            # Delete old entry and add updated one
            table.delete(f"id = {_sql_literal(entry_id)}")
            table.add(updated_data)
            
            return True
        except Exception:
            return False
