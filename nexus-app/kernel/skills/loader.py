"""
Nexus Skill Loader
Discovers and parses SKILL.md files from the skills directory tree.

Adopted from OpenClaw's SKILL.md convention:
  - YAML frontmatter (name, description, metadata)
  - Markdown body containing instructions for the LLM

Usage:
    loader = SkillLoader("/opt/nexus/skills")
    skills = loader.discover()
    skill = loader.get("coding-agent")
    prompt_context = skill.to_prompt()  # inject into LLM context
"""

import os
import re
import logging
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

# Regex to extract YAML frontmatter from SKILL.md
FRONTMATTER_RE = re.compile(
    r"^---\s*\n(.*?)\n---\s*\n(.*)$",
    re.DOTALL
)


@dataclass
class SkillMetadata:
    """Parsed metadata from a SKILL.md frontmatter."""
    name: str
    description: str
    requires: Dict[str, Any] = field(default_factory=dict)
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Skill:
    """A loaded skill with its metadata and instructions."""
    metadata: SkillMetadata
    instructions: str  # Markdown body
    path: Path         # Directory containing SKILL.md

    def to_prompt(self, max_chars: int = 4000) -> str:
        """
        Format skill as context for LLM injection.
        Truncates if needed to fit within token budget.
        """
        header = f"## Skill: {self.metadata.name}\n"
        header += f"**Description:** {self.metadata.description}\n\n"

        body = self.instructions
        if len(body) > max_chars:
            body = body[:max_chars] + "\n\n... (truncated)"

        return header + body

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.metadata.name,
            "description": self.metadata.description,
            "requires": self.metadata.requires,
            "path": str(self.path),
        }


def _parse_yaml_simple(yaml_text: str) -> Dict[str, Any]:
    """
    Simple YAML-like parser for frontmatter.
    Handles key: value pairs. For complex nested YAML, 
    we fall back to json metadata blocks.
    """
    try:
        import yaml
        return yaml.safe_load(yaml_text) or {}
    except ImportError:
        # Fallback: basic key-value parsing
        result = {}
        for line in yaml_text.strip().split("\n"):
            line = line.strip()
            if ":" in line and not line.startswith("#"):
                key, _, value = line.partition(":")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if value.lower() == "true":
                    value = True
                elif value.lower() == "false":
                    value = False
                result[key] = value
        return result


def _parse_skill_md(content: str) -> Optional[tuple]:
    """Parse SKILL.md content into (metadata_dict, body)."""
    match = FRONTMATTER_RE.match(content)
    if not match:
        return None
    return match.group(1), match.group(2)


class SkillLoader:
    """
    Discovers and loads SKILL.md files from a directory tree.
    
    Directory structure:
        skills/
          coding-agent/
            SKILL.md
          weather/
            SKILL.md
          discord/
            SKILL.md
    """

    def __init__(self, skills_dir: str):
        self.skills_dir = Path(skills_dir)
        self._skills: Dict[str, Skill] = {}

    def discover(self) -> List[Skill]:
        """
        Scan skills_dir for SKILL.md files and parse them.
        Returns list of loaded skills.
        """
        self._skills.clear()
        
        if not self.skills_dir.exists():
            logger.warning(f"Skills directory not found: {self.skills_dir}")
            return []

        found = []
        for skill_dir in sorted(self.skills_dir.iterdir()):
            if not skill_dir.is_dir():
                continue

            skill_file = skill_dir / "SKILL.md"
            if not skill_file.exists():
                continue

            try:
                content = skill_file.read_text(encoding="utf-8")
                parsed = _parse_skill_md(content)
                if not parsed:
                    logger.warning(f"Invalid SKILL.md (no frontmatter): {skill_file}")
                    continue

                raw_yaml, body = parsed
                meta_dict = _parse_yaml_simple(raw_yaml)

                metadata = SkillMetadata(
                    name=meta_dict.get("name", skill_dir.name),
                    description=meta_dict.get("description", ""),
                    requires=meta_dict.get("metadata", {}).get("openclaw", {}).get("requires", {})
                        if isinstance(meta_dict.get("metadata"), dict) else {},
                    extra={k: v for k, v in meta_dict.items() if k not in ("name", "description", "metadata")},
                )

                skill = Skill(
                    metadata=metadata,
                    instructions=body.strip(),
                    path=skill_dir,
                )

                self._skills[metadata.name] = skill
                found.append(skill)
                logger.debug(f"Loaded skill: {metadata.name} from {skill_dir.name}")

            except Exception as e:
                logger.error(f"Failed to load skill from {skill_file}: {e}")

        logger.info(f"Discovered {len(found)} skills in {self.skills_dir}")
        return found

    def get(self, name: str) -> Optional[Skill]:
        """Get a loaded skill by name."""
        return self._skills.get(name)

    def get_all(self) -> Dict[str, Skill]:
        """Get all loaded skills."""
        return dict(self._skills)

    def get_skill_context(self, names: Optional[List[str]] = None, max_total_chars: int = 16000) -> str:
        """
        Build a combined prompt context from selected skills.
        If names is None, includes all skills.
        Respects max_total_chars budget.
        """
        skills_to_include = (
            [self._skills[n] for n in names if n in self._skills]
            if names
            else list(self._skills.values())
        )

        parts = []
        remaining = max_total_chars
        for skill in skills_to_include:
            chunk = skill.to_prompt(max_chars=min(remaining, 4000))
            parts.append(chunk)
            remaining -= len(chunk)
            if remaining <= 0:
                break

        return "\n\n---\n\n".join(parts)
