# Nexus Linux Integration Module
# Provides Linux-specific functionality:
# - D-Bus service for native IPC
# - Systemd integration
# - Daemon management

from .dbus_service import DBusService, DBusConfig, DBUS_AVAILABLE
from .daemon import (
    NexusDaemon, DaemonConfig, DaemonState,
    sd_notify, is_socket_activated, parse_daemon_args,
    SYSTEMD_AVAILABLE
)

__all__ = [
    "DBusService", "DBusConfig", "DBUS_AVAILABLE",
    "NexusDaemon", "DaemonConfig", "DaemonState",
    "sd_notify", "is_socket_activated", "parse_daemon_args",
    "SYSTEMD_AVAILABLE"
]

