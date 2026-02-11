# Nexus Agents Module - Autonomous Agents

from .worker_agent import WorkerAgent
from .manager_agent import ManagerAgent
from .security_auditor import SecurityAuditorAgent
from .code_architect import CodeArchitectAgent
from .researcher import ResearchAgent
from .qa_engineer import QAAgent
from .monitor_agent import MonitorAgent
from .crewai_adapter import NexusCrewAgent, NexusTool, create_nexus_crew, CREWAI_AVAILABLE

__all__ = [
    "WorkerAgent", 
    "ManagerAgent", 
    "SecurityAuditorAgent", 
    "CodeArchitectAgent", 
    "ResearchAgent", 
    "QAAgent", 
    "MonitorAgent",
    # CrewAI Integration
    "NexusCrewAgent",
    "NexusTool",
    "create_nexus_crew",
    "CREWAI_AVAILABLE"
]
