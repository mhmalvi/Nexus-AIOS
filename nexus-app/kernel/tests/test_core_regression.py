"""
Core regression tests — guard the intelligence loop that silently broke before:

  * memory retrieval (RAG / recall / semantic search) — the RRF/threshold bug
    that made `retrieve()` always return [] (kernel/memory/lancedb_store.py).
  * memory tier counts (kernel/memory/memory_manager.py get_stats).
  * agentic execution end-to-end (plan -> supervisor -> tool -> side effect).

These are CI-safe: embeddings are mocked with a deterministic bag-of-words
vector and the agent's planner/LLM is faked, so NO Ollama/network is required.
A real temporary LanceDB is used so the actual store/search code runs.
"""
import hashlib
import math
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DIM = 768


def _fake_vec(text: str):
    """Deterministic normalized hashed bag-of-words embedding (no Ollama)."""
    v = [0.0] * DIM
    for word in str(text).lower().split():
        idx = int(hashlib.md5(word.encode()).hexdigest(), 16) % DIM
        v[idx] += 1.0
    norm = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / norm for x in v]


async def _fake_embed(self, text):  # signature matches LanceDBStore._get_embedding
    return _fake_vec(text)


@pytest.fixture
def patch_embeddings(monkeypatch):
    """Replace Ollama embeddings with the deterministic fake."""
    from memory.lancedb_store import LanceDBStore
    monkeypatch.setattr(LanceDBStore, "_get_embedding", _fake_embed)


def _new_manager(tmp_path):
    from memory.memory_manager import MemoryManager
    return MemoryManager(
        db_path=str(tmp_path / "mem.lance"),
        session_dir=str(tmp_path / "sessions"),
    )


# ---------------------------------------------------------------------------
# Memory retrieval — the core RAG/recall regression
# ---------------------------------------------------------------------------

class TestMemoryRetrieval:

    @pytest.mark.asyncio
    async def test_store_then_retrieve_returns_results(self, tmp_path, patch_embeddings):
        """REGRESSION: retrieve() must return stored items.

        Before the fix, hybrid RRF scores (~0.016) were filtered by a 0.5
        threshold, so retrieve() ALWAYS returned [] — silently killing RAG,
        recall, and semantic search.
        """
        m = _new_manager(tmp_path)
        await m.store(content="The capital of France is Paris", tier="short_term", metadata={})
        await m.store(content="Python is a programming language", tier="short_term", metadata={})

        results = await m.retrieve(query="capital of France", limit=5)

        assert len(results) >= 1, "retrieve() returned nothing — RRF/threshold regression!"
        assert any("Paris" in r.get("content", "") for r in results), \
            "relevant memory not retrieved"

    @pytest.mark.asyncio
    async def test_retrieve_scores_are_normalized(self, tmp_path, patch_embeddings):
        """Scores must be a sane [0,1] similarity (guards the inverted-score bug)."""
        m = _new_manager(tmp_path)
        await m.store(content="alpha beta gamma delta", tier="short_term", metadata={})
        results = await m.retrieve(query="alpha beta gamma", limit=5)
        assert len(results) >= 1
        for r in results:
            assert 0.0 <= r.get("score", -1) <= 1.0, f"score out of range: {r.get('score')}"
        assert max(r["score"] for r in results) >= 0.5, "top match scored implausibly low"

    @pytest.mark.asyncio
    async def test_empty_store_returns_empty(self, tmp_path, patch_embeddings):
        """A fresh store yields no results (not an error)."""
        m = _new_manager(tmp_path)
        results = await m.retrieve(query="anything", limit=5)
        assert results == []


# ---------------------------------------------------------------------------
# Memory stats — the overview-count regression
# ---------------------------------------------------------------------------

class TestMemoryStats:

    @pytest.mark.asyncio
    async def test_get_stats_counts_persistent_tiers(self, tmp_path, patch_embeddings):
        """get_stats() must count persistent LanceDB rows, not just working memory."""
        m = _new_manager(tmp_path)
        for i in range(3):
            await m.store(content=f"fact number {i}", tier="short_term", metadata={})

        stats = m.get_stats()
        assert stats.get("short_term_count") == 3, f"expected 3, got {stats.get('short_term_count')}"
        assert stats.get("total_count", 0) >= 3


# ---------------------------------------------------------------------------
# Agentic execution — plan -> supervisor -> tool -> real side effect
# ---------------------------------------------------------------------------

class TestAgenticExecution:

    @pytest.mark.asyncio
    async def test_execute_task_runs_planned_tool(self, tmp_path):
        """A planned write_file step must actually run and create the file.

        Uses a fake planner/LLM (no Ollama) but the REAL Toolbox, Supervisor,
        WorkerAgent and ManagerAgent — so the plan->gate->execute wiring is tested.
        """
        from brain.planner import TaskPlan, PlanStep
        from toolbox import Toolbox
        from supervisor import AgenticSupervisor
        from agents.worker_agent import WorkerAgent
        from agents.manager_agent import ManagerAgent

        target = tmp_path / "agent_out.txt"

        class FakeBrain:
            async def plan(self, task, tools):
                return TaskPlan(
                    task_id="t1", description=task,
                    steps=[PlanStep(
                        id="s1", action="write a file", tool="write_file",
                        args={"path": str(target), "content": "OK_AETHER"},
                        depends_on=[], description="write file", risk_level="low",
                    )],
                    estimated_time="1s", requires_approval=False,
                )

            async def generate(self, *a, **k):
                return ""

        brain = FakeBrain()
        worker = WorkerAgent(brain=brain, toolbox=Toolbox(), supervisor=AgenticSupervisor())
        manager = ManagerAgent(brain=brain, worker=worker)

        result = await manager.execute_task(description="write a file", auto_approve=True)

        assert result.get("success") is True, f"task failed: {result}"
        assert target.exists(), "tool did not create the file"
        assert target.read_text().strip() == "OK_AETHER"

    @pytest.mark.asyncio
    async def test_empty_plan_is_not_silent_success(self, tmp_path):
        """A plan with no steps must report failure, not a vacuous all([])==True success."""
        from brain.planner import TaskPlan
        from toolbox import Toolbox
        from supervisor import AgenticSupervisor
        from agents.worker_agent import WorkerAgent
        from agents.manager_agent import ManagerAgent

        class EmptyPlanBrain:
            async def plan(self, task, tools):
                return TaskPlan(task_id="t", description=task, steps=[],
                                estimated_time="0s", requires_approval=False)
            async def generate(self, *a, **k):
                return ""

        brain = EmptyPlanBrain()
        worker = WorkerAgent(brain=brain, toolbox=Toolbox(), supervisor=AgenticSupervisor())
        result = await ManagerAgent(brain=brain, worker=worker).execute_task("nonsense", auto_approve=True)
        assert result.get("success") is False, "empty plan was silently reported as success"
        assert "plan" in (result.get("error") or "").lower()

    @pytest.mark.asyncio
    async def test_supervisor_blocks_dangerous_command(self):
        """The supervisor must block an obviously destructive command."""
        from supervisor import AgenticSupervisor
        sup = AgenticSupervisor()
        verdict = sup.validate(action="shell: rm -rf / --no-preserve-root")
        assert verdict.is_safe is False, "supervisor failed to block 'rm -rf /'"
