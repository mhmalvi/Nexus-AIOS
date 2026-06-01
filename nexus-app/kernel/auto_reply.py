"""
AETHER Auto-Reply Engine — Message Delivery & Platform Chunking

Handles delivering AI responses across different channels (CLI, desktop,
WhatsApp, Discord, Telegram, etc.) with proper message splitting.

Each platform has different message length limits:
- WhatsApp: ~4096 chars
- Discord: 2000 chars
- Telegram: 4096 chars
- SMS: 160 chars
- CLI/Desktop: unlimited

Features:
- Smart sentence-boundary splitting (never breaks mid-sentence)
- Code block preservation (never splits inside ```...```)
- Platform-specific formatting
- Directive detection (commands embedded in messages)
- Rate limiting per channel
- Reply queuing for bursty AI responses
- 70+ command registry with category-based lookup
- Message templates for platform-specific formatting
- Heartbeat system for health monitoring

Inspired by OpenClaw's auto-reply/chunk.ts (209 files)
"""

import asyncio
import logging
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Dict, Any, Callable, Awaitable, Tuple

logger = logging.getLogger("aether.auto_reply")


# ---------------------------------------------------------------------------
# Platform definitions
# ---------------------------------------------------------------------------

class Platform(str, Enum):
    CLI = "cli"
    DESKTOP = "desktop"
    WHATSAPP = "whatsapp"
    DISCORD = "discord"
    TELEGRAM = "telegram"
    SLACK = "slack"
    SIGNAL = "signal"
    SMS = "sms"


PLATFORM_LIMITS: Dict[Platform, int] = {
    Platform.CLI: 999_999,       # effectively unlimited
    Platform.DESKTOP: 999_999,
    Platform.WHATSAPP: 4096,
    Platform.DISCORD: 2000,
    Platform.TELEGRAM: 4096,
    Platform.SLACK: 40_000,
    Platform.SIGNAL: 6000,
    Platform.SMS: 160,
}


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

@dataclass
class MessageChunk:
    """A single chunk ready for delivery."""
    content: str
    index: int          # 0-based chunk number
    total: int          # total number of chunks
    platform: Platform
    has_continuation: bool = False

    @property
    def char_count(self) -> int:
        return len(self.content)


@dataclass
class DeliveryResult:
    """Result of delivering a message."""
    chunks_sent: int
    chunks_total: int
    platform: Platform
    errors: List[str] = field(default_factory=list)
    delivery_time_ms: float = 0.0

    @property
    def success(self) -> bool:
        return not self.errors


@dataclass
class Directive:
    """A command embedded in a message (e.g., /search, /remind)."""
    command: str
    args: str
    raw: str


# ---------------------------------------------------------------------------
# Command Registry — 70+ slash commands (OpenClaw parity)
# ---------------------------------------------------------------------------

class CommandCategory(str, Enum):
    GENERAL = "general"
    MODEL = "model"
    MEMORY = "memory"
    AGENT = "agent"
    TOOL = "tool"
    VOICE = "voice"
    SECURITY = "security"
    SYSTEM = "system"
    BROWSER = "browser"
    CONFIG = "config"


@dataclass
class CommandDef:
    """Definition of a registered slash command."""
    name: str
    description: str
    category: CommandCategory
    usage: str = ""
    aliases: List[str] = field(default_factory=list)
    requires_args: bool = False
    owner_only: bool = False
    handler: Optional[str] = None  # method name to dispatch to

    @property
    def help_line(self) -> str:
        alias_str = f" (aliases: {', '.join(self.aliases)})" if self.aliases else ""
        return f"/{self.name} — {self.description}{alias_str}"


class CommandRegistry:
    """
    Registry of 70+ slash commands organized by category.

    Usage:
        registry = CommandRegistry()
        cmd = registry.lookup("/model")
        cmds = registry.by_category(CommandCategory.AGENT)
        help_text = registry.help_text()
    """

    def __init__(self):
        self._commands: Dict[str, CommandDef] = {}
        self._aliases: Dict[str, str] = {}  # alias -> canonical name
        self._register_defaults()

    def register(self, cmd: CommandDef) -> None:
        """Register a command definition."""
        self._commands[cmd.name] = cmd
        for alias in cmd.aliases:
            self._aliases[alias] = cmd.name

    def unregister(self, name: str) -> bool:
        """Remove a command. Returns True if found."""
        cmd = self._commands.pop(name, None)
        if cmd:
            for alias in cmd.aliases:
                self._aliases.pop(alias, None)
            return True
        return False

    def lookup(self, name: str) -> Optional[CommandDef]:
        """Look up a command by name or alias (with or without leading /)."""
        clean = name.lstrip("/").lower()
        canonical = self._aliases.get(clean, clean)
        return self._commands.get(canonical)

    def by_category(self, category: CommandCategory) -> List[CommandDef]:
        """Get all commands in a category."""
        return [c for c in self._commands.values() if c.category == category]

    def all_commands(self) -> List[CommandDef]:
        """Get all registered commands sorted by category then name."""
        return sorted(self._commands.values(), key=lambda c: (c.category.value, c.name))

    def help_text(self, category: Optional[CommandCategory] = None) -> str:
        """Generate formatted help text."""
        lines = ["⚡ AETHER Commands", ""]
        cats = [category] if category else list(CommandCategory)
        for cat in cats:
            cmds = self.by_category(cat)
            if not cmds:
                continue
            lines.append(f"━━ {cat.value.upper()} ━━")
            for cmd in sorted(cmds, key=lambda c: c.name):
                usage = f"  {cmd.usage}" if cmd.usage else ""
                lines.append(f"  /{cmd.name}{usage} — {cmd.description}")
            lines.append("")
        return "\n".join(lines)

    @property
    def count(self) -> int:
        return len(self._commands)

    def _register_defaults(self) -> None:
        """Register all 70+ built-in commands."""
        _defs: List[Tuple[str, str, CommandCategory, str, List[str], bool, bool]] = [
            # ── General ──
            ("help",       "Show all available commands",                    CommandCategory.GENERAL, "[category]",          ["h", "?"],     False, False),
            ("status",     "Show AETHER system status",                     CommandCategory.GENERAL, "",                    ["st"],         False, False),
            ("version",    "Show AETHER version",                           CommandCategory.GENERAL, "",                    ["ver"],        False, False),
            ("clear",      "Clear conversation context",                    CommandCategory.GENERAL, "",                    ["cls"],        False, False),
            ("compact",    "Compact context to save tokens",                CommandCategory.GENERAL, "",                    [],             False, False),
            ("save",       "Save conversation to file",                     CommandCategory.GENERAL, "[filename]",          [],             False, False),
            ("load",       "Load conversation from file",                   CommandCategory.GENERAL, "<filename>",          [],             True,  False),
            ("export",     "Export conversation as markdown",               CommandCategory.GENERAL, "[filename]",          [],             False, False),
            ("history",    "Show conversation history",                     CommandCategory.GENERAL, "[n]",                 ["hist"],       False, False),
            ("undo",       "Undo last AI action",                           CommandCategory.GENERAL, "",                    [],             False, False),
            ("redo",       "Redo undone action",                            CommandCategory.GENERAL, "",                    [],             False, False),
            ("exit",       "Exit AETHER CLI",                               CommandCategory.GENERAL, "",                    ["quit", "q"],  False, False),

            # ── Model ──
            ("model",      "Switch AI provider or model",                   CommandCategory.MODEL,   "<provider/model>",    ["m"],          False, False),
            ("models",     "List available models",                         CommandCategory.MODEL,   "",                    [],             False, False),
            ("think",      "Set thinking depth (off/low/medium/high)",      CommandCategory.MODEL,   "<depth>",             ["t"],          False, False),
            ("temperature","Set generation temperature",                    CommandCategory.MODEL,   "<0.0-2.0>",           ["temp"],       True,  False),
            ("tokens",     "Show token usage for current session",          CommandCategory.MODEL,   "",                    [],             False, False),
            ("fallback",   "Configure model fallback chain",                CommandCategory.MODEL,   "[list|set|clear]",    [],             False, False),
            ("provider",   "Switch AI provider quickly",                    CommandCategory.MODEL,   "<name>",              ["prov"],       True,  False),
            ("cost",       "Show estimated API costs",                      CommandCategory.MODEL,   "",                    [],             False, False),

            # ── Memory ──
            ("memory",     "Search memory by query",                        CommandCategory.MEMORY,  "<query>",             ["mem"],        True,  False),
            ("remember",   "Store information in memory",                   CommandCategory.MEMORY,  "<text>",              ["rem"],        True,  False),
            ("forget",     "Delete specific memory",                        CommandCategory.MEMORY,  "<id|query>",          [],             True,  False),
            ("qmd",        "Manage Quick Memory Documents",                 CommandCategory.MEMORY,  "<create|list|get|delete>", [],        False, False),
            ("index",      "Index files into memory",                       CommandCategory.MEMORY,  "<path>",              [],             True,  False),
            ("search",     "Semantic search across all memory tiers",       CommandCategory.MEMORY,  "<query>",             [],             True,  False),
            ("context",    "Show current context window usage",             CommandCategory.MEMORY,  "",                    ["ctx"],        False, False),
            ("tiers",      "Show memory tier breakdown",                    CommandCategory.MEMORY,  "",                    [],             False, False),

            # ── Agent ──
            ("agent",      "Create/manage a subagent",                      CommandCategory.AGENT,   "<name> <task>",       [],             True,  False),
            ("agents",     "List all active agents",                        CommandCategory.AGENT,   "",                    ["ag"],         False, False),
            ("spawn",      "Spawn a new subagent",                          CommandCategory.AGENT,   "<type> <task>",       [],             True,  False),
            ("kill",       "Stop a running agent",                          CommandCategory.AGENT,   "<name|id>",           ["stop"],       True,  False),
            ("pause",      "Pause an agent",                                CommandCategory.AGENT,   "<name|id>",           [],             True,  False),
            ("resume",     "Resume a paused agent",                         CommandCategory.AGENT,   "<name|id>",           [],             True,  False),
            ("logs",       "Show agent execution logs",                     CommandCategory.AGENT,   "[name|id]",           [],             False, False),
            ("clone",      "Clone an agent configuration",                  CommandCategory.AGENT,   "<name> <new_name>",   [],             True,  False),
            ("crew",       "Manage CrewAI agent teams",                     CommandCategory.AGENT,   "<create|list|run>",   [],             False, False),

            # ── Tool ──
            ("tools",      "List available tools",                          CommandCategory.TOOL,    "",                    [],             False, False),
            ("run",        "Execute a tool directly",                       CommandCategory.TOOL,    "<tool> [args]",       [],             True,  False),
            ("shell",      "Execute a shell command",                       CommandCategory.TOOL,    "<command>",           ["sh", "!"],    True,  False),
            ("edit",       "Open file in code editor",                      CommandCategory.TOOL,    "<file>",              [],             True,  False),
            ("read",       "Read file contents",                            CommandCategory.TOOL,    "<file>",              ["cat"],        True,  False),
            ("write",      "Write content to file",                         CommandCategory.TOOL,    "<file> <content>",    [],             True,  False),
            ("diff",       "Show diff of AI changes",                       CommandCategory.TOOL,    "",                    [],             False, False),
            ("mcp",        "Manage MCP server connections",                 CommandCategory.TOOL,    "<list|connect|disconnect>", [],       False, False),

            # ── Voice ──
            ("voice",      "Toggle voice mode on/off",                      CommandCategory.VOICE,   "[on|off|mode]",       ["v"],          False, False),
            ("speak",      "Speak text aloud",                              CommandCategory.VOICE,   "<text>",              ["say", "tts"], True,  False),
            ("listen",     "Listen for voice input",                        CommandCategory.VOICE,   "[duration]",          [],             False, False),
            ("wake",       "Set wake word",                                 CommandCategory.VOICE,   "<word>",              [],             True,  False),
            ("ambient",    "Toggle ambient listening",                      CommandCategory.VOICE,   "[on|off]",            [],             False, False),
            ("volume",     "Set TTS volume",                                CommandCategory.VOICE,   "<0-100>",             ["vol"],        True,  False),
            ("speed",      "Set TTS speed",                                 CommandCategory.VOICE,   "<0.5-2.0>",           [],             True,  False),

            # ── Browser ──
            ("browse",     "Navigate to URL and extract content",           CommandCategory.BROWSER, "<url> [task]",        ["web"],        True,  False),
            ("screenshot", "Take browser screenshot",                       CommandCategory.BROWSER, "[full]",              ["ss"],         False, False),
            ("extract",    "Extract data from current page",                CommandCategory.BROWSER, "<query>",             [],             True,  False),
            ("tabs",       "List open browser tabs",                        CommandCategory.BROWSER, "",                    [],             False, False),
            ("close_tab",  "Close a browser tab",                           CommandCategory.BROWSER, "[tab_id]",            [],             False, False),

            # ── Security ──
            ("security",   "Run security audit",                            CommandCategory.SECURITY,"",                    ["audit"],      False, False),
            ("destruct",   "Initiate self-destruct sequence",               CommandCategory.SECURITY,"",                    [],             False, True),
            ("lock",       "Lock AETHER",                                   CommandCategory.SECURITY,"",                    [],             False, False),
            ("unlock",     "Unlock AETHER",                                 CommandCategory.SECURITY,"",                    [],             False, False),
            ("firewall",   "Manage network firewall rules",                 CommandCategory.SECURITY,"<list|allow|deny|status>", [],        False, True),
            ("permissions","Show tool permission matrix",                   CommandCategory.SECURITY,"",                    ["perms"],      False, False),
            ("activity",   "Show activity log",                             CommandCategory.SECURITY,"[n]",                 [],             False, False),

            # ── Config ──
            ("config",     "View/edit configuration",                       CommandCategory.CONFIG,  "[key] [value]",       ["cfg"],        False, False),
            ("theme",      "Switch UI theme",                               CommandCategory.CONFIG,  "<name>",              [],             False, False),
            ("persona",    "Load a SOUL.md persona",                        CommandCategory.CONFIG,  "<file>",              ["soul"],       False, False),
            ("plugin",     "Manage plugins/skills",                         CommandCategory.CONFIG,  "<install|list|remove>",["skill"],     False, False),
            ("api",        "Manage API keys",                               CommandCategory.CONFIG,  "<add|remove|test>",   ["key"],        False, True),
            ("backup",     "Backup AETHER config & memory",                 CommandCategory.CONFIG,  "[path]",              [],             False, False),
            ("restore",    "Restore from backup",                           CommandCategory.CONFIG,  "<path>",              [],             True,  True),
            ("reset",      "Reset to defaults",                             CommandCategory.CONFIG,  "[component]",         [],             False, True),

            # ── System ──
            ("processes",  "List system processes",                         CommandCategory.SYSTEM,  "",                    ["ps"],         False, False),
            ("resources",  "Show CPU/RAM/GPU usage",                        CommandCategory.SYSTEM,  "",                    ["res"],        False, False),
            ("cron",       "Manage scheduled tasks",                        CommandCategory.SYSTEM,  "<list|add|remove>",   [],             False, False),
            ("daemon",     "Manage background services",                    CommandCategory.SYSTEM,  "<status|restart>",    [],             False, False),
            ("health",     "Run system health check",                       CommandCategory.SYSTEM,  "",                    [],             False, False),
            ("uptime",     "Show system uptime",                            CommandCategory.SYSTEM,  "",                    [],             False, False),
            ("reboot",     "Reboot AETHER kernel",                          CommandCategory.SYSTEM,  "",                    [],             False, True),
        ]

        for name, desc, cat, usage, aliases, req_args, owner_only in _defs:
            self.register(CommandDef(
                name=name, description=desc, category=cat,
                usage=usage, aliases=aliases,
                requires_args=req_args, owner_only=owner_only,
                handler=f"_cmd_{name}",
            ))


# Singleton registry
COMMAND_REGISTRY = CommandRegistry()


# ---------------------------------------------------------------------------
# Message Templates — platform-specific formatting
# ---------------------------------------------------------------------------

class MessageTemplate:
    """
    Platform-aware message templates for common response patterns.

    Formats code blocks, tables, lists, errors, and status messages
    appropriately for each platform (e.g., WhatsApp has no markdown tables).
    """

    @staticmethod
    def code_block(code: str, language: str = "", platform: Platform = Platform.CLI) -> str:
        """Format a code block for the given platform."""
        if platform == Platform.SMS:
            return code  # plain text for SMS
        if platform == Platform.WHATSAPP:
            return f"```{code}```"  # WhatsApp uses inline triple backticks
        return f"```{language}\n{code}\n```"

    @staticmethod
    def bold(text: str, platform: Platform = Platform.CLI) -> str:
        if platform == Platform.WHATSAPP:
            return f"*{text}*"
        if platform in (Platform.DISCORD, Platform.SLACK, Platform.TELEGRAM):
            return f"**{text}**"
        if platform == Platform.SMS:
            return text.upper()
        return f"\033[1m{text}\033[0m" if platform == Platform.CLI else f"**{text}**"

    @staticmethod
    def italic(text: str, platform: Platform = Platform.CLI) -> str:
        if platform == Platform.WHATSAPP:
            return f"_{text}_"
        if platform == Platform.SMS:
            return text
        return f"*{text}*"

    @staticmethod
    def table(headers: List[str], rows: List[List[str]], platform: Platform = Platform.CLI) -> str:
        """Format a table. Falls back to list-style on platforms without table support."""
        if platform in (Platform.WHATSAPP, Platform.SMS, Platform.SIGNAL):
            # List-style fallback
            lines = []
            for row in rows:
                parts = [f"{h}: {v}" for h, v in zip(headers, row)]
                lines.append(" | ".join(parts))
            return "\n".join(lines)

        # Markdown table
        col_widths = [len(h) for h in headers]
        for row in rows:
            for i, cell in enumerate(row):
                if i < len(col_widths):
                    col_widths[i] = max(col_widths[i], len(cell))

        header_line = "| " + " | ".join(h.ljust(w) for h, w in zip(headers, col_widths)) + " |"
        sep_line = "|-" + "-|-".join("-" * w for w in col_widths) + "-|"
        row_lines = []
        for row in rows:
            cells = [cell.ljust(col_widths[i]) if i < len(col_widths) else cell for i, cell in enumerate(row)]
            row_lines.append("| " + " | ".join(cells) + " |")

        return "\n".join([header_line, sep_line] + row_lines)

    @staticmethod
    def status_message(title: str, items: Dict[str, str], platform: Platform = Platform.CLI) -> str:
        """Format a status/info message."""
        bold = MessageTemplate.bold
        lines = [bold(title, platform), ""]
        for key, value in items.items():
            lines.append(f"  {bold(key, platform)}: {value}")
        return "\n".join(lines)

    @staticmethod
    def error_message(error: str, suggestion: str = "", platform: Platform = Platform.CLI) -> str:
        """Format an error message."""
        msg = f"❌ {error}"
        if suggestion:
            msg += f"\n💡 {suggestion}"
        return msg

    @staticmethod
    def success_message(text: str, platform: Platform = Platform.CLI) -> str:
        """Format a success message."""
        return f"✅ {text}"

    @staticmethod
    def warning_message(text: str, platform: Platform = Platform.CLI) -> str:
        """Format a warning message."""
        return f"⚠️ {text}"

    @staticmethod
    def progress(current: int, total: int, label: str = "", platform: Platform = Platform.CLI) -> str:
        """Format a progress indicator."""
        pct = int((current / total) * 100) if total > 0 else 0
        bar_len = 20
        filled = int(bar_len * current / total) if total > 0 else 0
        bar = "█" * filled + "░" * (bar_len - filled)
        if platform == Platform.SMS:
            return f"{label} {pct}%"
        return f"{label} [{bar}] {current}/{total} ({pct}%)"

    @staticmethod
    def agent_status(name: str, status: str, task: str = "", platform: Platform = Platform.CLI) -> str:
        """Format an agent status line."""
        icons = {"running": "🟢", "idle": "⚪", "error": "🔴", "paused": "🟡"}
        icon = icons.get(status, "⚪")
        line = f"{icon} {MessageTemplate.bold(name, platform)} — {status}"
        if task:
            line += f" ({task})"
        return line


# ---------------------------------------------------------------------------
# Heartbeat System — periodic health pings
# ---------------------------------------------------------------------------

@dataclass
class HeartbeatStatus:
    """Status of a heartbeat-monitored channel."""
    channel_id: str
    platform: Platform
    last_heartbeat: float
    consecutive_failures: int = 0
    is_alive: bool = True
    latency_ms: float = 0.0


class HeartbeatMonitor:
    """
    Periodic health monitoring for connected channels.

    Sends lightweight pings to channels and tracks their responsiveness.
    Can trigger alerts when channels go unresponsive.

    Usage:
        monitor = HeartbeatMonitor(interval_s=30)
        monitor.register_channel("discord-main", Platform.DISCORD, ping_fn)
        await monitor.start()
        status = monitor.get_status("discord-main")
        await monitor.stop()
    """

    def __init__(
        self,
        interval_s: float = 30.0,
        failure_threshold: int = 3,
        on_channel_down: Optional[Callable[[HeartbeatStatus], Awaitable[None]]] = None,
        on_channel_recovered: Optional[Callable[[HeartbeatStatus], Awaitable[None]]] = None,
    ):
        self._interval = interval_s
        self._failure_threshold = failure_threshold
        self._on_down = on_channel_down
        self._on_recovered = on_channel_recovered
        self._channels: Dict[str, Dict[str, Any]] = {}
        self._statuses: Dict[str, HeartbeatStatus] = {}
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._started_at = 0.0

    def register_channel(
        self, channel_id: str, platform: Platform,
        ping_fn: Callable[[], Awaitable[bool]],
    ) -> None:
        """Register a channel for heartbeat monitoring."""
        self._channels[channel_id] = {
            "platform": platform,
            "ping_fn": ping_fn,
        }
        self._statuses[channel_id] = HeartbeatStatus(
            channel_id=channel_id,
            platform=platform,
            last_heartbeat=time.time(),
        )
        logger.info("Heartbeat: registered channel '%s' (%s)", channel_id, platform.value)

    def unregister_channel(self, channel_id: str) -> None:
        """Remove a channel from monitoring."""
        self._channels.pop(channel_id, None)
        self._statuses.pop(channel_id, None)

    async def start(self) -> None:
        """Start the heartbeat loop."""
        if self._running:
            return
        self._running = True
        self._started_at = time.time()
        self._task = asyncio.create_task(self._loop())
        logger.info("Heartbeat monitor started (interval=%ds)", self._interval)

    async def stop(self) -> None:
        """Stop the heartbeat loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Heartbeat monitor stopped")

    def get_status(self, channel_id: str) -> Optional[HeartbeatStatus]:
        """Get the current heartbeat status for a channel."""
        return self._statuses.get(channel_id)

    def all_statuses(self) -> List[HeartbeatStatus]:
        """Get heartbeat status for all channels."""
        return list(self._statuses.values())

    @property
    def uptime_s(self) -> float:
        """How long the heartbeat monitor has been running."""
        return time.time() - self._started_at if self._running else 0.0

    async def _loop(self) -> None:
        """Main heartbeat loop."""
        while self._running:
            for ch_id, ch_info in list(self._channels.items()):
                status = self._statuses.get(ch_id)
                if not status:
                    continue
                try:
                    t0 = time.time()
                    alive = await ch_info["ping_fn"]()
                    latency = (time.time() - t0) * 1000

                    was_down = not status.is_alive

                    if alive:
                        status.last_heartbeat = time.time()
                        status.consecutive_failures = 0
                        status.is_alive = True
                        status.latency_ms = latency
                        if was_down and self._on_recovered:
                            await self._on_recovered(status)
                    else:
                        status.consecutive_failures += 1
                        if status.consecutive_failures >= self._failure_threshold:
                            status.is_alive = False
                            if self._on_down:
                                await self._on_down(status)

                except Exception as e:
                    status.consecutive_failures += 1
                    logger.warning("Heartbeat ping failed for '%s': %s", ch_id, e)
                    if status.consecutive_failures >= self._failure_threshold:
                        status.is_alive = False
                        if self._on_down:
                            await self._on_down(status)

            await asyncio.sleep(self._interval)


# ---------------------------------------------------------------------------
# Chunking logic
# ---------------------------------------------------------------------------

def chunk_message(
    text: str,
    max_chars: int = 4096,
    preserve_code_blocks: bool = True,
) -> List[str]:
    """
    Split a message into chunks that fit within max_chars.

    Rules:
    1. Never break mid-sentence if possible
    2. Never break inside code blocks (``` ... ```)
    3. Add continuation indicator (…) when splitting
    4. Each chunk after the first gets a "cont'd" prefix

    Args:
        text: Full message text
        max_chars: Maximum characters per chunk
        preserve_code_blocks: Keep code blocks intact

    Returns:
        List of chunk strings
    """
    if len(text) <= max_chars:
        return [text]

    # Reserve space for continuation indicators
    effective_max = max_chars - 20

    # Step 1: Split into segments (code blocks vs. plain text)
    segments = _split_code_blocks(text) if preserve_code_blocks else [text]

    chunks: List[str] = []
    current = ""

    for segment in segments:
        is_code = segment.startswith("```")

        if is_code:
            # Try to keep code block intact
            if len(current) + len(segment) <= effective_max:
                current += segment
            else:
                # Flush current chunk
                if current.strip():
                    chunks.append(current.strip())
                    current = ""

                # If code block itself exceeds max, force-split it
                if len(segment) > effective_max:
                    code_chunks = _force_split(segment, effective_max)
                    chunks.extend(code_chunks[:-1])
                    current = code_chunks[-1]
                else:
                    current = segment
        else:
            # Plain text — split on sentence boundaries
            sentences = _split_sentences(segment)
            for sentence in sentences:
                if len(current) + len(sentence) <= effective_max:
                    current += sentence
                else:
                    if current.strip():
                        chunks.append(current.strip())
                        current = ""
                    
                    # If the sentence itself is too long, force split it
                    if len(sentence) > effective_max:
                        forced_chunks = _force_split(sentence, effective_max)
                        chunks.extend(forced_chunks[:-1])
                        current = forced_chunks[-1]
                    else:
                        current = sentence

    if current.strip():
        chunks.append(current.strip())

    # Add continuation markers
    if len(chunks) > 1:
        for i in range(len(chunks) - 1):
            chunks[i] = chunks[i] + " …"
        for i in range(1, len(chunks)):
            chunks[i] = "… " + chunks[i]

    return chunks


def _split_code_blocks(text: str) -> List[str]:
    """Split text into alternating plain text and code block segments."""
    pattern = r'(```[\s\S]*?```)'
    parts = re.split(pattern, text)
    return [p for p in parts if p]


def _split_sentences(text: str) -> List[str]:
    """Split text into sentences, preserving punctuation."""
    # Split on sentence-ending punctuation followed by whitespace
    parts = re.split(r'(?<=[.!?])\s+', text)
    # Re-add the trailing space
    result = []
    for i, part in enumerate(parts):
        if i < len(parts) - 1:
            result.append(part + " ")
        else:
            result.append(part)
    return result


def _force_split(text: str, max_chars: int) -> List[str]:
    """Force-split text by character count, hard-slicing if needed."""
    chunks = []
    
    # Simple hard slicing
    for i in range(0, len(text), max_chars):
        chunks.append(text[i:i + max_chars])
        
    return chunks


# ---------------------------------------------------------------------------
# Directive detection
# ---------------------------------------------------------------------------

DIRECTIVE_PATTERN = re.compile(
    r'^/(\w+)(?:\s+(.*))?$', re.MULTILINE,
)


def detect_directives(text: str) -> List[Directive]:
    """
    Detect slash-command directives embedded in a message.

    Example: "/remind me to call John at 5pm" → Directive("remind", "me to call John at 5pm")
    """
    directives = []
    for match in DIRECTIVE_PATTERN.finditer(text):
        directives.append(Directive(
            command=match.group(1),
            args=match.group(2) or "",
            raw=match.group(0),
        ))
    return directives


# ---------------------------------------------------------------------------
# Auto-Reply Engine
# ---------------------------------------------------------------------------

class AutoReplyEngine:
    """
    AETHER's message delivery engine.

    Handles chunking, formatting, rate limiting, and delivery
    of AI responses to any platform. Integrates command registry,
    message templates, and heartbeat monitoring.

    Usage:
        engine = AutoReplyEngine()

        # Deliver a long response to Discord
        result = await engine.deliver(
            text="...(long AI response)...",
            platform=Platform.DISCORD,
            send_fn=my_discord_send,
        )
        print(f"Sent {result.chunks_sent} chunks")

        # Look up a command
        cmd = engine.registry.lookup("/model")

        # Format a status message for WhatsApp
        msg = engine.templates.status_message("Status", {...}, Platform.WHATSAPP)

        # Start heartbeat monitoring
        await engine.heartbeat.start()
    """

    def __init__(
        self,
        rate_limit_ms: int = 500,
        custom_limits: Optional[Dict[str, int]] = None,
        heartbeat_interval_s: float = 30.0,
    ):
        self._rate_limit_ms = rate_limit_ms
        self._custom_limits = custom_limits or {}
        self._last_send: Dict[str, float] = {}  # per-channel rate tracking

        # Stats
        self.total_deliveries = 0
        self.total_chunks = 0

        # Command registry (70+ commands)
        self.registry = COMMAND_REGISTRY

        # Message templates
        self.templates = MessageTemplate()

        # Heartbeat monitor
        self.heartbeat = HeartbeatMonitor(
            interval_s=heartbeat_interval_s,
            on_channel_down=self._on_channel_down,
            on_channel_recovered=self._on_channel_recovered,
        )

    async def _on_channel_down(self, status: HeartbeatStatus) -> None:
        """Handle a channel going unresponsive."""
        logger.warning(
            "Channel '%s' (%s) is DOWN — %d consecutive failures",
            status.channel_id, status.platform.value, status.consecutive_failures,
        )

    async def _on_channel_recovered(self, status: HeartbeatStatus) -> None:
        """Handle a channel recovering."""
        logger.info(
            "Channel '%s' (%s) recovered (latency: %.1fms)",
            status.channel_id, status.platform.value, status.latency_ms,
        )

    async def deliver(
        self,
        text: str,
        platform: Platform,
        send_fn: Callable[[str], Awaitable[None]],
        channel_id: str = "default",
    ) -> DeliveryResult:
        """
        Chunk and deliver a message to a platform.

        Args:
            text: Full AI response text
            platform: Target platform
            send_fn: Async function that sends a single message string
            channel_id: Channel ID for rate limiting

        Returns:
            DeliveryResult with delivery stats
        """
        max_chars = self._custom_limits.get(
            platform.value,
            PLATFORM_LIMITS.get(platform, 4096),
        )

        chunks = chunk_message(text, max_chars=max_chars)
        errors: List[str] = []
        t0 = time.time()

        for i, chunk_text in enumerate(chunks):
            # Rate limiting
            await self._rate_limit(channel_id)

            try:
                await send_fn(chunk_text)
                self.total_chunks += 1
            except Exception as e:
                errors.append(f"Chunk {i + 1}: {str(e)}")
                logger.error("Delivery failed (chunk %d/%d): %s", i + 1, len(chunks), e)

        elapsed_ms = (time.time() - t0) * 1000
        self.total_deliveries += 1

        return DeliveryResult(
            chunks_sent=len(chunks) - len(errors),
            chunks_total=len(chunks),
            platform=platform,
            errors=errors,
            delivery_time_ms=elapsed_ms,
        )

    def chunk_preview(
        self, text: str, platform: Platform,
    ) -> List[MessageChunk]:
        """Preview how a message would be chunked (without sending)."""
        max_chars = PLATFORM_LIMITS.get(platform, 4096)
        raw_chunks = chunk_message(text, max_chars=max_chars)

        return [
            MessageChunk(
                content=c,
                index=i,
                total=len(raw_chunks),
                platform=platform,
                has_continuation=(i < len(raw_chunks) - 1),
            )
            for i, c in enumerate(raw_chunks)
        ]

    def dispatch_command(self, text: str) -> Optional[CommandDef]:
        """
        Check if text is a slash command and return its definition.
        Returns None if not a recognized command.
        """
        text = text.strip()
        if not text.startswith("/"):
            return None
        parts = text.split(None, 1)
        return self.registry.lookup(parts[0])

    async def _rate_limit(self, channel_id: str) -> None:
        """Enforce per-channel rate limiting."""
        key = channel_id
        last = self._last_send.get(key, 0)
        elapsed_ms = (time.time() - last) * 1000

        if elapsed_ms < self._rate_limit_ms:
            wait_s = (self._rate_limit_ms - elapsed_ms) / 1000
            await asyncio.sleep(wait_s)

        self._last_send[key] = time.time()
