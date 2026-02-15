// Nexus Safety Commands
// Commands for the Agentic Supervisor and safety mechanisms

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use crate::security::SecurityState;
use crate::security::audit_log::{AuditEntry, AuditAction};

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_safe: bool,
    pub is_aligned: bool,
    pub risk_level: String,
    pub requires_approval: bool,
    pub blocked_reason: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApprovalRequestResult {
    pub request_id: String,
    pub action: String,
    pub risk_level: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApprovalResolution {
    pub request_id: String,
    pub approved: bool,
    pub action: String,
    pub resolved_at: String,
}

/// Validate an action before execution
#[tauri::command]
pub fn validate_action(
    action: String,
    context: Option<String>,
    state: State<'_, SecurityState>,
) -> Result<ValidationResult, String> {
    tracing::info!("🔍 Validating action: {}", action);
    
    let mut warnings = Vec::new();
    
    // Check blacklist
    if state.is_blacklisted(&action) {
        // Log the blocked action
        let mut audit = state.audit_log.lock().unwrap();
        audit.log(
            AuditEntry::new(AuditAction::BlacklistBlocked, "supervisor", Some(action.clone()))
                .with_details(serde_json::json!({
                    "context": context
                }))
                .with_error("Action matches blacklisted pattern".to_string())
        );
        
        return Ok(ValidationResult {
            is_safe: false,
            is_aligned: false,
            risk_level: "critical".to_string(),
            requires_approval: false,
            blocked_reason: Some("Action matches a blacklisted pattern and cannot be executed".to_string()),
            warnings: vec!["This action has been permanently blocked for safety reasons".to_string()],
        });
    }
    
    // Assess risk level
    let risk = state.assess_risk(&action);
    let risk_str = match risk {
        crate::security::state::RiskLevel::Low => "low",
        crate::security::state::RiskLevel::Medium => "medium",
        crate::security::state::RiskLevel::High => "high",
        crate::security::state::RiskLevel::Critical => "critical",
    };
    
    // Determine if approval is required
    let requires_approval = matches!(risk, 
        crate::security::state::RiskLevel::High | 
        crate::security::state::RiskLevel::Critical
    );
    
    // Add warnings for medium+ risk
    if matches!(risk, crate::security::state::RiskLevel::Medium) {
        warnings.push("This action will modify data".to_string());
    }
    if matches!(risk, crate::security::state::RiskLevel::High) {
        warnings.push("This action may have significant system impact".to_string());
    }
    if matches!(risk, crate::security::state::RiskLevel::Critical) {
        warnings.push("⚠️ This is a high-risk action that could cause data loss".to_string());
    }
    
    // Intent alignment check (simplified)
    let is_aligned = !action.to_lowercase().contains("hack") 
        && !action.to_lowercase().contains("bypass")
        && !action.to_lowercase().contains("exploit");
    
    if !is_aligned {
        warnings.push("Action appears to conflict with system intent policies".to_string());
    }
    
    Ok(ValidationResult {
        is_safe: true,
        is_aligned,
        risk_level: risk_str.to_string(),
        requires_approval,
        blocked_reason: None,
        warnings,
    })
}

/// Get audit log entries
#[tauri::command]
pub fn get_audit_log(
    count: Option<usize>,
    _action_filter: Option<String>,
    state: State<'_, SecurityState>,
) -> Result<Vec<serde_json::Value>, String> {
    let audit = state.audit_log.lock().unwrap();
    let limit = count.unwrap_or(50);
    
    let entries: Vec<serde_json::Value> = audit
        .get_recent(limit)
        .iter()
        .map(|e| serde_json::json!({
            "id": e.id,
            "timestamp": e.timestamp.to_rfc3339(),
            "action": format!("{:?}", e.action),
            "actor": e.actor,
            "target": e.target,
            "success": e.success,
            "error": e.error_message
        }))
        .collect();
    
    Ok(entries)
}

/// Request user approval for an action
#[tauri::command]
pub fn request_approval(
    app: AppHandle,
    action: String,
    details: serde_json::Value,
    state: State<'_, SecurityState>,
) -> Result<ApprovalRequestResult, String> {
    tracing::info!("🔐 Requesting approval for: {}", action);
    
    let request = state.create_approval_request(action.clone(), details.clone());
    
    // Log the approval request
    let mut audit = state.audit_log.lock().unwrap();
    audit.log(
        AuditEntry::new(AuditAction::ApprovalRequested, "supervisor", Some(action.clone()))
            .with_details(serde_json::json!({
                "request_id": request.id,
                "risk_level": format!("{:?}", request.risk_level)
            }))
    );
    
    let risk_str = match request.risk_level {
        crate::security::state::RiskLevel::Low => "low",
        crate::security::state::RiskLevel::Medium => "medium",
        crate::security::state::RiskLevel::High => "high",
        crate::security::state::RiskLevel::Critical => "critical",
    };
    
    // Emit event to frontend to show HIL modal
    let _ = app.emit("hil:approval_required", serde_json::json!({
        "request_id": request.id,
        "action": action,
        "details": details,
        "risk_level": risk_str,
        "timestamp": request.created_at.to_rfc3339()
    }));
    
    Ok(ApprovalRequestResult {
        request_id: request.id,
        action,
        risk_level: risk_str.to_string(),
        status: "pending".to_string(),
    })
}

/// Resolve an approval request (approve or deny)
#[tauri::command]
pub fn resolve_approval(
    app: AppHandle,
    request_id: String,
    approved: bool,
    reason: Option<String>,
    state: State<'_, SecurityState>,
    orchestrator: State<'_, crate::orchestrator::OrchestratorState>,
) -> Result<ApprovalResolution, String> {
    tracing::info!("📋 Resolving approval {}: {}", request_id, if approved { "APPROVED" } else { "DENIED" });
    
    // Validate the request exists and is still Pending before resolving
    {
        let approvals = state.pending_approvals.lock().unwrap();
        match approvals.get(&request_id) {
            None => {
                tracing::warn!("🚫 Approval spoofing attempt: unknown request_id {}", request_id);
                return Err(format!("Approval request '{}' not found — possible spoofing attempt", request_id));
            }
            Some(req) if req.status != crate::security::state::ApprovalStatus::Pending => {
                tracing::warn!("🚫 Duplicate resolution attempt for {}: already {:?}", request_id, req.status);
                return Err(format!("Approval request '{}' already resolved", request_id));
            }
            _ => {} // Valid pending request
        }
    }
    
    let resolved = state.resolve_approval(&request_id, approved, reason.clone())?;
    
    // Log the resolution
    let mut audit = state.audit_log.lock().unwrap();
    audit.log(
        AuditEntry::new(
            if approved { AuditAction::ApprovalGranted } else { AuditAction::ApprovalDenied },
            "user",
            Some(resolved.action.clone())
        ).with_details(serde_json::json!({
            "request_id": request_id,
            "reason": reason
        }))
    );
    
    // Send decision to Kernel
    if let Ok(mut pm) = orchestrator.process_manager.lock() {
        if pm.is_running() {
             let msg = serde_json::json!({
                 "id": request_id,
                 "message_type": "approval_decision", 
                 "payload": {
                     "request_id": request_id, 
                     "approved": approved,
                     "reason": reason
                 }
             }).to_string();
             let _ = pm.send_message(msg);
        }
    }
    
    // Emit event to notify kernel/frontend of resolution
    let _ = app.emit("hil:approval_resolved", serde_json::json!({
        "request_id": request_id,
        "approved": approved,
        "action": resolved.action.clone(),
        "reason": reason
    }));
    
    Ok(ApprovalResolution {
        request_id,
        approved,
        action: resolved.action,
        resolved_at: chrono::Utc::now().to_rfc3339(),
    })
}
