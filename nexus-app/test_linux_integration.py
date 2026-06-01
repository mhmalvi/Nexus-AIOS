"""
Nexus Linux Integration Tests
Tests for D-Bus, Systemd, Daemon, and Self-Learning integration
"""

import pytest
import asyncio
import sys
import os

# Add kernel to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'kernel'))


class TestDaemonManager:
    """Test the daemon manager module."""
    
    def test_import(self):
        """Test module import."""
        from kernel.linux.daemon import (
            NexusDaemon, DaemonConfig, DaemonState,
            sd_notify, is_socket_activated, parse_daemon_args
        )
        assert NexusDaemon is not None
        assert DaemonConfig is not None
    
    def test_daemon_config_defaults(self):
        """Test default configuration."""
        from kernel.linux.daemon import DaemonConfig
        config = DaemonConfig()
        assert config.pid_file is None
        assert config.enable_watchdog == True
        assert config.socket_activation == True
    
    def test_daemon_initialization(self):
        """Test daemon initialization."""
        from kernel.linux.daemon import NexusDaemon, DaemonConfig
        daemon = NexusDaemon(DaemonConfig())
        assert daemon.state.value == "starting"
        assert not daemon.is_running
        assert not daemon.should_shutdown
    
    def test_socket_activation_detection(self):
        """Test socket activation environment check."""
        from kernel.linux.daemon import is_socket_activated
        # Should be False when not activated
        result = is_socket_activated()
        assert result == False
    
    def test_parse_daemon_args(self):
        """Test daemon argument parsing."""
        from kernel.linux.daemon import parse_daemon_args
        # Backup and restore sys.argv
        original = sys.argv.copy()
        try:
            sys.argv = ["main.py", "--daemon"]
            assert parse_daemon_args() == True
            sys.argv = ["main.py"]
            assert parse_daemon_args() == False
        finally:
            sys.argv = original


class TestSelfLearningIntegration:
    """Test self-learning engine integration."""
    
    def test_import(self):
        """Test self-learning imports."""
        from kernel.memory import SelfLearningEngine, create_action_record, PatternType
        assert SelfLearningEngine is not None
        assert create_action_record is not None
    
    def test_create_action_record(self):
        """Test action record creation."""
        from kernel.memory import create_action_record
        
        record = create_action_record(
            intent="delete old files",
            tool="shell",
            args={"command": "rm -rf /tmp/old"},
            result="success",
            approved=True
        )
        
        assert record.intent == "delete old files"
        assert record.tool == "shell"
        assert record.approved == True
        assert record.action_id is not None
    
    def test_learning_engine_initialization(self):
        """Test learning engine init."""
        from kernel.memory import SelfLearningEngine
        
        engine = SelfLearningEngine(
            store=None,  # No store for testing
            enable_pattern_learning=True,
            enable_preference_learning=True
        )
        
        assert engine.enable_pattern_learning == True
        assert engine.enable_preference_learning == True
    
    @pytest.mark.asyncio
    async def test_learn_from_approval(self):
        """Test learning from approved action."""
        from kernel.memory import SelfLearningEngine, create_action_record
        
        engine = SelfLearningEngine(store=None)
        
        record = create_action_record(
            intent="zip my documents folder",
            tool="shell",
            args={"command": "zip -r docs.zip ~/Documents"},
            result="success"
        )
        
        result = await engine.learn_from_approval(record)
        # Should extract a pattern
        assert len(engine._action_history) == 1
    
    @pytest.mark.asyncio
    async def test_user_preference(self):
        """Test user preference storage."""
        from kernel.memory import SelfLearningEngine
        
        engine = SelfLearningEngine(store=None)
        
        success = await engine.learn_user_preference("editor", "vscode")
        assert success == True
        
        value = await engine.get_user_preference("editor")
        assert value == "vscode"
    
    @pytest.mark.asyncio
    async def test_suggest_action(self):
        """Test action suggestion."""
        from kernel.memory import SelfLearningEngine, create_action_record
        
        engine = SelfLearningEngine(store=None)
        
        # Learn an action first
        record = create_action_record(
            intent="compress files",
            tool="shell",
            args={"command": "tar -czf archive.tar.gz files/"},
            result="success"
        )
        await engine.learn_from_approval(record)
        
        # Ask for suggestions
        suggestions = await engine.suggest_action("compress my files")
        assert isinstance(suggestions, list)
    
    def test_learning_stats(self):
        """Test learning statistics."""
        from kernel.memory import SelfLearningEngine
        
        engine = SelfLearningEngine(store=None)
        stats = engine.get_learning_stats()
        
        assert "patterns_learned" in stats
        assert "actions_observed" in stats
        assert "preferences_stored" in stats


class TestDBusService:
    """Test D-Bus service (basic checks, full tests require Linux)."""
    
    def test_import(self):
        """Test D-Bus module import."""
        from kernel.linux.dbus_service import DBusService, DBusConfig, DBUS_AVAILABLE
        assert DBusService is not None
        assert DBusConfig is not None
    
    def test_config_defaults(self):
        """Test default D-Bus config."""
        from kernel.linux.dbus_service import DBusConfig
        config = DBusConfig()
        assert config.bus_type == "session"
        assert config.enable_agent == True
        assert config.enable_memory == True
        assert config.enable_voice == True
        assert config.enable_a2a == True
    
    def test_service_availability_check(self):
        """Test availability check."""
        from kernel.linux.dbus_service import DBusService
        service = DBusService()
        # Will be False on Windows
        is_available = service.is_available()
        assert isinstance(is_available, bool)


class TestSystemdUnits:
    """Test Systemd unit files exist and have correct structure."""
    
    def test_kernel_service_exists(self):
        """Test kernel service file exists."""
        service_path = os.path.join(
            os.path.dirname(__file__), 
            "linux", "systemd", "nexus-kernel.service"
        )
        assert os.path.exists(service_path), f"Missing: {service_path}"
        
        with open(service_path, "r") as f:
            content = f.read()
        
        # Check for key directives
        assert "[Unit]" in content
        assert "[Service]" in content
        assert "[Install]" in content
        assert "Type=notify" in content
        assert "WatchdogSec" in content
    
    def test_kernel_socket_exists(self):
        """Test kernel socket file exists."""
        socket_path = os.path.join(
            os.path.dirname(__file__), 
            "linux", "systemd", "nexus-kernel.socket"
        )
        assert os.path.exists(socket_path), f"Missing: {socket_path}"
        
        with open(socket_path, "r") as f:
            content = f.read()
        
        # Check for key directives
        assert "[Socket]" in content
        assert "ListenStream" in content


class TestKernelIntegration:
    """Test kernel integration with learning engine."""
    
    def test_kernel_has_learning_engine(self):
        """Test that NexusKernel initializes learning engine."""
        # This is a basic syntax check - full test needs Ollama
        import ast
        main_path = os.path.join(
            os.path.dirname(__file__), 
            "kernel", "main.py"
        )
        
        with open(main_path, "r") as f:
            content = f.read()
        
        # Check for learning engine integration
        assert "self.learning_engine = SelfLearningEngine(" in content
        assert "learn_from_approval" in content
        assert "learning_stats" in content


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
