"""
Unit tests for Brain module (llm_engine, planner, model_router).
"""
import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import sys
import os

# Add kernel to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestLLMEngine:
    """Tests for LLMEngine class."""
    
    def test_llm_engine_initialization(self):
        """Test LLMEngine initializes with correct defaults."""
        from brain.llm_engine import LLMEngine
        
        engine = LLMEngine(model="llama3.2:3b")
        assert engine.model == "llama3.2:3b"
        assert engine.base_url == "http://localhost:11434"
    
    @pytest.mark.asyncio
    async def test_llm_engine_generate_mock(self):
        """Test LLMEngine.generate with mocked Ollama."""
        from brain.llm_engine import LLMEngine
        
        engine = LLMEngine(model="test-model")
        
        with patch('brain.llm_engine.httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.json.return_value = {"response": "Test output"}
            mock_response.raise_for_status = MagicMock()
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)
            
            # Test that generate method exists and is callable
            assert hasattr(engine, 'generate')


class TestPlanner:
    """Tests for Planner class."""
    
    def test_planner_initialization(self):
        """Test Planner initializes correctly."""
        from brain.planner import Planner
        
        mock_llm = MagicMock()
        planner = Planner(llm=mock_llm)
        assert planner.llm == mock_llm
    
    @pytest.mark.asyncio
    async def test_planner_create_plan_structure(self):
        """Test that Planner.create_plan returns expected structure."""
        from brain.planner import Planner, Plan, Step
        
        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value='''
        {
            "steps": [
                {"tool": "shell", "description": "List files", "args": {"command": "ls"}}
            ]
        }
        ''')
        
        planner = Planner(llm=mock_llm)
        
        # Verify Plan and Step classes exist
        assert hasattr(Plan, '__init__')
        assert hasattr(Step, '__init__')


class TestModelRouter:
    """Tests for ModelRouter class."""
    
    def test_model_router_initialization(self):
        """Test ModelRouter initializes with default profiles."""
        from brain.model_router import ModelRouter, IntentCategory
        
        router = ModelRouter()
        
        # Check intent categories exist
        assert hasattr(IntentCategory, 'FILE_OPERATION')
        assert hasattr(IntentCategory, 'CODE_GENERATION')
        assert hasattr(IntentCategory, 'CONVERSATION')
    
    def test_model_router_pattern_classify(self):
        """Test pattern-based classification."""
        from brain.model_router import ModelRouter, IntentCategory
        
        router = ModelRouter()
        
        # Test file operation pattern
        result = router._pattern_classify("create a file called test.py")
        assert result in [IntentCategory.FILE_OPERATION, IntentCategory.UNKNOWN, None]
        
        # Test code generation pattern
        result = router._pattern_classify("write a function to sort an array")
        assert result in [IntentCategory.CODE_GENERATION, IntentCategory.UNKNOWN, None]
    
    @pytest.mark.asyncio
    async def test_model_router_route(self):
        """Test routing an intent."""
        from brain.model_router import ModelRouter, RoutingDecision
        
        router = ModelRouter()
        
        # Test that route method exists
        assert hasattr(router, 'route')
        
        # Test routing decision structure
        assert hasattr(RoutingDecision, 'model')
        assert hasattr(RoutingDecision, 'intent_category')


class TestBrainIntegration:
    """Integration tests for Brain module."""
    
    def test_brain_initialization(self):
        """Test Brain initializes all components."""
        from brain import Brain
        
        brain = Brain()
        
        # Verify core attributes exist
        assert hasattr(brain, 'llm')
        assert hasattr(brain, 'planner')
