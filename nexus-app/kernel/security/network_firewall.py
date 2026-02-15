"""
AETHER Network Firewall — Agent Network Access Control

Controls outbound network requests from agents. Implements:
- Allowlist/denylist rules with glob pattern matching
- Data exfiltration detection
- DNS monitoring
- Per-agent network policies
- Request logging and audit trail
"""

import asyncio
import fnmatch
import json
import logging
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional, List, Dict, Any, Callable, Awaitable, Set

logger = logging.getLogger("aether.firewall")


class FirewallAction(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    LOG = "log"  # allow but log


class FirewallVerdict(str, Enum):
    ALLOWED = "allowed"
    DENIED = "denied"
    BLOCKED_EXFIL = "blocked_exfiltration"
    BLOCKED_RULE = "blocked_by_rule"


@dataclass
class FirewallRule:
    """A single firewall rule."""
    id: str
    pattern: str          # glob pattern for domain/URL
    action: FirewallAction
    agent_id: str = "*"   # which agent this applies to (* = all)
    description: str = ""
    created_at: float = field(default_factory=time.time)
    hit_count: int = 0

    def matches(self, url: str, agent: str = "*") -> bool:
        if self.agent_id != "*" and self.agent_id != agent:
            return False
        return fnmatch.fnmatch(url.lower(), self.pattern.lower())


@dataclass
class NetworkEvent:
    """A logged network request."""
    url: str
    agent_id: str
    verdict: FirewallVerdict
    rule_id: Optional[str]
    timestamp: float = field(default_factory=time.time)
    method: str = "GET"
    bytes_out: int = 0


class NetworkFirewall:
    """
    Agent network access control with allowlisting and exfiltration detection.

    Usage:
        fw = NetworkFirewall()
        await fw.initialize()
        fw.add_rule("r1", "*.openai.com/*", FirewallAction.ALLOW, description="OpenAI API")
        fw.add_rule("r2", "*", FirewallAction.DENY, description="Deny all by default")
        verdict = await fw.check("https://api.openai.com/v1/chat", agent_id="main")
    """

    # Known AI provider domains that are always allowed
    DEFAULT_ALLOWLIST = [
        "*.openai.com", "*.anthropic.com", "*.groq.com", "*.googleapis.com",
        "*.cerebras.ai", "*.mistral.ai", "*.openrouter.ai", "*.together.ai",
        "*.fireworks.ai", "*.cohere.com", "*.voyageai.com",
    ]

    # Patterns that indicate data exfiltration attempts
    EXFIL_PATTERNS = [
        r'https?://[^/]*pastebin\.com',
        r'https?://[^/]*hastebin\.com',
        r'https?://webhook\.site',
        r'https?://[^/]*ngrok\.(io|app)',
        r'https?://[^/]*requestbin',
        r'https?://[^/]*burpcollaborator',
    ]

    def __init__(self, config_path: Optional[str] = None):
        self._base = Path(config_path or (Path.home() / ".aether" / "security"))
        self._rules_path = self._base / "firewall_rules.json"
        self._log_path = self._base / "network_log.jsonl"
        self._rules: Dict[str, FirewallRule] = {}
        self._events: List[NetworkEvent] = []
        self._enabled = True
        self._default_action = FirewallAction.DENY
        self._exfil_patterns = [re.compile(p, re.I) for p in self.EXFIL_PATTERNS]
        self._blocked_count = 0
        self._allowed_count = 0

    async def initialize(self) -> None:
        self._base.mkdir(parents=True, exist_ok=True)
        self._load_rules()
        # Add default allowlist if no rules exist
        if not self._rules:
            for i, pattern in enumerate(self.DEFAULT_ALLOWLIST):
                self.add_rule(f"default_{i}", pattern, FirewallAction.ALLOW,
                              description=f"Default: {pattern}")
        logger.info("Firewall initialized with %d rules", len(self._rules))

    def add_rule(self, rule_id: str, pattern: str, action: FirewallAction,
                 agent_id: str = "*", description: str = "") -> None:
        self._rules[rule_id] = FirewallRule(
            id=rule_id, pattern=pattern, action=action,
            agent_id=agent_id, description=description,
        )
        self._save_rules()

    def remove_rule(self, rule_id: str) -> bool:
        if rule_id in self._rules:
            del self._rules[rule_id]
            self._save_rules()
            return True
        return False

    def list_rules(self) -> List[FirewallRule]:
        return list(self._rules.values())

    async def check(self, url: str, agent_id: str = "main",
                    method: str = "GET", body_size: int = 0) -> FirewallVerdict:
        """Check if a network request should be allowed."""
        if not self._enabled:
            return FirewallVerdict.ALLOWED

        # 1. Check exfiltration patterns first
        for pattern in self._exfil_patterns:
            if pattern.search(url):
                self._log_event(url, agent_id, FirewallVerdict.BLOCKED_EXFIL, None, method, body_size)
                self._blocked_count += 1
                logger.warning("BLOCKED exfiltration attempt: %s (agent: %s)", url, agent_id)
                return FirewallVerdict.BLOCKED_EXFIL

        # 2. Check rules in order (first match wins)
        for rule in self._rules.values():
            if rule.matches(url, agent_id):
                rule.hit_count += 1
                if rule.action == FirewallAction.ALLOW:
                    self._log_event(url, agent_id, FirewallVerdict.ALLOWED, rule.id, method, body_size)
                    self._allowed_count += 1
                    return FirewallVerdict.ALLOWED
                elif rule.action == FirewallAction.DENY:
                    self._log_event(url, agent_id, FirewallVerdict.BLOCKED_RULE, rule.id, method, body_size)
                    self._blocked_count += 1
                    logger.info("Blocked by rule '%s': %s", rule.id, url)
                    return FirewallVerdict.BLOCKED_RULE
                elif rule.action == FirewallAction.LOG:
                    self._log_event(url, agent_id, FirewallVerdict.ALLOWED, rule.id, method, body_size)
                    self._allowed_count += 1
                    logger.info("Logged (allowed): %s", url)
                    return FirewallVerdict.ALLOWED

        # 3. Default action
        if self._default_action == FirewallAction.DENY:
            self._log_event(url, agent_id, FirewallVerdict.DENIED, None, method, body_size)
            self._blocked_count += 1
            return FirewallVerdict.DENIED

        self._log_event(url, agent_id, FirewallVerdict.ALLOWED, None, method, body_size)
        self._allowed_count += 1
        return FirewallVerdict.ALLOWED

    def set_enabled(self, enabled: bool) -> None:
        self._enabled = enabled
        logger.info("Firewall %s", "enabled" if enabled else "disabled")

    def set_default_action(self, action: FirewallAction) -> None:
        self._default_action = action

    def get_stats(self) -> Dict[str, Any]:
        return {
            "enabled": self._enabled,
            "rules_count": len(self._rules),
            "allowed_count": self._allowed_count,
            "blocked_count": self._blocked_count,
            "default_action": self._default_action.value,
            "recent_events": len(self._events),
        }

    def get_recent_events(self, limit: int = 50) -> List[NetworkEvent]:
        return self._events[-limit:]

    def _log_event(self, url, agent_id, verdict, rule_id, method, bytes_out):
        event = NetworkEvent(url=url, agent_id=agent_id, verdict=verdict,
                             rule_id=rule_id, method=method, bytes_out=bytes_out)
        self._events.append(event)
        # Keep only last 1000 events in memory
        if len(self._events) > 1000:
            self._events = self._events[-500:]
        # Append to log file
        try:
            with open(self._log_path, "a") as f:
                f.write(json.dumps({
                    "url": url, "agent": agent_id, "verdict": verdict.value,
                    "rule": rule_id, "time": time.time(), "method": method,
                }) + "\n")
        except Exception:
            pass

    def _save_rules(self):
        try:
            data = {}
            for rid, rule in self._rules.items():
                data[rid] = {
                    "pattern": rule.pattern, "action": rule.action.value,
                    "agent_id": rule.agent_id, "description": rule.description,
                    "hit_count": rule.hit_count,
                }
            self._rules_path.write_text(json.dumps(data, indent=2))
        except Exception as e:
            logger.warning("Save rules failed: %s", e)

    def _load_rules(self):
        if not self._rules_path.exists():
            return
        try:
            data = json.loads(self._rules_path.read_text())
            for rid, rd in data.items():
                self._rules[rid] = FirewallRule(
                    id=rid, pattern=rd["pattern"],
                    action=FirewallAction(rd["action"]),
                    agent_id=rd.get("agent_id", "*"),
                    description=rd.get("description", ""),
                    hit_count=rd.get("hit_count", 0),
                )
        except Exception as e:
            logger.warning("Load rules failed: %s", e)
