"""
Component tests against the REAL kernel APIs (the previous test_brain/test_memory/
test_supervisor/test_toolbox files were stale — they asserted methods that never
existed, e.g. Toolbox.tools, IntentValidator.validate, ErrorKB, Supervisor, Plan).

These run real code with no network: shell echo, temp-file I/O, the supervisor
sub-components, and the Planner with a faked LLM.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Toolbox / executors
# ---------------------------------------------------------------------------

class TestToolbox:

    def test_list_tools_exposes_core_tools(self):
        from toolbox import Toolbox
        names = {t["name"] for t in Toolbox().list_tools()}
        assert {"shell", "read_file", "write_file", "list_dir"} <= names

    @pytest.mark.asyncio
    async def test_execute_shell_echo(self):
        from toolbox import Toolbox
        result = await Toolbox().execute("shell", kwargs={"command": "echo hello_aether"})
        assert result.success is True
        assert "hello_aether" in str(result.output)

    @pytest.mark.asyncio
    async def test_unknown_tool_fails_gracefully(self):
        from toolbox import Toolbox
        result = await Toolbox().execute("does_not_exist", kwargs={})
        assert result.success is False


class TestShellExecutor:

    @pytest.mark.asyncio
    async def test_echo_roundtrip(self):
        from toolbox.shell_executor import ShellExecutor
        res = await ShellExecutor().execute("echo aether_shell")
        assert res.success is True
        assert "aether_shell" in res.output


class TestFileManager:

    @pytest.mark.asyncio
    async def test_write_then_read(self, tmp_path):
        from toolbox.file_manager import FileManager
        fm = FileManager()
        target = str(tmp_path / "note.txt")
        w = await fm.write(target, "remember_this")
        assert w.success is True
        r = await fm.read(target)
        assert r.success is True
        assert "remember_this" in str(r.output)


# ---------------------------------------------------------------------------
# Supervisor sub-components
# ---------------------------------------------------------------------------

class TestSupervisorComponents:

    def test_intent_validator_alignment(self):
        from supervisor.intent_validator import IntentValidator
        res = IntentValidator().check_alignment(
            action="read the project README file",
            intent="show me the README",
        )
        assert res is not None
        assert hasattr(res, "is_aligned")

    def test_audit_logger_records_blocked(self):
        from supervisor.audit_logger import AuditLogger
        log = AuditLogger()
        log.log_blocked("rm -rf /", "matched destructive pattern")
        recent = log.get_recent(limit=10)
        assert isinstance(recent, list)
        assert len(recent) >= 1

    def test_error_kb_lookup_returns_solution_or_none(self):
        from supervisor.error_kb import ErrorKnowledgeBase
        sol = ErrorKnowledgeBase().lookup_correction(
            "PermissionError: [Errno 13] Permission denied: '/etc/hosts'"
        )
        # Either a structured solution or None — never a crash.
        assert sol is None or hasattr(sol, "solution")

    def test_supervisor_allows_benign_and_blocks_dangerous(self):
        from supervisor import AgenticSupervisor
        sup = AgenticSupervisor()
        assert sup.validate(action="list files in the current directory").is_safe is True
        assert sup.validate(action="shell: rm -rf / --no-preserve-root").is_safe is False


# ---------------------------------------------------------------------------
# Planner (faked LLM — no Ollama)
# ---------------------------------------------------------------------------

class _FakeLLM:
    def __init__(self, response: str):
        self._response = response

    async def generate(self, prompt, temperature=0.7, max_tokens=2048, **kw):
        return self._response


_VALID_PLAN = """
{
  "description": "echo a greeting",
  "estimated_time": "1s",
  "requires_approval": false,
  "steps": [
    {"id": "step_1", "action": "echo", "tool": "shell",
     "args": {"command": "echo hi"}, "depends_on": [],
     "description": "say hi", "risk_level": "low"}
  ]
}
"""

# Same plan but wrapped in prose + code fences — exercises the JSON-repair path.
_MESSY_PLAN = "Sure! Here is the plan:\n```json\n" + _VALID_PLAN + "\n```\nHope that helps."


class TestPlanner:

    @pytest.mark.asyncio
    async def test_create_plan_parses_clean_json(self):
        from brain.planner import Planner, TaskPlan
        plan = await Planner(llm=_FakeLLM(_VALID_PLAN)).create_plan("echo hi", tools=[{"name": "shell"}])
        assert isinstance(plan, TaskPlan)
        assert len(plan.steps) == 1
        assert plan.steps[0].tool == "shell"

    @pytest.mark.asyncio
    async def test_create_plan_recovers_from_messy_output(self):
        """Small local models wrap JSON in prose/fences — the planner must recover."""
        from brain.planner import Planner
        plan = await Planner(llm=_FakeLLM(_MESSY_PLAN)).create_plan("echo hi", tools=[{"name": "shell"}])
        assert len(plan.steps) == 1, "planner failed to extract JSON from messy LLM output"
        assert plan.steps[0].args.get("command") == "echo hi"

    @pytest.mark.asyncio
    async def test_create_plan_repairs_trailing_commas(self):
        """Trailing commas (a very common small-model defect) must be repaired."""
        from brain.planner import Planner
        bad = """{"description":"x","steps":[{"id":"step_1","tool":"shell",
                  "action":"echo","args":{"command":"echo hi"},},],}"""
        plan = await Planner(llm=_FakeLLM(bad)).create_plan("echo hi", tools=[{"name": "shell"}])
        assert len(plan.steps) == 1

    @pytest.mark.asyncio
    async def test_create_plan_handles_total_garbage(self):
        """No JSON at all → a graceful empty plan (no crash)."""
        from brain.planner import Planner
        plan = await Planner(llm=_FakeLLM("Sorry, I can't help with that.")).create_plan(
            "do something", tools=[{"name": "shell"}])
        assert plan.steps == []  # no executable steps, but no exception
