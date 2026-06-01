"""
Nexus Document Indexer - Tier 3 Knowledge Base
Handles document chunking, embedding, and indexing for RAG retrieval.

Features:
- File chunking (text, markdown, code, PDF)
- Metadata extraction
- Batch directory indexing
- Progress tracking
"""

import asyncio
import hashlib
import logging
import mimetypes
import os
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable

logger = logging.getLogger(__name__)


class DocumentType(Enum):
    """Supported document types."""
    TEXT = "text"
    MARKDOWN = "markdown"
    CODE = "code"
    PDF = "pdf"
    HTML = "html"
    UNKNOWN = "unknown"


@dataclass
class DocumentChunk:
    """A chunk of a document for indexing."""
    id: str
    content: str
    document_id: str
    chunk_index: int
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    
@dataclass
class IndexResult:
    """Result of indexing operation."""
    success: bool
    document_id: str
    chunks_indexed: int
    file_path: str
    error: Optional[str] = None


@dataclass
class IndexProgress:
    """Progress of batch indexing."""
    total_files: int
    processed_files: int
    successful: int
    failed: int
    current_file: str = ""


class DocumentIndexer:
    """
    Document Indexer for Tier 3 Long-Term Memory.
    
    Handles:
    - Document chunking with overlap
    - Metadata extraction
    - Embedding generation
    - Storage in LanceDB
    
    Usage:
        indexer = DocumentIndexer(memory_store)
        result = await indexer.index_file("/path/to/doc.md")
        
        # Batch index
        results = await indexer.index_directory("/path/to/docs")
    """
    
    # Chunking configuration
    DEFAULT_CHUNK_SIZE = 1000  # Characters per chunk
    DEFAULT_CHUNK_OVERLAP = 200  # Overlap between chunks
    
    # File extension to document type mapping
    EXTENSION_MAP = {
        ".txt": DocumentType.TEXT,
        ".md": DocumentType.MARKDOWN,
        ".markdown": DocumentType.MARKDOWN,
        ".py": DocumentType.CODE,
        ".js": DocumentType.CODE,
        ".ts": DocumentType.CODE,
        ".jsx": DocumentType.CODE,
        ".tsx": DocumentType.CODE,
        ".rs": DocumentType.CODE,
        ".go": DocumentType.CODE,
        ".java": DocumentType.CODE,
        ".c": DocumentType.CODE,
        ".cpp": DocumentType.CODE,
        ".h": DocumentType.CODE,
        ".cs": DocumentType.CODE,
        ".rb": DocumentType.CODE,
        ".php": DocumentType.CODE,
        ".swift": DocumentType.CODE,
        ".kt": DocumentType.CODE,
        ".scala": DocumentType.CODE,
        ".sh": DocumentType.CODE,
        ".bash": DocumentType.CODE,
        ".ps1": DocumentType.CODE,
        ".sql": DocumentType.CODE,
        ".yaml": DocumentType.CODE,
        ".yml": DocumentType.CODE,
        ".json": DocumentType.CODE,
        ".xml": DocumentType.CODE,
        ".html": DocumentType.HTML,
        ".htm": DocumentType.HTML,
        ".pdf": DocumentType.PDF,
    }
    
    def __init__(
        self,
        store,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
        table_name: str = "long_term_memory",
        progress_callback: Optional[Callable[[IndexProgress], None]] = None
    ):
        self.store = store
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.table_name = table_name
        self.progress_callback = progress_callback
        
    def _get_document_type(self, file_path: str) -> DocumentType:
        """Determine document type from file extension."""
        ext = Path(file_path).suffix.lower()
        return self.EXTENSION_MAP.get(ext, DocumentType.UNKNOWN)
    
    def _generate_document_id(self, file_path: str) -> str:
        """Generate unique document ID from file path."""
        abs_path = os.path.abspath(file_path)
        return hashlib.md5(abs_path.encode()).hexdigest()[:16]
    
    def _generate_chunk_id(self, document_id: str, chunk_index: int) -> str:
        """Generate unique chunk ID."""
        return f"{document_id}_{chunk_index:04d}"
    
    async def _read_file(self, file_path: str) -> str:
        """Read file content."""
        doc_type = self._get_document_type(file_path)
        
        if doc_type == DocumentType.PDF:
            return await self._read_pdf(file_path)
        
        # Text-based files
        encodings = ["utf-8", "latin-1", "cp1252"]
        for encoding in encodings:
            try:
                with open(file_path, "r", encoding=encoding) as f:
                    return f.read()
            except UnicodeDecodeError:
                continue
        
        raise ValueError(f"Could not decode file: {file_path}")
    
    async def _read_pdf(self, file_path: str) -> str:
        """Read PDF file content."""
        try:
            import pypdf
            reader = pypdf.PdfReader(file_path)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
            return text
        except ImportError:
            logger.warning("pypdf not installed, skipping PDF")
            raise ValueError("PDF support requires pypdf: pip install pypdf")
        except Exception as e:
            raise ValueError(f"Failed to read PDF: {e}")
    
    def _chunk_text(self, text: str, doc_type: DocumentType) -> List[str]:
        """Split text into overlapping chunks."""
        if doc_type == DocumentType.CODE:
            return self._chunk_code(text)
        
        return self._chunk_by_size(text)
    
    def _chunk_by_size(self, text: str) -> List[str]:
        """Chunk text by size with overlap."""
        chunks = []
        start = 0
        text_len = len(text)
        
        while start < text_len:
            end = start + self.chunk_size
            
            # Try to break at paragraph/sentence boundary
            if end < text_len:
                # Look for paragraph break
                para_break = text.rfind("\n\n", start, end)
                if para_break > start + self.chunk_size // 2:
                    end = para_break + 2
                else:
                    # Look for sentence break
                    for punct in [". ", "! ", "? ", "\n"]:
                        sent_break = text.rfind(punct, start, end)
                        if sent_break > start + self.chunk_size // 2:
                            end = sent_break + len(punct)
                            break
            
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            
            # Move start with overlap
            start = max(start + 1, end - self.chunk_overlap)
        
        return chunks
    
    def _chunk_code(self, text: str) -> List[str]:
        """Chunk code by functions/classes when possible."""
        lines = text.split("\n")
        chunks = []
        current_chunk = []
        current_size = 0
        
        for line in lines:
            line_with_newline = line + "\n"
            current_chunk.append(line)
            current_size += len(line_with_newline)
            
            # Check for natural break points (empty line, function/class def)
            is_break_point = (
                line.strip() == "" or
                line.strip().startswith("def ") or
                line.strip().startswith("class ") or
                line.strip().startswith("function ") or
                line.strip().startswith("async ") or
                line.strip().startswith("pub ") or
                line.strip().startswith("fn ")
            )
            
            if current_size >= self.chunk_size and is_break_point:
                chunk_text = "\n".join(current_chunk).strip()
                if chunk_text:
                    chunks.append(chunk_text)
                # Keep overlap
                overlap_lines = current_chunk[-5:] if len(current_chunk) > 5 else []
                current_chunk = overlap_lines
                current_size = sum(len(l) + 1 for l in current_chunk)
        
        # Add remaining chunk
        if current_chunk:
            chunk_text = "\n".join(current_chunk).strip()
            if chunk_text:
                chunks.append(chunk_text)
        
        return chunks
    
    def _extract_metadata(self, file_path: str) -> Dict[str, Any]:
        """Extract metadata from file."""
        path = Path(file_path)
        stat = path.stat()
        
        return {
            "file_name": path.name,
            "file_path": str(path.absolute()),
            "file_extension": path.suffix.lower(),
            "file_size": stat.st_size,
            "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "document_type": self._get_document_type(file_path).value,
            "indexed_at": datetime.utcnow().isoformat()
        }
    
    async def index_file(self, file_path: str) -> IndexResult:
        """
        Index a single file to Tier 3 memory.
        
        Args:
            file_path: Path to the file to index
            
        Returns:
            IndexResult with status and chunk count
        """
        try:
            # Validate file exists
            if not os.path.exists(file_path):
                return IndexResult(
                    success=False,
                    document_id="",
                    chunks_indexed=0,
                    file_path=file_path,
                    error=f"File not found: {file_path}"
                )
            
            # Check file type
            doc_type = self._get_document_type(file_path)
            if doc_type == DocumentType.UNKNOWN:
                return IndexResult(
                    success=False,
                    document_id="",
                    chunks_indexed=0,
                    file_path=file_path,
                    error=f"Unsupported file type: {Path(file_path).suffix}"
                )
            
            # Generate document ID
            doc_id = self._generate_document_id(file_path)
            
            # Read file content
            content = await self._read_file(file_path)
            
            # Skip empty files
            if not content.strip():
                return IndexResult(
                    success=False,
                    document_id=doc_id,
                    chunks_indexed=0,
                    file_path=file_path,
                    error="File is empty"
                )
            
            # Extract metadata
            metadata = self._extract_metadata(file_path)
            metadata["document_id"] = doc_id
            
            # Chunk the content
            chunks = self._chunk_text(content, doc_type)
            
            # Delete existing chunks for this document (re-index)
            await self._delete_document_chunks(doc_id)
            
            # Index each chunk
            for i, chunk_content in enumerate(chunks):
                chunk_id = self._generate_chunk_id(doc_id, i)
                chunk_metadata = {
                    **metadata,
                    "chunk_id": chunk_id,
                    "chunk_index": i,
                    "total_chunks": len(chunks)
                }
                
                await self.store.add(
                    content=chunk_content,
                    metadata=chunk_metadata,
                    table_name=self.table_name
                )
            
            logger.info(f"Indexed {file_path}: {len(chunks)} chunks")
            
            return IndexResult(
                success=True,
                document_id=doc_id,
                chunks_indexed=len(chunks),
                file_path=file_path
            )
            
        except Exception as e:
            logger.error(f"Failed to index {file_path}: {e}")
            return IndexResult(
                success=False,
                document_id="",
                chunks_indexed=0,
                file_path=file_path,
                error=str(e)
            )
    
    async def _delete_document_chunks(self, document_id: str):
        """Delete existing chunks for a document."""
        try:
            # Search for chunks with this document_id
            results = await self.store.search(
                query="*",
                table_name=self.table_name,
                limit=1000,
                use_hybrid=False
            )
            
            for r in results:
                if r.get("metadata", {}).get("document_id") == document_id:
                    await self.store.delete(r["id"], self.table_name)
                    
        except Exception as e:
            logger.debug(f"Could not delete existing chunks: {e}")
    
    async def index_directory(
        self,
        directory_path: str,
        recursive: bool = True,
        extensions: Optional[List[str]] = None
    ) -> List[IndexResult]:
        """
        Index all files in a directory.
        
        Args:
            directory_path: Path to directory
            recursive: Whether to recurse into subdirectories
            extensions: Optional list of extensions to include (e.g., [".py", ".md"])
            
        Returns:
            List of IndexResult for each file
        """
        results = []
        files_to_index = []
        
        # Collect files
        path = Path(directory_path)
        if recursive:
            pattern = "**/*"
        else:
            pattern = "*"
        
        for file_path in path.glob(pattern):
            if not file_path.is_file():
                continue
            
            # Filter by extension if specified
            if extensions:
                if file_path.suffix.lower() not in extensions:
                    continue
            else:
                # Use default supported extensions
                if file_path.suffix.lower() not in self.EXTENSION_MAP:
                    continue
            
            # Skip hidden files and common ignore patterns
            if any(part.startswith(".") for part in file_path.parts):
                continue
            if any(ignore in str(file_path) for ignore in ["node_modules", "__pycache__", ".git", "venv"]):
                continue
            
            files_to_index.append(str(file_path))
        
        # Initialize progress
        progress = IndexProgress(
            total_files=len(files_to_index),
            processed_files=0,
            successful=0,
            failed=0
        )
        
        # Index each file
        for file_path in files_to_index:
            progress.current_file = file_path
            
            if self.progress_callback:
                self.progress_callback(progress)
            
            result = await self.index_file(file_path)
            results.append(result)
            
            progress.processed_files += 1
            if result.success:
                progress.successful += 1
            else:
                progress.failed += 1
        
        # Final progress update
        if self.progress_callback:
            self.progress_callback(progress)
        
        logger.info(
            f"Indexed directory {directory_path}: "
            f"{progress.successful} succeeded, {progress.failed} failed"
        )
        
        return results
    
    async def get_indexed_documents(self) -> List[Dict[str, Any]]:
        """Get list of indexed documents with metadata."""
        try:
            results = await self.store.search(
                query="*",
                table_name=self.table_name,
                limit=10000,
                use_hybrid=False
            )
            
            # Group by document_id
            documents = {}
            for r in results:
                doc_id = r.get("metadata", {}).get("document_id")
                if doc_id and doc_id not in documents:
                    documents[doc_id] = {
                        "document_id": doc_id,
                        "file_name": r.get("metadata", {}).get("file_name"),
                        "file_path": r.get("metadata", {}).get("file_path"),
                        "indexed_at": r.get("metadata", {}).get("indexed_at"),
                        "total_chunks": r.get("metadata", {}).get("total_chunks", 1)
                    }
            
            return list(documents.values())
            
        except Exception as e:
            logger.error(f"Failed to get indexed documents: {e}")
            return []
    
    async def delete_document(self, document_id: str) -> bool:
        """Delete all chunks for a document."""
        try:
            await self._delete_document_chunks(document_id)
            logger.info(f"Deleted document: {document_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete document {document_id}: {e}")
            return False
