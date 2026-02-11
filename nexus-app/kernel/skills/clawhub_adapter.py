"""
ClawHub Skill Registry Adapter
Wraps the ClawHub CLI (npm package) to search, install, and manage skills.

Usage:
    adapter = ClawHubAdapter(skills_dir="/opt/nexus/skills")
    results = await adapter.search("discord bot")
    await adapter.install("discord")
    skills = await adapter.list_installed()
"""

import asyncio
import json
import logging
import shutil
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class SkillInfo:
    """Information about a ClawHub skill."""
    name: str
    slug: str
    version: str
    description: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "slug": self.slug,
            "version": self.version,
            "description": self.description,
        }


class ClawHubAdapter:
    """
    Interface to ClawHub skill registry via the clawhub CLI.
    
    Prerequisites:
        npm install -g clawhub
    """

    def __init__(self, skills_dir: str = "./skills"):
        self.skills_dir = Path(skills_dir)
        self._cli_available: Optional[bool] = None

    async def is_available(self) -> bool:
        """Check if the clawhub CLI is installed."""
        if self._cli_available is not None:
            return self._cli_available

        self._cli_available = shutil.which("clawhub") is not None
        return self._cli_available

    async def _run_cli(self, *args: str) -> tuple:
        """Run a clawhub CLI command and return (stdout, stderr, returncode)."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "clawhub", *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(self.skills_dir),
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
            return (
                stdout.decode(errors="replace"),
                stderr.decode(errors="replace"),
                proc.returncode or 0,
            )
        except asyncio.TimeoutError:
            return ("", "Command timed out", -1)
        except FileNotFoundError:
            return ("", "clawhub CLI not found", -1)

    async def search(self, query: str) -> List[Dict[str, Any]]:
        """
        Search ClawHub registry for skills.
        
        Returns list of skill info dicts.
        """
        stdout, stderr, rc = await self._run_cli("search", query)
        if rc != 0:
            logger.warning(f"ClawHub search failed: {stderr}")
            return []

        # Parse output (clawhub search returns formatted text)
        results = []
        for line in stdout.strip().split("\n"):
            line = line.strip()
            if line and not line.startswith("─") and not line.startswith("Search"):
                parts = line.split(maxsplit=2)
                if len(parts) >= 2:
                    results.append({
                        "slug": parts[0],
                        "version": parts[1] if len(parts) > 1 else "unknown",
                        "description": parts[2] if len(parts) > 2 else "",
                    })

        return results

    async def install(self, slug: str, version: Optional[str] = None) -> bool:
        """
        Install a skill from ClawHub.
        
        Args:
            slug: Skill slug (e.g. "discord", "weather")
            version: Specific version (optional)
        
        Returns:
            True if installation succeeded
        """
        args = ["install", slug]
        if version:
            args.extend(["--version", version])

        stdout, stderr, rc = await self._run_cli(*args)
        if rc != 0:
            logger.error(f"Failed to install {slug}: {stderr}")
            return False

        logger.info(f"Installed skill: {slug}")
        return True

    async def update(self, slug: Optional[str] = None, force: bool = False) -> bool:
        """
        Update installed skills.
        
        Args:
            slug: Specific skill to update (None = all)
            force: Force update even without version change
        """
        args = ["update"]
        if slug:
            args.append(slug)
        else:
            args.append("--all")
        if force:
            args.append("--force")
        args.append("--no-input")

        stdout, stderr, rc = await self._run_cli(*args)
        if rc != 0:
            logger.error(f"Update failed: {stderr}")
            return False

        logger.info(f"Updated {'all skills' if not slug else slug}")
        return True

    async def list_installed(self) -> List[Dict[str, Any]]:
        """List installed skills."""
        stdout, stderr, rc = await self._run_cli("list")
        if rc != 0:
            logger.warning(f"ClawHub list failed: {stderr}")
            return []

        results = []
        for line in stdout.strip().split("\n"):
            line = line.strip()
            if line and not line.startswith("─") and not line.startswith("Installed"):
                parts = line.split(maxsplit=2)
                if parts:
                    results.append({
                        "slug": parts[0],
                        "version": parts[1] if len(parts) > 1 else "unknown",
                    })

        return results

    def get_status(self) -> Dict[str, Any]:
        """Get adapter status."""
        return {
            "cli_available": self._cli_available,
            "skills_dir": str(self.skills_dir),
        }
