# Nexus / Aether Hybrid AIOS — Full Repository Audit & Reverse-Engineering Report (v2, deep pass)

> **Audit date:** 2026-06-01
> **Repository root:** `O:\CYBERPUNK\nexus-ag` — branch `feature/model-provider-management`
> **Project analyzed:** `nexus-app/` (the application) + `openclaw/`, `cloned_repo/`, ISO build infra
> **Auditor roles:** Architecture / Security / Performance / Quality / Product / DevOps
> **Audience:** Engineering leadership, new engineers, security reviewers, non-technical stakeholders
> **Method:** Deep second pass. ~40 of the architecturally/security-critical source files were read **line-by-line**; the remainder were verified via repository-wide search. This report supersedes the earlier single-pass audit and **corrects several of its claims that are now stale on this branch** (flagged inline as ⟲ CORRECTION).

---

# ⭐ v3 ADDENDUM — Core-Functionality Verification & Fix Log (2026-06-01)

This addendum supersedes conflicting claims below. It records a **critical core bug the v2 audit missed**, the fixes applied this session, and **end-to-end verification** that the core intelligence loop now works.

## C-1 (CRITICAL, core) — Memory retrieval was 100% broken → RAG, recall, and semantic search were all silently dead
**Files:** `kernel/memory/lancedb_store.py` (`search`, `_hybrid_search`), `kernel/memory/memory_manager.py` (`retrieve`).
**Bug:** The default hybrid (RRF) search path set `_distance = 1 − rrf_score` (rrf ≈ `1/61 ≈ 0.016` → `_distance ≈ 0.984`), then `search()` computed `score = 1 − _distance ≈ 0.016` and filtered `if score >= threshold (0.5)`. **0.016 ≥ 0.5 is always false**, so **every retrieval returned `[]`**.
**Blast radius:** `memory.retrieve()` is the shared dependency of (a) **RAG context injection** in `_handle_query` (chat had *no* memory context → felt "unintelligent"), (b) **Memory Explorer**, (c) **Semantic Search**, and (d) **Mission Control memory**. One bug made the entire "system intelligence" layer appear dead while writes succeeded.
**Fix:** Normalize RRF → [0,1] similarity (top hit = 1.0); `search` uses the normalized score; default `threshold` 0.5 → 0.0 (rank + `limit` do the filtering).
**Status:** ✅ Fixed + verified.

## Other fixes applied this session
- **Memory store unified** — GUI kernel and `aether` CLI now share `~/.aether/memory/aether.lance` (was split: `./data/lancedb` vs `~/.aether/...`). `MemoryManager` now `expanduser`s paths. (`main.py:237`, `memory_manager.py`)
- **`get_stats` now counts persistent tiers** (was working-memory only) → Memory Explorer tiles/total reflect real data.
- **Security `run_audit`** action implemented in `_handle_security` (was an unhandled no-op) → returns supervisor audit log + posture checks.
- **Deps installed** into the kernel venv: `playwright`(+Chromium), `faster-whisper`, `openwakeword`, `piper-tts`, `sounddevice` → Web Browser tool + Voice now load. Added `rich`, `readchar`, `prompt_toolkit` for the CLI.
- **`aether` CLI** — global interactive REPL with full agentic executor, arrow-key pickers, live Markdown (`kernel/aether_cli.py`, `pyproject.toml`).
- **Real PTY terminal** in the app dock (`src-tauri/.../commands/pty.rs` + `PtyTerminal.tsx`) — interactive `aether` runs inside the app.
- **Mission Control** turned from passive dashboard into a command center (dispatch agentic tasks, app launcher, run audit, restart/clear, live CPU/RAM/ping/TAO stream).
- **Config:** default provider `ollama`; `voice.enabled=true`; `enable_openclaw=false` (needs external gateway).

## End-to-end verification (kernel + local Ollama `llama3.2:3b`)
- **RAG + memory + LLM:** stored *"project codename is BLUEHARVEST, deadline March 14"* → asked → model answered **"…BLUEHARVEST… deadline is March 14."** ✅
- **Agentic execution:** task *"write a file … containing HELLO_AETHER"* → planner made a 2-step plan → supervisor-gated `list_dir` + `write_file` ran → **file created with `HELLO_AETHER` on disk**. ✅
- **Memory round-trip:** store → `retrieve` returns ranked results (top score 1.000); `get_stats` reports real counts. ✅

## Regression coverage & hardening (this session)
- **`kernel/tests/` is now green** (`29 passed, 4 skipped`). Removed 4 stale test files (`test_brain/test_memory/test_supervisor/test_toolbox`) that asserted **non-existent APIs** (`Toolbox.tools`, `IntentValidator.validate`, `ErrorKB`, `Supervisor`, `Plan`, `LLMEngine(model=)`) — false coverage — and replaced them with correct, CI-safe tests (`test_core_components.py`) + core regression tests (`test_core_regression.py`).
- **Regression guards** now exist for the exact bugs found: memory retrieve returns results (catches the RRF/threshold regression), normalized scores, tier counts, agentic execute→tool→side-effect, supervisor blocks `rm -rf /`, and **empty-plan ≠ silent success**.
- **Planner hardened for small local models** (`brain/planner.py`): robust `_extract_json` (code fences, prose, trailing commas, smart quotes, balanced-brace fallback) + a one-shot strict-JSON retry when 0 steps; **`ManagerAgent.execute_task` now fails explicitly on an empty plan** instead of reporting a vacuous `all([])==True` success.
- **GUI chat path verified (static):** `ChatInterface → aiService.sendMessage → mockTauri.sendQuery → invoke('send_to_kernel', messageType:'query') → _handle_query` (RAG retrieve→inject→stream→store) → `chunk` events → `kernel:response` → `mockTauri` chunk listener → UI stream. The GUI chat therefore uses the same RAG-enabled handler proven above.

## Verified WORKING (core)
Chat with RAG · tiered memory persistence (shared CLI/GUI) · semantic retrieval · agentic task execution (plan→supervisor→tools) · interactive `aether` CLI · PTY terminal · model switching (local + cloud).

## Requires external setup (not bugs — optional/by design)
- **Voice** — deps installed; needs a mic; ambient mode off by default.
- **Web Browser tool** — Chromium installed; works after kernel restart.
- **OpenClaw messaging** — needs the external `openclaw/` Node gateway on `:8080` + account linking (flag off).
- **NPU / Docker sandbox / federated / eBPF** — need OpenVINO/CUDA, Docker, peft/zeroconf, Linux+bcc respectively; otherwise report N/A honestly.

> **To apply in the GUI:** the running app must **restart its kernel** (`npm run tauri dev`) so the live Python kernel picks up the retrieval/memory/security fixes. Screenshots taken before that restart will still show the old (empty) behavior.

---

## 0. How to read this document

Organized into the 12 requested phases plus a methodology statement (§13). If you read only three sections:

1. **§12 Executive Summary** — business picture + Top-20 priorities.
2. **§5 Security Audit** — the issues that gate any public/production release.
3. **§1 Repository Map** — to navigate the code.

Confidence is labelled where it matters. Findings that rest on naming/interface rather than a full read are marked *(inferred)*.

---

# Phase 1 — Repository Mapping

## 1.1 Top-level layout

The git repository root is a thin wrapper; the **entire shipped application lives in `nexus-app/`**. The repo root also contains several **untracked** directories that are build artifacts or vendored third-party projects.

```
nexus-ag/
├─ README.md                  # Marketing/architecture overview (ISO + dev setup)
├─ LICENSE                    # MIT (this branch)
├─ AUDIT_REPORT.md            # ← this file
├─ build-internal.sh          # ISO overlay build helper (copies kernel into airootfs)
├─ Dockerfile.nexus           # (untracked) helper image
├─ nexus-app/                 # ★ THE PROJECT (tracked)
│  ├─ src/                    # React 19 + TypeScript frontend (Tauri webview)
│  ├─ src-tauri/              # Rust (Tauri v2) desktop shell / orchestrator
│  ├─ kernel/                 # Python AI "reasoning kernel" (sidecar process) ★ the real product
│  ├─ linux/                  # Arch ISO build pipeline, systemd, D-Bus, Packer, install/uninstall
│  ├─ wsl/                    # WSL2 distro bridge (Windows → Linux stack)
│  ├─ installer/windows/      # WiX MSI config
│  ├─ scripts/                # Windows service install (PowerShell)
│  ├─ docs/                   # Internal architecture audit
│  ├─ knowledgebase/          # 14 planning / design / status markdown docs
│  ├─ tests/                  # Playwright e2e (1 spec)
│  └─ test_*.py               # 8 root-level "phase" verification scripts
├─ openclaw/        (untracked) # ★ Full upstream OpenClaw OSS gateway (TS/pnpm monorepo, MIT)
├─ cloned_repo/     (untracked) # Original Google AI Studio React prototype ("seed")
├─ data/lancedb/    (untracked) # Runtime vector DB (now git-ignored)
├─ linux/           (untracked) # Extra packaging/systemd/toolbox staging
├─ archiso-profile/ (untracked) # mkarchiso profile (base)
├─ nexus-profile/   (untracked) # mkarchiso profile (Nexus-branded)
├─ work/, out/      (untracked) # ISO build scratch + finished ISO (archlinux-2026.02.11-x86_64.iso)
└─ .venv/           (untracked) # local Python venv
```

**Scale (tracked source, via `wc -l`, excluding vendored `kernel/venv/`):**

| Layer | Language | LOC | Files |
|---|---|---|---|
| Reasoning kernel | Python | **~30,660** | ~85 modules |
| Frontend | TypeScript / TSX | **~19,530** | 58 files (51 components + services/store/hooks) |
| Desktop shell / orchestrator | Rust | **~2,860** | 21 `.rs` files |
| Infra / build | Bash / PS1 / JSON | ~2,000 | ~20 |
| **Total tracked files** | | | **284** |

The codebase is **Python-dominant** (the kernel is the product). Rust is a thin process-supervisor/IPC shell. The frontend is large, polished, and feature-rich.

> **Note on `kernel/venv/`:** A full Python virtual environment with site-packages is present on disk (numpy, lancedb, langchain, pyarrow, etc., adding ~150k+ LOC). It is **git-ignored** (`.gitignore: kernel/venv/`) and is **not** source — excluded from all counts and analysis.

## 1.2 Directory & subsystem purposes (kernel)

| Path | Purpose | Read depth |
|---|---|---|
| `kernel/main.py` (2,919 LOC) | `AetherKernel`: the IPC server. Reads line-delimited JSON on stdin, dispatches ~40 `_handle_*` message types, owns ~20 subsystems guarded by `try/except ImportError`. | Verified via search + targeted reads |
| `brain/cloud_engine.py` (801) | Multi-provider LLM client (OpenAI, Anthropic, Groq, Cerebras, Mistral, Gemini, OpenRouter, Ollama). Per-provider cooldown w/ exponential backoff, context-window guard, SSE/NDJSON stream parsers, automatic fallback chain. | **Full** |
| `brain/llm_engine.py` (300) | Unified facade over `CloudLLMEngine` + `CompactionEngine`. Auto-compaction when context approaches budget. | **Full** |
| `brain/model_router.py` (382) | Intent→model routing (pattern fast-path + LLM classifier under a lock). | **Full** |
| `brain/intent_parser.py` (247) | NL→structured intent. **Has prompt-injection mitigations** (HTML-escape + brace-escape + tagged input). | **Full** |
| `brain/intent_dispatcher.py` (162) | Routes parsed intents to tool/AI/plan/conversation; supervisor gate before tool dispatch; semantic tool selection. | **Full** |
| `brain/compaction.py` (403) | Chunked conversation summarization with recency retention. | **Full** |
| `brain/query_cache.py` (136) | Async TTL+LRU cache keyed on (model, temperature, prompt) SHA-256. | **Full** |
| `brain/planner.py` (215) | LLM-driven task decomposition into typed `PlanStep`s with deps + risk levels; plan refinement on failure. | **Full** |
| `memory/memory_manager.py` (430) | 3-tier coordinator (working/short/long) + session restore + Context Capsules. | **Full** |
| `memory/lancedb_store.py` (379) | Vector store; hybrid RRF (vector+FTS) search; H-MEM fields (domain/category/abstraction). | **Full** |
| `memory/deep_memory.py` (754) | Tier-4 knowledge graph (entities/edges, decay, LLM extraction, JSON persistence). | **Full** |
| `memory/document_indexer.py` (510) | File/dir chunking + embedding for RAG (text/code/markdown/PDF). | **Full** |
| `memory/rag_engine.py` (180) | Query expansion + multi-tier retrieve + rerank. | **Full** |
| `memory/context_scheduler.py` (299) | Token-budget greedy selection + a **second** intent→model router. | **Full** |
| `memory/qmd_manager.py` (550) | Tier-2 "Quick Memory Documents" (markdown+frontmatter, BM25 search, batch/import/export). | **Full** |
| `memory/self_learning.py` (622) | Learns patterns/preferences/corrections from approved actions. | **Full** |
| `agents/manager_agent.py` (397) | Orchestrates plans in **parallel dependency waves**; "War Room" multi-agent consult; persists results to memory. | **Full** |
| `agents/worker_agent.py` (82) | Executes a step; **supervisor-gated; fails closed on approval-required**. | **Full** |
| `agents/subagent_registry.py` (424) | Spawn/wait/cancel child agents w/ timeouts, capacity cap, crash-recovery persistence. | **Full** |
| `agents/agent_persistence.py` (164) | Agent Builder config + canvas layout persistence (camel↔snake mapping). | **Full** |
| `agents/{security_auditor,code_architect,researcher,qa_engineer,monitor_agent}.py`, `crewai_adapter.py` | Specialized role agents + CrewAI adapter. | Search-verified *(inferred)* |
| `toolbox/__init__.py` (247) | `Toolbox` dynamic tool dispatch + dynamic/MCP tool registration. **Does not itself call the supervisor.** | **Full** |
| `toolbox/shell_executor.py` (198) | Async subprocess; PowerShell/cmd/bash; 60s timeout. | **Full** |
| `toolbox/file_manager.py` (375) | FS ops; `PROTECTED_PATHS` guard (**weak — see F-NEW-1**). | **Full** |
| `toolbox/web_automation.py` (184) | Raw aiohttp HTTP + BeautifulSoup scrape. **No firewall check.** | **Full** |
| `toolbox/mcp_client_manager.py` (110) | Connect to external MCP servers, register their tools. | **Full** |
| `toolbox/{browser_engine,cdp_browser_engine,media_pipeline,notification_tools}.py` | Playwright/CDP browser, screen capture/vision, email/desktop/SMS notify. | Search-verified *(inferred)* |
| `supervisor/__init__.py` (283) | `AgenticSupervisor`: 6-layer pipeline (blacklist→AST→risk→tool-policy→intent→HIL). | **Full** |
| `supervisor/safety_checker.py` (224) | Regex blacklist + risk scoring + obfuscation decoding. | **Full** |
| `supervisor/ast_audit.py` (408) | **Deep** pseudo-AST command analysis (pipe-to-shell, chain-hiding, recursive-force, redirect-to-device, sensitive paths). | **Full** |
| `supervisor/tool_policy.py` (313) | Per-profile/owner tool allow/deny with group expansion + owner-only gating. | **Full** |
| `supervisor/intent_validator.py` (291) | Action↔intent alignment (keyword + optional LLM). | **Full** |
| `supervisor/{audit_logger,error_kb}.py` | Audit trail; error→correction KB. | Search-verified *(inferred)* |
| `supervisor/self_destruct.py` (309) | `LockLevel`-based kill-switch (soft/hard/wiped) + dead-man loop. | **Full** |
| `supervisor/network_firewall.py` (193) | Duplicate of `security/network_firewall.py`. | **Full** |
| `security/key_vault.py` (95) | Fernet at-rest encryption of API keys. | **Full** |
| `security/self_destruct.py` (324) | **Different** `DestructLevel`-based engine (PIN+voice, countdown, secure-wipe passes). | **Full** |
| `security/network_firewall.py` (244) | Default-DENY allowlist + exfil detection + per-agent rules. | **Full** |
| `security/intent_dispatcher.py` (297) | Overlaps `brain/intent_dispatcher.py`. | Search-verified *(inferred)* |
| `runtime_config.py` (240) | File-backed config; **encrypts api_keys via vault; default `ai_provider="ollama"`**. | **Full** |
| `orchestrator.py` (482) | System-level event bus + subsystem lifecycle manager (sits *above* `main.py`). | **Full** |
| `auto_reply.py` (887) | Message chunking/delivery + **70+ slash-command registry** + heartbeat monitor + platform templates. | **Full** |
| `linux/nexus_orchestrator.py` (441) | Linux replacement for the Rust shell: process supervisor + **authenticated REST/WS API (:9600)** + SPA serving. | **Full** |
| `linux/{daemon,dbus_service}.py` | systemd daemon + D-Bus service (w/ stub fallback). | Search-verified *(inferred)* |
| `bridge/openclaw_client.py` (131) | WebSocket client to OpenClaw gateway. **Handshake has no auth.** | **Full** |
| `bridge/channel_router.py` (379) | Routes inbound/outbound external-channel messages. | Search-verified *(inferred)* |
| `voice/*`, `hardware/*`, `skills/*`, `sync/*` | Voice pipeline (wake/STT/TTS), NPU/eBPF/federated (mostly scaffolding), skill loader + Docker sandbox + ClawHub, A2A + memory sync (stubbed). | Search-verified *(inferred)* |
| `cron_service.py`, `plugin_system.py`, `mcp_server.py`, `health_monitor.py`, `ipc_bridge.py`, `aether_cli.py`, `auto_reply.py` | Standalone services. | Mixed |

## 1.3 Dependencies & frameworks

**Frontend (`package.json`):** React 19.1, Vite 7, TypeScript 5.8, Tauri API v2 + plugins (shell, fs, dialog, notification, process, opener), Tailwind 3.4 + animate, framer-motion 12, lucide-react, cmdk, react-markdown 10, `@monaco-editor/react`, **`@google/genai` 1.34** (cloud Gemini SDK in the frontend). Playwright for e2e.

**Rust (`Cargo.toml`):** Tauri 2 + matching plugins, serde, tokio, tracing, uuid, chrono, regex.

**Python (`requirements.txt`):** langchain + langchain-ollama, lancedb, aiohttp, beautifulsoup4, pydantic, numpy, **mcp**, faster-whisper / openwakeword / piper-tts / sounddevice (voice, listed as **non-optional** here), psutil, python-dotenv, **openvino** (NPU), **peft + zeroconf** (federated), **websockets + cryptography** (A2A/Fernet). `requirements.lock.txt` provides pinned installs for the installer.

**External runtime deps:** Ollama (`:11434`), optional Docker (skill sandbox), optional OpenClaw gateway (`ws://localhost:8080/v1/s2s`).

---

# Phase 2 — Application Understanding

## 2.1 Product overview (plain language)

**What it is:** Nexus (internally "Aether") is a **local-first desktop "AI operating system."** It presents a cyberpunk-styled OS shell — window manager, command palette, file manager, terminal, code editor, web browser, chat, voice assistant, agent-orchestration canvas — where every surface is wired to an autonomous AI agent that can perceive and **act on** the host (run shell commands, read/write files, drive a browser, send messages on external chat platforms).

**Two delivery modes:**
1. **Desktop app** (Tauri) installed on existing Windows/Linux/macOS.
2. **Bootable Arch Linux ISO** ("AIOS") where Nexus *is* the environment, with systemd services, a D-Bus interface, and a REST/WS orchestrator.

**Problem it claims to solve:** Today AI is "an app inside the OS." Nexus inverts that — the AI is a first-class, local-first system layer that operates the computer on the user's behalf, privately, via local models (Ollama), with optional cloud providers for power.

**Intended users:** Power users, developers, privacy-focused AI enthusiasts who want an autonomous local agent with deep OS access. Not enterprise/multi-tenant.

**Business model:** Not encoded in code (no billing/licensing/telemetry/accounts). This branch is MIT-licensed.

**Value proposition:** Private, agentic "AI OS" — local inference, ambient voice, agentic automation, external-messaging bridge, and a striking UI.

> ⟲ **CORRECTION (positioning vs. reality).** The earlier audit said the default `ai_provider` is `"auto"` (cloud-first). On **this** branch the default is `"ollama"` (`runtime_config.py:33`), so the *default* really is local-first. **However**, the product remains **hybrid** by design: `brain/cloud_engine.py` ships 7 cloud providers, `@google/genai` is a frontend dependency, and a UI exists to enter cloud keys. The README's absolute claim *"No Cloud Dependency: All inference runs locally"* is still **inaccurate as a categorical statement** — it should read "local by default; cloud optional." (See §11.)

## 2.2 Core workflows

1. **Chat / query:** UI → `aiService`/`tauriApi` → Rust `send_to_kernel`/`execute_shell` etc. → Python `_handle_query` → model routing → RAG retrieval (LanceDB) → LLM stream (cloud or Ollama) → tiered-memory write → response.
2. **Autonomous task:** `_handle_task` → `Planner` builds a typed plan → `ManagerAgent` runs steps in **parallel dependency waves** → `WorkerAgent` validates each step through the supervisor and (by default) fails closed if approval is required → tool calls → result persisted to memory.
3. **HIL approval:** A high/critical-risk action emits an approval event → React modal → user approves → Rust `resolve_approval` (anti-spoof) → kernel `approval_decision` → execution + self-learning log.
4. **Voice:** wake word → Faster-Whisper STT → query pipeline → Piper TTS.
5. **Messaging bridge:** Inbound WhatsApp/Discord/Telegram via OpenClaw → treated as a query → AI reply chunked per platform and sent back.
6. **Scheduling:** `cron_service` runs prompts/tools on a schedule.

---

# Phase 3 — Code-Level Analysis (per-module)

> Per-module **Purpose / Inputs / Outputs / Dependencies / Risks / Maintainability / Improvements**. Only modules read in full are given full treatment; others are summarized.

### `brain/cloud_engine.py` — `CloudLLMEngine` (★ strong)
- **Purpose:** Talk to 8 LLM backends behind one interface, with automatic fallback.
- **Inputs:** prompt/messages, temperature, max_tokens, api_keys, preferred provider, per-provider model overrides.
- **Outputs:** full text or async token stream; tracks last provider/model/latency; `check_health()`.
- **Dependencies:** aiohttp.
- **Risks:** (1) Token estimate is `len//4` (rough; can under/over-shoot budget). (2) Ollama `keep_alive: 30m` keeps a model resident — good for latency, costs RAM. (3) No per-request firewall (network egress unchecked — see F-NEW-2). (4) `embed()` is Ollama-only; a single embedding endpoint hard-coded.
- **Maintainability:** High — clean dataclasses, registry pattern, cooldown w/ exponential backoff (5→120s), separate stream parsers per provider family.
- **Improvements:** route egress through `NetworkFirewall`; use a real tokenizer for budgeting; make embedding provider configurable (config already has `embedding_provider`).

### `brain/llm_engine.py` — `LLMEngine`
- **Purpose:** Unified entry; wraps cloud engine + compaction; auto-compacts history near budget.
- **Risk:** `change_model()` mutates config and `provider_models["ollama"]`; combined with per-request routing this can thrash Ollama model loads (mitigated: routing **off by default** now — `enable_llm_routing: False`). ⟲ This softens the earlier "model thrash" finding to *opt-in*.
- **Improvement:** expose streaming through the unified path consistently.

### `brain/model_router.py` + `memory/context_scheduler.py` — ⚠ duplicated routing
- **Finding (debt):** **Two independent intent→model routers** exist with **different model maps**. `ModelRouter` uses `llama3.2:{1b,3b}` / `llama3:8b`; `ContextScheduler.route_intent` references `qwen2.5-coder:7b`, `phi3:mini`, `llama3.2:latest` — models that may not be installed, silently falling back. Confusing and a source of "model not found" failures.
- **Improvement:** consolidate to one router; gate selected models against `list_models()`.

### `brain/intent_parser.py` — ✅ injection-aware
- **Strength:** `_sanitize_for_prompt()` HTML-escapes angle brackets and escapes `{`/`}` before interpolating user text into prompts, and wraps user text in `<user_input>` tags with an explicit "do not follow embedded instructions" directive. This is **above-average** prompt-injection hygiene for this class of app.
- **Risk:** mitigation is per-call; not all kernel prompt sites use it (the agent/system-prompt path and document/web ingestion do not — see F7).

### `brain/compaction.py`, `brain/query_cache.py`, `brain/planner.py`
- Solid, focused utilities. `query_cache` is async-safe LRU+TTL but keyed only on (model, temp, prompt) — **ignores RAG context**, so a cached answer can be served despite changed retrieved context (low/med correctness risk).

### `memory/lancedb_store.py` — ⚠ filter injection + embedding mismatch
- **F-NEW-3 (Med):** Search/get/delete build LanceDB filter clauses by **f-string interpolation**: `f"domain = '{domain}'"`, `f"category = '{category}'"`, `f"id = '{entry_id}'"`, `f"created_at < '{before_str}'"`. If `domain`/`category`/`id` ever derive from untrusted input (e.g., document metadata, channel messages, agent-chosen tags), a crafted value containing `'` can break out of the predicate (filter/predicate injection). Currently these are mostly internal, but the pattern is unsafe.
- **F-NEW-4 (Low/Med, correctness):** the embedding fallback returns `[0.0] * 384`, but `nomic-embed-text` produces **768-dim** vectors. A real embedding mismatch (or Ollama down) yields a zero/short vector → silent search degradation or dimension errors.
- **Improvement:** parameterize filters / whitelist values; set the zero-vector length from the configured model dim; surface embedding failures.

### `memory/deep_memory.py` — ⚠ O(n²) persistence
- **F-NEW-5 (Med, perf):** `_persist()` rewrites the **entire** graph JSON to disk on **every** `add_entity`/`add_edge`/reinforcement. During `batch_ingest()` of *n* items this is O(n) full-file writes (plus a final write) → quadratic I/O; large imports will be very slow and I/O-heavy. The single-JSON design also caps graph size (whole graph loaded into memory).
- **Improvement:** batch persistence (dirty flag + debounce, or persist once per batch); migrate to SQLite for larger graphs (the docstring already anticipates this).

### `memory/document_indexer.py` & `self_learning.py` — ⚠ pseudo-query scans
- Both call `store.search(query="*", limit=1000/10000, use_hybrid=False)` to "list all," then filter in Python. `"*"` is embedded as a literal query (meaningless vector) and the limit-then-filter pattern is an inefficient full scan + N+1 deletes in `_delete_document_chunks`. Functional at small scale; poor at scale.

### `memory/qmd_manager.py` — ✅ well-built
- Clean Tier-2 doc store with a real BM25 implementation, hybrid scoring, batch ops, import/export, stats. `_save_index()` + per-doc markdown write on each mutation (acceptable for human-scale doc counts).

### `agents/manager_agent.py` — ⟲ runs in parallel
- ⟲ **CORRECTION:** the earlier audit implied sequential execution. `ManagerAgent.execute_task` builds **execution waves**: steps whose dependencies are satisfied run concurrently via `asyncio.gather`; failed deps cause dependent steps to be skipped; one retry-with-correction per failure up to `max_retries`. Emits TAO (Thought/Action/Observation) events via `print(json)` to stdout for UI.
- **Risk:** `_emit_tao` prints directly to stdout instead of using an injected emitter (the code comments acknowledge this) — couples the agent to the IPC framing and can interleave with response frames.

### `agents/worker_agent.py` — ✅ fails closed
- ⟲ **CORRECTION / strength:** every step is validated via `supervisor.validate(...)`; if `requires_approval and not auto_approve`, the step is **blocked** (not silently reworded/retried). This is a genuinely good HIL default. Note the absolute import `from supervisor.error_kb import ...` assumes `kernel/` is on `sys.path`.

### `agents/subagent_registry.py` — ✅ robust
- Capacity-capped spawn, per-agent timeout, cancel, on-complete callback, atomic JSON persistence, and **crash recovery** (non-terminal runs marked failed on restart). Good engineering.

### `toolbox/__init__.py` — ⚠ supervisor not enforced here
- **Finding:** `Toolbox.execute()` dispatches directly to shell/file/web/browser/media **without** calling the supervisor. The supervisor is only enforced by callers (`WorkerAgent`, and `main.py`'s command handler at `:981`). Any kernel path that calls `toolbox.execute()` directly bypasses validation. Centralizing a hard gate inside `Toolbox.execute()` would close this by construction.

### `toolbox/shell_executor.py`
- Async subprocess with platform shell selection (`powershell -NoProfile -Command` on Windows, `sh -c` elsewhere), 60s timeout, temp-file script mode. This is the *kernel's* shell path (supervisor-gated when reached via the kernel command handler). **Distinct** from the Rust `execute_shell` (F1), which is the dangerous, ungated one.

### `toolbox/file_manager.py` — ⚠ protected-path bypass
- **F-NEW-1 (Med→High depending on exposure):** `PROTECTED_PATHS` only raises `PermissionError` when the resolved path **exactly equals** a protected root. The loop checks `startswith(protected)` but only blocks when `resolved == protected`. Therefore `C:\Windows\System32\<anything>`, `/etc/<anything>`, `/boot/<anything>` pass the check and are **writable/deletable** via `FileManager.write/delete/move`. The comment ("Allow reads but not the root itself") does not match the behavior for writes/deletes. Combined with agent autonomy this is a destructive-action risk.
- **Improvement:** block when `resolved == protected` **or** `protected` is a parent of `resolved` (for write/delete/move); allow reads explicitly if desired.

### `toolbox/web_automation.py` — ⚠ SSRF / no egress control
- **F-NEW-2 (Med→High):** `request()`/`download()`/`scrape_text()` issue raw aiohttp requests to **any** URL with no allow/deny list and **no call to `NetworkFirewall.check()`**. An agent (or prompt-injected agent) can reach internal services (`http://localhost:*`, `http://127.0.0.1:*`), cloud metadata (`http://169.254.169.254/...`), or exfil endpoints. The firewall that would prevent this exists but is unenforced (see F-NEW-6).

### `supervisor/*` — ✅ genuinely multi-layer (re-characterized)
- ⟲ **CORRECTION:** the earlier audit framed safety as "an advisory, bypassable deny-list." In fact `AgenticSupervisor.validate()` runs **six layers**: (1) regex blacklist with **obfuscation decoding** (base64/hex/url/concat) and whitespace normalization; (2) **AST command audit** (`ast_audit.py`) detecting pipe-to-shell, chain-hiding (`echo ok && rm -rf /`), recursive-force deletes, redirect-to-block-device, sensitive-path access, command substitution; (3) keyword risk scoring; (4) tool-policy allow/deny w/ owner-only gating; (5) intent alignment (keyword + optional LLM); (6) HIL approval for high/critical. This is **good security engineering** *where it runs*.
- **Residual weaknesses (still valid):** (a) `assess_risk()` defaults **unknown** actions to `"medium"`, and only `high`/`critical` require approval — so an unrecognized action runs without HIL. (b) The whole pipeline is bypassed by the Rust `execute_shell` (F1) and by direct `toolbox.execute()` calls. (c) The deny-list is still finite; AST audit is the real defense.
- **Improvement:** make the supervisor a hard gate inside `Toolbox.execute()`; default unknown actions to require approval (fail safe); route the in-app terminal/code-server through it.

### `security/key_vault.py` + `runtime_config.py` — secret handling (improved, still weak on Windows)
- **Strength:** Fernet at-rest encryption with `enc::` prefix; config writes are atomic (`.tmp` → replace); on Unix the config file/dir get `0600`/`0700`.
- ⟲ **PARTIAL CORRECTION:** `modelConfig.refresh()` reads `providers_with_keys` (a list of provider IDs that have keys) rather than raw keys, so the *status* path no longer echoes secrets. **But** keys still travel **plaintext over IPC** on `updateConfig({api_keys:{...}})`.
- **Risks (still valid):** On **Windows**, `chmod` is skipped (`os.name != 'nt'`) and the **vault key sits beside the ciphertext** (`~/.aether/.vault_key`), so anyone with read access to the profile gets both → encryption is obfuscation, not protection, on the primary platform.
- **Improvement:** OS keychain (Windows DPAPI/Credential Manager, macOS Keychain, libsecret); never send raw keys over IPC (write directly from a privileged path or use a write-only setter); redact in logs.

### `security/self_destruct.py` vs `supervisor/self_destruct.py` — ⚠ duplicated & divergent
- **Finding (debt + risk):** **Two** self-destruct engines with **incompatible APIs**: `security/` uses `DestructLevel{soft_lock,hard_lock,data_wipe,full_destruct}`, PIN+`voice_verified`, countdown, multi-pass secure-erase; `supervisor/` uses `LockLevel{none,soft,hard,wiped}` with `trigger_*` methods and config-driven dead-man. The supervisor `__init__` imports the latter.
- **F8 (Med, still valid):** `security/self_destruct.verify_pin()` returns `True` when **no PIN is set**, and `DATA_WIPE`/`FULL_DESTRUCT` additionally require `voice_verified=True` — but `voice_verified` is just a boolean passed by the caller, and **real voice-print verification is not implemented** (confirmed `main.py:1109`). So with no PIN configured + a caller that passes `voice_verified=True`, destructive wipe is reachable.
- **Improvement:** delete one implementation; require a strong PIN + real MFA; never default-allow when no PIN is set.

### `security/network_firewall.py` (+ supervisor duplicate) — ✅ designed, ❌ unenforced
- **Design strength:** default-DENY, AI-provider allowlist, **exfiltration pattern detection** (pastebin/webhook.site/ngrok/requestbin/burpcollaborator), per-agent glob rules, JSONL audit log.
- **F-NEW-6 (Med):** `firewall.check()` is **never called** before any actual network request. `main.py` instantiates the firewall (`:364`) and exposes `_handle_firewall` for **rule management/stats only**. `web_automation`, `browser_engine`, and `cloud_engine` egress are **not** gated by it. The control exists but provides no protection as wired.
- **Improvement:** call `await firewall.check(url, agent_id)` in `WebAutomation.request`/`download` and in the browser engine before navigation; deny on `BLOCKED_*`.

### `runtime_config.py` — config surface
- Default config is the de-facto **feature-flag registry**: `enable_openclaw:false`, `enable_llm_routing:false`, `require_approval_for_high_risk:true`, `enable_safety_checker:true`, `enable_ast_command_audit:true`, `self_destruct.enabled:false`, `voice.enabled:false`, `agents.default_tool_profile:"full"`, `agents.allow_remote_agent_creation:false`.
- ⚠ `agents.default_tool_profile` defaults to **`"full"`** (no tool restrictions) — combined with messaging/remote input this is permissive; consider `coding` or `minimal` as the default and elevate explicitly.

### `orchestrator.py` — system event bus
- A clean pub/sub `EventBus` + lifecycle manager (`boot`/`shutdown` by priority, health checks). Sits **above** `main.py`. Note: there are effectively **two orchestration layers** (this `KernelOrchestrator` and the `AetherKernel` dispatch loop) — verify which is the live entry point to avoid dead abstraction.

### `auto_reply.py` — message delivery + command registry
- Platform-aware chunking (never splits code blocks/sentences), per-channel rate limit, heartbeat monitor, message templates, and a **70+ slash-command registry** with owner-only flags (`destruct`, `firewall`, `reset`, `reboot`, `api`, `restore`).
- **Gap:** `dispatch_command()` only **looks up** a command; it does not execute it. `main.py:835` logs *"Auto-Reply command detected … executor not implemented — handling as a normal query."* So slash commands are recognized but **not wired to handlers** (the `handler="_cmd_<name>"` names have no implementations). Significant unfinished feature.

### `linux/nexus_orchestrator.py` — ⟲ authenticated REST/WS
- ⟲ **CORRECTION:** the earlier audit said the Linux REST API on :9600 has "no auth observed." In fact it has a **Bearer-token auth middleware** (`NEXUS_API_TOKEN` env or `~/.aether/api_token`), binds to **127.0.0.1 by default** (`NEXUS_BIND_HOST` to expose), supports **optional TLS** (`NEXUS_TLS_CERT/KEY`), and **warns loudly** when unauthenticated. It also has **working crash recovery** (exponential backoff, max 5 retries) — contrasting with the Rust side (F11).
- **Residual risk:** `/health` is public; if an operator sets `NEXUS_BIND_HOST=0.0.0.0` **without** a token, the API is open. The default posture, though, is safe.

### `bridge/openclaw_client.py` — ⚠ no handshake auth
- **F9 (Med):** WebSocket client connects to the OpenClaw gateway and forwards **inbound external messages** (WhatsApp/Discord/etc.) to the kernel. `_send_handshake()` sends only `{client, version}` — the code comment "Handshake / Auth could go here" confirms **no authentication/authorization** of the gateway connection. Inbound remote messages become agent input (prompt-injection + auto-reply surface). `enable_openclaw` defaults **off**, which limits exposure.

### `toolbox/mcp_client_manager.py`
- Connects to external MCP servers over stdio and **registers their tools into the Toolbox** (namespaced `server_tool`). Tools from a malicious/compromised MCP server become callable by agents — trust boundary worth gating with `tool_policy`.

---

# Phase 4 — Architecture Analysis

## 4.1 The hybrid 3-process model

```
┌─────────────────────────────────────────────────────────────────┐
│                      TAURI DESKTOP APP                           │
│  ┌──────────────────────┐  invoke   ┌──────────────────────────┐ │
│  │  React 19 Frontend   │ ────────▶ │   Rust Shell (Tauri v2)  │ │
│  │  (webview)           │ ◀──────── │   - ~25 commands         │ │
│  │  51 components        │  events  │   - ProcessManager       │ │
│  │  StoreContext (1 reducer)        │   - SecurityState (HIL)  │ │
│  │  tauriApi + kernelEventBridge    │   - execute_shell  ⚠F1   │ │
│  └──────────────────────┘           └────────────┬─────────────┘ │
│                                                   │ stdin/stdout   │
│                                      ┌────────────▼─────────────┐ │
│                                      │  Python Kernel (sidecar) │ │
│                                      │  AetherKernel (main.py)  │ │
│                                      │  Brain│Memory│Agents│    │ │
│                                      │  Toolbox│Supervisor│Voice│ │
│                                      └──────┬───────────┬───────┘ │
└────────────────────────────────────────────┼───────────┼─────────┘
                                              │           │
                                     ┌────────▼───┐  ┌────▼─────────┐
                                     │  Ollama    │  │  LanceDB     │
                                     │ :11434     │  │ (file vec)   │   + cloud LLM APIs (optional)
                                     └────────────┘  └──────────────┘   + OpenClaw ws (optional)
```

**Two alternate orchestrators** front the same kernel: the **Rust `ProcessManager`** (desktop) and the **Python `nexus_orchestrator.py`** (Linux service, REST/WS on :9600). A third abstraction (`kernel/orchestrator.py` `KernelOrchestrator`) is a system event bus that may or may not be the live path — verify.

## 4.2 Frontend architecture
- **Framework:** React 19 + Vite 7, no router (single-window OS with an internal window manager: `WindowFrame`, `Dock`, `MainLayout`, default windows registry in `StoreContext`).
- **State:** one large `StoreContext` reducer (Context API) for app/UI/window/conversation state, **plus** a separate tiny external store `modelConfig` (via `useSyncExternalStore`) as the single source of truth for active model/provider/keys across StatusBar/ModuleManager/ProviderManager. Sensible split.
- **IPC:** `tauriApi.ts` (1,287 LOC facade) + `kernelEventBridge.ts` (request/response correlation over fire-and-forget events with per-op timeouts) + `mockTauri.ts` (browser-mode mock/event bridge) + `aiService.ts`. Two paths still coexist (chat vs everything else).
- **UI system:** Tailwind + framer-motion + small `ui/` primitives. `react-markdown` (escapes by default). **No `dangerouslySetInnerHTML` anywhere** (verified) — materially reduces XSS exposure.
- **Reusability:** good primitives; still **two `ErrorBoundary`** (`system/` and `ui/`).

## 4.3 Backend (Rust) architecture
- Thin, idiomatic Tauri v2. Mutex-guarded `ProcessManager`/`SecurityState`; stdout/stderr reader threads. Holds **no business logic** beyond process supervision, IPC framing, and the (well-built) HIL approval store. The one sharp edge is `execute_shell` (F1).

## 4.4 "Database" / persistence architecture
- **No relational DB.** Persistence is file-based:
  - **LanceDB** vector store (tiers 2–3), embeddings via Ollama `nomic-embed-text`, hybrid RRF search.
  - **`~/.aether/config.json`** (runtime config + Fernet-encrypted keys).
  - **`~/.aether/deep_memory.json`** (Tier-4 knowledge graph — full-rewrite persistence, see F-NEW-5).
  - **QMD** markdown files + `_index.json` (Tier-2 structured docs).
  - **`subagents.json`**, **`destruct_state.json`/`destruct_config.json`**, **`firewall_rules.json`/`network_log.jsonl`**, **`agents.json`/`agent_layout.json`**, **`last_session.json`**.
- **Memory tiers:** Working (in-session) / Short-term (LanceDB, 7-day TTL) / Long-term (LanceDB) / Deep (graph). H-MEM tags: `domain`, `category`, `abstraction_level`.

## 4.5 Infrastructure
- **Packaging:** Tauri bundler (`targets: "all"` → MSI/NSIS/AppImage/dmg), WiX MSI config, Windows service installer, PyInstaller (`nexus_kernel.spec` + `build.py`).
- **ISO pipeline:** `linux/build-iso*.sh` (Docker + `mkarchiso`), `mkarchiso` profiles (`archiso-profile/`, `nexus-profile/`), Packer template, `install.sh`/`uninstall.sh`, systemd unit (hardened), D-Bus policy. A built ISO is present (`out/archlinux-2026.02.11-x86_64.iso`).
- **WSL:** `wsl/create-distro.ps1` + `nexus-bridge.py`.
- **CI/CD:** **None** (no `.github/workflows`). All builds are manual scripts.
- **Queues/caching:** in-process only (`QueryCache`); no external broker.
- ⟲ **CORRECTION (debt fixed):** `.gitignore` now excludes `src-tauri/data/`, `src-tauri/check_*.txt`, `.aether/`, `playwright-report/`, `kernel/venv/`. The earlier "committed LanceDB test data / build logs" debt (F12) appears **resolved** on this branch (those paths are no longer tracked).

---

# Phase 5 — Security Audit

> **Overall posture: HIGH RISK for untrusted input / public distribution — but better than a first glance suggests.** The premise (an AI with OS-level control) concentrates risk, and the **single most dangerous gap is the Rust `execute_shell` + filesystem-wide capabilities**, which bypass an otherwise *genuinely layered* Python safety system. The defensive building blocks (multi-layer supervisor with AST audit, HIL with anti-spoof, Fernet vault, default-DENY firewall, tool policy, authenticated Linux API) are real and partly well-built; the problem is **inconsistent enforcement and a few unguarded escape hatches.**

| ID | Finding | Severity | Key files |
|----|---------|----------|-----------|
| F1 | Unrestricted `execute_shell` exposed to frontend; bypasses supervisor + HIL | **Critical** | `src-tauri/src/commands/shell.rs`, `src/services/tauriApi.ts`, `src/components/tools/SystemTerminal.tsx:269` |
| F2 | Tauri capabilities grant FS read/write/mkdir/remove/rename on `**` + `shell:allow-execute/spawn/stdin-write/kill` | **Critical** | `src-tauri/capabilities/default.json` |
| F3 | CSP allows `'unsafe-inline'` + `'unsafe-eval'` (defense-in-depth weakened) | **High** | `src-tauri/tauri.conf.json:27` |
| F-NEW-1 | `FileManager` protected-path guard only blocks exact root; subpaths of `C:\Windows`,`/etc`,`/boot` are writable/deletable | **High** | `kernel/toolbox/file_manager.py:64` |
| F-NEW-2 | SSRF / unrestricted agent egress — `WebAutomation` fetches any URL; firewall not invoked | **High** | `kernel/toolbox/web_automation.py`, `kernel/security/network_firewall.py` |
| F4 | Supervisor not enforced on all paths; unknown actions default to `medium` (no HIL); `toolbox.execute()` ungated | **High** | `kernel/supervisor/__init__.py`, `kernel/toolbox/__init__.py`, `safety_checker.py:assess_risk` |
| F5 | Installer sets hardcoded `nexus:nexus`, adds user to `wheel`; Ollama via `curl\|sh` | **High** | `nexus-app/linux/install.sh:76,78,127` |
| F6 | API keys: no real protection on Windows (key beside ciphertext, no ACL); keys sent plaintext over IPC on update | **High** | `kernel/security/key_vault.py`, `kernel/runtime_config.py` |
| F7 | Prompt-injection → tool execution; web/messaging/indexed content feeds LLM; system prompt grants "Administrator access" | **High** | `kernel/main.py` (`_get_system_prompt`), `agents/*`, `toolbox/web_automation.py` |
| F-NEW-6 | NetworkFirewall built but **never enforced** on requests (false sense of protection) | **Medium** | `kernel/security/network_firewall.py`, `kernel/main.py` |
| F-NEW-3 | LanceDB filter/predicate injection via f-string interpolation of `domain/category/id` | **Medium** | `kernel/memory/lancedb_store.py` |
| F8 | Self-destruct reachable with weak auth: PIN optional (passes if unset), voice "verification" unimplemented; **two** divergent engines | **Medium** | `kernel/security/self_destruct.py:120`, `kernel/main.py:1109`, `kernel/supervisor/self_destruct.py` |
| F9 | OpenClaw inbound bridge: no handshake auth; remote messages auto-replied by LLM | **Medium** | `kernel/bridge/openclaw_client.py:82` |
| F10 | Supply chain: `curl\|sh` install, no SBOM, no `pip-audit`/`cargo audit`/`npm audit`, broad version ranges in `requirements.txt` | **Medium** | `linux/install.sh`, `kernel/requirements.txt` |
| F11 | Rust crash-recovery dead code (Linux orchestrator recovers; Rust desktop path may not) | **Low/Med** | `src-tauri/src/orchestrator/process_manager.rs` |
| F-NEW-7 | MCP client registers external server tools into the Toolbox with no policy gate | **Low/Med** | `kernel/toolbox/mcp_client_manager.py` |

### F1 — Unrestricted shell execution (Critical)
`src-tauri/src/commands/shell.rs::execute_shell(command, cwd, detached)` runs any string via `cmd /C`/`sh -c` with the user's privileges, optionally detached, with a hidden window on Windows. It is invoked from `SystemTerminal.tsx` (`kernelApi.executeShell(cmd, path)`, the terminal's *default* case) and `codeServerService.ts`. It does **not** pass through the Python supervisor, AST audit, or HIL. Combined with F2/F3 any webview compromise → full host RCE. **Fix:** route all shell through the kernel supervisor + HIL, or replace free-form shell with an allow-listed command set; if a raw terminal is required, isolate it behind a dedicated, explicitly user-consented capability with no agent access.

### F2 — Over-broad Tauri capabilities (Critical)
`capabilities/default.json` grants `fs:allow-{read-text-file,read-dir,write-text-file,mkdir,remove,rename,exists}` on `{"path":"**"}` (entire filesystem) plus `shell:allow-execute/spawn/stdin-write/kill`. The webview can read/write/delete any user file. **Fix:** scope FS to workspace/data dirs; remove `shell:allow-execute/spawn` from the default window capability; gate behind a separate, user-approved capability.

### F3 — CSP `unsafe-eval`/`unsafe-inline` (High, but lower exploitability than feared)
The CSP allows inline scripts and eval. ⟲ **Context:** there is **no `dangerouslySetInnerHTML`** in the frontend and Markdown is rendered via `react-markdown` (escapes by default), so a reflected-XSS path is not obvious today. Still, `unsafe-eval` removes a key barrier; if any dependency or future feature introduces HTML injection, F1/F2 make it host RCE. **Fix:** drop `unsafe-eval`; eliminate inline scripts (nonces/hashes); keep sanitizing all LLM/remote content.

### F-NEW-1 — Protected-path bypass (High)
See Phase 3. `FileManager` only blocks operating on the *exact* protected root; subpaths are fully writable/deletable. An autonomous or injected agent can delete/overwrite `C:\Windows\System32\*` or `/etc/*` via the kernel file tools. **Fix:** treat any path under a protected root as protected for write/delete/move.

### F-NEW-2 — SSRF / egress (High)
`WebAutomation` and the browser engine reach arbitrary URLs with no firewall. Internal services and cloud metadata endpoints are reachable; exfil is unblocked. **Fix:** enforce `NetworkFirewall.check()` (it already detects exfil patterns) on every outbound request and browser navigation; block link-local/loopback/private ranges by default.

### F4 — Inconsistent supervisor enforcement (High)
The supervisor is strong *when invoked* (WorkerAgent, kernel command handler), but `Toolbox.execute()` itself is ungated and unknown actions default to `medium` (no approval). **Fix:** hard-gate `Toolbox.execute()`; default unknown/unclassified actions to require approval (fail safe).

### F5 — Insecure installer defaults (High)
`install.sh` creates `nexus` in group `wheel`, sets password `nexus`, prints "Login: nexus / nexus", and installs Ollama via `curl … | sh`. The systemd unit is otherwise well-hardened (`NoNewPrivileges`, `ProtectSystem=strict`, scoped `ReadWritePaths`, `MemoryMax=8G`) — but the weak sudo-capable account undermines it. **Fix:** force first-boot password set; do not add the service account to `wheel`; pin/verify the Ollama installer (checksum) or package it.

### F6 — Secret handling (High on Windows)
Fernet-at-rest is defeated on Windows (no ACL, key beside ciphertext). Keys still cross IPC in plaintext on update. ⟲ The status/refresh path no longer echoes raw keys (returns `providers_with_keys`). **Fix:** OS keychain integration; write-only key setter; redact in logs.

### F7 — Prompt injection → action (High)
Inbound messages, scraped pages, and indexed documents feed the LLM, which can call tools. The kernel system prompt asserts administrator rights. `intent_parser.py` mitigates injection for *its* prompts, but the agent/system-prompt and ingestion paths do not. **Fix:** strict data/instruction separation everywhere; require HIL for all state-changing tool calls regardless of `auto_approve`; constrain default tool profile away from `full`.

(F8–F11, F-NEW-3/6/7 detailed in Phase 3 and the table.)

---

# Phase 6 — Performance Audit

| Area | Finding | Impact | Recommendation |
|---|---|---|---|
| **Deep-memory persistence** | `deep_memory._persist()` rewrites the whole graph JSON on every mutation; `batch_ingest` is O(n²) I/O (F-NEW-5). | High on import | Debounce/batch persistence; move to SQLite. |
| **Pseudo-query full scans** | `document_indexer`/`self_learning` use `search(query="*", limit=10000)` then filter in Python; embeds a meaningless `"*"`; N+1 deletes. | Med/High at scale | Add a real list/scan API to the store; delete by predicate. |
| **IPC concurrency** | `main.py`'s `run()` loop processes stdin messages; a long `task`/`index_directory` can stall other messages unless dispatched concurrently. (Manager *steps* run in parallel, but the kernel message loop is the gate.) | High (UX freezes) | Dispatch each message to `asyncio.create_task`; ordered response writer. |
| **Model thrash** | Per-request model switching forces Ollama reloads. ⟲ Now **off by default** (`enable_llm_routing:false`); risk only if enabled. | Low (opt-in) | Keep off / keep models warm (`keep_alive` already set). |
| **Query cache key** | Keyed on (model, temp, prompt) only — ignores RAG context; can serve stale answers. | Low/Med | Include context hash; bypass for time-sensitive queries. |
| **Synchronous embed-on-store** | Each memory write embeds synchronously in the request path. | Medium | Batch/async write-behind. |
| **Frontend bundle** | Monaco + framer-motion + full lucide + react-markdown; no obvious code-splitting. | Medium | Lazy-load Monaco/heavy tools; tree-shake icons. |
| **Zero-vector fallback** | Embedding failure returns a 384-dim zero vector (model is 768-dim) → degraded/incorrect search (F-NEW-4). | Low/Med | Match dim to model; surface failures. |

---

# Phase 7 — Scalability Assessment

Nexus is a **single-user, single-machine desktop product**; "scalability" means responsiveness and resource ceilings, not horizontal scale.

- **Single kernel process + stdin pipe** is the primary throughput gate; long operations degrade the session unless the message loop is made concurrent.
- **Memory growth:** LanceDB tiers have config caps (`max_tier2_entries:50k`, `tier3:500k`) but enforcement isn't verified; the **knowledge graph is one in-memory JSON file** (won't scale to large graphs; O(n²) persistence compounds this).
- **Statelessness:** all runtime state is in-process/JSON; subagent registry has crash-recovery persistence (good), but kernel-wide crash recovery is non-functional in the Rust path (works in the Linux orchestrator).
- **Linux REST/WS** is single-instance, localhost-by-default, token-authed — fine for one operator, not multi-client.
- **Expected capacity:** comfortable for one user with up to `max_subagents:5`; the local LLM (Ollama on one GPU/CPU) is the hard throughput ceiling.

---

# Phase 8 — Code Quality Review

| Dimension | Rating /10 | Notes |
|---|---|---|
| Readability | 7.5 | Clear naming, generous docstrings, consistent per-language style. |
| Maintainability | 5.5 | `main.py` god-object (2,919 LOC, ~40 handlers, stale "defined above ~958" comments); duplicate `security/` vs `supervisor/` modules; two intent routers; two IPC paths. |
| Testability | 4.5 | Kernel tightly coupled in `__init__`; handlers hard to unit-test; subsystems individually testable. |
| Modularity | 6.5 | Good package boundaries; undermined by duplication + central dispatcher. |
| Coupling | 5.5 | `AetherKernel` couples to ~20 subsystems; agents `print()` events directly. |
| Cohesion | 7.5 | Individual modules are focused and purposeful. |
| Error handling | 5.5 | Pervasive broad `except Exception` that swallows/`print`s; resilient but opaque. |
| Logging | 5 | Mixed: most kernel subsystems use `logging.getLogger(...)` properly; **`main.py` uses `print(..., file=sys.stderr)` with emojis** and no logger. ⟲ The earlier "undefined `logger` in `_handle_browser`" NameError appears **fixed** (no `logger.` references remain in `main.py`). |
| Documentation | 7.5 | Strong design docs; overstate completion in places (§11). |
| Test coverage | 3.5 | ~11 pytest files + 8 ad-hoc "phase" scripts + **1** Playwright spec; **no Rust tests, no frontend unit tests, no CI**. |
| **Overall** | **6.0/10** | Higher than a surface read suggests — the security subsystems and several utilities are well-built; execution is uneven (god object, duplication, no CI). |

---

# Phase 9 — Technical Debt

| Debt | Evidence | Effort |
|---|---|---|
| **God object** `main.py` (2,919 LOC, ~40 handlers) | `kernel/main.py`; stale "defined above lines ~958" comment at `:1440` | L (3–5 d) — handler registry |
| **Duplicate security modules** | `security/{self_destruct,network_firewall,intent_dispatcher}.py` ≈ `supervisor/{...}.py` (divergent APIs!) | M (2–3 d) — consolidate |
| **Two intent→model routers** | `brain/model_router.py` vs `memory/context_scheduler.py` (different model maps) | M |
| **Two IPC/bridge paths** | `aiService`→`mockTauri` vs `kernelEventBridge` | M |
| **`print`-logging in `main.py`** | no `logging` in the 2,919-LOC entry point | S |
| **Unenforced firewall** | `firewall.check` never called on requests (F-NEW-6) | S/M — wire it |
| **Supervisor not gating `toolbox.execute`** | `toolbox/__init__.py` | M |
| **Slash-command executor missing** | `auto_reply.py` `handler="_cmd_*"` unimplemented; `main.py:835` | M |
| **Crash recovery (Rust) unwired** | `process_manager.rs` (F11) | M |
| **Two `ErrorBoundary`** | `components/system/` & `components/ui/` | S |
| **Ad-hoc root test scripts** | `test_phase{1,2,4,5,6}*.py`, `test_wiring_audit.py`, `verify_gaps.py` | M — fold into pytest + CI |
| **Scaffolding marked done** | NPU/eBPF/federated/A2A placeholders (Phase 10) | L |
| **No CI/CD, no lint/format/type gate** | repo-wide | M |
| ~~Committed artifacts (LanceDB/check logs)~~ | ⟲ **Resolved** — now in `.gitignore` | — |

---

# Phase 10 — Missing Features & Gaps

- **Slash-command execution:** 70+ commands are registered (`auto_reply.py`) but **not executed** — recognized then handled as a normal query (`main.py:835`).
- **Voice-print verification:** not implemented (`main.py:1109`); `voice_verified` is an unchecked boolean used to gate destructive wipes (F8).
- **NetworkFirewall enforcement:** built but not invoked (F-NEW-6).
- **Hardware acceleration (NPU/GPU):** `hardware/npu_accelerator.py`, `federated_learner.py`, `ebpf_monitor.py` are **placeholders** ("This is a placeholder for…").
- **Cross-device sync / A2A:** `sync/a2a_protocol.py`, `sync/memory_sync.py` present but **stubbed** ("Placeholder: In production, query LanceDB…").
- **Frontend `aiService.summarize()`:** TODO stub.
- **Kernel auto-restart (Rust):** non-functional (F11); the Linux orchestrator's recovery works.
- **Auth/accounts/licensing/telemetry/billing:** none — required before any commercial launch.
- **Operational gaps:** no CI, no crash reporting, no update channel beyond the bundler, structured logging only partial, no metrics.

---

# Phase 11 — Repository Intelligence (hidden capabilities, flags, abandoned work)

- **Feature flags (config-driven, mostly OFF by default):** `enable_openclaw`, `enable_llm_routing`, `self_destruct.enabled`, `voice.enabled`, `voice.ambient_mode`, `agents.allow_remote_agent_creation`. Several gate substantial behavior; `agents.default_tool_profile:"full"` is a notable *permissive* default.
- **Optional subsystems via `try/except ImportError`:** NPU, federated learning, skills, Docker sandbox, plugins, OpenClaw, voice, QMD, auto-reply, cron, Playwright/CDP browsers, MCP. The app **silently degrades** if deps are missing — installed capability varies widely.
- **"GAP" nomenclature:** code references an internal punch-list (e.g., "Auto-Reply Engine (GAP 9)"); `verify_gaps.py` and `test_phase*.py` enumerate it.
- **Hidden/secondary surfaces:** Linux **REST/WS orchestrator (:9600, token-authed)**, **MCP server** (`mcp_server.py`, exposes Nexus tools to *other* agents), **eBPF monitor**, **federated learner**, **ClawHub skill adapter**, **Docker sandbox**, **D-Bus service**.
- **Self-destruct / data-wipe** (dual-implemented, divergent) — destructive capability reachable from the UI.
- **Vendored third-party on disk (untracked):** `openclaw/` is the full upstream **OpenClaw** OSS monorepo (TS/pnpm, MIT) — the messaging gateway Nexus integrates with; `cloned_repo/` is the original **Google AI Studio** React starter (the prototype "seed"). Neither is part of the git project but both ship on disk in this working tree.
- **Doc/reality drift:** `frontend-status.txt` ("SUCCESS — robust and ready"), `docs/architecture_audit_updated.md` (mostly ✅), and the README's "no cloud dependency" overstate readiness relative to the findings here.
- **TODO/FIXME/placeholder density:** concentrated in `hardware/*`, `sync/*`, `auto_reply`/`main.py` (command executor), `dbus_service.py` (stub fallback class).

---

# Phase 12 — Executive Summary

### What this application is
Nexus (a.k.a. Aether) Hybrid AIOS is an **ambitious local-first "AI operating system"** — a polished cyberpunk React desktop shell over a thin Rust process-supervisor, driving a large Python "reasoning kernel" that runs multi-agent tasks, controls the host (shell, files, browser), speaks/listens, and bridges to external chat platforms. It ships both as a Tauri desktop app and as a bootable Arch Linux ISO.

### What it currently does (working today)
Local + cloud LLM chat with RAG and 4-tier memory (Ollama/LanceDB/knowledge graph/QMD), a multi-agent task system with **parallel dependency-wave execution** and **fail-closed human-in-the-loop approval**, a genuinely **multi-layer safety supervisor** (regex + AST audit + tool policy + intent alignment), voice pipeline, browser automation, cron, an MCP client/server, an in-app terminal/file-manager/code-editor/web-browser, and an external-messaging bridge. A token-authenticated Linux REST/WS service mirrors the desktop shell.

### Key strengths
- **Impressive, cohesive scope** for the size; the hybrid 3-process architecture is sound and clearly layered.
- **Security subsystems are real and partly well-built:** AST command audit, HIL with anti-spoof/duplicate guards, Fernet vault, default-DENY firewall *design*, tool-policy engine, authenticated Linux API, prompt-injection-aware intent parsing, fail-closed worker.
- **Strong UX/design** and a thoughtful frontend IPC bridge with timeouts and graceful degradation.
- **Good design documentation** and mostly clean, well-documented Python modules.

### Key weaknesses
- **A few unguarded escape hatches undermine an otherwise layered model:** raw `execute_shell`, filesystem-wide capabilities, a protected-path guard that doesn't guard subpaths, and a firewall that's never enforced.
- **Inconsistent enforcement:** the supervisor protects the agent path but not direct `toolbox.execute()` or the Rust shell.
- **Overstated completeness:** slash-command executor, NPU/federated/A2A, and firewall enforcement are stubs/unwired despite docs implying done.
- **Prototype-grade rigor at product-grade ambition:** god-object kernel, duplicate modules, `print`-logging in `main.py`, thin tests, no CI.

### Security posture
**High risk for untrusted input / public distribution**, driven primarily by F1/F2 (shell + filesystem) and the unenforced/partial controls (F4, F-NEW-1/2/6). The good news: remediation is well-scoped and the defensive primitives already exist — most fixes are *wiring and scoping* rather than building from scratch.

### Performance posture
**Good for single-user light use; degrades** on long/agentic/indexing tasks (kernel message loop) and on large knowledge-graph imports (O(n²) persistence). Model thrash is no longer a default concern.

### Scalability readiness
**By design single-user/single-host.** In-process state, JSON knowledge graph, and the serialized message loop cap "many agents / large corpus" scenarios.

### Development quality score
**6.0 / 10** — higher than a surface read implies because the security subsystems and several utilities are well-engineered; held back by the god object, duplication, missing CI, and unfinished/unwired features. With the Top-20 addressed it could reach **8**.

### Business potential
**Real and differentiated** — a private, agentic "AI OS" is a compelling niche; the ISO is a strong demo asset. To commercialize: close the F1/F2 escape hatches, enforce the firewall and supervisor uniformly, correct the "local-only" messaging, finish the stubbed features (or stop advertising them), harden the installer, and add accounts/licensing/telemetry and CI.

---

## Top 20 Highest-Priority Improvements (ranked by impact)

| # | Improvement | Finding | Sev/Impact | Effort |
|---|---|---|---|---|
| 1 | Remove/replace unrestricted `execute_shell`; route all shell through supervisor + HIL or an allow-list | F1 | Critical | M |
| 2 | Scope Tauri FS capabilities off `**`; remove default `shell:allow-execute/spawn` | F2 | Critical | S |
| 3 | Fix `FileManager` protected-path guard to cover subpaths for write/delete/move | F-NEW-1 | High | S |
| 4 | Enforce `NetworkFirewall.check()` on all agent egress + browser navigation; block loopback/link-local/private by default | F-NEW-2, F-NEW-6 | High | M |
| 5 | Make the supervisor a **hard gate inside `Toolbox.execute()`**; default unknown actions to require approval (fail safe) | F4 | High | M |
| 6 | Fix insecure installer defaults (no `nexus:nexus`, no `wheel`, forced password set, pinned/verified Ollama install) | F5 | High | S |
| 7 | Proper secret storage (DPAPI/Keychain/libsecret); write-only key setter; never echo/log keys | F6 | High | M |
| 8 | Require HIL for **all** state-changing tool calls; default tool profile → `coding`/`minimal`; separate data vs instructions everywhere | F7 | High | M |
| 9 | Tighten CSP — drop `unsafe-eval`/`unsafe-inline`; keep sanitizing LLM/remote content | F3 | High | M |
| 10 | Make kernel message loop concurrent (task per message, ordered writer) to stop UI freezes | §6/§7 | High | M |
| 11 | Parameterize LanceDB filters (fix predicate injection); fix embedding zero-vector dim | F-NEW-3, F-NEW-4 | Med | S |
| 12 | Batch/debounce `deep_memory` persistence (or move to SQLite); add a real list API to the store | §6 (F-NEW-5) | Med | M |
| 13 | Consolidate the two self-destruct engines; require strong PIN + real MFA; never default-allow when no PIN | F8 | Med | M |
| 14 | Authenticate the OpenClaw handshake; treat inbound external messages as untrusted | F9 | Med | S |
| 15 | Add CI/CD: lint, type-check, `cargo test`, pytest, Playwright, `pip-audit`/`cargo audit`/`npm audit` + SBOM | §8/§9, F10 | High | M |
| 16 | Implement or remove the 70+ slash-command executor (currently recognized but unhandled) | §10 | Med | M |
| 17 | Wire (or remove) Rust crash recovery; mirror the Linux orchestrator's backoff supervisor | F11 | Med | M |
| 18 | Refactor `main.py` god object into a handler registry; add `logging` (levels/structured) | §8/§9 | Med | L |
| 19 | Consolidate duplicate modules (security/ vs supervisor/, two intent routers, two IPC paths, two ErrorBoundary) | §9 | Med | M |
| 20 | Correct "local-only" claims (or implement an enforced offline mode); finish or stop advertising NPU/federated/A2A stubs | §2/§10 | Med | L |

---

# 13. Audit methodology & coverage statement

- **Inventory:** 100% of tracked files enumerated (`git ls-files`, 284 files) and every directory's purpose documented. Untracked dirs (`openclaw/`, `cloned_repo/`, build/ISO scratch) identified and classified.
- **Read in full (line-by-line), ~40 files including:** kernel `brain/{cloud_engine,llm_engine,model_router,intent_parser,intent_dispatcher,compaction,query_cache,planner}.py`; `memory/{memory_manager,lancedb_store,deep_memory,document_indexer,rag_engine,context_scheduler,qmd_manager,self_learning}.py`; `agents/{manager_agent,worker_agent,subagent_registry,agent_persistence}.py`; `toolbox/{__init__,shell_executor,file_manager,web_automation,mcp_client_manager}.py`; `supervisor/{__init__,safety_checker,ast_audit,tool_policy,intent_validator}.py`; `security/{key_vault,self_destruct,network_firewall}.py` + `supervisor/self_destruct.py`; `runtime_config.py`, `orchestrator.py`, `auto_reply.py`, `bridge/openclaw_client.py`, `linux/nexus_orchestrator.py`; Rust `commands/shell.rs`, `capabilities/default.json`, `tauri.conf.json`; frontend `services/modelConfig.ts`, `context/StoreContext.tsx` (head); `linux/install.sh`; `package.json`, `requirements.txt`, `.gitignore`, README, prior `AUDIT_REPORT.md`.
- **Searched repo-wide (verified, not fully read):** firewall/`supervisor.validate`/`toolbox.execute` call sites; `logging`/`logger` usage in `main.py`; TODO/FIXME/placeholder/stub density; `dangerouslySetInnerHTML`/`eval`/`invoke` in the frontend; cloud-provider support; main.py supervisor-gating and self-destruct/voice-print sites.
- **Sampled / inferred from interfaces & names (lower confidence):** the remaining ~30 kernel modules (agents specialists, `toolbox/{browser_engine,cdp_browser_engine,media_pipeline,notification_tools}`, `voice/*`, `hardware/*`, `skills/*`, `sync/*`, `linux/{daemon,dbus_service}`, `cron_service`, `plugin_system`, `mcp_server`, `health_monitor`, `ipc_bridge`, `aether_cli`, `channel_router`, `security/intent_dispatcher`) and most of the 51 React components beyond services/store and the security-relevant ones. Claims resting on naming/interface are marked *(inferred)*.
- **Corrections to the prior audit (this branch):** default `ai_provider` is `ollama` (not `auto`); the `main.py` `logger` NameError appears fixed; the Linux REST API is token-authenticated and localhost-bound (not "no auth"); the Linux orchestrator has working crash recovery; the supervisor is a real multi-layer pipeline (not merely an advisory deny-list); `ManagerAgent` runs steps in parallel waves; `WorkerAgent` fails closed; committed LanceDB/check artifacts are now git-ignored. New findings added: F-NEW-1 (protected-path bypass), F-NEW-2 (SSRF), F-NEW-3 (LanceDB filter injection), F-NEW-4 (embedding dim), F-NEW-5 (O(n²) graph persistence), F-NEW-6 (firewall unenforced), F-NEW-7 (MCP tool trust).
- **Not executed:** no build/run/test was performed; findings are static-analysis based. Recommended next step: run `cargo test`, `pytest`, `npm run test:e2e`, and dependency scans (`cargo audit`, `pip-audit`, `npm audit`) to complement this review.

*End of report.*
