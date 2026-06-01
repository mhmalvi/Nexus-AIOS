use std::collections::BinaryHeap;
use std::collections::HashMap;
use std::cmp::Ordering;
use std::sync::{Arc, Mutex};
use std::time::{Instant, Duration};
use uuid::Uuid;
use crate::orchestrator::ipc_bridge::{IpcContent, IpcMessage, IpcSource, IpcDestination};

/// Task Priority Levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum TaskPriority {
    Background = 0,
    Low = 1,
    Normal = 2,
    High = 3,
    Critical = 4,
}

/// Task structure to be scheduled
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct ScheduledTask {
    pub id: String,
    pub priority: TaskPriority,
    pub payload: IpcContent,
    pub created_at: u64,
}

// Custom ordering for Priority Queue (BinaryHeap is MaxHeap)
impl Ord for ScheduledTask {
    fn cmp(&self, other: &Self) -> Ordering {
        // First by priority
        match self.priority.cmp(&other.priority) {
            Ordering::Equal => {
                // Then by creation time (FIFO for same priority) - older tasks have higher precedence
                other.created_at.cmp(&self.created_at)
            },
            ordering => ordering,
        }
    }
}

impl PartialOrd for ScheduledTask {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Rust Kernel-Level Scheduler
/// Manages task prioritization, dispatch, and rate limiting
pub struct Scheduler {
    task_queue: Arc<Mutex<BinaryHeap<ScheduledTask>>>,
    active_tasks: Arc<Mutex<HashMap<String, ScheduledTask>>>,
    /// Minimum interval between task dispatches to prevent LLM overload
    min_dispatch_interval: Duration,
    /// Timestamp of last dispatched task
    last_dispatch: Arc<Mutex<Option<Instant>>>,
}

impl Scheduler {
    pub fn new() -> Self {
        Self {
            task_queue: Arc::new(Mutex::new(BinaryHeap::new())),
            active_tasks: Arc::new(Mutex::new(HashMap::new())),
            min_dispatch_interval: Duration::from_millis(100), // 100ms rate limit
            last_dispatch: Arc::new(Mutex::new(None)),
        }
    }

    /// Set the minimum interval between dispatches (rate limit)
    pub fn set_rate_limit(&mut self, interval: Duration) {
        self.min_dispatch_interval = interval;
    }

    /// Add a task to the scheduler
    pub fn schedule_task(&self, payload: IpcContent, priority: TaskPriority) -> String {
        let id = Uuid::new_v4().to_string();
        
        let task = ScheduledTask {
            id: id.clone(),
            priority,
            payload,
            created_at: Self::now(),
        };

        println!("📅 Scheduled task {} with priority {:?}", id, priority);
        self.task_queue.lock().unwrap().push(task);
        
        id
    }

    /// Get the next highest priority task, respecting rate limits.
    /// Returns None if the queue is empty OR if rate limit hasn't elapsed.
    pub fn pop_next_task(&self) -> Option<ScheduledTask> {
        // Check rate limit first
        {
            let last = self.last_dispatch.lock().unwrap();
            if let Some(last_time) = *last {
                if last_time.elapsed() < self.min_dispatch_interval {
                    return None; // Rate limited — caller should retry later
                }
            }
        }

        // Pop from queue — release lock immediately to avoid nesting
        let task = {
            let mut queue = self.task_queue.lock().unwrap();
            queue.pop()
        };
        // ^ task_queue lock is dropped here

        if let Some(task) = task {
            // Now separately lock active_tasks (no nesting)
            self.active_tasks.lock().unwrap().insert(task.id.clone(), task.clone());
            // Update last dispatch time
            *self.last_dispatch.lock().unwrap() = Some(Instant::now());
            Some(task)
        } else {
            None
        }
    }

    /// Mark a task as completed
    pub fn complete_task(&self, task_id: &str) {
        let mut active = self.active_tasks.lock().unwrap();
        if active.remove(task_id).is_some() {
            println!("✅ Task {} completed", task_id);
        } else {
            println!("⚠️ Attempted to complete unknown task {}", task_id);
        }
    }
    
    /// Get current queue size
    pub fn queue_size(&self) -> usize {
        self.task_queue.lock().unwrap().len()
    }

    /// Get number of currently active (dispatched) tasks
    pub fn active_count(&self) -> usize {
        self.active_tasks.lock().unwrap().len()
    }

    /// Helper for current timestamp
    fn now() -> u64 {
        use std::time::SystemTime;
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    }
}

impl Default for Scheduler {
    fn default() -> Self {
        Self::new()
    }
}

