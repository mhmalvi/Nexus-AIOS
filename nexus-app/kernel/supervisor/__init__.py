# AETHER Supervisor Module — Safety, Security & Oversight

from .safety_checker import SafetyChecker, SafetyResult
from .intent_validator import IntentValidator
from .audit_logger import AuditLogger
from .error_kb import ErrorKnowledgeBase
from .tool_policy import ToolPolicyEngine, ToolPolicy, ToolProfileID
from .ast_audit import ASTCommandAudit, CommandAuditResult, AuditSeverity
from .self_destruct import SelfDestructEngine, LockLevel, DestructConfig
from .network_firewall import NetworkFirewall, FirewallDecision, DEFAULT_ALLOWLIST
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
    AETHER Supervisor — Multi-Layer Safety & Oversight

    Layers:
    1. Regex blacklist (SafetyChecker) — fast pattern matching
    2. AST command audit (ASTCommandAudit) — deep structural analysis
    3. Tool policy (ToolPolicyEngine) — per-agent access control
    4. Intent validation (IntentValidator) — semantic alignment
    5. Human-in-the-loop (HIL) — approval for high-risk actions
    6. Audit logging — full trail for accountability
    """

    def __init__(self, blacklist_path: Optional[str] = None, config=None):
        self.safety_checker = SafetyChecker(blacklist_path)
        self.intent_validator = IntentValidator()
        self.audit_logger = AuditLogger()
        self.ast_audit = ASTCommandAudit()
        self.tool_policy = ToolPolicyEngine()
        self.self_destruct = None  # Initialized via configure_destruct()
        self.firewall = NetworkFirewall()
        self._approved_actions = set()
        self._config = config

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

        # Layer 1: Regex blacklist
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

        # Layer 2: AST command audit (for shell commands)
        ast_result = self.ast_audit.analyze(action)
        if not ast_result.is_safe:
            self.audit_logger.log_blocked(
                action,
                f"AST audit: {[f.title for f in ast_result.findings]}"
            )
            return ValidationResult(
                is_safe=False,
                is_aligned=False,
                requires_approval=False,
                risk_level="critical",
                reason=f"AST security audit failed (score: {ast_result.risk_score}/100)",
                warnings=[f.title for f in ast_result.findings]
            )

        # Add AST warnings
        for finding in ast_result.findings:
            if finding.severity.value in ("warning", "info"):
                warnings.append(f"[AST] {finding.title}")

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

        # Layer 1: Regex blacklist (fast)
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

        # Layer 2: AST command audit
        ast_result = self.ast_audit.analyze(action)
        if not ast_result.is_safe:
            self.audit_logger.log_blocked(
                action,
                f"AST audit: {[f.title for f in ast_result.findings]}"
            )
            return ValidationResult(
                is_safe=False,
                is_aligned=False,
                requires_approval=False,
                risk_level="critical",
                reason=f"AST security audit failed (score: {ast_result.risk_score}/100)",
                warnings=[f.title for f in ast_result.findings]
            )

        for finding in ast_result.findings:
            if finding.severity.value in ("warning", "info"):
                warnings.append(f"[AST] {finding.title}")

        # Assess risk level
        risk_level = self.safety_checker.assess_risk(action)

        # Check intent alignment
        is_aligned = True
        if original_intent:
            if use_llm and risk_level in ["high", "critical"]:
                alignment = await self.intent_validator.validate_with_llm(
                    action=action,
                    intent=original_intent
                )
                is_aligned = alignment.is_aligned
                if alignment.semantic_check:
                    warnings.append(f"LLM validation (confidence: {alignment.confidence:.0%})")
            else:
                alignment = self.intent_validator.check_alignment(
                    action=action,
                    intent=original_intent
                )
                is_aligned = alignment.is_aligned

            if not is_aligned:
                warnings.append(f"Action may not align with intent: {alignment.reason}")

        # Determine if approval is required
        requires_approval = risk_level in ["high", "critical"]

        if requires_approval and action in self._approved_actions:
            requires_approval = False
            self._approved_actions.discard(action)

        if risk_level == "medium":
            warnings.append("This action may modify data")
        elif risk_level == "high":
            warnings.append("This action may have significant impact")
        elif risk_level == "critical" and requires_approval:
            warnings.append("⚠️ High-risk action - requires explicit approval")

        self.audit_logger.log_validation(action, risk_level, is_aligned)

        return ValidationResult(
            is_safe=True,
            is_aligned=is_aligned,
            requires_approval=requires_approval,
            risk_level=risk_level,
            reason=None,
            warnings=warnings
        )

    async def validate_tool_use(
        self,
        tool_name: str,
        profile: str = "full",
        is_owner: bool = True,
    ) -> bool:
        """Validate that a tool is allowed under the given policy profile."""
        return self.tool_policy.is_allowed(tool_name, profile, is_owner)

    async def request_approval(
        self,
        action: str,
        details: dict
    ) -> bool:
        """Request human-in-the-loop approval"""
        self.audit_logger.log_approval_request(action, details)
        return False

    def get_audit_log(self, limit: int = 100) -> list:
        """Get recent audit entries"""
        return self.audit_logger.get_recent(limit)


__all__ = [
    "AgenticSupervisor",
    "ValidationResult",
    "SafetyChecker",
    "SafetyResult",
    "IntentValidator",
    "AuditLogger",
    "ErrorKnowledgeBase",
    "ToolPolicyEngine",
    "ToolPolicy",
    "ToolProfileID",
    "ASTCommandAudit",
    "CommandAuditResult",
    "AuditSeverity",
    "SelfDestructEngine",
    "LockLevel",
    "DestructConfig",
    "NetworkFirewall",
    "FirewallDecision",
    "DEFAULT_ALLOWLIST",
]
