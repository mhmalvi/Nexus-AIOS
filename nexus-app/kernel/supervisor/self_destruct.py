"""
AETHER Self-Destruct System -- Kill Switch & Dead Man Switch

Execution logic for:
- Soft Lock: disable agents, emit lock event
- Hard Lock: wipe API keys from config
- Data Wipe: secure-erase ~/.aether/ directory
- Dead Man Switch: daemon checking owner check-in interval
"""

import asyncio
import json
import logging
import os
import shutil
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, Any, Callable, Awaitable

logger = logging.getLogger("aether.destruct")


class LockLevel(str, Enum):
    """System lock levels, escalating in severity."""
    NONE = "none"
    SOFT = "soft"
    HARD = "hard"
    WIPED = "wiped"


@dataclass
class DestructConfig:
    """Self-destruct configuration."""
    enabled: bool = False
    soft_lock_attempts: int = 3
    hard_lock_attempts: int = 5
    dead_man_switch_days: int = 0
    wipe_on_destruct: bool = False
    pin_hash: str = ""

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "DestructConfig":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class DestructState:
    """Current self-destruct state with persistence."""
    lock_level: LockLevel = LockLevel.NONE
    failed_auth_count: int = 0
    last_owner_checkin: float = field(default_factory=time.time)
    triggered_at: Optional[float] = None


class SelfDestructEngine:
    """
    Manages self-destruct levels and dead man switch.

    Usage:
        engine = SelfDestructEngine(config_dict, on_lock_change=callback)
        await engine.start()
        engine.record_failed_auth()
        engine.owner_checkin()
        await engine.trigger_soft_lock()
        await engine.trigger_hard_lock()
        await engine.trigger_data_wipe()
        await engine.stop()
    """

    def __init__(
        self,
        config: Optional[Dict[str, Any]] = None,
        aether_home: Optional[str] = None,
        on_lock_change: Optional[Callable[[LockLevel], Awaitable[None]]] = None,
    ):
        self._config = DestructConfig.from_dict(config or {})
        self._home = Path(aether_home or (Path.home() / ".aether"))
        self._state = DestructState()
        self._on_lock_change = on_lock_change
        self._daemon_task: Optional[asyncio.Task] = None
        self._state_path = self._home / "destruct_state.json"
        self._restore_state()

    # ---- Properties ----

    @property
    def lock_level(self) -> LockLevel:
        return self._state.lock_level

    @property
    def is_locked(self) -> bool:
        return self._state.lock_level != LockLevel.NONE

    # ---- Lifecycle ----

    async def start(self) -> None:
        """Start the dead man switch daemon if configured."""
        if self._config.dead_man_switch_days > 0:
            self._daemon_task = asyncio.create_task(self._dead_man_loop())
            logger.info(
                "Dead man switch started (check-in every %d days)",
                self._config.dead_man_switch_days,
            )

    async def stop(self) -> None:
        """Stop the dead man switch daemon."""
        if self._daemon_task and not self._daemon_task.done():
            self._daemon_task.cancel()
            try:
                await self._daemon_task
            except asyncio.CancelledError:
                pass

    # ---- Auth tracking ----

    def record_failed_auth(self) -> LockLevel:
        """Record a failed auth attempt. Auto-escalates lock level."""
        self._state.failed_auth_count += 1
        count = self._state.failed_auth_count
        logger.warning("Failed auth attempt #%d", count)

        if count >= self._config.hard_lock_attempts:
            asyncio.create_task(self.trigger_hard_lock())
            return LockLevel.HARD
        elif count >= self._config.soft_lock_attempts:
            asyncio.create_task(self.trigger_soft_lock())
            return LockLevel.SOFT

        self._persist_state()
        return self._state.lock_level

    def reset_auth_count(self) -> None:
        """Reset failed auth counter (after successful auth)."""
        self._state.failed_auth_count = 0
        self._persist_state()

    def owner_checkin(self) -> None:
        """Record an owner check-in (resets dead man switch timer)."""
        self._state.last_owner_checkin = time.time()
        self._persist_state()
        logger.info("Owner check-in recorded")

    # ---- Lock level triggers ----

    async def trigger_soft_lock(self) -> None:
        """Soft lock: disable agents, lock UI."""
        self._state.lock_level = LockLevel.SOFT
        self._state.triggered_at = time.time()
        self._persist_state()
        logger.warning("SOFT LOCK activated")

        if self._on_lock_change:
            await self._on_lock_change(LockLevel.SOFT)

    async def trigger_hard_lock(self) -> None:
        """Hard lock: wipe API keys from config."""
        self._state.lock_level = LockLevel.HARD
        self._state.triggered_at = time.time()
        self._persist_state()
        logger.critical("HARD LOCK activated")

        # Wipe API keys from config
        config_path = self._home / "config.json"
        if config_path.exists():
            try:
                data = json.loads(config_path.read_text(encoding="utf-8"))
                if "api_keys" in data:
                    data["api_keys"] = {k: "" for k in data["api_keys"]}
                    config_path.write_text(
                        json.dumps(data, indent=2), encoding="utf-8"
                    )
                    logger.info("API keys wiped from config")
            except Exception as e:
                logger.error("Failed to wipe API keys: %s", e)

        if self._on_lock_change:
            await self._on_lock_change(LockLevel.HARD)

        if self._config.wipe_on_destruct:
            await self.trigger_data_wipe()

    async def trigger_data_wipe(self) -> None:
        """Full wipe: secure-erase ~/.aether/ directory."""
        self._state.lock_level = LockLevel.WIPED
        logger.critical("DATA WIPE initiated on %s", self._home)

        target = self._home
        if target.exists():
            # Overwrite sensitive files before deletion
            sensitive_globs = ["*.json", "*.db", "*.lance", "*.key"]
            for pattern in sensitive_globs:
                for f in target.rglob(pattern):
                    try:
                        size = f.stat().st_size
                        f.write_bytes(os.urandom(min(size, 1024 * 1024)))
                        f.unlink()
                    except Exception:
                        pass

            try:
                shutil.rmtree(target)
                logger.info("Data wipe complete: %s removed", target)
            except Exception as e:
                logger.error("Data wipe incomplete: %s", e)

        if self._on_lock_change:
            await self._on_lock_change(LockLevel.WIPED)

    # ---- Unlock ----

    async def unlock(self, pin: str) -> bool:
        """Attempt to unlock (soft lock only). Returns True on success."""
        if self._state.lock_level != LockLevel.SOFT:
            logger.warning("Cannot unlock: level is %s", self._state.lock_level.value)
            return False

        # Simple PIN check (in production, use bcrypt/argon2)
        if self._config.pin_hash and pin != self._config.pin_hash:
            self.record_failed_auth()
            return False

        self._state.lock_level = LockLevel.NONE
        self._state.failed_auth_count = 0
        self._state.triggered_at = None
        self._persist_state()
        logger.info("System unlocked")

        if self._on_lock_change:
            await self._on_lock_change(LockLevel.NONE)
        return True

    # ---- Dead Man Switch ----

    async def _dead_man_loop(self) -> None:
        """Background daemon: check owner check-in interval."""
        check_interval = 3600  # Check every hour
        while True:
            try:
                await asyncio.sleep(check_interval)
                if self._config.dead_man_switch_days <= 0:
                    continue

                deadline_seconds = self._config.dead_man_switch_days * 86400
                elapsed = time.time() - self._state.last_owner_checkin

                if elapsed > deadline_seconds:
                    hours_overdue = (elapsed - deadline_seconds) / 3600
                    logger.warning(
                        "Dead man switch triggered (%.0f hours overdue)",
                        hours_overdue,
                    )
                    await self.trigger_soft_lock()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Dead man switch error: %s", e)

    # ---- State persistence ----

    def _persist_state(self) -> None:
        """Save current state to disk."""
        try:
            self._home.mkdir(parents=True, exist_ok=True)
            self._state_path.write_text(
                json.dumps(
                    {
                        "lock_level": self._state.lock_level.value,
                        "failed_auth_count": self._state.failed_auth_count,
                        "last_owner_checkin": self._state.last_owner_checkin,
                        "triggered_at": self._state.triggered_at,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
        except Exception as e:
            logger.warning("Failed to persist destruct state: %s", e)

    def _restore_state(self) -> None:
        """Load state from disk."""
        if not self._state_path.exists():
            return
        try:
            d = json.loads(self._state_path.read_text(encoding="utf-8"))
            self._state.lock_level = LockLevel(d.get("lock_level", "none"))
            self._state.failed_auth_count = d.get("failed_auth_count", 0)
            self._state.last_owner_checkin = d.get(
                "last_owner_checkin", time.time()
            )
            self._state.triggered_at = d.get("triggered_at")
        except Exception as e:
            logger.warning("Failed to restore destruct state: %s", e)

    # ---- Status ----

    def get_status(self) -> Dict[str, Any]:
        """Get current self-destruct status."""
        return {
            "enabled": self._config.enabled,
            "lock_level": self._state.lock_level.value,
            "failed_auths": self._state.failed_auth_count,
            "dead_man_switch_days": self._config.dead_man_switch_days,
            "hours_since_checkin": (
                time.time() - self._state.last_owner_checkin
            )
            / 3600,
        }
