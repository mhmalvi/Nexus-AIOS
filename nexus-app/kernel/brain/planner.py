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
        
        # Parse the JSON response
        try:
            plan_data = json.loads(response)
        except json.JSONDecodeError:
            # Try to extract JSON from the response
            plan_data = self._extract_json(response)
        
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
        """Try to extract JSON from text that may have other content"""
        import re
        
        # Look for JSON block
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        
        # Return empty plan if extraction fails
        return {
            "description": "Failed to parse plan",
            "steps": [],
            "estimated_time": "unknown",
            "requires_approval": True
        }
