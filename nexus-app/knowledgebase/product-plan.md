# AETHER: The Autonomous AI Operating System

> **A**utonomous **E**xecution & **T**hinking **H**ybrid **E**ngine **R**untime

---

## What Is AETHER?

AETHER is a **bootable AI Operating System** — a next-generation Arch Linux distribution where the AI isn't an app, it **is** the OS. Every pixel, every process, every interaction flows through AETHER's intelligence.

Think Iron Man's JARVIS — but open-source, privacy-first, and real.

### The One-Line Pitch

> *"Boot from USB → AETHER wakes up → it sees your screen, hears your voice, runs your commands, learns your habits, and evolves. No setup. No cloud lock-in. Just pure autonomous intelligence."*

### What Makes This Different From Everything Else

| Feature | ChatGPT / Copilot | Claude Code | **AETHER** |
|---|---|---|---|
| Runs as... | Browser tab / plugin | CLI tool | **Entire operating system** |
| Voice | No | No | **Always-on ambient voice** |
| File access | Upload only | Working directory | **Full filesystem** |
| Browser | No | No | **Built-in with semantic vision** |
| Memory | Session only | Session only | **4-tier persistent memory** |
| Multi-agent | No | No | **Subagent spawning & orchestration** |
| Remote access | No | No | **WhatsApp / Telegram / Discord** |
| User creates agents | No | No | **Visual Agent Builder** |
| Self-destruct safety | No | No | **Multi-layer kill switch** |
| Runs without internet | No | No | **Ollama fallback mode** |

---

## AETHER's Personality & Interaction Model

AETHER is not a chatbot. It's a **sentient-feeling digital companion** that:

- **Greets you by name** when the system boots
- **Speaks proactively** — "I noticed your disk is 90% full. Want me to clean up?"
- **Remembers everything** — conversations, preferences, workflows, files you worked on
- **Adapts its tone** — professional for work, casual for personal, urgent for system alerts
- **Thinks out loud** — shows reasoning steps in real-time (toggleable)

### Voice Interaction (Always-On)

```
User:     "AETHER, what's using all my RAM?"
AETHER:   "Three processes are consuming 12GB total. Chrome has 47 tabs open
           using 4.2GB, Docker containers are using 5.1GB, and VS Code with
           the Rust analyzer is using 2.7GB. Want me to close the Chrome
           tabs you haven't touched in over an hour?"
User:     "Yeah, close the stale tabs"
AETHER:   "Done. Closed 31 tabs. RAM freed: 2.8GB. You're at 62% now."
```

### Claude Code-Style CLI (The `aether` Command)

AETHER's CLI is a **full agentic REPL** inspired by Claude Code:

```bash
$ aether

  ╔══════════════════════════════════════════════════════╗
  ║  AETHER v1.0  ·  Groq llama-3.3-70b  ·  4 tools    ║
  ║  Memory: 2,847 vectors  ·  Session: 3h 12m          ║
  ╚══════════════════════════════════════════════════════╝

  Tips: /model to switch · /think high for deep reasoning
        /compact to free context · /agents to list agents

aether> find all TODO comments in this project and create a task list

  ⚡ Searching project files...
  📂 Scanning 847 files across 12 directories

  Found 23 TODOs:
  ┌────┬──────────────────────────┬─────────────────────────────────┐
  │ #  │ File                     │ TODO                            │
  ├────┼──────────────────────────┼─────────────────────────────────┤
  │ 1  │ src/kernel/main.py:42    │ Implement voice wake detection  │
  │ 2  │ src/brain/router.py:118  │ Add Gemini flash model support  │
  │ ...│ ...                      │ ...                             │
  └────┴──────────────────────────┴─────────────────────────────────┘

  ⚠ AETHER wants to create tasks.md with 23 items
  Allow? [y/n/explain]:
```

#### CLI Capabilities (Claude Code Parity +)

| Feature | Claude Code | AETHER CLI |
|---|---|---|
| Agentic REPL | ✅ | ✅ |
| File read/write/edit | ✅ | ✅ |
| Shell command execution | ✅ | ✅ |
| Permission prompts (HIL) | ✅ | ✅ + voice confirmation |
| Streaming responses | ✅ | ✅ |
| Thinking/reasoning display | ✅ | ✅ + configurable depth |
| Multi-turn context | ✅ | ✅ + persistent across reboots |
| **Slash commands** | ❌ | ✅ 70+ commands (/model, /think, /compact, /status, /spawn) |
| **Voice input** | ❌ | ✅ Speak commands instead of typing |
| **Subagent spawning** | ❌ | ✅ `/spawn research "analyze this codebase"` |
| **Remote access** | ❌ | ✅ Same session from WhatsApp |
| **Agent creation** | ❌ | ✅ `/agent create devops --model gemini --tools shell,docker` |
| **Memory search** | ❌ | ✅ `/memory "deployment scripts"` → finds past context |
| **Browser use** | ❌ | ✅ `/browse https://docs.python.org "find asyncio examples"` |
| **Security audit** | ❌ | ✅ `/audit` → full system security check |
| **Self-destruct** | ❌ | ✅ `/destruct` → secure wipe (requires voice + PIN) |

---

## Desktop UI — The AETHER Desktop

The desktop is a **cyberpunk-themed AI workspace** where every app is wired to AETHER's brain. Users can configure, customize, and control **everything** from the UI.

### Desktop Shell Components

| Component | Purpose | Voice-Enabled |
|---|---|---|
| **Header** | Time, system status, AETHER mood indicator | ✅ "AETHER, what time is it?" |
| **Dock** | Launch apps, show running agents | ✅ "Open the code editor" |
| **StatusBar** | Active AI provider, latency, memory, active agents count | ✅ "AETHER, status report" |
| **Sidebar** | Quick access to files, recent conversations, pinned items | ✅ |
| **CommandPalette** | `Alt+Space` → search anything, run any command | ✅ Voice-activated |
| **NotificationCenter** | Agent completions, system alerts, security warnings | ✅ Reads alerts aloud |
| **LockScreen** | Biometric/PIN + voice authentication | ✅ "AETHER, unlock" + voice print |
| **BootSequence** | AETHER awakening animation + first-boot wizard | ✅ Guided by voice |

### Desktop Applications (Dock)

Every app is **fully interactive** — users can create, edit, configure, and orchestrate from the UI. No app is read-only or placeholder.

#### 🗨️ AETHER Chat (Primary AI Interface)
- Full conversation with AETHER (streaming, markdown, code blocks)
- **Inline tool use** — see AETHER browse, edit files, run commands in real-time
- **Reasoning display** — toggle thinking depth (off/low/medium/high)
- **Conversation history** — persistent, searchable, with branching
- **Attachments** — drag files, screenshots, images into chat
- **Agent switcher** — talk to different agents (main, research, devops, etc.)

#### 💻 Code Forge (AI-Powered Code Editor)
- Syntax highlighting, file tree, multi-tab
- **AI code completion** (inline suggestions)
- **AI explain** — select code → "explain this"
- **AI refactor** — select code → "refactor for performance"
- **AI debug** — paste error → AETHER finds the bug
- **Diff view** — see AI changes before applying
- **ACP bridge** — deep integration via Agent Client Protocol

#### 📁 File Manager
- Full file browser with create/rename/delete/move
- **Semantic search** — "find all invoices from January"
- **AI organization** — "sort these downloads by type"
- **Batch operations** — AI-assisted bulk rename, convert, compress

#### 🖥️ System Terminal
- Full bash/zsh terminal emulator
- **AI command suggestions** — type partial → AETHER completes
- **Error explanation** — command fails → AETHER explains why
- **Command history** with semantic search
- **Split panes** for multiple sessions

#### 🌐 Web Browser
- Chromium-based with full browsing
- **Semantic page snapshots** — AETHER "sees" the page via accessibility tree
- **Summarize page** — one click → full page summary
- **Extract data** — "pull all prices from this table"
- **Auto-fill forms** — AETHER fills in forms based on context
- **Profile management** — separate contexts for work/personal

#### 📊 Mission Control (System Dashboard)
- **Real-time** CPU, RAM, GPU, disk, network monitoring
- **AI resource allocation** — AETHER manages its own resource usage
- **Agent status** — all running agents with progress indicators
- **Memory usage** — vector DB size, index health, tier breakdown
- **Process manager** — kill/restart processes with AI recommendations

#### 📅 Scheduler (Cron + Tasks)
- **Visual cron manager** — create scheduled AI tasks with UI
- **Task board** — kanban-style task tracking
- **Recurring tasks** — "every Monday at 9am, summarize my emails"
- **One-shot tasks** — "tomorrow at 3pm, remind me to call Dave"
- **Catch-up** — missed tasks run on next boot

#### ⚙️ Settings (The Sanctum)
**100% user-configurable.** Every setting is editable from UI.

- **AI Provider** — switch between Groq/Cerebras/Mistral/Gemini/OpenRouter/Ollama
- **API Key Manager** — add, edit, remove, test API keys
- **Model Selection** — choose default model per provider
- **Agent Profiles** — create/edit/delete agent configurations
- **Tool Policies** — allow/deny tools per agent (minimal/coding/messaging/full)
- **Memory Settings** — tier sizes, retention policies, embedding model
- **Voice Settings** — wake word, TTS voice, ambient mode, speed
- **Security** — self-destruct config, audit schedule, HIL strictness
- **Persona** — upload custom SOUL.md personality files
- **Theme** — colors, fonts, animations, opacity
- **Network** — proxy, firewall rules for agents
- **Backup/Restore** — export/import full AETHER configuration

#### 🧩 Module Manager (Skill Store)
- **Browse ClawHub** — 5,700+ community skills with search & filters
- **One-click install** — install skills directly from UI
- **Skill editor** — create custom skills with guided wizard
- **Dependency graph** — see which skills depend on what
- **Update manager** — keep skills current

#### 🤖 Agent Builder (NEW)
This is the **flagship new app** — a visual interface for creating and orchestrating AI agents.

- **Agent Creator Wizard**:
  - Name, avatar, description
  - Model selection (per-provider)
  - Tool policy (which tools this agent can use)
  - Persona (SOUL.md file)
  - Memory scope (shared or isolated)
  - Scheduled triggers (cron expressions)
  - Channel bindings (which messaging channels it responds on)

- **Agent Orchestration Canvas**:
  - Drag-and-drop agent pipeline builder
  - Connect agents in chains: Agent A output → Agent B input
  - Parallel fan-out: spawn 3 research agents simultaneously
  - Conditional routing: if sentiment = negative → escalation agent
  - Visual monitoring: see each agent's progress in real-time

- **Agent Registry**:
  - List all agents (active, idle, scheduled)
  - Start/stop/restart agents
  - View agent sessions and transcripts
  - Clone/fork existing agent configs

#### 🔒 Security Center (NEW)
- **Audit Dashboard** — run full security audit, see findings by severity
- **Self-Destruct Panel** — configure kill switch options
- **Access Control** — who can talk to AETHER (owner vs. remote users)
- **Activity Log** — every action AETHER took, with timestamps
- **Tool Usage Report** — which tools were used, how often, by which agent

#### 🧠 Memory Explorer (NEW)
- **Tier Overview** — visual breakdown of all 4 memory tiers
- **Vector Search** — search your entire knowledge base semantically
- **QMD Browser** — view/edit Quick Memory Documents
- **Memory Timeline** — see what AETHER remembers, when it learned it
- **Forgetting** — manually delete specific memories

---

## 4-Tier Hybrid Memory Architecture

### The Problem with Existing Memory

| System | Memory Approach | Limitation |
|---|---|---|
| ChatGPT | Session-only | Forgets everything after conversation |
| Claude | Session + project | Limited to current project context |
| AETHER (old) | 3-tier LanceDB | No embedding diversity, no QMD, no hybrid search |
| OpenClaw | Vector embeddings + QMD | No tiered architecture, no working memory |

### AETHER's 4-Tier Hybrid Memory (Best of Both)

```
┌─────────────────────────────────────────────────────────────────┐
│                    AETHER MEMORY ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TIER 0: WORKING MEMORY (RAM)                           ~128K   │
│  ├── Current conversation context                                │
│  ├── Active tool results                                         │
│  ├── Context Window Guard (warn 32k, block 16k)                 │
│  └── Compaction Engine: when full → summarize → push to Tier 1  │
│                                                                  │
│  TIER 1: SESSION MEMORY (SQLite + Session Files)        ~10MB   │
│  ├── Recent conversations (last 30 days)                        │
│  ├── Compacted summaries from Tier 0                            │
│  ├── Session transcripts (per-agent)                            │
│  ├── Tool execution history                                      │
│  └── Session File Sync: auto-indexes recent file changes        │
│                                                                  │
│  TIER 2: KNOWLEDGE MEMORY (LanceDB + QMD + Hybrid)     ~1GB    │
│  ├── Quick Memory Documents (QMD) — user's personal wiki        │
│  ├── Vector embeddings (multi-provider: Voyage/Gemini/OpenAI)   │
│  ├── Hybrid Search (vector similarity + BM25 keyword)           │
│  ├── Document index (PDFs, code, notes)                         │
│  ├── Atomic reindexing with deduplication                        │
│  └── Workspace-aware: per-project knowledge bases               │
│                                                                  │
│  TIER 3: DEEP MEMORY (Batch Embeddings + Archive)       ~10GB+  │
│  ├── Full conversation archive (all time)                        │
│  ├── Batch embedding pipeline (Gemini/OpenAI/Voyage)            │
│  ├── Cross-session learning patterns                             │
│  ├── User behavior models                                        │
│  └── Federated sync (optional: across AETHER instances)         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Is the Best Architecture

**Compared to pure LanceDB (our old approach):**
- ✅ Adds QMD for structured knowledge (OpenClaw's killer feature)
- ✅ Adds hybrid search (vector + keyword — 40% better recall)
- ✅ Adds multi-provider embeddings (not locked to one model)
- ✅ Adds compaction (infinite conversations without context overflow)

**Compared to pure OpenClaw memory:**
- ✅ Adds tiered architecture (hot/warm/cold data separation)
- ✅ Adds working memory with context window guard
- ✅ Adds deep archive with batch processing
- ✅ Adds federated sync capability

**Recommendation:** Use **LanceDB** as the vector backend (embedded, no server, fast) + **OpenClaw's QMD manager** for structured documents + **OpenClaw's hybrid search** combining vector + BM25 + **Voyage AI embeddings** (best quality-to-cost ratio, 32K context for code).

---

## Voice-First Architecture

AETHER is **completely voice-enabled**. Every action available via keyboard/mouse is also available by voice. Voice is not an afterthought — it's a first-class interaction mode.

### Voice Pipeline

```
Microphone → Wake Word Detection ("AETHER") → Whisper STT → Intent Router
                                                                   ↓
                                                    ┌──────────────┴──────────────┐
                                                    ↓                             ↓
                                              System Command              AI Conversation
                                              "open terminal"             "explain this code"
                                                    ↓                             ↓
                                              Direct Action               Cloud AI Provider
                                              (no AI needed)              (reasoning + tools)
                                                    ↓                             ↓
                                              Execute                     Stream Response
                                                    ↓                             ↓
                                              Piper TTS ← Synthesize ← Text Response
                                                    ↓
                                               Speaker Output
```

### Voice Capabilities

| Category | Examples |
|---|---|
| **System Control** | "Open terminal" · "Close this window" · "Lock screen" · "Screenshot" |
| **App Control** | "In code editor, go to line 42" · "New file called server.py" |
| **AI Tasks** | "Summarize this document" · "Find bugs in this code" |
| **Agent Control** | "Spawn a research agent" · "Stop the devops agent" · "Agent status" |
| **Settings** | "Switch to Gemini" · "Enable thinking mode" · "Set volume to 60%" |
| **Memory** | "Remember this" · "What did I work on last Tuesday?" |
| **Security** | "Run security audit" · "Lock all agents" |
| **Self-Destruct** | "AETHER, initiate self-destruct" → requires voice print + PIN |

### Ambient Mode

When enabled, AETHER listens passively and:
- Detects errors in terminal output → "I noticed a segfault. Want me to investigate?"
- Hears phone calls (optional) → "That client mentioned the invoice. I've pulled up their file."
- Monitors system health → "CPU is at 95%. Docker container `redis` seems stuck."

---

## Safety & Self-Destruction System

AETHER has **production-grade safety** because an autonomous AI with shell access is dangerous without it.

### Safety Layers (Defense in Depth)

```
Layer 1: INTENT CLASSIFICATION
├── Every command classified: safe / cautious / dangerous / catastrophic
└── Regex fast-path + LLM deep analysis

Layer 2: HUMAN-IN-THE-LOOP (HIL)
├── Safe commands → auto-execute
├── Cautious commands → show what will happen, ask permission
├── Dangerous commands → require voice + text confirmation
└── Catastrophic commands → require voice print + PIN + 10s countdown

Layer 3: AST COMMAND AUDIT (from OpenClaw)
├── Parse shell commands into AST
├── Detect: rm -rf /, chmod 777, curl | bash, dd if=, mkfs
├── Block immediately with explanation
└── Log to security audit trail

Layer 4: TOOL POLICY ENGINE (from OpenClaw)
├── Per-agent tool profiles: minimal / coding / messaging / full
├── Remote channels (WhatsApp) get restricted tool set
├── Owner-only tools (self-destruct, config changes)
└── Plugin sandboxing

Layer 5: DOCKER SANDBOX
├── Untrusted code runs in ephemeral containers
├── No host network access
├── Read-only filesystem (except /workspace)
└── Resource limits (CPU, RAM, time)

Layer 6: NETWORK FIREWALL
├── Agents cannot make outbound requests without approval
├── Allowlist for API providers
├── Block data exfiltration patterns
└── DNS monitoring
```

### Self-Destruct System

For sensitive environments where data must never be recovered:

| Level | Trigger | Action | Recovery |
|---|---|---|---|
| **Soft Lock** | 3 failed auth attempts | Lock screen, disable all agents, alert owner | Unlock with master PIN |
| **Hard Lock** | 5 failed attempts / remote trigger | Encrypt all user data, disable SSH, wipe API keys | Decrypt with recovery key |
| **Data Wipe** | Voice + PIN + countdown | Secure-erase `~/.aether/`, all sessions, all memory tiers | **Unrecoverable** |
| **Full Destruct** | Physical button + voice print | dd wipe entire drive, overwrite 3 passes | **Unrecoverable** |
| **Dead Man Switch** | No owner check-in for N days | Auto-execute Hard Lock → Data Wipe after grace period | Recovery key only |

### Activation Sequence

```
User:   "AETHER, initiate self-destruct"
AETHER: "⚠️ SELF-DESTRUCT SEQUENCE INITIATED.
         This will permanently erase all data.
         Please confirm with your voice print and PIN."
User:   "Confirm. Alpha-seven-seven-zero."
AETHER: "Voice print verified. PIN accepted.
         Countdown: 10... 9... 8...
         Say 'abort' at any time to cancel."
         ...
         "3... 2... 1... Data wiped. Goodbye."
```

---

## Full OpenClaw Innovations Integrated

### 10 Cherry-Picked Subsystems

| # | Subsystem | Key Innovations | Files |
|---|---|---|---|
| 1 | **Agent Intelligence** | Model fallback chain, compaction, context guard, dynamic system prompt | `model-fallback.ts`, `compaction.ts`, `system-prompt.ts` |
| 2 | **Subagent System** | Spawn/wait/cleanup child agents, disk persistence, crash recovery | `subagent-registry.ts`, `subagent-announce.ts` |
| 3 | **Security** | 993-line audit, AST command blocking, skill scanner, Windows ACL | `security/audit.ts`, `security/audit-extra.sync.ts` |
| 4 | **Tool Policy** | Profiles (minimal/coding/messaging/full), allow/deny, owner-only gating | `tool-policy.ts` |
| 5 | **Auto-Reply** | Reply chunking, 70+ commands, directives, heartbeat, templates | 209 files in `auto-reply/` |
| 6 | **Cron** | Scheduled AI tasks, isolated sessions, catchup, session reaper | `cron/service/` |
| 7 | **Browser** | CDP + Playwright, semantic snapshots, extension relay, profiles | 83 files in `browser/` |
| 8 | **Memory** | 74KB vector manager, QMD, hybrid search, batch embeddings, session sync | `memory/manager.ts`, `memory/qmd-manager.ts` |
| 9 | **Hooks** | Gmail, workspace bootstrap, persona switching (SOUL.md) | `hooks/` |
| 10 | **Routing** | Multi-channel routing, session keys, ACP bridge for IDE integration | `routing/`, `acp/` |

---

## Technical Architecture

### Process Model (How It All Wires Together)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AETHER OS (Arch Linux)                       │
│                                                                      │
│  ┌──────────────┐   IPC (stdin/stdout)   ┌────────────────────────┐ │
│  │ TAURI (Rust) │◄─────────────────────►│   AETHER KERNEL        │ │
│  │  Orchestrator │                        │   (Python)             │ │
│  │              │                        │                        │ │
│  │  ┌──────────┐│                        │  ┌──────────────────┐  │ │
│  │  │ React UI ││                        │  │ Cloud Providers  │  │ │
│  │  │          ││                        │  │ (Groq/Gemini/..)│  │ │
│  │  │ Desktop  ││                        │  ├──────────────────┤  │ │
│  │  │ + Apps   ││                        │  │ Model Router     │  │ │
│  │  │ + Agents ││                        │  │ + Fallback Chain │  │ │
│  │  └──────────┘│                        │  ├──────────────────┤  │ │
│  └───────┬──────┘                        │  │ Subagent Registry│  │ │
│          │                               │  ├──────────────────┤  │ │
│          │ WebSocket                     │  │ Compaction Engine│  │ │
│  ┌───────▼──────┐                        │  ├──────────────────┤  │ │
│  │ AETHER CLI   │                        │  │ 4-Tier Memory   │  │ │
│  │ (aether cmd) │◄─── IPC ──────────────►│  │ (LanceDB+QMD)  │  │ │
│  └──────────────┘                        │  ├──────────────────┤  │ │
│                                          │  │ Tool Policy      │  │ │
│  ┌──────────────┐    WebSocket           │  │ + Safety Audit   │  │ │
│  │ OpenClaw GW  │◄─────────────────────►│  ├──────────────────┤  │ │
│  │ (Node.js)    │                        │  │ Toolbox          │  │ │
│  │ WhatsApp     │                        │  │ Shell/Files/Web  │  │ │
│  │ Telegram     │                        │  │ Browser/Docker   │  │ │
│  │ Discord      │                        │  ├──────────────────┤  │ │
│  │ Slack/Signal │                        │  │ Voice Pipeline   │  │ │
│  └──────────────┘                        │  │ Whisper + Piper  │  │ │
│                                          │  └──────────────────┘  │ │
│  ┌──────────────┐                        └────────────────────────┘ │
│  │ Cron Service │◄─── fires agent tasks on schedule                 │
│  └──────────────┘                                                   │
│                                                                      │
│  systemd manages: tauri-aether.service · aether-kernel.service      │
│                   aether-voice.service · openclaw-gateway.service    │
│                   aether-cron.service                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Everything Wired Up — The "Living Organism"

Every component communicates bidirectionally:

| From | To | Channel | What Flows |
|---|---|---|---|
| React UI | Rust Orchestrator | Tauri IPC | User actions, app commands |
| Rust Orchestrator | Python Kernel | stdin/stdout JSON | Queries, tasks, tool calls |
| Python Kernel | Cloud AI | HTTPS | Prompts, completions, embeddings |
| Python Kernel | LanceDB | Native | Vector search, memory storage |
| Python Kernel | OpenClaw GW | WebSocket | Incoming/outgoing messages |
| Voice Pipeline | Python Kernel | Unix socket | Transcribed speech, TTS requests |
| Cron Service | Python Kernel | IPC | Scheduled task triggers |
| Browser Engine | Python Kernel | CDP WebSocket | Page snapshots, actions |
| Docker Sandbox | Python Kernel | Docker API | Sandboxed execution results |
| Agent ↔ Agent | Subagent Registry | Internal | Task delegation, result announcements |

---

## Component Inventory (Existing → Updated)

### Existing Components to Rebrand & Enhance

| Current | AETHER Name | Enhancement |
|---|---|---|
| `NexusPulse.tsx` | `AetherPulse.tsx` | Living heartbeat animation, mood-responsive |
| `OllamaSetup.tsx` | `ProviderSetup.tsx` | Multi-provider API key wizard |
| `TheAwakening.tsx` | `AetherAwakening.tsx` | Boot sequence with voice greeting |
| `TheSanctum.tsx` | `AetherSanctum.tsx` | Full settings with all new config panels |
| `GhostCommandBar.tsx` | `AetherCommandBar.tsx` | Voice-activated command palette |
| `SwarmCluster.tsx` | Agent orchestration monitor | Real-time swarm visualization |
| `WarRoom.tsx` | Agent operations dashboard | Active mission monitoring |
| `ThoughtStream.tsx` | Reasoning display panel | Real-time AI thinking |
| `ActionApproval.tsx` | HIL modal with voice | Voice confirmation for actions |
| `MemoryViewer.tsx` | 4-Tier Memory Explorer | Full memory browsing/editing |

### New Components Needed

| Component | Purpose |
|---|---|
| `AgentBuilder.tsx` | Visual agent creation wizard |
| `OrchestrationCanvas.tsx` | Drag-and-drop agent pipeline builder |
| `SecurityCenter.tsx` | Audit dashboard + self-destruct panel |
| `CronManager.tsx` | Visual scheduled task editor |
| `SkillBrowser.tsx` | ClawHub marketplace browser |
| `VoiceOrb.tsx` | Ambient voice indicator (always visible) |
| `ProviderSwitcher.tsx` | Quick AI provider switching |
| `MemoryTimeline.tsx` | Visual memory history |
| `AgentChat.tsx` | Per-agent chat interface |
| `SelfDestructPanel.tsx` | Kill switch configuration |

---

## Implementation Phases

| Phase | Deliverable | What Ships |
|---|---|---|
| **Phase 1** | Core AI Intelligence | Cloud providers + model fallback + compaction + context guard + 4-tier memory |
| **Phase 2** | Agentic Framework | Subagent registry + tool policy + security audit + CLI (`aether` command) |
| **Phase 3** | Voice & Communication | Voice pipeline (always-on Whisper+Piper) + auto-reply engine + messaging channels |
| **Phase 4** | Browser & Perception | CDP+Playwright browser + semantic snapshots + media pipeline + link understanding |
| **Phase 5** | Desktop UI & Agent Builder | Full AETHER desktop + all apps + agent builder + orchestration canvas + settings |
| **Phase 6** | Safety & Distribution | Self-destruct system + security center + lean ISO build + final verification |
