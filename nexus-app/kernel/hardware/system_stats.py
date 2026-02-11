
import psutil
import platform
import json
from datetime import datetime
from typing import Dict, Any

class SystemStats:
    """
    Cross-platform system monitoring using psutil.
    Provides hardware awareness to the Nexus Kernel.
    """
    
    def __init__(self):
        self.os_info = {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
            "processor": platform.processor()
        }
        
    def get_cpu_stats(self) -> Dict[str, Any]:
        """Get CPU usage and frequency."""
        try:
            freq = psutil.cpu_freq()
            return {
                "percent": psutil.cpu_percent(interval=None),
                "count": psutil.cpu_count(),
                "freq_current": f"{freq.current:.1f}MHz" if freq else "N/A"
            }
        except Exception:
            return {"error": "CPU stats unavailable"}

    def get_memory_stats(self) -> Dict[str, Any]:
        """Get RAM usage."""
        try:
            mem = psutil.virtual_memory()
            return {
                "total": f"{mem.total / (1024**3):.1f}GB",
                "available": f"{mem.available / (1024**3):.1f}GB",
                "percent": mem.percent
            }
        except Exception:
            return {"error": "Memory stats unavailable"}

    def get_disk_stats(self) -> Dict[str, Any]:
        """Get Disk usage for all mounted partitions."""
        disks = []
        try:
            for part in psutil.disk_partitions():
                if 'cdrom' in part.opts or part.fstype == '':
                    continue
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    disks.append({
                        "device": part.device,
                        "mountpoint": part.mountpoint,
                        "fstype": part.fstype,
                        "total": f"{usage.total / (1024**3):.1f}GB",
                        "free": f"{usage.free / (1024**3):.1f}GB",
                        "percent": usage.percent
                    })
                except PermissionError:
                    continue
        except Exception:
            return {"error": "Disk stats unavailable"}
        return {"partitions": disks}

    def get_battery_stats(self) -> Dict[str, Any]:
        """Get Battery status if available."""
        try:
            battery = psutil.sensors_battery()
            if battery:
                return {
                    "percent": round(battery.percent, 1),
                    "power_plugged": battery.power_plugged,
                    "time_left": f"{battery.secsleft / 60:.0f}min" if battery.secsleft != psutil.POWER_TIME_UNLIMITED else "Unlimited"
                }
        except Exception:
            pass
        return {"status": "No Battery / Desktop"}

    def get_top_processes(self, limit: int = 5) -> Dict[str, Any]:
        """Get top running processes by CPU and Memory."""
        try:
            # Fetch all processes
            procs = []
            for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
                try:
                    # p.info is faster than accessing attributes directly
                    procs.append(p.info)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            
            # Sort by CPU
            top_cpu = sorted(procs, key=lambda p: p['cpu_percent'] or 0, reverse=True)[:limit]
            
            # Sort by Memory
            top_mem = sorted(procs, key=lambda p: p['memory_percent'] or 0, reverse=True)[:limit]
            
            return {
                "top_cpu": top_cpu,
                "top_memory": top_mem
            }
        except Exception:
            return {"error": "Process stats unavailable"}

    def get_full_snapshot(self) -> Dict[str, Any]:
        """Get a complete snapshot of system health."""
        return {
            "timestamp": datetime.now().isoformat(),
            "os": self.os_info,
            "cpu": self.get_cpu_stats(),
            "memory": self.get_memory_stats(),
            "disk": self.get_disk_stats(),
            "battery": self.get_battery_stats(),
            "processes": self.get_top_processes()
        }

if __name__ == "__main__":
    stats = SystemStats()
    print(json.dumps(stats.get_full_snapshot(), indent=2))
