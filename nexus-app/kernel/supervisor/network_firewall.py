"""
AETHER Network Firewall -- Outbound Request Control

Features:
- Allowlist for AI provider domains
- Data exfiltration pattern detection
- Request logging and monitoring
- Per-agent network policy
"""

import logging
import re
import time
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Set
from urllib.parse import urlparse

logger = logging.getLogger("aether.firewall")


# Default allowlist: AI provider domains + essential services
DEFAULT_ALLOWLIST: Set[str] = {
    # AI Providers
    "api.groq.com",
    "api.cerebras.ai",
    "api.mistral.ai",
    "generativelanguage.googleapis.com",
    "openrouter.ai",
    # Ollama (local)
    "localhost",
    "127.0.0.1",
    # Embedding providers
    "api.voyageai.com",
    "api.openai.com",
    # Package registries
    "pypi.org",
    "registry.npmjs.org",
    # GitHub
    "api.github.com",
    "github.com",
}


# Patterns that suggest data exfiltration
EXFIL_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),             # OpenAI-style key
    re.compile(r"gsk_[a-zA-Z0-9]{20,}"),             # Groq key
    re.compile(r"AIza[a-zA-Z0-9_\-]{35}"),           # Google API key
    re.compile(r"ghp_[a-zA-Z0-9]{36}"),              # GitHub PAT
    re.compile(r"glpat-[a-zA-Z0-9\-]{20,}"),         # GitLab PAT
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),            # SSN pattern
    re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"),  # Credit card
]


@dataclass
class FirewallDecision:
    """Result of a firewall check."""
    allowed: bool
    url: str
    domain: str
    reason: str = ""
    exfil_detected: bool = False
    timestamp: float = field(default_factory=time.time)


class NetworkFirewall:
    """
    Application-level outbound request firewall.

    Usage:
        fw = NetworkFirewall()
        decision = fw.check_request(url="https://evil.com/steal", body="sk-abc123...")
        if not decision.allowed:
            logger.warning("Blocked: %s", decision.reason)
    """

    def __init__(
        self,
        allowlist: Optional[Set[str]] = None,
        block_mode: str = "warn",
    ):
        self._allowlist = allowlist or DEFAULT_ALLOWLIST.copy()
        self._block_mode = block_mode  # "block" | "warn" | "log"
        self._log: List[FirewallDecision] = []
        self._max_log = 500

    # ---- Configuration ----

    @property
    def block_mode(self) -> str:
        return self._block_mode

    @block_mode.setter
    def block_mode(self, mode: str) -> None:
        if mode in ("block", "warn", "log"):
            self._block_mode = mode

    def add_to_allowlist(self, domain: str) -> None:
        """Add a domain to the allowlist."""
        self._allowlist.add(domain)

    def remove_from_allowlist(self, domain: str) -> None:
        """Remove a domain from the allowlist."""
        self._allowlist.discard(domain)

    # ---- Request checking ----

    def check_request(
        self,
        url: str,
        body: str = "",
        headers: Optional[Dict[str, str]] = None,
    ) -> FirewallDecision:
        """Check if an outbound request should be allowed."""
        parsed = urlparse(url)
        domain = parsed.hostname or ""
        domain_port = f"{domain}:{parsed.port}" if parsed.port else domain

        # Check domain allowlist
        allowed = (
            domain in self._allowlist
            or domain_port in self._allowlist
            or any(domain.endswith(f".{a}") for a in self._allowlist)
        )

        # Check for exfiltration patterns in body
        exfil = False
        if body:
            for pattern in EXFIL_PATTERNS:
                if pattern.search(body):
                    exfil = True
                    break

        # Check for exfiltration in URL parameters
        if not exfil and parsed.query:
            for pattern in EXFIL_PATTERNS:
                if pattern.search(parsed.query):
                    exfil = True
                    break

        reason = ""
        if not allowed:
            reason = f"Domain '{domain}' not in allowlist"
        if exfil:
            reason = (
                (reason + "; " if reason else "")
                + "Potential data exfiltration detected"
            )
            allowed = False  # Always block exfil regardless of domain

        decision = FirewallDecision(
            allowed=allowed and not exfil,
            url=url,
            domain=domain,
            reason=reason,
            exfil_detected=exfil,
        )

        self._log.append(decision)
        if len(self._log) > self._max_log:
            self._log = self._log[-self._max_log:]

        if not decision.allowed:
            level = "BLOCKED" if self._block_mode == "block" else "WARNED"
            logger.warning("Firewall %s: %s (%s)", level, url, reason)

        return decision

    # ---- Log access ----

    def get_log(self, limit: int = 50) -> List[FirewallDecision]:
        """Get recent firewall decisions."""
        return self._log[-limit:]

    def get_blocked_log(self, limit: int = 50) -> List[FirewallDecision]:
        """Get only blocked/warned decisions."""
        blocked = [d for d in self._log if not d.allowed]
        return blocked[-limit:]

    # ---- Status ----

    def get_status(self) -> Dict[str, Any]:
        """Get firewall status summary."""
        blocked = sum(1 for d in self._log if not d.allowed)
        exfil = sum(1 for d in self._log if d.exfil_detected)
        return {
            "mode": self._block_mode,
            "allowlist_size": len(self._allowlist),
            "total_requests": len(self._log),
            "blocked_requests": blocked,
            "exfil_attempts": exfil,
        }
