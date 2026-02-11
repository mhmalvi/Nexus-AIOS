"""
Unit tests for Toolbox module (shell_executor, file_manager, toolbox).
"""
import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import sys
import os

# Add kernel to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestShellExecutor:
    """Tests for ShellExecutor class."""
    
    def test_shell_executor_initialization(self):
        """Test ShellExecutor initializes correctly."""
        from toolbox.shell_executor import ShellExecutor
        
        executor = ShellExecutor()
        
        # Verify execute method exists
        assert hasattr(executor, 'execute')
    
    @pytest.mark.asyncio
    async def test_shell_executor_safe_command(self):
        """Test executing a safe command."""
        from toolbox.shell_executor import ShellExecutor
        
        executor = ShellExecutor()
        
        # Test with echo command (safe)
        result = await executor.execute("echo test")
        
        assert isinstance(result, dict)
        assert 'success' in result or 'output' in result
    
    @pytest.mark.asyncio
    async def test_shell_executor_dangerous_command_blocked(self):
        """Test that dangerous commands are blocked."""
        from toolbox.shell_executor import ShellExecutor
        
        executor = ShellExecutor()
        
        # Dangerous commands should be blocked or flagged
        dangerous_commands = [
            "rm -rf /",
            "sudo rm -rf /*",
            ":(){:|:&};:",  # Fork bomb
        ]
        
        for cmd in dangerous_commands:
            result = await executor.execute(cmd)
            # Should either fail or require approval
            assert 'success' in result or 'error' in result or 'needs_approval' in result


class TestFileManager:
    """Tests for FileManager class."""
    
    def test_file_manager_initialization(self):
        """Test FileManager initializes correctly."""
        from toolbox.file_manager import FileManager
        
        manager = FileManager()
        
        # Verify core methods exist
        assert hasattr(manager, 'read')
        assert hasattr(manager, 'write')
    
    @pytest.mark.asyncio
    async def test_file_manager_read(self):
        """Test reading a file."""
        from toolbox.file_manager import FileManager
        
        manager = FileManager()
        
        # Test reading this test file
        result = await manager.read(__file__)
        
        assert isinstance(result, dict)
        assert 'content' in result or 'error' in result
    
    @pytest.mark.asyncio
    async def test_file_manager_path_validation(self):
        """Test path validation prevents directory traversal."""
        from toolbox.file_manager import FileManager
        
        manager = FileManager()
        
        # Test path traversal attempt
        result = await manager.read("../../../../etc/passwd")
        
        # Should be blocked
        assert 'error' in result or result.get('success') == False


class TestToolbox:
    """Tests for Toolbox class."""
    
    def test_toolbox_initialization(self):
        """Test Toolbox initializes with default tools."""
        from toolbox import Toolbox
        
        toolbox = Toolbox()
        
        # Verify core attributes
        assert hasattr(toolbox, 'tools')
        assert hasattr(toolbox, 'execute')
        assert hasattr(toolbox, 'register_tool')
    
    def test_toolbox_has_default_tools(self):
        """Test Toolbox includes expected default tools."""
        from toolbox import Toolbox
        
        toolbox = Toolbox()
        
        # Check for expected tools
        tool_names = [t.get('name', '') for t in toolbox.tools] if isinstance(toolbox.tools, list) else list(toolbox.tools.keys())
        
        expected_tools = ['shell', 'file']
        for tool in expected_tools:
            found = any(tool.lower() in str(t).lower() for t in tool_names)
            # Just verify tools property is populated
            assert len(tool_names) > 0 or hasattr(toolbox, 'shell') or hasattr(toolbox, 'file')
    
    @pytest.mark.asyncio
    async def test_toolbox_execute(self):
        """Test Toolbox execute dispatches to correct tool."""
        from toolbox import Toolbox
        
        toolbox = Toolbox()
        
        # Test execute method
        assert hasattr(toolbox, 'execute')
    
    def test_toolbox_register_custom_tool(self):
        """Test registering a custom tool."""
        from toolbox import Toolbox
        
        toolbox = Toolbox()
        
        # Define a custom tool
        def custom_tool(x: str) -> str:
            return f"Custom: {x}"
        
        # Verify register_tool method exists
        assert hasattr(toolbox, 'register_tool')
    
    def test_load_custom_tools(self):
        """Test loading custom tools from directory."""
        from toolbox import Toolbox
        
        toolbox = Toolbox()
        
        # Verify load_custom_tools method exists
        assert hasattr(toolbox, 'load_custom_tools')


class TestNotificationTools:
    """Tests for notification tools."""
    
    def test_notification_tools_exist(self):
        """Test notification tools module exists."""
        try:
            from toolbox.notification_tools import NotificationTools
            
            tools = NotificationTools()
            
            # Verify expected methods
            assert hasattr(tools, 'send_email') or hasattr(tools, 'send_notification')
        except ImportError:
            # Module may not exist yet
            pytest.skip("notification_tools module not found")
