// Nexus Security State
// Manages security context and approval states

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

use super::audit_log::AuditLog;
use super::capability_manager::CapabilityManager;

/// Approval requests expire after this many seconds
const APPROVAL_TTL_SECONDS: i64 = 300; // 5 minutes

/// Approval request status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Denied,
    Expired,
}

/// Approval request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRequest {
    pub id: String,
    pub action: String,
    pub details: serde_json::Value,
    pub risk_level: RiskLevel,
    pub status: ApprovalStatus,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub resolved_at: Option<chrono::DateTime<chrono::Utc>>,
    pub resolver_reason: Option<String>,
}

/// Risk level classification
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RiskLevel {
    Low,      // Read-only operations
    Medium,   // Non-destructive writes
    High,     // System modifications
    Critical, // Destructive or irreversible actions
}

/// Central security state
pub struct SecurityState {
    pub capability_manager: Arc<Mutex<CapabilityManager>>,
    pub audit_log: Arc<Mutex<AuditLog>>,
    pub pending_approvals: Arc<Mutex<HashMap<String, ApprovalRequest>>>,
    pub blacklisted_patterns: Arc<Mutex<Vec<String>>>,
}

impl SecurityState {
    /// Create new security state with default configurations
    pub fn new() -> Self {
        let mut capability_manager = CapabilityManager::new();
        capability_manager.load_default_capabilities();

        let mut blacklist = Vec::new();
        // Add dangerous command patterns
        blacklist.push(r"rm\s+-rf\s+/".to_string());
        blacklist.push(r"format\s+[a-zA-Z]:".to_string());
        blacklist.push(r"del\s+/s\s+/q\s+C:\\".to_string());
        blacklist.push(r":(){ :|:& };:".to_string()); // Fork bomb
        blacklist.push(r"dd\s+if=.*of=/dev/".to_string());
        blacklist.push(r"chmod\s+-R\s+777\s+/".to_string());
        blacklist.push(r"curl.*\|\s*sh".to_string());
        blacklist.push(r"wget.*\|\s*sh".to_string());

        Self {
            capability_manager: Arc::new(Mutex::new(capability_manager)),
            audit_log: Arc::new(Mutex::new(AuditLog::new())),
            pending_approvals: Arc::new(Mutex::new(HashMap::new())),
            blacklisted_patterns: Arc::new(Mutex::new(blacklist)),
        }
    }

    /// Normalize whitespace to prevent evasion via extra spaces/tabs
    fn normalize_whitespace(text: &str) -> String {
        let ws_re = regex::Regex::new(r"\s+").unwrap();
        ws_re.replace_all(text.trim(), " ").to_string()
    }

    /// Check if an action matches any blacklisted pattern
    pub fn is_blacklisted(&self, action: &str) -> bool {
        let normalized = Self::normalize_whitespace(action);
        let patterns = self.blacklisted_patterns.lock().unwrap();
        for pattern in patterns.iter() {
            if let Ok(re) = regex::Regex::new(pattern) {
                if re.is_match(action) || re.is_match(&normalized) {
                    tracing::warn!("🚫 Blacklisted action detected: {}", action);
                    return true;
                }
            }
        }
        false
    }

    /// Determine risk level for an action
    pub fn assess_risk(&self, action: &str) -> RiskLevel {
        let action_lower = action.to_lowercase();

        // Critical actions
        if action_lower.contains("delete") && action_lower.contains("all")
            || action_lower.contains("format")
            || action_lower.contains("drop database")
            || action_lower.contains("rm -rf")
        {
            return RiskLevel::Critical;
        }

        // High risk actions
        if action_lower.contains("delete")
            || action_lower.contains("remove")
            || action_lower.contains("modify system")
            || action_lower.contains("install")
            || action_lower.contains("sudo")
            || action_lower.contains("admin")
        {
            return RiskLevel::High;
        }

        // Medium risk actions
        if action_lower.contains("write")
            || action_lower.contains("create")
            || action_lower.contains("update")
            || action_lower.contains("move")
            || action_lower.contains("rename")
        {
            return RiskLevel::Medium;
        }

        // Default to low risk (read-only)
        RiskLevel::Low
    }

    /// Create an approval request
    pub fn create_approval_request(
        &self,
        action: String,
        details: serde_json::Value,
    ) -> ApprovalRequest {
        let risk_level = self.assess_risk(&action);
        let request = ApprovalRequest {
            id: uuid::Uuid::new_v4().to_string(),
            action,
            details,
            risk_level,
            status: ApprovalStatus::Pending,
            created_at: chrono::Utc::now(),
            resolved_at: None,
            resolver_reason: None,
        };

        let mut approvals = self.pending_approvals.lock().unwrap();
        approvals.insert(request.id.clone(), request.clone());

        request
    }

    /// Resolve an approval request
    pub fn resolve_approval(
        &self,
        request_id: &str,
        approved: bool,
        reason: Option<String>,
    ) -> Result<ApprovalRequest, String> {
        let mut approvals = self.pending_approvals.lock().unwrap();
        
        if let Some(request) = approvals.get_mut(request_id) {
            request.status = if approved {
                ApprovalStatus::Approved
            } else {
                ApprovalStatus::Denied
            };
            request.resolved_at = Some(chrono::Utc::now());
            request.resolver_reason = reason;
            
            Ok(request.clone())
        } else {
            Err("Approval request not found".to_string())
        }
    }

    /// Expire stale approval requests that have exceeded their TTL
    pub fn expire_stale_approvals(&self) -> usize {
        let mut approvals = self.pending_approvals.lock().unwrap();
        let now = chrono::Utc::now();
        let mut expired_count = 0;

        for request in approvals.values_mut() {
            if request.status == ApprovalStatus::Pending {
                let age = now.signed_duration_since(request.created_at).num_seconds();
                if age > APPROVAL_TTL_SECONDS {
                    request.status = ApprovalStatus::Expired;
                    request.resolved_at = Some(now);
                    request.resolver_reason = Some("Auto-expired after timeout".to_string());
                    expired_count += 1;
                }
            }
        }

        // Remove resolved/expired requests older than 1 hour to prevent unbounded growth
        let one_hour_ago = now - chrono::Duration::hours(1);
        approvals.retain(|_, r| {
            r.status == ApprovalStatus::Pending
                || r.resolved_at.map_or(true, |t| t > one_hour_ago)
        });

        expired_count
    }

    /// Get all pending approvals (auto-expires stale ones first)
    pub fn get_pending_approvals(&self) -> Vec<ApprovalRequest> {
        self.expire_stale_approvals();
        let approvals = self.pending_approvals.lock().unwrap();
        approvals
            .values()
            .filter(|r| r.status == ApprovalStatus::Pending)
            .cloned()
            .collect()
    }
}

impl Default for SecurityState {
    fn default() -> Self {
        Self::new()
    }
}
