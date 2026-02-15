use std::process::{Command, Child, Stdio, ChildStdin};
use std::io::{BufReader, BufRead, Write};
use std::path::PathBuf;
use std::env;
use std::thread;
use std::time::{Duration, Instant};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use tauri::{AppHandle, Emitter}; // Ensure Emitter is available for emit()

/// Crash recovery configuration
#[derive(Clone)]
pub struct CrashRecovery {
    pub max_retries: u32,
    pub base_delay_ms: u64,
    pub max_delay_ms: u64,
    pub enabled: bool,
}

impl Default for CrashRecovery {
    fn default() -> Self {
        Self {
            max_retries: 5,
            base_delay_ms: 1000,    // 1 second
            max_delay_ms: 30000,    // 30 seconds max
            enabled: true,
        }
    }
}

/// Calculate exponential backoff delay with jitter
fn calculate_backoff(attempt: u32, base_ms: u64, max_ms: u64) -> Duration {
    let delay = base_ms * 2u64.pow(attempt.min(10));
    let delay = delay.min(max_ms);
    // Add 10% jitter
    let jitter = (delay as f64 * 0.1 * rand_simple()) as u64;
    Duration::from_millis(delay + jitter)
}

/// Simple pseudo-random for jitter (no external dep)
fn rand_simple() -> f64 {
    use std::time::SystemTime;
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .subsec_nanos();
    (nanos % 1000) as f64 / 1000.0
}

/// Default IPC response timeout in seconds.
/// Frontend `kernelEventBridge.sendAndWait()` uses 30 000 ms by default.
pub const IPC_TIMEOUT_SECS: u64 = 30;

/// Process manager for the Python kernel sidecar
pub struct ProcessManager {
    pub child: Option<Child>,
    pub stdin: Option<ChildStdin>,
    pub crash_recovery: CrashRecovery,
    crash_count: u32,
    last_crash: Option<Instant>,
    running: Arc<AtomicBool>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self { 
            child: None,
            stdin: None,
            crash_recovery: CrashRecovery::default(),
            crash_count: 0,
            last_crash: None,
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Start the Python kernel process
    pub fn start_kernel(&mut self, app_handle: AppHandle) -> Result<u32, String> {
        if self.child.is_some() {
            return Err("Kernel already running".to_string());
        }

        println!("🐍 Spawning Python kernel...");
        self.emit_status(&app_handle, "starting", None);

        let mut kernel_dir = env::current_dir().map_err(|e| e.to_string())?;
        if kernel_dir.ends_with("src-tauri") {
            kernel_dir.pop();
        }
        
        // Cross-platform Python detection
        let python_path = if cfg!(target_os = "windows") {
            // Windows: kernel/venv/Scripts/python.exe
            kernel_dir.join("kernel").join("venv").join("Scripts").join("python.exe")
        } else {
            // Linux/macOS: kernel/.venv/bin/python (or venv/bin/python)
            let venv_path = kernel_dir.join("kernel").join(".venv").join("bin").join("python");
            if venv_path.exists() {
                venv_path
            } else {
                let alt_venv = kernel_dir.join("kernel").join("venv").join("bin").join("python");
                if alt_venv.exists() {
                    alt_venv
                } else {
                    // Fallback: system Python
                    PathBuf::from("/usr/bin/python3")
                }
            }
        };
        let script_path = kernel_dir.join("kernel").join("main.py");

        if !python_path.exists() {
            self.emit_status(&app_handle, "error", Some("Python not found"));
             return Err(format!("Python executable not found at: {:?}. On Linux, ensure /opt/nexus/.venv exists or python3 is installed.", python_path));
        }

        #[cfg(target_os = "windows")]
        use std::os::windows::process::CommandExt;

        let mut cmd = Command::new(python_path);
        cmd.arg(script_path)
           .arg("--enable-voice")
           .stdin(Stdio::piped())
           .stdout(Stdio::piped())
           .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let mut child = cmd.spawn()
            .map_err(|e| {
                self.emit_status(&app_handle, "error", Some(&e.to_string()));
                format!("Failed to spawn kernel: {}", e)
            })?;

        let pid = child.id();
        println!("✅ Kernel started with PID: {}", pid);
        self.emit_status(&app_handle, "running", None);
        self.running.store(true, Ordering::SeqCst);
        
        // Handle Stdout Reading in a separate thread
        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
        
        let app_handle_clone = app_handle.clone();
        
        // Spawn STDOUT reader
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(text) => {
                         // Check if JSON
                         if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&text) {
                             // INTERCEPT: HIL Approval Requests
                             if json_val["message_type"] == "approval_required" {
                                 // Emit specific event to trigger UI Modal
                                 let _ = app_handle_clone.emit("hil:approval_required", serde_json::json!({
                                     "request_id": json_val["id"],
                                     "action": json_val["data"]["action"],
                                     "risk_level": json_val["data"]["risk_level"],
                                     "details": json_val["data"]
                                 }));
                             }

                             // Emit to frontend (standard pass-through)
                             let _ = app_handle_clone.emit("kernel:response", &json_val);
                             
                             // If it contains 'data.response', maybe emit a 'chat-chunk' or similar if we were streaming
                             // For now, kernel returns full response at end.
                         } else {
                             println!("🐍 [Kernel Output]: {}", text);
                         }
                    },
                    Err(_) => break,
                }
            }
            println!("⚠️ Kernel stdout stream closed");
        });

        // Spawn STDERR reader (for logs)
        thread::spawn(move || {
             let reader = BufReader::new(stderr);
             for line in reader.lines() {
                 if let Ok(text) = line {
                     println!("🐍 [Kernel Log]: {}", text);
                 }
             }
        });

        self.stdin = child.stdin.take();
        self.child = Some(child);
        
        Ok(pid)
    }

    /// Start kernel with automatic crash recovery
    pub fn start_with_recovery(&mut self, app_handle: AppHandle) -> Result<u32, String> {
        let result = self.start_kernel(app_handle.clone());
        
        if result.is_ok() && self.crash_recovery.enabled {
            // Start background monitor for crash detection
            let running = self.running.clone();
            let recovery = self.crash_recovery.clone();
            let handle = app_handle.clone();
            
            thread::spawn(move || {
                Self::monitor_for_crash(running, recovery, handle);
            });
        }
        
        result
    }
    
    /// Background thread to monitor and recover from crashes
    fn monitor_for_crash(
        running: Arc<AtomicBool>,
        recovery: CrashRecovery,
        app_handle: AppHandle
    ) {
        let mut retry_count = 0u32;
        
        loop {
            thread::sleep(Duration::from_secs(2));
            
            if !running.load(Ordering::SeqCst) {
                // Kernel has stopped - check if we should restart
                if retry_count >= recovery.max_retries {
                    println!("❌ Max kernel retries ({}) exceeded", recovery.max_retries);
                    let _ = app_handle.emit("kernel:status", serde_json::json!({
                        "status": "failed",
                        "error": "Max retries exceeded",
                        "retry_count": retry_count
                    }));
                    break;
                }
                
                // Calculate backoff
                let delay = calculate_backoff(
                    retry_count,
                    recovery.base_delay_ms,
                    recovery.max_delay_ms
                );
                
                println!("🔄 Kernel crashed. Retry {} in {:?}...", retry_count + 1, delay);
                let _ = app_handle.emit("kernel:status", serde_json::json!({
                    "status": "restarting",
                    "retry": retry_count + 1,
                    "delay_ms": delay.as_millis()
                }));
                
                thread::sleep(delay);
                retry_count += 1;
                
                // Attempt restart - would need mutable access to ProcessManager
                // In practice, this would signal main thread to restart
                let _ = app_handle.emit("kernel:request_restart", serde_json::json!({
                    "retry": retry_count
                }));
            } else {
                // Kernel is running - reset retry count after stable period
                retry_count = 0;
            }
        }
    }
    
    /// Emit kernel status event to frontend
    fn emit_status(&self, app_handle: &AppHandle, status: &str, error: Option<&str>) {
        let payload = serde_json::json!({
            "status": status,
            "error": error,
            "crash_count": self.crash_count
        });
        let _ = app_handle.emit("kernel:status", payload);
    }

    /// Send a raw string message to the kernel with write timeout protection
    pub fn send_message(&mut self, message: String) -> Result<(), String> {
        if let Some(stdin) = &mut self.stdin {
            // Check if kernel process is still alive before writing
            if let Some(ref mut child) = self.child {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        self.mark_crashed();
                        return Err(format!("Kernel process exited with status: {}", status));
                    }
                    Ok(None) => { /* Still running */ }
                    Err(e) => {
                        return Err(format!("Failed to check kernel process: {}", e));
                    }
                }
            }
            writeln!(stdin, "{}", message).map_err(|e| {
                // If write fails, kernel likely crashed
                format!("Failed to write to kernel stdin (process may have crashed): {}", e)
            })?;
            stdin.flush().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err("Kernel stdin not available".to_string())
        }
    }

    /// Stop the kernel process
    pub fn stop_kernel(&mut self) -> Result<(), String> {
        self.running.store(false, Ordering::SeqCst);
        
        if let Some(mut child) = self.child.take() {
            println!("🛑 Killing kernel process...");
            let _ = child.kill();
            let _ = child.wait();
        }
        self.stdin = None;
        Ok(())
    }

    /// Check if kernel is running
    pub fn is_running(&self) -> bool {
        self.child.is_some() && self.running.load(Ordering::SeqCst)
    }
    
    /// Mark kernel as crashed (call when detecting crash)
    pub fn mark_crashed(&mut self) {
        self.crash_count += 1;
        self.last_crash = Some(Instant::now());
        self.running.store(false, Ordering::SeqCst);
        self.child = None;
        self.stdin = None;
    }
}

impl Default for ProcessManager {
    fn default() -> Self {
        Self::new()
    }
}
