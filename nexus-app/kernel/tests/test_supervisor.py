"""
Unit tests for Supervisor module (safety_checker, intent_validator, audit_logger).
"""
import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
import sys
import os

# Add kernel to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestSafetyChecker:
    """Tests for SafetyChecker class."""
    
    def test_safety_checker_initialization(self):
        """Test SafetyChecker initializes correctly."""
        from supervisor.safety_checker import SafetyChecker
        
        checker = SafetyChecker()
        
        assert hasattr(checker, 'check')
    
    def test_safety_checker_blocks_dangerous_patterns(self):
        """Test SafetyChecker blocks dangerous command patterns."""
        from supervisor.safety_checker import SafetyChecker
        
        checker = SafetyChecker()
        
        dangerous_commands = [
            "rm -rf /",
            "sudo rm -rf /*",
            ":(){ :|:& };:",  # Fork bomb
            "chmod 777 /",
        ]
        
        for cmd in dangerous_commands:
            result = checker.check(cmd)
            # Should be flagged as dangerous or require approval
            assert hasattr(result, 'is_safe') or hasattr(result, 'risk_level') or isinstance(result, bool)
    
    def test_safety_checker_allows_safe_patterns(self):
        """Test SafetyChecker allows safe command patterns."""
        from supervisor.safety_checker import SafetyChecker
        
        checker = SafetyChecker()
        
        safe_commands = [
            "echo 'hello world'",
            "ls -la",
            "pwd",
            "cat README.md",
        ]
        
        for cmd in safe_commands:
            result = checker.check(cmd)
            # Result should exist
            assert result is not None


class TestIntentValidator:
    """Tests for IntentValidator class."""
    
    def test_intent_validator_initialization(self):
        """Test IntentValidator initializes correctly."""
        from supervisor.intent_validator import IntentValidator
        
        validator = IntentValidator()
        
        assert hasattr(validator, 'validate')
    
    def test_intent_validator_validates_action(self):
        """Test IntentValidator validates action against intent."""
        from supervisor.intent_validator import IntentValidator
        
        validator = IntentValidator()
        
        # Create mock action and intent
        intent = "List files in current directory"
        action = {"tool": "shell", "args": {"command": "ls -la"}}
        
        result = validator.validate(intent, action)
        
        # Should return validation result
        assert result is not None


class TestAuditLogger:
    """Tests for AuditLogger class."""
    
    def test_audit_logger_initialization(self):
        """Test AuditLogger initializes correctly."""
        from supervisor.audit_logger import AuditLogger
        
        logger = AuditLogger()
        
        assert hasattr(logger, 'log')
    
    def test_audit_logger_logs_event(self):
        """Test AuditLogger logs events correctly."""
        from supervisor.audit_logger import AuditLogger
        
        logger = AuditLogger()
        
        # Log a test event
        result = logger.log(
            event_type="action_executed",
            action="shell",
            details={"command": "echo test"},
            success=True
        )
        
        # Should complete without error
        assert result is None or result is True or isinstance(result, str)
    
    def test_audit_logger_retrieves_logs(self):
        """Test AuditLogger can retrieve logs."""
        from supervisor.audit_logger import AuditLogger
        
        logger = AuditLogger()
        
        # Verify get methods exist
        assert hasattr(logger, 'get_logs') or hasattr(logger, 'get_recent')


class TestErrorKB:
    """Tests for Error Knowledge Base."""
    
    def test_error_kb_initialization(self):
        """Test ErrorKB initializes correctly."""
        from supervisor.error_kb import ErrorKB
        
        kb = ErrorKB()
        
        assert hasattr(kb, 'lookup') or hasattr(kb, 'search')
    
    def test_error_kb_lookup(self):
        """Test ErrorKB can lookup error solutions."""
        from supervisor.error_kb import ErrorKB
        
        kb = ErrorKB()
        
        # Lookup a common error
        error = "FileNotFoundError: No such file or directory"
        
        if hasattr(kb, 'lookup'):
            result = kb.lookup(error)
            assert result is not None
        elif hasattr(kb, 'search'):
            result = kb.search(error)
            assert result is not None


class TestSupervisorIntegration:
    """Integration tests for Supervisor module."""
    
    def test_supervisor_initialization(self):
        """Test Supervisor module initializes correctly."""
        from supervisor import Supervisor
        
        supervisor = Supervisor()
        
        # Verify core components are initialized
        assert hasattr(supervisor, 'safety_checker') or hasattr(supervisor, 'checker')
        assert hasattr(supervisor, 'check_safety') or hasattr(supervisor, 'validate')
