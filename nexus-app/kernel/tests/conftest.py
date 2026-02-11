"""
Pytest fixtures for Nexus Kernel unit tests.
"""
import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock


@pytest.fixture
def event_loop():
    """Create an event loop for async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_llm():
    """Mock LLM engine for testing."""
    llm = MagicMock()
    llm.generate = AsyncMock(return_value="Test response from LLM")
    llm.generate_stream = AsyncMock(return_value=iter(["Test ", "response"]))
    return llm


@pytest.fixture
def mock_toolbox():
    """Mock Toolbox for testing."""
    toolbox = MagicMock()
    toolbox.execute = AsyncMock(return_value={
        "success": True,
        "output": "Command executed successfully",
        "error": None
    })
    toolbox.tools = {
        "shell": {"description": "Execute shell commands"},
        "file": {"description": "File operations"}
    }
    return toolbox


@pytest.fixture
def mock_memory():
    """Mock Memory Manager for testing."""
    memory = MagicMock()
    memory.store = AsyncMock(return_value="entry_123")
    memory.query = AsyncMock(return_value=[
        {"content": "Test memory", "score": 0.95}
    ])
    memory.get_context = AsyncMock(return_value={
        "recent": ["Recent context"],
        "relevant": ["Relevant context"]
    })
    return memory


@pytest.fixture
def mock_brain(mock_llm):
    """Mock Brain for testing."""
    brain = MagicMock()
    brain.llm = mock_llm
    brain.plan = AsyncMock(return_value=MagicMock(
        steps=[
            MagicMock(id="step1", tool="shell", description="Test step", args={"command": "echo test"})
        ]
    ))
    brain.generate = AsyncMock(return_value="Generated response")
    return brain
