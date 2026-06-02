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
    pub total_disk: u64,
    pub used_disk: u64,
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

    // Real disk usage (summed across mounted physical disks) so the UI can show
    // an honest storage figure instead of a hardcoded placeholder.
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let mut total_disk: u64 = 0;
    let mut available_disk: u64 = 0;
    for disk in disks.list() {
        total_disk = total_disk.saturating_add(disk.total_space());
        available_disk = available_disk.saturating_add(disk.available_space());
    }
    let used_disk = total_disk.saturating_sub(available_disk);

    Ok(SystemInfo {
        os_name: System::name().unwrap_or_else(|| "Unknown".to_string()),
        kernel_version: System::kernel_version().unwrap_or_else(|| "Unknown".to_string()),
        arch: env::consts::ARCH.to_string(),
        hostname: System::host_name().unwrap_or_else(|| "Unknown".to_string()),
        cpu_count: sys.cpus().len(),
        total_memory: sys.total_memory(),
        used_memory: sys.used_memory(),
        total_disk,
        used_disk,
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
