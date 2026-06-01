// Nexus Ollama Commands
// Ollama LLM engine management and auto-installation

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub installed: bool,
    pub running: bool,
    pub version: Option<String>,
    pub models: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadProgress {
    pub stage: String,
    pub progress: f64,
    pub message: String,
}

/// Check if Ollama is installed on the system
#[tauri::command]
pub async fn check_ollama_installed() -> Result<OllamaStatus, String> {
    let mut status = OllamaStatus {
        installed: false,
        running: false,
        version: None,
        models: Vec::new(),
    };
    
    // Check if ollama command exists
    #[cfg(target_os = "windows")]
    let ollama_path = which_ollama_windows();
    
    #[cfg(not(target_os = "windows"))]
    let ollama_path = which_ollama_unix();
    
    if let Some(path) = ollama_path {
        status.installed = true;
        
        // Try to get version
        if let Ok(output) = Command::new(&path).arg("--version").output() {
            if output.status.success() {
                status.version = Some(String::from_utf8_lossy(&output.stdout).trim().to_string());
            }
        }
        
        // Check if running by trying to list models
        if let Ok(output) = Command::new(&path).arg("list").output() {
            if output.status.success() {
                status.running = true;
                let output_str = String::from_utf8_lossy(&output.stdout);
                for line in output_str.lines().skip(1) {
                    if let Some(model_name) = line.split_whitespace().next() {
                        status.models.push(model_name.to_string());
                    }
                }
            }
        }
    }
    
    Ok(status)
}

#[cfg(target_os = "windows")]
fn which_ollama_windows() -> Option<PathBuf> {
    // Check common Windows installation paths
    let paths = [
        PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default()).join("Programs\\Ollama\\ollama.exe"),
        PathBuf::from(std::env::var("PROGRAMFILES").unwrap_or_default()).join("Ollama\\ollama.exe"),
        PathBuf::from("C:\\Program Files\\Ollama\\ollama.exe"),
    ];
    
    for path in paths {
        if path.exists() {
            return Some(path);
        }
    }
    
    // Check PATH
    if let Ok(output) = Command::new("where").arg("ollama").output() {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = path_str.lines().next() {
                let path = PathBuf::from(first_line.trim());
                if path.exists() {
                    return Some(path);
                }
            }
        }
    }
    
    None
}

#[cfg(not(target_os = "windows"))]
fn which_ollama_unix() -> Option<PathBuf> {
    // Check common Unix paths
    let paths = [
        PathBuf::from("/usr/local/bin/ollama"),
        PathBuf::from("/usr/bin/ollama"),
        PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".local/bin/ollama"),
    ];
    
    for path in paths {
        if path.exists() {
            return Some(path);
        }
    }
    
    // Check PATH using which
    if let Ok(output) = Command::new("which").arg("ollama").output() {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout);
            let path = PathBuf::from(path_str.trim());
            if path.exists() {
                return Some(path);
            }
        }
    }
    
    None
}

/// Download Ollama installer for the current platform
#[tauri::command]
pub async fn download_ollama(app: tauri::AppHandle) -> Result<PathBuf, String> {
    use std::io::Write;
    
    #[cfg(target_os = "windows")]
    let download_url = "https://ollama.ai/download/OllamaSetup.exe";
    
    #[cfg(target_os = "linux")]
    let download_url = "https://ollama.ai/install.sh";
    
    #[cfg(target_os = "macos")]
    let download_url = "https://ollama.ai/download/Ollama-darwin.zip";
    
    // Get temp directory for download
    let temp_dir = std::env::temp_dir();
    
    #[cfg(target_os = "windows")]
    let installer_path = temp_dir.join("OllamaSetup.exe");
    
    #[cfg(target_os = "linux")]
    let installer_path = temp_dir.join("ollama_install.sh");
    
    #[cfg(target_os = "macos")]
    let installer_path = temp_dir.join("Ollama-darwin.zip");
    
    // Emit progress event
    let _ = app.emit("ollama_download_progress", DownloadProgress {
        stage: "downloading".to_string(),
        progress: 0.0,
        message: "Starting download...".to_string(),
    });
    
    // Download using reqwest-like approach with blocking client
    let client = reqwest::Client::new();
    let response = client.get(download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download: {}", e))?;
    
    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    
    let mut file = std::fs::File::create(&installer_path)
        .map_err(|e| format!("Failed to create installer file: {}", e))?;
    
    let bytes = response.bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    downloaded = bytes.len() as u64;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write installer: {}", e))?;
    
    let progress = if total_size > 0 {
        (downloaded as f64 / total_size as f64) * 100.0
    } else {
        100.0
    };
    
    let _ = app.emit("ollama_download_progress", DownloadProgress {
        stage: "complete".to_string(),
        progress,
        message: "Download complete!".to_string(),
    });
    
    Ok(installer_path)
}

/// Install Ollama (runs the downloaded installer)
#[tauri::command]
pub async fn install_ollama(installer_path: String, app: tauri::AppHandle) -> Result<bool, String> {
    let path = PathBuf::from(&installer_path);
    
    if !path.exists() {
        return Err("Installer not found".to_string());
    }
    
    let _ = app.emit("ollama_install_progress", DownloadProgress {
        stage: "installing".to_string(),
        progress: 0.0,
        message: "Starting installation...".to_string(),
    });
    
    #[cfg(target_os = "windows")]
    {
        // Run Windows installer silently
        let result = Command::new(&path)
            .args(["/S", "/D=C:\\Program Files\\Ollama"])
            .spawn();
        
        match result {
            Ok(mut child) => {
                // Wait for installation to complete
                match child.wait() {
                    Ok(status) => {
                        let _ = app.emit("ollama_install_progress", DownloadProgress {
                            stage: if status.success() { "complete" } else { "error" }.to_string(),
                            progress: 100.0,
                            message: if status.success() { 
                                "Installation complete!".to_string() 
                            } else { 
                                "Installation failed".to_string() 
                            },
                        });
                        Ok(status.success())
                    }
                    Err(e) => Err(format!("Failed to wait for installer: {}", e))
                }
            }
            Err(e) => Err(format!("Failed to run installer: {}", e))
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        // Run Linux install script
        let result = Command::new("sh")
            .arg(&path)
            .spawn();
        
        match result {
            Ok(mut child) => {
                match child.wait() {
                    Ok(status) => {
                        let _ = app.emit("ollama_install_progress", DownloadProgress {
                            stage: if status.success() { "complete" } else { "error" }.to_string(),
                            progress: 100.0,
                            message: if status.success() { 
                                "Installation complete!".to_string() 
                            } else { 
                                "Installation failed".to_string() 
                            },
                        });
                        Ok(status.success())
                    }
                    Err(e) => Err(format!("Failed to wait for installer: {}", e))
                }
            }
            Err(e) => Err(format!("Failed to run installer: {}", e))
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        // For macOS, extract and copy to Applications
        // This would need more complex handling
        Err("macOS installation not yet implemented".to_string())
    }
}

/// Start Ollama service
#[tauri::command]
pub async fn start_ollama() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let result = Command::new("ollama")
            .arg("serve")
            .spawn();
        
        match result {
            Ok(_) => {
                // Give it a moment to start
                std::thread::sleep(std::time::Duration::from_secs(2));
                Ok(true)
            }
            Err(e) => Err(format!("Failed to start Ollama: {}", e))
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        // Try systemd first, then direct start
        let systemd_result = Command::new("systemctl")
            .args(["--user", "start", "ollama"])
            .status();
        
        if let Ok(status) = systemd_result {
            if status.success() {
                return Ok(true);
            }
        }
        
        // Fall back to direct start
        let result = Command::new("ollama")
            .arg("serve")
            .spawn();
        
        match result {
            Ok(_) => {
                std::thread::sleep(std::time::Duration::from_secs(2));
                Ok(true)
            }
            Err(e) => Err(format!("Failed to start Ollama: {}", e))
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        let result = Command::new("ollama")
            .arg("serve")
            .spawn();
        
        match result {
            Ok(_) => {
                std::thread::sleep(std::time::Duration::from_secs(2));
                Ok(true)
            }
            Err(e) => Err(format!("Failed to start Ollama: {}", e))
        }
    }
}

/// Ensure a specific model is available (pull if not present)
#[tauri::command]
pub async fn ensure_model(model_name: String, app: tauri::AppHandle) -> Result<bool, String> {
    let _ = app.emit("ollama_model_progress", DownloadProgress {
        stage: "checking".to_string(),
        progress: 0.0,
        message: format!("Checking for model {}...", model_name),
    });
    
    // Check if model exists
    let check = Command::new("ollama")
        .args(["show", &model_name])
        .output();
    
    if let Ok(output) = check {
        if output.status.success() {
            let _ = app.emit("ollama_model_progress", DownloadProgress {
                stage: "complete".to_string(),
                progress: 100.0,
                message: format!("Model {} already available", model_name),
            });
            return Ok(true);
        }
    }
    
    // Model not found, pull it
    let _ = app.emit("ollama_model_progress", DownloadProgress {
        stage: "pulling".to_string(),
        progress: 10.0,
        message: format!("Pulling model {}...", model_name),
    });
    
    let pull_result = Command::new("ollama")
        .args(["pull", &model_name])
        .output();
    
    match pull_result {
        Ok(output) => {
            let success = output.status.success();
            let _ = app.emit("ollama_model_progress", DownloadProgress {
                 stage: if success { "complete" } else { "error" }.to_string(),
                 progress: 100.0,
                 message: if success {
                     format!("Model {} ready!", model_name)
                 } else {
                     format!("Failed to pull model: {}", String::from_utf8_lossy(&output.stderr))
                 },
             });
             Ok(success)
        }
        Err(e) => Err(format!("Failed to pull model: {}", e))
    }
}

/// Get statistics about LLM models
#[tauri::command]
pub async fn get_model_stats(_app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    // Check installed models
    let status = check_ollama_installed().await?;
    
    // Use first installed model as default, or fallback to configured default
    let default_model = std::env::var("NEXUS_DEFAULT_MODEL")
        .unwrap_or_else(|_| {
            status.models.first()
                .cloned()
                .unwrap_or_else(|| "llama3.2".to_string())
        });

    Ok(serde_json::json!({
        "default_model": default_model,
        "llm_routing_enabled": true,
        "active_models": if status.running { status.models.clone() } else { vec![] },
        "installed_models": status.models,
        "request_count": 0
    }))
}
