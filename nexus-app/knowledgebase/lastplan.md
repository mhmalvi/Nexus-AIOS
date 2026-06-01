The user wants **production-grade readiness** with no mock/dummy data, full frontend-backend integration, and a working ISO build pipeline. This analysis identifies every gap between the current state and that
     goal.

     ---

     ## PART 1: COMPREHENSIVE FINDINGS

     ### CRITICAL ISSUE 1: Frontend Apps Show Mock/Dummy Data (Not Connected to Backend)

     Almost every frontend app falls back to hardcoded demo data instead of fetching from the real kernel:

     | App | File | Issue |
     |-----|------|-------|
     | **Memory Explorer** | `src/components/tools/MemoryExplorer.tsx:32-51` | `DEMO_MEMORIES` array with 11 hardcoded entries displayed as fallback |
     | **Security Center** | `src/components/tools/SecurityCenter.tsx:34-62` | `DEMO_FINDINGS` (7 items), `DEMO_ACTIVITY` (8 items), `DEMO_TOOL_USAGE` (6 items) all hardcoded |
     | **War Room** | `src/components/agent/WarRoom.tsx` | 4 mock agents (Manager, SecOps, DevArch, Analyst) with fake status |
     | **Web Browser** | `src/components/tools/WebBrowser.tsx` | Hardcoded bookmarks, no actual page navigation |
     | **System Terminal** | `src/components/tools/SystemTerminal.tsx` | Commands don't execute — UI-only shell |
     | **Agent Builder** | `src/components/tools/AgentBuilder.tsx` | Placeholder UI with no backend wiring |
     | **Module Manager** | `src/components/tools/ModuleManager.tsx` | Placeholder with empty/hardcoded data |
     | **Scheduler** | `src/components/tools/Scheduler.tsx` | Placeholder with no cron service connection |
     | **AETHER Chat** | `src/components/chat/ChatInterface.tsx` | Falls back to mock response: "I'm running in browser demo mode..." |
     | **Code Editor** | `src/components/tools/CodeEditor.tsx` | Monaco editor works but AI assistant returns mock responses |
     | **File Manager** | `src/components/tools/FileManager.tsx` | Calls `fsApi.readDir()` but shows mock directory on failure |

     **Root Cause**: `src/services/mockTauri.ts` (622 lines) — The mock layer returns fake responses when running outside Tauri context. The problem is:
     1. In browser dev mode, `__TAURI_INTERNALS__` is not present, so ALL calls go through mocks
     2. Even inside Tauri, some commands dispatch but return empty immediately (async dispatch without waiting for response)
     3. Memory, security, and agent queries are fire-and-forget — frontend sends to kernel but doesn't listen for the actual data back

     ### CRITICAL ISSUE 2: Nexus Code App Doesn't Open

     **File**: `src/services/codeServerService.ts` (271 lines)

     Flow when user clicks "Nexus Code" in dock:
     1. `launchNexusCode()` → `startServer()` → tries `invoke('execute_shell', 'code serve-web --host 127.0.0.1 --port 8767')`
     2. If not in Tauri context → immediately fails → falls back to in-app Monaco editor in `CodeEditor.tsx`
     3. Even in Tauri: requires VS Code CLI (`code`) to be installed at system PATH
     4. 15-second timeout waiting for server → falls back to Monaco

     **Why it appears "nothing opens"**: The fallback to Monaco should work, but the window may not be getting created. Need to verify `handleAppClick('code')` in `Dock.tsx:178` properly dispatches window creation.

     ### CRITICAL ISSUE 3: Frontend ↔ Backend Integration Gaps

     **Tauri Bridge Architecture** (`src-tauri/src/`):
     - 25 Tauri commands registered (all real implementations, NOT stubs)
     - IPC: Rust spawns Python kernel, communicates via stdin/stdout JSON
     - Python kernel auto-starts 1 second after app launch

     **The Disconnect**:
     1. **Async Response Pattern Broken**: Rust sends messages to Python kernel and returns `"Message dispatched"` immediately. The actual response comes back via Tauri events (`kernel:response`), but many frontend
     components don't properly listen for these events.
     2. **Memory queries** (`query_memory`, `store_memory`) dispatch to kernel but return empty — frontend doesn't subscribe to the response event
     3. **Security audit** (`get_audit_log`) same issue — dispatches but no event listener for results
     4. **Agent tasks** (`execute_task`) — no real-time step update streaming implemented

     ### CRITICAL ISSUE 4: Python Kernel Environment

     - **No Python venv bundled**: `kernel/venv/` doesn't exist in the repo
     - `python3` not found on this Windows machine (confirmed by agent)
     - Requirements are specified in `kernel/requirements.lock.txt` (60+ packages including lancedb, langchain, faster-whisper, piper-tts)
     - **No sidecar bundling**: Tauri doesn't package Python with the app
     - Expected paths: Windows `kernel/venv/Scripts/python.exe`, Linux `kernel/.venv/bin/python`

     ### CRITICAL ISSUE 5: ISO Build Pipeline Gaps

     **What exists** (mostly well-structured):
     - `linux/build-iso-docker.sh` — Docker-based build orchestrator
     - `linux/build-iso.sh` — Arch ISO build script (runs inside Docker)
     - `nexus-profile/` — mkarchiso profile (packages.x86_64, pacman.conf, profiledef.sh, airootfs, grub, syslinux, efiboot)
     - `linux/systemd/` — 4 service files (nexus-core, nexus-kernel, nexus-ollama, nexus-kernel.socket)
     - `linux/packaging/arch/` — PKGBUILD, sysusers, tmpfiles, setup script
     - `linux/dbus/org.nexus.Agent.xml` — D-Bus interface definition

     **Gaps**:
     1. **No `nexus-core` binary exists**: `nexus-core.service` references `/opt/nexus/bin/nexus-core` but no Tauri build output is packaged into the ISO
     2. **Missing Tauri Linux build step**: No script compiles the Rust/Tauri app for Linux x86_64
     3. **No desktop environment specified**: The ISO packages list doesn't include a window manager or Wayland compositor for the Tauri app to run in
     4. **Python venv not created during ISO build**: The `setup-kernel.sh` script should create the venv but it runs on first boot, requiring internet
     5. **No Ollama model pre-pull**: Users would need internet on first boot to pull llama3.2
     6. **`nexus-profile/packages.x86_64`** may be missing critical dependencies (gtk, webkit, etc. for Tauri)

     ### MODERATE ISSUES

     | # | Issue | Location | Impact |
     |---|-------|----------|--------|
     | 6 | LLM model hardcoded to `llama3.2:3b` | `src-tauri/src/commands/ollama.rs` | Can't change model without recompile |
     | 7 | No timeout on kernel IPC | `src-tauri/src/orchestrator/process_manager.rs` | Long operations can hang forever |
     | 8 | Audit log auto-cleanup removes entries >1hr | `src-tauri/src/security/audit_log.rs` | Production needs longer retention |
     | 9 | Hardcoded default path in CodeEditor | `src/components/tools/CodeEditor.tsx` | `C:/Users/davin/Downloads/nexus-ag/` |
     | 10 | 63MB ONNX voice model in repo | `kernel/en_US-lessac-medium.onnx` | Should use Git LFS or download on demand |
     | 11 | `main.py` is 2587 lines | `kernel/main.py` | Fragile monolith, but functional |
     | 12 | No health check endpoint | Tauri ↔ Kernel | No periodic heartbeat to detect kernel crashes |

     ---

     ## PART 2: FIX PLAN (Priority Order)

     ### Phase A: Remove All Mock/Dummy Data — Wire Real Backend (HIGH PRIORITY)

     **A1. Fix async response pattern in Tauri bridge**
     - Files: `src/services/tauriApi.ts`, `src/services/mockTauri.ts`
     - Change: For commands that dispatch async (memory, security, agents), add proper event listeners that resolve a Promise when `kernel:response` arrives with matching request ID
     - Pattern: `invoke('query_memory', {...})` should return a Promise that resolves when `kernel:response` event with matching `id` arrives

     **A2. Remove DEMO_MEMORIES from Memory Explorer**
     - File: `src/components/tools/MemoryExplorer.tsx`
     - Remove lines 32-51 (`DEMO_MEMORIES` array)
     - Wire `memoryApi.query()` to actually wait for kernel response
     - Show loading spinner while waiting, "No memories yet" if empty

     **A3. Remove DEMO_FINDINGS/DEMO_ACTIVITY/DEMO_TOOL_USAGE from Security Center**
     - File: `src/components/tools/SecurityCenter.tsx`
     - Remove lines 34-62 (all demo arrays)
     - Wire `safetyApi.getAuditLog()` to real kernel response
     - Show real audit data or "No audit entries" if empty

     **A4. Wire System Terminal to real shell execution**
     - File: `src/components/tools/SystemTerminal.tsx`
     - Use `invoke('execute_shell', { command })` for real command execution
     - Stream output back to terminal UI

     **A5. Wire War Room to real agent status**
     - File: `src/components/agent/WarRoom.tsx`
     - Remove 4 mock agents
     - Subscribe to `kernel:response` events for agent status updates

     **A6. Wire Scheduler to real cron service**
     - File: `src/components/tools/Scheduler.tsx`
     - Connect to kernel's `cron_service.py` via Tauri commands

     **A7. Wire Agent Builder to kernel's agent registry**
     - File: `src/components/tools/AgentBuilder.tsx`
     - Use `invoke('execute_task', {...})` for agent creation
     - Display real registered agents

     **A8. Wire Module Manager to plugin system**
     - File: `src/components/tools/ModuleManager.tsx`
     - Connect to kernel's `plugin_system.py`

     ### Phase B: Fix Nexus Code App (HIGH PRIORITY)

     **B1. Fix window creation on dock click**
     - File: `src/components/layout/Dock.tsx:178`
     - Ensure `handleAppClick('code')` properly creates the CodeEditor window
     - Remove dependency on VS Code Server — always use in-app Monaco editor as primary
     - VS Code Server should be an optional enhancement, not required

     **B2. Remove hardcoded path**
     - File: `src/components/tools/CodeEditor.tsx`
     - Replace `C:/Users/davin/Downloads/nexus-ag/nexus-app` with dynamic home directory detection

     ### Phase C: Strengthen Frontend ↔ Backend Bridge (HIGH PRIORITY)

     **C1. Implement request-response correlation**
     - File: `src/services/tauriApi.ts`
     - Every `invoke()` that dispatches to kernel should include a UUID
     - Set up event listener for `kernel:response` with matching UUID
     - Return a Promise that resolves with the kernel's actual response
     - Add 30-second timeout with proper error handling

     **C2. Add kernel health monitoring**
     - File: `src/services/tauriApi.ts` + `src/App.tsx`
     - Periodic `invoke('get_kernel_status')` every 5 seconds
     - Display kernel status in StatusBar (running/stopped/error)
     - Auto-restart kernel if crashed

     **C3. Fix Chat to use real streaming**
     - File: `src/components/chat/ChatInterface.tsx`
     - When running inside Tauri, use real `kernel:response` and `kernel:chunk` events
     - Remove the "browser demo mode" message fallback

     ### Phase D: ISO Build Pipeline Completion (MEDIUM PRIORITY)

     **D1. Add Tauri Linux build to ISO pipeline**
     - File: `linux/build-iso-docker.sh`
     - Add step to compile Tauri app for Linux x86_64 inside Docker
     - Copy resulting binary to ISO's `/opt/nexus/bin/nexus-core`

     **D2. Add desktop environment to ISO**
     - File: `nexus-profile/packages.x86_64`
     - Add minimal window manager (sway/hyprland for Wayland, or openbox for X11)
     - Add required Tauri dependencies (webkit2gtk, gtk3, etc.)
     - Add auto-login and auto-start for nexus-core

     **D3. Pre-create Python venv in ISO**
     - File: `linux/build-iso.sh`
     - Build Python venv with all requirements during ISO creation (not first boot)
     - Bundle at `/opt/nexus/.venv/`

     **D4. Optional: Pre-pull Ollama model**
     - File: `linux/build-iso.sh`
     - Pull `llama3.2:3b` during ISO creation for offline-first experience
     - Store in `/var/lib/nexus/models/`

     **D5. Fix service file paths**
     - File: `linux/systemd/nexus-core.service`
     - Ensure `ExecStart` points to actual built binary
     - Add `After=nexus-kernel.service` dependency

     ### Phase E: Production Hardening (LOW PRIORITY)

     **E1. Add kernel IPC timeout** — 30s default in `process_manager.rs`
     **E2. Make LLM model configurable** — Runtime config instead of hardcoded
     **E3. Extend audit log retention** — 30 days instead of 1 hour
     **E4. Add Git LFS for ONNX model** — Remove 63MB binary from repo
     **E5. Add error boundaries** — React error boundaries around each window component

     ---

     ## PART 3: VERIFICATION PLAN

     ### After Phase A-C (Frontend-Backend Integration):
     1. Run `npm run tauri dev` from `nexus-app/`
     2. Verify kernel auto-starts (check console for "Auto-starting Nexus Kernel")
     3. Open AETHER Chat → Send message → Verify real LLM response (not mock)
     4. Open Memory Explorer → Verify no demo data, shows real memories or empty state
     5. Open Security Center → Verify no demo findings, shows real audit or empty state
     6. Open System Terminal → Type `ls` → Verify real output
     7. Open Nexus Code → Verify Monaco editor opens with file tree
     8. Open War Room → Verify shows real agent status or empty state

     ### After Phase D (ISO Build):
     1. Run `./linux/build-iso-docker.sh` in Docker
     2. Boot resulting ISO in QEMU/VirtualBox
     3. Verify nexus-core service starts
     4. Verify kernel service starts
     5. Verify Ollama service starts
     6. Open terminal → `nexus-cli` → Send query → Get LLM response
     7. Launch desktop → Verify full UI loads

     ---

     ## FILES TO MODIFY (Summary)

     ### Frontend (React/TypeScript):
     - `nexus-app/src/services/tauriApi.ts` — Add request-response correlation
     - `nexus-app/src/services/mockTauri.ts` — Reduce mock scope, pass-through when Tauri available
     - `nexus-app/src/components/tools/MemoryExplorer.tsx` — Remove DEMO_MEMORIES
     - `nexus-app/src/components/tools/SecurityCenter.tsx` — Remove DEMO_FINDINGS/ACTIVITY/TOOL_USAGE
     - `nexus-app/src/components/tools/SystemTerminal.tsx` — Wire to real shell
     - `nexus-app/src/components/tools/CodeEditor.tsx` — Remove hardcoded path
     - `nexus-app/src/components/tools/Scheduler.tsx` — Wire to cron service
     - `nexus-app/src/components/tools/AgentBuilder.tsx` — Wire to agent registry
     - `nexus-app/src/components/tools/ModuleManager.tsx` — Wire to plugin system
     - `nexus-app/src/components/agent/WarRoom.tsx` — Remove mock agents
     - `nexus-app/src/components/chat/ChatInterface.tsx` — Fix streaming
     - `nexus-app/src/components/layout/Dock.tsx` — Fix code app launch
     - `nexus-app/src/App.tsx` — Add health monitoring

     ### Tauri/Rust:
     - `nexus-app/src-tauri/src/orchestrator/process_manager.rs` — Add IPC timeout
     - `nexus-app/src-tauri/src/commands/ollama.rs` — Make model configurable

     ### ISO/Linux:
     - `linux/build-iso-docker.sh` — Add Tauri build step
     - `nexus-profile/packages.x86_64` — Add desktop environment + deps
     - `linux/build-iso.sh` — Pre-create venv, pre-pull model
     - `linux/systemd/nexus-core.service` — Fix paths


───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 Ready to code?
                                                                                                                                                                                                                                Here is Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Nexus AIOS - Complete End-to-End Analysis & Production Readiness Plan                                                                                                                                                         

 Context

 The Nexus/AETHER Hybrid AIOS is an AI-native operating system built with:
 - Frontend: React + Vite + Tailwind + Framer Motion (inside Tauri v2 desktop app)
 - Backend Bridge: Rust/Tauri (IPC to Python kernel via stdin/stdout JSON)
 - Kernel: Python (brain, memory, agents, tools, voice, security)
 - Distribution: Arch Linux bootable ISO via Docker + mkarchiso

 The user wants production-grade readiness with no mock/dummy data, full frontend-backend integration, and a working ISO build pipeline. This analysis identifies every gap between the current state and that goal.

 ---
 PART 1: COMPREHENSIVE FINDINGS

 CRITICAL ISSUE 1: Frontend Apps Show Mock/Dummy Data (Not Connected to Backend)

 Almost every frontend app falls back to hardcoded demo data instead of fetching from the real kernel:

 ┌─────────────────┬───────────────────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────┐
 │       App       │                     File                      │                                           Issue                                           │
 ├─────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
 │ Memory Explorer │ src/components/tools/MemoryExplorer.tsx:32-51 │ DEMO_MEMORIES array with 11 hardcoded entries displayed as fallback                       │
 ├─────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
 │ Security Center │ src/components/tools/SecurityCenter.tsx:34-62 │ DEMO_FINDINGS (7 items), DEMO_ACTIVITY (8 items), DEMO_TOOL_USAGE (6 items) all hardcoded │
 ├─────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
 │ War Room        │ src/components/agent/WarRoom.tsx              │ 4 mock agents (Manager, SecOps, DevArch, Analyst) with fake status                        │
 ├─────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
 │ Web Browser     │ src/components/tools/WebBrowser.tsx           │ Hardcoded bookmarks, no actual page navigation                                            │
 ├─────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
 │ System Terminal │ src/components/tools/SystemTerminal.tsx       │ Commands don't execute — UI-only shell                                                    │
 ├─────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
 │ Agent Builder   │ src/components/tools/AgentBuilder.tsx         │ Placeholder UI with no backend wiring                                                     │
 ├─────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
 │ Module Manager  │ src/components/tools/ModuleManager.tsx        │ Placeholder with empty/hardcoded data                                                     │
 ├─────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
 │ Scheduler       │ src/components/tools/Scheduler.tsx            │ Placeholder with no cron service connection                                               │
 ├─────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
 │ AETHER Chat     │ src/components/chat/ChatInterface.tsx         │ Falls back to mock response: "I'm running in browser demo mode..."                        │
 ├─────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
 │ Code Editor     │ src/components/tools/CodeEditor.tsx           │ Monaco editor works but AI assistant returns mock responses                               │
 ├─────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
 │ File Manager    │ src/components/tools/FileManager.tsx          │ Calls fsApi.readDir() but shows mock directory on failure                                 │
 └─────────────────┴───────────────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────┘

 Root Cause: src/services/mockTauri.ts (622 lines) — The mock layer returns fake responses when running outside Tauri context. The problem is:
 1. In browser dev mode, __TAURI_INTERNALS__ is not present, so ALL calls go through mocks
 2. Even inside Tauri, some commands dispatch but return empty immediately (async dispatch without waiting for response)
 3. Memory, security, and agent queries are fire-and-forget — frontend sends to kernel but doesn't listen for the actual data back

 CRITICAL ISSUE 2: Nexus Code App Doesn't Open

 File: src/services/codeServerService.ts (271 lines)

 Flow when user clicks "Nexus Code" in dock:
 1. launchNexusCode() → startServer() → tries invoke('execute_shell', 'code serve-web --host 127.0.0.1 --port 8767')
 2. If not in Tauri context → immediately fails → falls back to in-app Monaco editor in CodeEditor.tsx
 3. Even in Tauri: requires VS Code CLI (code) to be installed at system PATH
 4. 15-second timeout waiting for server → falls back to Monaco

 Why it appears "nothing opens": The fallback to Monaco should work, but the window may not be getting created. Need to verify handleAppClick('code') in Dock.tsx:178 properly dispatches window creation.

 CRITICAL ISSUE 3: Frontend ↔ Backend Integration Gaps

 Tauri Bridge Architecture (src-tauri/src/):
 - 25 Tauri commands registered (all real implementations, NOT stubs)
 - IPC: Rust spawns Python kernel, communicates via stdin/stdout JSON
 - Python kernel auto-starts 1 second after app launch

 The Disconnect:
 1. Async Response Pattern Broken: Rust sends messages to Python kernel and returns "Message dispatched" immediately. The actual response comes back via Tauri events (kernel:response), but many frontend components don't    
 properly listen for these events.
 2. Memory queries (query_memory, store_memory) dispatch to kernel but return empty — frontend doesn't subscribe to the response event
 3. Security audit (get_audit_log) same issue — dispatches but no event listener for results
 4. Agent tasks (execute_task) — no real-time step update streaming implemented

 CRITICAL ISSUE 4: Python Kernel Environment

 - No Python venv bundled: kernel/venv/ doesn't exist in the repo
 - python3 not found on this Windows machine (confirmed by agent)
 - Requirements are specified in kernel/requirements.lock.txt (60+ packages including lancedb, langchain, faster-whisper, piper-tts)
 - No sidecar bundling: Tauri doesn't package Python with the app
 - Expected paths: Windows kernel/venv/Scripts/python.exe, Linux kernel/.venv/bin/python

 CRITICAL ISSUE 5: ISO Build Pipeline Gaps

 What exists (mostly well-structured):
 - linux/build-iso-docker.sh — Docker-based build orchestrator
 - linux/build-iso.sh — Arch ISO build script (runs inside Docker)
 - nexus-profile/ — mkarchiso profile (packages.x86_64, pacman.conf, profiledef.sh, airootfs, grub, syslinux, efiboot)
 - linux/systemd/ — 4 service files (nexus-core, nexus-kernel, nexus-ollama, nexus-kernel.socket)
 - linux/packaging/arch/ — PKGBUILD, sysusers, tmpfiles, setup script
 - linux/dbus/org.nexus.Agent.xml — D-Bus interface definition

 Gaps:
 1. No nexus-core binary exists: nexus-core.service references /opt/nexus/bin/nexus-core but no Tauri build output is packaged into the ISO
 2. Missing Tauri Linux build step: No script compiles the Rust/Tauri app for Linux x86_64
 3. No desktop environment specified: The ISO packages list doesn't include a window manager or Wayland compositor for the Tauri app to run in
 4. Python venv not created during ISO build: The setup-kernel.sh script should create the venv but it runs on first boot, requiring internet
 5. No Ollama model pre-pull: Users would need internet on first boot to pull llama3.2
 6. nexus-profile/packages.x86_64 may be missing critical dependencies (gtk, webkit, etc. for Tauri)

 MODERATE ISSUES

 ┌─────┬─────────────────────────────────────────────┬───────────────────────────────────────────────┬────────────────────────────────────────────────┐
 │  #  │                    Issue                    │                   Location                    │                     Impact                     │
 ├─────┼─────────────────────────────────────────────┼───────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ 6   │ LLM model hardcoded to llama3.2:3b          │ src-tauri/src/commands/ollama.rs              │ Can't change model without recompile           │
 ├─────┼─────────────────────────────────────────────┼───────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ 7   │ No timeout on kernel IPC                    │ src-tauri/src/orchestrator/process_manager.rs │ Long operations can hang forever               │
 ├─────┼─────────────────────────────────────────────┼───────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ 8   │ Audit log auto-cleanup removes entries >1hr │ src-tauri/src/security/audit_log.rs           │ Production needs longer retention              │
 ├─────┼─────────────────────────────────────────────┼───────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ 9   │ Hardcoded default path in CodeEditor        │ src/components/tools/CodeEditor.tsx           │ C:/Users/davin/Downloads/nexus-ag/             │
 ├─────┼─────────────────────────────────────────────┼───────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ 10  │ 63MB ONNX voice model in repo               │ kernel/en_US-lessac-medium.onnx               │ Should use Git LFS or download on demand       │
 ├─────┼─────────────────────────────────────────────┼───────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ 11  │ main.py is 2587 lines                       │ kernel/main.py                                │ Fragile monolith, but functional               │
 ├─────┼─────────────────────────────────────────────┼───────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ 12  │ No health check endpoint                    │ Tauri ↔ Kernel                                │ No periodic heartbeat to detect kernel crashes │
 └─────┴─────────────────────────────────────────────┴───────────────────────────────────────────────┴────────────────────────────────────────────────┘

 ---
 PART 2: FIX PLAN (Priority Order)

 Phase A: Remove All Mock/Dummy Data — Wire Real Backend (HIGH PRIORITY)

 A1. Fix async response pattern in Tauri bridge
 - Files: src/services/tauriApi.ts, src/services/mockTauri.ts
 - Change: For commands that dispatch async (memory, security, agents), add proper event listeners that resolve a Promise when kernel:response arrives with matching request ID
 - Pattern: invoke('query_memory', {...}) should return a Promise that resolves when kernel:response event with matching id arrives

 A2. Remove DEMO_MEMORIES from Memory Explorer
 - File: src/components/tools/MemoryExplorer.tsx
 - Remove lines 32-51 (DEMO_MEMORIES array)
 - Wire memoryApi.query() to actually wait for kernel response
 - Show loading spinner while waiting, "No memories yet" if empty

 A3. Remove DEMO_FINDINGS/DEMO_ACTIVITY/DEMO_TOOL_USAGE from Security Center
 - File: src/components/tools/SecurityCenter.tsx
 - Remove lines 34-62 (all demo arrays)
 - Wire safetyApi.getAuditLog() to real kernel response
 - Show real audit data or "No audit entries" if empty

 A4. Wire System Terminal to real shell execution
 - File: src/components/tools/SystemTerminal.tsx
 - Use invoke('execute_shell', { command }) for real command execution
 - Stream output back to terminal UI

 A5. Wire War Room to real agent status
 - File: src/components/agent/WarRoom.tsx
 - Remove 4 mock agents
 - Subscribe to kernel:response events for agent status updates

 A6. Wire Scheduler to real cron service
 - File: src/components/tools/Scheduler.tsx
 - Connect to kernel's cron_service.py via Tauri commands

 A7. Wire Agent Builder to kernel's agent registry
 - File: src/components/tools/AgentBuilder.tsx
 - Use invoke('execute_task', {...}) for agent creation
 - Display real registered agents

 A8. Wire Module Manager to plugin system
 - File: src/components/tools/ModuleManager.tsx
 - Connect to kernel's plugin_system.py

 Phase B: Fix Nexus Code App (HIGH PRIORITY)

 B1. Fix window creation on dock click
 - File: src/components/layout/Dock.tsx:178
 - Ensure handleAppClick('code') properly creates the CodeEditor window
 - Remove dependency on VS Code Server — always use in-app Monaco editor as primary
 - VS Code Server should be an optional enhancement, not required

 B2. Remove hardcoded path
 - File: src/components/tools/CodeEditor.tsx
 - Replace C:/Users/davin/Downloads/nexus-ag/nexus-app with dynamic home directory detection

 Phase C: Strengthen Frontend ↔ Backend Bridge (HIGH PRIORITY)

 C1. Implement request-response correlation
 - File: src/services/tauriApi.ts
 - Every invoke() that dispatches to kernel should include a UUID
 - Set up event listener for kernel:response with matching UUID
 - Return a Promise that resolves with the kernel's actual response
 - Add 30-second timeout with proper error handling

 C2. Add kernel health monitoring
 - File: src/services/tauriApi.ts + src/App.tsx
 - Periodic invoke('get_kernel_status') every 5 seconds
 - Display kernel status in StatusBar (running/stopped/error)
 - Auto-restart kernel if crashed

 C3. Fix Chat to use real streaming
 - File: src/components/chat/ChatInterface.tsx
 - When running inside Tauri, use real kernel:response and kernel:chunk events
 - Remove the "browser demo mode" message fallback

 Phase D: ISO Build Pipeline Completion (MEDIUM PRIORITY)

 D1. Add Tauri Linux build to ISO pipeline
 - File: linux/build-iso-docker.sh
 - Add step to compile Tauri app for Linux x86_64 inside Docker
 - Copy resulting binary to ISO's /opt/nexus/bin/nexus-core

 D2. Add desktop environment to ISO
 - File: nexus-profile/packages.x86_64
 - Add minimal window manager (sway/hyprland for Wayland, or openbox for X11)
 - Add required Tauri dependencies (webkit2gtk, gtk3, etc.)
 - Add auto-login and auto-start for nexus-core

 D3. Pre-create Python venv in ISO
 - File: linux/build-iso.sh
 - Build Python venv with all requirements during ISO creation (not first boot)
 - Bundle at /opt/nexus/.venv/

 D4. Optional: Pre-pull Ollama model
 - File: linux/build-iso.sh
 - Pull llama3.2:3b during ISO creation for offline-first experience
 - Store in /var/lib/nexus/models/

 D5. Fix service file paths
 - File: linux/systemd/nexus-core.service
 - Ensure ExecStart points to actual built binary
 - Add After=nexus-kernel.service dependency

 Phase E: Production Hardening (LOW PRIORITY)

 E1. Add kernel IPC timeout — 30s default in process_manager.rs
 E2. Make LLM model configurable — Runtime config instead of hardcoded
 E3. Extend audit log retention — 30 days instead of 1 hour
 E4. Add Git LFS for ONNX model — Remove 63MB binary from repo
 E5. Add error boundaries — React error boundaries around each window component

 ---
 PART 3: VERIFICATION PLAN

 After Phase A-C (Frontend-Backend Integration):

 1. Run npm run tauri dev from nexus-app/
 2. Verify kernel auto-starts (check console for "Auto-starting Nexus Kernel")
 3. Open AETHER Chat → Send message → Verify real LLM response (not mock)
 4. Open Memory Explorer → Verify no demo data, shows real memories or empty state
 5. Open Security Center → Verify no demo findings, shows real audit or empty state
 6. Open System Terminal → Type ls → Verify real output
 7. Open Nexus Code → Verify Monaco editor opens with file tree
 8. Open War Room → Verify shows real agent status or empty state

 After Phase D (ISO Build):

 1. Run ./linux/build-iso-docker.sh in Docker
 2. Boot resulting ISO in QEMU/VirtualBox
 3. Verify nexus-core service starts
 4. Verify kernel service starts
 5. Verify Ollama service starts
 6. Open terminal → nexus-cli → Send query → Get LLM response
 7. Launch desktop → Verify full UI loads

 ---
 FILES TO MODIFY (Summary)

 Frontend (React/TypeScript):

 - nexus-app/src/services/tauriApi.ts — Add request-response correlation
 - nexus-app/src/services/mockTauri.ts — Reduce mock scope, pass-through when Tauri available
 - nexus-app/src/components/tools/MemoryExplorer.tsx — Remove DEMO_MEMORIES
 - nexus-app/src/components/tools/SecurityCenter.tsx — Remove DEMO_FINDINGS/ACTIVITY/TOOL_USAGE
 - nexus-app/src/components/tools/SystemTerminal.tsx — Wire to real shell
 - nexus-app/src/components/tools/CodeEditor.tsx — Remove hardcoded path
 - nexus-app/src/components/tools/Scheduler.tsx — Wire to cron service
 - nexus-app/src/components/tools/AgentBuilder.tsx — Wire to agent registry
 - nexus-app/src/components/tools/ModuleManager.tsx — Wire to plugin system
 - nexus-app/src/components/agent/WarRoom.tsx — Remove mock agents
 - nexus-app/src/components/chat/ChatInterface.tsx — Fix streaming
 - nexus-app/src/components/layout/Dock.tsx — Fix code app launch
 - nexus-app/src/App.tsx — Add health monitoring

 Tauri/Rust:

 - nexus-app/src-tauri/src/orchestrator/process_manager.rs — Add IPC timeout
 - nexus-app/src-tauri/src/commands/ollama.rs — Make model configurable

 ISO/Linux:

 - linux/build-iso-docker.sh — Add Tauri build step
 - nexus-profile/packages.x86_64 — Add desktop environment + deps
 - linux/build-iso.sh — Pre-create venv, pre-pull model
 - linux/systemd/nexus-core.service — Fix paths