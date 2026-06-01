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

# Optional `rich` rendering — gives panels, tables, and live Markdown for an
# aesthetic terminal UI. Falls back to plain ANSI when rich isn't installed.
try:
    from rich.console import Console, Group
    from rich.panel import Panel
    from rich.table import Table
    from rich.markdown import Markdown
    from rich.live import Live
    from rich.text import Text
    from rich.rule import Rule
    from rich.align import Align
    from rich import box
    _RICH = True
    _console = Console(highlight=False)
except Exception:
    _RICH = False
    _console = None

# Optional `readchar` — enables arrow-key interactive menus (e.g. /model).
try:
    import readchar
    _READCHAR = True
except Exception:
    _READCHAR = False

# Optional `prompt_toolkit` — interactive input line: slash-command completion,
# persistent history (↑/↓), and auto-suggestions.
try:
    from prompt_toolkit import PromptSession
    from prompt_toolkit.completion import NestedCompleter
    from prompt_toolkit.history import FileHistory
    from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
    from prompt_toolkit.formatted_text import HTML
    from prompt_toolkit.styles import Style as PTStyle
    _PTK = True
except Exception:
    _PTK = False

# A subtle, consistent palette used across the UI.
ACCENT = "bright_cyan"
MUTED = "grey58"

# Just the figlet art (rendered inside a styled panel when rich is available).
BANNER_ART = r"""    ___    ________________  __________
   /   |  / ____/_  __/ / / / ____/ __ \
  / /| | / __/   / / / /_/ / __/ / /_/ /
 / ___ |/ /___  / / / __  / /___/ _, _/
/_/  |_/_____/ /_/ /_/ /_/_____/_/ |_|"""

# Plain-text banner for the no-rich fallback path.
BANNER = "\n" + BANNER_ART + r"""

  Autonomous Execution & Thinking Hybrid Engine Runtime
  Type naturally or use /help for commands.
  Ollama is your local brain. Add cloud keys for speed.
"""

# ---------------------------------------------------------------------------
# Slash command definitions
# ---------------------------------------------------------------------------

SLASH_COMMANDS = {
    "/help": "Show all available commands",
    "/do": "Force agentic execution: /do <task> (plan + run tools)",
    "/chat": "Force plain chat (no tools): /chat <message>",
    "/mode": "Set default routing: /mode auto|chat|agent",
    "/auto": "Toggle auto-approve (bypass y/N prompts) — use with care",
    "/tools": "Pick a tool and run it (prompts for arguments)",
    "/model": "Switch AI provider or model (e.g., /model groq)",
    "/models": "List available models",
    "/think": "Set thinking depth: /think fast|balanced|deep",
    "/agent": "Run a subagent on a task: /agent <task>",
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
        manager=None,
        toolbox=None,
    ):
        self._config = config
        self._brain = brain
        self._memory = memory
        self._supervisor = supervisor
        self._subagent_registry = subagent_registry
        self._one_shot = one_shot
        self._preferred_provider = preferred_provider
        self._manager = manager      # ManagerAgent (full agentic executor)
        self._toolbox = toolbox      # Toolbox (tool registry)

        # Session state
        self._messages: List[Dict[str, Any]] = []
        self._session_start = time.time()
        self._thinking_depth = "balanced"  # fast, balanced, deep
        self._running = True

        # Agentic-mode state
        # mode: "auto"  -> classify each prompt; act on commands/tasks, chat otherwise
        #       "chat"  -> always plain conversation (no tools)
        #       "agent" -> always route through the agentic executor
        self._mode = "auto"
        self._auto_approve = False          # /auto toggles bypass of HIL prompts
        self._approval_lock = asyncio.Lock()  # serialize concurrent approval prompts
        self._session = None                # prompt_toolkit PromptSession (interactive input)
        self._spin_active = False           # drives the "thinking/planning" spinner

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
            await self._route_prompt(self._one_shot)
            return

        # Interactive mode
        self._print_banner()
        await self._show_status_brief()
        self._build_session()

        while self._running:
            try:
                prompt = await self._read_input()
                if prompt is None:
                    break  # EOF
                # Strip a leading BOM / zero-width chars (can appear on piped or
                # redirected input) so slash-command detection is reliable.
                prompt = prompt.lstrip("﻿​")
                if not prompt.strip():
                    continue

                # Slash command?
                if prompt.strip().startswith("/"):
                    await self._handle_slash_command(prompt.strip())
                else:
                    await self._route_prompt(prompt)

            except KeyboardInterrupt:
                self._print("\n⚡ Interrupted. Type /exit (or Ctrl-D) to quit.\n")
            except EOFError:
                break

        self._print("\n👋 AETHER signing off.\n")

    # ------------------------------------------------------------------
    # Prompt handling
    # ------------------------------------------------------------------

    async def _route_prompt(self, prompt: str) -> None:
        """Decide whether a prompt is plain chat or an agentic task, then run it.

        - mode "chat":  always stream a conversational reply (no tools).
        - mode "agent": always run the full agentic executor.
        - mode "auto":  classify intent; commands/tasks run agentically, the
          rest is answered as chat. Falls back to chat if no executor is wired.
        """
        if self._mode == "chat" or self._manager is None:
            await self._handle_prompt(prompt)
            return

        if self._mode == "agent":
            await self._run_agentic(prompt)
            return

        # mode == "auto": classify intent to decide
        actionable = False
        try:
            intent = await self._brain.parse_intent(prompt)
            itype = getattr(intent, "intent_type", "conversation")
            if getattr(intent, "requires_clarification", False):
                q = getattr(intent, "clarification_question", None)
                if q:
                    self._print_colored(f"\n🤔 {q}\n", "yellow")
                    return
            actionable = itype in ("command", "task")
        except Exception:
            actionable = False

        if actionable:
            await self._run_agentic(prompt)
        else:
            await self._handle_prompt(prompt)

    async def _run_agentic(self, task: str) -> None:
        """Run a task through the full agentic executor (plan -> execute)."""
        if self._manager is None:
            self._print_colored(
                "\n  Agentic executor unavailable (toolbox/supervisor not loaded). "
                "Falling back to chat.\n", "yellow",
            )
            await self._handle_prompt(task)
            return

        mode_note = "auto-approve" if self._auto_approve else "approval: ask"
        self._rule(f"⚙  agentic run  ·  {mode_note}", style="magenta")
        self._messages.append({"role": "user", "content": task})

        t0 = time.time()
        # Spinner during the planning phase; the first TAO event clears it
        # (see _emit_tao_pretty) — well before any approval prompt.
        spin = None
        if _RICH and _console is not None:
            self._spin_active = True
            spin = asyncio.create_task(self._spin("planning…"))
        try:
            result = await self._manager.execute_task(
                description=task, auto_approve=self._auto_approve,
            )
        except Exception as e:
            self._print_colored(f"\n❌ Agentic run failed: {e}\n", "red")
            return
        finally:
            self._spin_active = False
            if spin:
                await spin

        elapsed = time.time() - t0
        success = result.get("success", False)
        steps = result.get("steps_executed", 0)
        results = result.get("results", [])

        # Per-step table
        if _RICH and _console is not None:
            table = self._new_table(
                {"header": "", "width": 2},
                {"header": "step", "style": MUTED, "no_wrap": True},
                {"header": "result", "overflow": "fold"},
            )
            for r in results:
                ok = r.get("success")
                detail = r.get("output") if ok else r.get("error")
                detail = str(detail or "").strip().replace("\n", " ")[:200]
                table.add_row(
                    "[green]✓[/green]" if ok else "[red]✗[/red]",
                    str(r.get("step", "")), detail,
                )
            self._emit_table(table)

            icon, style = ("✅", "green") if success else ("⚠️", "yellow")
            summary = Text()
            summary.append(f"{icon} ", style=style)
            summary.append(
                f"{'completed' if success else 'finished with issues'}",
                style=f"bold {style}",
            )
            summary.append(f"  ·  {steps} step(s)  ·  {elapsed:.1f}s", style=MUTED)
            _console.print(summary)
            _console.print()
        else:
            icon, color = ("✅", "green") if success else ("⚠️", "yellow")
            self._print_colored(
                f"\n{icon} Task {'completed' if success else 'finished with issues'} "
                f"· {steps} step(s) · {elapsed:.1f}s\n", color,
            )
            for r in results:
                ok = "✓" if r.get("success") else "✗"
                detail = r.get("output") if r.get("success") else r.get("error")
                detail = str(detail or "").strip().replace("\n", " ")[:160]
                self._print(f"  {ok} {r.get('step')}: {detail}")
            self._print("")

        # Record a compact assistant turn so chat keeps context of what happened
        self._messages.append({
            "role": "assistant",
            "content": f"[agentic task {'succeeded' if success else 'failed'}] {task}",
        })

    async def _approve_action(self, action: str, risk_level: str, reason, warnings) -> bool:
        """Interactive human-in-the-loop approval prompt for a risky action.

        Wired into WorkerAgent.approval_callback. Returns True to allow the
        action, False to block it. Serialized so parallel steps don't interleave.
        """
        if self._auto_approve:
            return True

        async with self._approval_lock:
            if _RICH and _console is not None:
                body = Text()
                body.append("Action  ", style="bold")
                body.append(f"{action}\n")
                body.append("Risk    ", style="bold")
                body.append(f"{risk_level}\n", style="bold yellow")
                if reason:
                    body.append("Reason  ", style="bold")
                    body.append(f"{reason}\n", style=MUTED)
                for w in (warnings or []):
                    body.append("⚠  ", style="yellow")
                    body.append(f"{w}\n", style=MUTED)
                _console.print(Panel(
                    body, title="⛔ approval required", title_align="left",
                    border_style="yellow", box=box.ROUNDED, padding=(0, 1),
                ))
            else:
                self._print_colored("\n  ⛔ Approval required", "yellow")
                self._print(f"     Action : {action}")
                self._print(f"     Risk   : {risk_level}")
                if reason:
                    self._print(f"     Reason : {reason}")
                for w in (warnings or []):
                    self._print(f"     ⚠  {w}")

            # Read input off the event loop so we don't block other coroutines
            loop = asyncio.get_event_loop()
            try:
                answer = await loop.run_in_executor(
                    None, input, "  approve? [y/N] ",
                )
            except (EOFError, KeyboardInterrupt):
                self._print_colored("  → denied\n", "red")
                return False

            approved = answer.strip().lower() in ("y", "yes")
            self._print_colored(
                f"  → {'approved ✓' if approved else 'denied ✗'}\n",
                "green" if approved else "red",
            )
            return approved

    def _emit_tao_pretty(self, tao_type: str, content: str, step_id=None, details=None) -> None:
        """Render a Thought/Action/Observation event as a readable CLI line."""
        # First event means planning is done — clear the planning spinner.
        self._spin_active = False
        if _RICH and _console is not None:
            spec = {
                "THOUGHT": ("🧠", ACCENT),
                "ACTION": ("🔧", "blue"),
                "OBSERVATION": ("👁", "green"),
            }
            glyph, style = spec.get(tao_type, ("•", MUTED))
            line = Text("   ")
            line.append(f"{glyph} ", style=style)
            if step_id:
                line.append(f"{step_id}  ", style=MUTED)
            line.append(content, style="" if tao_type == "OBSERVATION" else style)
            _console.print(line)
        else:
            glyphs = {"THOUGHT": ("🧠", "cyan"), "ACTION": ("🔧", "blue"),
                      "OBSERVATION": ("👁", "dim")}
            glyph, color = glyphs.get(tao_type, ("•", "dim"))
            tag = f"[{step_id}] " if step_id else ""
            self._print_colored(f"   {glyph} {tag}{content}", color)

    async def _handle_prompt(self, prompt: str) -> None:
        """Send a prompt to the AI and stream the response."""
        # Add to conversation history
        self._messages.append({"role": "user", "content": prompt})

        # Build the full message list the model should see: the system prompt
        # plus the ENTIRE conversation including this turn. (cloud_engine uses
        # `messages` verbatim and ignores `prompt` when messages is provided, so
        # the current question must be inside `messages`.)
        sys_prompt = self._get_system_prompt()
        msgs = ([{"role": "system", "content": sys_prompt}] if sys_prompt else [])
        msgs += list(self._messages)

        full_response = ""
        token_count = 0
        t0 = time.time()

        try:
            stream = self._brain.stream_generate(
                prompt=prompt, system_prompt=sys_prompt, messages=msgs,
            )
            if _RICH and _console is not None:
                _console.print()
                agen = stream.__aiter__()
                # Spinner while we wait for the first token.
                first = None
                self._spin_active = True
                spin = asyncio.create_task(self._spin("thinking…"))
                try:
                    first = await agen.__anext__()
                except StopAsyncIteration:
                    first = None
                finally:
                    self._spin_active = False
                    await spin
                if first:
                    full_response += first
                    token_count += 1
                # Live-render the answer as Markdown while the rest streams in.
                with Live(console=_console, refresh_per_second=12,
                          vertical_overflow="visible") as live:
                    live.update(Markdown(full_response or "…"))
                    async for chunk in agen:
                        full_response += chunk
                        token_count += 1
                        live.update(Markdown(full_response or "…"))
                    live.update(Markdown(full_response or "_(no output)_"))
            else:
                print("\n", end="")
                async for chunk in stream:
                    print(chunk, end="", flush=True)
                    full_response += chunk
                    token_count += 1
                print()
        except Exception as e:
            self._print_colored(f"\n❌ Error: {e}\n", "red")
            return

        elapsed = time.time() - t0

        # Add assistant response to history
        self._messages.append({"role": "assistant", "content": full_response})

        # Subtle stats footer (blank line separates it from the answer)
        provider = self._brain.get_active_provider() if self._brain else {}
        if _RICH and _console is not None:
            _console.print()
        self._print_colored(
            f"  {provider.get('provider', '?')}/"
            f"{str(provider.get('model', '?'))[:30]}  ·  "
            f"{elapsed:.1f}s  ·  ~{token_count} tok",
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
            "/do": lambda: self._cmd_do(arg),
            "/chat": lambda: self._cmd_chat(arg),
            "/mode": lambda: self._cmd_mode(arg),
            "/auto": self._cmd_auto,
            "/tools": self._cmd_tools,
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
        if _RICH and _console is not None:
            table = self._new_table(
                {"header": "command", "style": f"bold {ACCENT}", "no_wrap": True},
                {"header": "what it does"},
                title="AETHER commands",
            )
            for cmd, desc in SLASH_COMMANDS.items():
                table.add_row(cmd, desc)
            self._emit_table(table)
            _console.print(
                Text("  tip: just type naturally — questions are answered, "
                     "tasks are executed.", style="italic " + MUTED)
            )
            _console.print()
        else:
            self._print_colored("\n📋 AETHER Commands\n", "cyan")
            for cmd, desc in SLASH_COMMANDS.items():
                self._print(f"  {cmd:15s} {desc}")
            self._print("")

    async def _cmd_do(self, arg: str) -> None:
        """Force agentic execution of a task."""
        if not arg:
            self._print("  Usage: /do <task description>\n")
            return
        await self._run_agentic(arg)

    async def _cmd_chat(self, arg: str) -> None:
        """Force a plain conversational reply (no tools)."""
        if not arg:
            self._print("  Usage: /chat <message>\n")
            return
        await self._handle_prompt(arg)

    async def _cmd_mode(self, arg: str) -> None:
        """View or set the default prompt-routing mode."""
        valid = ["auto", "chat", "agent"]
        descs = {
            "auto": "classify each prompt — act on tasks, else chat",
            "chat": "never use tools — plain conversation",
            "agent": "always run the agentic executor",
        }
        choice = arg.strip().lower()
        if choice in valid:
            self._mode = choice
            self._print_colored(f"\n🧭 Mode → {self._mode}\n", "cyan")
            return

        if self._interactive_ok():
            rows = [{"cells": [(m, "bold"), (descs[m], MUTED)], "value": m}
                    for m in valid]
            sel = self._arrow_select(
                f"routing mode   (current: {self._mode})", rows,
                start=valid.index(self._mode) if self._mode in valid else 0,
            )
            if sel:
                self._mode = sel
                self._print_colored(f"\n🧭 Mode → {self._mode}\n", "cyan")
            else:
                self._print_colored("  (unchanged)\n", "dim")
            return

        self._print_colored(f"\n  Current mode: {self._mode}", "cyan")
        self._print("  Usage: /mode auto|chat|agent\n")

    async def _cmd_auto(self) -> None:
        """Toggle auto-approve (bypass interactive y/N prompts)."""
        self._auto_approve = not self._auto_approve
        if self._auto_approve:
            self._print_colored(
                "\n⚡ Auto-approve ON — risky actions will run WITHOUT prompting. "
                "Use with care.\n", "yellow",
            )
        else:
            self._print_colored(
                "\n🔒 Auto-approve OFF — risky actions will ask for confirmation.\n",
                "green",
            )

    async def _cmd_tools(self) -> None:
        """Pick a tool, fill its arguments, and run it (supervisor-gated)."""
        if not self._toolbox:
            self._print_colored("\n  Toolbox not available in this mode.\n", "yellow")
            return
        tools = self._toolbox.list_tools()

        # Interactive: select a tool, then run it.
        if self._interactive_ok():
            rows = [{"cells": [(t.get("name", "?"), "bold"),
                               (t.get("description", ""), MUTED)], "value": t}
                    for t in tools]
            chosen = self._arrow_select(
                "run a tool   (Enter to run · Esc to cancel)", rows,
            )
            if not chosen:
                self._print_colored("  (cancelled)\n", "dim")
                return
            await self._run_tool_interactive(chosen)
            return

        # Non-interactive: just list.
        if _RICH and _console is not None:
            table = self._new_table(
                {"header": "tool", "style": f"bold {ACCENT}", "no_wrap": True},
                {"header": "description"},
                title=f"🧰 tools ({len(tools)})",
            )
            for t in tools:
                table.add_row(t.get("name", "?"), t.get("description", ""))
            self._emit_table(table)
            _console.print()
        else:
            self._print_colored("\n🧰 Available Tools\n", "cyan")
            for t in tools:
                self._print(f"  {t.get('name', '?'):16s} {t.get('description', '')}")
            self._print("")

    async def _run_tool_interactive(self, tool: dict) -> None:
        """Collect a tool's arguments, gate via the supervisor, then execute it."""
        name = tool.get("name", "")
        schema = tool.get("args", {}) or {}

        # Collect arguments.
        kwargs = {}
        if schema:
            self._print_colored(
                f"\n  arguments for '{name}' (blank = skip):", "cyan",
            )
            for arg_name, arg_type in schema.items():
                val = await self._ask_line(f"    {arg_name} ({arg_type}): ")
                if val != "":
                    kwargs[arg_name] = val

        # Supervisor gate (block / approval) for non-trivial actions.
        action_desc = f"{name}: {json.dumps(kwargs, ensure_ascii=False)}"
        if self._supervisor:
            try:
                v = self._supervisor.validate(action=action_desc)
                if not v.is_safe:
                    self._print_colored(f"\n  ⛔ Blocked: {v.reason}\n", "red")
                    return
                if v.requires_approval and not self._auto_approve:
                    ok = await self._approve_action(
                        action_desc, getattr(v, "risk_level", "high"),
                        getattr(v, "reason", None), getattr(v, "warnings", []),
                    )
                    if not ok:
                        return
            except Exception:
                pass

        # Execute (with a spinner).
        self._spin_active = True
        spin = asyncio.create_task(self._spin(f"running {name}…")) \
            if (_RICH and _console is not None) else None
        result, err = None, None
        try:
            result = await self._toolbox.execute(name, kwargs=kwargs)
        except Exception as e:
            err = str(e)
        finally:
            self._spin_active = False
            if spin:
                await spin

        if err is not None:
            self._print_colored(f"\n  ❌ {name} failed: {err}\n", "red")
            return

        ok = getattr(result, "success", False)
        out = getattr(result, "output", None)
        error = getattr(result, "error", None)
        body = str(out if ok else error)
        if len(body) > 4000:
            body = body[:4000] + "\n… (truncated)"

        if _RICH and _console is not None:
            _console.print(Panel(
                body or "(empty)",
                title=f"{'✅' if ok else '❌'} {name}",
                title_align="left",
                border_style="green" if ok else "red",
                box=box.ROUNDED, padding=(0, 1),
            ))
            _console.print()
        else:
            self._print_colored(
                f"\n  {'✅' if ok else '❌'} {name}:\n{body}\n",
                "green" if ok else "red",
            )

    async def _cmd_model(self, arg: str) -> None:
        engine = self._brain.llm._cloud_engine if self._brain else None
        active = self._brain.get_active_provider() if self._brain else {}
        ap, am = active.get("provider", "?"), active.get("model", "?")

        if not arg:
            # Interactive arrow-key picker (when we have a TTY); else static list.
            if engine and self._interactive_ok():
                from brain.cloud_engine import PROVIDER_REGISTRY
                rows, start = [], 0
                for i, (pid, spec) in enumerate(PROVIDER_REGISTRY.items()):
                    pv = pid.value
                    has_key = pv == "ollama" or bool(engine.api_keys.get(pv, "").strip())
                    model = engine.provider_models.get(pv) or spec.default_model
                    status = ("ready", "green") if has_key else ("needs key", "yellow")
                    rows.append({"cells": [(pv, "bold"), status, (model, MUTED)],
                                 "value": pv})
                    if pv == ap:
                        start = i
                chosen = self._arrow_select(
                    f"select model   (active: {ap} / {am})", rows, start=start,
                )
                if chosen:
                    await self._apply_model(chosen)
                else:
                    self._print_colored("  (unchanged)\n", "dim")
                return

            # Non-interactive fallback: print the table.
            if _RICH and _console is not None and engine:
                from brain.cloud_engine import PROVIDER_REGISTRY
                table = self._new_table(
                    {"header": "", "width": 1},
                    {"header": "provider", "style": "bold", "no_wrap": True},
                    {"header": "status", "no_wrap": True},
                    {"header": "model", "style": MUTED},
                    title=f"🤖 active: {ap} / {am}",
                )
                for pid, spec in PROVIDER_REGISTRY.items():
                    pv = pid.value
                    has_key = pv == "ollama" or bool(engine.api_keys.get(pv, "").strip())
                    mark = "[bright_cyan]→[/bright_cyan]" if pv == ap else " "
                    status = "[green]ready[/green]" if has_key else "[yellow]needs key[/yellow]"
                    model = engine.provider_models.get(pv) or spec.default_model
                    table.add_row(mark, pv, status, model)
                self._emit_table(table)
                _console.print(Text(
                    "  switch: /model <provider> [model]   "
                    "e.g. /model ollama llama3.2:3b  ·  saved for next time",
                    style="italic " + MUTED,
                ))
                _console.print()
            else:
                self._print_colored(f"\n🤖 Active: {ap} / {am}\n", "cyan")
                if engine:
                    from brain.cloud_engine import PROVIDER_REGISTRY
                    self._print("  Providers (✓ = ready to use):")
                    for pid, spec in PROVIDER_REGISTRY.items():
                        pv = pid.value
                        has_key = pv == "ollama" or bool(engine.api_keys.get(pv, "").strip())
                        mark = "→" if pv == ap else " "
                        status = "✓" if has_key else "needs key"
                        model = engine.provider_models.get(pv) or spec.default_model
                        self._print(f"   {mark} {pv:11s} {status:9s} {model}")
                self._print("\n  Switch:  /model <provider> [model]")
                self._print("  Example: /model ollama llama3.2:3b   ·   /model groq")
                self._print("  (your choice is saved for next time)\n")
            return

        # Direct form: /model <provider> [model]
        parts = arg.split(maxsplit=1)
        provider = parts[0].lower()
        model = parts[1].strip() if len(parts) > 1 else ""

        valid = {"groq", "cerebras", "openai", "anthropic",
                 "mistral", "gemini", "openrouter", "ollama"}
        if provider not in valid:
            self._print_colored(f"\n  Unknown provider: {provider}\n", "yellow")
            self._print(f"  Choose one of: {', '.join(sorted(valid))}\n")
            return

        await self._apply_model(provider, model)

    async def _cmd_models(self) -> None:
        engine = self._brain.llm._cloud_engine if self._brain else None
        if engine is None:
            self._print_colored("\n  No model engine available.\n", "yellow")
            return

        active = self._brain.get_active_provider()
        active_pid = active.get("provider", "")
        active_model = active.get("model", "")

        # Discover local Ollama models (best-effort).
        ollama_models = []
        try:
            ollama_models = await self._brain.llm.list_models()
        except Exception:
            pass

        from brain.cloud_engine import PROVIDER_REGISTRY

        # Build a unified list: each local Ollama model is individually
        # selectable; cloud providers use their default model.
        rows, start, idx = [], 0, 0
        for m in ollama_models:
            rows.append({
                "cells": [("ollama", "bold"), (m, MUTED), ("local", "green")],
                "value": ("ollama", m),
            })
            if active_pid == "ollama" and active_model == m:
                start = idx
            idx += 1
        for pid, spec in PROVIDER_REGISTRY.items():
            pv = pid.value
            if pv == "ollama" and ollama_models:
                continue  # already listed individually above
            has_key = pv == "ollama" or bool(engine.api_keys.get(pv, "").strip())
            model = engine.provider_models.get(pv) or spec.default_model
            status = ("ready", "green") if has_key else ("needs key", "yellow")
            rows.append({
                "cells": [(pv, "bold"), (model, MUTED), status],
                "value": (pv, ""),
            })
            if active_pid == pv and pv != "ollama":
                start = idx
            idx += 1

        # Interactive picker when we have a TTY.
        if self._interactive_ok():
            chosen = self._arrow_select(
                f"select model   (active: {active_pid} / {active_model})",
                rows, start=start,
            )
            if chosen:
                prov, mdl = chosen
                await self._apply_model(prov, mdl)
            else:
                self._print_colored("  (unchanged)\n", "dim")
            return

        # Non-interactive fallback: print a table.
        if _RICH and _console is not None:
            table = self._new_table(
                {"header": "", "width": 1},
                {"header": "provider", "style": "bold", "no_wrap": True},
                {"header": "model", "style": MUTED},
                {"header": "status", "no_wrap": True},
                title="📦 providers & models",
            )
            for r in rows:
                prov, mdl = r["value"]
                is_active = (prov == active_pid and (not mdl or mdl == active_model))
                mark = "[bright_cyan]→[/bright_cyan]" if is_active else " "
                cells = r["cells"]
                table.add_row(mark, cells[0][0], cells[1][0],
                              f"[{cells[2][1]}]{cells[2][0]}[/{cells[2][1]}]")
            self._emit_table(table)
            _console.print()
        else:
            self._print_colored("\n📦 Available Models\n", "cyan")
            for r in rows:
                prov, mdl = r["value"]
                self._print(f"  {prov:11s} {r['cells'][1][0]:34s} {r['cells'][2][0]}")
            self._print("")

    async def _cmd_think(self, arg: str) -> None:
        depths = ["fast", "balanced", "deep"]
        descs = {
            "fast": "concise, direct — short answers",
            "balanced": "balance thoroughness with concision",
            "deep": "step-by-step reasoning, consider edge cases",
        }
        choice = arg.strip().lower()
        if choice in depths:
            self._thinking_depth = choice
            self._print_colored(f"\n🧠 Thinking depth → {self._thinking_depth}\n", "cyan")
            return

        if self._interactive_ok():
            rows = [{"cells": [(d, "bold"), (descs[d], MUTED)], "value": d}
                    for d in depths]
            sel = self._arrow_select(
                f"thinking depth   (current: {self._thinking_depth})", rows,
                start=depths.index(self._thinking_depth)
                if self._thinking_depth in depths else 1,
            )
            if sel:
                self._thinking_depth = sel
                self._print_colored(f"\n🧠 Thinking depth → {self._thinking_depth}\n", "cyan")
            else:
                self._print_colored("  (unchanged)\n", "dim")
            return

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
        """Spawn a subagent on a task, wait for it, and show the result."""
        if not self._subagent_registry:
            self._print_colored("\n  SubagentRegistry not available.\n", "yellow")
            return

        task = arg.strip()
        if not task:
            if not self._interactive_ok():
                self._print("  Usage: /agent <task>\n")
                return
            task = await self._ask_line("  task for the agent: ")
            if not task:
                self._print_colored("  (cancelled)\n", "dim")
                return

        label = task.split()[0][:20] if task else "agent"

        async def execute_fn(task_str: str, model: str = "") -> str:
            return await self._brain.generate(prompt=task_str)

        try:
            run_id = await self._subagent_registry.spawn(
                label=label, task=task, parent_session="cli", execute_fn=execute_fn,
            )
        except Exception as e:
            self._print_colored(f"\n  ❌ Could not spawn agent: {e}\n", "red")
            return

        self._print_colored(f"\n  🤖 agent '{label}' [{run_id[:8]}] started", "cyan")

        # Wait for completion with a spinner.
        self._spin_active = True
        spin = asyncio.create_task(self._spin("agent working…")) \
            if (_RICH and _console is not None) else None
        rec, err = None, None
        try:
            rec = await self._subagent_registry.wait(run_id)
        except Exception as e:
            err = str(e)
        finally:
            self._spin_active = False
            if spin:
                await spin

        if rec is None:
            self._print_colored(f"  (agent error: {err})\n", "red")
            return

        status = rec.status.value if hasattr(rec.status, "value") else str(rec.status)
        out = getattr(rec, "result", None) or getattr(rec, "error", None) or "(no output)"
        out = str(out)
        if len(out) > 4000:
            out = out[:4000] + "\n… (truncated)"

        if _RICH and _console is not None:
            ok = status.lower() in ("completed", "success", "done")
            _console.print(Panel(
                Markdown(out) if ok else out,
                title=f"🤖 {label} · {status}", title_align="left",
                border_style="green" if ok else "yellow",
                box=box.ROUNDED, padding=(0, 1),
            ))
            _console.print()
        else:
            self._print_colored(f"\n  agent {label} → {status}\n", "cyan")
            self._print(out + "\n")

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

        # Honor --model / -m: select the preferred provider up front.
        if self._preferred_provider and getattr(brain, "llm", None) \
                and getattr(brain.llm, "_cloud_engine", None):
            brain.llm._cloud_engine.preferred_provider = self._preferred_provider

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

        # Build the full agentic executor: Toolbox + Worker (HIL-wired) +
        # specialist agents + Manager. Degrades gracefully — if any piece fails
        # to import, the CLI stays usable as a chat REPL.
        try:
            from toolbox import Toolbox
            from agents.worker_agent import WorkerAgent
            from agents.manager_agent import ManagerAgent

            self._toolbox = Toolbox()

            # MCP + custom tools are optional enhancements.
            try:
                from toolbox.mcp_client_manager import MCPClientManager
                MCPClientManager(self._toolbox)
            except Exception:
                pass
            try:
                self._toolbox.load_custom_tools(
                    config.get("custom_tools_path", "./custom_tools")
                    if hasattr(config, "get") else "./custom_tools"
                )
            except Exception:
                pass

            if self._supervisor is None:
                from supervisor import AgenticSupervisor
                self._supervisor = AgenticSupervisor()

            worker = WorkerAgent(
                brain=self._brain,
                toolbox=self._toolbox,
                supervisor=self._supervisor,
                approval_callback=self._approve_action,  # interactive HIL
            )

            # Specialist agents (optional — best-effort).
            security_auditor = code_architect = researcher = qa_engineer = None
            try:
                from agents.security_auditor import SecurityAuditorAgent
                security_auditor = SecurityAuditorAgent(self._brain)
            except Exception:
                pass
            try:
                from agents.code_architect import CodeArchitectAgent
                code_architect = CodeArchitectAgent(self._brain)
            except Exception:
                pass
            try:
                from agents.researcher import ResearchAgent
                researcher = ResearchAgent(self._brain, self._toolbox)
            except Exception:
                pass
            try:
                from agents.qa_engineer import QAAgent
                qa_engineer = QAAgent(self._brain, self._toolbox)
            except Exception:
                pass

            self._manager = ManagerAgent(
                brain=self._brain,
                worker=worker,
                security_auditor=security_auditor,
                code_architect=code_architect,
                researcher=researcher,
                qa_engineer=qa_engineer,
                failure_limit=config.get("agent_failure_limit", 3)
                if hasattr(config, "get") else 3,
                memory=self._memory,
                event_emitter=self._emit_tao_pretty,  # pretty CLI TAO output
            )
        except Exception as e:
            self._manager = None
            self._print_colored(
                f"  ⚠ Agentic executor unavailable ({e}); chat-only mode.\n", "dim",
            )

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

            active = self._brain.get_active_provider()
            ap = active.get("provider", "?")
            n_tools = len(self._toolbox.list_tools()) if self._toolbox else 0

            if _RICH and _console is not None:
                line = Text("  ")
                line.append("● ", style="green" if ollama_ok else "red")
                line.append("Ollama" if ollama_ok else "Ollama offline", style=MUTED)
                line.append("   ☁ ", style=MUTED)
                line.append(
                    f"{cloud_count} cloud" if cloud_count else "no cloud keys",
                    style=MUTED,
                )
                line.append("   active: ", style=MUTED)
                line.append(ap, style=ACCENT)
                _console.print(line)

                if self._manager is not None:
                    s = Text("  ")
                    s.append("⚙ agentic ready", style="green")
                    s.append(f"  ·  {n_tools} tools  ·  mode ", style=MUTED)
                    s.append(self._mode, style=ACCENT)
                    s.append("  ·  approval ", style=MUTED)
                    s.append("auto" if self._auto_approve else "ask",
                             style="yellow" if self._auto_approve else "green")
                    s.append("  ·  /help", style=MUTED)
                    _console.print(s)
                else:
                    _console.print(Text("  💬 chat-only (agentic executor not loaded)",
                                        style=MUTED))
                _console.print()
            else:
                parts = ["🟢 Ollama (local)" if ollama_ok else "🔴 Ollama offline"]
                parts.append(f"☁️  {cloud_count} cloud provider(s)" if cloud_count
                             else "💡 Add cloud keys in /config")
                self._print_colored(f"  {' · '.join(parts)}\n", "dim")
                if self._manager is not None:
                    self._print_colored(
                        f"  🤖 Agentic executor ready ({n_tools} tools) · "
                        f"mode={self._mode} · approval={'auto' if self._auto_approve else 'ask'}"
                        " · /help for commands\n", "dim",
                    )
                else:
                    self._print_colored(
                        "  💬 Chat-only mode (agentic executor not loaded)\n", "dim")
        except Exception:
            pass

    def _print_banner(self) -> None:
        if _RICH and _console is not None:
            art = Text(BANNER_ART, style=f"bold {ACCENT}")
            tagline = Text(
                "Autonomous Execution & Thinking Hybrid Engine Runtime",
                style="italic " + MUTED, justify="center",
            )
            hint = Text(
                "type naturally  ·  /help for commands  ·  local Ollama + optional cloud",
                style=MUTED, justify="center",
            )
            _console.print()
            _console.print(Panel(
                Group(Align.center(art), Text(""), Align.center(tagline), Align.center(hint)),
                box=box.DOUBLE, border_style=ACCENT, padding=(1, 4),
            ))
        else:
            self._print_colored(BANNER, "cyan")

    def _build_session(self) -> None:
        """Build the interactive prompt_toolkit session (completion + history)."""
        if not (_PTK and sys.stdin.isatty()):
            return
        try:
            providers = ["ollama", "gemini", "groq", "cerebras", "openai",
                         "anthropic", "mistral", "openrouter"]
            spec = {cmd: None for cmd in SLASH_COMMANDS}
            spec["/mode"] = {"auto": None, "chat": None, "agent": None}
            spec["/think"] = {"fast": None, "balanced": None, "deep": None}
            spec["/model"] = {p: None for p in providers}
            completer = NestedCompleter.from_nested_dict(spec)

            history = None
            try:
                hist_path = Path.home() / ".aether" / "cli_history"
                hist_path.parent.mkdir(parents=True, exist_ok=True)
                history = FileHistory(str(hist_path))
            except Exception:
                pass

            self._session = PromptSession(
                history=history,
                auto_suggest=AutoSuggestFromHistory(),
                completer=completer,
                complete_while_typing=True,
                style=PTStyle.from_dict({"prompt": "bold ansibrightcyan"}),
            )
        except Exception:
            self._session = None

    async def _read_input(self) -> Optional[str]:
        """Read a line of input — interactive (completion + history) when available."""
        if self._session is not None:
            try:
                return await self._session.prompt_async(HTML("<prompt>❯</prompt> "))
            except EOFError:
                return None
            # KeyboardInterrupt intentionally propagates to the run() loop.
        # Fallback: plain input with an ANSI chevron.
        try:
            return input("\033[1;96m❯\033[0m ")
        except EOFError:
            return None

    # ------------------------------------------------------------------
    # Rendering helpers (rich with graceful ANSI fallback)
    # ------------------------------------------------------------------

    def _panel(self, body, title: str = None, style: str = ACCENT,
               subtitle: str = None) -> None:
        """Render content inside a rounded panel (or a simple block if no rich)."""
        if _RICH and _console is not None:
            _console.print(Panel(
                body, title=title, subtitle=subtitle, title_align="left",
                subtitle_align="right", border_style=style, box=box.ROUNDED,
                padding=(0, 1),
            ))
        else:
            if title:
                self._print_colored(f"\n— {title} —", "cyan")
            self._print(body if isinstance(body, str) else str(body))

    def _rule(self, text: str = "", style: str = ACCENT) -> None:
        if _RICH and _console is not None:
            _console.print(Rule(text, style=style))
        else:
            self._print_colored(f"\n── {text} " + "─" * max(2, 40 - len(text)), "dim")

    def _new_table(self, *columns, title: str = None):
        """Create a styled table; returns the Table (rich) or None (fallback)."""
        if not (_RICH and _console is not None):
            return None
        t = Table(title=title, box=box.SIMPLE_HEAVY, title_style=f"bold {ACCENT}",
                  header_style=f"bold {ACCENT}", expand=False, pad_edge=False)
        for col in columns:
            if isinstance(col, dict):
                t.add_column(**col)
            else:
                t.add_column(col)
        return t

    def _emit_table(self, table) -> None:
        if _RICH and _console is not None and table is not None:
            _console.print(table)

    async def _spin(self, text: str) -> None:
        """Show an animated spinner until self._spin_active is cleared."""
        if not (_RICH and _console is not None):
            return
        try:
            with _console.status(f"[bright_cyan]{text}[/bright_cyan]", spinner="dots"):
                while self._spin_active:
                    await asyncio.sleep(0.08)
        except Exception:
            pass

    async def _ask_line(self, label: str) -> str:
        """Prompt for one line of free text (used to collect command arguments)."""
        loop = asyncio.get_event_loop()
        try:
            return (await loop.run_in_executor(None, input, label)).strip()
        except (EOFError, KeyboardInterrupt):
            return ""

    def _interactive_ok(self) -> bool:
        """True when we can run an arrow-key menu (rich + readchar + a TTY)."""
        try:
            return bool(_RICH and _console is not None and _READCHAR
                        and sys.stdin.isatty() and sys.stdout.isatty())
        except Exception:
            return False

    def _arrow_select(self, title: str, rows: list, start: int = 0,
                      hint: str = None):
        """Interactive arrow-key menu.

        rows: list of {"cells": [(text, style), ...], "value": any}.
        Returns the chosen row's "value", or None if cancelled / not interactive.
        """
        if not self._interactive_ok() or not rows:
            return None

        idx = max(0, min(start, len(rows) - 1))
        ncols = 1 + max(len(r["cells"]) for r in rows)

        def render():
            t = Table(box=box.ROUNDED, border_style=ACCENT, title=title,
                      title_style=f"bold {ACCENT}", title_justify="left",
                      show_header=False, expand=False, padding=(0, 1))
            for _ in range(ncols):
                t.add_column(overflow="fold")
            for i, r in enumerate(rows):
                selected = (i == idx)
                pointer = Text("❯" if selected else " ",
                               style=f"bold {ACCENT}" if selected else "")
                cells = [
                    Text(str(txt), style=(f"bold {ACCENT}" if selected else stl))
                    for (txt, stl) in r["cells"]
                ]
                t.add_row(pointer, *cells)
            return Group(t, Text(
                hint or "  ↑/↓ move · Enter select · Esc cancel",
                style="italic " + MUTED,
            ))

        with Live(render(), console=_console, auto_refresh=False, screen=False) as live:
            while True:
                try:
                    key = readchar.readkey()
                except KeyboardInterrupt:
                    return None
                if key == readchar.key.UP:
                    idx = (idx - 1) % len(rows)
                elif key == readchar.key.DOWN:
                    idx = (idx + 1) % len(rows)
                elif key in (readchar.key.ENTER, "\r", "\n"):
                    return rows[idx].get("value", idx)
                elif key in (readchar.key.ESC, "q", "\x03"):
                    return None
                live.update(render(), refresh=True)

    async def _apply_model(self, provider: str, model: str = "") -> None:
        """Switch the active provider (and optional model) and persist it."""
        engine = self._brain.llm._cloud_engine if self._brain else None

        if engine and provider != "ollama" and not engine.api_keys.get(provider, "").strip():
            self._print_colored(
                f"  ⚠ No API key set for {provider}. Add one with:\n"
                f'    /config api_keys {{"{provider}": "YOUR_KEY"}}\n', "yellow",
            )

        if engine:
            engine.preferred_provider = provider
            if model:
                engine.provider_models[provider] = model

        if self._config:
            try:
                await self._config.set("ai_provider", provider)
                if model:
                    pm = dict(self._config.get("provider_models", {}) or {})
                    pm[provider] = model
                    await self._config.set("provider_models", pm)
            except Exception as e:
                self._print_colored(f"  (could not persist choice: {e})\n", "dim")

        self._print_colored(
            f"\n✅ Active provider → {provider}"
            f"{(' / ' + model) if model else ''}  (saved)\n", "green",
        )

    def _print_banner_legacy(self) -> None:
        self._print_colored(BANNER, "cyan")

    @staticmethod
    def _print(*args, **kwargs) -> None:
        if _RICH and _console is not None:
            end = kwargs.pop("end", "\n")
            kwargs.pop("flush", None)
            text = " ".join(str(a) for a in args)
            _console.print(Text(text), end=end, soft_wrap=True)
        else:
            print(*args, **kwargs)

    @staticmethod
    def _print_colored(text: str, color: str, **kwargs) -> None:
        end = kwargs.pop("end", "\n")
        kwargs.pop("flush", None)
        if _RICH and _console is not None:
            style_map = {
                "red": "red", "green": "green", "yellow": "yellow",
                "blue": "blue", "magenta": "magenta", "cyan": ACCENT,
                "dim": MUTED,
            }
            _console.print(Text(str(text), style=style_map.get(color, "")),
                           end=end, soft_wrap=True)
        else:
            colors = {
                "red": "\033[31m", "green": "\033[32m", "yellow": "\033[33m",
                "blue": "\033[34m", "magenta": "\033[35m", "cyan": "\033[36m",
                "dim": "\033[2m",
            }
            code = colors.get(color, "")
            print(f"{code}{text}\033[0m", end=end)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    """Entry point for the `aether` command."""
    import argparse

    # Make sibling kernel packages (brain, memory, agents, toolbox, supervisor…)
    # importable no matter how the command was launched (pip entry point,
    # PyInstaller binary, symlink, or `python aether_cli.py`).
    kernel_dir = str(Path(__file__).resolve().parent)
    if kernel_dir not in sys.path:
        sys.path.insert(0, kernel_dir)

    # The UI is emoji-rich; legacy Windows consoles (cp1252) would otherwise
    # raise UnicodeEncodeError. Force UTF-8 with a safe fallback. stdin is
    # included so piped/redirected UTF-8 (incl. a BOM) decodes correctly.
    for _stream in (sys.stdout, sys.stderr, sys.stdin):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

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
