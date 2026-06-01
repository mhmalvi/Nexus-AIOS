"""
AETHER Health Monitor — System Resource Tracking & Alerting

Continuously monitors system health and reports to the orchestrator.

Tracks:
- CPU usage (per-core and aggregate)
- Memory (RAM) usage
- Disk usage
- GPU utilization (if available)
- Network I/O
- Process count
- AETHER-specific metrics (LLM latency, memory tier sizes, agent count)

Features:
- Configurable check interval
- Alert thresholds (warning/critical)
- Historical metrics buffer
- System info snapshot
- Graceful degradation if psutil unavailable
"""

import asyncio
import logging
import os
import platform
import time
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Callable, Awaitable

logger = logging.getLogger("aether.health")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

@dataclass
class SystemMetrics:
    """Snapshot of system resource usage."""
    timestamp: float = field(default_factory=time.time)
    cpu_percent: float = 0.0
    cpu_count: int = 0
    memory_total_mb: float = 0.0
    memory_used_mb: float = 0.0
    memory_percent: float = 0.0
    disk_total_gb: float = 0.0
    disk_used_gb: float = 0.0
    disk_percent: float = 0.0
    gpu_percent: float = 0.0
    gpu_memory_mb: float = 0.0
    net_sent_mb: float = 0.0
    net_recv_mb: float = 0.0
    process_count: int = 0
    uptime_seconds: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "cpu_percent": round(self.cpu_percent, 1),
            "cpu_count": self.cpu_count,
            "memory_total_mb": round(self.memory_total_mb, 0),
            "memory_used_mb": round(self.memory_used_mb, 0),
            "memory_percent": round(self.memory_percent, 1),
            "disk_total_gb": round(self.disk_total_gb, 1),
            "disk_used_gb": round(self.disk_used_gb, 1),
            "disk_percent": round(self.disk_percent, 1),
            "gpu_percent": round(self.gpu_percent, 1),
            "net_sent_mb": round(self.net_sent_mb, 1),
            "net_recv_mb": round(self.net_recv_mb, 1),
            "process_count": self.process_count,
            "uptime_seconds": round(self.uptime_seconds, 0),
        }


@dataclass
class AlertThresholds:
    """Configurable alert thresholds."""
    cpu_warning: float = 80.0
    cpu_critical: float = 95.0
    memory_warning: float = 80.0
    memory_critical: float = 95.0
    disk_warning: float = 85.0
    disk_critical: float = 95.0
    gpu_warning: float = 90.0
    gpu_critical: float = 98.0


@dataclass
class HealthAlert:
    """A health alert."""
    level: str       # "warning" or "critical"
    metric: str
    value: float
    threshold: float
    message: str
    timestamp: float = field(default_factory=time.time)


# ---------------------------------------------------------------------------
# Health Monitor
# ---------------------------------------------------------------------------

class HealthMonitor:
    """
    AETHER's system health tracker.

    Usage:
        monitor = HealthMonitor(check_interval=30)
        await monitor.start()

        # Get current metrics
        metrics = await monitor.get_metrics()
        print(f"CPU: {metrics.cpu_percent}%, RAM: {metrics.memory_percent}%")

        # Get system info
        info = monitor.get_system_info()

        await monitor.stop()
    """

    def __init__(
        self,
        check_interval: int = 30,
        thresholds: Optional[AlertThresholds] = None,
        on_alert: Optional[Callable[[HealthAlert], Awaitable[None]]] = None,
        history_size: int = 500,
    ):
        self._check_interval = check_interval
        self._thresholds = thresholds or AlertThresholds()
        self._on_alert = on_alert
        self._history_size = history_size

        self._running = False
        self._loop_task: Optional[asyncio.Task] = None
        self._history: List[SystemMetrics] = []
        self._alerts: List[HealthAlert] = []
        self._boot_time = time.time()

        # psutil availability
        self._psutil = None
        try:
            import psutil
            self._psutil = psutil
        except ImportError:
            logger.warning("psutil not available — health metrics will be limited")

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start periodic health monitoring."""
        if self._running:
            return

        self._running = True
        self._loop_task = asyncio.create_task(self._monitor_loop())
        logger.info("Health monitor started (interval=%ds)", self._check_interval)

    async def stop(self) -> None:
        """Stop monitoring."""
        self._running = False
        if self._loop_task and not self._loop_task.done():
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        logger.info("Health monitor stopped")

    async def _monitor_loop(self) -> None:
        """Background monitoring loop."""
        while self._running:
            try:
                metrics = await self.get_metrics()
                self._history.append(metrics)

                if len(self._history) > self._history_size:
                    self._history = self._history[-self._history_size:]

                # Check thresholds
                await self._check_alerts(metrics)

                await asyncio.sleep(self._check_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Health check error: %s", e)
                await asyncio.sleep(self._check_interval)

    # ------------------------------------------------------------------
    # Metrics Collection
    # ------------------------------------------------------------------

    async def get_metrics(self) -> SystemMetrics:
        """Collect current system metrics."""
        metrics = SystemMetrics(
            uptime_seconds=time.time() - self._boot_time,
        )

        if self._psutil:
            try:
                # CPU
                metrics.cpu_percent = self._psutil.cpu_percent(interval=0.1)
                metrics.cpu_count = self._psutil.cpu_count()

                # Memory
                mem = self._psutil.virtual_memory()
                metrics.memory_total_mb = mem.total / (1024 * 1024)
                metrics.memory_used_mb = mem.used / (1024 * 1024)
                metrics.memory_percent = mem.percent

                # Disk
                disk = self._psutil.disk_usage("/")
                metrics.disk_total_gb = disk.total / (1024 ** 3)
                metrics.disk_used_gb = disk.used / (1024 ** 3)
                metrics.disk_percent = disk.percent

                # Network
                net = self._psutil.net_io_counters()
                metrics.net_sent_mb = net.bytes_sent / (1024 * 1024)
                metrics.net_recv_mb = net.bytes_recv / (1024 * 1024)

                # Processes
                metrics.process_count = len(self._psutil.pids())

            except Exception as e:
                logger.debug("psutil metric error: %s", e)

        else:
            # Fallback: basic OS info
            metrics.cpu_count = os.cpu_count() or 1

        # GPU (try nvidia-smi)
        metrics.gpu_percent, metrics.gpu_memory_mb = await self._get_gpu_metrics()

        return metrics

    async def _get_gpu_metrics(self) -> tuple:
        """Try to get GPU utilization."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "nvidia-smi",
                "--query-gpu=utilization.gpu,memory.used",
                "--format=csv,nounits,noheader",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)

            if proc.returncode == 0:
                line = stdout.decode().strip().split(",")
                if len(line) >= 2:
                    return float(line[0].strip()), float(line[1].strip())

        except (FileNotFoundError, asyncio.TimeoutError):
            pass
        except Exception:
            pass

        return 0.0, 0.0

    # ------------------------------------------------------------------
    # Alerts
    # ------------------------------------------------------------------

    async def _check_alerts(self, metrics: SystemMetrics) -> None:
        """Check metrics against thresholds and fire alerts."""
        checks = [
            ("cpu", metrics.cpu_percent,
             self._thresholds.cpu_warning, self._thresholds.cpu_critical),
            ("memory", metrics.memory_percent,
             self._thresholds.memory_warning, self._thresholds.memory_critical),
            ("disk", metrics.disk_percent,
             self._thresholds.disk_warning, self._thresholds.disk_critical),
            ("gpu", metrics.gpu_percent,
             self._thresholds.gpu_warning, self._thresholds.gpu_critical),
        ]

        for metric_name, value, warn_thresh, crit_thresh in checks:
            if value >= crit_thresh:
                alert = HealthAlert(
                    level="critical",
                    metric=metric_name,
                    value=value,
                    threshold=crit_thresh,
                    message=f"CRITICAL: {metric_name} at {value:.1f}% (threshold: {crit_thresh}%)",
                )
                self._alerts.append(alert)
                logger.critical(alert.message)
                if self._on_alert:
                    await self._on_alert(alert)

            elif value >= warn_thresh:
                alert = HealthAlert(
                    level="warning",
                    metric=metric_name,
                    value=value,
                    threshold=warn_thresh,
                    message=f"WARNING: {metric_name} at {value:.1f}% (threshold: {warn_thresh}%)",
                )
                self._alerts.append(alert)
                logger.warning(alert.message)
                if self._on_alert:
                    await self._on_alert(alert)

        # Cap alert history
        if len(self._alerts) > 200:
            self._alerts = self._alerts[-200:]

    # ------------------------------------------------------------------
    # System Info
    # ------------------------------------------------------------------

    def get_system_info(self) -> Dict[str, Any]:
        """Get static system information."""
        info = {
            "platform": platform.system(),
            "platform_release": platform.release(),
            "architecture": platform.machine(),
            "python_version": platform.python_version(),
            "hostname": platform.node(),
            "cpu_count": os.cpu_count(),
        }

        if self._psutil:
            try:
                mem = self._psutil.virtual_memory()
                info["total_ram_gb"] = round(mem.total / (1024 ** 3), 1)
            except Exception:
                pass

        return info

    # ------------------------------------------------------------------
    # History & Reporting
    # ------------------------------------------------------------------

    def get_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get recent metric snapshots."""
        return [m.to_dict() for m in self._history[-limit:]]

    def get_alerts(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent alerts."""
        return [
            {
                "level": a.level,
                "metric": a.metric,
                "value": a.value,
                "threshold": a.threshold,
                "message": a.message,
                "timestamp": a.timestamp,
            }
            for a in self._alerts[-limit:]
        ]

    def get_status(self) -> Dict[str, Any]:
        latest = self._history[-1].to_dict() if self._history else {}
        return {
            "running": self._running,
            "check_interval": self._check_interval,
            "history_size": len(self._history),
            "alert_count": len(self._alerts),
            "latest": latest,
            "system_info": self.get_system_info(),
        }
