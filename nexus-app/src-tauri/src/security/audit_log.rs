// Nexus Audit Log
// Comprehensive logging for all agentic actions

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use chrono::{DateTime, Utc};

/// Maximum audit log entries to keep in memory
const MAX_AUDIT_ENTRIES: usize = 50000;

/// Retention period for on-disk audit entries (30 days)
const RETENTION_DAYS: i64 = 30;

/// Maximum size of a single log file before rotation (50 MB)
const MAX_LOG_FILE_BYTES: u64 = 50 * 1024 * 1024;

/// Audit action type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditAction {
    // User interactions
    UserQuery,
    UserCommand,
    
    // Agent operations
    TaskCreated,
    TaskStarted,
    TaskCompleted,
    TaskFailed,
    TaskCancelled,
    
    // Tool executions
    FileRead,
    FileWrite,
    FileDelete,
    ShellExecute,
    NetworkRequest,
    ProcessSpawn,
    
    // Safety events
    ApprovalRequested,
    ApprovalGranted,
    ApprovalDenied,
    BlacklistBlocked,
    CapabilityDenied,
    
    // System events
    KernelStart,
    KernelStop,
    SystemError,
}

/// Audit log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub action: AuditAction,
    pub actor: String,        // Who performed the action (user, agent, system)
    pub target: Option<String>, // What was acted upon
    pub details: serde_json::Value,
    pub success: bool,
    pub error_message: Option<String>,
}

impl AuditEntry {
    /// Create a new audit entry
    pub fn new(action: AuditAction, actor: &str, target: Option<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            action,
            actor: actor.to_string(),
            target,
            details: serde_json::json!({}),
            success: true,
            error_message: None,
        }
    }

    /// Add details to the entry
    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = details;
        self
    }

    /// Mark as failed
    pub fn with_error(mut self, error: String) -> Self {
        self.success = false;
        self.error_message = Some(error);
        self
    }
}

/// Audit log manager with optional file persistence
pub struct AuditLog {
    entries: VecDeque<AuditEntry>,
    log_file_path: Option<std::path::PathBuf>,
}

impl AuditLog {
    /// Create a new audit log
    pub fn new() -> Self {
        // Default persistent log path: ~/.nexus/audit/audit.jsonl
        let log_path = dirs::home_dir()
            .map(|h| h.join(".nexus").join("audit").join("audit.jsonl"));

        // Ensure directory exists
        if let Some(ref path) = log_path {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
        }

        Self {
            entries: VecDeque::with_capacity(MAX_AUDIT_ENTRIES),
            log_file_path: log_path,
        }
    }

    /// Persist a single entry to disk (append, one JSON object per line)
    fn persist_entry(&self, entry: &AuditEntry) {
        if let Some(ref path) = self.log_file_path {
            if let Ok(json) = serde_json::to_string(entry) {
                use std::io::Write;
                if let Ok(mut file) = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(path)
                {
                    let _ = writeln!(file, "{}", json);
                }
            }
        }
    }

    /// Add an entry to the log (memory + disk)
    pub fn log(&mut self, entry: AuditEntry) {
        tracing::info!(
            "📋 Audit: {:?} by {} on {:?} - {}",
            entry.action,
            entry.actor,
            entry.target,
            if entry.success { "SUCCESS" } else { "FAILED" }
        );

        // Rotate log file if too large
        self.rotate_if_needed();

        // Persist to disk before adding to memory
        self.persist_entry(&entry);

        // Remove old entries if at capacity
        if self.entries.len() >= MAX_AUDIT_ENTRIES {
            self.entries.pop_front();
        }

        self.entries.push_back(entry);

        // Periodically prune entries older than retention period (every 1000 entries)
        if self.entries.len() % 1000 == 0 {
            self.prune_old_entries();
        }
    }

    /// Quick log helper for successful actions
    pub fn log_success(&mut self, action: AuditAction, actor: &str, target: Option<String>) {
        self.log(AuditEntry::new(action, actor, target));
    }

    /// Quick log helper for failed actions
    pub fn log_failure(&mut self, action: AuditAction, actor: &str, target: Option<String>, error: String) {
        self.log(AuditEntry::new(action, actor, target).with_error(error));
    }

    /// Get recent entries
    pub fn get_recent(&self, count: usize) -> Vec<&AuditEntry> {
        self.entries.iter().rev().take(count).collect()
    }

    /// Get entries by action type
    pub fn get_by_action(&self, action: AuditAction) -> Vec<&AuditEntry> {
        self.entries
            .iter()
            .filter(|e| std::mem::discriminant(&e.action) == std::mem::discriminant(&action))
            .collect()
    }

    /// Get entries within time range
    pub fn get_in_range(&self, start: DateTime<Utc>, end: DateTime<Utc>) -> Vec<&AuditEntry> {
        self.entries
            .iter()
            .filter(|e| e.timestamp >= start && e.timestamp <= end)
            .collect()
    }

    /// Get all failed entries
    pub fn get_failures(&self) -> Vec<&AuditEntry> {
        self.entries.iter().filter(|e| !e.success).collect()
    }

    /// Export to JSON
    pub fn export_json(&self) -> String {
        serde_json::to_string_pretty(&self.entries.iter().collect::<Vec<_>>())
            .unwrap_or_else(|_| "[]".to_string())
    }

    /// Get total entry count
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Rotate the log file if it exceeds MAX_LOG_FILE_BYTES.
    /// Renames the current file to `audit-<timestamp>.jsonl` and starts fresh.
    pub fn rotate_if_needed(&self) {
        if let Some(ref path) = self.log_file_path {
            let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
            if size >= MAX_LOG_FILE_BYTES {
                let ts = Utc::now().format("%Y%m%d_%H%M%S");
                let rotated = path.with_file_name(format!("audit-{}.jsonl", ts));
                let _ = std::fs::rename(path, rotated);
            }
        }
    }

    /// Prune in-memory entries older than RETENTION_DAYS.
    pub fn prune_old_entries(&mut self) {
        let cutoff = Utc::now() - chrono::Duration::days(RETENTION_DAYS);
        while let Some(front) = self.entries.front() {
            if front.timestamp < cutoff {
                self.entries.pop_front();
            } else {
                break;
            }
        }
    }
}

impl Default for AuditLog {
    fn default() -> Self {
        Self::new()
    }
}
