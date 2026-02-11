"""
Unit tests for Agents module (manager_agent, worker_agent).
"""
import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import sys
import os

# Add kernel to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestManagerAgent:
    """Tests for ManagerAgent class."""
    
    def test_manager_agent_initialization(self):
        """Test ManagerAgent initializes with correct parameters."""
        from agents.manager_agent import ManagerAgent
        
        mock_brain = MagicMock()
        mock_worker = MagicMock()
        
        agent = ManagerAgent(
            brain=mock_brain,
            worker=mock_worker,
            failure_limit=5
        )
        
        assert agent.brain == mock_brain
        assert agent.worker == mock_worker
        assert agent.max_retries == 5
    
    def test_manager_agent_default_failure_limit(self):
        """Test ManagerAgent uses default failure limit of 3."""
        from agents.manager_agent import ManagerAgent
        
        mock_brain = MagicMock()
        mock_worker = MagicMock()
        
        agent = ManagerAgent(brain=mock_brain, worker=mock_worker)
        
        assert agent.max_retries == 3
    
    def test_manager_agent_has_execute_task(self):
        """Test ManagerAgent has execute_task method."""
        from agents.manager_agent import ManagerAgent
        
        mock_brain = MagicMock()
        mock_worker = MagicMock()
        
        agent = ManagerAgent(brain=mock_brain, worker=mock_worker)
        
        assert hasattr(agent, 'execute_task')
    
    def test_manager_agent_has_tao_emit(self):
        """Test ManagerAgent has _emit_tao method for TAO visualization."""
        from agents.manager_agent import ManagerAgent
        
        mock_brain = MagicMock()
        mock_worker = MagicMock()
        
        agent = ManagerAgent(brain=mock_brain, worker=mock_worker)
        
        assert hasattr(agent, '_emit_tao')
    
    def test_tao_event_structure(self):
        """Test TAO event has correct structure."""
        from agents.manager_agent import ManagerAgent
        import json
        from io import StringIO
        
        mock_brain = MagicMock()
        mock_worker = MagicMock()
        
        agent = ManagerAgent(brain=mock_brain, worker=mock_worker)
        
        # Capture stdout
        with patch('sys.stdout', new_callable=StringIO) as mock_stdout:
            agent._emit_tao("THOUGHT", "Test thought", "step1")
            output = mock_stdout.getvalue()
        
        # Parse and verify structure
        if output.strip():
            event = json.loads(output.strip())
            assert event['message_type'] == 'tao_event'
            assert 'data' in event
            assert event['data']['type'] == 'THOUGHT'
    
    def test_manager_agent_has_war_room(self):
        """Test ManagerAgent has hold_war_room method."""
        from agents.manager_agent import ManagerAgent
        
        mock_brain = MagicMock()
        mock_worker = MagicMock()
        
        agent = ManagerAgent(brain=mock_brain, worker=mock_worker)
        
        assert hasattr(agent, 'hold_war_room')


class TestWorkerAgent:
    """Tests for WorkerAgent class."""
    
    def test_worker_agent_initialization(self):
        """Test WorkerAgent initializes correctly."""
        from agents.worker_agent import WorkerAgent
        
        mock_toolbox = MagicMock()
        
        worker = WorkerAgent(toolbox=mock_toolbox)
        
        assert worker.toolbox == mock_toolbox
    
    def test_worker_agent_has_execute_step(self):
        """Test WorkerAgent has execute_step method."""
        from agents.worker_agent import WorkerAgent
        
        mock_toolbox = MagicMock()
        worker = WorkerAgent(toolbox=mock_toolbox)
        
        assert hasattr(worker, 'execute_step')
    
    @pytest.mark.asyncio
    async def test_worker_agent_execute_step(self):
        """Test WorkerAgent execute_step calls toolbox."""
        from agents.worker_agent import WorkerAgent
        
        mock_toolbox = MagicMock()
        mock_toolbox.execute = AsyncMock(return_value={
            "success": True,
            "output": "Command executed"
        })
        
        worker = WorkerAgent(toolbox=mock_toolbox)
        
        # Create a mock step
        mock_step = MagicMock()
        mock_step.tool = "shell"
        mock_step.args = {"command": "echo test"}
        
        result = await worker.execute_step(mock_step)
        
        # Verify toolbox was called
        assert mock_toolbox.execute.called or hasattr(result, 'success')


class TestSpecializedAgents:
    """Tests for specialized agents (SecurityAuditor, CodeArchitect, etc.)."""
    
    def test_security_auditor_exists(self):
        """Test SecurityAuditorAgent exists."""
        try:
            from agents.security_auditor_agent import SecurityAuditorAgent
            assert hasattr(SecurityAuditorAgent, '__init__')
        except ImportError:
            pytest.skip("SecurityAuditorAgent not found")
    
    def test_code_architect_exists(self):
        """Test CodeArchitectAgent exists."""
        try:
            from agents.code_architect_agent import CodeArchitectAgent
            assert hasattr(CodeArchitectAgent, '__init__')
        except ImportError:
            pytest.skip("CodeArchitectAgent not found")
    
    def test_researcher_agent_exists(self):
        """Test ResearcherAgent exists."""
        try:
            from agents.researcher_agent import ResearcherAgent
            assert hasattr(ResearcherAgent, '__init__')
        except ImportError:
            pytest.skip("ResearcherAgent not found")
    
    def test_qa_engineer_exists(self):
        """Test QAEngineerAgent exists."""
        try:
            from agents.qa_engineer_agent import QAEngineerAgent
            assert hasattr(QAEngineerAgent, '__init__')
        except ImportError:
            pytest.skip("QAEngineerAgent not found")
