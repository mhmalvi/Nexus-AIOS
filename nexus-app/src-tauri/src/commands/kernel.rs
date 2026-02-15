// Nexus Kernel Commands

use serde::{Deserialize, Serialize};
use tauri::{State, AppHandle}; 
use crate::orchestrator::OrchestratorState;

#[derive(Debug, Serialize, Deserialize)]
pub struct KernelStatusResponse {
    pub status: String,
    pub process_id: Option<u32>,
    pub uptime_seconds: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KernelResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

/// Send a message to the kernel
#[tauri::command]
pub fn send_to_kernel(
    app: AppHandle,
    message: String,
    message_type: String,
    state: State<'_, OrchestratorState>,
) -> Result<KernelResponse, String> {
    let current_status = state.get_kernel_status();
    
    // Auto-start check
    if let crate::orchestrator::state::KernelStatus::Stopped = current_status {
         let mut pm = state.process_manager.lock().unwrap();
         if let Err(e) = pm.start_kernel(app.clone()) {
             if e != "Kernel already running" {
                 return Err(format!("Failed to auto-start kernel: {}", e));
             }
         }
         state.set_kernel_status(crate::orchestrator::state::KernelStatus::Running);
    }
    
    let mut pm = state.process_manager.lock().unwrap();
    
    // Construct JSON message for Python Kernel
    let payload_value = match serde_json::from_str::<serde_json::Value>(&message) {
        Ok(v) if v.is_object() => v,
        _ => serde_json::json!({
            "query": message,
            "command": message,
            "context_mode": "auto"
        })
    };

    let json_msg = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "message_type": message_type, // 'query' or 'command'
        "payload": payload_value
    });

    let request_id = json_msg["id"].as_str().unwrap_or("unknown").to_string();

    match pm.send_message(json_msg.to_string()) {
        Ok(_) => {
            Ok(KernelResponse {
                success: true,
                message: "Message dispatched to Neural Link".to_string(),
                data: Some(serde_json::json!({ "request_id": request_id }))
            })
        },
        Err(e) => Err(format!("Failed to write to kernel: {}", e))
    }
}

/// Start the Python kernel
#[tauri::command]
pub fn start_kernel(
    app: AppHandle,
    state: State<'_, OrchestratorState>,
) -> Result<KernelResponse, String> {
    println!("🚀 Starting kernel via command");
    
    let mut pm = state.process_manager.lock().unwrap();
    match pm.start_kernel(app) {
        Ok(pid) => {
            state.set_kernel_status(crate::orchestrator::state::KernelStatus::Running);
            state.kernel_process_id.lock().unwrap().replace(pid);
            
             Ok(KernelResponse {
                success: true,
                message: format!("Kernel started successfully with PID: {}", pid),
                data: Some(serde_json::json!({
                    "status": "running",
                    "pid": pid,
                   "model": std::env::var("NEXUS_DEFAULT_MODEL").unwrap_or_else(|_| "llama3.2".to_string())
                })),
            })
        },
        Err(e) => {
             if e == "Kernel already running" {
                  return Ok(KernelResponse {
                    success: true,
                    message: "Kernel is already running".to_string(),
                    data: None
                });
             }
             Err(e)
        }
    }
}

/// Stop the Python kernel
#[tauri::command]
pub fn stop_kernel(
    state: State<'_, OrchestratorState>,
) -> Result<KernelResponse, String> {
    println!("🛑 Stopping kernel via command");
    
    let mut pm = state.process_manager.lock().unwrap();
    match pm.stop_kernel() {
        Ok(_) => {
             state.set_kernel_status(crate::orchestrator::state::KernelStatus::Stopped);
             state.kernel_process_id.lock().unwrap().take();
             Ok(KernelResponse {
                success: true,
                message: "Kernel stopped".to_string(),
                data: None,
            })
        },
        Err(e) => Err(e)
    }
}

/// Get kernel status
#[tauri::command]
pub fn get_kernel_status(
    state: State<'_, OrchestratorState>,
) -> Result<KernelStatusResponse, String> {
    let status = state.get_kernel_status();
    let pid = *state.kernel_process_id.lock().unwrap();
    
    let status_str = match status {
        crate::orchestrator::state::KernelStatus::Stopped => "stopped",
        crate::orchestrator::state::KernelStatus::Starting => "starting",
        crate::orchestrator::state::KernelStatus::Running => "running",
        crate::orchestrator::state::KernelStatus::Error(_) => "error",
    };
    
    Ok(KernelStatusResponse {
        status: status_str.to_string(),
        process_id: pid,
        uptime_seconds: None,
    })
}
