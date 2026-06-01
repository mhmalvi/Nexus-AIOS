"""
Nexus Worker Agent - Task Execution Agent
"""

import asyncio
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass
from supervisor.error_kb import ErrorKnowledgeBase


@dataclass
class StepResult:
    step_id: str
    success: bool
    output: Any
    error: Optional[str]
    needs_retry: bool = False
    correction: Optional[str] = None


class WorkerAgent:
    """Worker Agent - Executes Plan Steps"""
    
    def __init__(self, brain, toolbox, supervisor, approval_callback: Optional[Callable] = None):
        self.brain = brain
        self.toolbox = toolbox
        self.supervisor = supervisor
        self.error_kb = ErrorKnowledgeBase()
        # Optional human-in-the-loop hook. Signature:
        #   approval_callback(action: str, risk_level: str, reason: str|None,
        #                     warnings: list) -> bool | Awaitable[bool]
        # When set, a step the supervisor flags as requiring approval is sent to
        # this callback (e.g. an interactive y/N prompt in the CLI) instead of
        # failing closed. When None, the agent still fails closed by default.
        self.approval_callback = approval_callback
    
    async def execute_step(self, step: Dict[str, Any], context: Optional[str] = None, auto_approve: bool = False) -> StepResult:
        step_id = step.get("id", "unknown")
        tool = step.get("tool", "")
        action = step.get("action", "")
        args = step.get("args", {})

        validation = self.supervisor.validate(action=f"{tool}: {action}", context=context)

        if not validation.is_safe:
            return StepResult(step_id=step_id, success=False, output=None, error=f"Blocked: {validation.reason}")

        if validation.requires_approval and not auto_approve:
            # Human-in-the-loop. An action the supervisor flags as requiring
            # approval is NOT silently reworded and retried (which could bypass
            # the verdict). If an interactive approval_callback is wired (e.g. the
            # CLI's y/N prompt), ask the human; otherwise fail CLOSED by default.
            approved = False
            if self.approval_callback is not None:
                try:
                    decision = self.approval_callback(
                        action=f"{tool}: {action}",
                        risk_level=getattr(validation, "risk_level", "high"),
                        reason=getattr(validation, "reason", None),
                        warnings=getattr(validation, "warnings", []) or [],
                    )
                    if asyncio.iscoroutine(decision):
                        decision = await decision
                    approved = bool(decision)
                except Exception:
                    approved = False

            if not approved:
                return StepResult(
                    step_id=step_id, success=False, output=None,
                    error="Blocked: action requires human approval (denied or no approver available)",
                    needs_retry=False
                )

            # Human approved — register so any later supervisor layers honor it.
            try:
                self.supervisor.register_approval(f"{tool}: {action}")
            except Exception:
                pass
        
        try:
            result = await self.toolbox.execute(tool_name=tool, kwargs=args)
            if result.success:
                return StepResult(step_id=step_id, success=True, output=result.output, error=None)
            else:
                correction = await self._generate_correction(step, result.error)
                return StepResult(step_id=step_id, success=False, output=None, error=result.error, needs_retry=True, correction=correction)
        except Exception as e:
            return StepResult(step_id=step_id, success=False, output=None, error=str(e), needs_retry=True)
    
    async def _generate_correction(self, step: Dict[str, Any], error: str) -> str:
        """
        Generate a correction for a failed step.
        First checks the Error Knowledge Base for known patterns,
        falls back to LLM if no match found.
        """
        # Try Error KB first (fast, no inference)
        kb_solution = self.error_kb.lookup_correction(error)
        
        if kb_solution:
            correction = kb_solution.solution
            if kb_solution.action_hint:
                correction += f" Hint: {kb_solution.action_hint}"
            return correction
        
        # Fall back to LLM for unknown errors
        prompt = f"Step failed: {step.get('action', '')} Error: {error}. Suggest correction."
        try:
            return await self.brain.generate(prompt=prompt, temperature=0.3, max_tokens=200)
        except Exception:
            return f"Retry due to: {error}"
