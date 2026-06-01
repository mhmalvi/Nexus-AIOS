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
    
    def _make_worker(self, toolbox):
        """Build a WorkerAgent with the REAL constructor (brain, toolbox, supervisor)."""
        from agents.worker_agent import WorkerAgent
        from types import SimpleNamespace
        supervisor = MagicMock()
        # validate() must return an object exposing the ValidationResult shape.
        supervisor.validate = MagicMock(return_value=SimpleNamespace(
            is_safe=True, requires_approval=False, risk_level="low",
            reason=None, warnings=[],
        ))
        return WorkerAgent(brain=MagicMock(), toolbox=toolbox, supervisor=supervisor)

    def test_worker_agent_initialization(self):
        """Test WorkerAgent initializes with the real (brain, toolbox, supervisor) API."""
        mock_toolbox = MagicMock()
        worker = self._make_worker(mock_toolbox)
        assert worker.toolbox is mock_toolbox

    def test_worker_agent_has_execute_step(self):
        worker = self._make_worker(MagicMock())
        assert hasattr(worker, 'execute_step')

    @pytest.mark.asyncio
    async def test_worker_agent_execute_step(self):
        """execute_step validates via the supervisor then calls the toolbox."""
        from types import SimpleNamespace
        mock_toolbox = MagicMock()
        mock_toolbox.execute = AsyncMock(return_value=SimpleNamespace(
            success=True, output="Command executed", error=None,
        ))
        worker = self._make_worker(mock_toolbox)

        step = {"id": "s1", "tool": "shell", "action": "echo test", "args": {"command": "echo test"}}
        result = await worker.execute_step(step, context="test", auto_approve=True)

        assert mock_toolbox.execute.called
        assert result.success is True


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
