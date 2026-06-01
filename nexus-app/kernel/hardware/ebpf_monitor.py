
import threading
import time
import sys
import json
from typing import Callable, Optional, Dict, List

# Try to import BCC - only available on Linux with BCC installed
try:
    from bcc import BPF
    BCC_AVAILABLE = True
except ImportError:
    BCC_AVAILABLE = False

# eBPF Program
BPF_PROGRAM = r"""
#include <uapi/linux/ptrace.h>
#include <linux/sched.h>
#include <linux/fs.h>

// Data structure for events
struct event_data_t {
    u32 pid;
    u32 uid;
    u32 type; // 1=EXEC, 2=OPEN, 3=CONNECT
    char comm[16];
    char fname[256];
};

BPF_PERF_OUTPUT(events);

// Trace execve (Process Execution)
int trace_execve(struct pt_regs *ctx, const char __user *filename,
                const char __user *const __user *argv,
                const char __user *const __user *envp)
{
    struct event_data_t data = {};
    data.pid = bpf_get_current_pid_tgid() >> 32;
    data.uid = bpf_get_current_uid_gid();
    data.type = 1;
    bpf_get_current_comm(&data.comm, sizeof(data.comm));
    bpf_probe_read_user_str(&data.fname, sizeof(data.fname), filename);
    
    events.perf_submit(ctx, &data, sizeof(data));
    return 0;
}

// Trace openat (File Access)
int trace_openat(struct pt_regs *ctx, int dfd, const char __user *filename, int flags)
{
    // Filter out some noise
    struct event_data_t data = {};
    data.pid = bpf_get_current_pid_tgid() >> 32;
    data.uid = bpf_get_current_uid_gid();
    data.type = 2;
    bpf_get_current_comm(&data.comm, sizeof(data.comm));
    bpf_probe_read_user_str(&data.fname, sizeof(data.fname), filename);
    
    // Simple filter: only care about accessing /etc, /home, /opt
    // In real prod, this needs better filtering
    if (data.fname[0] == '/' && (data.fname[1] == 'e' || data.fname[1] == 'h' || data.fname[1] == 'o')) {
        events.perf_submit(ctx, &data, sizeof(data));
    }
    
    return 0;
}
"""

class EBPFMonitor:
    def __init__(self, callback: Optional[Callable[[Dict], None]] = None):
        self.running = False
        self.callback = callback
        self.bpf = None
        self.thread = None
        
    def start(self):
        """Start the eBPF monitor"""
        if not BCC_AVAILABLE:
            print("⚠️ BCC not installed. eBPF monitoring disabled.", file=sys.stderr)
            return

        if sys.platform != "linux":
             print("⚠️ eBPF only supported on Linux.", file=sys.stderr)
             return
             
        try:
            print("🛡️ Initializing eBPF Monitor...", file=sys.stderr)
            self.bpf = BPF(text=BPF_PROGRAM)
            
            # Attach probes
            execve_fn = self.bpf.get_syscall_fnname("execve")
            self.bpf.attach_kprobe(event=execve_fn, fn_name="trace_execve")
            
            openat_fn = self.bpf.get_syscall_fnname("openat") 
            self.bpf.attach_kprobe(event=openat_fn, fn_name="trace_openat")
            
            self.running = True
            self.thread = threading.Thread(target=self._monitor_loop)
            self.thread.daemon = True
            self.thread.start()
            print("🛡️ eBPF Monitor Running", file=sys.stderr)
            
        except Exception as e:
            print(f"❌ Failed to start eBPF monitor: {e}", file=sys.stderr)

    def stop(self):
        """Stop the eBPF monitor"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)
            
    def _monitor_loop(self):
        """Main event loop"""
        def print_event(cpu, data, size):
            try:
                event = self.bpf["events"].event(data)
                
                event_type = "UNKNOWN"
                if event.type == 1: event_type = "EXEC"
                elif event.type == 2: event_type = "OPEN"
                elif event.type == 3: event_type = "CONNECT"
                
                payload = {
                    "timestamp": time.time(),
                    "type": event_type,
                    "pid": event.pid,
                    "uid": event.uid,
                    "comm": event.comm.decode('utf-8', 'ignore'),
                    "file": event.fname.decode('utf-8', 'ignore')
                }
                
                # Filter out our own noise
                if "python" in payload["comm"] or "nexus" in payload["comm"]:
                    return
                
                if self.callback:
                    self.callback(payload)
                else:
                    # Default: just print high interest events
                    if payload["type"] == "EXEC":
                         print(f"⚡ [eBPF] {payload['comm']} ({payload['pid']}) executed {payload['file']}", file=sys.stderr)
                         
            except Exception as e:
                print(f"eBPF Parse Error: {e}", file=sys.stderr)

        self.bpf["events"].open_perf_buffer(print_event)
        
        while self.running:
            try:
                self.bpf.perf_buffer_poll(timeout=100)
            except KeyboardInterrupt:
                break
            except Exception:
                pass

if __name__ == "__main__":
    # Test stub
    monitor = EBPFMonitor()
    monitor.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        monitor.stop()
