"""
AETHER Tool Policy Engine — Per-Agent/Channel Tool Access Control

Controls which tools each agent or channel is allowed to use.
Inspired by OpenClaw's tool-policy.ts.

Profiles:
- minimal:    session_status only (read-only observers)
- coding:     filesystem + runtime + sessions + memory
- messaging:  message sending + session viewing
- full:       all tools (no restrictions)

Features:
- Allow/deny lists with group expansion
- Owner-only tool gating (remote users can't use admin tools)
- Plugin tool group support
- Per-agent profile override
"""

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Optional, List, Dict, Set, Any

logger = logging.getLogger("aether.tool_policy")


# ---------------------------------------------------------------------------
# Tool Groups — logical groupings of related tools
# ---------------------------------------------------------------------------

TOOL_GROUPS: Dict[str, List[str]] = {
    # Memory operations
    "group:memory": ["memory_search", "memory_get", "memory_add"],

    # Web operations
    "group:web": ["web_search", "web_fetch", "web_browse"],

    # Filesystem operations
    "group:fs": ["file_read", "file_write", "file_edit", "file_list", "file_delete"],

    # Runtime / shell execution
    "group:runtime": ["shell_exec", "process_list", "process_kill"],

    # Session management
    "group:sessions": [
        "sessions_list", "sessions_history", "sessions_send",
        "sessions_spawn", "session_status",
    ],

    # UI helpers
    "group:ui": ["browser_control", "screenshot", "notification"],

    # Automation + scheduling
    "group:automation": ["cron_create", "cron_list", "cron_delete"],

    # Messaging
    "group:messaging": ["message_send", "message_read"],

    # Agent management
    "group:agents": ["agent_spawn", "agent_list", "agent_cancel"],

    # All AETHER native tools (excludes external plugins)
    "group:aether": [
        "browser_control", "screenshot", "notification",
        "cron_create", "cron_list", "cron_delete",
        "message_send", "message_read",
        "agent_spawn", "agent_list", "agent_cancel",
        "sessions_list", "sessions_history", "sessions_send",
        "sessions_spawn", "session_status",
        "memory_search", "memory_get", "memory_add",
        "web_search", "web_fetch", "web_browse",
        "file_read", "file_write", "file_edit", "file_list", "file_delete",
        "shell_exec", "process_list", "process_kill",
    ],
}


# ---------------------------------------------------------------------------
# Tool Profiles — pre-set configurations
# ---------------------------------------------------------------------------

class ToolProfileID(str, Enum):
    MINIMAL = "minimal"
    CODING = "coding"
    MESSAGING = "messaging"
    FULL = "full"


@dataclass
class ToolPolicy:
    """A tool access policy with allow/deny lists."""
    allow: Optional[List[str]] = None  # If set, only these tools are allowed
    deny: Optional[List[str]] = None   # If set, these tools are explicitly blocked


TOOL_PROFILES: Dict[ToolProfileID, ToolPolicy] = {
    ToolProfileID.MINIMAL: ToolPolicy(
        allow=["session_status"],
    ),
    ToolProfileID.CODING: ToolPolicy(
        allow=[
            "group:fs", "group:runtime", "group:sessions",
            "group:memory", "group:web",
        ],
    ),
    ToolProfileID.MESSAGING: ToolPolicy(
        allow=[
            "group:messaging",
            "sessions_list", "sessions_history",
            "sessions_send", "session_status",
        ],
    ),
    ToolProfileID.FULL: ToolPolicy(
        # No restrictions
    ),
}


# Tools that only the system owner can use (not remote users)
OWNER_ONLY_TOOLS: Set[str] = {
    "self_destruct",
    "config_set",
    "config_reset",
    "agent_spawn",
    "cron_create",
    "cron_delete",
    "security_audit",
    "shell_exec",
    "file_delete",
}


# ---------------------------------------------------------------------------
# Tool name normalization
# ---------------------------------------------------------------------------

TOOL_ALIASES: Dict[str, str] = {
    "bash": "shell_exec",
    "exec": "shell_exec",
    "rm": "file_delete",
    "ls": "file_list",
    "cat": "file_read",
    "search": "web_search",
    "browse": "web_browse",
}


def normalize_tool_name(name: str) -> str:
    """Normalize a tool name (lowercase, resolve aliases)."""
    normalized = name.strip().lower()
    return TOOL_ALIASES.get(normalized, normalized)


# ---------------------------------------------------------------------------
# Group expansion
# ---------------------------------------------------------------------------

def expand_tool_groups(names: Optional[List[str]]) -> List[str]:
    """
    Expand group references in a tool list.

    "group:fs" → ["file_read", "file_write", "file_edit", "file_list", "file_delete"]
    """
    if not names:
        return []

    expanded: List[str] = []
    for name in names:
        normalized = normalize_tool_name(name)
        group = TOOL_GROUPS.get(normalized)
        if group:
            expanded.extend(group)
        else:
            expanded.append(normalized)

    return list(set(expanded))  # dedupe


# ---------------------------------------------------------------------------
# Tool Policy Engine
# ---------------------------------------------------------------------------

class ToolPolicyEngine:
    """
    Evaluates whether a tool invocation is allowed.

    Usage:
        engine = ToolPolicyEngine()

        # Check if a tool is allowed for a coding agent
        allowed = engine.is_allowed("shell_exec", profile="coding")

        # Check with owner status
        allowed = engine.is_allowed("self_destruct", profile="full", is_owner=True)

        # Filter a tool list
        filtered = engine.filter_tools(all_tools, profile="messaging")
    """

    def __init__(self, custom_profiles: Optional[Dict[str, ToolPolicy]] = None):
        self._profiles: Dict[str, ToolPolicy] = {}

        # Load built-in profiles
        for pid, policy in TOOL_PROFILES.items():
            self._profiles[pid.value] = policy

        # Merge custom profiles
        if custom_profiles:
            for name, policy in custom_profiles.items():
                self._profiles[name] = policy

    def is_allowed(
        self,
        tool_name: str,
        profile: str = "full",
        is_owner: bool = True,
        extra_deny: Optional[List[str]] = None,
    ) -> bool:
        """
        Check if a tool is allowed under the given profile.

        Args:
            tool_name: The tool to check
            profile: Profile ID ("minimal", "coding", "messaging", "full")
            is_owner: Whether the caller is the system owner
            extra_deny: Additional tools to deny for this check
        """
        normalized = normalize_tool_name(tool_name)

        # Owner-only check
        if not is_owner and normalized in OWNER_ONLY_TOOLS:
            return False

        # Get profile policy
        policy = self._profiles.get(profile)
        if not policy:
            # Unknown profile → deny all
            logger.warning("Unknown tool profile: %s", profile)
            return False

        # Extra deny list
        if extra_deny:
            deny_set = set(expand_tool_groups(extra_deny))
            if normalized in deny_set:
                return False

        # Check deny list
        if policy.deny:
            deny_expanded = set(expand_tool_groups(policy.deny))
            if normalized in deny_expanded:
                return False

        # Check allow list
        if policy.allow:
            allow_expanded = set(expand_tool_groups(policy.allow))
            return normalized in allow_expanded

        # No allow list = everything allowed (that wasn't denied)
        return True

    def filter_tools(
        self,
        tools: List[Dict[str, Any]],
        profile: str = "full",
        is_owner: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Filter a list of tool definitions to only allowed ones.

        Args:
            tools: List of tool dicts with at least a "name" key
            profile: Profile ID
            is_owner: Whether the caller is the system owner
        """
        return [
            tool for tool in tools
            if self.is_allowed(tool.get("name", ""), profile, is_owner)
        ]

    def get_allowed_tools(
        self, profile: str = "full", is_owner: bool = True,
    ) -> List[str]:
        """Get the list of tool names allowed under a profile."""
        policy = self._profiles.get(profile)
        if not policy:
            return []

        if policy.allow:
            allowed = expand_tool_groups(policy.allow)
        else:
            # "full" profile — return all known tools
            allowed = expand_tool_groups(["group:aether"])

        # Filter out owner-only if not owner
        if not is_owner:
            allowed = [t for t in allowed if t not in OWNER_ONLY_TOOLS]

        # Filter out denied
        if policy.deny:
            denied = set(expand_tool_groups(policy.deny))
            allowed = [t for t in allowed if t not in denied]

        return sorted(set(allowed))

    def add_profile(self, name: str, policy: ToolPolicy) -> None:
        """Register a custom tool profile."""
        self._profiles[name] = policy
        logger.info("Registered tool profile: %s", name)

    def list_profiles(self) -> List[str]:
        """List all available profile names."""
        return sorted(self._profiles.keys())
