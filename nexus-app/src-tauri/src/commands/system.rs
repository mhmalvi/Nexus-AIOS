// Nexus System Commands
// System information and platform-specific operations

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os_name: String,
    pub kernel_version: String,
    pub arch: String,
    pub hostname: String,
    pub cpu_count: usize,
    pub total_memory: u64,
    pub used_memory: u64,
    pub uptime: u64,
    pub home_dir: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlatformInfo {
    pub platform: String,
    pub shell: String,
    pub path_separator: String,
    pub line_ending: String,
}

/// Get system information
#[tauri::command]
pub fn get_system_info() -> Result<SystemInfo, String> {
    use std::env;
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_all();

    let home_dir = dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    Ok(SystemInfo {
        os_name: System::name().unwrap_or_else(|| "Unknown".to_string()),
        kernel_version: System::kernel_version().unwrap_or_else(|| "Unknown".to_string()),
        arch: env::consts::ARCH.to_string(),
        hostname: System::host_name().unwrap_or_else(|| "Unknown".to_string()),
        cpu_count: sys.cpus().len(),
        total_memory: sys.total_memory(),
        used_memory: sys.used_memory(),
        uptime: System::uptime(),
        home_dir,
    })
}

/// Get platform-specific information
#[tauri::command]
pub fn get_platform_info() -> Result<PlatformInfo, String> {
    #[cfg(target_os = "windows")]
    let platform_info = PlatformInfo {
        platform: "windows".to_string(),
        shell: "powershell".to_string(),
        path_separator: "\\".to_string(),
        line_ending: "\r\n".to_string(),
    };

    #[cfg(target_os = "linux")]
    let platform_info = PlatformInfo {
        platform: "linux".to_string(),
        shell: "bash".to_string(),
        path_separator: "/".to_string(),
        line_ending: "\n".to_string(),
    };

    #[cfg(target_os = "macos")]
    let platform_info = PlatformInfo {
        platform: "macos".to_string(),
        shell: "zsh".to_string(),
        path_separator: "/".to_string(),
        line_ending: "\n".to_string(),
    };

    Ok(platform_info)
}
