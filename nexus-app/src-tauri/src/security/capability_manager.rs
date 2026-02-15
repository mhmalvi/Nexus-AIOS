// Nexus Capability Manager - Simplified

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Permission level
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PermissionLevel {
    None,
    Read,
    Write,
    Execute,
    Full,
}

/// Capability definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Capability {
    pub name: String,
    pub description: String,
    pub permission: PermissionLevel,
    pub requires_approval: bool,
}

/// Capability Manager
pub struct CapabilityManager {
    capabilities: HashMap<String, Capability>,
}

impl CapabilityManager {
    pub fn new() -> Self {
        Self {
            capabilities: HashMap::new(),
        }
    }

    /// Load default capability configuration
    pub fn load_default_capabilities(&mut self) {
        self.add_capability(Capability {
            name: "fs:read".to_string(),
            description: "Read files and directories".to_string(),
            permission: PermissionLevel::Read,
            requires_approval: false,
        });

        self.add_capability(Capability {
            name: "fs:write".to_string(),
            description: "Write to files and directories".to_string(),
            permission: PermissionLevel::Write,
            requires_approval: true,
        });

        self.add_capability(Capability {
            name: "shell:execute".to_string(),
            description: "Execute shell commands".to_string(),
            permission: PermissionLevel::Execute,
            requires_approval: true,
        });

        self.add_capability(Capability {
            name: "process:spawn".to_string(),
            description: "Spawn new processes".to_string(),
            permission: PermissionLevel::Execute,
            requires_approval: true,
        });

        self.add_capability(Capability {
            name: "network:fetch".to_string(),
            description: "Make network requests".to_string(),
            permission: PermissionLevel::Read,
            requires_approval: false,
        });

        println!("🔐 Loaded {} default capabilities", self.capabilities.len());
    }

    /// Add a capability
    pub fn add_capability(&mut self, capability: Capability) {
        self.capabilities.insert(capability.name.clone(), capability);
    }

    /// Check if capability requires approval
    pub fn requires_approval(&self, capability_name: &str) -> bool {
        self.capabilities
            .get(capability_name)
            .map(|c| c.requires_approval)
            .unwrap_or(true)
    }

    /// Get all capabilities
    pub fn get_all_capabilities(&self) -> Vec<&Capability> {
        self.capabilities.values().collect()
    }
}

impl Default for CapabilityManager {
    fn default() -> Self {
        let mut manager = Self::new();
        manager.load_default_capabilities();
        manager
    }
}
