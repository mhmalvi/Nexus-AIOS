"""
Nexus Daemon Manager - Systemd Integration
Provides daemon mode support with sd_notify, signal handling, and socket activation.

Usage:
    python main.py --daemon

Features:
- Systemd notification (READY, STOPPING, RELOADING, WATCHDOG)
- Signal handling (SIGTERM, SIGHUP for reload)
- Socket activation detection
- PID file management
- Graceful shutdown
"""

import asyncio
import logging
import os
import platform
import signal
import socket
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Optional, Callable, Any

logger = logging.getLogger(__name__)


class DaemonState(Enum):
    """Daemon lifecycle states."""
    STARTING = "starting"
    READY = "ready"
    RELOADING = "reloading"
    STOPPING = "stopping"
    STOPPED = "stopped"


@dataclass
class DaemonConfig:
    """Configuration for daemon mode."""
    pid_file: Optional[str] = None
    enable_watchdog: bool = True
    socket_activation: bool = True
    
    
# Check for systemd notification support
SYSTEMD_AVAILABLE = False
try:
    import sdnotify
    SYSTEMD_AVAILABLE = True
except ImportError:
    # Try direct socket approach
    if os.environ.get("NOTIFY_SOCKET"):
        SYSTEMD_AVAILABLE = True
    else:
        logger.debug("sdnotify not available, using fallback")


def sd_notify(message: str) -> bool:
    """
    Send notification to systemd.
    
    Messages:
    - READY=1: Service startup complete
    - STOPPING=1: Service is shutting down
    - RELOADING=1: Service is reloading config
    - WATCHDOG=1: Watchdog ping
    - STATUS=text: Status message for systemctl status
    
    Returns True if notification was sent.
    """
    notify_socket = os.environ.get("NOTIFY_SOCKET")
    
    if not notify_socket:
        return False
    
    try:
        # Handle abstract socket
        if notify_socket.startswith("@"):
            notify_socket = "\0" + notify_socket[1:]
        
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        sock.connect(notify_socket)
        sock.sendall(message.encode())
        sock.close()
        return True
        
    except Exception as e:
        logger.debug(f"Failed to send sd_notify: {e}")
        return False


def is_socket_activated() -> bool:
    """Check if we were started via socket activation."""
    listen_fds = os.environ.get("LISTEN_FDS")
    listen_pid = os.environ.get("LISTEN_PID")
    
    if listen_fds and listen_pid:
        try:
            if int(listen_pid) == os.getpid():
                return int(listen_fds) > 0
        except ValueError:
            pass
    
    return False


def get_activation_sockets() -> list:
    """
    Get file descriptors passed by systemd socket activation.
    
    Systemd passes FDs starting at 3 (SD_LISTEN_FDS_START).
    Returns list of socket objects.
    """
    SD_LISTEN_FDS_START = 3
    sockets = []
    
    listen_fds = os.environ.get("LISTEN_FDS", "0")
    listen_pid = os.environ.get("LISTEN_PID", "")
    
    try:
        num_fds = int(listen_fds)
        expected_pid = int(listen_pid) if listen_pid else 0
        
        if expected_pid != os.getpid():
            return sockets
        
        for i in range(num_fds):
            fd = SD_LISTEN_FDS_START + i
            try:
                sock = socket.fromfd(fd, socket.AF_UNIX, socket.SOCK_STREAM)
                sockets.append(sock)
                logger.info(f"Inherited socket FD {fd}")
            except Exception as e:
                logger.warning(f"Failed to inherit FD {fd}: {e}")
                
    except ValueError:
        pass
    
    return sockets


class NexusDaemon:
    """
    Daemon manager for Nexus kernel.
    
    Handles:
    - Systemd lifecycle notifications
    - Signal handling (SIGTERM, SIGHUP, SIGINT)
    - Watchdog pinging
    - Socket activation
    - Graceful shutdown coordination
    
    Usage:
        daemon = NexusDaemon(config)
        
        async def run_kernel():
            kernel = NexusKernel()
            daemon.notify_ready()
            await kernel.run()
        
        daemon.run(run_kernel)
    """
    
    def __init__(self, config: Optional[DaemonConfig] = None):
        self.config = config or DaemonConfig()
        self.state = DaemonState.STARTING
        self._shutdown_event = asyncio.Event()
        self._reload_callback: Optional[Callable] = None
        self._watchdog_task: Optional[asyncio.Task] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._inherited_sockets: list = []
        
    @property
    def is_running(self) -> bool:
        return self.state == DaemonState.READY
    
    @property
    def should_shutdown(self) -> bool:
        return self._shutdown_event.is_set()
    
    def notify_ready(self) -> bool:
        """Notify systemd that service is ready."""
        self.state = DaemonState.READY
        success = sd_notify("READY=1")
        if success:
            logger.info("Notified systemd: READY")
        return success
    
    def notify_stopping(self) -> bool:
        """Notify systemd that service is stopping."""
        self.state = DaemonState.STOPPING
        success = sd_notify("STOPPING=1")
        if success:
            logger.info("Notified systemd: STOPPING")
        return success
    
    def notify_reloading(self) -> bool:
        """Notify systemd that service is reloading config."""
        self.state = DaemonState.RELOADING
        return sd_notify("RELOADING=1")
    
    def notify_watchdog(self) -> bool:
        """Send watchdog ping to systemd."""
        return sd_notify("WATCHDOG=1")
    
    def notify_status(self, status: str) -> bool:
        """Update status message in systemctl status."""
        return sd_notify(f"STATUS={status}")
    
    def set_reload_callback(self, callback: Callable):
        """Set callback for SIGHUP reload signal."""
        self._reload_callback = callback
    
    def initialize(self) -> bool:
        """
        Initialize daemon mode.
        
        - Creates PID file
        - Sets up signal handlers
        - Checks for socket activation
        
        Returns True if initialization succeeded.
        """
        if platform.system() != "Linux":
            logger.warning("Daemon mode is Linux-only, running in foreground")
            return True
        
        # Create PID file
        if self.config.pid_file:
            try:
                pid_path = Path(self.config.pid_file)
                pid_path.parent.mkdir(parents=True, exist_ok=True)
                pid_path.write_text(str(os.getpid()))
                logger.info(f"Created PID file: {self.config.pid_file}")
            except Exception as e:
                logger.error(f"Failed to create PID file: {e}")
        
        # Check socket activation
        if self.config.socket_activation and is_socket_activated():
            self._inherited_sockets = get_activation_sockets()
            logger.info(f"Socket activated with {len(self._inherited_sockets)} socket(s)")
        
        return True
    
    def setup_signals(self, loop: asyncio.AbstractEventLoop):
        """Set up signal handlers."""
        self._loop = loop
        
        if platform.system() != "Linux":
            # Windows fallback
            return
        
        def handle_sigterm():
            logger.info("Received SIGTERM, initiating shutdown")
            self.request_shutdown()
        
        def handle_sighup():
            logger.info("Received SIGHUP, reloading configuration")
            if self._reload_callback:
                self.notify_reloading()
                try:
                    result = self._reload_callback()
                    if asyncio.iscoroutine(result):
                        asyncio.create_task(result)
                except Exception as e:
                    logger.error(f"Reload callback failed: {e}")
                finally:
                    self.notify_ready()
        
        def handle_sigint():
            logger.info("Received SIGINT, initiating shutdown")
            self.request_shutdown()
        
        loop.add_signal_handler(signal.SIGTERM, handle_sigterm)
        loop.add_signal_handler(signal.SIGHUP, handle_sighup)
        loop.add_signal_handler(signal.SIGINT, handle_sigint)
        
        logger.debug("Signal handlers installed")
    
    def request_shutdown(self):
        """Request graceful shutdown."""
        self.notify_stopping()
        self._shutdown_event.set()
        
        # Cancel watchdog task
        if self._watchdog_task:
            self._watchdog_task.cancel()
    
    async def start_watchdog(self, interval: float = 15.0):
        """
        Start watchdog ping task.
        
        The interval should be less than WatchdogSec/2.
        """
        if not self.config.enable_watchdog:
            return
        
        # Check if watchdog is enabled in systemd
        watchdog_usec = os.environ.get("WATCHDOG_USEC")
        if not watchdog_usec:
            logger.debug("Watchdog not enabled in systemd")
            return
        
        try:
            watchdog_sec = int(watchdog_usec) / 1_000_000
            interval = watchdog_sec / 3  # Ping 3x per period
        except ValueError:
            pass
        
        async def watchdog_loop():
            while not self.should_shutdown:
                self.notify_watchdog()
                await asyncio.sleep(interval)
        
        self._watchdog_task = asyncio.create_task(watchdog_loop())
        logger.info(f"Started watchdog ping every {interval:.1f}s")
    
    async def wait_for_shutdown(self):
        """Wait for shutdown signal."""
        await self._shutdown_event.wait()
    
    def cleanup(self):
        """Cleanup daemon resources."""
        self.state = DaemonState.STOPPED
        
        # Remove PID file
        if self.config.pid_file:
            try:
                Path(self.config.pid_file).unlink(missing_ok=True)
            except Exception:
                pass
        
        # Close inherited sockets
        for sock in self._inherited_sockets:
            try:
                sock.close()
            except Exception:
                pass
        
        logger.info("Daemon cleanup complete")
    
    def run(self, main_coro: Callable[[], Any]):
        """
        Run the daemon with the given main coroutine.
        
        This is the main entry point for daemon mode.
        
        Args:
            main_coro: Async function to run as main loop
        """
        if not self.initialize():
            sys.exit(1)
        
        async def _run():
            self.setup_signals(asyncio.get_event_loop())
            await self.start_watchdog()
            
            try:
                await main_coro()
            except asyncio.CancelledError:
                logger.info("Main task cancelled")
            finally:
                self.cleanup()
        
        try:
            asyncio.run(_run())
        except KeyboardInterrupt:
            logger.info("Interrupted by keyboard")
        finally:
            self.cleanup()


def parse_daemon_args() -> bool:
    """Check if --daemon flag is present."""
    return "--daemon" in sys.argv


# Export for convenience
__all__ = [
    "NexusDaemon",
    "DaemonConfig", 
    "DaemonState",
    "sd_notify",
    "is_socket_activated",
    "get_activation_sockets",
    "parse_daemon_args",
    "SYSTEMD_AVAILABLE"
]
