"""
CrewAI/AutoGen Integration Adapter for Nexus AIOS.

This module provides adapter classes to integrate existing Nexus agents
with CrewAI framework, enabling use of CrewAI's agent orchestration
patterns while leveraging Nexus's existing capabilities.

Features:
- NexusCrewAgent: Wraps Nexus agents as CrewAI-compatible agents
- NexusTool: Wraps Toolbox tools as CrewAI tools
- create_nexus_crew: Factory to create Crews from Nexus agents

Usage:
    from agents.crewai_adapter import create_nexus_crew, NexusCrewAgent
    
    crew = create_nexus_crew(manager_agent, worker_agent)
    result = crew.kickoff()
"""

import logging
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Check if CrewAI is available
try:
    from crewai import Agent, Task, Crew, Process
    from crewai.tools import BaseTool
    CREWAI_AVAILABLE = True
except ImportError:
    CREWAI_AVAILABLE = False
    logger.warning("CrewAI not installed. Install with: pip install crewai")


@dataclass
class NexusToolSpec:
    """Specification for a Nexus tool to be wrapped for CrewAI."""
    name: str
    description: str
    func: Callable
    args_schema: Optional[Dict[str, Any]] = None


class NexusTool:
    """
    Wrapper to expose Nexus Toolbox tools as CrewAI-compatible tools.
    
    Example:
        from agents.crewai_adapter import NexusTool
        
        shell_tool = NexusTool(
            name="shell",
            description="Execute shell commands",
            func=toolbox.execute_shell
        )
    """
    
    def __init__(
        self,
        name: str,
        description: str,
        func: Callable,
        args_schema: Optional[Dict[str, Any]] = None
    ):
        self.name = name
        self.description = description
        self.func = func
        self.args_schema = args_schema or {}
    
    def __call__(self, *args, **kwargs) -> str:
        """Execute the tool."""
        try:
            result = self.func(*args, **kwargs)
            if isinstance(result, dict):
                if result.get('success'):
                    return result.get('output', str(result))
                else:
                    return f"Error: {result.get('error', 'Unknown error')}"
            return str(result)
        except Exception as e:
            return f"Error executing {self.name}: {str(e)}"
    
    def to_crewai_tool(self):
        """Convert to CrewAI BaseTool if available."""
        if not CREWAI_AVAILABLE:
            raise ImportError("CrewAI is not installed")
        
        # Create a dynamic tool class for CrewAI
        tool_self = self
        
        class DynamicCrewAITool(BaseTool):
            name: str = tool_self.name
            description: str = tool_self.description
            
            def _run(self, *args, **kwargs) -> str:
                return tool_self(*args, **kwargs)
        
        return DynamicCrewAITool()


class NexusCrewAgent:
    """
    Wrapper to make Nexus agents compatible with CrewAI.
    
    This adapter wraps ManagerAgent, WorkerAgent, or any specialized agent
    to work within a CrewAI Crew orchestration.
    
    Example:
        from agents.crewai_adapter import NexusCrewAgent
        
        crew_manager = NexusCrewAgent(
            nexus_agent=manager_agent,
            role="Project Manager",
            goal="Coordinate and complete user tasks",
            backstory="An experienced AI project manager"
        )
    """
    
    def __init__(
        self,
        nexus_agent,
        role: str,
        goal: str,
        backstory: str = "",
        tools: Optional[List[NexusTool]] = None,
        verbose: bool = True
    ):
        self.nexus_agent = nexus_agent
        self.role = role
        self.goal = goal
        self.backstory = backstory or f"A {role} agent from Nexus AIOS"
        self.tools = tools or []
        self.verbose = verbose
    
    def to_crewai_agent(self):
        """Convert to CrewAI Agent if available."""
        if not CREWAI_AVAILABLE:
            raise ImportError("CrewAI is not installed")
        
        crewai_tools = [t.to_crewai_tool() for t in self.tools]
        
        return Agent(
            role=self.role,
            goal=self.goal,
            backstory=self.backstory,
            tools=crewai_tools,
            verbose=self.verbose
        )
    
    async def execute(self, task_description: str) -> str:
        """
        Execute a task using the wrapped Nexus agent.
        
        This method bridges CrewAI task execution to Nexus agent execution.
        """
        if hasattr(self.nexus_agent, 'execute_task'):
            # ManagerAgent-style execution
            result = await self.nexus_agent.execute_task(task_description)
            return str(result)
        elif hasattr(self.nexus_agent, 'execute'):
            # Generic agent execution
            result = await self.nexus_agent.execute(task_description)
            return str(result)
        else:
            return f"Agent does not support execution: {type(self.nexus_agent)}"


def create_nexus_crew(
    manager_agent,
    worker_agent,
    specialized_agents: Optional[List] = None,
    process: str = "sequential"
) -> Optional["Crew"]:
    """
    Factory function to create a CrewAI Crew from Nexus agents.
    
    Args:
        manager_agent: Nexus ManagerAgent instance
        worker_agent: Nexus WorkerAgent instance
        specialized_agents: Optional list of specialized agents
        process: "sequential" or "hierarchical"
    
    Returns:
        CrewAI Crew instance or None if CrewAI is not available
    
    Example:
        from agents.crewai_adapter import create_nexus_crew
        
        crew = create_nexus_crew(manager_agent, worker_agent)
        if crew:
            result = crew.kickoff()
    """
    if not CREWAI_AVAILABLE:
        logger.warning("CrewAI not available. Install with: pip install crewai")
        return None
    
    # Create wrapped agents
    crew_manager = NexusCrewAgent(
        nexus_agent=manager_agent,
        role="Project Manager",
        goal="Coordinate and complete complex tasks efficiently",
        backstory="An experienced AI project manager that excels at breaking down complex tasks"
    )
    
    crew_worker = NexusCrewAgent(
        nexus_agent=worker_agent,
        role="Task Executor",
        goal="Execute individual tasks with precision",
        backstory="A skilled AI worker that executes tasks accurately and efficiently"
    )
    
    agents = [crew_manager.to_crewai_agent(), crew_worker.to_crewai_agent()]
    
    # Add specialized agents if provided
    if specialized_agents:
        for i, agent in enumerate(specialized_agents):
            role = getattr(agent, 'role', f'Specialist {i+1}')
            wrapped = NexusCrewAgent(
                nexus_agent=agent,
                role=role,
                goal=f"Provide specialized {role.lower()} expertise",
                backstory=f"A specialized {role.lower()} with deep expertise"
            )
            agents.append(wrapped.to_crewai_agent())
    
    # Determine process type
    crew_process = Process.sequential if process == "sequential" else Process.hierarchical
    
    return Crew(
        agents=agents,
        process=crew_process,
        verbose=True
    )


def wrap_toolbox_for_crewai(toolbox) -> List[NexusTool]:
    """
    Wrap all Toolbox tools for CrewAI usage.
    
    Args:
        toolbox: Nexus Toolbox instance
    
    Returns:
        List of NexusTool wrappers
    """
    wrapped_tools = []
    
    if hasattr(toolbox, 'tools'):
        for name, spec in toolbox.tools.items():
            if callable(spec):
                func = spec
                desc = f"Execute {name} operation"
            elif isinstance(spec, dict):
                func = spec.get('func', lambda x: x)
                desc = spec.get('description', f"Execute {name} operation")
            else:
                continue
            
            wrapped_tools.append(NexusTool(
                name=name,
                description=desc,
                func=func
            ))
    
    return wrapped_tools


# Export classes for easy import
__all__ = [
    'NexusCrewAgent',
    'NexusTool',
    'NexusToolSpec',
    'create_nexus_crew',
    'wrap_toolbox_for_crewai',
    'CREWAI_AVAILABLE'
]
