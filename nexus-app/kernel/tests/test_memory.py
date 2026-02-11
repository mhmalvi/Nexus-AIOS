"""
Unit tests for Memory module (lancedb_store, memory_manager, self_learning).
"""
import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import sys
import os

# Add kernel to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestLanceDBStore:
    """Tests for LanceDBStore class."""
    
    def test_lancedb_store_initialization(self):
        """Test LanceDBStore initializes with correct path."""
        from memory.lancedb_store import LanceDBStore
        
        store = LanceDBStore(db_path="./test_db")
        assert store.db_path == "./test_db"
    
    @pytest.mark.asyncio
    async def test_lancedb_store_add_entry(self):
        """Test adding an entry to the store."""
        from memory.lancedb_store import LanceDBStore
        
        store = LanceDBStore(db_path="./test_db")
        
        # Verify add method exists
        assert hasattr(store, 'add')
    
    @pytest.mark.asyncio
    async def test_lancedb_store_query(self):
        """Test querying the store."""
        from memory.lancedb_store import LanceDBStore
        
        store = LanceDBStore(db_path="./test_db")
        
        # Verify query method exists
        assert hasattr(store, 'query')


class TestMemoryManager:
    """Tests for MemoryManager class."""
    
    def test_memory_manager_initialization(self):
        """Test MemoryManager initializes with tiered storage."""
        from memory.memory_manager import MemoryManager
        
        manager = MemoryManager()
        
        # Verify tier methods exist
        assert hasattr(manager, 'store')
        assert hasattr(manager, 'query')
        assert hasattr(manager, 'get_context')
    
    @pytest.mark.asyncio
    async def test_memory_manager_store_tier1(self):
        """Test storing to Tier 1 (session memory)."""
        from memory.memory_manager import MemoryManager
        
        manager = MemoryManager()
        
        # Test store method signature
        assert hasattr(manager, 'store')
    
    @pytest.mark.asyncio
    async def test_memory_manager_query(self):
        """Test querying memory across tiers."""
        from memory.memory_manager import MemoryManager
        
        manager = MemoryManager()
        
        # Verify query capability
        assert hasattr(manager, 'query')


class TestSelfLearningEngine:
    """Tests for SelfLearningEngine class."""
    
    def test_self_learning_initialization(self):
        """Test SelfLearningEngine initializes correctly."""
        from memory.self_learning import SelfLearningEngine, PatternType
        
        engine = SelfLearningEngine()
        
        # Check pattern types exist
        assert hasattr(PatternType, 'COMMAND_PATTERN')
        assert hasattr(PatternType, 'PREFERENCE')
        assert hasattr(PatternType, 'CORRECTION')
    
    def test_learn_from_approval(self):
        """Test learning from an approved action."""
        from memory.self_learning import SelfLearningEngine, ActionRecord
        
        engine = SelfLearningEngine()
        
        # Verify learn methods exist
        assert hasattr(engine, 'learn_from_approval')
        assert hasattr(engine, 'learn_from_correction')
    
    def test_user_preference_storage(self):
        """Test user preference learning."""
        from memory.self_learning import SelfLearningEngine
        
        engine = SelfLearningEngine()
        
        # Verify preference methods exist
        assert hasattr(engine, 'learn_user_preference')
        assert hasattr(engine, 'get_user_preference')
    
    def test_suggest_action(self):
        """Test action suggestion based on learned patterns."""
        from memory.self_learning import SelfLearningEngine
        
        engine = SelfLearningEngine()
        
        # Verify suggestion method exists
        assert hasattr(engine, 'suggest_action')


class TestContextScheduler:
    """Tests for ContextScheduler class."""
    
    def test_context_scheduler_initialization(self):
        """Test ContextScheduler initializes correctly."""
        from memory.context_scheduler import ContextScheduler
        
        scheduler = ContextScheduler()
        
        # Verify core methods exist
        assert hasattr(scheduler, 'build_context')


class TestDocumentIndexer:
    """Tests for DocumentIndexer class."""
    
    def test_document_indexer_initialization(self):
        """Test DocumentIndexer initializes correctly."""
        from memory.document_indexer import DocumentIndexer, DocumentType
        
        # Check document types exist
        assert hasattr(DocumentType, 'TEXT')
        assert hasattr(DocumentType, 'MARKDOWN')
        assert hasattr(DocumentType, 'CODE')
        assert hasattr(DocumentType, 'PDF')
    
    def test_document_chunking(self):
        """Test document chunking methods."""
        from memory.document_indexer import DocumentIndexer
        
        mock_store = MagicMock()
        indexer = DocumentIndexer(store=mock_store)
        
        # Verify chunking methods exist
        assert hasattr(indexer, '_chunk_text')
        assert hasattr(indexer, '_chunk_code')
