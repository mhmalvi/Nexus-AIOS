"""
AETHER QMD Manager -- Quick Memory Documents (Tier 2 Knowledge Memory)

Full-featured Tier 2 structured knowledge system. Each QMD is a Markdown
file with YAML frontmatter stored in ~/.aether/memory/qmd/.

Features:
- CRUD operations (create, read, update, delete)
- Hybrid search (keyword + BM25 scoring)
- Batch operations (bulk create/delete/export)
- Import/export (JSON, Markdown bundles)
- Auto-tagging based on content analysis
- Statistics and analytics
- Workspace-aware scoping (per-project knowledge bases)
- Access tracking and LRU ordering

Inspired by OpenClaw's memory/qmd-manager.ts
"""

import json
import logging
import math
import os
import re
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional, List, Dict, Any, Set

logger = logging.getLogger("aether.qmd")


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class QMDDocument:
    """A Quick Memory Document."""
    id: str
    title: str
    content: str
    tags: List[str] = field(default_factory=list)
    category: str = "general"
    workspace: str = "default"
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    access_count: int = 0
    word_count: int = 0
    pinned: bool = False
    source: str = ""  # where this doc originated (e.g., "conversation", "import")

    def __post_init__(self):
        if self.word_count == 0 and self.content:
            self.word_count = len(self.content.split())

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "QMDDocument":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class QMDSearchResult:
    """A search result with relevance scoring."""
    document: QMDDocument
    score: float
    matched_fields: List[str] = field(default_factory=list)
    snippet: str = ""


@dataclass
class QMDStats:
    """Statistics about the QMD collection."""
    total_documents: int = 0
    total_words: int = 0
    categories: Dict[str, int] = field(default_factory=dict)
    workspaces: Dict[str, int] = field(default_factory=dict)
    top_tags: List[tuple] = field(default_factory=list)
    oldest_doc: Optional[str] = None
    newest_doc: Optional[str] = None
    avg_doc_size: float = 0.0
    pinned_count: int = 0


# ---------------------------------------------------------------------------
# BM25 Scoring engine (lightweight, no external deps)
# ---------------------------------------------------------------------------

class BM25Scorer:
    """Lightweight BM25 scoring for QMD search (no numpy needed)."""

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self._k1 = k1
        self._b = b
        self._avg_dl = 0.0
        self._doc_freqs: Dict[str, int] = {}
        self._doc_count = 0
        self._doc_lengths: Dict[str, int] = {}  # doc_id -> word count
        self._term_freqs: Dict[str, Dict[str, int]] = {}  # doc_id -> {term: freq}

    def index(self, documents: Dict[str, QMDDocument]) -> None:
        """Build BM25 index from documents."""
        self._doc_freqs.clear()
        self._term_freqs.clear()
        self._doc_lengths.clear()
        self._doc_count = len(documents)

        if self._doc_count == 0:
            self._avg_dl = 0.0
            return

        total_length = 0
        for doc_id, doc in documents.items():
            text = f"{doc.title} {doc.content} {' '.join(doc.tags)}".lower()
            terms = re.findall(r'\w+', text)
            self._doc_lengths[doc_id] = len(terms)
            total_length += len(terms)

            tf = Counter(terms)
            self._term_freqs[doc_id] = dict(tf)

            unique_terms = set(terms)
            for term in unique_terms:
                self._doc_freqs[term] = self._doc_freqs.get(term, 0) + 1

        self._avg_dl = total_length / self._doc_count if self._doc_count else 0

    def score(self, query: str, doc_id: str) -> float:
        """Score a single document against a query."""
        query_terms = re.findall(r'\w+', query.lower())
        if not query_terms or doc_id not in self._term_freqs:
            return 0.0

        doc_len = self._doc_lengths.get(doc_id, 0)
        tf_map = self._term_freqs.get(doc_id, {})
        total_score = 0.0

        for term in query_terms:
            df = self._doc_freqs.get(term, 0)
            if df == 0:
                continue

            idf = math.log((self._doc_count - df + 0.5) / (df + 0.5) + 1.0)
            tf = tf_map.get(term, 0)
            denom = tf + self._k1 * (1 - self._b + self._b * doc_len / max(self._avg_dl, 1))
            total_score += idf * (tf * (self._k1 + 1)) / max(denom, 0.001)

        return total_score


# ---------------------------------------------------------------------------
# QMD Manager
# ---------------------------------------------------------------------------

class QMDManager:
    """
    Manages Quick Memory Documents (structured Tier 2 knowledge).

    Full-featured document manager with hybrid search, batch operations,
    statistics, and workspace-aware scoping.

    Usage:
        qmd = QMDManager()
        await qmd.initialize()
        doc_id = await qmd.create("Project Notes", "# Architecture\\n...", tags=["project"])
        results = await qmd.search("architecture")
        doc = await qmd.get(doc_id)
        await qmd.update(doc_id, content="# Updated\\n...")
        await qmd.delete(doc_id)
        all_docs = await qmd.list_all()
        stats = await qmd.get_stats()
        await qmd.export_all("/path/to/export.json")
        await qmd.import_from("/path/to/import.json")
    """

    def __init__(self, qmd_path: Optional[str] = None, workspace: str = "default"):
        self._path = Path(qmd_path or (Path.home() / ".aether" / "memory" / "qmd"))
        self._index_path = self._path / "_index.json"
        self._docs: Dict[str, QMDDocument] = {}
        self._loaded = False
        self._workspace = workspace
        self._bm25 = BM25Scorer()
        self._dirty = False  # track unsaved changes

    async def initialize(self) -> None:
        """Create directory and load existing index."""
        self._path.mkdir(parents=True, exist_ok=True)
        self._load_index()
        self._rebuild_search_index()
        self._loaded = True
        logger.info("QMD Manager initialized with %d documents (workspace: %s)",
                     len(self._docs), self._workspace)

    # ── CRUD ──────────────────────────────────────────────────────────────

    async def create(
        self, title: str, content: str,
        tags: Optional[List[str]] = None, category: str = "general",
        source: str = "user", pinned: bool = False,
    ) -> str:
        """Create a new QMD document. Returns document ID."""
        doc_id = f"qmd_{uuid.uuid4().hex[:10]}"
        auto_tags = self._auto_tag(content) if not tags else tags
        doc = QMDDocument(
            id=doc_id, title=title, content=content,
            tags=auto_tags, category=category,
            workspace=self._workspace, source=source,
            pinned=pinned,
        )
        self._docs[doc_id] = doc
        self._write_doc(doc)
        self._save_index()
        self._rebuild_search_index()
        logger.info("Created QMD '%s' [%s] (tags: %s)", title, doc_id, auto_tags)
        return doc_id

    async def get(self, doc_id: str) -> Optional[QMDDocument]:
        """Get a document by ID. Increments access count."""
        doc = self._docs.get(doc_id)
        if doc:
            doc.access_count += 1
            self._dirty = True
        return doc

    async def update(
        self, doc_id: str,
        title: Optional[str] = None,
        content: Optional[str] = None,
        tags: Optional[List[str]] = None,
        category: Optional[str] = None,
        pinned: Optional[bool] = None,
    ) -> bool:
        """Update an existing document. Returns True on success."""
        doc = self._docs.get(doc_id)
        if not doc:
            return False
        if title is not None:
            doc.title = title
        if content is not None:
            doc.content = content
            doc.word_count = len(content.split())
        if tags is not None:
            doc.tags = tags
        if category is not None:
            doc.category = category
        if pinned is not None:
            doc.pinned = pinned
        doc.updated_at = time.time()
        self._write_doc(doc)
        self._save_index()
        self._rebuild_search_index()
        return True

    async def delete(self, doc_id: str) -> bool:
        """Delete a document. Returns True on success."""
        doc = self._docs.pop(doc_id, None)
        if not doc:
            return False
        file_path = self._path / f"{doc_id}.md"
        file_path.unlink(missing_ok=True)
        self._save_index()
        self._rebuild_search_index()
        logger.info("Deleted QMD [%s]", doc_id)
        return True

    # ── Search ────────────────────────────────────────────────────────────

    async def search(
        self, query: str, limit: int = 10,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        workspace: Optional[str] = None,
    ) -> List[QMDSearchResult]:
        """
        Hybrid search: combines keyword matching with BM25 scoring.
        Optionally filter by category, tags, or workspace.
        """
        query_lower = query.lower()
        results: List[QMDSearchResult] = []

        for doc_id, doc in self._docs.items():
            # Filters
            if category and doc.category != category:
                continue
            if workspace and doc.workspace != workspace:
                continue
            if tags and not any(t in doc.tags for t in tags):
                continue

            # Keyword matching score
            keyword_score = 0.0
            matched_fields = []

            if query_lower in doc.title.lower():
                keyword_score += 5.0
                matched_fields.append("title")
            if query_lower in doc.content.lower():
                keyword_score += 1.0
                matched_fields.append("content")
            if any(query_lower in t.lower() for t in doc.tags):
                keyword_score += 3.0
                matched_fields.append("tags")

            # BM25 score
            bm25_score = self._bm25.score(query, doc_id)

            # Combined hybrid score (weighted blend)
            combined = keyword_score * 0.4 + bm25_score * 0.6

            if combined > 0:
                # Extract snippet around first match
                snippet = self._extract_snippet(doc.content, query, max_len=120)
                results.append(QMDSearchResult(
                    document=doc,
                    score=combined,
                    matched_fields=matched_fields,
                    snippet=snippet,
                ))

        results.sort(key=lambda r: r.score, reverse=True)
        return results[:limit]

    # ── Listing ───────────────────────────────────────────────────────────

    async def list_all(
        self, category: Optional[str] = None,
        workspace: Optional[str] = None,
        pinned_first: bool = True,
    ) -> List[QMDDocument]:
        """List all documents, optionally filtered by category or workspace."""
        docs = list(self._docs.values())
        if category:
            docs = [d for d in docs if d.category == category]
        if workspace:
            docs = [d for d in docs if d.workspace == workspace]
        if pinned_first:
            docs.sort(key=lambda d: (not d.pinned, -d.updated_at))
        else:
            docs.sort(key=lambda d: d.updated_at, reverse=True)
        return docs

    async def list_categories(self) -> List[str]:
        """Get all unique categories."""
        return list(set(d.category for d in self._docs.values()))

    async def list_tags(self) -> List[tuple]:
        """Get all tags with usage counts, sorted by frequency."""
        counter: Counter = Counter()
        for doc in self._docs.values():
            counter.update(doc.tags)
        return counter.most_common()

    # ── Batch Operations ──────────────────────────────────────────────────

    async def batch_create(self, documents: List[Dict[str, Any]]) -> List[str]:
        """Create multiple documents at once. Returns list of IDs."""
        ids = []
        for doc_data in documents:
            doc_id = await self.create(
                title=doc_data.get("title", "Untitled"),
                content=doc_data.get("content", ""),
                tags=doc_data.get("tags"),
                category=doc_data.get("category", "general"),
            )
            ids.append(doc_id)
        return ids

    async def batch_delete(self, doc_ids: List[str]) -> int:
        """Delete multiple documents. Returns count deleted."""
        deleted = 0
        for doc_id in doc_ids:
            if await self.delete(doc_id):
                deleted += 1
        return deleted

    async def batch_tag(self, doc_ids: List[str], tags: List[str]) -> int:
        """Add tags to multiple documents. Returns count updated."""
        updated = 0
        for doc_id in doc_ids:
            doc = self._docs.get(doc_id)
            if doc:
                new_tags = list(set(doc.tags + tags))
                if await self.update(doc_id, tags=new_tags):
                    updated += 1
        return updated

    # ── Import/Export ─────────────────────────────────────────────────────

    async def export_all(self, path: str) -> int:
        """Export all documents to a JSON file. Returns count exported."""
        data = {did: d.to_dict() for did, d in self._docs.items()}
        Path(path).write_text(json.dumps(data, indent=2), encoding="utf-8")
        logger.info("Exported %d QMDs to %s", len(data), path)
        return len(data)

    async def import_from(self, path: str, overwrite: bool = False) -> int:
        """Import documents from a JSON file. Returns count imported."""
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
        except Exception as e:
            logger.error("Failed to import QMDs from %s: %s", path, e)
            return 0

        imported = 0
        for did, d in data.items():
            if did in self._docs and not overwrite:
                continue
            doc = QMDDocument.from_dict(d)
            self._docs[doc.id] = doc
            self._write_doc(doc)
            imported += 1

        self._save_index()
        self._rebuild_search_index()
        logger.info("Imported %d QMDs from %s", imported, path)
        return imported

    # ── Statistics ────────────────────────────────────────────────────────

    async def get_stats(self) -> QMDStats:
        """Compute statistics about the QMD collection."""
        if not self._docs:
            return QMDStats()

        categories: Dict[str, int] = {}
        workspaces: Dict[str, int] = {}
        tag_counter: Counter = Counter()
        total_words = 0
        pinned = 0
        oldest = None
        newest = None

        for doc in self._docs.values():
            categories[doc.category] = categories.get(doc.category, 0) + 1
            workspaces[doc.workspace] = workspaces.get(doc.workspace, 0) + 1
            tag_counter.update(doc.tags)
            total_words += doc.word_count
            if doc.pinned:
                pinned += 1
            if oldest is None or doc.created_at < oldest[1]:
                oldest = (doc.id, doc.created_at)
            if newest is None or doc.created_at > newest[1]:
                newest = (doc.id, doc.created_at)

        return QMDStats(
            total_documents=len(self._docs),
            total_words=total_words,
            categories=categories,
            workspaces=workspaces,
            top_tags=tag_counter.most_common(20),
            oldest_doc=oldest[0] if oldest else None,
            newest_doc=newest[0] if newest else None,
            avg_doc_size=total_words / len(self._docs),
            pinned_count=pinned,
        )

    # ── Auto-tagging ──────────────────────────────────────────────────────

    def _auto_tag(self, content: str, max_tags: int = 5) -> List[str]:
        """Auto-generate tags from content using keyword extraction."""
        # Simple keyword extraction: find frequent meaningful words
        stopwords = {
            "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
            "have", "has", "had", "do", "does", "did", "will", "would", "could",
            "should", "may", "might", "must", "shall", "can", "to", "of", "in",
            "for", "on", "with", "at", "by", "from", "as", "into", "through",
            "during", "before", "after", "above", "below", "between", "out", "off",
            "over", "under", "again", "further", "then", "once", "it", "its",
            "this", "that", "these", "those", "and", "but", "or", "nor", "not",
            "so", "yet", "both", "each", "few", "more", "most", "other", "some",
            "such", "no", "only", "own", "same", "than", "too", "very", "just",
        }

        words = re.findall(r'\b[a-zA-Z]{3,}\b', content.lower())
        filtered = [w for w in words if w not in stopwords]
        counter = Counter(filtered)
        return [word for word, _ in counter.most_common(max_tags)]

    # ── Internal ──────────────────────────────────────────────────────────

    def _extract_snippet(self, content: str, query: str, max_len: int = 120) -> str:
        """Extract a text snippet around the first match of query."""
        idx = content.lower().find(query.lower())
        if idx == -1:
            return content[:max_len] + "..." if len(content) > max_len else content

        start = max(0, idx - 40)
        end = min(len(content), idx + len(query) + 80)
        snippet = content[start:end]
        if start > 0:
            snippet = "..." + snippet
        if end < len(content):
            snippet = snippet + "..."
        return snippet

    def _rebuild_search_index(self) -> None:
        """Rebuild the BM25 index."""
        self._bm25.index(self._docs)

    def _write_doc(self, doc: QMDDocument) -> None:
        """Write a QMD document as a Markdown file with YAML frontmatter."""
        file_path = self._path / f"{doc.id}.md"
        header = (
            f"---\n"
            f"title: {doc.title}\n"
            f"tags: {json.dumps(doc.tags)}\n"
            f"category: {doc.category}\n"
            f"workspace: {doc.workspace}\n"
            f"pinned: {json.dumps(doc.pinned)}\n"
            f"---\n\n"
        )
        file_path.write_text(header + doc.content, encoding="utf-8")

    def _save_index(self) -> None:
        """Persist the document index to JSON."""
        try:
            data = {did: d.to_dict() for did, d in self._docs.items()}
            self._index_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            self._dirty = False
        except Exception as e:
            logger.warning("Failed to save QMD index: %s", e)

    def _load_index(self) -> None:
        """Load the document index from JSON."""
        if not self._index_path.exists():
            return
        try:
            data = json.loads(self._index_path.read_text(encoding="utf-8"))
            for did, d in data.items():
                self._docs[did] = QMDDocument.from_dict(d)
        except Exception as e:
            logger.warning("Failed to load QMD index: %s", e)

    async def flush(self) -> None:
        """Force-save index if dirty."""
        if self._dirty:
            self._save_index()

    @property
    def document_count(self) -> int:
        return len(self._docs)

    @property
    def is_loaded(self) -> bool:
        return self._loaded
