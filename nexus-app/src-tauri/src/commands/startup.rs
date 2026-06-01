// Nexus Startup Management
// Manage Windows startup registry entries



#[cfg(target_os = "windows")]
use winreg::enums::*;
#[cfg(target_os = "windows")]
use winreg::RegKey;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct StartupStatus {
    pub is_enabled: bool,
    pub is_minimized: bool,
}

/// Check if startup is enabled
#[tauri::command]
pub fn check_startup_status() -> Result<StartupStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = std::path::Path::new("Software")
            .join("Microsoft")
            .join("Windows")
            .join("CurrentVersion")
            .join("Run");
            
        let (key, _) = hkcu.create_subkey(&path).map_err(|e| e.to_string())?;
        
        let val: Result<String, _> = key.get_value("NexusAIOS");
        
        if let Ok(cmd) = val {
            return Ok(StartupStatus {
                is_enabled: true,
                is_minimized: cmd.contains("--minimized"),
            });
        }
    }
    
    Ok(StartupStatus {
        is_enabled: false,
        is_minimized: false,
    })
}

/// Enable or disable startup
#[tauri::command]
pub fn set_startup_status(enable: bool, minimized: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = std::path::Path::new("Software")
            .join("Microsoft")
            .join("Windows")
            .join("CurrentVersion")
            .join("Run");
            
        let (key, _) = hkcu.create_subkey(&path).map_err(|e| e.to_string())?;
        
        if enable {
            let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let mut cmd = format!("\"{}\"", current_exe.to_string_lossy());
            
            if minimized {
                cmd.push_str(" --minimized");
            }
            
            key.set_value("NexusAIOS", &cmd).map_err(|e| e.to_string())?;
        } else {
            let _ = key.delete_value("NexusAIOS");
        }
        
        return Ok(true);
    }
    
    // For Linux/Mac, we might use .desktop files or launch agents later
    #[cfg(not(target_os = "windows"))]
    {
        Err("Startup management only supported on Windows currently".to_string())
    }
}
