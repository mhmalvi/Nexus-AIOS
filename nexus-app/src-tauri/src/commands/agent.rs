// Nexus Agent Commands

use serde::{Deserialize, Serialize};
use tauri::State;
use crate::orchestrator::OrchestratorState;
use crate::orchestrator::state::TaskStatus;

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskExecuteResult {
    pub success: bool,
    pub task_id: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskStatusResult {
    pub task_id: String,
    pub status: String,
    pub description: String,
    pub steps: Vec<TaskStepInfo>,
    pub result: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskStepInfo {
    pub id: String,
    pub action: String,
    pub status: String,
    pub output: Option<String>,
}

/// Execute a task through the agent system
#[tauri::command]
pub fn execute_task(
    description: String,
    _auto_approve: Option<bool>,
    state: State<'_, OrchestratorState>,
) -> Result<TaskExecuteResult, String> {
    println!("🤖 Executing task: {}", description);
    
    let task = state.create_task(description.clone());
    state.update_task(&task.id, TaskStatus::Running, None);
    
    // Send to Kernel
    let payload = serde_json::json!({
        "id": task.id,
        "message_type": "task",
        "payload": {
            "description": description.clone(),
            "auto_approve": _auto_approve.unwrap_or(false)
        }
    });

    match serde_json::to_string(&payload) {
        Ok(json_str) => {
            if let Ok(mut pm) = state.process_manager.lock() {
                if let Err(e) = pm.send_message(json_str) {
                     println!("⚠️ Failed to send task to kernel: {}", e);
                     // Still return success for UI, but maybe log error
                } else {
                     println!("📤 Task execution sent to kernel");
                }
            }
        },
        Err(e) => println!("⚠️ Failed to serialize task payload: {}", e),
    }
    
    Ok(TaskExecuteResult {
        success: true,
        task_id: task.id,
        status: "running".to_string(),
        message: format!("Task created and executing: {}", description),
    })
}

/// Get task status
#[tauri::command]
pub fn get_task_status(
    task_id: String,
    state: State<'_, OrchestratorState>,
) -> Result<TaskStatusResult, String> {
    if let Some(task) = state.get_task(&task_id) {
        let status_str = match task.status {
            TaskStatus::Pending => "pending",
            TaskStatus::Running => "running",
            TaskStatus::WaitingApproval => "waiting_approval",
            TaskStatus::Completed => "completed",
            TaskStatus::Failed(_) => "failed",
            TaskStatus::Cancelled => "cancelled",
        };
        
        Ok(TaskStatusResult {
            task_id: task.id,
            status: status_str.to_string(),
            description: task.description,
            steps: task.steps.iter().map(|s| TaskStepInfo {
                id: s.id.clone(),
                action: s.action.clone(),
                status: format!("{:?}", s.status),
                output: s.output.clone(),
            }).collect(),
            result: task.result,
            created_at: task.created_at.to_rfc3339(),
            updated_at: task.updated_at.to_rfc3339(),
        })
    } else {
        Err(format!("Task not found: {}", task_id))
    }
}

/// Cancel a running task
#[tauri::command]
pub fn cancel_task(
    task_id: String,
    state: State<'_, OrchestratorState>,
) -> Result<serde_json::Value, String> {
    println!("❌ Cancelling task: {}", task_id);
    
    state.update_task(&task_id, TaskStatus::Cancelled, Some("Cancelled by user".to_string()));
    
    Ok(serde_json::json!({
        "success": true,
        "task_id": task_id,
        "status": "cancelled"
    }))
}
