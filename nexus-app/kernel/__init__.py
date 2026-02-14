# AETHER Hybrid Kernel — Python AI Engine
# Core reasoning, memory, agent orchestration, and system integration

from .main import AetherKernel
from .orchestrator import KernelOrchestrator, EventBus, Event, EventType
from .plugin_system import PluginSystem
from .health_monitor import HealthMonitor

# Backward-compat alias
NexusKernel = AetherKernel

__version__ = "0.3.0"
__all__ = [
    "AetherKernel",
    "NexusKernel",  # backward-compat alias
    "KernelOrchestrator",
    "EventBus",
    "Event",
    "EventType",
    "PluginSystem",
    "HealthMonitor",
]
