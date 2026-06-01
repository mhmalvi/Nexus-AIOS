// Nexus PTY Commands — real pseudo-terminal backing the in-app terminal.
//
// Unlike `execute_shell` (one-shot: run a command, capture stdout, exit), this
// opens a true PTY (ConPTY on Windows, openpty on Unix) and streams bytes both
// ways. That makes interactive programs work in the dock terminal — including
// the `aether` REPL (prompt_toolkit, arrow-key menus, live rendering).
//
// Protocol (per session `id`):
//   command  pty_spawn(id, cwd, cols, rows)  -> opens a PTY + shell
//   command  pty_write(id, data)             -> writes keystrokes to the PTY
//   command  pty_resize(id, cols, rows)      -> resizes the PTY
//   command  pty_kill(id)                    -> terminates the session
//   event    "pty:data:{id}"  (String)       -> output bytes (lossy UTF-8)
//   event    "pty:exit:{id}"  (())           -> the shell exited

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, State};

/// One live PTY session.
struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

/// Tauri-managed registry of PTY sessions, keyed by frontend-supplied id.
#[derive(Default)]
pub struct PtyState {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Open a PTY and spawn the platform shell inside it.
#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyState>,
    id: String,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let size = PtySize {
        rows: rows.unwrap_or(24),
        cols: cols.unwrap_or(80),
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    // Choose the shell.
    #[cfg(windows)]
    let mut cmd = CommandBuilder::new("cmd.exe");
    #[cfg(not(windows))]
    let mut cmd = {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        CommandBuilder::new(shell)
    };

    // Working directory: requested, else the user's home.
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    } else if let Some(home) = dirs::home_dir() {
        cmd.cwd(home);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;
    // The slave handle is no longer needed once the child owns it.
    drop(pair.slave);

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Stream output to the frontend on a background thread.
    let app_clone = app.clone();
    let id_clone = id.clone();
    thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF — shell closed
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(&format!("pty:data:{}", id_clone), chunk);
                }
                Err(_) => break,
            }
        }
        let _ = app_clone.emit(&format!("pty:exit:{}", id_clone), ());
    });

    let session = PtySession {
        master: pair.master,
        writer,
        child,
    };
    state.sessions.lock().unwrap().insert(id, session);
    Ok(())
}

/// Write keystrokes / input to a session.
#[tauri::command]
pub fn pty_write(state: State<'_, PtyState>, id: String, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(s) = sessions.get_mut(&id) {
        s.writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        s.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Resize a session's PTY (called on xterm fit/resize).
#[tauri::command]
pub fn pty_resize(
    state: State<'_, PtyState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(s) = sessions.get(&id) {
        s.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Terminate and remove a session.
#[tauri::command]
pub fn pty_kill(state: State<'_, PtyState>, id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(mut s) = sessions.remove(&id) {
        let _ = s.child.kill();
    }
    Ok(())
}
