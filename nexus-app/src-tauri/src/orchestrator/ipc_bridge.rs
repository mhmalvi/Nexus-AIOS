// Nexus IPC Bridge - Simplified version

use serde::{Deserialize, Serialize};

/// IPC Message structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcMessage {
    pub id: String,
    pub source: IpcSource,
    pub destination: IpcDestination,
    pub content: IpcContent,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IpcSource {
    Frontend,
    Orchestrator,
    Kernel,
    Agent,
    External(String), // e.g. "whatsapp", "discord" via OpenClaw
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IpcDestination {
    Frontend,
    Orchestrator,
    Kernel,
    Agent,
    Broadcast,
    External(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", content = "data")]
pub enum IpcContent {
    UserQuery { query: String, context: Option<String> },
    UserCommand { command: String, args: Vec<String> },
    TaskRequest { description: String },
    TaskUpdate { task_id: String, status: String, output: Option<String> },
    TextResponse { text: String },
    ErrorResponse { error: String, code: Option<i32> },
    /// Incoming message from external source
    IncomingMessage { 
        source: String,     // e.g. "whatsapp"
        sender: String,     // e.g. "+15550123"
        content: String,    // e.g. "Hello Nexus"
        timestamp: u64      // Unix epoch
    },
    Ping,
    Pong,
    Shutdown,
}

/// IPC Bridge
pub struct IpcBridge {
    is_active: bool,
}

impl IpcBridge {
    pub fn new() -> Self {
        Self { is_active: false }
    }

    pub fn activate(&mut self) {
        self.is_active = true;
        println!("🌉 IPC Bridge activated");
    }

    pub fn deactivate(&mut self) {
        self.is_active = false;
        println!("🌉 IPC Bridge deactivated");
    }

    pub fn is_active(&self) -> bool {
        self.is_active
    }
}

impl Default for IpcBridge {
    fn default() -> Self {
        Self::new()
    }
}
