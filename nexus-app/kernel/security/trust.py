"""
AETHER Trust Model — trust by origin, not by restricting the dev.

Security philosophy (see REMEDIATION_PLAN.md M1-2 / trust-model):

  * **Trusted origin** — the dev at the CLI, the in-app terminal, or the local
    GUI session. Commands typed here are trusted input → full tool profile,
    owner privileges, no forced HIL nagging.
  * **Untrusted origin** — inbound messaging (WhatsApp/Discord/Telegram via
    external messaging), scraped web pages, indexed documents, remote agents. This is
    where attacks (prompt injection) arrive → restricted tool profile, NOT
    owner, and HIL required for state-changing actions.

The safety system stands between *attackers and the machine*, never between the
dev and their own CLI. Everything here is **config-driven** so the GUI settings
panel can expose access level and per-origin policy.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Optional

logger = logging.getLogger("aether.trust")


class Origin(str, Enum):
    """Where a request entered the system from."""
    CLI = "cli"               # global `aether` CLI / PTY terminal
    TERMINAL = "terminal"     # in-app terminal tool
    GUI = "gui"               # local desktop GUI (chat, tools)
    LOCAL = "local"           # generic local/owner session
    MESSAGING = "messaging"   # inbound external chat (messaging channels)
    WEB = "web"               # content fetched/scraped from the web
    REMOTE_AGENT = "remote_agent"  # an agent created/triggered remotely
    UNKNOWN = "unknown"

    @classmethod
    def coerce(cls, value: Any) -> "Origin":
        if isinstance(value, Origin):
            return value
        try:
            return cls(str(value).strip().lower())
        except ValueError:
            return cls.UNKNOWN


# Origins that are the dev operating their own machine — trusted by default.
_DEFAULT_TRUSTED = {Origin.CLI, Origin.TERMINAL, Origin.GUI, Origin.LOCAL}


@dataclass
class TrustContext:
    """Resolved trust for a single request."""
    origin: Origin
    trusted: bool
    is_owner: bool
    tool_profile: str            # maps to supervisor.tool_policy profiles
    require_hil: bool            # force human approval for state-changing actions
    access_level: str            # "user" | "admin" | "dev" (local owner only)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "origin": self.origin.value,
            "trusted": self.trusted,
            "is_owner": self.is_owner,
            "tool_profile": self.tool_profile,
            "require_hil": self.require_hil,
            "access_level": self.access_level,
        }


# Sensible secure defaults; overridable via the `security` config block / GUI.
DEFAULT_SECURITY: Dict[str, Any] = {
    # Local owner capability tier. dev/admin → full tools; user → coding tools.
    "access_level": "admin",
    # Tool profile applied to UNTRUSTED origins (per supervisor.tool_policy).
    "origin_tool_profiles": {
        "messaging": "messaging",
        "web": "minimal",
        "remote_agent": "coding",
    },
    # Untrusted, state-changing actions always require approval.
    "require_hil_for_untrusted": True,
    # Extra origins to treat as trusted (advanced; e.g. a vetted local socket).
    "extra_trusted_origins": [],
}

# access_level → local tool profile.
_ACCESS_LEVEL_PROFILE = {
    "dev": "full",
    "admin": "full",
    "user": "coding",
}


class TrustResolver:
    """Resolves an Origin into a TrustContext using the security config."""

    def __init__(self, security_config: Optional[Dict[str, Any]] = None):
        self._cfg: Dict[str, Any] = {**DEFAULT_SECURITY, **(security_config or {})}

    def update_config(self, security_config: Dict[str, Any]) -> None:
        self._cfg = {**DEFAULT_SECURITY, **(security_config or {})}

    def _trusted_origins(self) -> set:
        trusted = set(_DEFAULT_TRUSTED)
        for extra in self._cfg.get("extra_trusted_origins", []) or []:
            trusted.add(Origin.coerce(extra))
        return trusted

    def resolve(self, origin: Any) -> TrustContext:
        org = Origin.coerce(origin)
        access_level = str(self._cfg.get("access_level", "admin")).lower()
        trusted = org in self._trusted_origins()

        if trusted:
            # The dev on their own machine — full power per access level.
            profile = _ACCESS_LEVEL_PROFILE.get(access_level, "full")
            return TrustContext(
                origin=org,
                trusted=True,
                is_owner=True,
                tool_profile=profile,
                require_hil=False,
                access_level=access_level,
            )

        # Untrusted — restricted profile, not owner, HIL forced for risky ops.
        origin_profiles = self._cfg.get("origin_tool_profiles", {}) or {}
        profile = origin_profiles.get(org.value, "minimal")
        return TrustContext(
            origin=org,
            trusted=False,
            is_owner=False,
            tool_profile=profile,
            require_hil=bool(self._cfg.get("require_hil_for_untrusted", True)),
            access_level=access_level,
        )
