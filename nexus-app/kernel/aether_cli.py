"""
AETHER CLI — Claude Code-Style Agentic REPL

The `aether` command provides a rich terminal interface for interacting
with AETHER's AI engine. It supports:

- Natural language chat
- Slash commands (/model, /think, /agent, /memory, /security, /destruct)
- Streaming responses with live token display
- Conversation history within a session
- Context window status monitoring
- Provider switching on the fly

Usage:
    $ aether                    # Start interactive REPL
    $ aether "fix the bug"      # One-shot prompt
    $ aether --model gemini     # Start with a specific provider
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional, List, Dict, Any

# Lazy imports so the CLI file can be parsed without all deps
BANNER = r"""
    ___    ________________  __________
   /   |  / ____/_  __/ / / / ____/ __ \
  / /| | / __/   / / / /_/ / __/ / /_/ /
 / ___ |/ /___  / / / __  / /___/ _, _/
/_/  |_/_____/ /_/ /_/ /_/_____/_/ |_|

  Autonomous Execution & Thinking Hybrid Engine Runtime
  ──────────────────────────────────────────────────────
  Type naturally or use /help for commands.
  Ollama is your local brain. Add cloud keys for speed.
"""

# ---------------------------------------------------------------------------
# Slash command definitions
# ---------------------------------------------------------------------------

SLASH_COMMANDS = {
    "/help": "Show all available commands",
    "/model": "Switch AI provider or model (e.g., /model groq)",
    "/models": "List available models",
    "/think": "Set thinking depth: /think fast|balanced|deep",
    "/agent": "Spawn a subagent: /agent <name> <task>",
    "/agents": "List active subagents",
    "/memory": "Search memory: /memory <query>",
    "/status": "Show system status (providers, context, agents)",
    "/context": "Show context window usage",
    "/security": "Run a security audit",
    "/config": "View or set config: /config [key] [value]",
    "/clear": "Clear conversation history",
    "/compact": "Force context compaction",
    "/save": "Save conversation to file",
    "/exit": "Exit AETHER CLI",
}


# ---------------------------------------------------------------------------
# AETHER CLI REPL
# ---------------------------------------------------------------------------

class AetherCLI:
    """
    Interactive REPL for AETHER.

    This class can be used standalone (as the `aether` command)
    or embedded in a larger application.
    """

    def __init__(
        self,
        config=None,
        brain=None,
        memory=None,
        supervisor=None,
        subagent_registry=None,
        one_shot: Optional[str] = None,
        preferred_provider: Optional[str] = None,
    ):
        self._config = config
        self._brain = brain
        self._memory = memory
        self._supervisor = supervisor
        self._subagent_registry = subagent_registry
        self._one_shot = one_shot
        self._preferred_provider = preferred_provider

        # Session state
        self._messages: List[Dict[str, Any]] = []
        self._session_start = time.time()
        self._thinking_depth = "balanced"  # fast, balanced, deep
        self._running = True

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    async def run(self) -> None:
        """Main REPL loop."""
        # Late-initialize brain if not injected
        if not self._brain:
            await self._init_brain()

        # One-shot mode
        if self._one_shot:
            await self._handle_prompt(self._one_shot)
            return

        # Interactive mode
        self._print_banner()
        await self._show_status_brief()

        while self._running:
            try:
                prompt = self._read_input()
                if prompt is None:
                    break  # EOF
                if not prompt.strip():
                    continue

                # Slash command?
                if prompt.strip().startswith("/"):
                    await self._handle_slash_command(prompt.strip())
                else:
                    await self._handle_prompt(prompt)

            except KeyboardInterrupt:
                self._print("\n\n⚡ Interrupted. Type /exit to quit.\n")
            except EOFError:
                break

        self._print("\n👋 AETHER signing off.\n")

    # ------------------------------------------------------------------
    # Prompt handling
    # ------------------------------------------------------------------

    async def _handle_prompt(self, prompt: str) -> None:
        """Send a prompt to the AI and stream the response."""
        # Add to conversation history
        self._messages.append({"role": "user", "content": prompt})

        # Build system prompt based on thinking depth
        sys_prompt = self._get_system_prompt()

        self._print_colored("\n🧠 ", "cyan", end="")

        # Get provider info before response
        provider_info = self._brain.get_active_provider() if self._brain else {}

        # Stream the response
        full_response = ""
        token_count = 0
        t0 = time.time()

        try:
            async for chunk in self._brain.stream_generate(
                prompt=prompt,
                system_prompt=sys_prompt,
                messages=self._messages[:-1] if len(self._messages) > 1 else None,
            ):
                self._print(chunk, end="", flush=True)
                full_response += chunk
                token_count += 1

        except Exception as e:
            self._print_colored(f"\n❌ Error: {e}\n", "red")
            return

        elapsed = time.time() - t0

        # Add assistant response to history
        self._messages.append({"role": "assistant", "content": full_response})

        # Print stats footer
        provider = self._brain.get_active_provider() if self._brain else {}
        self._print("")  # newline after response
        self._print_colored(
            f"  ── {provider.get('provider', '?')}/"
            f"{provider.get('model', '?')[:30]} · "
            f"{elapsed:.1f}s · ~{token_count} tokens\n",
            "dim",
        )

    # ------------------------------------------------------------------
    # Slash command dispatch
    # ------------------------------------------------------------------

    async def _handle_slash_command(self, cmd: str) -> None:
        """Dispatch slash commands."""
        parts = cmd.split(maxsplit=1)
        command = parts[0].lower()
        arg = parts[1] if len(parts) > 1 else ""

        handlers = {
            "/help": self._cmd_help,
            "/model": lambda: self._cmd_model(arg),
            "/models": self._cmd_models,
            "/think": lambda: self._cmd_think(arg),
            "/agent": lambda: self._cmd_agent(arg),
            "/agents": self._cmd_agents,
            "/memory": lambda: self._cmd_memory(arg),
            "/security": self._cmd_security,
            "/status": self._cmd_status,
            "/context": self._cmd_context,
            "/clear": self._cmd_clear,
            "/compact": self._cmd_compact,
            "/config": lambda: self._cmd_config(arg),
            "/save": lambda: self._cmd_save(arg),
            "/exit": self._cmd_exit,
            "/quit": self._cmd_exit,
            "/q": self._cmd_exit,
        }

        handler = handlers.get(command)
        if handler:
            result = handler()
            if asyncio.iscoroutine(result):
                await result
        else:
            self._print_colored(f"❓ Unknown command: {command}\n", "yellow")
            self._print("   Type /help for available commands.\n")

    # ------------------------------------------------------------------
    # Command implementations
    # ------------------------------------------------------------------

    async def _cmd_help(self) -> None:
        self._print_colored("\n📋 AETHER Commands\n", "cyan")
        for cmd, desc in SLASH_COMMANDS.items():
            self._print(f"  {cmd:15s} {desc}")
        self._print("")

    async def _cmd_model(self, arg: str) -> None:
        if not arg:
            provider = self._brain.get_active_provider() if self._brain else {}
            self._print_colored(
                f"\n🤖 Current: {provider.get('provider', '?')}/"
                f"{provider.get('model', '?')}\n",
                "cyan",
            )
            self._print("   Usage: /model <provider> [model]")
            self._print("   Providers: groq, cerebras, mistral, gemini, openrouter, ollama\n")
            return

        parts = arg.split(maxsplit=1)
        provider = parts[0].lower()
        model = parts[1] if len(parts) > 1 else ""

        # Update cloud engine
        if self._brain and self._brain.llm._cloud_engine:
            self._brain.llm._cloud_engine.preferred_provider = provider
            if model:
                self._brain.llm._cloud_engine.provider_models[provider] = model

        self._print_colored(
            f"\n✅ Switched to {provider}"
            f"{(' / ' + model) if model else ''}\n",
            "green",
        )

    async def _cmd_models(self) -> None:
        self._print_colored("\n📦 Available Models\n", "cyan")
        # Cloud providers
        if self._brain and self._brain.llm._cloud_engine:
            from brain.cloud_engine import PROVIDER_REGISTRY
            for pid, spec in PROVIDER_REGISTRY.items():
                has_key = bool(
                    self._brain.llm._cloud_engine.api_keys.get(pid.value, "").strip()
                ) if pid.value != "ollama" else True
                status = "✅" if has_key else "🔑 (needs key)"
                self._print(f"  {spec.name:20s} {spec.default_model:40s} {status}")

        # Ollama models
        try:
            ollama_models = await self._brain.llm.list_models()
            if ollama_models:
                self._print_colored("\n  Ollama Local:", "dim")
                for m in ollama_models:
                    self._print(f"    • {m}")
        except Exception:
            pass
        self._print("")

    async def _cmd_think(self, arg: str) -> None:
        depths = {"fast": "fast", "balanced": "balanced", "deep": "deep"}
        if arg.lower() in depths:
            self._thinking_depth = depths[arg.lower()]
            self._print_colored(
                f"\n🧠 Thinking depth: {self._thinking_depth}\n", "cyan",
            )
        else:
            self._print(f"\n  Current: {self._thinking_depth}")
            self._print("  Usage: /think fast|balanced|deep\n")

    async def _cmd_status(self) -> None:
        self._print_colored("\n📊 AETHER Status\n", "cyan")

        # Provider health
        if self._brain:
            try:
                health = await self._brain.check_health()
                for pid, info in health.items():
                    if pid.startswith("_"):
                        continue
                    status = "🟢" if info.get("available") else "🔴"
                    ptype = info.get("type", "?")
                    self._print(f"  {status} {pid:15s} ({ptype})")

                stats = health.get("_stats", {})
                self._print_colored(
                    f"\n  Generations: {stats.get('total_generations', 0)} | "
                    f"Fallbacks: {stats.get('total_fallbacks', 0)} | "
                    f"Compactions: {stats.get('total_compactions', 0)}\n",
                    "dim",
                )
            except Exception as e:
                self._print_colored(f"  Error checking health: {e}\n", "red")

        # Session
        elapsed = time.time() - self._session_start
        self._print(f"  Session: {len(self._messages)} messages, {elapsed:.0f}s\n")

    async def _cmd_context(self) -> None:
        if not self._brain or not self._messages:
            self._print(
                "\n  No messages in context yet.\n"
            )
            return

        status = self._brain.llm.get_context_status(self._messages)
        pct = status.usage_pct
        bar_len = 30
        filled = int(bar_len * min(pct, 100) / 100)
        bar = "█" * filled + "░" * (bar_len - filled)

        color = "green" if pct < 60 else ("yellow" if pct < 85 else "red")
        self._print_colored(f"\n  Context Window [{bar}] {pct:.1f}%", color)
        self._print(f"  {status.estimated_tokens:,} / {status.budget_tokens:,} tokens")
        if status.should_compact:
            self._print_colored("  ⚠️  Compaction recommended!", "yellow")
        self._print("")

    async def _cmd_clear(self) -> None:
        self._messages.clear()
        self._print_colored("\n🧹 Conversation cleared.\n", "green")

    async def _cmd_compact(self) -> None:
        if not self._brain or not self._messages:
            self._print("\n  Nothing to compact.\n")
            return

        self._print_colored("\n⏳ Compacting context...", "yellow")
        try:
            compaction = self._brain.llm._compaction
            result = await compaction.compact(
                self._messages, budget_tokens=80_000,
            )
            self._messages = result.kept_messages
            self._print_colored(
                f"\n✅ Compacted: {result.original_tokens:,} → "
                f"{result.compacted_tokens:,} tokens "
                f"({result.compression_ratio:.0%} reduction)\n",
                "green",
            )
        except Exception as e:
            self._print_colored(f"\n❌ Compaction failed: {e}\n", "red")

    async def _cmd_config(self, arg: str) -> None:
        if not self._config:
            self._print("\n  Config not available in this mode.\n")
            return

        if not arg:
            # Show all config
            self._print_colored("\n⚙️  Configuration\n", "cyan")
            config = self._config.get_all()
            for key, val in sorted(config.items()):
                # Mask API keys
                if key == "api_keys":
                    val = {k: ("•" * 8 if v else "(empty)") for k, v in val.items()}
                self._print(f"  {key}: {json.dumps(val, default=str)}")
            self._print("")
        else:
            parts = arg.split(maxsplit=1)
            key = parts[0]
            if len(parts) == 1:
                val = self._config.get(key, "(not set)")
                self._print(f"\n  {key}: {val}\n")
            else:
                value = parts[1]
                # Try to parse as JSON
                try:
                    value = json.loads(value)
                except json.JSONDecodeError:
                    pass
                await self._config.set(key, value)
                self._print_colored(f"\n✅ {key} = {value}\n", "green")

    async def _cmd_save(self, arg: str) -> None:
        filename = arg or f"aether_session_{int(time.time())}.json"
        path = Path.home() / ".aether" / "sessions" / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(self._messages, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        self._print_colored(f"\n💾 Saved to {path}\n", "green")

    async def _cmd_exit(self) -> None:
        self._running = False

    async def _cmd_agent(self, arg: str) -> None:
        """Spawn a subagent: /agent <name> <task>"""
        if not self._subagent_registry:
            self._print_colored("\n  SubagentRegistry not available.\n", "yellow")
            return
        if not arg:
            self._print("  Usage: /agent <name> <task description>\n")
            return

        parts = arg.split(maxsplit=1)
        label = parts[0]
        task = parts[1] if len(parts) > 1 else "No task specified"

        async def execute_fn(task_str: str, model: str = "") -> str:
            return await self._brain.generate(prompt=task_str)

        run_id = await self._subagent_registry.spawn(
            label=label,
            task=task,
            parent_session="cli",
            execute_fn=execute_fn,
        )
        self._print_colored(f"\n  ✅ Spawned agent '{label}' [{run_id}]\n", "green")

    async def _cmd_agents(self) -> None:
        """List active subagents."""
        if not self._subagent_registry:
            self._print_colored("\n  SubagentRegistry not available.\n", "yellow")
            return

        active = self._subagent_registry.list_active()
        if not active:
            self._print("\n  No active subagents.\n")
            return

        self._print_colored("\n🤖 Active Subagents\n", "cyan")
        for r in active:
            elapsed = f"{r.elapsed_seconds:.0f}s" if hasattr(r, "elapsed_seconds") else "?"
            status = r.status.value if hasattr(r.status, "value") else str(r.status)
            self._print(f"  [{r.run_id[:8]}] {r.label:20s} {status:10s} {elapsed}")
        self._print("")

    async def _cmd_memory(self, arg: str) -> None:
        """Search memory: /memory <query>"""
        if not self._memory:
            self._print_colored("\n  MemoryManager not available.\n", "yellow")
            return
        if not arg:
            self._print("  Usage: /memory <search query>\n")
            return

        self._print_colored(f"\n🧠 Searching memory for: {arg}\n", "cyan")
        try:
            results = await self._memory.retrieve(query=arg, limit=5)
            if not results:
                self._print("  No results found.\n")
                return
            for i, r in enumerate(results, 1):
                content = str(r.get("content", ""))[:120]
                score = r.get("score", 0)
                self._print(f"  {i}. [{score:.2f}] {content}")
            self._print("")
        except Exception as e:
            self._print_colored(f"  Error: {e}\n", "red")

    async def _cmd_security(self) -> None:
        """Run a security audit summary."""
        if not self._supervisor:
            self._print_colored("\n  AgenticSupervisor not available.\n", "yellow")
            return

        self._print_colored("\n🔒 Security Audit\n", "cyan")
        try:
            log = self._supervisor.get_audit_log(limit=20)
            if not log:
                self._print("  No audit entries. System appears clean.\n")
                return

            failures = [e for e in log if getattr(e, "is_failure", False)]
            self._print(f"  Total entries: {len(log)}")
            self._print(f"  Failures/blocks: {len(failures)}")
            self._print_colored("\n  Recent entries:", "dim")
            for entry in log[-10:]:
                self._print(f"    {entry}")
            self._print("")
        except Exception as e:
            self._print_colored(f"  Error: {e}\n", "red")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _init_brain(self) -> None:
        """Initialize the Brain and optional subsystems with config."""
        sys.path.insert(0, str(Path(__file__).parent))
        from brain import Brain
        from runtime_config import RuntimeConfig

        config = RuntimeConfig()
        await config.load()
        self._config = config

        brain = Brain(config=config)
        await brain.initialize()
        self._brain = brain

        # Initialize optional subsystems
        try:
            from memory import MemoryManager
            mem_cfg = config.get("memory", {}) if hasattr(config, "get") else {}
            self._memory = MemoryManager(
                db_path=mem_cfg.get("db_path", "~/.aether/memory/aether.lance")
            )
        except Exception:
            pass

        try:
            from supervisor import AgenticSupervisor
            self._supervisor = AgenticSupervisor()
        except Exception:
            pass

        try:
            from agents.subagent_registry import SubagentRegistry
            self._subagent_registry = SubagentRegistry()
        except Exception:
            pass

    def _get_system_prompt(self) -> str:
        """Build system prompt based on thinking depth."""
        base = (
            "You are AETHER, an autonomous AI operating system assistant. "
            "You are helpful, knowledgeable, and precise. "
            "You have access to the local filesystem, running processes, and web. "
        )

        if self._thinking_depth == "fast":
            return base + "Be concise and direct. Short answers preferred."
        elif self._thinking_depth == "deep":
            return base + (
                "Think step by step. Show your reasoning. "
                "Be thorough and consider edge cases."
            )
        else:
            return base + "Balance thoroughness with conciseness."

    async def _show_status_brief(self) -> None:
        """Show a brief status line on startup."""
        if not self._brain:
            return

        try:
            health = await self._brain.check_health()
            cloud_count = sum(
                1 for k, v in health.items()
                if not k.startswith("_") and v.get("type") == "cloud"
                and v.get("available")
            )
            ollama_ok = health.get("ollama", {}).get("available", False)

            parts = []
            if ollama_ok:
                parts.append("🟢 Ollama (local)")
            else:
                parts.append("🔴 Ollama offline")
            if cloud_count:
                parts.append(f"☁️  {cloud_count} cloud provider(s)")
            else:
                parts.append("💡 Add cloud keys in /config for faster AI")

            self._print_colored(f"  {' · '.join(parts)}\n", "dim")
        except Exception:
            pass

    def _print_banner(self) -> None:
        self._print_colored(BANNER, "cyan")

    def _read_input(self) -> Optional[str]:
        """Read user input with a styled prompt."""
        try:
            return input("\033[36m❯\033[0m ")
        except EOFError:
            return None

    @staticmethod
    def _print(*args, **kwargs) -> None:
        print(*args, **kwargs)

    @staticmethod
    def _print_colored(text: str, color: str, **kwargs) -> None:
        colors = {
            "red": "\033[31m",
            "green": "\033[32m",
            "yellow": "\033[33m",
            "blue": "\033[34m",
            "magenta": "\033[35m",
            "cyan": "\033[36m",
            "dim": "\033[2m",
        }
        code = colors.get(color, "")
        print(f"{code}{text}\033[0m", **kwargs)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    """Entry point for the `aether` command."""
    import argparse

    parser = argparse.ArgumentParser(
        prog="aether",
        description="AETHER — Autonomous AI Operating System CLI",
    )
    parser.add_argument(
        "prompt", nargs="?", default=None,
        help="One-shot prompt (skip interactive mode)",
    )
    parser.add_argument(
        "--model", "-m", default=None,
        help="Preferred AI provider (groq, cerebras, mistral, gemini, openrouter, ollama)",
    )
    parser.add_argument(
        "--think", "-t", default="balanced",
        choices=["fast", "balanced", "deep"],
        help="Thinking depth (default: balanced)",
    )

    args = parser.parse_args()

    cli = AetherCLI(
        one_shot=args.prompt,
        preferred_provider=args.model,
    )
    cli._thinking_depth = args.think

    asyncio.run(cli.run())


if __name__ == "__main__":
    main()
