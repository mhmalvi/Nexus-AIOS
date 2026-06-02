"""
DEPRECATED shim — the canonical network firewall now lives in
`security.network_firewall` (consolidation, M2-5).

This module previously held a second, divergent NetworkFirewall with a *sync*
`check_request()` API. That meant `supervisor.firewall` exposed a different
interface from the one the toolbox/egress guards call (`await fw.check(...)`),
so firewall enforcement silently no-op'd in production. We now re-export the
single canonical implementation so every caller shares one async, rule-based,
exfiltration-aware firewall.

Kept as a shim (not deleted) so any lingering `from supervisor.network_firewall
import ...` keeps working.
"""

from security.network_firewall import (  # noqa: F401
    NetworkFirewall,
    FirewallAction,
    FirewallVerdict,
    FirewallRule,
    NetworkEvent,
)

# DEFAULT_ALLOWLIST is a class attribute on the canonical engine; expose it at
# module level for backward compatibility with the old shim API.
DEFAULT_ALLOWLIST = NetworkFirewall.DEFAULT_ALLOWLIST

# Backward-compatible alias for the old dataclass name (was a separate type).
FirewallDecision = FirewallVerdict

__all__ = [
    "NetworkFirewall",
    "FirewallAction",
    "FirewallVerdict",
    "FirewallRule",
    "NetworkEvent",
    "FirewallDecision",
    "DEFAULT_ALLOWLIST",
]
