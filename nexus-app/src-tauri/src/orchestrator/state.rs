// Nexus Orchestrator State
// Central state management for the AIOS

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;
use super::ProcessManager;

/// Kernel status enumeration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum KernelStatus {
    Stopped,
    Starting,
    Running,
    Error(String),
}

/// Task status enumeration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskStatus {
    Pending,
    Running,
    WaitingApproval,
    Completed,
    Failed(String),
    Cancelled,
}

/// Represents a task in the system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub description: String,
    pub status: TaskStatus,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub result: Option<String>,
    pub steps: Vec<TaskStep>,
}

/// Individual step within a task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStep {
    pub id: String,
    pub action: String,
    pub status: TaskStatus,
    pub output: Option<String>,
}

/// Central orchestrator state
/// Central orchestrator state
pub struct OrchestratorState {
    pub kernel_status: Arc<Mutex<KernelStatus>>,
    pub kernel_process_id: Arc<Mutex<Option<u32>>>,
    pub active_tasks: Arc<Mutex<HashMap<String, Task>>>,
    pub app_handle: Arc<Mutex<Option<AppHandle>>>,
    pub message_queue: Arc<Mutex<Vec<String>>>,
    pub process_manager: Arc<Mutex<ProcessManager>>,
    pub scheduler: Arc<Mutex<super::scheduler::Scheduler>>,
}

impl OrchestratorState {
    /// Create a new orchestrator state
    pub fn new() -> Self {
        Self {
            kernel_status: Arc::new(Mutex::new(KernelStatus::Stopped)),
            kernel_process_id: Arc::new(Mutex::new(None)),
            active_tasks: Arc::new(Mutex::new(HashMap::new())),
            app_handle: Arc::new(Mutex::new(None)),
            message_queue: Arc::new(Mutex::new(Vec::new())),
            process_manager: Arc::new(Mutex::new(ProcessManager::new())),
            scheduler: Arc::new(Mutex::new(super::scheduler::Scheduler::new())),
        }
    }

    /// Initialize with app handle
    pub fn initialize(&self, handle: AppHandle) {
        let mut app_handle = self.app_handle.lock().unwrap();
        *app_handle = Some(handle);
        tracing::info!("🎛️ Orchestrator initialized");
    }

    /// Get current kernel status
    pub fn get_kernel_status(&self) -> KernelStatus {
        self.kernel_status.lock().unwrap().clone()
    }

    /// Set kernel status
    pub fn set_kernel_status(&self, status: KernelStatus) {
        let mut current = self.kernel_status.lock().unwrap();
        *current = status;
    }

    /// Create a new task
    pub fn create_task(&self, description: String) -> Task {
        let task = Task {
            id: Uuid::new_v4().to_string(),
            description,
            status: TaskStatus::Pending,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            result: None,
            steps: Vec::new(),
        };

        let mut tasks = self.active_tasks.lock().unwrap();
        tasks.insert(task.id.clone(), task.clone());
        task
    }

    /// Update task status
    pub fn update_task(&self, task_id: &str, status: TaskStatus, result: Option<String>) {
        let mut tasks = self.active_tasks.lock().unwrap();
        if let Some(task) = tasks.get_mut(task_id) {
            task.status = status;
            task.result = result;
            task.updated_at = chrono::Utc::now();
        }
    }

    /// Get task by ID
    pub fn get_task(&self, task_id: &str) -> Option<Task> {
        let tasks = self.active_tasks.lock().unwrap();
        tasks.get(task_id).cloned()
    }

    /// Get all active tasks
    pub fn get_all_tasks(&self) -> Vec<Task> {
        let tasks = self.active_tasks.lock().unwrap();
        tasks.values().cloned().collect()
    }
}

impl Default for OrchestratorState {
    fn default() -> Self {
        Self::new()
    }
}
