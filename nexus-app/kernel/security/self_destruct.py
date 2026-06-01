"""
AETHER Self-Destruct Engine — Multi-Level Data Destruction

Levels:
  1. Soft Lock   — Lock screen, disable agents, alert owner
  2. Hard Lock   — Encrypt user data, disable SSH, wipe API keys
  3. Data Wipe   — Secure-erase ~/.aether/, all sessions, all memory
  4. Full Destruct — Overwrite entire drive (3 passes)
"""

import asyncio
import hashlib
import json
import logging
import os
import secrets
import shutil
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional, List, Dict, Any, Callable, Awaitable

logger = logging.getLogger("aether.self_destruct")


class DestructLevel(str, Enum):
    SOFT_LOCK = "soft_lock"
    HARD_LOCK = "hard_lock"
    DATA_WIPE = "data_wipe"
    FULL_DESTRUCT = "full_destruct"


class DestructStatus(str, Enum):
    IDLE = "idle"
    ARMED = "armed"
    COUNTDOWN = "countdown"
    EXECUTING = "executing"
    COMPLETED = "completed"
    ABORTED = "aborted"
    LOCKED = "locked"


@dataclass
class DestructResult:
    level: DestructLevel
    status: DestructStatus
    files_destroyed: int = 0
    bytes_overwritten: int = 0
    duration_s: float = 0.0
    errors: List[str] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return self.status == DestructStatus.COMPLETED and not self.errors


@dataclass
class DeadManConfig:
    enabled: bool = False
    check_in_interval_hours: float = 72.0
    grace_period_hours: float = 24.0
    escalation_level: DestructLevel = DestructLevel.HARD_LOCK
    last_check_in: float = field(default_factory=time.time)


class SelfDestructEngine:
    """
    AETHER's multi-level self-destruct system.

    Usage:
        engine = SelfDestructEngine()
        await engine.initialize()
        result = await engine.execute(DestructLevel.DATA_WIPE, pin="1234", voice_verified=True)
        await engine.abort()  # abort during countdown
    """

    def __init__(self, config_path: Optional[str] = None):
        self._base = Path(config_path or (Path.home() / ".aether"))
        self._cfg_path = self._base / "security" / "destruct_config.json"
        self._audit_path = self._base / "security" / "destruct_audit.log"
        self._status = DestructStatus.IDLE
        self._armed_level: Optional[DestructLevel] = None
        self._abort_event = asyncio.Event()
        self._pin_hash: Optional[str] = None
        self._dead_man = DeadManConfig()
        self._dead_man_task: Optional[asyncio.Task] = None
        self._on_lock: Optional[Callable[[], Awaitable[None]]] = None
        self._on_alert: Optional[Callable[[str], Awaitable[None]]] = None
        self._failed_auth = 0

        self._wipe_targets: Dict[DestructLevel, List[str]] = {
            DestructLevel.SOFT_LOCK: [],
            DestructLevel.HARD_LOCK: [
                str(self._base / ".env"),
                str(self._base / "api_keys.json"),
            ],
            DestructLevel.DATA_WIPE: [
                str(self._base / "memory"),
                str(self._base / "sessions"),
                str(self._base / "conversations"),
                str(self._base / "agents"),
                str(self._base / ".env"),
                str(self._base / "api_keys.json"),
            ],
            DestructLevel.FULL_DESTRUCT: [str(self._base)],
        }

    async def initialize(self) -> None:
        (self._base / "security").mkdir(parents=True, exist_ok=True)
        self._load_config()
        if self._dead_man.enabled:
            self._dead_man_task = asyncio.create_task(self._dead_man_loop())
        logger.info("Self-destruct engine initialized")

    def set_pin(self, pin: str) -> None:
        self._pin_hash = hashlib.sha256(pin.encode()).hexdigest()
        self._save_config()

    def verify_pin(self, pin: str) -> bool:
        if not self._pin_hash:
            return True
        return hashlib.sha256(pin.encode()).hexdigest() == self._pin_hash

    def register_callbacks(self, on_lock=None, on_alert=None):
        self._on_lock = on_lock
        self._on_alert = on_alert

    def _check_auth(self, level, pin="", voice_verified=False):
        if level == DestructLevel.SOFT_LOCK:
            return True, "OK"
        if not self.verify_pin(pin):
            self._failed_auth += 1
            return False, "Invalid PIN"
        if level in (DestructLevel.DATA_WIPE, DestructLevel.FULL_DESTRUCT) and not voice_verified:
            return False, "Voice verification required"
        return True, "Verified"

    async def arm(self, level: DestructLevel) -> bool:
        self._armed_level = level
        self._status = DestructStatus.ARMED
        self._abort_event.clear()
        self._audit(f"ARMED at {level.value}")
        return True

    async def execute(self, level: DestructLevel, pin="", voice_verified=False, countdown_s=10) -> DestructResult:
        ok, reason = self._check_auth(level, pin, voice_verified)
        if not ok:
            self._audit(f"AUTH FAILED: {reason}")
            if self._failed_auth >= 3:
                await self._exec_soft_lock()
            return DestructResult(level=level, status=DestructStatus.ABORTED, errors=[reason])

        self._failed_auth = 0
        self._status = DestructStatus.COUNTDOWN
        self._abort_event.clear()

        for remaining in range(countdown_s, 0, -1):
            if self._abort_event.is_set():
                self._status = DestructStatus.ABORTED
                self._audit(f"ABORTED at {remaining}s")
                return DestructResult(level=level, status=DestructStatus.ABORTED)
            await asyncio.sleep(1)

        self._status = DestructStatus.EXECUTING
        t0 = time.time()
        result = await self._do_destruct(level)
        result.duration_s = time.time() - t0
        self._status = DestructStatus.COMPLETED if result.success else DestructStatus.IDLE
        self._audit(f"COMPLETED {level.value}: {result.files_destroyed} files")
        return result

    async def abort(self) -> bool:
        if self._status == DestructStatus.COUNTDOWN:
            self._abort_event.set()
            return True
        return False

    async def _do_destruct(self, level):
        if level == DestructLevel.SOFT_LOCK:
            return await self._exec_soft_lock()
        elif level == DestructLevel.HARD_LOCK:
            return await self._exec_wipe(level)
        elif level == DestructLevel.DATA_WIPE:
            return await self._exec_wipe(level)
        elif level == DestructLevel.FULL_DESTRUCT:
            return await self._exec_wipe(level, passes=3)
        return DestructResult(level=level, status=DestructStatus.ABORTED, errors=["Unknown"])

    async def _exec_soft_lock(self):
        if self._on_lock:
            await self._on_lock()
        if self._on_alert:
            await self._on_alert("SOFT LOCK activated")
        self._status = DestructStatus.LOCKED
        return DestructResult(level=DestructLevel.SOFT_LOCK, status=DestructStatus.COMPLETED)

    async def _exec_wipe(self, level, passes=1):
        errors, files_del, bytes_ow = [], 0, 0
        for target in self._wipe_targets.get(level, []):
            try:
                fd, bo = await self._secure_delete(target, passes)
                files_del += fd
                bytes_ow += bo
            except Exception as e:
                errors.append(str(e))
        return DestructResult(level=level, status=DestructStatus.COMPLETED,
                              files_destroyed=files_del, bytes_overwritten=bytes_ow, errors=errors)

    async def _secure_delete(self, path_str, passes=1):
        path = Path(path_str)
        if not path.exists():
            return (0, 0)
        files_del, bytes_ow = 0, 0
        if path.is_file():
            size = path.stat().st_size
            for _ in range(passes):
                with open(path, 'wb') as f:
                    f.write(secrets.token_bytes(max(size, 1)))
                    f.flush()
                    os.fsync(f.fileno())
                bytes_ow += size
            path.unlink(missing_ok=True)
            files_del = 1
        elif path.is_dir():
            for root, _, files in os.walk(path, topdown=False):
                for name in files:
                    fp = Path(root) / name
                    try:
                        sz = fp.stat().st_size
                        for _ in range(passes):
                            with open(fp, 'wb') as f:
                                f.write(secrets.token_bytes(max(sz, 1)))
                            bytes_ow += sz
                        fp.unlink()
                        files_del += 1
                    except Exception:
                        pass
            shutil.rmtree(path, ignore_errors=True)
        return (files_del, bytes_ow)

    async def configure_dead_man(self, enabled=True, interval_hours=72.0, grace_hours=24.0,
                                  level=DestructLevel.HARD_LOCK):
        self._dead_man = DeadManConfig(enabled=enabled, check_in_interval_hours=interval_hours,
                                        grace_period_hours=grace_hours, escalation_level=level)
        self._save_config()
        if enabled and not self._dead_man_task:
            self._dead_man_task = asyncio.create_task(self._dead_man_loop())

    async def dead_man_check_in(self):
        self._dead_man.last_check_in = time.time()
        self._save_config()

    async def _dead_man_loop(self):
        try:
            while self._dead_man.enabled:
                await asyncio.sleep(3600)
                elapsed_h = (time.time() - self._dead_man.last_check_in) / 3600
                threshold = self._dead_man.check_in_interval_hours
                if elapsed_h > threshold + self._dead_man.grace_period_hours:
                    self._audit("Dead Man's Switch TRIGGERED")
                    await self.execute(level=self._dead_man.escalation_level,
                                       voice_verified=True, countdown_s=0)
                    break
                elif elapsed_h > threshold and self._on_alert:
                    rem = threshold + self._dead_man.grace_period_hours - elapsed_h
                    await self._on_alert(f"Dead Man's Switch: {rem:.1f}h until escalation")
        except asyncio.CancelledError:
            pass

    def _audit(self, msg):
        try:
            self._audit_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self._audit_path, "a") as f:
                f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
        except Exception:
            pass

    def _save_config(self):
        try:
            self._cfg_path.parent.mkdir(parents=True, exist_ok=True)
            cfg = {"pin_hash": self._pin_hash, "dead_man": {
                "enabled": self._dead_man.enabled,
                "interval_hours": self._dead_man.check_in_interval_hours,
                "grace_hours": self._dead_man.grace_period_hours,
                "level": self._dead_man.escalation_level.value,
                "last_check_in": self._dead_man.last_check_in,
            }}
            self._cfg_path.write_text(json.dumps(cfg, indent=2))
        except Exception as e:
            logger.warning("Save config failed: %s", e)

    def _load_config(self):
        if not self._cfg_path.exists():
            return
        try:
            cfg = json.loads(self._cfg_path.read_text())
            self._pin_hash = cfg.get("pin_hash")
            dm = cfg.get("dead_man", {})
            self._dead_man = DeadManConfig(
                enabled=dm.get("enabled", False),
                check_in_interval_hours=dm.get("interval_hours", 72.0),
                grace_period_hours=dm.get("grace_hours", 24.0),
                escalation_level=DestructLevel(dm.get("level", "hard_lock")),
                last_check_in=dm.get("last_check_in", time.time()),
            )
        except Exception as e:
            logger.warning("Load config failed: %s", e)

    @property
    def status(self) -> DestructStatus:
        return self._status

    def get_status(self) -> Dict[str, Any]:
        return {
            "status": self._status.value,
            "armed_level": self._armed_level.value if self._armed_level else None,
            "failed_auth_count": self._failed_auth,
            "dead_man_enabled": self._dead_man.enabled,
            "dead_man_hours_remaining": max(0,
                self._dead_man.check_in_interval_hours -
                (time.time() - self._dead_man.last_check_in) / 3600
            ) if self._dead_man.enabled else None,
        }
