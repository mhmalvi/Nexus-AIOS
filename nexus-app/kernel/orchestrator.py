"""
AETHER Kernel Orchestrator — Central Event Bus & System Integration

The nerve center that connects all AETHER subsystems:
- Brain (LLM/AI)
- Memory (4-tier)
- Voice (STT/TTS/wake word)
- Supervisor (safety/policy)
- Agents (subagent registry)
- Browser (Playwright)
- Media (perception)
- Cron (scheduling)
- Auto-Reply (message delivery)
- Plugins (extensions)

Architecture:
- Event-driven: subsystems communicate via typed events
- Lifecycle-managed: ordered init → start → stop → shutdown
- Health-monitored: continuous system health checks
- Plugin-extensible: dynamic module loading

This sits ABOVE AetherKernel (main.py) as the system-level orchestrator.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import (
    Optional, List, Dict, Any, Callable, Awaitable, Set,
)

logger = logging.getLogger("aether.orchestrator")


# ---------------------------------------------------------------------------
# Event System
# ---------------------------------------------------------------------------

class EventType(str, Enum):
    # Lifecycle
    SYSTEM_BOOT = "system.boot"
    SYSTEM_READY = "system.ready"
    SYSTEM_SHUTDOWN = "system.shutdown"

    # Brain
    LLM_REQUEST = "brain.llm_request"
    LLM_RESPONSE = "brain.llm_response"
    LLM_ERROR = "brain.llm_error"
    PROVIDER_SWITCH = "brain.provider_switch"

    # Memory
    MEMORY_STORE = "memory.store"
    MEMORY_RETRIEVE = "memory.retrieve"
    MEMORY_COMPACT = "memory.compact"
    DEEP_MEMORY_EXTRACT = "memory.deep_extract"

    # Voice
    WAKE_WORD = "voice.wake_word"
    TRANSCRIPTION = "voice.transcription"
    TTS_START = "voice.tts_start"
    TTS_END = "voice.tts_end"

    # Supervisor
    SAFETY_CHECK = "supervisor.safety_check"
    SAFETY_BLOCK = "supervisor.safety_block"
    APPROVAL_REQUIRED = "supervisor.approval_required"
    APPROVAL_GRANTED = "supervisor.approval_granted"

    # Agents
    AGENT_SPAWN = "agent.spawn"
    AGENT_COMPLETE = "agent.complete"
    AGENT_ERROR = "agent.error"

    # Browser
    PAGE_LOAD = "browser.page_load"
    SCREENSHOT = "browser.screenshot"

    # Cron
    CRON_FIRE = "cron.fire"
    CRON_COMPLETE = "cron.complete"

    # Plugins
    PLUGIN_LOAD = "plugin.load"
    PLUGIN_UNLOAD = "plugin.unload"
    PLUGIN_ERROR = "plugin.error"

    # Health
    HEALTH_CHECK = "health.check"
    HEALTH_WARNING = "health.warning"
    HEALTH_CRITICAL = "health.critical"

    # Generic
    CUSTOM = "custom"


@dataclass
class Event:
    """A typed event flowing through the orchestrator."""
    type: EventType
    data: Any = None
    source: str = ""            # Which subsystem emitted this
    timestamp: float = field(default_factory=time.time)
    correlation_id: str = ""    # For request/response correlation


# Callback signature: async def handler(event: Event) -> None
EventHandler = Callable[[Event], Awaitable[None]]


class EventBus:
    """
    Central pub/sub event bus for inter-subsystem communication.

    Usage:
        bus = EventBus()

        async def on_wake(event):
            print(f"Wake word detected at {event.timestamp}")

        bus.subscribe(EventType.WAKE_WORD, on_wake)
        await bus.emit(Event(type=EventType.WAKE_WORD, source="voice"))
    """

    def __init__(self):
        self._handlers: Dict[EventType, List[EventHandler]] = {}
        self._global_handlers: List[EventHandler] = []
        self._event_log: List[Event] = []
        self._max_log = 1000

    def subscribe(
        self, event_type: EventType, handler: EventHandler,
    ) -> None:
        """Subscribe to a specific event type."""
        self._handlers.setdefault(event_type, []).append(handler)

    def subscribe_all(self, handler: EventHandler) -> None:
        """Subscribe to ALL events (for logging/monitoring)."""
        self._global_handlers.append(handler)

    def unsubscribe(
        self, event_type: EventType, handler: EventHandler,
    ) -> None:
        """Unsubscribe from an event type."""
        handlers = self._handlers.get(event_type, [])
        if handler in handlers:
            handlers.remove(handler)

    async def emit(self, event: Event) -> None:
        """Emit an event to all subscribers."""
        self._event_log.append(event)
        if len(self._event_log) > self._max_log:
            self._event_log = self._event_log[-self._max_log:]

        # Type-specific handlers
        for handler in self._handlers.get(event.type, []):
            try:
                await handler(event)
            except Exception as e:
                logger.error(
                    "Event handler error (%s): %s", event.type.value, e,
                )

        # Global handlers
        for handler in self._global_handlers:
            try:
                await handler(event)
            except Exception:
                pass

    def get_recent_events(
        self, event_type: Optional[EventType] = None, limit: int = 50,
    ) -> List[Event]:
        """Get recent events, optionally filtered by type."""
        events = self._event_log
        if event_type:
            events = [e for e in events if e.type == event_type]
        return events[-limit:]


# ---------------------------------------------------------------------------
# Subsystem Protocol
# ---------------------------------------------------------------------------

class SubsystemState(str, Enum):
    UNINITIALIZED = "uninitialized"
    INITIALIZING = "initializing"
    READY = "ready"
    RUNNING = "running"
    STOPPING = "stopping"
    STOPPED = "stopped"
    ERROR = "error"


@dataclass
class SubsystemInfo:
    """Registration info for a subsystem."""
    name: str
    state: SubsystemState = SubsystemState.UNINITIALIZED
    priority: int = 50     # Lower = initialized first (0-100)
    required: bool = False  # If True, system won't boot without it
    instance: Any = None
    init_fn: Optional[Callable] = None
    start_fn: Optional[Callable] = None
    stop_fn: Optional[Callable] = None
    health_fn: Optional[Callable] = None
    error: Optional[str] = None
    init_time_ms: float = 0.0


# ---------------------------------------------------------------------------
# Kernel Orchestrator
# ---------------------------------------------------------------------------

class KernelOrchestrator:
    """
    AETHER's central nervous system.

    Manages subsystem lifecycle, event routing, and system health.

    Usage:
        orch = KernelOrchestrator()

        # Register subsystems
        orch.register("brain", brain_instance,
                       init_fn=brain.initialize,
                       priority=10, required=True)
        orch.register("voice", voice_instance,
                       init_fn=voice.initialize,
                       start_fn=voice.start,
                       stop_fn=voice.stop,
                       priority=50)

        # Boot the system
        await orch.boot()

        # Emit events
        await orch.emit(Event(type=EventType.WAKE_WORD))

        # Shutdown
        await orch.shutdown()
    """

    def __init__(self):
        self.event_bus = EventBus()
        self._subsystems: Dict[str, SubsystemInfo] = {}
        self._boot_time: Optional[float] = None
        self._state = SubsystemState.UNINITIALIZED

    # ------------------------------------------------------------------
    # Subsystem Registration
    # ------------------------------------------------------------------

    def register(
        self,
        name: str,
        instance: Any = None,
        init_fn: Optional[Callable] = None,
        start_fn: Optional[Callable] = None,
        stop_fn: Optional[Callable] = None,
        health_fn: Optional[Callable] = None,
        priority: int = 50,
        required: bool = False,
    ) -> None:
        """
        Register a subsystem with the orchestrator.

        Args:
            name: Unique subsystem name
            instance: The subsystem object
            init_fn: Async function to initialize
            start_fn: Async function to start (after init)
            stop_fn: Async function to stop
            health_fn: Async function returning health dict
            priority: Init order (lower = first, 0-100)
            required: If True, boot fails if this can't init
        """
        self._subsystems[name] = SubsystemInfo(
            name=name,
            instance=instance,
            init_fn=init_fn,
            start_fn=start_fn,
            stop_fn=stop_fn,
            health_fn=health_fn,
            priority=priority,
            required=required,
        )
        logger.debug("Registered subsystem: %s (priority=%d)", name, priority)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def boot(self) -> bool:
        """
        Boot all subsystems in priority order.

        Returns True if all required subsystems initialized successfully.
        """
        self._state = SubsystemState.INITIALIZING
        self._boot_time = time.time()

        await self.emit(Event(type=EventType.SYSTEM_BOOT, source="orchestrator"))

        # Sort by priority (lower = first)
        ordered = sorted(
            self._subsystems.values(), key=lambda s: s.priority,
        )

        success = True
        for sub in ordered:
            if sub.init_fn:
                sub.state = SubsystemState.INITIALIZING
                t0 = time.time()

                try:
                    await sub.init_fn()
                    sub.state = SubsystemState.READY
                    sub.init_time_ms = (time.time() - t0) * 1000
                    logger.info(
                        "✓ %s initialized (%.0fms)",
                        sub.name, sub.init_time_ms,
                    )

                except Exception as e:
                    sub.state = SubsystemState.ERROR
                    sub.error = str(e)
                    sub.init_time_ms = (time.time() - t0) * 1000
                    logger.error("✗ %s failed to initialize: %s", sub.name, e)

                    if sub.required:
                        success = False
                        logger.critical(
                            "Required subsystem '%s' failed — aborting boot",
                            sub.name,
                        )
                        break
            else:
                sub.state = SubsystemState.READY

        if not success:
            self._state = SubsystemState.ERROR
            return False

        # Start subsystems with start_fn
        for sub in ordered:
            if sub.start_fn and sub.state == SubsystemState.READY:
                try:
                    await sub.start_fn()
                    sub.state = SubsystemState.RUNNING
                except Exception as e:
                    sub.error = str(e)
                    logger.error("Failed to start %s: %s", sub.name, e)

        boot_time = (time.time() - self._boot_time) * 1000
        self._state = SubsystemState.RUNNING

        await self.emit(Event(
            type=EventType.SYSTEM_READY,
            source="orchestrator",
            data={"boot_time_ms": boot_time},
        ))

        active = sum(
            1 for s in self._subsystems.values()
            if s.state in (SubsystemState.READY, SubsystemState.RUNNING)
        )
        logger.info(
            "AETHER booted: %d/%d subsystems active (%.0fms)",
            active, len(self._subsystems), boot_time,
        )

        return True

    async def shutdown(self) -> None:
        """Shutdown all subsystems in reverse priority order."""
        self._state = SubsystemState.STOPPING

        await self.emit(Event(
            type=EventType.SYSTEM_SHUTDOWN, source="orchestrator",
        ))

        # Stop in reverse priority order
        ordered = sorted(
            self._subsystems.values(),
            key=lambda s: s.priority,
            reverse=True,
        )

        for sub in ordered:
            if sub.stop_fn and sub.state in (
                SubsystemState.READY, SubsystemState.RUNNING,
            ):
                try:
                    sub.state = SubsystemState.STOPPING
                    await sub.stop_fn()
                    sub.state = SubsystemState.STOPPED
                    logger.info("⏹ %s stopped", sub.name)
                except Exception as e:
                    logger.error("Error stopping %s: %s", sub.name, e)
                    sub.state = SubsystemState.ERROR

        self._state = SubsystemState.STOPPED
        logger.info("AETHER shutdown complete")

    # ------------------------------------------------------------------
    # Event proxies
    # ------------------------------------------------------------------

    async def emit(self, event: Event) -> None:
        """Emit an event through the bus."""
        await self.event_bus.emit(event)

    def on(self, event_type: EventType, handler: EventHandler) -> None:
        """Subscribe to an event type."""
        self.event_bus.subscribe(event_type, handler)

    # ------------------------------------------------------------------
    # Status & Health
    # ------------------------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Run health checks on all subsystems."""
        results = {}

        for name, sub in self._subsystems.items():
            entry = {
                "state": sub.state.value,
                "required": sub.required,
                "init_time_ms": sub.init_time_ms,
            }

            if sub.error:
                entry["error"] = sub.error

            if sub.health_fn:
                try:
                    entry["health"] = await sub.health_fn()
                except Exception as e:
                    entry["health"] = {"error": str(e)}

            results[name] = entry

        # Emit health event
        await self.emit(Event(
            type=EventType.HEALTH_CHECK,
            source="orchestrator",
            data=results,
        ))

        return results

    def get_status(self) -> Dict[str, Any]:
        """Get overall system status."""
        subsystem_states = {
            name: sub.state.value
            for name, sub in self._subsystems.items()
        }

        active = sum(
            1 for s in self._subsystems.values()
            if s.state in (SubsystemState.READY, SubsystemState.RUNNING)
        )

        uptime = 0.0
        if self._boot_time:
            uptime = time.time() - self._boot_time

        return {
            "state": self._state.value,
            "subsystems": subsystem_states,
            "active_count": active,
            "total_count": len(self._subsystems),
            "uptime_seconds": round(uptime, 1),
            "recent_events": len(self.event_bus._event_log),
        }

    def get_subsystem(self, name: str) -> Any:
        """Get a subsystem instance by name."""
        sub = self._subsystems.get(name)
        return sub.instance if sub else None
