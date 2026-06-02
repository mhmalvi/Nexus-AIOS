"""
Log redaction — mask secret-looking values before they reach a log line (F6).

The kernel logs raw inbound IPC messages for diagnostics; without redaction an
`update_config`/`set_api_key`/`set_destruct_pin` message would print API keys,
tokens, or PINs in plaintext to stderr (which the desktop shell captures).
"""

from __future__ import annotations

import json
import re

_SENSITIVE_TOKENS = ("apikey", "api_key", "secret", "token", "password", "passwd", "pin", "key")
_SENSITIVE_CONTAINERS = ("api_keys", "keys")  # every child value is treated as a secret
_SENSITIVE_KEY_RE = re.compile(
    r'("(?:[a-z_]*(?:api[_-]?key|secret|token|password|passwd|pin|key)[a-z_]*)"\s*:\s*)"[^"]*"',
    re.IGNORECASE,
)


def _redact_obj(obj, in_secret_container: bool = False):
    """Recursively redact secret string values in a parsed JSON structure."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            kl = str(k).lower()
            child_container = in_secret_container or kl in _SENSITIVE_CONTAINERS
            key_is_secret = any(tok in kl for tok in _SENSITIVE_TOKENS)
            if isinstance(v, (dict, list)):
                out[k] = _redact_obj(v, child_container)
            elif (key_is_secret or in_secret_container) and v not in (None, "", False):
                out[k] = "***REDACTED***"
            else:
                out[k] = v
        return out
    if isinstance(obj, list):
        return [_redact_obj(x, in_secret_container) for x in obj]
    return obj


def redact_sensitive(text: str) -> str:
    """Redact secret-looking values in a string destined for logs.

    Structural (JSON-aware) when possible so nested api_keys/provider maps are
    fully masked; regex fallback for non-JSON text.
    """
    try:
        return json.dumps(_redact_obj(json.loads(text)))
    except Exception:
        pass
    try:
        return _SENSITIVE_KEY_RE.sub(r'\1"***REDACTED***"', text)
    except Exception:
        return text
