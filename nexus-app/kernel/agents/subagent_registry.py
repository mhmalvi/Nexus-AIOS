"""
AETHER Subagent Registry — Multi-Agent Orchestration Engine

Manages child agent sessions for parallel task execution.
Inspired by OpenClaw's subagent-registry.ts.

Features:
- Spawn isolated child agent sessions
- Wait for completion with configurable timeout
- Announce results back to parent
- Persist state to disk for crash recovery
- Automatic cleanup of completed/orphaned sessions
"""

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Optional, List, Dict, Any, Callable, Awaitable

logger = logging.getLogger("aether.subagent")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class SubagentStatus(str, Enum):
    PENDING = "pending"       # Registered, not yet started
    RUNNING = "running"       # Executing
    COMPLETED = "completed"   # Finished successfully
    FAILED = "failed"         # Finished with error
    TIMEOUT = "timeout"       # Exceeded time limit
    CANCELLED = "cancelled"   # Manually stopped
    CLEANING = "cleaning"     # Post-completion cleanup


class SubagentCleanup(str, Enum):
    DELETE = "delete"   # Delete session after completion
    KEEP = "keep"       # Keep session for inspection


@dataclass
class SubagentRunRecord:
    """Records a single subagent execution."""
    run_id: str
    label: str                           # Human-readable name
    task: str                            # Task description
    parent_session: str                  # Parent session key
    status: SubagentStatus = SubagentStatus.PENDING
    cleanup: SubagentCleanup = SubagentCleanup.DELETE
    model: Optional[str] = None          # Model override for this agent
    tool_profile: str = "coding"         # Tool policy profile
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    ended_at: Optional[float] = None
    result: Optional[str] = None         # Final output / summary
    error: Optional[str] = None          # Error message if failed
    timeout_seconds: int = 600           # Max execution time

    @property
    def elapsed_seconds(self) -> float:
        if self.started_at is None:
            return 0.0
        end = self.ended_at or time.time()
        return end - self.started_at

    @property
    def is_terminal(self) -> bool:
        return self.status in (
            SubagentStatus.COMPLETED,
            SubagentStatus.FAILED,
            SubagentStatus.TIMEOUT,
            SubagentStatus.CANCELLED,
        )

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["status"] = self.status.value
        d["cleanup"] = self.cleanup.value
        return d

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "SubagentRunRecord":
        d["status"] = SubagentStatus(d.get("status", "pending"))
        d["cleanup"] = SubagentCleanup(d.get("cleanup", "delete"))
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


# ---------------------------------------------------------------------------
# Subagent Registry
# ---------------------------------------------------------------------------

class SubagentRegistry:
    """
    Manages the lifecycle of child agent sessions.

    Usage:
        registry = SubagentRegistry(config)

        # Spawn a research subagent
        run_id = await registry.spawn(
            label="Research Agent",
            task="Analyze the codebase architecture",
            parent_session="main",
            execute_fn=my_agent_runner,
        )

        # Wait for it
        record = await registry.wait(run_id, timeout=300)
        print(record.result)

        # List all active
        active = registry.list_active()
    """

    def __init__(
        self,
        max_subagents: int = 5,
        persist_path: Optional[str] = None,
        on_complete: Optional[Callable[["SubagentRunRecord"], Awaitable[None]]] = None,
    ):
        self._runs: Dict[str, SubagentRunRecord] = {}
        self._tasks: Dict[str, asyncio.Task] = {}
        self._events: Dict[str, asyncio.Event] = {}
        self._max_subagents = max_subagents
        self._on_complete = on_complete

        # Persistence
        if persist_path:
            self._persist_path = Path(persist_path)
        else:
            self._persist_path = Path.home() / ".aether" / "subagents.json"

        # Restore from disk
        self._restore()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def spawn(
        self,
        label: str,
        task: str,
        parent_session: str,
        execute_fn: Callable[[str, str], Awaitable[str]],
        model: Optional[str] = None,
        tool_profile: str = "coding",
        cleanup: str = "delete",
        timeout_seconds: int = 600,
    ) -> str:
        """
        Spawn a new subagent.

        Args:
            label: Human-readable name (e.g., "Research Agent")
            task: Full task description for the agent
            parent_session: Parent session key for result delivery
            execute_fn: Async function(task, model) -> result string
            model: Optional model override
            tool_profile: Tool policy profile (minimal/coding/messaging/full)
            cleanup: "delete" or "keep" session after completion
            timeout_seconds: Max execution time

        Returns:
            run_id: Unique identifier for this subagent run
        """
        # Check capacity
        active_count = sum(
            1 for r in self._runs.values()
            if r.status in (SubagentStatus.PENDING, SubagentStatus.RUNNING)
        )
        if active_count >= self._max_subagents:
            raise RuntimeError(
                f"Maximum subagents ({self._max_subagents}) reached. "
                f"Wait for an active agent to finish or increase the limit."
            )

        run_id = f"sub_{uuid.uuid4().hex[:12]}"

        record = SubagentRunRecord(
            run_id=run_id,
            label=label,
            task=task,
            parent_session=parent_session,
            model=model,
            tool_profile=tool_profile,
            cleanup=SubagentCleanup(cleanup),
            timeout_seconds=timeout_seconds,
        )

        self._runs[run_id] = record
        self._events[run_id] = asyncio.Event()
        self._persist()

        logger.info("Spawning subagent '%s' [%s]", label, run_id)

        # Launch the execution as a background task
        task_obj = asyncio.create_task(
            self._run_agent(run_id, execute_fn),
            name=f"subagent-{run_id}",
        )
        self._tasks[run_id] = task_obj

        return run_id

    async def wait(
        self, run_id: str, timeout: Optional[float] = None,
    ) -> SubagentRunRecord:
        """
        Wait for a subagent to complete.

        Args:
            run_id: The subagent's run ID
            timeout: Max seconds to wait (None = use the agent's own timeout)

        Returns:
            The final SubagentRunRecord

        Raises:
            KeyError: If run_id doesn't exist
            asyncio.TimeoutError: If wait times out
        """
        if run_id not in self._runs:
            raise KeyError(f"Unknown subagent run: {run_id}")

        record = self._runs[run_id]
        if record.is_terminal:
            return record

        event = self._events.get(run_id)
        if not event:
            return record

        wait_timeout = timeout or record.timeout_seconds
        try:
            await asyncio.wait_for(event.wait(), timeout=wait_timeout)
        except asyncio.TimeoutError:
            # Mark as timed out
            record.status = SubagentStatus.TIMEOUT
            record.ended_at = time.time()
            record.error = f"Timed out after {wait_timeout}s"
            self._persist()
            logger.warning("Subagent '%s' timed out", record.label)

        return self._runs[run_id]

    async def cancel(self, run_id: str) -> SubagentRunRecord:
        """Cancel a running subagent."""
        if run_id not in self._runs:
            raise KeyError(f"Unknown subagent run: {run_id}")

        record = self._runs[run_id]
        if record.is_terminal:
            return record

        # Cancel the asyncio task
        task = self._tasks.get(run_id)
        if task and not task.done():
            task.cancel()

        record.status = SubagentStatus.CANCELLED
        record.ended_at = time.time()
        self._persist()

        # Signal waiters
        event = self._events.get(run_id)
        if event:
            event.set()

        logger.info("Cancelled subagent '%s' [%s]", record.label, run_id)
        return record

    def get(self, run_id: str) -> Optional[SubagentRunRecord]:
        """Get a subagent record by ID."""
        return self._runs.get(run_id)

    def list_active(self) -> List[SubagentRunRecord]:
        """List all active (non-terminal) subagents."""
        return [
            r for r in self._runs.values()
            if not r.is_terminal
        ]

    def list_for_parent(self, parent_session: str) -> List[SubagentRunRecord]:
        """List all subagents spawned by a specific parent session."""
        return [
            r for r in self._runs.values()
            if r.parent_session == parent_session
        ]

    def list_all(self) -> List[SubagentRunRecord]:
        """List all subagent records."""
        return list(self._runs.values())

    async def cleanup_completed(self, max_age_hours: int = 24) -> int:
        """Remove completed subagent records older than max_age_hours."""
        cutoff = time.time() - (max_age_hours * 3600)
        to_remove = [
            rid for rid, r in self._runs.items()
            if r.is_terminal and (r.ended_at or 0) < cutoff
        ]
        for rid in to_remove:
            del self._runs[rid]
            self._events.pop(rid, None)
            self._tasks.pop(rid, None)

        if to_remove:
            self._persist()
            logger.info("Cleaned up %d completed subagents", len(to_remove))

        return len(to_remove)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _run_agent(
        self,
        run_id: str,
        execute_fn: Callable[[str, str], Awaitable[str]],
    ) -> None:
        """Execute a subagent's task with timeout and error handling."""
        record = self._runs[run_id]
        record.status = SubagentStatus.RUNNING
        record.started_at = time.time()
        self._persist()

        logger.info(
            "Subagent '%s' started (model=%s, timeout=%ds)",
            record.label, record.model, record.timeout_seconds,
        )

        try:
            result = await asyncio.wait_for(
                execute_fn(record.task, record.model or ""),
                timeout=record.timeout_seconds,
            )

            record.status = SubagentStatus.COMPLETED
            record.result = result
            record.ended_at = time.time()

            logger.info(
                "Subagent '%s' completed in %.1fs",
                record.label, record.elapsed_seconds,
            )

        except asyncio.TimeoutError:
            record.status = SubagentStatus.TIMEOUT
            record.error = f"Execution exceeded {record.timeout_seconds}s timeout"
            record.ended_at = time.time()
            logger.warning("Subagent '%s' timed out", record.label)

        except asyncio.CancelledError:
            record.status = SubagentStatus.CANCELLED
            record.ended_at = time.time()
            logger.info("Subagent '%s' was cancelled", record.label)

        except Exception as e:
            record.status = SubagentStatus.FAILED
            record.error = str(e)
            record.ended_at = time.time()
            logger.error("Subagent '%s' failed: %s", record.label, e)

        finally:
            self._persist()

            # Signal waiters
            event = self._events.get(run_id)
            if event:
                event.set()

            # Notify parent
            if self._on_complete:
                try:
                    await self._on_complete(record)
                except Exception as e:
                    logger.error("on_complete callback failed: %s", e)

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _persist(self) -> None:
        """Save registry state to disk."""
        try:
            self._persist_path.parent.mkdir(parents=True, exist_ok=True)
            data = {
                rid: record.to_dict()
                for rid, record in self._runs.items()
            }
            tmp = self._persist_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
            tmp.replace(self._persist_path)
        except Exception as e:
            logger.warning("Failed to persist subagent registry: %s", e)

    def _restore(self) -> None:
        """Restore registry from disk (for crash recovery)."""
        if not self._persist_path.exists():
            return

        try:
            data = json.loads(
                self._persist_path.read_text(encoding="utf-8")
            )
            for rid, record_dict in data.items():
                record = SubagentRunRecord.from_dict(record_dict)
                # Mark non-terminal runs as failed (they were interrupted)
                if not record.is_terminal:
                    record.status = SubagentStatus.FAILED
                    record.error = "Interrupted by system restart"
                    record.ended_at = time.time()
                self._runs[rid] = record

            logger.info("Restored %d subagent records from disk", len(data))
        except Exception as e:
            logger.warning("Failed to restore subagent registry: %s", e)
