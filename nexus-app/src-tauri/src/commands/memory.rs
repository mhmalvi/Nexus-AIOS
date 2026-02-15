// Nexus Memory Commands
// Routes memory operations to the Python kernel via IPC (LanceDB backend)

use serde::{Deserialize, Serialize};
use tauri::State;
use crate::orchestrator::OrchestratorState;

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryQueryResult {
    pub success: bool,
    pub tier: String,
    pub results: Vec<MemoryEntry>,
    pub total_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: String,
    pub content: String,
    pub metadata: serde_json::Value,
    pub score: f32,
    pub tier: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryStoreResult {
    pub success: bool,
    pub id: String,
    pub tier: String,
}

/// Helper: send a message to the Python kernel and return the raw JSON response
fn send_kernel_message(
    state: &OrchestratorState,
    message_type: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut pm = state.process_manager.lock().unwrap();

    let msg = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "message_type": message_type,
        "payload": payload
    });

    pm.send_message(msg.to_string())
        .map_err(|e| format!("Kernel IPC error: {}", e))?;

    // The response comes back asynchronously via the event system.
    // Return an ack so the frontend knows the request was dispatched.
    Ok(serde_json::json!({ "dispatched": true }))
}

/// Query memory across tiers (routed to Python kernel LanceDB)
#[tauri::command]
pub fn query_memory(
    query: String,
    tier: Option<String>,
    limit: Option<usize>,
    state: State<'_, OrchestratorState>,
) -> Result<MemoryQueryResult, String> {
    let tier_name = tier.unwrap_or_else(|| "all".to_string());
    let result_limit = limit.unwrap_or(10);

    println!("🔍 Querying memory: {} (tier: {}, limit: {})", query, tier_name, result_limit);

    let payload = serde_json::json!({
        "query": query,
        "tier": tier_name,
        "limit": result_limit
    });

    // Dispatch to kernel - results arrive via async event stream
    let _ = send_kernel_message(&state, "query_memory", payload);

    // Return immediate ack; real results come via kernel response events
    Ok(MemoryQueryResult {
        success: true,
        tier: tier_name,
        results: vec![],
        total_count: 0,
    })
}

/// Store content in memory (routed to Python kernel LanceDB)
#[tauri::command]
pub fn store_memory(
    content: String,
    tier: String,
    metadata: Option<serde_json::Value>,
    state: State<'_, OrchestratorState>,
) -> Result<MemoryStoreResult, String> {
    let entry_metadata = metadata.unwrap_or_else(|| serde_json::json!({}));
    let id = uuid::Uuid::new_v4().to_string();

    println!("💾 Storing to {} memory: {} chars", tier, content.len());

    let payload = serde_json::json!({
        "content": content,
        "tier": tier,
        "metadata": entry_metadata,
        "id": id
    });

    let _ = send_kernel_message(&state, "store_memory", payload);

    Ok(MemoryStoreResult {
        success: true,
        id,
        tier,
    })
}

/// Clear a memory tier (routed to Python kernel)
#[tauri::command]
pub fn clear_memory_tier(
    tier: String,
    state: State<'_, OrchestratorState>,
) -> Result<serde_json::Value, String> {
    println!("🗑️ Clearing memory tier: {}", tier);

    let payload = serde_json::json!({
        "tier": tier,
        "action": "clear"
    });

    let _ = send_kernel_message(&state, "manage_memory", payload);

    Ok(serde_json::json!({
        "success": true,
        "tier": tier,
        "dispatched": true
    }))
}
