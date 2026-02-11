"""
Nexus Audit Logger - Action Logging
Comprehensive logging for all agentic actions
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
from collections import deque
import json


@dataclass
class AuditEntry:
    """A single audit log entry"""
    id: str
    timestamp: datetime
    event_type: str
    action: str
    details: Dict[str, Any]
    risk_level: str = "low"
    success: bool = True
    actor: str = "agent"


class AuditLogger:
    """
    Audit Logger - Comprehensive Action Logging
    
    Logs:
    - All validation events
    - Approval requests
    - Blocked actions
    - Executed commands
    """
    
    MAX_ENTRIES = 10000
    
    def __init__(self, log_file: Optional[str] = None):
        self.entries: deque = deque(maxlen=self.MAX_ENTRIES)
        self.log_file = log_file
        self._entry_counter = 0
    
    def _create_entry(
        self,
        event_type: str,
        action: str,
        details: Dict[str, Any] = None,
        risk_level: str = "low",
        success: bool = True
    ) -> AuditEntry:
        """Create a new audit entry"""
        
        self._entry_counter += 1
        entry = AuditEntry(
            id=f"audit_{self._entry_counter}",
            timestamp=datetime.utcnow(),
            event_type=event_type,
            action=action,
            details=details or {},
            risk_level=risk_level,
            success=success
        )
        
        self.entries.append(entry)
        
        if self.log_file:
            self._write_to_file(entry)
        
        return entry
    
    def log_validation(
        self,
        action: str,
        risk_level: str,
        is_aligned: bool
    ) -> AuditEntry:
        """Log an action validation"""
        
        return self._create_entry(
            event_type="validation",
            action=action,
            details={
                "risk_level": risk_level,
                "is_aligned": is_aligned
            },
            risk_level=risk_level
        )
    
    def log_blocked(
        self,
        action: str,
        reason: str
    ) -> AuditEntry:
        """Log a blocked action"""
        
        return self._create_entry(
            event_type="blocked",
            action=action,
            details={"reason": reason},
            risk_level="critical",
            success=False
        )
    
    def log_approval_request(
        self,
        action: str,
        details: Dict[str, Any]
    ) -> AuditEntry:
        """Log an approval request"""
        
        return self._create_entry(
            event_type="approval_request",
            action=action,
            details=details,
            risk_level=details.get("risk_level", "high")
        )
    
    def log_approval_response(
        self,
        action: str,
        approved: bool,
        reason: Optional[str] = None
    ) -> AuditEntry:
        """Log an approval response"""
        
        return self._create_entry(
            event_type="approval_response",
            action=action,
            details={
                "approved": approved,
                "reason": reason
            },
            success=approved
        )
    
    def log_execution(
        self,
        action: str,
        result: Dict[str, Any],
        success: bool
    ) -> AuditEntry:
        """Log an action execution"""
        
        return self._create_entry(
            event_type="execution",
            action=action,
            details=result,
            success=success
        )
    
    def log_error(
        self,
        action: str,
        error: str
    ) -> AuditEntry:
        """Log an error"""
        
        return self._create_entry(
            event_type="error",
            action=action,
            details={"error": error},
            success=False
        )
    
    def get_recent(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get recent audit entries"""
        
        entries = list(self.entries)[-limit:]
        return [
            {
                "id": e.id,
                "timestamp": e.timestamp.isoformat(),
                "event_type": e.event_type,
                "action": e.action,
                "details": e.details,
                "risk_level": e.risk_level,
                "success": e.success
            }
            for e in reversed(entries)
        ]
    
    def get_by_type(self, event_type: str) -> List[Dict[str, Any]]:
        """Get entries by event type"""
        
        return [
            {
                "id": e.id,
                "timestamp": e.timestamp.isoformat(),
                "event_type": e.event_type,
                "action": e.action,
                "details": e.details,
                "success": e.success
            }
            for e in self.entries
            if e.event_type == event_type
        ]
    
    def get_failures(self) -> List[Dict[str, Any]]:
        """Get all failed entries"""
        
        return [
            {
                "id": e.id,
                "timestamp": e.timestamp.isoformat(),
                "event_type": e.event_type,
                "action": e.action,
                "details": e.details
            }
            for e in self.entries
            if not e.success
        ]
    
    def _write_to_file(self, entry: AuditEntry):
        """Write entry to log file"""
        
        try:
            with open(self.log_file, "a") as f:
                log_line = json.dumps({
                    "id": entry.id,
                    "timestamp": entry.timestamp.isoformat(),
                    "event_type": entry.event_type,
                    "action": entry.action,
                    "details": entry.details,
                    "success": entry.success
                })
                f.write(log_line + "\n")
        except Exception:
            pass
    
    def export(self) -> str:
        """Export all entries as JSON"""
        
        return json.dumps(
            self.get_recent(self.MAX_ENTRIES),
            indent=2
        )
    
    def clear(self):
        """Clear all entries"""
        self.entries.clear()
