"""
Tests for Phase 5 Strategy B — OpenClaw Cherry-Pick components.
Validates: SkillLoader, SemanticSnapshot, DockerSandbox availability, ClawHub adapter.
"""

import pytest
import asyncio
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "kernel"))

from skills.loader import SkillLoader, _parse_skill_md, _parse_yaml_simple
from skills.semantic_snapshot import (
    build_role_snapshot,
    RoleSnapshotOptions,
    parse_role_ref,
    get_snapshot_stats,
    INTERACTIVE_ROLES,
)
from skills.docker_sandbox import DockerSandbox, SandboxConfig


# ─── SkillLoader Tests ───

class TestSkillLoader:
    def test_parse_yaml_simple(self):
        yaml = 'name: test-skill\ndescription: A test skill'
        result = _parse_yaml_simple(yaml)
        assert result["name"] == "test-skill"
        assert result["description"] == "A test skill"

    def test_parse_skill_md(self):
        content = '---\nname: foo\n---\n# Foo\nBody text here.'
        result = _parse_skill_md(content)
        assert result is not None
        frontmatter, body = result
        assert "name: foo" in frontmatter
        assert "# Foo" in body

    def test_parse_skill_md_no_frontmatter(self):
        content = "# Just markdown\nNo frontmatter here."
        result = _parse_skill_md(content)
        assert result is None

    def test_discover_skills(self):
        # Use our built-in skills dir
        skills_dir = os.path.join(os.path.dirname(__file__), "kernel", "skills", "builtins")
        loader = SkillLoader(skills_dir)
        skills = loader.discover()
        assert len(skills) >= 1
        
        chat = loader.get("nexus-chat")
        assert chat is not None
        assert chat.metadata.name == "nexus-chat"
        assert "streaming" in chat.instructions.lower() or "stream" in chat.instructions.lower()

    def test_skill_to_prompt(self):
        skills_dir = os.path.join(os.path.dirname(__file__), "kernel", "skills", "builtins")
        loader = SkillLoader(skills_dir)
        loader.discover()
        
        chat = loader.get("nexus-chat")
        prompt = chat.to_prompt()
        assert "## Skill: nexus-chat" in prompt
        assert "Description" in prompt

    def test_skill_context_budget(self):
        skills_dir = os.path.join(os.path.dirname(__file__), "kernel", "skills", "builtins")
        loader = SkillLoader(skills_dir)
        loader.discover()
        
        context = loader.get_skill_context(max_total_chars=50)
        assert len(context) <= 200  # Truncated


# ─── Semantic Snapshot Tests ───

class TestSemanticSnapshot:
    SAMPLE_ARIA = """- document
  - navigation "Main Nav"
    - link "Home"
    - link "About"
    - link "Contact"
  - main
    - heading "Welcome" level=1
    - textbox "Search..."
    - button "Submit"
    - button "Cancel"
  - generic
    - group
      - checkbox "Agree to terms"
"""

    def test_full_snapshot(self):
        snapshot, refs = build_role_snapshot(self.SAMPLE_ARIA)
        assert "[ref=" in snapshot
        assert len(refs) > 0
        
        # Links and buttons should have refs
        has_link = any(r.role == "link" for r in refs.values())
        has_button = any(r.role == "button" for r in refs.values())
        assert has_link
        assert has_button

    def test_interactive_only(self):
        options = RoleSnapshotOptions(interactive=True)
        snapshot, refs = build_role_snapshot(self.SAMPLE_ARIA, options)
        
        # All refs should be interactive
        for ref in refs.values():
            assert ref.role in INTERACTIVE_ROLES

        # Should not include heading, navigation etc.
        assert "document" not in snapshot
        assert "heading" not in snapshot

    def test_compact_mode(self):
        options = RoleSnapshotOptions(compact=True)
        snapshot, refs = build_role_snapshot(self.SAMPLE_ARIA, options)
        
        # "generic" and unnamed "group" should be removed
        assert "generic" not in snapshot

    def test_max_depth(self):
        options = RoleSnapshotOptions(max_depth=1)
        snapshot, refs = build_role_snapshot(self.SAMPLE_ARIA, options)
        
        # Deep elements (inside navigation/main) should be excluded  
        # Only depth-0 and depth-1 elements should remain
        assert len(snapshot.split("\n")) < self.SAMPLE_ARIA.count("\n")

    def test_parse_role_ref(self):
        assert parse_role_ref("@e5") == "e5"
        assert parse_role_ref("ref=e12") == "e12"
        assert parse_role_ref("e3") == "e3"
        assert parse_role_ref("invalid") is None
        assert parse_role_ref("") is None

    def test_snapshot_stats(self):
        snapshot, refs = build_role_snapshot(self.SAMPLE_ARIA)
        stats = get_snapshot_stats(snapshot, refs)
        assert stats.refs > 0
        assert stats.interactive > 0
        assert stats.lines > 0

    def test_duplicate_nth_handling(self):
        aria = """- main
  - button "Save"
  - button "Save"
  - button "Cancel"
"""
        snapshot, refs = build_role_snapshot(aria)
        
        # Two "Save" buttons should get nth indices
        save_refs = [r for r in refs.values() if r.name == "Save"]
        assert len(save_refs) == 2
        nths = [r.nth for r in save_refs if r.nth is not None]
        assert len(nths) == 2  # Both should have nth due to duplicate


# ─── Docker Sandbox Tests ───

class TestDockerSandbox:
    def test_config_defaults(self):
        config = SandboxConfig()
        assert config.memory_limit == "512m"
        assert config.network == "none"
        assert config.read_only_root is True

    def test_sandbox_status(self):
        sandbox = DockerSandbox()
        status = sandbox.get_status()
        assert "image" in status
        assert "memory_limit" in status
        assert status["network"] == "none"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
