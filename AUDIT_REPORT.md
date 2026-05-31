# Nexus Hybrid AIOS — Full Repository Audit & Reverse-Engineering Report

> **Audit date:** 2026-06-01
> **Repository:** `mhmalvi/Nexus-AIOS` — branch `feature/agent-builder-persistence-v2`
> **Project root analyzed:** `nexus-app/`
> **Auditor role:** Architecture / Security / Performance / Quality / Product
> **Audience:** Engineering leadership, new engineers, security reviewers, and non-technical stakeholders

---

## 0. How to read this document

This report is organized into 12 phases, mirroring the requested scope. If you only read three things:

1. **§12 Executive Summary** — the business-level picture and the Top-20 priorities.
2. **§5 Security Audit** — the issues that should block any public/production release.
3. **§1 Repository Map** — to navigate the code.

A note on method and honesty (see §13 for full coverage statement): this is a **single-pass deep audit**. Every directory and every subsystem was inventoried and the architecturally and security-critical files were read in full (kernel `main.py`, the Rust command/orchestrator/security layers, the frontend service bridge, config and capability files, installers). The long tail of 51 React components and ~70 Python modules was sampled and cross-referenced via repository-wide search rather than read line-by-line. Findings are labeled by confidence where it matters. I have **not** invented per-file detail for files I did not open.

---

# Phase 1 — Repository Mapping

## 1.1 Top-level layout

The Git repository root (`nexus-ag/`) contains a thin wrapper; the **entire application lives in `nexus-app/`**.

```
nexus-ag/
├─ README.md                  # Marketing/architecture overview (ISO + dev setup)
├─ LICENSE                    # MIT in this branch (main branch later switched to proprietary)
├─ build-internal.sh          # ISO overlay build helper (copies kernel into airootfs)
└─ nexus-app/                 # ← THE PROJECT
   ├─ src/                    # React 19 + TypeScript frontend (Tauri webview)
   ├─ src-tauri/              # Rust (Tauri v2) desktop shell / orchestrator
   ├─ kernel/                 # Python AI "reasoning kernel" (sidecar process)
   ├─ linux/                  # Arch ISO build pipeline, systemd, D-Bus, Packer
   ├─ wsl/                    # WSL2 distro bridge (Windows → Linux stack)
   ├─ installer/windows/      # WiX MSI config
   ├─ scripts/                # Windows service install (PowerShell)
   ├─ docs/                   # Internal architecture audit
   ├─ knowledgebase/          # 14 planning / design / status markdown docs
   ├─ tests/                  # Playwright e2e (1 spec)
   ├─ public/, icons          # Static assets
   └─ test_*.py               # 8 root-level "phase" verification scripts
```

**Scale (tracked code, via `wc -l`):**

| Layer | Language | LOC | Files (approx) |
|---|---|---|---|
| Reasoning kernel | Python | **~23,230** | ~80 modules |
| Frontend | TypeScript / TSX | **~18,542** | 51 components + services |
| Desktop shell / orchestrator | Rust | **~2,861** | 21 `.rs` files |
| Infra / build | Bash / PS1 / JSON | ~2,000 | ~20 |
| **Total tracked files** | | | **306** |

The codebase is **Python-dominant** (the kernel is the real product); Rust is a thin process-supervisor/IPC shell; the frontend is large and feature-rich.

## 1.2 Directory purposes

### `nexus-app/kernel/` (Python — the brain)
| Path | Purpose |
|---|---|
| `main.py` | **2,856-line** entry point. Class `AetherKernel`: initializes ~20 subsystems, runs a stdin/stdout JSON message loop, dispatches ~40 message types. |
| `brain/` | LLM integration. `llm_engine.py` (Ollama), `cloud_engine.py` (7 cloud providers), `model_router.py`, `planner.py`, `intent_parser.py`, `intent_dispatcher.py`, `compaction.py`, `query_cache.py`. |
| `memory/` | 4-tier memory. `lancedb_store.py`, `memory_manager.py`, `rag_engine.py`, `document_indexer.py`, `deep_memory.py` (knowledge graph), `qmd_manager.py`, `context_scheduler.py`, `self_learning.py`. |
| `agents/` | Multi-agent system: `worker_agent.py`, `manager_agent.py`, specialized `security_auditor`, `code_architect`, `researcher`, `qa_engineer`, `monitor_agent`, `agent_persistence.py`, `crewai_adapter.py`, `subagent_registry.py`. |
| `toolbox/` | Action execution: `shell_executor.py`, `file_manager.py`, `web_automation.py`, `browser_engine.py` (Playwright), `cdp_browser_engine.py` (fallback), `media_pipeline.py`, `notification_tools.py`, `mcp_client_manager.py`. |
| `supervisor/` | Safety layer: `safety_checker.py` (blacklist), `intent_validator.py`, `ast_audit.py`, `tool_policy.py`, `audit_logger.py`, `error_kb.py`, plus **duplicate** `self_destruct.py` / `network_firewall.py`. |
| `security/` | `key_vault.py` (Fernet), `network_firewall.py`, `self_destruct.py`, `intent_dispatcher.py` — **overlaps with `supervisor/`**. |
| `voice/` | `voice_pipeline.py`, `tts_engine.py` (Piper), `wake_word_detector.py` (OpenWakeWord), `orchestrator.py`. |
| `hardware/` | `system_stats.py`, `npu_accelerator.py`, `federated_learner.py`, `ebpf_monitor.py`. |
| `skills/` | `loader.py` (SKILL.md convention), `docker_sandbox.py`, `clawhub_adapter.py`, `semantic_snapshot.py`. |
| `bridge/` | `openclaw_client.py`, `channel_router.py` — external messaging (WhatsApp/Discord/Telegram via "OpenClaw" gateway). |
| `linux/` | `daemon.py`, `dbus_service.py`, `nexus_orchestrator.py` — native Linux service mode (REST API on :9600). |
| `sync/` | `a2a_protocol.py`, `memory_sync.py` — cross-device (stubbed). |
| `cron_service.py`, `plugin_system.py`, `mcp_server.py`, `auto_reply.py`, `health_monitor.py`, `ipc_bridge.py`, `runtime_config.py` | Standalone services. |
| `tests/` | 5 pytest modules (agents, brain, memory, supervisor, toolbox) + conftest. |

### `nexus-app/src-tauri/` (Rust — the shell)
| Path | Purpose |
|---|---|
| `src/main.rs` / `lib.rs` | Tauri bootstrap; registers 25 `invoke` commands; auto-starts kernel; registers `Alt+Space` global shortcut. |
| `commands/` | IPC command handlers: `kernel.rs`, `memory.rs`, `agent.rs`, `safety.rs`, `ollama.rs`, `shell.rs`, `system.rs`, `startup.rs`. |
| `orchestrator/` | `process_manager.rs` (spawns/monitors Python kernel), `ipc_bridge.rs`, `scheduler.rs`, `state.rs`. |
| `security/` | `state.rs` (risk assessment, approval store), `capability_manager.rs`, `audit_log.rs`. |
| `service/mod.rs` | Windows service integration. |
| `capabilities/default.json` | **Tauri permission grants (critical — see §5).** |
| `data/lancedb/` | **Committed test database** (transaction/manifest/`.lance` files). |
| `check_output*.txt`, `check_final.txt` | Committed build-log artifacts (debt). |

### `nexus-app/src/` (React frontend)
- `App.tsx`, `main.tsx`, `index.css`, `types.ts`
- `components/` (51 files) across `agent/`, `chat/`, `command/`, `layout/`, `settings/`, `setup/`, `system/`, `tools/`, `ui/`, `voice/`
- `context/StoreContext.tsx` — global reducer store
- `services/` — `tauriApi.ts` (1,272-line API facade), `kernelEventBridge.ts` (request/response correlation), `mockTauri.ts`, `aiService.ts`, `codeServerService.ts`, `WindowBounds.ts`
- `hooks/useSound.ts`

## 1.3 Dependencies & frameworks

**Frontend (`package.json`):** React 19, Vite 7, TypeScript 5.8, Tauri API v2 (+ plugins: shell, fs, dialog, notification, process, opener, global-shortcut), Tailwind 3.4 + animate, framer-motion 12, lucide-react, cmdk, react-markdown, monaco-editor, `@google/genai`.

**Rust (`Cargo.toml`):** Tauri 2 + the matching plugins, serde, tokio (implied), tracing, uuid, chrono, regex.

**Python (`requirements.txt` / `.lock`):** langchain + langchain-ollama, lancedb, aiohttp, beautifulsoup4, psutil, pydantic, numpy, cryptography (Fernet); optional: faster-whisper, openwakeword, piper-tts, sounddevice, playwright, torch/openvino (NPU).

**External runtime deps:** Ollama (local LLM), optionally Docker (sandbox), and the "OpenClaw" gateway (`ws://localhost:8080`).

---

# Phase 2 — Application Understanding

## 2.1 Product overview (plain language)

**What it is:** Nexus (internally also "Aether") is a **desktop AI operating-system shell**. It looks and behaves like a futuristic "cyber" OS — a window manager with a command palette, file manager, terminal, code editor, web browser, chat, voice assistant, and an agent-orchestration canvas — but every surface is wired to an autonomous AI agent that can perceive and *act on* the host machine (run shell commands, read/write files, drive a browser, send messages).

**The two delivery modes:**
1. **Desktop app** (Tauri) you install on existing Windows/Linux/macOS.
2. **A bootable Arch Linux ISO** ("AIOS") where Nexus *is* the environment, with systemd services and a D-Bus interface.

**Problem it claims to solve:** Today AI is "an app inside the OS." Nexus inverts that — the AI is a first-class, local-first system layer that can operate the computer on the user's behalf, privately, via local models (Ollama).

**Intended users:** Power users, developers, and AI enthusiasts who want an autonomous local agent with deep OS access. Not (yet) enterprise/multi-tenant.

**Business model:** Not encoded in the repo. The branch under audit is MIT-licensed; the GitHub `main` branch later switched to a **proprietary license** ("Update to proprietary license", Mar 2026), implying a planned commercial/source-available product. No billing, telemetry, licensing-enforcement, or account system exists in code.

**Value proposition:** "Local-first autonomous AI OS" — privacy (local inference), ambient voice, agentic automation, and a striking UI.

> ⚠️ **Positioning vs. reality gap.** The README states *"No Cloud Dependency: All inference runs locally via Ollama."* The kernel ships `brain/cloud_engine.py` supporting **OpenAI, Anthropic, Groq, Cerebras, Mistral, Gemini, OpenRouter**, an `api_keys` config block, and a `@google/genai` frontend dependency. The default `ai_provider` is `"auto"` (try cloud first if keys exist). The product is **hybrid local/cloud**, not local-only. Marketing copy should be corrected.

## 2.2 Core workflows

1. **Chat / query:** User types (or speaks) → frontend `aiService` → Rust `send_to_kernel` → Python `_handle_query` → model routing → RAG context retrieval (LanceDB) → LLM stream → tiered-memory store → response.
2. **Autonomous task:** `_handle_task` → `ManagerAgent` decomposes & delegates to Worker/specialized agents → tool calls → optional Human-in-the-Loop (HIL) approval → result.
3. **HIL approval:** A system-modifying action emits `hil:approval_required` → React modal → user approves → Rust `resolve_approval` → kernel `approval_decision` → execution + self-learning log.
4. **Voice:** Wake word ("Aether"/"Hey Nexus") → Faster-Whisper STT → query pipeline → Piper TTS ("sonic loop").
5. **Messaging bridge:** Inbound WhatsApp/Discord/Telegram message via OpenClaw → treated as a query → AI reply sent back.
6. **Scheduling:** Cron service runs prompts/tools on a schedule.

---

# Phase 3 — Code-Level Analysis (key modules)

### `kernel/main.py` — `AetherKernel` (★ central)
- **Purpose:** Orchestrates every subsystem and is the IPC server.
- **Inputs:** Line-delimited JSON on **stdin** (`{id, message_type, payload}`).
- **Outputs:** Line-delimited JSON on **stdout** (responses + `event` + `kernel_status` frames); human logs on **stderr**.
- **Dependencies:** Brain, MemoryManager, Toolbox, Supervisor, all agents, ~15 optional subsystems guarded by `try/except ImportError`.
- **Risks:** (1) **God object** — ~40 `_handle_*` methods, ~40% of kernel logic in one file. (2) **Sequential loop** — `run()` awaits `process_message` before reading the next stdin line, so a long task **blocks all other messages** (see §7). (3) **`logger.error` is called in `_handle_browser` (line ~1349) but `logger` is never imported/defined** → `NameError` masks the real browser error. (4) Comments reference stale line numbers ("defined above lines ~958") indicating heavy copy/paste churn. (5) System prompt hard-codes *"User context: Administrator access granted"* and instructs the LLM it "HAS permission to manage files."
- **Maintainability:** Low for the dispatcher; medium for the delegated handlers.
- **Improvements:** Split dispatch into a registry/handler-class map; introduce a real `logging` logger; process messages concurrently with a task pool + per-request ordering; extract the system prompt to a versioned template.

### `kernel/supervisor/safety_checker.py`
- **Purpose:** Regex blacklist + keyword risk scoring with anti-obfuscation (base64/hex/url/concat decoding, whitespace normalization).
- **Risk:** **Deny-list is fundamentally bypassable** (the listed patterns are a tiny sample of dangerous commands; e.g. `rm -rf /home/user`, `shutdown` variants, PowerShell `Remove-Item`, `Invoke-Expression`, python `os.system` are not covered). Unknown actions **default to risk "medium"** and are *not* blocked. This is a speed-bump, not a security boundary.
- **Improvement:** Move to an allow-list of vetted tool invocations with typed parameters; treat the blacklist as defense-in-depth only.

### `kernel/security/key_vault.py` + `runtime_config.py`
- **Purpose:** Fernet-encrypt API keys at rest in `~/.aether/config.json`; key in `~/.aether/.vault_key`.
- **Strength:** Atomic writes, `0600`/`0700` perms on Unix, graceful fallback.
- **Risks:** (1) On **Windows the chmod is skipped entirely** (`if os.name != 'nt'`), and the **decryption key sits next to the ciphertext** — anyone with read access to the user profile gets both. This is obfuscation, not meaningful protection, on the primary target platform. (2) Keys travel **plaintext over IPC** (`update_config` payload) and are echoed back in the `config_updated` response (`data: {config: self.config}`), so they pass through the Rust process and any frontend listener in clear text. 
- **Improvement:** Use OS keychains (Windows DPAPI / Credential Manager, macOS Keychain, libsecret); never return secrets in responses; redact in logs.

### Rust `commands/shell.rs::execute_shell` (★ critical)
- **Purpose:** Run an arbitrary shell string (`cmd /C` on Windows, `sh -c` elsewhere), optional `cwd`, optional detached.
- **Inputs:** `command: String` straight from the frontend (`kernelApi.executeShell`, used by `SystemTerminal.tsx` and `codeServerService.ts`).
- **Risk:** **Arbitrary command execution with the user's full privileges, with zero validation** and **completely bypassing the Python supervisor and the HIL approval flow.** Combined with the permissive CSP (`unsafe-inline`/`unsafe-eval`), any XSS in the webview becomes full host RCE. See §5-F1.

### Rust `orchestrator/process_manager.rs`
- **Purpose:** Spawn/stop the Python kernel, pipe stdio, (intend to) auto-recover crashes.
- **Risks:** (1) `start_with_recovery()` exists but **`lib.rs` calls `start_kernel()` directly** — crash recovery is **never engaged**. (2) Even if engaged, `monitor_for_crash` only `emit`s `kernel:request_restart`, and **no frontend/back-end handler listens for it** (confirmed by search) — so it's **dead code**; the kernel does not actually auto-restart. (3) Hard-codes `--enable-voice` on every spawn regardless of config.
- **Improvement:** Wire recovery, add a real supervised restart with backoff in Rust, gate `--enable-voice` on config.

### Rust `commands/safety.rs` + `security/state.rs`
- **Purpose:** Blacklist check, keyword risk assessment, approval request/resolve with anti-spoofing (validates `request_id` exists and is `Pending`, rejects double-resolve), TTL expiry.
- **Strength:** The **approval-resolution path is the best-engineered security code in the repo** — explicit spoofing/duplicate guards, audit logging, TTL cleanup.
- **Risk:** `validate_action`/`assess_risk` are **advisory** — nothing forces `execute_shell` or the chat path through them. The keyword matcher is naive (`contains("delete")` etc.) → high false-positive/negative rate.

### Frontend `services/tauriApi.ts` + `kernelEventBridge.ts`
- **Purpose:** Typed facade over Tauri `invoke`; `kernelEventBridge` rebuilds request/response semantics over fire-and-forget IPC by correlating `request_id`, with a `message_type` fallback (only when exactly one candidate is pending) and per-op timeouts.
- **Strengths:** Thoughtful timeout map, browser-mode mocks for UI dev without Tauri, graceful degradation (timeouts resolve to `{timed_out:true}` rather than throwing).
- **Risks:** (1) **Two parallel IPC paths** — chat uses `aiService`→`mockTauri` (an *event*-based bridge despite the "mock" name), everything else uses `kernelEventBridge`. Confusing and duplicative. (2) The `message_type` fallback can resolve the **wrong** promise if two same-type requests overlap and IDs aren't returned. (3) Streaming `chunk` events aren't surfaced through `sendAndWait` (it resolves on the first ID match), so true token streaming only works on the `mockTauri` path.

### `kernel/agents/` (Worker/Manager + specialists)
- **Purpose:** Decompose tasks, run tools, self-correct, with specialized roles. CrewAI adapter present.
- **Risk:** Real autonomy + the unguarded `execute_shell` and broad FS capabilities mean an agent (or a prompt-injected one) can take destructive host actions. Prompt-injection surface is large (web automation, inbound messages, indexed documents all feed the LLM).

---

# Phase 4 — Architecture Analysis

## 4.1 The hybrid 3-process model

```
┌─────────────────────────────────────────────────────────────────┐
│                      TAURI DESKTOP APP                            │
│                                                                   │
│   ┌──────────────────────┐         ┌──────────────────────────┐  │
│   │  React 19 Frontend   │  invoke │   Rust Shell (Tauri v2)   │  │
│   │  (webview)           │ ───────▶│   - 25 commands          │  │
│   │  - 51 components     │ ◀───────│   - ProcessManager       │  │
│   │  - StoreContext      │  events │   - SecurityState        │  │
│   │  - tauriApi facade   │         │   - Alt+Space shortcut   │  │
│   └──────────────────────┘         └────────────┬─────────────┘  │
│                                                  │ stdin/stdout    │
│                                                  │ (JSON lines)    │
│                                     ┌────────────▼─────────────┐  │
│                                     │  Python Kernel (sidecar) │  │
│                                     │  AetherKernel            │  │
│                                     │  Brain│Memory│Agents│    │  │
│                                     │  Toolbox│Supervisor│Voice│  │
│                                     └──────┬───────────┬───────┘  │
└────────────────────────────────────────────┼───────────┼─────────┘
                                              │           │
                                     ┌────────▼───┐  ┌────▼─────────┐
                                     │  Ollama    │  │  LanceDB     │
                                     │ :11434     │  │  (file vec)  │
                                     └────────────┘  └──────────────┘
```

**Two orchestrators exist:** the **Rust `ProcessManager`** (desktop mode) and a **Python `linux/nexus_orchestrator.py`** (native Linux service, REST on :9600). They are alternate front-ends to the same kernel.

## 4.2 Frontend architecture
- **Framework:** React 19 + Vite 7, TypeScript. No router (single-window "OS" with internal window manager: `WindowFrame`, `Dock`, `MainLayout`).
- **State:** A single `StoreContext` reducer (Context API) — no Redux/Zustand. Workable at this size but the store is large and central.
- **UI system:** Tailwind + framer-motion + a small `ui/` primitive set (`Button`, `Card`, `Input`, `ContextMenu`). Distinct "Dark Cyber" aesthetic. Command palette via `cmdk`.
- **Reusability:** Mixed — good primitives, but **two `ErrorBoundary` implementations** (`system/` and `ui/`) and several large tool components with duplicated kernel-call boilerplate.

## 4.3 Backend (Rust) architecture
- Thin, correct, idiomatic Tauri v2. Mutex-guarded `ProcessManager`/`SecurityState`. Threads for stdout/stderr readers. The Rust layer holds **no business logic** beyond process supervision, IPC framing, and the advisory security store.

## 4.4 "Database" architecture
- **No relational DB.** Persistence is file-based:
  - **LanceDB** vector store (tiered memory) — embeddings via Ollama `nomic-embed-text`.
  - **`~/.aether/config.json`** (runtime config + encrypted keys).
  - **`deep_memory.json`** (Tier-4 knowledge graph).
  - **SQLite** referenced for sessions (`sessions.db`) in config defaults.
  - **QMD** markdown knowledge files.
- **Schema/relationships:** Memory tiers (Working / Short-term / Long-term / Deep graph) with H-MEM tags (`domain`, `category`, `abstraction_level`). No constraints/indexes beyond LanceDB's vector index + RRF hybrid search.
- **Risk:** A LanceDB **test database is committed** to the repo (`src-tauri/data/lancedb/short_term_memory.lance/...`) — should be git-ignored.

## 4.5 Infrastructure
- **Packaging:** Tauri bundler (MSI/NSIS/AppImage/dmg "all"); WiX config; Windows service installer; PyInstaller spec (`nexus_kernel.spec`) + `build.py`.
- **ISO pipeline:** `linux/build-iso*.sh` (Docker + `mkarchiso`), Packer template, `install.sh`/`uninstall.sh`, systemd unit, D-Bus policy.
- **WSL:** `wsl/create-distro.ps1` + `nexus-bridge.py`.
- **CI/CD:** **None present** (no `.github/workflows`, no GitLab CI). All builds are manual scripts.
- **Queues/caching:** In-process only — `QueryCache` (LRU+TTL) in the kernel; no external queue/broker.

---

# Phase 5 — Security Audit

> **Overall security posture: HIGH RISK / not production-ready for untrusted input or public distribution.** The product's *entire premise* — an AI with OS-level control — concentrates risk, and several controls are advisory, bypassable, or non-functional. The good news: the building blocks (HIL flow, audit log, key vault, approval anti-spoofing) exist and are partly well-built; they are just not consistently enforced.

| ID | Finding | Severity | Files |
|----|---------|----------|-------|
| F1 | Unrestricted `execute_shell` exposed to frontend, bypasses all safety | **Critical** | `src-tauri/src/commands/shell.rs`, `src/services/tauriApi.ts:367`, `src/components/tools/SystemTerminal.tsx:269` |
| F2 | Tauri capabilities grant FS read/write/remove/rename on `**` + shell execute/spawn/kill | **Critical** | `src-tauri/capabilities/default.json` |
| F3 | Permissive CSP (`unsafe-inline` + `unsafe-eval`) → XSS escalates to host RCE | **High** | `src-tauri/tauri.conf.json` |
| F4 | Safety supervisor is an advisory, bypassable deny-list; unknown actions default to allowed | **High** | `kernel/supervisor/safety_checker.py`, `src-tauri/src/security/state.rs` |
| F5 | Installer sets hardcoded password `nexus:nexus` and adds user to `wheel` (sudo) | **High** | `linux/install.sh:78`, `:76` |
| F6 | API keys: no protection on Windows; key stored beside ciphertext; secrets echoed over IPC & in `config_updated` response | **High** | `kernel/security/key_vault.py`, `kernel/runtime_config.py`, `kernel/main.py` (`_handle_update_config`) |
| F7 | Prompt-injection → tool execution: web/messaging/document content feeds the LLM which can call tools; system prompt grants "Administrator access" | **High** | `kernel/main.py` (`_get_system_prompt`, `_process_channel_message`), `kernel/agents/*` |
| F8 | Self-hosted "self-destruct"/data-wipe engine reachable from UI with weak auth (PIN only, voice "verified" if any string passed) | **Medium** | `kernel/security/self_destruct.py`, `kernel/main.py:1108` |
| F9 | OpenClaw messaging auto-replies to inbound external messages via LLM (untrusted remote input → agent) | **Medium** | `kernel/main.py` (`_handle_openclaw_message`) |
| F10 | Dependency / supply-chain: no lockfile audit, `curl \| sh` Ollama install, no SBOM, broad pinned-but-unaudited Python deps | **Medium** | `linux/install.sh:127`, `requirements*.txt` |
| F11 | Crash-recovery dead code can give false resilience assurance | **Low/Med** | `src-tauri/src/orchestrator/process_manager.rs` |
| F12 | Committed artifacts may leak local paths/state (LanceDB test data, `check_output*.txt`, docs with `c:\Users\davin\...`) | **Low** | `src-tauri/data/`, `src-tauri/check_*.txt`, `docs/architecture_audit_updated.md` |

### F1 — Unrestricted shell execution (Critical)
`execute_shell` runs any string via `cmd /C` / `sh -c` with the user's privileges. It is invoked from the in-app terminal and the code-server service. It does **not** pass through `validate_action`, the Python supervisor, or HIL. **Fix:** route all shell through the kernel supervisor + HIL; replace free-form shell with an allow-listed command set; if a raw terminal is a product requirement, isolate it (separate capability, explicit per-session user consent, no agent access to that command).

### F2 — Over-broad Tauri capabilities (Critical)
`capabilities/default.json` grants `fs:allow-{read,write,remove,rename,mkdir,read-dir}` on `{"path":"**"}` (the **entire filesystem**) plus `shell:allow-execute/spawn/stdin-write/kill`. The webview can read/delete any user file. **Fix:** scope FS to the workspace/data dirs; remove `shell:allow-execute`/`spawn` from the default window capability and gate behind a dedicated, user-approved capability.

### F3 — CSP allows `unsafe-eval`/`unsafe-inline` (High)
With F1/F2, a single XSS (e.g. via rendered Markdown, browser-automation content, or a messaging payload reflected into the UI) becomes arbitrary host code execution. **Fix:** remove `unsafe-eval`; eliminate inline scripts; use nonces/hashes; sanitize all LLM/remote-sourced HTML/Markdown.

### F4 — Advisory, bypassable safety (High)
The deny-list covers ~25 patterns; the risk scorer defaults unknown actions to "medium" and **does not block** them. Nothing enforces validation on the primary execution paths. **Fix:** invert to allow-list; make the supervisor a hard gate in the kernel before any `toolbox.execute`; keep the blacklist as secondary defense.

### F5 — Insecure installer defaults (High)
`install.sh` creates the `nexus` user with password `nexus`, adds it to `wheel`, and prints credentials. A live ISO shipping these defaults is trivially compromised. **Fix:** force first-boot password set; don't grant sudo to the service account; run the kernel under `NoNewPrivileges` (the systemd unit already sets several hardening flags — extend that posture).

### F6 — Secret handling (High)
Fernet-at-rest is defeated on Windows (no ACLs, key beside data) and secrets are returned in the `config_updated` response and pass plaintext over IPC. **Fix:** OS keychain integration; never echo secrets; redact in logs and responses.

### F7 — Prompt injection → action (High)
Inbound messages, scraped web pages, and indexed documents are fed to an LLM that is told it has administrator rights and may run tools. A malicious page/message can attempt to coerce tool calls. **Fix:** strict separation of "data" vs "instructions"; require HIL for *all* state-changing tool calls regardless of `auto_approve`; constrain `auto_approve` to a vetted allow-list.

(F8–F12 fixes are summarized in the table and §12 Top-20.)

---

# Phase 6 — Performance Audit

| Area | Finding | Impact | Recommendation |
|---|---|---|---|
| **IPC concurrency** | Kernel `run()` loop processes messages **sequentially** (awaits each `process_message` before next stdin read). A 5-min `task` or 5-min `index_directory` **blocks chat, status, everything**. | High (UX freezes) | Dispatch each message to an `asyncio.create_task`; keep an ordered response writer. |
| **Model thrash** | `_handle_query` calls `route_intent` then `brain.change_model()` **per request** when the routed model differs — forces Ollama to load/unload models, adding seconds. | High (latency) | Pin a primary model; only switch on explicit user action or cache loaded models; keep models warm. |
| **No UI streaming on main path** | `sendAndWait` resolves on first ID match; `chunk` events not surfaced there → perceived latency. | Medium | Unify on one bridge that forwards chunks. |
| **Query cache** | `QueryCache` (LRU 256 + 300s TTL) is good, but keyed on (query, model) only — ignores RAG context, can serve stale answers. | Low/Med | Include context hash in key; add cache-bypass for time-sensitive queries. |
| **Embeddings per store** | Every interaction is embedded + stored to LanceDB synchronously in the request path. | Medium | Batch/async write-behind. |
| **Frontend bundle** | Monaco editor + framer-motion + full lucide set + react-markdown — large bundle; no code-splitting evident. | Medium | Lazy-load Monaco/heavy tools; tree-shake icons. |
| **Status polling** | Several components poll the kernel on intervals (audit notes mention 5s→30s tuning) in addition to events. | Low | Prefer events; poll as fallback only. |

---

# Phase 7 — Scalability Assessment

Nexus is a **single-user, single-machine desktop product**; "scalability" means responsiveness and resource ceilings, not horizontal scale.

- **Single kernel process, single stdin pipe, serialized loop** → the **primary bottleneck**. Concurrency is effectively 1 in-flight heavy operation. (Fix in §6.)
- **Memory growth:** LanceDB tiers capped in config (`max_tier2_entries: 50k`, `tier3: 500k`) but enforcement not verified; `deep_memory.json` is a single JSON file loaded into memory — will not scale to large graphs.
- **Statelessness:** Kernel holds all state in-process (`pending_actions`, caches, graph). A crash loses in-flight state; recovery is non-functional (F11).
- **Native Linux mode** exposes a REST API on :9600 (single instance, no auth observed) — not designed for multi-client.
- **Expected capacity:** Comfortable for one user with a handful of agents (config default `max_subagents: 5`); long tasks degrade the whole session due to the serialized loop. Local LLM throughput (Ollama) is the hard ceiling on a single GPU/CPU.
- **Growth constraints:** Knowledge-graph JSON, single-process design, and lack of work queue limit "many agents / large corpus" scenarios.

---

# Phase 8 — Code Quality Review

| Dimension | Rating /10 | Notes |
|---|---|---|
| Readability | 7 | Clear naming, generous docstrings/comments, consistent style within each language. |
| Maintainability | 5 | `main.py` god-object; duplicated `security/` vs `supervisor/` modules; two IPC paths; stale line-number comments. |
| Testability | 4 | Kernel tightly coupled in `__init__`; hard to unit-test handlers in isolation. |
| Modularity | 6 | Good package boundaries in kernel/frontend; undermined by duplication and the central dispatcher. |
| Coupling | 5 | `AetherKernel` couples to ~20 subsystems directly. |
| Cohesion | 7 | Individual modules are reasonably focused. |
| Error handling | 5 | Pervasive broad `except Exception` that swallows/`print`s; one real bug (`logger` undefined). Resilient but opaque. |
| Logging | 4 | `print(..., file=sys.stderr)` everywhere instead of `logging`; no levels/structured logs; emojis in logs. |
| Documentation | 7 | Strong design docs in `knowledgebase/`, but they overstate completion (see §11). |
| Test coverage | 3 | ~11 Python test files + 8 ad-hoc "phase" scripts + **1** Playwright spec; **no Rust tests, no frontend unit tests, no CI**. |
| **Overall** | **5.5/10** | Ambitious, broadly functional, but uneven — prototype-grade rigor at product-grade scope. |

---

# Phase 9 — Technical Debt

| Debt | Evidence | Effort to resolve |
|---|---|---|
| **God object** `main.py` (2,856 LOC, ~40 handlers) | `kernel/main.py` | L (3–5 d) — extract handler registry |
| **Duplicate security modules** | `security/{self_destruct,network_firewall,intent_dispatcher}.py` ≈ `supervisor/{...}.py`; also `brain/intent_dispatcher.py` | M (2–3 d) — consolidate |
| **Two IPC/bridge paths** | `aiService`→`mockTauri` vs `kernelEventBridge` | M — unify |
| **Dead/duplicate handlers** | "NOTE: defined above lines ~958" comments in `main.py` | S |
| **Undefined `logger`** | `main.py` `_handle_browser` | S (10 min) |
| **Crash recovery never wired** | `process_manager.rs` (F11) | M |
| **Committed artifacts** | `src-tauri/data/lancedb/**`, `check_output*.txt`, `check_final.txt`, `playwright-report/`, `test-results/` | S — gitignore + remove |
| **Two `ErrorBoundary`** | `components/system/` & `components/ui/` | S |
| **Ad-hoc root test scripts** | `test_phase{1,2,4,5,6}*.py`, `test_wiring_audit.py`, `test_nexus.py` | M — fold into pytest + CI |
| **Hardcoded local paths in docs** | `docs/architecture_audit_updated.md` (`c:\Users\davin\...`) | S |
| **`--enable-voice` always passed** | `process_manager.rs` | S |
| **No CI/CD, no lint/format gate** | repo-wide | M |
| **Binary in repo** | `.docx`/`.pdf` arch docs, 60MB+ Piper `.onnx` (via LFS) | S |

---

# Phase 10 — Missing Features & Gaps

- **Hardware acceleration (NPU/GPU):** code scaffolding (`hardware/npu_accelerator.py`) exists; internal audit marks it **❌ Not Implemented**.
- **Cross-device sync / A2A:** `sync/` modules present but **stubbed** (internal audit: ❌).
- **Auto-reply command execution:** `_handle_query` literally returns *"(Command execution pending implementation in handler registry)"* — slash-commands are recognized but **not executed**.
- **Frontend summarization:** `aiService.summarize()` is a `TODO` stub returning a constant.
- **Real voice-print verification for self-destruct:** `# TODO: Add real voice print verification` — currently any non-empty string "verifies."
- **Kernel auto-restart:** non-functional (F11).
- **Auth/accounts/licensing/telemetry/billing:** none — needed before any commercial launch.
- **Operational gaps:** no CI, no crash reporting, no update mechanism beyond Tauri bundler, no structured logging, no metrics.
- **Admin/observability UI:** rich user UI but no admin/diagnostics surface beyond status flags.

---

# Phase 11 — Repository Intelligence (hidden capabilities, flags, abandoned work)

- **Feature flags (config-driven):** `enable_openclaw`, `enable_llm_routing`, `require_approval_for_high_risk`, `self_destruct.enabled`, `voice.ambient_mode`, `agents.allow_remote_agent_creation` — several default **off**; toggling them activates significant behavior.
- **Optional subsystems via `try/except ImportError`:** NPU, federated learning, skills, Docker sandbox, plugins, OpenClaw, voice, security GAP modules, QMD, auto-reply, cron, Playwright/CDP browsers, messaging. The app **silently degrades** if deps are missing — capability depends heavily on the install.
- **"GAP" nomenclature:** Code is littered with `GAP 2..9` references (e.g., `# Auto-Reply Engine (GAP 9)`), revealing an internal punch-list of features bolted on incrementally; several are partially wired.
- **Hidden/secondary surfaces:** native Linux **REST orchestrator on :9600**, **MCP server** (exposes Nexus tools to *other* agents), **eBPF monitor**, **federated learner**, **ClawHub skill adapter**, **Docker sandbox**.
- **Self-destruct / data-wipe engine** (dual-implemented) — destructive capability reachable from the UI.
- **TODO/FIXME/mock density:** 264 matches across 53 files (notably `services/tauriApi.ts`, `services/mockTauri.ts`, agent components, `FileManager`, `MessagingDashboard`).
- **Abandoned/churned work signals:** stale line-number comments, "single canonical version" notes, duplicate modules, committed build logs, multiple overlapping design docs (`genesis.md`, `genesys.md`, `nexus_hla.md`, `nexus_lla.md`, `sixstep-final.md`, `lastplan.md`, `last-audit.md`).
- **Doc/реality drift:** `frontend-status.txt` says *"SUCCESS — robust and ready for use"*; `docs/architecture_audit_updated.md` marks most things ✅ — both **overstate** production-readiness relative to the security/perf findings here.

---

# Phase 12 — Executive Summary

### What this application is
Nexus (a.k.a. Aether) Hybrid AIOS is an **ambitious local-first "AI operating system"** — a polished cyberpunk desktop shell (React) over a Rust process-supervisor, driving a large Python "reasoning kernel" that can run agents, control the host (shell, files, browser), talk over voice, and bridge to messaging apps. It ships both as a desktop app and as a bootable Arch Linux ISO.

### What it currently does (working today)
Local LLM chat with RAG memory (Ollama + LanceDB), tiered + graph memory, a multi-agent task system with human-in-the-loop approval, a voice pipeline (wake-word → STT → TTS), browser automation, a cron scheduler, an MCP server/client, an in-app terminal/file-manager/code-editor/web-browser, and an external-messaging bridge. Cloud LLM providers are also supported (despite "local-only" marketing).

### Key strengths
- **Genuinely impressive scope & cohesion** for the size; the hybrid 3-process architecture is sound and the layering is clear.
- **Strong UX/design** and a thoughtful frontend IPC bridge with timeouts and graceful degradation.
- **Several well-built security primitives**: HIL approval with anti-spoofing/duplicate guards, audit logging, Fernet key vault, systemd hardening flags.
- **Good design documentation** and modular Python packages.

### Key weaknesses
- **Security model is advisory and inconsistently enforced**; the flagship feature (OS-controlling AI) is also the biggest risk, and a raw `execute_shell` bypasses every guard.
- **Single-threaded kernel loop** serializes all work — long tasks freeze the app.
- **Over-stated completeness**: stubs, "pending implementation," dead crash-recovery, non-local cloud reality.
- **Prototype-grade engineering rigor** (no CI, thin tests, god object, duplication, `print`-logging) at product-grade ambition.

### Security posture
**High risk / not ready for untrusted input or public distribution.** Critical: unrestricted shell + filesystem-wide capabilities + permissive CSP. The path from "render a malicious message/web page" to "run code on the host" is short. Remediation is well-scoped (see Top-20) and the bones (HIL, audit, vault) are there.

### Performance posture
**Acceptable for single-user light use; degrades sharply** under long/agentic/indexing tasks due to the serialized message loop and per-request model switching.

### Scalability readiness
**By design single-user/single-host.** No horizontal scaling intended or needed; the in-process state, JSON-file knowledge graph, and serialized loop cap "many agents / large corpus" use.

### Development quality score
**5.5 / 10** — high ambition and breadth, uneven execution. With the Top-20 addressed it could reach 7.5–8.

### Business potential
**Real and differentiated** — a private, agentic "AI OS" is a compelling niche (developers, privacy-focused power users, AI tinkerers; the ISO is a strong demo/marketing asset). To commercialize: fix the security model, correct the "local-only" messaging (or actually enforce it as a mode), add accounts/licensing/telemetry, and harden the installer. The Mar-2026 switch to a proprietary license on `main` suggests commercialization is already intended.

---

## Top 20 Highest-Priority Improvements (ranked by impact)

| # | Improvement | Phase/Finding | Sev/Impact | Effort |
|---|---|---|---|---|
| 1 | Remove/replace unrestricted `execute_shell`; route all shell through supervisor + HIL or an allow-list | F1 | Critical | M |
| 2 | Scope Tauri FS capabilities away from `**`; remove default `shell:allow-execute/spawn` | F2 | Critical | S |
| 3 | Tighten CSP — drop `unsafe-eval`/`unsafe-inline`; sanitize all LLM/remote HTML & Markdown | F3 | High | M |
| 4 | Make the kernel supervisor a **hard gate** before any tool execution; switch deny-list → allow-list | F4 | High | M |
| 5 | Fix insecure installer defaults (no hardcoded `nexus:nexus`, no sudo for service user, forced password set) | F5 | High | S |
| 6 | Proper secret storage (OS keychain/DPAPI); never echo keys in responses or logs | F6 | High | M |
| 7 | Require HIL for **all** state-changing tool calls; constrain `auto_approve`; separate data vs instructions (anti prompt-injection) | F7 | High | M |
| 8 | Make kernel message loop **concurrent** (task per message) to stop UI freezes | §6/§7 | High | M |
| 9 | Stop per-request Ollama model switching; keep models warm / pin primary | §6 | High | S |
| 10 | Fix `logger` NameError in `_handle_browser`; introduce real `logging` (levels, structured) | §3/§8 | Med | S |
| 11 | Wire (or remove) crash recovery; implement real supervised restart with backoff | F11 | Med | M |
| 12 | Add CI/CD: lint, type-check, `cargo test`, pytest, Playwright; format gates | §8/§9 | High | M |
| 13 | Correct "local-only" claims or implement an enforced offline mode toggle | §2 | Med | S |
| 14 | Consolidate duplicate `security/` vs `supervisor/` (+ `brain/`) modules | §9 | Med | M |
| 15 | Unify the two frontend IPC paths (`mockTauri` + `kernelEventBridge`); add true streaming | §3/§6 | Med | M |
| 16 | Harden self-destruct: real auth (PIN+MFA), real voice-print or remove the dual implementation | F8 | Med | M |
| 17 | Gate/secure the OpenClaw inbound auto-reply (treat remote messages as untrusted) | F9 | Med | S |
| 18 | Refactor `main.py` god object into a handler registry; raise testability | §8/§9 | Med | L |
| 19 | Remove committed artifacts (LanceDB test data, `check_output*.txt`, reports) + fix `.gitignore`; scrub local paths | F12/§9 | Low | S |
| 20 | Implement the stubs that ship as "done": auto-reply command execution, `summarize()`, NPU, cross-device sync | §10 | Med | L |

---

# 13. Audit methodology & coverage statement

- **Inventory:** 100% of tracked files enumerated (`git ls-files`, 306 files) and every directory's purpose documented.
- **Read in full:** `kernel/main.py` (2,856 LOC), `runtime_config.py`, `security/key_vault.py`, `supervisor/safety_checker.py`, `toolbox/shell_executor.py`; Rust `lib.rs`, `main.rs`, `commands/{kernel,shell,safety}.rs`, `orchestrator/process_manager.rs`, `security/state.rs`, `capabilities/default.json`, `tauri.conf.json`; frontend `services/{tauriApi,kernelEventBridge,aiService}.ts`; `linux/install.sh`; README + HLA + internal audit + status docs; `package.json`.
- **Searched repo-wide (verified, not read in full):** secrets/credentials patterns, `eval/exec/subprocess/shell=True` usage, `TODO/FIXME/HACK/mock/stub`, `execute_shell` call sites, crash-recovery wiring, `logger` definition, cloud-provider support.
- **Sampled / inferred from interfaces & names (lower confidence):** the 51 React components individually, and the long tail of kernel modules (`agents/*`, `memory/*`, `voice/*`, `hardware/*`, `skills/*`, `bridge/*`, `linux/*`) beyond their entry points and the handlers in `main.py` that call them. Where a claim rests on naming/interface rather than full read, it is framed as such.
- **Not executed:** no build/run/test was performed; findings are static-analysis based. Recommended next step: run `cargo test`, `pytest`, `npm run test:e2e`, and a dependency vulnerability scan (`cargo audit`, `pip-audit`, `npm audit`) to complement this static review.

*End of report.*
