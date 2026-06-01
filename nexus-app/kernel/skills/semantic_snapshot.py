"""
Nexus Semantic Snapshots — Accessibility-Tree-Based Browser Automation
Ported from OpenClaw's pw-role-snapshot.ts pattern.

Converts Playwright ARIA snapshots into a compact representation with
stable element references (e.g. [ref=e1], [ref=e2]) that the LLM can
use to interact with web pages without needing CSS selectors.

Usage:
    from skills.semantic_snapshot import build_role_snapshot
    
    snapshot_text, refs = build_role_snapshot(aria_tree)
    # snapshot_text goes into LLM context
    # refs maps "e1" -> {"role": "button", "name": "Submit"}
    # LLM says "click @e1" -> resolve to Playwright locator
"""

import re
import math
import logging
from typing import Dict, Optional, Tuple, List
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class RoleRef:
    """Reference to an interactive or content element."""
    role: str
    name: Optional[str] = None
    nth: Optional[int] = None


@dataclass
class RoleSnapshotStats:
    lines: int
    chars: int
    refs: int
    interactive: int


@dataclass
class RoleSnapshotOptions:
    interactive: bool = False
    max_depth: Optional[int] = None
    compact: bool = False


# Roles that represent clickable/typeable elements
INTERACTIVE_ROLES = frozenset({
    "button", "link", "textbox", "checkbox", "radio",
    "combobox", "listbox", "menuitem", "menuitemcheckbox",
    "menuitemradio", "option", "searchbox", "slider",
    "spinbutton", "switch", "tab", "treeitem",
})

# Roles that carry meaningful content
CONTENT_ROLES = frozenset({
    "heading", "cell", "gridcell", "columnheader",
    "rowheader", "listitem", "article", "region",
    "main", "navigation",
})

# Structural containers (may be pruned in compact mode)
STRUCTURAL_ROLES = frozenset({
    "generic", "group", "list", "table", "row",
    "rowgroup", "grid", "treegrid", "menu", "menubar",
    "toolbar", "tablist", "tree", "directory",
    "document", "application", "presentation", "none",
})


def _get_indent_level(line: str) -> int:
    stripped = len(line) - len(line.lstrip())
    return stripped // 2


# Regex for parsing ARIA snapshot lines
_LINE_RE = re.compile(r"^(\s*-\s*)(\w+)(?:\s+\"([^\"]*)\")?(.*)")
_AI_REF_RE = re.compile(r"\[ref=(e\d+)\]", re.IGNORECASE)


def parse_role_ref(raw: str) -> Optional[str]:
    """Parse a ref string like '@e5' or 'ref=e5' into 'e5'."""
    trimmed = raw.strip()
    if not trimmed:
        return None
    if trimmed.startswith("@"):
        trimmed = trimmed[1:]
    elif trimmed.startswith("ref="):
        trimmed = trimmed[4:]
    return trimmed if re.match(r"^e\d+$", trimmed) else None


def _compact_tree(tree: str) -> str:
    """Remove unnamed structural elements and empty branches."""
    lines = tree.split("\n")
    result = []

    for i, line in enumerate(lines):
        if "[ref=" in line:
            result.append(line)
            continue
        if ":" in line and not line.rstrip().endswith(":"):
            result.append(line)
            continue

        current_indent = _get_indent_level(line)
        has_relevant = False
        for j in range(i + 1, len(lines)):
            child_indent = _get_indent_level(lines[j])
            if child_indent <= current_indent:
                break
            if "[ref=" in lines[j]:
                has_relevant = True
                break
        if has_relevant:
            result.append(line)

    return "\n".join(result)


def build_role_snapshot(
    aria_snapshot: str,
    options: Optional[RoleSnapshotOptions] = None,
) -> Tuple[str, Dict[str, RoleRef]]:
    """
    Build a role snapshot from a Playwright ARIA snapshot.
    
    Args:
        aria_snapshot: Raw ARIA snapshot text (from page.accessibility.snapshot())
        options: Filtering options

    Returns:
        Tuple of (snapshot_text, refs_dict)
        - snapshot_text: compact text view for LLM
        - refs_dict: maps "e1" -> RoleRef(role="button", name="Submit")
    """
    if options is None:
        options = RoleSnapshotOptions()

    lines = aria_snapshot.split("\n")
    refs: Dict[str, RoleRef] = {}
    counter = [0]  # mutable counter

    # Track duplicate role+name combos for nth indexing
    counts: Dict[str, int] = {}
    refs_by_key: Dict[str, List[str]] = {}

    def next_ref() -> str:
        counter[0] += 1
        return f"e{counter[0]}"

    def role_key(role: str, name: Optional[str]) -> str:
        return f"{role}:{name or ''}"

    def get_next_index(role: str, name: Optional[str]) -> int:
        key = role_key(role, name)
        idx = counts.get(key, 0)
        counts[key] = idx + 1
        return idx

    def track_ref(role: str, name: Optional[str], ref: str):
        key = role_key(role, name)
        refs_by_key.setdefault(key, []).append(ref)

    def remove_nth_from_non_duplicates():
        duplicate_keys = {k for k, v in refs_by_key.items() if len(v) > 1}
        for ref_id, data in refs.items():
            key = role_key(data.role, data.name)
            if key not in duplicate_keys:
                data.nth = None

    # --- Interactive-only mode (flat list) ---
    if options.interactive:
        result = []
        for line in lines:
            depth = _get_indent_level(line)
            if options.max_depth is not None and depth > options.max_depth:
                continue

            m = _LINE_RE.match(line)
            if not m:
                continue

            _, role_raw, name, suffix = m.groups()
            if role_raw.startswith("/"):
                continue

            role = role_raw.lower()
            if role not in INTERACTIVE_ROLES:
                continue

            ref = next_ref()
            nth = get_next_index(role, name)
            track_ref(role, name, ref)
            refs[ref] = RoleRef(role=role, name=name, nth=nth)

            enhanced = f"- {role_raw}"
            if name:
                enhanced += f' "{name}"'
            enhanced += f" [ref={ref}]"
            if nth > 0:
                enhanced += f" [nth={nth}]"
            if suffix and "[" in suffix:
                enhanced += suffix
            result.append(enhanced)

        remove_nth_from_non_duplicates()
        snapshot = "\n".join(result) or "(no interactive elements)"
        return snapshot, refs

    # --- Full tree mode ---
    result = []
    for line in lines:
        depth = _get_indent_level(line)
        if options.max_depth is not None and depth > options.max_depth:
            continue

        m = _LINE_RE.match(line)
        if not m:
            if not options.interactive:
                result.append(line)
            continue

        prefix, role_raw, name, suffix = m.groups()
        if role_raw.startswith("/"):
            result.append(line)
            continue

        role = role_raw.lower()
        is_interactive = role in INTERACTIVE_ROLES
        is_content = role in CONTENT_ROLES
        is_structural = role in STRUCTURAL_ROLES

        if options.compact and is_structural and not name:
            continue

        should_have_ref = is_interactive or (is_content and name)
        if not should_have_ref:
            result.append(line)
            continue

        ref = next_ref()
        nth = get_next_index(role, name)
        track_ref(role, name, ref)
        refs[ref] = RoleRef(role=role, name=name, nth=nth)

        enhanced = f"{prefix}{role_raw}"
        if name:
            enhanced += f' "{name}"'
        enhanced += f" [ref={ref}]"
        if nth > 0:
            enhanced += f" [nth={nth}]"
        if suffix:
            enhanced += suffix
        result.append(enhanced)

    remove_nth_from_non_duplicates()
    tree = "\n".join(result) or "(empty)"
    snapshot = _compact_tree(tree) if options.compact else tree
    return snapshot, refs


def get_snapshot_stats(snapshot: str, refs: Dict[str, RoleRef]) -> RoleSnapshotStats:
    """Get statistics about a role snapshot."""
    interactive = sum(1 for r in refs.values() if r.role in INTERACTIVE_ROLES)
    return RoleSnapshotStats(
        lines=snapshot.count("\n") + 1,
        chars=len(snapshot),
        refs=len(refs),
        interactive=interactive,
    )
