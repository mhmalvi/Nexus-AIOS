"""
AETHER Cron Service — Scheduled Agent Task Runner

Runs tasks on cron-like schedules. Each job can:
- Execute a tool
- Run an AI prompt
- Spawn a subagent
- Send a notification

Features:
- Standard cron syntax (minute hour day month weekday)
- Named schedules (e.g., "every morning", "hourly")
- Persistent job storage (survives restarts)
- Execution history & logging
- One-shot and recurring jobs
- Configurable per-job timeout
- Natural language schedule parsing

Inspired by OpenClaw's cron-service.ts
"""

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Optional, List, Dict, Any, Callable, Awaitable, Tuple

logger = logging.getLogger("aether.cron")


# ---------------------------------------------------------------------------
# Cron expression parser
# ---------------------------------------------------------------------------

NAMED_SCHEDULES: Dict[str, str] = {
    "every_minute":     "* * * * *",
    "every_5_minutes":  "*/5 * * * *",
    "every_15_minutes": "*/15 * * * *",
    "every_30_minutes": "*/30 * * * *",
    "hourly":           "0 * * * *",
    "every_2_hours":    "0 */2 * * *",
    "every_morning":    "0 8 * * *",
    "every_evening":    "0 18 * * *",
    "daily":            "0 9 * * *",
    "weekly":           "0 9 * * 1",        # Monday 9am
    "monthly":          "0 9 1 * *",        # 1st of month 9am
    "weekdays":         "0 9 * * 1-5",
    "weekends":         "0 10 * * 6,0",
    "midnight":         "0 0 * * *",
    "noon":             "0 12 * * *",
}


def parse_cron_field(field_str: str, min_val: int, max_val: int) -> List[int]:
    """Parse a single cron field into a list of matching values."""
    values = set()

    for part in field_str.split(","):
        part = part.strip()

        if part == "*":
            values.update(range(min_val, max_val + 1))

        elif "/" in part:
            # Step values: */5, 0-30/10
            base, step = part.split("/", 1)
            step = int(step)
            if base == "*":
                start = min_val
            elif "-" in base:
                start = int(base.split("-")[0])
            else:
                start = int(base)
            values.update(range(start, max_val + 1, step))

        elif "-" in part:
            # Range: 1-5
            lo, hi = part.split("-", 1)
            values.update(range(int(lo), int(hi) + 1))

        else:
            values.add(int(part))

    return sorted(v for v in values if min_val <= v <= max_val)


def matches_cron(cron_expr: str, dt: Optional[datetime] = None) -> bool:
    """Check if a datetime matches a cron expression."""
    if dt is None:
        dt = datetime.now()

    # Resolve named schedules
    cron_expr = NAMED_SCHEDULES.get(cron_expr, cron_expr)

    parts = cron_expr.split()
    if len(parts) != 5:
        raise ValueError(f"Invalid cron expression: {cron_expr}")

    minute, hour, day, month, weekday = parts

    minutes = parse_cron_field(minute, 0, 59)
    hours = parse_cron_field(hour, 0, 23)
    days = parse_cron_field(day, 1, 31)
    months = parse_cron_field(month, 1, 12)
    weekdays = parse_cron_field(weekday, 0, 6)

    return (
        dt.minute in minutes
        and dt.hour in hours
        and dt.day in days
        and dt.month in months
        and dt.weekday() in weekdays  # Python: 0=Monday
    )


def next_run_time(cron_expr: str, after: Optional[datetime] = None) -> datetime:
    """Calculate the next time a cron expression will fire."""
    if after is None:
        after = datetime.now()

    # Start checking from the next minute
    candidate = after.replace(second=0, microsecond=0) + timedelta(minutes=1)

    # Search up to 366 days ahead
    max_checks = 366 * 24 * 60
    for _ in range(max_checks):
        if matches_cron(cron_expr, candidate):
            return candidate
        candidate += timedelta(minutes=1)

    raise ValueError(f"Could not find next run time for: {cron_expr}")


# ---------------------------------------------------------------------------
# Job types
# ---------------------------------------------------------------------------

class JobType(str, Enum):
    PROMPT = "prompt"           # Send a prompt to the AI
    TOOL = "tool"               # Execute a specific tool
    SUBAGENT = "subagent"       # Spawn a subagent
    NOTIFICATION = "notification"  # Send a notification
    SHELL = "shell"             # Run a shell command


class JobStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    DISABLED = "disabled"
    ONE_SHOT = "one_shot"       # Run once then auto-disable


@dataclass
class CronJob:
    """A scheduled task."""
    job_id: str
    name: str
    schedule: str                   # Cron expression or named schedule
    job_type: JobType
    payload: Dict[str, Any]         # Type-specific payload
    status: JobStatus = JobStatus.ACTIVE
    timeout_seconds: int = 300
    created_at: float = field(default_factory=time.time)
    last_run: Optional[float] = None
    next_run: Optional[float] = None
    run_count: int = 0
    fail_count: int = 0
    last_error: Optional[str] = None
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["job_type"] = self.job_type.value
        d["status"] = self.status.value
        return d

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "CronJob":
        d["job_type"] = JobType(d.get("job_type", "prompt"))
        d["status"] = JobStatus(d.get("status", "active"))
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class JobExecutionRecord:
    """Record of a single job execution."""
    job_id: str
    started_at: float
    ended_at: Optional[float] = None
    success: bool = False
    result: Optional[str] = None
    error: Optional[str] = None

    @property
    def duration_seconds(self) -> float:
        if self.ended_at:
            return self.ended_at - self.started_at
        return 0.0


# ---------------------------------------------------------------------------
# Cron Service
# ---------------------------------------------------------------------------

class CronService:
    """
    AETHER's task scheduling service.

    Usage:
        cron = CronService(execute_fn=my_executor)
        await cron.initialize()

        # Add a job
        job_id = await cron.add_job(
            name="Morning Briefing",
            schedule="every_morning",
            job_type=JobType.PROMPT,
            payload={"prompt": "Give me a morning briefing: weather, calendar, tasks."},
        )

        # Start the scheduler
        await cron.start()

        # Manual trigger
        await cron.trigger(job_id)

        # Stop
        await cron.stop()
    """

    def __init__(
        self,
        persist_path: Optional[str] = None,
        execute_fn: Optional[Callable[[CronJob], Awaitable[str]]] = None,
        max_concurrent: int = 3,
    ):
        self._jobs: Dict[str, CronJob] = {}
        self._history: List[JobExecutionRecord] = []
        self._max_history = 500
        self._running = False
        self._loop_task: Optional[asyncio.Task] = None
        self._execute_fn = execute_fn
        self._max_concurrent = max_concurrent
        self._active_executions: Dict[str, asyncio.Task] = {}

        # Persistence
        if persist_path:
            self._persist_path = Path(persist_path)
        else:
            self._persist_path = Path.home() / ".aether" / "cron_jobs.json"

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        """Load persisted jobs from disk."""
        self._restore()
        # Update next_run times
        for job in self._jobs.values():
            if job.status == JobStatus.ACTIVE:
                try:
                    job.next_run = next_run_time(job.schedule).timestamp()
                except Exception as e:
                    logger.warning("Invalid schedule for job '%s': %s", job.name, e)

        logger.info("Cron service initialized with %d jobs", len(self._jobs))

    async def start(self) -> None:
        """Start the scheduler loop."""
        if self._running:
            return

        self._running = True
        self._loop_task = asyncio.create_task(self._scheduler_loop())
        logger.info("Cron scheduler started")

    async def stop(self) -> None:
        """Stop the scheduler."""
        self._running = False

        # Cancel active executions
        for task in self._active_executions.values():
            if not task.done():
                task.cancel()

        if self._loop_task and not self._loop_task.done():
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass

        logger.info("Cron scheduler stopped")

    # ------------------------------------------------------------------
    # Job management
    # ------------------------------------------------------------------

    async def add_job(
        self,
        name: str,
        schedule: str,
        job_type: JobType,
        payload: Dict[str, Any],
        one_shot: bool = False,
        timeout_seconds: int = 300,
        tags: Optional[List[str]] = None,
    ) -> str:
        """
        Add a new scheduled job.

        Args:
            name: Human-readable job name
            schedule: Cron expression or named schedule
            job_type: Type of job (prompt, tool, subagent, notification, shell)
            payload: Job-specific payload (e.g., {"prompt": "..."})
            one_shot: If True, job auto-disables after first run
            timeout_seconds: Max execution time
            tags: Optional tags for categorization

        Returns:
            job_id: Unique job identifier
        """
        # Validate schedule
        resolved = NAMED_SCHEDULES.get(schedule, schedule)
        parts = resolved.split()
        if len(parts) != 5:
            raise ValueError(f"Invalid cron schedule: {schedule}")

        job_id = f"cron_{uuid.uuid4().hex[:10]}"

        job = CronJob(
            job_id=job_id,
            name=name,
            schedule=schedule,
            job_type=job_type,
            payload=payload,
            status=JobStatus.ONE_SHOT if one_shot else JobStatus.ACTIVE,
            timeout_seconds=timeout_seconds,
            tags=tags or [],
        )

        try:
            job.next_run = next_run_time(schedule).timestamp()
        except Exception:
            pass

        self._jobs[job_id] = job
        self._persist()

        logger.info("Added cron job '%s' [%s] schedule=%s", name, job_id, schedule)
        return job_id

    async def remove_job(self, job_id: str) -> bool:
        """Remove a job by ID."""
        if job_id in self._jobs:
            del self._jobs[job_id]
            self._persist()
            logger.info("Removed cron job: %s", job_id)
            return True
        return False

    async def pause_job(self, job_id: str) -> bool:
        """Pause a job."""
        job = self._jobs.get(job_id)
        if job:
            job.status = JobStatus.PAUSED
            self._persist()
            return True
        return False

    async def resume_job(self, job_id: str) -> bool:
        """Resume a paused job."""
        job = self._jobs.get(job_id)
        if job and job.status == JobStatus.PAUSED:
            job.status = JobStatus.ACTIVE
            try:
                job.next_run = next_run_time(job.schedule).timestamp()
            except Exception:
                pass
            self._persist()
            return True
        return False

    async def trigger(self, job_id: str) -> Optional[JobExecutionRecord]:
        """Manually trigger a job immediately."""
        job = self._jobs.get(job_id)
        if not job:
            raise KeyError(f"Unknown job: {job_id}")

        return await self._execute_job(job)

    def list_jobs(
        self,
        status: Optional[JobStatus] = None,
        tags: Optional[List[str]] = None,
    ) -> List[CronJob]:
        """List jobs with optional filtering."""
        jobs = list(self._jobs.values())

        if status:
            jobs = [j for j in jobs if j.status == status]

        if tags:
            tag_set = set(tags)
            jobs = [j for j in jobs if tag_set.intersection(j.tags)]

        return sorted(jobs, key=lambda j: j.next_run or 0)

    def get_job(self, job_id: str) -> Optional[CronJob]:
        return self._jobs.get(job_id)

    def get_history(
        self, job_id: Optional[str] = None, limit: int = 50,
    ) -> List[JobExecutionRecord]:
        """Get execution history, optionally filtered by job."""
        records = self._history
        if job_id:
            records = [r for r in records if r.job_id == job_id]
        return records[-limit:]

    # ------------------------------------------------------------------
    # Scheduler loop
    # ------------------------------------------------------------------

    async def _scheduler_loop(self) -> None:
        """Main scheduler loop — checks every 30 seconds."""
        logger.info("Scheduler loop running")

        while self._running:
            try:
                now = time.time()

                for job in list(self._jobs.values()):
                    if job.status not in (JobStatus.ACTIVE, JobStatus.ONE_SHOT):
                        continue

                    if job.next_run and now >= job.next_run:
                        # Check concurrent limit
                        active = sum(
                            1 for t in self._active_executions.values()
                            if not t.done()
                        )
                        if active >= self._max_concurrent:
                            logger.warning(
                                "Skipping job '%s': max concurrent (%d) reached",
                                job.name, self._max_concurrent,
                            )
                            continue

                        # Execute in background
                        task = asyncio.create_task(self._execute_job(job))
                        self._active_executions[job.job_id] = task

                # Clean completed tasks
                self._active_executions = {
                    jid: t for jid, t in self._active_executions.items()
                    if not t.done()
                }

                await asyncio.sleep(30)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Scheduler loop error: %s", e)
                await asyncio.sleep(30)

    async def _execute_job(self, job: CronJob) -> JobExecutionRecord:
        """Execute a single job."""
        record = JobExecutionRecord(
            job_id=job.job_id,
            started_at=time.time(),
        )

        logger.info("Executing cron job '%s' [%s]", job.name, job.job_id)

        try:
            if self._execute_fn:
                result = await asyncio.wait_for(
                    self._execute_fn(job),
                    timeout=job.timeout_seconds,
                )
                record.result = result
                record.success = True
            else:
                record.result = "No executor configured"
                record.success = False

        except asyncio.TimeoutError:
            record.error = f"Timed out after {job.timeout_seconds}s"
            record.success = False
            job.fail_count += 1

        except Exception as e:
            record.error = str(e)
            record.success = False
            job.fail_count += 1
            logger.error("Job '%s' failed: %s", job.name, e)

        finally:
            record.ended_at = time.time()
            job.last_run = record.started_at
            job.run_count += 1

            if record.error:
                job.last_error = record.error

            # Schedule next run
            if job.status == JobStatus.ONE_SHOT:
                job.status = JobStatus.DISABLED
                job.next_run = None
            else:
                try:
                    job.next_run = next_run_time(job.schedule).timestamp()
                except Exception:
                    pass

            self._history.append(record)
            if len(self._history) > self._max_history:
                self._history = self._history[-self._max_history:]

            self._persist()

        return record

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _persist(self) -> None:
        try:
            self._persist_path.parent.mkdir(parents=True, exist_ok=True)
            data = {
                "jobs": {jid: j.to_dict() for jid, j in self._jobs.items()},
            }
            tmp = self._persist_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
            tmp.replace(self._persist_path)
        except Exception as e:
            logger.warning("Failed to persist cron jobs: %s", e)

    def _restore(self) -> None:
        if not self._persist_path.exists():
            return

        try:
            data = json.loads(
                self._persist_path.read_text(encoding="utf-8")
            )
            for jid, job_dict in data.get("jobs", {}).items():
                self._jobs[jid] = CronJob.from_dict(job_dict)

            logger.info("Restored %d cron jobs from disk", len(self._jobs))
        except Exception as e:
            logger.warning("Failed to restore cron jobs: %s", e)
