# Nexus / Aether Hybrid AIOS — Remediation & Hardening Plan

> **Derived from:** `AUDIT_REPORT.md` (v2 deep pass, 2026-06-01)
> **Repo:** `O:\CYBERPUNK\nexus-ag` — branch `feature/model-provider-management`
> **Owner:** _TBD_ · **Last updated:** 2026-06-01
> **Goal:** Close the security escape hatches that undermine an otherwise-layered safety model, finish or retire half-built features, and put the project on a CI-backed, releasable footing.

---

## How to use this plan

- Work top-down by **milestone**. M0 → M1 are release-blocking; M2–M4 are quality/scale.
- Each task has: **Problem → Fix → Files → Acceptance criteria → Effort** (S ≤1d, M 2–3d, L 3–5d).
- **Effort totals:** M0 ≈ 8–10 d · M1 ≈ 9–13 d · M2 ≈ 8–12 d · M3 ≈ 10–15 d · M4 ≈ ongoing.
- A task is **Done** only when its acceptance criteria pass **and** a regression test exists (where testable).
- IDs map back to the audit (`F1`, `F-NEW-2`, `§6`, etc.).

### Status legend
`[ ]` not started · `[~]` in progress · `[x]` done · `[-]` won't do / deferred

---

## Milestone overview & sequencing

```
M0  Security escape hatches      (RELEASE BLOCKER)  ──┐
                                                      ├─▶ M1  Enforcement + secrets + installer  ──┐
M4  CI/CD + test harness  ──────────────────────────┘                                              ├─▶ Release-ready
                                                                                                    │
M2  Correctness / perf / dedup  ────────────────────────────────────────────────────────────────┘
M3  Finish-or-retire features + refactors  (post-hardening)
```

- **Start M4 (CI) in parallel immediately** — every other fix needs a test gate to prove it and prevent regressions.
- M0 and M1 are the gate for any public/production distribution.
- M2/M3 can proceed once M0/M1 land.

---

# Milestone M0 — Security escape hatches (RELEASE BLOCKER)

> These four undo the otherwise-layered safety model. Nothing ships publicly until they're closed.

### M0-1 · Remove/replace unrestricted `execute_shell` `[ ]`  — Sev: Critical · Effort: M
- **Problem (F1):** `execute_shell` runs any string via `cmd /C`/`sh -c` with full user privileges, bypassing the Python supervisor, AST audit, and HIL. Reachable from the in-app terminal (default case) and code-server.
- **Fix:**
  1. Route **all** shell execution through the kernel: frontend → `send_to_kernel({type:"command"})` → `AetherKernel` → `supervisor.validate()` → `toolbox.shell` (which is supervisor-gated). Delete the direct Rust `execute_shell` command, or gate it behind an allow-listed command set.
  2. If a raw interactive terminal is a hard product requirement, isolate it behind a **separate Tauri capability** that is (a) not granted to the default window, (b) requires explicit per-session user consent, and (c) is **not** callable by agents.
- **Files:** `src-tauri/src/commands/shell.rs`, `src-tauri/src/lib.rs` (command registration), `src/services/tauriApi.ts` (`executeShell`), `src/components/tools/SystemTerminal.tsx:269`, `src/services/codeServerService.ts`.
- **Acceptance:** No frontend path can execute an arbitrary shell string without traversing the supervisor; terminal commands appear in the audit log; a blocked pattern (e.g. `rm -rf /`) is denied end-to-end; regression test asserts denial.

### M0-2 · Scope Tauri capabilities `[ ]`  — Sev: Critical · Effort: S
- **Problem (F2):** `capabilities/default.json` grants `fs:allow-{read-text-file,read-dir,write-text-file,mkdir,remove,rename,exists}` on `{"path":"**"}` and `shell:allow-execute/spawn/stdin-write/kill`.
- **Fix:**
  1. Replace `**` with scoped paths (workspace dir, `$APPDATA/aether`, `$HOME/.aether`, temp). Use Tauri path scopes / `$` variables.
  2. Remove `shell:allow-execute` and `shell:allow-spawn` from the default window capability; keep only `shell:allow-open` if needed. Move any required exec into the M0-1 isolated capability.
- **Files:** `src-tauri/capabilities/default.json` (+ any new `capabilities/terminal.json`).
- **Acceptance:** Reading/writing/deleting a path outside the allowed scopes fails with a capability error; webview can no longer `shell:execute` by default.

### M0-3 · Fix `FileManager` protected-path guard `[ ]`  — Sev: High · Effort: S
- **Problem (F-NEW-1):** `_validate_path` only raises when the resolved path **equals** a protected root, so `C:\Windows\System32\*`, `/etc/*`, `/boot/*` are writable/deletable.
- **Fix:** For `write`/`delete`/`move`/`create_dir`, block when `resolved == protected` **or** any `protected` is a parent of `resolved` (use `Path` `is_relative_to` / `os.path.commonpath`). Optionally allow reads under protected roots.
- **Files:** `kernel/toolbox/file_manager.py` (`_validate_path`, `PROTECTED_PATHS`).
- **Acceptance:** Unit tests prove `delete("/etc/hosts")`, `write("C:\\Windows\\System32\\x")` raise `PermissionError`; legitimate workspace writes still succeed.

### M0-4 · Enforce the NetworkFirewall on all egress `[ ]`  — Sev: High · Effort: M
- **Problem (F-NEW-2, F-NEW-6):** `WebAutomation`/browser/`cloud_engine` issue raw requests; `NetworkFirewall.check()` is never called → SSRF (localhost, `169.254.169.254`, exfil) wide open despite a default-DENY design existing.
- **Fix:**
  1. Inject the single firewall instance into `Toolbox`/`WebAutomation`/`BrowserEngine`; call `await firewall.check(url, agent_id)` before every request/navigation; deny on `BLOCKED_*`/`DENIED`.
  2. Add default rules denying loopback, link-local (`169.254.0.0/16`), and RFC1918 ranges unless explicitly allow-listed.
  3. Decide whether LLM provider egress is firewall-gated (it should be, via the default AI-provider allowlist).
  4. Remove the duplicate `supervisor/network_firewall.py` (keep one — see M2-5).
- **Files:** `kernel/toolbox/web_automation.py`, `kernel/toolbox/browser_engine.py`, `kernel/toolbox/cdp_browser_engine.py`, `kernel/security/network_firewall.py`, `kernel/main.py` (wire single instance), `kernel/brain/cloud_engine.py` (optional).
- **Acceptance:** A fetch to `http://169.254.169.254/` or `http://localhost:9600/` is blocked and logged; an allow-listed provider call succeeds; test asserts both.

---

# Milestone M1 — Uniform enforcement, secrets, installer (RELEASE BLOCKER)

### M1-1 · Hard-gate the supervisor inside `Toolbox.execute()` `[ ]`  — Sev: High · Effort: M
- **Problem (F4):** Only `WorkerAgent` and the kernel command handler call the supervisor; direct `toolbox.execute()` calls are ungated. Unknown actions default to risk `medium` → no HIL.
- **Fix:**
  1. Move supervisor validation into `Toolbox.execute()` (or a thin wrapper all callers use), so every tool invocation is validated by construction.
  2. Change `SafetyChecker.assess_risk()` default for **unclassified** actions from `medium` to a level that **requires approval** (fail safe), or add an explicit "unknown ⇒ require_approval" rule in the supervisor.
- **Files:** `kernel/toolbox/__init__.py`, `kernel/supervisor/__init__.py`, `kernel/supervisor/safety_checker.py`.
- **Acceptance:** An unrecognized destructive action triggers HIL rather than executing silently; all `toolbox.execute` paths log a validation entry; tests cover gated + ungated callers.

### M1-2 · Require HIL for all state-changing tools; tighten default tool profile `[ ]`  — Sev: High · Effort: M
- **Problem (F7):** Default `agents.default_tool_profile:"full"` (no restrictions) + remote/messaging input + a system prompt that asserts "Administrator access."
- **Fix:**
  1. Default tool profile → `coding` (or `minimal` for remote/messaging-originated sessions); elevate to `full` only on explicit owner action.
  2. Require HIL for all state-changing tool calls regardless of `auto_approve` for sessions originating from untrusted channels.
  3. Revise the kernel system prompt to remove blanket "Administrator access granted"; keep capabilities behind the supervisor.
- **Files:** `kernel/runtime_config.py` (`agents.default_tool_profile`), `kernel/main.py` (`_get_system_prompt`, channel-message path), `kernel/supervisor/tool_policy.py`.
- **Acceptance:** A messaging-originated request cannot run owner-only/`full` tools; system prompt no longer claims admin rights; tests assert profile downgrade for remote sessions.

### M1-3 · Proper secret storage `[ ]`  — Sev: High · Effort: M
- **Problem (F6):** On Windows the Fernet key sits beside the ciphertext with no ACL; API keys cross IPC in plaintext on update.
- **Fix:**
  1. Use OS-native secret stores: Windows DPAPI / Credential Manager, macOS Keychain, libsecret on Linux (fallback to current Fernet only if unavailable).
  2. Replace the `updateConfig({api_keys})` round-trip with a **write-only** key setter command that never returns key material; the status path already returns only `providers_with_keys`.
  3. Redact key-like values in all logs.
- **Files:** `kernel/security/key_vault.py`, `kernel/runtime_config.py`, `kernel/main.py` (`_handle_update_config` / new `set_api_key`), `src/services/modelConfig.ts` (`saveKey`), `src/services/tauriApi.ts`.
- **Acceptance:** On Windows, keys are not recoverable from `~/.aether` files alone; no command response or log line contains a raw key; existing keys migrate transparently.

### M1-4 · Harden the installer `[ ]`  — Sev: High · Effort: S
- **Problem (F5):** `useradd -G wheel`, `echo "nexus:nexus" | chpasswd`, prints credentials; Ollama via `curl … | sh`.
- **Fix:**
  1. Remove the hardcoded password; create a locked account and force a password set on first login (`passwd -e` / `chage -d 0`), or use a systemd `DynamicUser`.
  2. Drop `wheel` from the service account's groups (the systemd unit already runs hardened — keep `NoNewPrivileges`/`ProtectSystem=strict`).
  3. Pin + verify the Ollama installer (download, checksum, then run) or install from the distro package where available.
- **Files:** `nexus-app/linux/install.sh` (steps 1 & 3), related ISO profile scripts if they duplicate this.
- **Acceptance:** Fresh install yields no default-credential login and no sudo-capable service account; Ollama install verifies integrity; uninstall still works.

### M1-5 · Tighten CSP `[ ]`  — Sev: High · Effort: M
- **Problem (F3):** CSP allows `'unsafe-inline'` + `'unsafe-eval'`. (Exploitability is currently lower — no `dangerouslySetInnerHTML`, Markdown via `react-markdown` — but it removes a key barrier given F1/F2.)
- **Fix:** Remove `'unsafe-eval'`; eliminate inline scripts (use nonces/hashes or move inline styles to CSS). Verify Monaco/Vite don't require eval in production build; if Monaco needs workers, keep `worker-src 'self' blob:` only.
- **Files:** `src-tauri/tauri.conf.json` (`app.security.csp`), `vite.config.ts`, any inline `<script>`/`style` usage.
- **Acceptance:** App builds and runs with no `unsafe-eval`; no CSP violations in the console for core flows (chat, terminal, editor, browser tool).

### M1-6 · Authenticate the OpenClaw bridge `[ ]`  — Sev: Med · Effort: S
- **Problem (F9):** WebSocket handshake sends only `{client,version}` — no auth; inbound external messages become agent input.
- **Fix:** Add a shared-secret/token handshake (env or `~/.aether/openclaw_token`); reject the connection if the gateway doesn't authenticate. Treat all inbound channel messages as untrusted (feeds M1-2 profile downgrade).
- **Files:** `kernel/bridge/openclaw_client.py` (`_send_handshake`, `connect`), `kernel/bridge/channel_router.py`, `kernel/runtime_config.py`.
- **Acceptance:** Connection without a valid token is refused; inbound messages run under a restricted tool profile; `enable_openclaw` remains opt-in.

---

# Milestone M2 — Correctness, performance, de-duplication

### M2-1 · Fix LanceDB filter injection + embedding dimension `[ ]`  — Sev: Med · Effort: S
- **Problem (F-NEW-3, F-NEW-4):** Filters built by f-string interpolation (`domain = '{domain}'`, `id = '{id}'`); embedding fallback returns 384-dim zero vector while `nomic-embed-text` is 768-dim.
- **Fix:** Whitelist/escape filter values (or use parameterized predicates); set the zero-vector length from the configured model's dimension and surface embedding failures instead of silently degrading.
- **Files:** `kernel/memory/lancedb_store.py`.
- **Acceptance:** A value containing `'` cannot alter the predicate; embedding-down path logs an error and returns a correctly-sized vector (or skips the write).

### M2-2 · Batch `deep_memory` persistence `[ ]`  — Sev: Med · Effort: M
- **Problem (F-NEW-5):** `_persist()` rewrites the whole graph JSON on every mutation → O(n²) I/O during `batch_ingest`.
- **Fix:** Add a dirty flag + explicit `flush()`; persist once per batch and debounce single mutations; optionally migrate storage to SQLite (the docstring already anticipates this).
- **Files:** `kernel/memory/deep_memory.py` (`_persist`, `add_entity`, `add_edge`, `batch_ingest`).
- **Acceptance:** `batch_ingest(n)` performs O(1) writes (not O(n)); benchmark shows large improvement on a 1k-item import; data integrity preserved on crash mid-batch.

### M2-3 · Replace `query="*"` pseudo-scans `[ ]`  — Sev: Low/Med · Effort: S
- **Problem (§6):** `document_indexer`/`self_learning` "list all" via `search(query="*", limit=10000)` then filter in Python; N+1 deletes.
- **Fix:** Add a real `list(table_name, where=...)` / `delete_where(...)` to `LanceDBStore`; use it for document chunk listing/deletion and pattern loading.
- **Files:** `kernel/memory/lancedb_store.py`, `kernel/memory/document_indexer.py`, `kernel/memory/self_learning.py`.
- **Acceptance:** Re-indexing a document deletes prior chunks via one predicate; no embedding of `"*"`.

### M2-4 · Make the kernel message loop concurrent `[ ]`  — Sev: High (UX) · Effort: M
- **Problem (§6/§7):** A long `task`/`index_directory` can stall the stdin message loop, freezing chat/status.
- **Fix:** Dispatch each inbound message to `asyncio.create_task`; keep an ordered response writer keyed by request id; cap concurrency to avoid resource storms.
- **Files:** `kernel/main.py` (`run()`/`process_message`).
- **Acceptance:** Status/chat remain responsive while a 60s+ task runs; responses are correctly correlated; no interleaving corruption of stdout frames.

### M2-5 · Consolidate duplicated modules `[ ]`  — Sev: Med · Effort: M
- **Problem (§9):** Two `self_destruct` engines (divergent APIs), two `network_firewall`, two intent→model routers, two IPC paths, two `ErrorBoundary`.
- **Fix:** Pick one of each, delete the other, update imports:
  - Keep one self-destruct (recommend `security/self_destruct.py` with PIN+countdown; see M3-2), retire the other.
  - Keep `security/network_firewall.py` (the enforced one from M0-4); delete `supervisor/network_firewall.py`.
  - Unify on one intent router (`brain/model_router.py`); fold `context_scheduler.route_intent` model map in or remove it.
  - Unify the frontend IPC path (prefer `kernelEventBridge`); collapse `mockTauri` event bridge into it for chat.
  - Keep one `ErrorBoundary`.
- **Files:** `kernel/security/*`, `kernel/supervisor/*`, `kernel/brain/model_router.py`, `kernel/memory/context_scheduler.py`, `src/services/{kernelEventBridge,mockTauri,aiService}.ts`, `src/components/{system,ui}/ErrorBoundary.tsx`.
- **Acceptance:** One implementation each; imports updated; tests still green; no dead duplicate left in the tree.

---

# Milestone M3 — Finish-or-retire features + structural refactor

### M3-1 · Decide & act on the 70+ slash-command executor `[ ]`  — Sev: Med · Effort: M
- **Problem (§10):** `auto_reply.py` registers 70+ commands with `handler="_cmd_<name>"` that don't exist; `main.py:835` logs "executor not implemented."
- **Fix:** Either implement a dispatch table mapping `_cmd_*` to real handlers (start with high-value: `/model`, `/status`, `/memory`, `/agent`, `/shell` [supervisor-gated], `/firewall`, `/help`) **or** trim the registry to only implemented commands and remove the misleading "70+" framing.
- **Files:** `kernel/auto_reply.py`, `kernel/main.py` (command-detection branch).
- **Acceptance:** Every advertised command either executes or is removed; `/help` lists only working commands.

### M3-2 · Consolidate & harden self-destruct `[ ]`  — Sev: Med · Effort: M
- **Problem (F8):** Two engines; `verify_pin()` returns `True` when no PIN set; voice-print verification unimplemented but gates `DATA_WIPE`/`FULL_DESTRUCT`.
- **Fix:** Keep one engine; require a configured strong PIN (argon2/bcrypt, not raw sha256) + a real second factor; **never** default-allow when no PIN is set; remove or genuinely implement voice-print (don't gate on an unchecked boolean).
- **Files:** `kernel/security/self_destruct.py` (+ delete `supervisor/self_destruct.py` per M2-5), `kernel/main.py:1108-1109`.
- **Acceptance:** Wipe is impossible without a configured PIN; the "voice verified" flag can't be spoofed by passing `True`; destructive levels require explicit multi-factor confirmation.

### M3-3 · Finish or clearly mark experimental scaffolding `[ ]`  — Sev: Med · Effort: L
- **Problem (§10/§11):** NPU (`hardware/npu_accelerator.py`), federated (`federated_learner.py`), eBPF (`ebpf_monitor.py`), A2A/sync (`sync/*`) are placeholders; docs imply done.
- **Fix:** For each: implement, **or** gate behind an explicit `experimental.*` flag (default off) and remove from user-facing "done" docs/status. Update `frontend-status.txt`, `docs/architecture_audit_updated.md`, README.
- **Files:** `kernel/hardware/*`, `kernel/sync/*`, `nexus-app/frontend-status.txt`, `nexus-app/docs/architecture_audit_updated.md`, `README.md`.
- **Acceptance:** No shipped doc claims an unimplemented feature is complete; experimental modules are clearly flagged.

### M3-4 · Refactor `main.py` god object + add logging `[ ]`  — Sev: Med · Effort: L
- **Problem (§8/§9):** 2,919-LOC entry point, ~40 `_handle_*` methods, stale "defined above ~958" comments, `print()`-based logging (no `logging`).
- **Fix:** Extract a handler registry (`message_type → handler` map, one module per domain); introduce `logging` with levels/structured output and a stderr handler; replace `print(..., file=sys.stderr)` and the `ManagerAgent` direct-`print` TAO emission with an injected event emitter.
- **Files:** `kernel/main.py`, new `kernel/handlers/*`, `kernel/agents/manager_agent.py` (`_emit_tao`).
- **Acceptance:** `main.py` < ~800 LOC; handlers unit-testable in isolation; logs have levels; no raw `print` for diagnostics in the kernel core.

### M3-5 · Correct "local-only" messaging / offline mode `[ ]`  — Sev: Med · Effort: S
- **Problem (§2):** README claims "No Cloud Dependency: All inference runs locally" while 7 cloud providers ship and `@google/genai` is a frontend dep.
- **Fix:** Reword to "local by default; cloud optional," **or** implement an enforced offline-mode toggle that disables cloud providers and the `@google/genai` path.
- **Files:** `README.md`, optionally `kernel/runtime_config.py` (`offline_mode`) + `cloud_engine` enforcement.
- **Acceptance:** Docs match behavior; if offline mode ships, enabling it provably blocks all non-local egress (ties to M0-4).

### M3-6 · Gate MCP-registered external tools `[ ]`  — Sev: Low/Med · Effort: S
- **Problem (F-NEW-7):** `mcp_client_manager` registers external server tools into the Toolbox with no policy gate.
- **Fix:** Tag MCP tools with their source and subject them to `tool_policy` (deny owner-only/`full`-tier by default for external sources); surface them distinctly in the UI.
- **Files:** `kernel/toolbox/mcp_client_manager.py`, `kernel/supervisor/tool_policy.py`.
- **Acceptance:** A tool from an external MCP server cannot run owner-only actions; policy test covers it.

---

# Milestone M4 — CI/CD, tests, supply chain (start in parallel, day 1)

### M4-1 · Stand up CI `[ ]`  — Sev: High · Effort: M
- **Fix:** Add `.github/workflows/ci.yml` (or GitLab CI) running on PR + main:
  - Frontend: `tsc --noEmit`, `eslint`, `vite build`, `playwright test`.
  - Rust: `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`.
  - Python: `ruff`/`flake8`, `pytest` (+ `pytest-asyncio`), `mypy` (advisory).
- **Files:** `.github/workflows/ci.yml`, lint configs.
- **Acceptance:** PRs are blocked on red; the pipeline runs the existing pytest suite + the 1 Playwright spec.

### M4-2 · Dependency & supply-chain scanning `[ ]`  — Sev: Med · Effort: S
- **Fix (F10):** Add `pip-audit`, `cargo audit`, `npm audit` (or `osv-scanner`) to CI; generate an SBOM (CycloneDX). Pin `requirements.txt` ranges to the existing `requirements.lock.txt`.
- **Files:** CI workflow, `kernel/requirements*.txt`.
- **Acceptance:** Known-vuln dependencies fail CI; SBOM artifact published per build.

### M4-3 · Fold ad-hoc test scripts into the suite + add regression tests `[ ]`  — Sev: Med · Effort: M
- **Fix:** Convert `test_phase*.py`, `test_wiring_audit.py`, `verify_gaps.py` into proper `pytest` modules under `kernel/tests/`. Add regression tests for every M0/M1 fix (shell gating, path guard, firewall enforcement, secret non-echo, supervisor-on-toolbox).
- **Files:** `nexus-app/test_*.py` → `nexus-app/kernel/tests/`, new test modules.
- **Acceptance:** One `pytest` invocation runs everything; each security fix has a guarding test.

### M4-4 · Wire (or remove) Rust crash recovery `[ ]`  — Sev: Low/Med · Effort: M
- **Problem (F11):** `process_manager.rs` has crash-recovery code that's never engaged (`lib.rs` calls `start_kernel()` directly; the restart event has no listener). The Linux orchestrator's recovery works.
- **Fix:** Either call `start_with_recovery()` and implement a real supervised restart with backoff + a listener for the restart event, **or** delete the dead code to avoid false resilience assurance.
- **Files:** `src-tauri/src/orchestrator/process_manager.rs`, `src-tauri/src/lib.rs`.
- **Acceptance:** Killing the kernel process either auto-restarts (with backoff, capped) or the code is removed; behavior documented.

---

## Cross-cutting acceptance gates (definition of "release-ready")

1. **No frontend or agent path reaches the host shell or arbitrary filesystem without supervisor + HIL.** (M0-1, M0-2, M0-3, M1-1)
2. **All outbound network requests pass the firewall; SSRF to loopback/link-local/private is blocked by default.** (M0-4)
3. **No secret material is recoverable from disk alone on Windows, nor echoed in any response/log.** (M1-3)
4. **Fresh install has no default credentials and no sudo-capable service account.** (M1-4)
5. **CI is green and blocking; every security fix has a regression test; dep scans pass.** (M4)
6. **Shipped docs make no false completeness claims.** (M3-3, M3-5)

---

## Suggested execution order (single engineer)

1. **Week 1:** M4-1 (CI skeleton) + M0-2 + M0-3 + M2-1 (quick, high-value).
2. **Week 2:** M0-1 + M0-4 (the big enforcement work) + M4-3 regression tests for them.
3. **Week 3:** M1-1 + M1-2 + M1-3.
4. **Week 4:** M1-4 + M1-5 + M1-6 → **release-blocker set complete**.
5. **Weeks 5–6:** M2 (perf/dedup) + M4-2/M4-4.
6. **Weeks 7+:** M3 (finish-or-retire features + `main.py` refactor).

> Parallelize across more engineers along the milestone boundaries; M0 tasks are mostly independent and can be split immediately.

---

## Traceability matrix (audit finding → task)

| Audit | Task(s) |
|---|---|
| F1 | M0-1 |
| F2 | M0-2 |
| F3 | M1-5 |
| F4 | M1-1 |
| F5 | M1-4 |
| F6 | M1-3 |
| F7 | M1-2 |
| F8 | M3-2 |
| F9 | M1-6 |
| F10 | M4-2 |
| F11 | M4-4 |
| F-NEW-1 | M0-3 |
| F-NEW-2 | M0-4 |
| F-NEW-3 | M2-1 |
| F-NEW-4 | M2-1 |
| F-NEW-5 | M2-2 |
| F-NEW-6 | M0-4 |
| F-NEW-7 | M3-6 |
| §6 perf (loop, scans, cache) | M2-3, M2-4 |
| §9 duplication | M2-5 |
| §8 god object / logging | M3-4 |
| §10 slash commands / stubs | M3-1, M3-3 |
| §2 messaging | M3-5 |
| §8/§9 CI & tests | M4-1, M4-3 |

*End of plan.*
