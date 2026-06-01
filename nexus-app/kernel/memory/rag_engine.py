"""
Nexus RAG Engine - Retrieval Augmented Generation
Combines retrieval with reranking for optimal context injection
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass


@dataclass
class RAGResult:
    """Result from RAG retrieval"""
    query: str
    results: List[Dict[str, Any]]
    total_retrieved: int
    reranked: bool


class RAGEngine:
    """
    RAG Engine - Retrieval Augmented Generation
    
    Pipeline:
    1. Query expansion
    2. Multi-source retrieval
    3. Reranking
    4. Context assembly
    """
    
    def __init__(self, store, reranker=None):
        self.store = store
        self.reranker = reranker
    
    async def retrieve(
        self,
        query: str,
        limit: int = 5,
        expand_query: bool = True,
        use_reranking: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Retrieve relevant context for a query
        
        Steps:
        1. Optionally expand query with synonyms/related terms
        2. Search across memory tiers
        3. Optionally rerank results
        4. Return top results
        """
        
        # Query expansion (simplified)
        queries = [query]
        if expand_query:
            expanded = self._expand_query(query)
            queries.extend(expanded)
        
        # Retrieve from all tiers
        all_results = []
        for q in queries:
            # Long-term memory (knowledge base)
            long_term = await self.store.search(
                query=q,
                table_name="long_term_memory",
                limit=limit * 2
            )
            all_results.extend(long_term)
            
            # Short-term memory (recent events)
            short_term = await self.store.search(
                query=q,
                table_name="short_term_memory",
                limit=limit
            )
            all_results.extend(short_term)
        
        # Deduplicate by ID
        seen = set()
        unique_results = []
        for r in all_results:
            if r["id"] not in seen:
                seen.add(r["id"])
                unique_results.append(r)
        
        # Rerank if available
        if use_reranking and self.reranker:
            unique_results = await self._rerank(query, unique_results)
        else:
            # Fallback: sort by score
            unique_results.sort(key=lambda x: x.get("score", 0), reverse=True)
        
        return unique_results[:limit]
    
    def _expand_query(self, query: str) -> List[str]:
        """
        Expand query with related terms
        
        In production, could use:
        - WordNet synonyms
        - LLM-generated expansions
        - Query history patterns
        """
        
        expansions = []
        
        # Simple keyword extraction and reformulation
        words = query.lower().split()
        
        # Add question variations
        if words and words[0] in ["what", "how", "why", "when", "where"]:
            # Remove question word for broader search
            expansions.append(" ".join(words[1:]))
        
        # Add key terms only (remove stop words)
        stop_words = {"the", "a", "an", "is", "are", "was", "were", "to", "for", "of", "in", "on"}
        key_terms = [w for w in words if w not in stop_words]
        if key_terms and len(key_terms) < len(words):
            expansions.append(" ".join(key_terms))
        
        return expansions
    
    async def _rerank(
        self,
        query: str,
        results: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Rerank results using a cross-encoder or LLM
        
        Uses linear combination of:
        - Original search score
        - Semantic similarity (if reranker available)
        """
        
        if not self.reranker:
            return results
        
        # Get reranker scores
        rerank_scores = await self.reranker.score(
            query=query,
            documents=[r.get("content", "") for r in results]
        )
        
        # Combine scores (linear combination)
        alpha = 0.4  # Weight for original score
        beta = 0.6   # Weight for reranker score
        
        for i, result in enumerate(results):
            original_score = result.get("score", 0.5)
            rerank_score = rerank_scores[i] if i < len(rerank_scores) else 0.5
            
            result["combined_score"] = alpha * original_score + beta * rerank_score
        
        # Sort by combined score
        results.sort(key=lambda x: x.get("combined_score", 0), reverse=True)
        
        return results
    
    async def retrieve_with_metadata(
        self,
        query: str,
        metadata_filter: Dict[str, Any],
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Retrieve with metadata filtering"""
        
        # Get broader results first
        results = await self.retrieve(query, limit=limit * 2)
        
        # Filter by metadata
        filtered = []
        for r in results:
            metadata = r.get("metadata", {})
            matches = all(
                metadata.get(k) == v
                for k, v in metadata_filter.items()
            )
            if matches:
                filtered.append(r)
        
        return filtered[:limit]
