
use std::process::Command;
use tauri::command;

#[command]
pub async fn execute_shell(command: String, cwd: Option<String>, detached: Option<bool>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let shell = "cmd";
    #[cfg(not(target_os = "windows"))]
    let shell = "sh";

    #[cfg(target_os = "windows")]
    let args = ["/C", &command];
    #[cfg(not(target_os = "windows"))]
    let args = ["-c", &command];

    let mut cmd = Command::new(shell);
    cmd.args(&args);

    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    // Hide window on Windows to prevent popping up
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    if detached == Some(true) {
        let child = cmd.spawn().map_err(|e| format!("Failed to spawn detached process: {}", e))?;
        return Ok(format!("{}", child.id()));
    }

    let output = cmd.output().map_err(|e| format!("Failed to execute: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        return Err(format!("{}\n{}", stdout, stderr).trim().to_string());
    }

    Ok(stdout.to_string())
}
