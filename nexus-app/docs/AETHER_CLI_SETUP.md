# Installing & Setting Up AETHER (new user)

`aether` is an interactive, Claude Code–style agentic CLI for the Nexus kernel.
It works with the local model (**Ollama**) and third-party providers
(**Gemini, OpenAI, Groq, Anthropic, Cerebras, Mistral, OpenRouter**), and is a
**full agentic executor**: it plans multi-step tasks, runs tools (shell, files,
web), and asks for confirmation before risky actions.

This guide uses the **lean** install path — chat and the agentic executor work
with minimal dependencies; memory/voice/browser are optional add-ons (Step 6).

---

## Prerequisites

- **Python 3.10+** — check with `python --version`
- **One model backend** (at least one):
  - **Ollama** (local, free, private) — recommended → <https://ollama.com>
  - **or a cloud API key** (Gemini, OpenAI, Groq, Anthropic, Cerebras, Mistral, OpenRouter)
- **Git** (to clone) — or a copy of the `nexus-app` folder

---

## Step 1 — Get the code

```bash
git clone <your-repo-url> nexus-ag
cd nexus-ag/nexus-app
```

## Step 2 — Create a virtual env and install

Gives you a working CLI with chat + the agentic executor (shell/file/web tools).
Memory and browser/vision are optional (Step 6).

**Windows (PowerShell):**
```powershell
cd kernel
py -m venv venv
.\venv\Scripts\Activate.ps1
pip install -e .
```

**Linux / macOS:**
```bash
cd kernel
python3 -m venv venv
source venv/bin/activate
pip install -e .
```

> `pip install -e .` reads `pyproject.toml` and pulls just `aiohttp` + `pydantic`
> — enough for both local **and** cloud LLMs and the agentic tools. The brain
> talks to Ollama over plain HTTP, so no `langchain` is required for the CLI.

## Step 3 — Make `aether` a global command

After Step 2, `aether` already works **while the venv is active**. To get it in
*any* terminal:

**Windows:**
```powershell
powershell -ExecutionPolicy Bypass -File ..\scripts\install-aether.ps1
```
Then open a **new** terminal. (Adds a launcher to `%LOCALAPPDATA%\Programs\Aether`
on your PATH that points at the venv command.)

**Linux (full Nexus install / ISO):** run the system installer, which symlinks
`aether` into `/usr/local/bin` automatically:
```bash
sudo ../linux/install.sh
```

**Linux (just the CLI, no full install):** use `pipx` instead of the venv:
```bash
pipx install -e .
```

> On the **bootable Nexus Linux ISO**, `aether` is already preinstalled — skip
> Steps 1–3.

## Step 4 — Set up a model

**Option A — Local (Ollama, recommended, no key):**
```bash
# install Ollama from ollama.com, then:
ollama pull llama3.2:3b
ollama serve        # usually runs automatically
```
AETHER defaults to `ai_provider: "ollama"` and `llama3.2:3b`, so no config needed.

**Option B — Cloud provider (e.g. Gemini):**
Start `aether`, then in the REPL:
```
/config ai_provider gemini
/config api_keys {"gemini": "YOUR_API_KEY_HERE"}
```
Keys are saved to `~/.aether/config.json` (encrypted at rest where the key vault
is available). Switch live anytime with `/model groq`, `/model ollama`, etc.

## Step 5 — Run it

```bash
aether                          # interactive REPL
aether "list the files here"    # one-shot task
aether --model gemini "summarize README.md"
```

In the REPL:

| Command | Purpose |
|---|---|
| *(type naturally)* | Auto-routes: questions → chat, tasks → agentic execution |
| `/help` | List all commands |
| `/do <task>` | Force agentic execution (plan + run tools) |
| `/chat <msg>` | Force plain chat (no tools) |
| `/mode auto\|chat\|agent` | Default routing |
| `/auto` | Toggle auto-approve (bypass y/N prompts — use with care) |
| `/tools` | List tools the executor can use |
| `/model`, `/models` | Switch / list providers and models |
| `/memory`, `/status`, `/context`, `/security` | Memory search, health, context usage, audit |
| `/exit` | Quit |

By default, any high/critical-risk action (shell, file write/delete) pauses for
an interactive **y/N** approval — human-in-the-loop is on unless you `/auto`.

## Step 6 — Optional extras

Only if you want these features (each degrades gracefully if absent):

```bash
# Long-term memory (/memory, RAG):
pip install lancedb numpy
ollama pull nomic-embed-text          # embedding model

# Browser automation tool:
pip install playwright && playwright install chromium

# Everything (voice, NPU, federated, etc. — heavy, mostly Linux):
pip install -r requirements.txt
```

---

## TL;DR (Windows, local model)

```powershell
git clone <repo> nexus-ag; cd nexus-ag\nexus-app\kernel
py -m venv venv; .\venv\Scripts\Activate.ps1; pip install -e .
powershell -ExecutionPolicy Bypass -File ..\scripts\install-aether.ps1
# install Ollama + `ollama pull llama3.2:3b`, then open a NEW terminal:
aether
```

---

## Troubleshooting

- **`aether` not recognized** — you didn't open a new terminal after Step 3, or
  PATH wasn't updated. Open a fresh terminal, or run the venv command directly:
  `kernel\venv\Scripts\aether.exe`.
- **Falls back to chat-only / "Agentic executor unavailable"** — a tool
  dependency failed to import. Core shell/file/web still work; install the
  Step 6 extras for the rest.
- **Cloud provider 503 / rate limited** — transient provider load. Retry, or
  switch with `/model ollama` to run locally.
- **No response / Ollama errors** — ensure `ollama serve` is running on
  `:11434` and you've pulled a model (`ollama pull llama3.2:3b`).
- **Wrong/old deps** — make sure you installed into and are using the **venv**
  Python (or `pipx`), not a bare system Python that lacks the dependencies.
