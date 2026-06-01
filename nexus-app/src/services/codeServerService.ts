/**
 * Nexus Code — VS Code Server Integration
 * 
 * Uses the built-in `code serve-web` command from the installed VS Code
 * to start a local web server, then opens it in a dedicated Tauri WebviewWindow.
 * 
 * Architecture:
 *   Dock Click → Start `code serve-web` on port 8767 → Open Tauri WebviewWindow
 *   No iframe. Full VS Code. Extensions, debugger, terminal — everything.
 */

const NEXUS_CODE_PORT = 8767;
const NEXUS_CODE_HOST = '127.0.0.1';
const NEXUS_CODE_URL = `http://${NEXUS_CODE_HOST}:${NEXUS_CODE_PORT}`;
const NEXUS_CODE_LABEL = 'nexus-code';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface NexusCodeState {
    serverRunning: boolean;
    windowOpen: boolean;
    pid: number | null;
    error: string | null;
    starting: boolean;
}

const state: NexusCodeState = {
    serverRunning: false,
    windowOpen: false,
    pid: null,
    error: null,
    starting: false,
};

// Listeners for state changes
type StateListener = (s: NexusCodeState) => void;
const listeners: StateListener[] = [];

function notifyListeners() {
    listeners.forEach(fn => fn({ ...state }));
}

export function onStateChange(fn: StateListener) {
    listeners.push(fn);
    return () => {
        const idx = listeners.indexOf(fn);
        if (idx > -1) listeners.splice(idx, 1);
    };
}

export function getState(): NexusCodeState {
    return { ...state };
}

/**
 * Check if VS Code Server is already running on our port
 */
async function isServerAlreadyRunning(): Promise<boolean> {
    try {
        const response = await fetch(NEXUS_CODE_URL, { mode: 'no-cors' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Wait for the server to be ready (polling)
 */
async function waitForServer(timeoutMs: number = 15000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(NEXUS_CODE_URL, { mode: 'no-cors' });
            return true;
        } catch {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    return false;
}

/**
 * Start the VS Code web server using `code serve-web`
 */
/**
 * Start the VS Code web server using `code serve-web`
 */
async function startServer(): Promise<boolean> {
    if (!isTauri) {
        state.error = 'Not running in Tauri environment';
        return false;
    }

    // Already running?
    if (await isServerAlreadyRunning()) {
        console.log('✅ VS Code Server already running on port', NEXUS_CODE_PORT);
        state.serverRunning = true;
        return true;
    }

    try {
        const { invoke } = await import('@tauri-apps/api/core');

        // Launch: code serve-web --host 127.0.0.1 --port 8767 --without-connection-token --accept-server-license-terms
        const cmdString = `code serve-web --host ${NEXUS_CODE_HOST} --port ${NEXUS_CODE_PORT} --without-connection-token --accept-server-license-terms`;

        console.log('🚀 Spawning VS Code Server via Rust backend...');

        // Use the native Rust command to bypass frontend shell restrictions
        // Returns the PID as a string
        const pidStr = await Promise.race([
            invoke<string>('execute_shell', {
                command: cmdString,
                cwd: '.',
                detached: true
            }),
            new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error('Backend command timed out - falling back')), 3000)
            )
        ]);

        const pid = parseInt(pidStr);
        state.pid = isNaN(pid) ? null : pid;
        state.serverRunning = true;
        state.error = null;

        console.log(`🚀 VS Code Server spawned (PID: ${pidStr}), waiting for ready...`);

        // Wait for the server to be ready
        const ready = await waitForServer(15000);
        if (!ready) {
            console.warn('⚠️ VS Code Server did not respond in time.');
            state.error = 'Server timed out';
            return false;
        } else {
            console.log('✅ VS Code Server is ready at', NEXUS_CODE_URL);
        }

        return true;
    } catch (e: any) {
        console.error('Failed to start VS Code Server:', e);
        state.error = e.message || String(e);
        return false;
    }
}

/**
 * Open the Nexus Code window (Tauri WebviewWindow pointing to VS Code Server)
 */
async function openWindow(): Promise<boolean> {
    if (!isTauri) return false;

    try {
        // Use Tauri's WebviewWindow API to create a new window
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

        // Check if window already exists
        const existing = await WebviewWindow.getByLabel(NEXUS_CODE_LABEL);
        if (existing) {
            // Focus existing window
            await existing.setFocus();
            state.windowOpen = true;
            return true;
        }

        // Create new window pointing to VS Code Server
        const webview = new WebviewWindow(NEXUS_CODE_LABEL, {
            url: NEXUS_CODE_URL,
            title: 'Nexus Code',
            width: 1400,
            height: 900,
            center: true,
            decorations: true,
            resizable: true,
            focus: true,
        });

        webview.once('tauri://created', () => {
            console.log('✅ Nexus Code window created');
            state.windowOpen = true;
            notifyListeners();
        });

        webview.once('tauri://error', (e) => {
            console.error('❌ Nexus Code window error:', e);
            state.windowOpen = false;
            state.error = String(e);
            notifyListeners();
        });

        webview.once('tauri://destroyed', () => {
            console.log('Nexus Code window closed');
            state.windowOpen = false;
            notifyListeners();
        });

        return true;
    } catch (e: any) {
        console.error('Failed to open Nexus Code window:', e);
        state.error = e.message || String(e);
        return false;
    }
}

/**
 * Main entry point: Launch Nexus Code
 * 1. Starts VS Code Server if not running
 * 2. Opens a dedicated Tauri window pointing to it
 * 
 * Returns true if successful, false to fall back to in-app Monaco editor
 */
export async function launchNexusCode(): Promise<boolean> {
    if (state.starting) {
        console.log('Nexus Code is already starting...');
        return true;
    }

    state.starting = true;
    state.error = null;
    notifyListeners();

    try {
        // Step 1: Start the server
        const serverOk = await startServer();
        if (!serverOk) {
            console.warn('Could not start VS Code Server, falling back to Monaco.');
            state.starting = false;
            notifyListeners();
            return false;
        }

        // Step 2: Open the window
        const windowOk = await openWindow();
        if (!windowOk) {
            console.warn('Could not open Nexus Code window, falling back to Monaco.');
            state.starting = false;
            notifyListeners();
            return false;
        }

        state.starting = false;
        notifyListeners();
        return true;
    } catch (e: any) {
        state.starting = false;
        state.error = e.message || String(e);
        notifyListeners();
        return false;
    }
}

/**
 * Stop the VS Code Server process
 */
export async function stopNexusCode(): Promise<void> {
    // Close the window
    if (isTauri && state.windowOpen) {
        try {
            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            const win = await WebviewWindow.getByLabel(NEXUS_CODE_LABEL);
            if (win) await win.close();
        } catch { /* ignore */ }
    }

    // The server process will be cleaned up when the parent process exits
    // We don't force-kill it since VS Code may want to save state
    state.windowOpen = false;
    state.serverRunning = false;
    state.pid = null;
    notifyListeners();
}
