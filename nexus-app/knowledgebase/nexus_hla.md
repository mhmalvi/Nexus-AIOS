# High-Level Architecture (HLA): Nexus - The Hybrid AIOS

**Author:** Manus AI
**Version:** 1.0
**Date:** Jan 01, 2026

## 1. Introduction

This High-Level Architecture (HLA) document provides a comprehensive overview of the **Nexus** system, a Hybrid AI Operating System (AIOS) designed to be a local-first, autonomous digital co-pilot. Nexus integrates Level 2 OS control with Level 3 AI kernel logic, built upon a Linux-first foundation for maximum performance and flexibility.

### 1.1. Core Vision
To transform the personal computer into an intelligent, self-governing workspace by providing a secure, private, and autonomous AI layer.

### 1.2. Architectural Layers
The Nexus system is organized into four distinct, decoupled layers, ensuring modularity, maintainability, and clear separation of concerns.

| Layer | Primary Function | Core Technologies | AIOS Level |
| :--- | :--- | :--- | :--- |
| **Layer 4: Interface** | User Interaction and Ambient Access | Tauri (Rust/React), Voice Pipeline | Level 2 (UX) |
| **Layer 3: Kernel** | Reasoning, Planning, and Safety | Embedded Python, CrewAI/AutoGen | **Level 3 (Hybrid Core)** |
| **Layer 2: Data & Engine** | Memory Management and Inference | Ollama, LanceDB | Level 3 (Infrastructure) |
| **Layer 1: Execution** | System Control and Automation | Linux (D-Bus/Bash), WSL2 Bridge | Level 2 (OS Bridge) |

## 2. Layer 4: Interface Layer

This layer is responsible for all human-computer interaction, providing a seamless and ambient experience.

### 2.1. Components
*   **Unified UI:** A single, modern desktop application built with **Tauri** (using Rust for the backend and React for the frontend).
*   **Command Palette:** Accessible via a global hotkey (`Alt + Space`) for quick, context-aware input.
*   **Voice Pipeline:** A fully local system for ambient access, utilizing **OpenWakeWord** (wake word), **Faster-Whisper** (STT), and **Piper** (TTS).

### 2.2. Key Interface Flow
All user input (text or voice) is immediately passed to the Layer 3 Kernel for processing. The UI's primary role is to display the Kernel's **Thought-Action-Observation** loop and manage the **Human-in-the-Loop (HIL)** approval modal for system-modifying commands.

## 3. Layer 3: Kernel Layer (The Hybrid Core)

This is the intelligence and control center of Nexus, implemented primarily in an embedded Python environment.

### 3.1. The Orchestrator
The central component that receives user intent and initiates the agentic workflow.

### 3.2. The Hybrid Kernel Subsystem
This subsystem manages the core Level 3 logic:

| Component | Role | LLM Assignment |
| :--- | :--- | :--- |
| **Context Scheduler** | **Intent Routing:** Analyzes user input, selects the appropriate LLM, and assembles the optimal context from Layer 2. | Small, fast LLM (e.g., Phi-3-mini) |
| **Worker Agent** | **Planning & Execution:** Generates the step-by-step plan, code, and tool calls required to fulfill the user's request. | Large, capable LLM (e.g., Llama 3 8B/70B) |
| **Agentic Supervisor** | **Safety & Self-Correction:** Reviews the Worker Agent's proposed actions and error logs, ensuring safety and initiating internal debugging loops. | Small, reliable LLM (e.g., Phi-3-mini) |

## 4. Layer 2: Data & Engine Layer

This layer provides the foundational infrastructure for LLM inference and persistent memory.

### 4.1. AI Engine (Ollama)
*   **Function:** Bundled and managed local service for serving all LLMs and embedding models.
*   **Interface:** Local HTTP API.

### 4.2. Tiered Memory System (LanceDB)
The system implements a hierarchical memory structure, inspired by MemGPT, using **LanceDB** as the high-performance, file-based vector store.

| Tier | Purpose | Storage Location | Data Type |
| :--- | :--- | :--- | :--- |
| **Tier 1 (Working)** | Immediate Context | LLM Context Window | Conversation History, Current Tool Output |
| **Tier 2 (Short-term)** | Habits & History | LanceDB Table (Time-indexed) | Approved actions, system events, user preferences (self-learning data). |
| **Tier 3 (Long-term)** | Knowledge Base | LanceDB Table (Vector-indexed) | Indexed user documents, programming documentation, and system manuals (RAG). |

## 5. Layer 1: Execution Layer

This layer provides the controlled interface to the host operating system.

### 5.1. The Toolbox
A set of modular, version-controlled scripts (Python/Bash) exposed to the Worker Agent.
*   **Core Tools:** File system operations, network checks, process management.
*   **Custom Tools:** User-defined scripts registered via the UI.

### 5.2. OS Bridge (Linux-Native)
*   **Linux Integration:** Direct communication via **D-Bus** and **Bash** for native system control.
*   **Windows Compatibility:** The entire Linux stack is packaged as a **WSL2 Distro**, allowing Windows users to run the full Linux-native AIOS with minimal overhead. The WSL2 bridge handles secure access to the Windows file system.

## 6. Security and Autonomy Flow

The system prioritizes safety through a multi-stage approval process:

1.  **Intent:** User provides a goal (Layer 4).
2.  **Plan:** Worker Agent generates a plan and proposed action (Layer 3).
3.  **Audit:** Agentic Supervisor reviews the action for safety and correctness (Layer 3).
4.  **HIL:** If the action modifies the system, the user MUST approve it via the HIL modal (Layer 4).
5.  **Execute:** Approved command is executed via the OS Bridge (Layer 1).
6.  **Learn:** The approved action is logged to Tier 2 Memory for future self-learning (Layer 2).

---
## References

[1] Mei, K., et al. (2024). AIOS: LLM Agent Operating System. *arXiv preprint arXiv:2403.16971*.
[2] Packer, C., et al. (2023). MemGPT: Towards LLMs as Operating Systems. *arXiv preprint arXiv:2310.08560*.
[3] LanceDB. *LanceDB: The serverless vector database.* (https://lancedb.com/)
[4] Ollama. *Ollama: Get up and running with large language models.* (https://ollama.com/)
[5] Tauri. *Tauri: Build smaller, faster, and more secure desktop applications with a web frontend.* (https://tauri.app/)
[6] Microsoft. *Windows Subsystem for Linux (WSL).* (https://docs.microsoft.com/en-us/windows/wsl/)
