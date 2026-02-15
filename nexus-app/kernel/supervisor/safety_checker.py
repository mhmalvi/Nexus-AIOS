"""
Nexus Safety Checker - Blacklist and Risk Assessment
Validates actions against safety rules
"""

import re
from typing import List, Optional
from dataclasses import dataclass


@dataclass
class SafetyResult:
    """Result from safety check"""
    is_safe: bool
    reason: Optional[str]
    matched_pattern: Optional[str]


class SafetyChecker:
    """
    Safety Checker - Action Validation
    
    Checks:
    - Blacklist pattern matching
    - Risk level assessment
    - Dangerous command detection
    """
    
    # Default dangerous patterns
    DEFAULT_BLACKLIST = [
        # File system destruction
        r"rm\s+-rf\s+/",
        r"rm\s+-rf\s+~",
        r"rm\s+-rf\s+\*",
        r"del\s+/s\s+/q\s+C:\\",
        r"rmdir\s+/s\s+/q\s+C:\\",
        r"format\s+[a-zA-Z]:",
        
        # Fork bombs and resource exhaustion
        r":\(\)\s*\{\s*:\|:&\s*\};:",  # Bash fork bomb
        r"while\s+true.*do.*done",
        r"for\s*/L.*do.*goto",  # CMD infinite loop
        
        # Disk operations
        r"dd\s+if=.*of=/dev/",
        r"mkfs\.",
        
        # Permission escalation
        r"chmod\s+-R\s+777\s+/",
        r"chown\s+-R.*:.*\s+/",
        
        # Remote code execution
        r"curl.*\|\s*sh",
        r"curl.*\|\s*bash",
        r"wget.*\|\s*sh",
        r"wget.*\|\s*bash",
        
        # Registry damage (Windows)
        r"reg\s+delete\s+HKLM",
        r"reg\s+delete\s+HKCU.*\\\\Run",
        
        # Credential theft patterns
        r"mimikatz",
        r"sekurlsa",
        r"SAM\s+SYSTEM",
        
        # Network attacks
        r"nc\s+-[el]",  # Netcat listener
        r"nmap\s+-sS",  # SYN scan
    ]
    
    # Risk level keywords
    RISK_KEYWORDS = {
        "critical": [
            "format", "delete all", "drop database", "truncate",
            "rm -rf", "rmdir /s", ">nul 2>&1", "shutdown",
            "reboot", "halt", "poweroff"
        ],
        "high": [
            "delete", "remove", "uninstall", "kill", "stop",
            "disable", "modify system", "sudo", "admin",
            "registry", "chmod", "chown"
        ],
        "medium": [
            "install", "update", "upgrade", "write", "create",
            "move", "rename", "copy", "download"
        ],
        "low": [
            "read", "list", "show", "display", "print",
            "get", "query", "search", "find"
        ]
    }
    
    def __init__(self, blacklist_path: Optional[str] = None):
        self.patterns = self.DEFAULT_BLACKLIST.copy()
        
        if blacklist_path:
            self._load_blacklist(blacklist_path)
        
        # Compile patterns for efficiency
        self.compiled_patterns = [
            (pattern, re.compile(pattern, re.IGNORECASE))
            for pattern in self.patterns
        ]
    
    def _load_blacklist(self, path: str):
        """Load additional patterns from file"""
        try:
            with open(path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        self.patterns.append(line)
        except Exception:
            pass
    
    @staticmethod
    def _normalize_whitespace(text: str) -> str:
        """Normalize whitespace to prevent evasion via extra spaces/tabs"""
        return re.sub(r'\s+', ' ', text.strip())

    @staticmethod
    def _decode_obfuscation(text: str) -> str:
        """Attempt to decode common obfuscation techniques.
        Returns the decoded text appended to original for pattern matching.
        """
        variants = [text]

        # Base64 decoding attempt
        import base64
        # Look for base64-encoded segments (e.g. in echo XXX | base64 -d | sh)
        b64_pattern = re.compile(r'[A-Za-z0-9+/]{16,}={0,2}')
        for match in b64_pattern.finditer(text):
            try:
                decoded = base64.b64decode(match.group()).decode('utf-8', errors='ignore')
                if decoded and len(decoded) > 4:
                    variants.append(decoded)
            except Exception:
                pass

        # Hex decoding (e.g. \x72\x6d)
        hex_pattern = re.compile(r'(?:\\x[0-9a-fA-F]{2})+')
        for match in hex_pattern.finditer(text):
            try:
                decoded = bytes.fromhex(match.group().replace('\\x', '')).decode('utf-8', errors='ignore')
                variants.append(decoded)
            except Exception:
                pass

        # URL encoding (%72%6d)
        try:
            from urllib.parse import unquote
            url_decoded = unquote(text)
            if url_decoded != text:
                variants.append(url_decoded)
        except Exception:
            pass

        # Variable interpolation patterns (e.g. r"m" + " -rf /")
        # Strip quotes and concatenation operators
        stripped = re.sub(r'["\']?\s*\+\s*["\']?', '', text)
        stripped = re.sub(r'["\']', '', stripped)
        if stripped != text:
            variants.append(stripped)

        return ' '.join(variants)

    def check(self, action: str) -> SafetyResult:
        """Check if an action is safe.
        Applies whitespace normalization and obfuscation decoding
        to resist encoding-based evasion attempts.
        """
        normalized = self._normalize_whitespace(action)
        expanded = self._decode_obfuscation(normalized)

        # Check all variants against patterns
        for pattern, compiled in self.compiled_patterns:
            if compiled.search(action) or compiled.search(normalized) or compiled.search(expanded):
                return SafetyResult(
                    is_safe=False,
                    reason=f"Action matches dangerous pattern: {pattern}",
                    matched_pattern=pattern
                )

        return SafetyResult(
            is_safe=True,
            reason=None,
            matched_pattern=None
        )
    
    def assess_risk(self, action: str) -> str:
        """Assess the risk level of an action"""
        
        action_lower = action.lower()
        
        # Check each risk level
        for level in ["critical", "high", "medium", "low"]:
            keywords = self.RISK_KEYWORDS.get(level, [])
            for keyword in keywords:
                if keyword in action_lower:
                    return level
        
        # Default to medium if no keywords match
        return "medium"
    
    def add_pattern(self, pattern: str):
        """Add a new pattern to the blacklist"""
        try:
            compiled = re.compile(pattern, re.IGNORECASE)
            self.patterns.append(pattern)
            self.compiled_patterns.append((pattern, compiled))
        except re.error:
            pass
    
    def remove_pattern(self, pattern: str):
        """Remove a pattern from the blacklist"""
        self.patterns = [p for p in self.patterns if p != pattern]
        self.compiled_patterns = [
            (p, c) for p, c in self.compiled_patterns if p != pattern
        ]
    
    def get_all_patterns(self) -> List[str]:
        """Get all blacklist patterns"""
        return self.patterns.copy()
