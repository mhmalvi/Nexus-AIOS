"""
Nexus Planner - Multi-step Task Planning
Decomposes complex tasks into executable steps
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import json


@dataclass
class PlanStep:
    """A single step in a task plan"""
    id: str
    action: str
    tool: str
    args: Dict[str, Any]
    depends_on: List[str]
    description: str
    risk_level: str = "low"


@dataclass
class TaskPlan:
    """Complete plan for a multi-step task"""
    task_id: str
    description: str
    steps: List[PlanStep]
    estimated_time: str
    requires_approval: bool


class Planner:
    """
    Task Planner - Decomposes natural language tasks into executable plans
    
    Uses the LLM to:
    - Understand task requirements
    - Identify necessary tools
    - Create ordered steps with dependencies
    - Estimate risk levels
    """
    
    PLANNING_PROMPT = """You are a task planning assistant. Given a task description and available tools, create a detailed execution plan.

Available Tools:
{tools}

Task: {task}

Create a JSON plan with the following structure:
{{
    "description": "Brief description of the plan",
    "estimated_time": "estimated completion time",
    "requires_approval": true/false,
    "steps": [
        {{
            "id": "step_1",
            "action": "what this step does",
            "tool": "tool_name",
            "args": {{"arg1": "value1"}},
            "depends_on": [],
            "description": "human readable description",
            "risk_level": "low/medium/high/critical"
        }}
    ]
}}

Rules:
1. Break down complex tasks into atomic steps
2. Identify dependencies between steps
3. Use appropriate tools for each step
4. Flag high-risk operations (file deletion, system changes)
5. Be conservative with risk levels

Respond with ONLY the JSON, no other text."""

    def __init__(self, llm):
        self.llm = llm
    
    async def create_plan(
        self,
        task: str,
        tools: List[Dict[str, Any]],
        max_steps: int = 10
    ) -> TaskPlan:
        """Create an execution plan for a task"""
        
        # Format tools for the prompt
        tools_str = self._format_tools(tools)
        
        # Generate the plan using LLM
        prompt = self.PLANNING_PROMPT.format(
            tools=tools_str,
            task=task
        )
        
        response = await self.llm.generate(
            prompt=prompt,
            temperature=0.3,  # Lower temperature for structured output
            max_tokens=2048
        )

        # Parse the JSON response (robust to fences / prose / trailing commas).
        plan_data = self._extract_json(response)

        # Small local models often emit prose or an empty/invalid plan. If we got
        # no steps, retry ONCE with a stricter "JSON-only" instruction before
        # giving up — this materially improves multi-step reliability on 3B models.
        if not plan_data.get("steps"):
            try:
                strict = await self.llm.generate(
                    prompt=prompt + "\n\nIMPORTANT: Respond with ONLY the raw JSON "
                                    "object — no prose, no markdown code fences.",
                    temperature=0.1,
                    max_tokens=2048,
                )
                strict_data = self._extract_json(strict)
                if strict_data.get("steps"):
                    plan_data = strict_data
            except Exception:
                pass

        # Convert to TaskPlan
        steps = []
        for i, step_data in enumerate(plan_data.get("steps", [])[:max_steps]):
            steps.append(PlanStep(
                id=step_data.get("id", f"step_{i+1}"),
                action=step_data.get("action", ""),
                tool=step_data.get("tool", ""),
                args=step_data.get("args", {}),
                depends_on=step_data.get("depends_on", []),
                description=step_data.get("description", ""),
                risk_level=step_data.get("risk_level", "low")
            ))
        
        return TaskPlan(
            task_id=f"plan_{hash(task) % 10000}",
            description=plan_data.get("description", task),
            steps=steps,
            estimated_time=plan_data.get("estimated_time", "unknown"),
            requires_approval=plan_data.get("requires_approval", True)
        )
    
    async def refine_plan(
        self,
        plan: TaskPlan,
        error: str,
        failed_step: str
    ) -> TaskPlan:
        """Refine a plan after a step fails"""
        
        refinement_prompt = f"""A task plan failed at step '{failed_step}' with error: {error}

Original plan:
{json.dumps([{"id": s.id, "action": s.action, "tool": s.tool} for s in plan.steps], indent=2)}

Create a corrected plan that avoids this error. Consider:
1. Alternative approaches
2. Additional validation steps
3. Different tool choices

Respond with the corrected JSON plan."""

        response = await self.llm.generate(
            prompt=refinement_prompt,
            temperature=0.3,
            max_tokens=2048
        )
        
        try:
            plan_data = json.loads(response)
        except json.JSONDecodeError:
            plan_data = self._extract_json(response)
        
        # Build refined plan
        steps = []
        for i, step_data in enumerate(plan_data.get("steps", [])):
            steps.append(PlanStep(
                id=step_data.get("id", f"step_{i+1}"),
                action=step_data.get("action", ""),
                tool=step_data.get("tool", ""),
                args=step_data.get("args", {}),
                depends_on=step_data.get("depends_on", []),
                description=step_data.get("description", ""),
                risk_level=step_data.get("risk_level", "medium")
            ))
        
        return TaskPlan(
            task_id=plan.task_id,
            description=plan_data.get("description", plan.description),
            steps=steps,
            estimated_time=plan_data.get("estimated_time", "unknown"),
            requires_approval=True  # Refined plans always need approval
        )
    
    def _format_tools(self, tools: List[Dict[str, Any]]) -> str:
        """Format tool list for prompt"""
        lines = []
        for tool in tools:
            name = tool.get("name", "unknown")
            desc = tool.get("description", "")
            args = tool.get("args", {})
            
            args_str = ", ".join(f"{k}: {v}" for k, v in args.items())
            lines.append(f"- {name}: {desc} (args: {args_str})")
        
        return "\n".join(lines)
    
    def _extract_json(self, text: str) -> Dict:
        """Robustly extract a JSON object from messy LLM output.

        Handles: clean JSON, ```json fenced``` blocks, JSON embedded in prose,
        and common small-model defects (trailing commas, smart quotes).
        """
        import re

        if not text:
            return self._empty_plan()

        candidates = []
        # 1) Fenced code block (```json ... ``` or ``` ... ```)
        fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
        if fence:
            candidates.append(fence.group(1))
        # 2) Greedy first-'{' to last-'}'
        brace = re.search(r"\{[\s\S]*\}", text)
        if brace:
            candidates.append(brace.group())
        # 3) The whole thing
        candidates.append(text)

        for cand in candidates:
            for attempt in (cand, self._repair_json(cand)):
                try:
                    data = json.loads(attempt)
                    if isinstance(data, dict):
                        return data
                except Exception:
                    continue

        return self._empty_plan()

    @staticmethod
    def _repair_json(s: str) -> str:
        """Best-effort repair of common small-model JSON defects."""
        import re
        s = (s or "").strip()
        s = s.replace("“", '"').replace("”", '"')   # smart double quotes
        s = s.replace("‘", "'").replace("’", "'")   # smart single quotes
        s = re.sub(r",\s*([}\]])", r"\1", s)                  # trailing commas
        return s

    @staticmethod
    def _empty_plan() -> Dict:
        return {
            "description": "Failed to parse plan",
            "steps": [],
            "estimated_time": "unknown",
            "requires_approval": True,
        }
