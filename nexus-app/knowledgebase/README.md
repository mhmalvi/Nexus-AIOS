# Nexus Hybrid AIOS

Nexus is a local-first, AI-powered operating system interface that combines a Rust-based orchestration layer with a Python reasoning kernel.

## 🚀 Getting Started

### Prerequisites

1.  **Node.js** (Frontend & Build)
2.  **Rust** (Backend)
3.  **Python 3.10+** (AI Kernel)
4.  **Visual Studio Build Tools 2022** (Desktop development with C++)
5.  **Ollama** (Local LLM Inference)
    *   Install from [ollama.com](https://ollama.com)
    *   Run `ollama pull llama3.2` (or your preferred model)

### Quick Start

1.  **Run the provided start script:**
    ```powershell
    .\start_dev.bat
    ```

    This will:
    *   Set up the Python virtual environment
    *   Install Python dependencies
    *   Start the Tauri application

### Manual Setup

1.  **Frontend (React + Tauri)**
    ```bash
    cd nexus-app
    npm install
    npm run tauri dev
    ```

2.  **Kernel (Python)**
    ```bash
    cd nexus-app/kernel
    python -m venv venv
    ./venv/Scripts/activate
    pip install -r requirements.txt
    ```
    *Note: The kernel is automatically managed by the Tauri app in production, but during dev, the `start_dev.bat` handles the environment.*

## 🏗️ Architecture

*   **`src-tauri/`**: Rust backend using Tauri V2. Handles windowing, security, filesystem access, and IPC.
*   **`src/`**: React frontend with TypeScript. Features a premium "Dark Cyber" aesthetic.
*   **`kernel/`**: Python sidecar process.
    *   `brain/`: LLM integration (Ollama), Planner, Intent Parser.
    *   `memory/`: LanceDB vector store, RAG engine.
    *   `toolbox/`: Shell executor, File manager, Web automation.
    *   `supervisor/`: Request validation, Safety blacklist, Audit logging.
    *   `agents/`: Worker and Manager generic agents.

## 🛠️ Configuration

*   **Kernel Config**: `nexus-app/kernel/.env`
*   **Tauri Config**: `nexus-app/src-tauri/tauri.conf.json`

## 🤝 Contributing

1.  Check the `implementation_plan.md` for the roadmap.
2.  Follow the security guidelines in `src-tauri/src/security/`.
