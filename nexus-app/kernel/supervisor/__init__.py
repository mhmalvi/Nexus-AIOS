# Nexus Supervisor Module - Agentic Safety

from .safety_checker import SafetyChecker
from .intent_validator import IntentValidator
from .audit_logger import AuditLogger
from .error_kb import ErrorKnowledgeBase
from dataclasses import dataclass
from typing import Optional, List


@dataclass
class ValidationResult:
    """Result from action validation"""
    is_safe: bool
    is_aligned: bool
    requires_approval: bool
    risk_level: str
    reason: Optional[str]
    warnings: List[str]


class AgenticSupervisor:
    """
    Agentic Supervisor - Safety and Oversight Layer
    
    Responsibilities:
    - Validate actions against safety blacklist
    - Check intent alignment
    - Request human approval when needed
    - Log all actions for audit
    """
    
    def __init__(self, blacklist_path: Optional[str] = None):
        self.safety_checker = SafetyChecker(blacklist_path)
        self.intent_validator = IntentValidator()
        self.audit_logger = AuditLogger()
        self._approved_actions = set()
    
    def register_approval(self, action: str):
        """Register a human approval for an action"""
        self._approved_actions.add(action)

    def validate(
        self,
        action: str,
        context: Optional[str] = None,
        original_intent: Optional[str] = None
    ) -> ValidationResult:
        """Validate an action before execution"""
        
        warnings = []
        
        # Check against safety blacklist
        safety_result = self.safety_checker.check(action)
        
        if not safety_result.is_safe:
            self.audit_logger.log_blocked(action, safety_result.reason)
            return ValidationResult(
                is_safe=False,
                is_aligned=False,
                requires_approval=False,
                risk_level="critical",
                reason=safety_result.reason,
                warnings=["Action blocked by safety filter"]
            )
        
        # Assess risk level
        risk_level = self.safety_checker.assess_risk(action)
        
        # Check intent alignment if original intent provided
        is_aligned = True
        if original_intent:
            alignment = self.intent_validator.check_alignment(
                action=action,
                intent=original_intent
            )
            is_aligned = alignment.is_aligned
            if not is_aligned:
                warnings.append(f"Action may not align with intent: {alignment.reason}")
        
        # Determine if approval is required
        requires_approval = risk_level in ["high", "critical"]
        
        # Check if already approved
        if requires_approval and action in self._approved_actions:
            requires_approval = False
            # We consume the approval (one-time use)
            self._approved_actions.discard(action)
        
        # Add risk-based warnings
        if risk_level == "medium":
            warnings.append("This action may modify data")
        elif risk_level == "high":
            warnings.append("This action may have significant impact")
        elif risk_level == "critical" and requires_approval:
            warnings.append("⚠️ High-risk action - requires explicit approval")
        
        # Log the validation
        self.audit_logger.log_validation(action, risk_level, is_aligned)
        
        return ValidationResult(
            is_safe=True,
            is_aligned=is_aligned,
            requires_approval=requires_approval,
            risk_level=risk_level,
            reason=None,
            warnings=warnings
        )
    
    async def validate_async(
        self,
        action: str,
        context: Optional[str] = None,
        original_intent: Optional[str] = None,
        use_llm: bool = True
    ) -> ValidationResult:
        """
        Async validation with LLM-based semantic analysis for high-risk actions.
        
        For medium/low risk: Uses fast keyword-based validation
        For high/critical risk: Uses LLM semantic validation if enabled
        """
        
        warnings = []
        
        # Check against safety blacklist (fast)
        safety_result = self.safety_checker.check(action)
        
        if not safety_result.is_safe:
            self.audit_logger.log_blocked(action, safety_result.reason)
            return ValidationResult(
                is_safe=False,
                is_aligned=False,
                requires_approval=False,
                risk_level="critical",
                reason=safety_result.reason,
                warnings=["Action blocked by safety filter"]
            )
        
        # Assess risk level
        risk_level = self.safety_checker.assess_risk(action)
        
        # Check intent alignment
        is_aligned = True
        if original_intent:
            # For high-risk actions with LLM enabled, use semantic validation
            if use_llm and risk_level in ["high", "critical"]:
                alignment = await self.intent_validator.validate_with_llm(
                    action=action,
                    intent=original_intent
                )
                is_aligned = alignment.is_aligned
                if alignment.semantic_check:
                    warnings.append(f"LLM validation (confidence: {alignment.confidence:.0%})")
            else:
                # Fast keyword check
                alignment = self.intent_validator.check_alignment(
                    action=action,
                    intent=original_intent
                )
                is_aligned = alignment.is_aligned
            
            if not is_aligned:
                warnings.append(f"Action may not align with intent: {alignment.reason}")
        
        # Determine if approval is required
        requires_approval = risk_level in ["high", "critical"]
        
        # Check if already approved
        if requires_approval and action in self._approved_actions:
            requires_approval = False
            self._approved_actions.discard(action)
        
        # Add risk-based warnings
        if risk_level == "medium":
            warnings.append("This action may modify data")
        elif risk_level == "high":
            warnings.append("This action may have significant impact")
        elif risk_level == "critical" and requires_approval:
            warnings.append("⚠️ High-risk action - requires explicit approval")
        
        # Log the validation
        self.audit_logger.log_validation(action, risk_level, is_aligned)
        
        return ValidationResult(
            is_safe=True,
            is_aligned=is_aligned,
            requires_approval=requires_approval,
            risk_level=risk_level,
            reason=None,
            warnings=warnings
        )
    
    async def request_approval(
        self,
        action: str,
        details: dict
    ) -> bool:
        """Request human-in-the-loop approval"""
        
        # This would typically emit an event to the frontend
        # For now, we log and return False (requiring explicit approval)
        self.audit_logger.log_approval_request(action, details)
        
        # In production, wait for approval event
        return False
    
    def get_audit_log(self, limit: int = 100) -> list:
        """Get recent audit entries"""
        return self.audit_logger.get_recent(limit)


__all__ = [
    "AgenticSupervisor",
    "ValidationResult",
    "SafetyChecker",
    "IntentValidator",
    "AuditLogger",
    "ErrorKnowledgeBase"
]
