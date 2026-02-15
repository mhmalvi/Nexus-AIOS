// Nexus Hybrid AIOS - Main Library

mod commands;
mod orchestrator;
mod security;
#[cfg(target_os = "windows")]
mod service;

use commands::*;
use tauri::{Manager, Emitter}; // Added Emitter trait import

/// Initialize the Nexus AIOS
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!("🚀 Nexus Hybrid AIOS Starting...");

    // Initialize tracing
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        // Core Plugins
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(orchestrator::OrchestratorState::new())
        .manage(security::SecurityState::new())
        // Register Commands
        .invoke_handler(tauri::generate_handler![
            // System Commands
            commands::system::get_system_info,
            commands::system::get_platform_info,
            // Kernel Commands
            commands::kernel::start_kernel,
            commands::kernel::stop_kernel,
            commands::kernel::send_to_kernel,
            commands::kernel::get_kernel_status,
            // Memory Commands
            commands::memory::query_memory,
            commands::memory::store_memory,
            commands::memory::clear_memory_tier,
            // Agent Commands
            commands::agent::execute_task,
            commands::agent::get_task_status,
            commands::agent::cancel_task,
            // Safety Commands
            commands::safety::validate_action,
            commands::safety::get_audit_log,
            commands::safety::request_approval,
            commands::safety::resolve_approval,
            // Ollama Commands
            commands::ollama::check_ollama_installed,
            commands::ollama::download_ollama,
            commands::ollama::install_ollama,
            commands::ollama::start_ollama,
            commands::ollama::ensure_model,
            commands::ollama::get_model_stats,
            // Startup Commands
            commands::startup::check_startup_status,
            commands::startup::set_startup_status,
            // Shell Commands
            commands::shell::execute_shell,
        ])
        .setup(|app| {
            println!("📦 Nexus AIOS Setup Complete");
            
            // Initialize the orchestrator
            let orchestrator = app.state::<orchestrator::OrchestratorState>();
            orchestrator.initialize(app.handle().clone());
            
            // Register Alt+Space global shortcut
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
            
            let shortcut: Shortcut = "Alt+Space".parse().unwrap();
            let handle = app.handle().clone();
            
            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    // Emit event to frontend to toggle command palette
                    let _ = handle.emit("global-shortcut-triggered", "Alt+Space");
                }
            })?;
            
            if let Err(e) = app.global_shortcut().register(shortcut) {
                println!("⚠️ Failed to register Alt+Space global shortcut: {}", e);
            } else {
                println!("⌨️ Alt+Space global shortcut registered");
            }

            // Auto-start Kernel
            let pm_clone = orchestrator.process_manager.clone();
            let handle_clone = app.handle().clone();
            std::thread::spawn(move || {
                // Wait a moment for UI to be ready
                std::thread::sleep(std::time::Duration::from_millis(1000));
                
                if let Ok(mut pm) = pm_clone.lock() {
                     println!("🚀 Auto-starting Nexus Kernel...");
                     if let Err(e) = pm.start_kernel(handle_clone) {
                         println!("❌ Failed to auto-start kernel: {}", e);
                     }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Error while running Nexus AIOS");
}
