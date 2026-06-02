# Nexus Hybrid AIOS

**Nexus** is a next-generation **Hybrid AI Operating System** designed to bridge the gap between traditional desktop environments and autonomous agentic workflows. It combines a high-performance **Rust orchestration layer** with a flexible **Python reasoning kernel**, all packaged on a custom **Arch Linux** foundation.

Unlike standard operating systems where AI is an application, Nexus integrates intelligence directly into the system workflow, enabling creating a local-first, privacy-focused environment where agents can perceive and interact with the OS natively.

## 🏗️ Architecture

Nexus operates on a **Hybrid Kernel** architecture:
*   **System Foundation**: A minimal, hardened **Arch Linux** ISO (built via `mkarchiso`).
*   **Orchestrator (Rust)**: Manages system resources, windowing, security policies, and inter-process communication (IPC).
*   **Reasoning Kernel (Python)**: A sidecar process handling LLM inference (via Ollama), intent parsing, vector memory (LanceDB), and autonomous tool execution.

## 🚀 Building the Nexus ISO

You can build a bootable, live Arch Linux ISO with Nexus pre-installed using our Docker-based build pipeline.

### Prerequisites
*   **Docker Desktop** (running on Windows/Linux/macOS)
*   **Git**

### Build Instructions

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/mhmalvi/Nexus-AIOS.git
    cd Nexus-AIOS
    ```

2.  **Run the Docker Build Script:**
    This process is fully containerized and does not require Arch Linux on your host machine.
    ```bash
    # On Windows (PowerShell):
    ./nexus-app/linux/build-iso-docker.sh
    
    # On Linux/macOS:
    bash nexus-app/linux/build-iso-docker.sh
    ```

3.  **Locate the ISO:**
    Once the build completes (approx. 15-20 mins), the ISO will be available at:
    `./out/archlinux-YYYY.MM.DD-x86_64.iso`

### Running the ISO
1.  Boot the ISO in a VM (VMware/VirtualBox/QEMU) or flash it to a USB drive (Ventoy/Rufus).
2.  Select **"Arch Linux install medium (x86_64, BIOS)"**.
3.  Once booted, initialize the environment:
    ```bash
    nexus-setup      # Installs Python dependencies (first run only)
    nexus-cli        # Starts the AI Kernel CLI
    ```

## 🛠️ Development Setup (Local App)

To run Nexus as a desktop application on your existing OS (Windows/Linux):

### Prerequisites
*   **Node.js 18+**
*   **Rust (latest stable)**
*   **Python 3.10+**
*   **Ollama** (running locally)

### Quick Start
1.  **Install Dependencies:**
    ```bash
    cd nexus-app
    npm install
    # Python setup is handled by the build scripts
    ```

2.  **Run Development Server:**
    ```bash
    npm run tauri dev
    ```

## ⌨️ AETHER CLI (`aether`)

`aether` is an interactive, Claude Code–style agentic REPL for the Nexus kernel.
It works with the local model (**Ollama**) and third-party providers
(**Groq, Cerebras, Mistral, Gemini, OpenRouter, Anthropic, OpenAI**), and is a
**full agentic executor**: it plans multi-step tasks, runs tools (shell, files,
web, browser), and asks for confirmation before risky actions.

```bash
aether                       # interactive REPL
aether "summarize ./report"  # one-shot
aether --model groq          # start on a specific provider
aether --think deep          # reasoning depth
```

**Modes & key commands** (type `/help` for the full list):

| Command | Purpose |
|---|---|
| `/do <task>` | Force agentic execution (plan + run tools) |
| `/chat <msg>` | Force plain chat (no tools) |
| `/mode auto\|chat\|agent` | Default routing (auto classifies each prompt) |
| `/auto` | Toggle auto-approve (bypass y/N prompts — use with care) |
| `/tools` | List tools the executor can use |
| `/model`, `/models` | Switch / list providers and models |
| `/memory`, `/status`, `/context`, `/security` | Memory search, health, context usage, audit |

By default, any high/critical-risk action (shell, file write/delete) pauses for an
interactive **y/N** approval — human-in-the-loop is on unless you `/auto`.

### Installing the global command

**Any OS (dev, recommended):**
```bash
cd nexus-app/kernel
pip install -e .          # or: pipx install -e .  → global `aether`
```

**Windows desktop:**
```powershell
# Optional: build a self-contained binary first  ->  py nexus-app\kernel\build.py
powershell -ExecutionPolicy Bypass -File nexus-app\scripts\install-aether.ps1
# then open a new terminal and run:  aether
```

**Linux ISO / OS:** `aether` is installed and symlinked into `/usr/local/bin`
automatically by `nexus-app/linux/install.sh` (alongside `nexus-cli`).

📖 **Full step-by-step new-user guide:** [`nexus-app/docs/AETHER_CLI_SETUP.md`](nexus-app/docs/AETHER_CLI_SETUP.md)

## 🔐 Security & Privacy

Nexus is **Local-First** (cloud optional).
*   **Local by default**: Inference runs locally via Ollama out of the box. Cloud providers (OpenAI, Anthropic, Groq, Cerebras, Mistral, Gemini, OpenRouter) are **optional** and only used when you add an API key and select them.
*   **Trust by origin**: The local CLI/terminal/GUI is trusted (full power); inbound messaging and web content are treated as untrusted (restricted tools + approval).
*   **Sandboxed Execution**: Agent tools run through a multi-layer safety supervisor (blacklist + AST audit + tool policy + HIL approval).
*   **Audit Logging**: All agent actions are logged and user-verifiable.

## 📜 License

MIT License. See `LICENSE` for details.
