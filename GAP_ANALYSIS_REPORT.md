# Nexus Hybrid AIOS — System Gap & Missing-Functionality Audit

> **Date:** 2026-06-02 · **Mode:** Gap discovery (what is missing/broken/incomplete — NOT a feature inventory)
> **Branch:** `feature/security-hardening-async-bridge` · **Scope:** `nexus-app/**` (first-party). Vendored `openclaw/`, `cloned_repo/` excluded.
> **Method:** Frontend↔Rust↔Python command/message tracing, stub/mock detection, CRUD completeness, and dead-end UI tracing. Every finding cites `path:line`.

**Stance per instructions:** This document does *not* describe working functionality. It lists only gaps, breakage, stubs, fakes, mismatches, and production-readiness deficits. Each is rated and ordered by risk.

---

## Executive Gap Summary

The system **presents as more complete than it is.** The kernel dispatcher, agents, and security layers are largely real, but the **UI advertises capabilities the backend does not implement**, and a large **browser-mock layer can silently fabricate success responses.** The single most dangerous pattern is *graceful fakery*: failures are masked as success, and several visible controls are dead ends.

Headline gaps (detail below):

- 🔴 **Memory "Forget" / single-entry delete is non-functional** — the UI button exists; the backend handler does not. Silent failure.
- 🔴 **Browser-mock layer fabricates success** for ~all commands when not running under Tauri (`kernelEventBus.ts`) — dangerous if ever shipped to web (claude.ai/code) or if Tauri detection misfires.
- 🟠 **VS Code integration shells out to a host `code` CLI** that is never verified/bundled, and starts an **unauthenticated** local web server (`--without-connection-token`).
- 🟠 **Fake/hardcoded UI data**: storage "45%", mock analytics charts, templated "AI summary" that is not AI.
- 🟠 **Orphaned backend handlers** (`set_api_key`) and **dead stubs** (`request_approval` always returns `False`).
- 🟠 **No auth / accounts / RBAC / export-import / monitoring / rate-limiting** — production-readiness essentials absent.
- 🟡 **Experimental subsystems** (NPU, federated learning, eBPF, A2A sync) are scaffolding only.

---

## Phase 1: Product Expectation Model (what it *should* be)

**Inferred product type:** A local-first "AI Operating System" desktop app + Arch ISO: an autonomous agent with OS reach (shell/files/web/browser), persistent memory, voice, multi-provider LLM, and human-in-the-loop safety.

**Expected user journey:** install → onboard (identity + provider/API keys) → chat/voice/agentic tasks → manage memory/agents/plugins/schedules → review security/audit → optionally connect messaging channels.

**Industry-standard features this class implies (used as the yardstick):** durable settings, full memory CRUD, working tool integrations, error/empty/loading states everywhere, observability, retries/rate-limits, graceful offline behavior, and clear connection/status indicators. The gaps below are measured against that bar.

---

## Phase 2: Feature-to-Expectation Gap Matrix

| Expected feature | Exists? | Partial? | Missing? | Evidence |
|---|---|---|---|---|
| Login / authentication | — | — | **Missing** | No auth code anywhere; only "owner vs untrusted origin" trust model (`security/trust.py`). No user identity. |
| User onboarding | Partial | ✅ name only | profile/keys flow thin | `setup/Onboarding.tsx:59` collects a name; provider keys handled separately. |
| Role-based access control | — | trust-by-origin only | **Missing (multi-user RBAC)** | `tool_policy.py` profiles are per-origin, not per-user/role. |
| Settings system | ✅ mostly | some mock values | — | `SettingsPanel.tsx:29` storage **hardcoded `'45%'`**. |
| **Memory: create/read** | ✅ | — | — | `store_memory`/`query_memory` handlers exist. |
| **Memory: delete single entry** | ❌ | — | **Missing/Broken** | `delete_memory` has **no kernel handler**; `_handle_manage_memory` only does `clear` (`main.py:2380-2408`). UI "Forget" = dead end. |
| Notifications | ✅ | — | — | `notification_tools.py`, `NotificationCenter.tsx`. |
| Search | Partial | memory only | global search thin | `MemoryExplorer` search; `CommandPalette` is command-only. |
| Filters / sorting | Partial | H-MEM domain/category | UI exposure thin | kernel supports `domain`/`category` filters. |
| **Export / import** (memory, config, audit) | — | — | **Missing** | No export/import message types or UI. |
| Admin controls | Partial | SecurityCenter | — | `SecurityCenter.tsx` exists; some panels mock. |
| Analytics / metrics | ❌ | — | **Mocked** | `ThoughtStream.tsx:38` "Mock data for charts". |
| Billing | N/A | — | Missing (no commercial path) | No billing/licensing/telemetry code. |
| API completeness (IPC) | Partial | — | gaps | `set_api_key` handler orphaned; `delete_memory` unhandled (below). |

---

## Phase 3: Broken Workflows & Dead Ends

### BW-1 🔴 "Forget this memory" → silent failure (dead-end button)
- **Flow:** MemoryExplorer → "Manage & Forget" tab → click Trash/"Forget" on an entry.
- **What happens:** UI sends `delete_memory` (`tauriApi.ts:547,555`) and awaits a `memory_deleted` response (`kernelEventBridge.ts:91`). The kernel dispatcher has **no `delete_memory` case** → returns `"Unknown message type: delete_memory"` (`main.py:746` else-branch). `manage_memory` with a delete action also fails — only `clear` is implemented (`main.py:2382-2408`).
- **Result:** No success state, no real deletion. The UI even advertises *"Manually delete specific memories"* (`MemoryExplorer.tsx:471`, buttons at `:489`, `:550`). **The entire single-entry deletion workflow is fake.** Only "clear entire tier" works.

### BW-2 🟠 SummaryOverlay → not actually AI-generated
- `aiService.summarize()` returns a **local, templated** summary, not an LLM summary; the code itself notes a kernel-backed summary "can replace it later via a dedicated request/response message type" that does not exist (`aiService.ts:94-97`). Feature presented as AI is deterministic string assembly.

### BW-3 🟠 CodeEditor "Search" and "Git" panels → "coming soon"
- Selecting the search or git sidebar mode renders `"Feature coming soon in v1.1"` (`CodeEditor.tsx:308`). Visible tabs, no implementation.

### BW-4 🟡 Context-menu "Change Wallpaper" → permanently disabled no-op
- `ContextMenu.tsx:75`: `onClick={() => {}}` + `disabled`. Present in UI, does nothing.

### BW-5 🟡 Voice: mic-denied path → fake visualization, no error state
- On microphone permission denial, `VoiceIndicator.tsx:68-70` logs a warning and starts `startMockVisualization()` — the orb animates as if listening while capturing nothing. No user-facing error/permission-recovery state.

### BW-6 🟡 Window snapping advertised but disabled
- `WindowFrame.tsx:214` "Safety: ensure window fits on screen — DISABLED"; `:364` snap preview "currently disabled." Drag-snap UX is dead code.

---

## Phase 4: Stub / Placeholder / Fake Logic

| Item | Location | Classification | Notes |
|---|---|---|---|
| **Browser-mock invoke layer** returns fabricated success + fake data for security, cron, browser, memory, task, HIL, kernel start/stop | `kernelEventBus.ts:34-304` | 🔴 **Dangerous stub** | Active whenever `window.__TAURI__` is absent. Returns `success:true` with mock payloads (`Mock Job 1`, `mem_001`, "Destruct sequence initiated (Mock)"). If the app loads outside Tauri (web build, claude.ai/code, or a detection miss), the **entire UI silently runs on lies**. |
| `request_approval()` always returns `False` | `supervisor/__init__.py:264` | 🟡 Dead stub (orphaned) | Never called in the real HIL path (real flow uses `pending_actions` + `_handle_approval_decision`, `main.py:2053`). Misleading if reused. |
| Storage usage hardcoded `'45%'` | `SettingsPanel.tsx:29` | 🟠 Fake value | No disk stat call. |
| Analytics charts "Mock data" | `ThoughtStream.tsx:38` | 🟠 Fake value | Visualizations not backed by real metrics. |
| Templated "AI" summary | `aiService.ts:94` | 🟠 Partial | See BW-2. |
| `reply_audio` no-op `pass` inside stream loop | `main.py:1009` | 🟡 Dead code | Real TTS happens later at `:1020`; the inner branch is vestigial. |
| Silent excepts (`except Exception: pass`) | e.g. `network_firewall.py:230`, `file_manager.py`, `main.py:1299` | 🟠 Broken-by-omission | Swallow errors with no logging → invisible failures. |
| "coming soon in v1.1" | `CodeEditor.tsx:308` | 🟡 Safe stub | Honest placeholder. |
| 150 TODO/FIXME/HACK markers across 42 files | repo-wide | mixed | Hotspots: `test_agents.py` (31), `kernelEventBus.ts` (18), `tauriApi.ts` (14), `AetherSanctum.tsx` (8). |

---

## Phase 5: Integration Gap Analysis

| Integration | State | Evidence / Gap |
|---|---|---|
| **AI / LLM providers** (8 cloud + Ollama) | ✅ Working | `cloud_engine.py` real; **but** depends on user keys; no key → cloud silently skipped. |
| **Ollama (local)** | ✅ Working, **external dependency** | Must be installed/running; install commands exist (`commands/ollama.rs`) but model availability for routing is unverified (`main.py:924`). |
| **Voice (Whisper/Piper/OpenWakeWord)** | ✅ Working, optional | All `try/except ImportError` gated; missing deps → silently disabled (`main.py:115-121`). |
| **Messaging (WhatsApp/Discord/Telegram)** | ⚠️ **Conditional / external** | `_handle_messaging` requires `channel_router` + a configured `messaging_provider` and an **external "Async Bridge" gateway not in this repo** (`bridge/async_bridge_client.py`, `ASYNC_BRIDGE.md`). Default = `none` → returns "Messaging is disabled" (`main.py:2614-2627`). No provider bundled; end-to-end send is unverifiable here. |
| **VS Code server** | ⚠️ **Missing dependency + insecure** | `codeServerService.ts:106` shells `code serve-web ... --without-connection-token` via `execute_shell`. Requires host `code` CLI (not detected/bundled) → silent failure if absent; and starts an **unauthenticated** local web server on `:8767`. |
| **MCP server/client (A2A)** | Present, unverified | `mcp_server.py`, `mcp_client_manager.py`; no e2e proof of an external server handshake in tests. |
| **Payment / Email / SMS** | **Missing** | No gateways, SMTP, or SMS integrations anywhere. |
| **Webhooks** | **Missing** | No inbound/outbound webhook handling (exfil patterns *block* webhook.site, but no first-party webhook feature). |
| **Cross-device sync (A2A)** | 🧪 Experimental, off | `sync/a2a_protocol.py`, `sync/memory_sync.py` reported `enabled:false` (`main.py:1193`). |
| **NPU / OpenVINO, federated learning, eBPF** | 🧪 Scaffolding | `hardware/*`; reported experimental/off (`main.py:1189-1192`). |

---

## Phase 6: Frontend ↔ Backend Mismatches

> Tauri command surface is clean: **every `invoke()` the frontend calls maps to a registered Rust command.** The mismatches are at the **kernel message layer.**

| Direction | Item | Status | Evidence |
|---|---|---|---|
| FE → BE | `delete_memory` | 🔴 **No backend handler** | `tauriApi.ts:555` sends it; kernel dispatcher lacks the case → "Unknown message type". |
| FE → BE | `manage_memory` (delete action) | 🔴 **Not implemented** | `_handle_manage_memory` handles only `clear` (`main.py:2382-2408`). |
| BE → FE | `set_api_key` handler | 🟠 **Orphaned (no FE caller)** | Handler at `main.py:1781`; **0** frontend references — keys saved via `update_config` instead. |
| BE → FE | `_handle_query` slash-command path, `ping`, `learning_stats`, `qmd`, `intent_dispatch`, `agent_registry` | 🟡 Thin/unclear FE exposure | Handlers exist; UI coverage partial or via generic panels. |
| FE shape | Browser-mock response shapes | 🟠 Drift risk | Mocks in `kernelEventBus.ts` hand-craft payload shapes that can diverge from real kernel responses, hiding contract breaks. |

**Reverse (backend with no/!thin frontend):** `set_api_key` (orphaned), several GAP-module handlers (`qmd`, `intent_dispatch`, `deep_memory` advanced ops) surfaced only partially.

---

## Phase 7: Data-Flow Completeness (CRUD) Audit

| Entity | Create | Read | Update | Delete | Sync | Gap |
|---|---|---|---|---|---|---|
| **Memory entry** | ✅ store | ✅ query | ⚠️ (re-store only) | 🔴 **single-delete broken**; only tier-`clear` | 🧪 A2A off | **No working per-entry delete/update; no export/import.** |
| **User / identity** | ⚠️ name only | ⚠️ | — | — | — | **No user entity, no account lifecycle.** |
| **Session / conversation** | ✅ in-memory | ✅ | partial | ⚠️ clear-all | — | No durable session store / per-session delete/export. |
| **Messages (chat)** | ✅ | ✅ | stream-update | — | — | No message deletion/edit/history export. |
| **Files** | ✅ create/write | ✅ | ✅ | ✅ (guarded) | — | Reasonably complete; "Better path join" TODO (`FileManager.tsx:284`). |
| **Audio / voice** | ✅ capture | ✅ transcribe | — | — | — | No recording persistence/management. |
| **Audit logs / network events** | ✅ append | ✅ recent | — | — | — | **In-memory + JSONL append only; no rotation, no purge UI.** |
| **Cron jobs** | ✅ | ✅ | partial | ✅ | — | OK; mock-backed in browser mode. |
| **Transactions / billing** | — | — | — | — | — | **Entity does not exist.** |

---

## Phase 8: Edge-Case Coverage Gaps

| Edge case | Handled? | Gap / evidence |
|---|---|---|
| Network failure (LLM) | ✅ partial | Provider fallback + cooldown (`cloud_engine.py`); but web/browser tools depend on firewall injection (may skip). |
| API timeout | ✅ partial | Per-provider timeouts; IPC 30s timeout (`process_manager.rs:51`). |
| **Empty states** | ⚠️ inconsistent | Messaging has a graceful empty state; memory-delete and analytics do not. |
| **Corrupt data** | ⚠️ | Vault `decrypt()` returns `""` on corruption (`key_vault.py:97`) — silently blanks a key. |
| Partial responses | ✅ | Streaming assembles chunks (`App.tsx`). |
| **Unauthorized access** | ⚠️ | No IPC auth (any local process / webview can issue privileged kernel messages). |
| **Concurrent updates / race** | 🔴 **Unguarded** | No locking around memory writes; single asyncio loop serializes but no optimistic concurrency; PTY/session maps use mutexes (Rust) but kernel state is unprotected. |
| **Duplicate submissions** | 🔴 **Unguarded** | No idempotency keys; double-click "send"/"task" can double-dispatch. |
| Corrupt/unknown message type | ⚠️ | Returns error JSON, but several frontends don't surface it (silent). |

---

## Phase 9: Production-Readiness Gaps

| Area | Status | Gap |
|---|---|---|
| **Logging completeness** | ⚠️ | Good stderr/stdout discipline + redaction, **but** raw `print(json.dumps(payload))` diagnostics bypass redaction (`main.py:872`) and many `except: pass` hide failures. |
| **Monitoring / observability** | 🔴 Missing | No metrics export, no health endpoint beyond `status` message, no tracing aggregation. |
| **Error tracking** | 🔴 Missing | No Sentry/crash-report pipeline; frontend errors only `console.error`. |
| **Retry mechanisms** | ⚠️ Partial | LLM provider retries/cooldown exist; tool/IPC calls do not retry. |
| **Rate limiting** | 🔴 Missing | Kernel stdin loop processes unbounded messages; no throttle on tools, egress, or agent loops. |
| **Security hardening** | ⚠️ | (See AUDIT_REPORT §5) `execute_shell` unvalidated; `fs:` caps = `**`; CSP `unsafe-inline`; firewall fail-open if not injected. |
| **Performance safeguards** | ⚠️ | No connection pooling (`aiohttp` session per call); no bundle code-splitting for Monaco/xterm. |
| **Backup systems** | 🔴 Missing | No backup/restore for `~/.aether` vault/config or LanceDB; no export. |
| **Graceful degradation** | ✅ partial | Optional-feature import gating works; but degradation is *silent* (no UI surfacing of disabled subsystems). |
| **Offline handling** | ✅ partial | Ollama-local default; but cloud-only configs fail hard if offline with no local model pulled. |
| **DB lifecycle** | 🔴 Missing | No LanceDB compaction/retention/TTL; unbounded growth. No log rotation. |

---

## Phase 10: UX Functional Gaps

| Expected UX | Status | Evidence |
|---|---|---|
| Loading indicators | ⚠️ partial | Input "processing" states exist; some async actions (memory ops) lack spinners. |
| Skeleton states | 🔴 Missing | No skeletons; lists pop in. |
| **Error messages** | ⚠️ inconsistent | Kernel errors often swallowed or shown as generic; memory-delete gives no error at all. |
| Toast notifications | ✅ exists | `ToastContainer.tsx` present. |
| Voice feedback states | ⚠️ | Mic-denied → **fake** listening animation (BW-5), not an error/permission state. |
| Audio status indicators | ✅ partial | Voice orb exists; half-duplex lock added. |
| **Connection status** (kernel/Ollama/messaging) | ⚠️ partial | `messaging_connected`, `gateway_connected` flags exist; no always-visible kernel/Ollama health badge; browser-mock can show "running" falsely. |
| Empty states | ⚠️ | Messaging good; memory/analytics weak. |

---

## Risk Ranking (Critical → Low)

### 🔴 Critical (user impact + correctness/trust)
1. **Memory single-entry delete is fake** (BW-1) — visible "Forget" buttons do nothing; data the user believes deleted persists. *Trust + privacy impact.*
2. **Browser-mock layer fabricates success** (`kernelEventBus.ts:34-304`) — any non-Tauri load runs on fake data including a fake "destruct initiated" and fake kernel "running". *Severe correctness/trust risk if it reaches users.*
3. **`execute_shell` unvalidated + `fs:**` caps + unauthenticated VS Code web server** — RCE-class surface (cross-ref AUDIT_REPORT §5 S-1/S-2; integration ES-VS Code). *Security.*

### 🟠 High (stability / production-readiness / honesty)
4. **No monitoring / error tracking / rate limiting / backup** — cannot operate or diagnose in production.
5. **Silent error swallowing** (`except: pass`, swallowed kernel errors, unsurfaced "unknown message type"). 
6. **Fake/hardcoded UI data** (storage 45%, mock charts, templated "AI" summary) — misrepresents system state.
7. **Messaging + VS Code depend on external pieces not in repo / not verified** — implied-but-absent integrations.
8. **No memory export/import or DB lifecycle** — unbounded growth, no recovery.

### 🟡 Medium
9. **Orphaned/dead code** (`set_api_key` no FE, `request_approval` returns False, dead `pass`/snap code).
10. **Concurrency/idempotency unguarded** (double-submit, races on memory writes).
11. **CodeEditor search/git "coming soon"**, disabled wallpaper, mic-denied fake state.

### 🟢 Low
12. **Experimental subsystems off** (NPU/federated/eBPF/A2A) — correctly flagged, just non-functional.
13. **No auth/RBAC/accounts** — acceptable for single-user local design, but blocks any multi-user/commercial path.
14. **150 TODO/FIXME** triage backlog.

---

## Recommended Fix Order

Ordered by (1) user impact, (2) stability, (3) security, (4) business.

1. **Implement `delete_memory` (and `manage_memory` delete action)** in the kernel and wire the `memory_deleted` response — or disable/hide the "Forget" UI until it exists. *Stops the worst trust violation.* (`main.py:2380`, `tauriApi.ts:555`)
2. **Make the browser-mock layer impossible to ship as truth** — gate behind an explicit `VITE_DEV_MOCKS` flag, log loudly, and never return security/destruct/kernel-state mocks. Fail visibly instead. (`kernelEventBus.ts`)
3. **Harden the OS-execution surface** — validate/allowlist `execute_shell` (or remove in favor of PTY), scope `fs:` capabilities to app roots, add a connection token to the VS Code server, drop CSP `unsafe-inline`. (cross-ref AUDIT_REPORT §5)
4. **Replace fake UI data with real sources or remove it** — disk stats for storage, real metrics for charts, and either implement the kernel summary message type or relabel the summary as non-AI. (`SettingsPanel.tsx:29`, `ThoughtStream.tsx:38`, `aiService.ts:94`)
5. **Stop swallowing errors** — convert `except: pass` to debug logging; surface "unknown message type" and kernel errors in the UI.
6. **Add production essentials** — structured metrics/health badge (kernel/Ollama/messaging), error tracking, IPC rate-limit, vault/config/DB backup+export, and LanceDB retention.
7. **Verify or quarantine external integrations** — detect the `code` CLI before offering VS Code; clearly gate messaging behind a connected Async Bridge with status surfaced; add an MCP e2e test.
8. **Add idempotency / concurrency guards** — disable buttons on submit, idempotency keys on task/command dispatch, locking on memory writes.
9. **Remove dead/orphaned code** — `set_api_key` (or wire it), `request_approval` stub, disabled snap/wallpaper code, dead `pass` branches.
10. **Finish or formally defer experimental subsystems** — keep them clearly labeled "experimental/off" (already done) and exclude from any "feature complete" messaging.

---

---

## Remediation Status (2026-06-02 fix pass)

The following gaps were **fixed in code** in this pass:

| Gap | Status | Change |
|---|---|---|
| BW-1 / FE→BE: memory single-entry delete | ✅ **Fixed** | Added `MemoryManager.delete_entry()` (spans working + short/long-term tiers) and kernel handlers for both the `delete_memory` message type and a `manage_memory` `action:"delete"`. The "Forget" button now works end-to-end. (`memory/memory_manager.py`, `main.py`) |
| Phase-4: browser-mock fabricates success | ✅ **Fixed** | Mock bridge gated behind `import.meta.env.DEV`; production non-Tauri now **fails loudly** instead of faking responses; security/destruct commands no longer return fake "success". (`kernelEventBus.ts`) |
| Phase-4 / Phase-10: fake storage "45%" | ✅ **Fixed** | Added real disk usage to the Rust `get_system_info` (`sysinfo::Disks`); SettingsPanel shows real `%` or `N/A`. (`commands/system.rs`, `tauriApi.ts`, `SettingsPanel.tsx`) |
| BW-5 / Phase-10: mic-denied fake waveform | ✅ **Fixed** | Removed the fake "organic" animation on mic denial; now shows a flat idle state labeled **"Mic Unavailable"**. (`VoiceIndicator.tsx`) |
| Phase-4: dead `reply_audio` no-op `pass` | ✅ **Fixed** | Removed the vestigial branch in `_handle_query`. (`main.py`) |
| Phase-9: silent firewall audit-log swallow | ✅ **Fixed** | `except: pass` → `logger.debug(...)`. (`security/network_firewall.py`) |

**Deliberately deferred** (larger efforts / product decisions, not quick fixes — left as recommendations):

- 🔴 Security-hardening triad (`execute_shell` validation, scoping `fs:**` capabilities, CSP `unsafe-inline`, VS Code server token) — these need careful testing against live app behavior to avoid breaking the FileManager/CodeEditor flows; tracked in `AUDIT_REPORT.md §5`.
- 🟠 Production essentials (monitoring, error tracking, IPC rate-limit, backup/export, LanceDB retention) — net-new subsystems.
- 🟠 Messaging / VS Code external-dependency detection — needs runtime probing + UX.
- 🟡 Auth / accounts / RBAC, analytics backing for `ThoughtStream` charts, CodeEditor search/git — net-new features.
- 🟡 Orphaned `set_api_key` / dead `request_approval` stub — left in place (low risk; removing touches the public supervisor API).

Verification: `py` AST parse of changed kernel files ✅, `tsc --noEmit` ✅, `cargo check` (Rust) ✅ (exit 0; only pre-existing dead-code warnings).

---

*Brutally honest bottom line: the architecture is real and the security thinking is above average, but the product currently **over-promises in the UI and under-delivers in the backend**, and a mock layer can make the whole thing appear to work when it does not. The fastest credibility win is eliminating silent fakery — fix #1, #2, #4, and #5 first.*

*All findings cite first-party source at the referenced `path:line`. Cross-reference `AUDIT_REPORT.md` for the security and architecture detail behind the production-readiness items.*
