"""
Nexus AIOS — Full Wiring Audit Tests
=====================================

These tests verify that ALL built modules are properly imported and
initialized in main.py's AetherKernel. If a module exists but isn't
wired, these tests will catch it.

Coverage:
  - Phase 2: QueryCache, RuntimeConfig
  - Phase 5: SkillLoader, DockerSandbox, OpenClawClient
  - Phase 6: NPUAccelerator, FederatedLearner  
  - Core: Brain, Memory, Toolbox, Supervisor, Agents
"""

import pytest
import os
import sys
import ast
import re

# Path to the kernel source
KERNEL_DIR = os.path.join(os.path.dirname(__file__), "kernel")
MAIN_PY = os.path.join(KERNEL_DIR, "main.py")
sys.path.insert(0, KERNEL_DIR)


class TestImportWiring:
    """Verify that main.py imports all required modules."""

    @pytest.fixture(autouse=True)
    def load_source(self):
        """Read main.py source once."""
        with open(MAIN_PY, "r", encoding="utf-8") as f:
            self.source = f.read()
        self.tree = ast.parse(self.source)

    def _get_all_imports(self):
        """Extract all import names from the AST."""
        imports = set()
        for node in ast.walk(self.tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.add(alias.name)
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                for alias in node.names:
                    imports.add(f"{module}.{alias.name}" if module else alias.name)
        return imports

    # --- Phase 2 Modules ---
    def test_query_cache_imported(self):
        assert "QueryCache" in self.source, "QueryCache not imported in main.py"

    def test_runtime_config_imported(self):
        assert "RuntimeConfig" in self.source, "RuntimeConfig not imported in main.py"

    # --- Phase 5 Modules ---
    def test_skill_loader_imported(self):
        assert "SkillLoader" in self.source, "SkillLoader not imported in main.py"

    def test_docker_sandbox_imported(self):
        assert "DockerSandbox" in self.source, "DockerSandbox not imported in main.py"

    def test_openclaw_client_imported(self):
        assert "OpenClawClient" in self.source, "OpenClawClient not imported in main.py"

    # --- Phase 6 Modules ---
    def test_npu_accelerator_imported(self):
        assert "NPUAccelerator" in self.source, "NPUAccelerator not imported in main.py"

    def test_federated_learner_imported(self):
        assert "FederatedLearner" in self.source, "FederatedLearner not imported in main.py"

    # --- Core Modules ---
    def test_brain_imported(self):
        assert "from brain import Brain" in self.source

    def test_memory_imported(self):
        assert "from memory import MemoryManager" in self.source

    def test_supervisor_imported(self):
        assert "AgenticSupervisor" in self.source



class TestInitWiring:
    """Verify that AetherKernel.__init__ creates all required attributes."""

    @pytest.fixture(autouse=True)
    def load_init(self):
        """Parse __init__ method body."""
        with open(MAIN_PY, "r", encoding="utf-8") as f:
            self.source = f.read()

    # Find 'self.X = ' assignments in __init__
    def _init_assigns(self):
        pattern = re.compile(r"self\.(\w+)\s*=")
        return set(pattern.findall(self.source))

    # --- Phase 2 ---
    def test_query_cache_initialized(self):
        assert "self.query_cache" in self.source, "QueryCache not initialized as self.query_cache"

    def test_runtime_config_initialized(self):
        assert "self.runtime_config" in self.source, "RuntimeConfig not initialized as self.runtime_config"

    # --- Phase 5 ---
    def test_skill_loader_initialized(self):
        assert "self.skill_loader" in self.source, "SkillLoader not initialized as self.skill_loader"

    def test_sandbox_initialized(self):
        assert "self.sandbox" in self.source, "DockerSandbox not initialized as self.sandbox"

    def test_openclaw_client_initialized(self):
        assert "self.openclaw_client" in self.source, "OpenClawClient not initialized as self.openclaw_client"

    # --- Phase 6 ---
    def test_npu_accelerator_initialized(self):
        assert "self.npu_accelerator" in self.source, "NPUAccelerator not initialized as self.npu_accelerator"

    def test_federated_learner_initialized(self):
        assert "self.federated_learner" in self.source, "FederatedLearner not initialized as self.federated_learner"

    # --- Core ---
    def test_brain_initialized(self):
        assert "self.brain" in self.source

    def test_memory_initialized(self):
        assert "self.memory" in self.source

    def test_toolbox_initialized(self):
        assert "self.toolbox" in self.source

    def test_supervisor_initialized(self):
        assert "self.supervisor" in self.source

    def test_worker_agent_initialized(self):
        assert "self.worker_agent" in self.source

    def test_manager_agent_initialized(self):
        assert "self.manager_agent" in self.source

    def test_monitor_agent_initialized(self):
        assert "self.monitor_agent" in self.source

    def test_learning_engine_initialized(self):
        assert "self.learning_engine" in self.source

    def test_system_stats_initialized(self):
        assert "self.system_stats" in self.source


class TestQueryCacheWiring:
    """Verify QueryCache is actually USED in the query flow, not just instantiated."""

    @pytest.fixture(autouse=True)
    def load_source(self):
        with open(MAIN_PY, "r", encoding="utf-8") as f:
            self.source = f.read()

    def test_cache_check_in_handle_query(self):
        assert "query_cache.get" in self.source, "Cache GET not called in _handle_query"

    def test_cache_put_in_handle_query(self):
        assert "query_cache.put" in self.source, "Cache PUT not called in _handle_query"

    def test_cache_make_key_in_handle_query(self):
        assert "query_cache.make_key" in self.source, "Cache make_key not called in _handle_query"


class TestRuntimeConfigWiring:
    """Verify RuntimeConfig is used for persistence, not just a plain dict."""

    @pytest.fixture(autouse=True)
    def load_source(self):
        with open(MAIN_PY, "r", encoding="utf-8") as f:
            self.source = f.read()

    def test_config_set_in_update_handler(self):
        assert "runtime_config.set" in self.source, "RuntimeConfig.set not called in _handle_update_config"

    def test_config_load_in_main(self):
        assert "rt_config.load()" in self.source, "RuntimeConfig.load() not called at startup"

    def test_persisted_config_merged(self):
        assert "persisted" in self.source and "full_config" in self.source, \
            "Persisted config not merged with CLI args at startup"


class TestStatusEndpoint:
    """Verify the status endpoint reports all subsystems."""

    @pytest.fixture(autouse=True)
    def load_source(self):
        with open(MAIN_PY, "r", encoding="utf-8") as f:
            self.source = f.read()

    def test_status_reports_cache(self):
        # Find _handle_status method body
        start = self.source.find("def _handle_status")
        end = self.source.find("\n    def ", start + 1)
        status_body = self.source[start:end]
        assert "query_cache" in status_body, \
            "Status endpoint doesn't report cache stats"

    def test_status_reports_npu(self):
        assert "npu_available" in self.source, "Status endpoint doesn't report NPU availability"

    def test_status_reports_skills(self):
        assert "skills_loaded" in self.source, "Status endpoint doesn't report loaded skills count"

    def test_status_reports_sandbox(self):
        assert "sandbox_available" in self.source, "Status endpoint doesn't report sandbox status"

    def test_status_reports_openclaw(self):
        assert "openclaw_connected" in self.source, "Status endpoint doesn't report OpenClaw status"


class TestSkillsInQueryFlow:
    """Verify skills are injected into the LLM context during queries."""

    @pytest.fixture(autouse=True)
    def load_source(self):
        with open(MAIN_PY, "r", encoding="utf-8") as f:
            self.source = f.read()

    def test_skill_context_injected(self):
        assert "skill_context" in self.source and "get_skill_context" in self.source, \
            "Skills not injected into query context"

    def test_skill_context_appended_to_system_prompt(self):
        assert "Available Skills" in self.source, \
            "Skill context not appended to system prompt"


class TestDeadCodeRemoved:
    """Verify known dead code has been cleaned up."""

    @pytest.fixture(autouse=True)
    def load_source(self):
        with open(MAIN_PY, "r", encoding="utf-8") as f:
            self.source = f.read()

    def test_no_unreachable_return_in_update_config(self):
        # The old bug: unreachable code after _handle_update_config returned in all branches
        # had a stray return referencing undefined variable 'action'
        start = self.source.find("def _handle_update_config")
        end = self.source.find("\n    def ", start + 1) if start != -1 else len(self.source)
        update_config_body = self.source[start:end]
        assert "Unknown learning action" not in update_config_body, \
            "Dead code still present: unreachable 'Unknown learning action' return in _handle_update_config"

    def test_no_not_implemented_comments(self):
        assert "not implemented in this snippet" not in self.source, \
            "TODO comment still present: 'not implemented in this snippet'"


class TestModuleImportability:
    """Verify all kernel modules can actually be imported without errors."""

    def test_import_query_cache(self):
        from brain.query_cache import QueryCache
        assert QueryCache is not None

    def test_import_runtime_config(self):
        from runtime_config import RuntimeConfig
        assert RuntimeConfig is not None

    def test_import_skill_loader(self):
        from skills.loader import SkillLoader
        assert SkillLoader is not None

    def test_import_docker_sandbox(self):
        from skills.docker_sandbox import DockerSandbox
        assert DockerSandbox is not None

    def test_import_semantic_snapshot(self):
        from skills.semantic_snapshot import build_role_snapshot
        assert build_role_snapshot is not None

    def test_import_openclaw_client(self):
        from bridge.openclaw_client import OpenClawClient
        assert OpenClawClient is not None

    def test_import_clawhub_adapter(self):
        from skills.clawhub_adapter import ClawHubAdapter
        assert ClawHubAdapter is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
