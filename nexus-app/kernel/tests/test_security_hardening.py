"""
Regression tests for the M0/M1/M2 security-hardening fixes (see REMEDIATION_PLAN.md).

Guards:
  * M0-3  FileManager protected-path guard covers SUBPATHS for writes/deletes.
  * M2-1  LanceDB filter values are escaped (predicate injection) and the
          zero-vector fallback matches the embedding model's dimension.
  * M1-1  Supervisor fails safe on unrecognized actions (require approval) and
          Toolbox.execute() hard-gates every call through the safety layers.

CI-safe: no Ollama / network required.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# M0-3 — FileManager protected-path subpath guard (F-NEW-1)
# ---------------------------------------------------------------------------

class TestProtectedPaths:

    @pytest.mark.asyncio
    async def test_write_under_protected_root_is_blocked(self):
        from toolbox.file_manager import FileManager
        fm = FileManager()
        if os.name == "nt":
            target = r"C:\Windows\System32\nexus_evil.txt"
        else:
            target = "/etc/nexus_evil.txt"
        result = await fm.write(target, "pwned")
        assert result.success is False
        assert "protected" in (result.error or "").lower()

    @pytest.mark.asyncio
    async def test_delete_under_protected_root_is_blocked(self):
        from toolbox.file_manager import FileManager
        fm = FileManager()
        target = r"C:\Windows\System32\drivers\etc\hosts" if os.name == "nt" else "/etc/hosts"
        result = await fm.delete(target)
        assert result.success is False
        assert "protected" in (result.error or "").lower()

    @pytest.mark.asyncio
    async def test_legit_write_under_temp_succeeds(self, tmp_path):
        from toolbox.file_manager import FileManager
        fm = FileManager()
        target = str(tmp_path / "ok.txt")
        result = await fm.write(target, "fine")
        assert result.success is True
        assert (tmp_path / "ok.txt").read_text() == "fine"


# ---------------------------------------------------------------------------
# M2-1 — LanceDB filter injection + embedding dimension (F-NEW-3 / F-NEW-4)
# ---------------------------------------------------------------------------

class TestLanceDBHardening:

    def test_sql_literal_escapes_quotes(self):
        from memory.lancedb_store import _sql_literal
        assert _sql_literal("o'brien") == "'o''brien'"
        # An injection attempt stays inside the quoted literal.
        out = _sql_literal("x' OR '1'='1")
        assert out.startswith("'") and out.endswith("'")
        assert out == "'x'' OR ''1''=''1'"

    def test_sql_literal_strips_nul(self):
        from memory.lancedb_store import _sql_literal
        assert "\x00" not in _sql_literal("a\x00b")

    def test_embedding_dim_matches_model(self):
        from memory.lancedb_store import LanceDBStore
        assert LanceDBStore(db_path="./test_db", embedding_model="nomic-embed-text").embedding_dim == 768
        assert LanceDBStore(db_path="./test_db", embedding_model="all-minilm").embedding_dim == 384

    @pytest.mark.asyncio
    async def test_embedding_fallback_is_correct_dimension(self, monkeypatch):
        """With Ollama unreachable, the fallback vector must match the model dim
        (was hardcoded 384 while nomic-embed-text is 768 -> F-NEW-4)."""
        from memory.lancedb_store import LanceDBStore
        store = LanceDBStore(db_path="./test_db", embedding_model="nomic-embed-text")
        # Force the aiohttp path to raise so we hit the fallback.
        monkeypatch.setattr("aiohttp.ClientSession", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
        vec = await store._get_embedding("hello")
        assert len(vec) == 768


# ---------------------------------------------------------------------------
# M1-2 — Trust model (CLI=trusted/full, remote=restricted) — trust-model
# ---------------------------------------------------------------------------

class TestTrustModel:

    def test_local_origins_are_trusted_full(self):
        from security.trust import TrustResolver
        tr = TrustResolver()
        for origin in ("cli", "terminal", "gui", "local"):
            ctx = tr.resolve(origin)
            assert ctx.trusted is True
            assert ctx.is_owner is True
            assert ctx.tool_profile == "full"
            assert ctx.require_hil is False

    def test_remote_origins_are_restricted(self):
        from security.trust import TrustResolver
        tr = TrustResolver()
        msg = tr.resolve("messaging")
        assert msg.trusted is False and msg.is_owner is False
        assert msg.tool_profile == "messaging" and msg.require_hil is True
        web = tr.resolve("web")
        assert web.trusted is False and web.tool_profile == "minimal"

    def test_unknown_origin_is_least_privilege(self):
        from security.trust import TrustResolver
        ctx = TrustResolver().resolve("something-weird")
        assert ctx.trusted is False
        assert ctx.tool_profile == "minimal"
        assert ctx.require_hil is True

    def test_access_level_downgrades_local_profile(self):
        from security.trust import TrustResolver
        # access_level "user" gives the local owner the coding profile, not full.
        ctx = TrustResolver({"access_level": "user"}).resolve("cli")
        assert ctx.is_owner is True
        assert ctx.tool_profile == "coding"

    def test_extra_trusted_origin_is_honored(self):
        from security.trust import TrustResolver
        tr = TrustResolver({"extra_trusted_origins": ["remote_agent"]})
        assert tr.resolve("remote_agent").trusted is True


# ---------------------------------------------------------------------------
# M0-4 — SSRF guard + firewall enforcement on egress (F-NEW-2 / F-NEW-6)
# ---------------------------------------------------------------------------

class TestEgressGuard:

    def test_ip_classification(self):
        from toolbox.web_automation import _ip_is_blocked
        assert _ip_is_blocked("169.254.169.254") is True   # cloud metadata
        assert _ip_is_blocked("127.0.0.1") is True
        assert _ip_is_blocked("10.0.0.5") is True
        assert _ip_is_blocked("192.168.1.1") is True
        assert _ip_is_blocked("8.8.8.8") is False

    @pytest.mark.asyncio
    async def test_metadata_endpoint_blocked(self):
        from toolbox.web_automation import WebAutomation
        w = WebAutomation()
        r = await w.request("http://169.254.169.254/latest/meta-data/")
        assert r.success is False
        assert "internal" in (r.error or "").lower() or "link-local" in (r.error or "").lower()

    @pytest.mark.asyncio
    async def test_localhost_blocked_by_name(self):
        from toolbox.web_automation import WebAutomation
        w = WebAutomation()
        r = await w.request("http://localhost:9600/health")
        assert r.success is False

    @pytest.mark.asyncio
    async def test_exfil_pattern_blocked_via_firewall(self):
        from toolbox.web_automation import WebAutomation
        from security.network_firewall import NetworkFirewall
        # allow_private so the SSRF guard doesn't short-circuit; we want the
        # firewall's exfil detector to be the thing that blocks.
        w = WebAutomation(firewall=NetworkFirewall(), allow_private=True)
        r = await w.request("https://webhook.site/abc-exfil")
        assert r.success is False
        assert "firewall" in (r.error or "").lower()


# ---------------------------------------------------------------------------
# M1-1 — Fail-safe supervisor + hard-gated toolbox (F4)
# ---------------------------------------------------------------------------

class TestSupervisorFailSafe:

    def test_unrecognized_action_requires_approval(self):
        from supervisor import AgenticSupervisor
        sup = AgenticSupervisor()
        # "frobnicate" matches no risk keyword -> must fail safe to approval.
        verdict = sup.validate(action="frobnicate the quux")
        assert verdict.is_safe is True
        assert verdict.requires_approval is True

    def test_recognized_low_risk_action_no_approval(self):
        from supervisor import AgenticSupervisor
        sup = AgenticSupervisor()
        verdict = sup.validate(action="list_dir: list the files")
        assert verdict.is_safe is True
        assert verdict.requires_approval is False

    def test_classify_risk_reports_recognition(self):
        from supervisor.safety_checker import SafetyChecker
        sc = SafetyChecker()
        level, recognized = sc.classify_risk("read the config")
        assert recognized is True and level == "low"
        level, recognized = sc.classify_risk("zzqq unknown verb")
        assert recognized is False


class TestToolboxHardGate:

    @pytest.mark.asyncio
    async def test_direct_toolbox_call_is_gated(self):
        """A dangerous shell command via toolbox.execute() must be blocked even
        though no caller pre-validated it (closes the F4 bypass)."""
        from toolbox import Toolbox
        from supervisor import AgenticSupervisor
        tb = Toolbox(supervisor=AgenticSupervisor())
        result = await tb.execute("shell", args=["rm -rf / --no-preserve-root"])
        assert result.success is False
        assert "gate" in (result.error or "").lower() or "audit" in (result.error or "").lower()

    @pytest.mark.asyncio
    async def test_safe_call_passes_gate(self):
        from toolbox import Toolbox
        from supervisor import AgenticSupervisor
        tb = Toolbox(supervisor=AgenticSupervisor())
        # list_dir on cwd is benign and should not be blocked by the gate.
        result = await tb.execute("list_dir", args=["."])
        assert result.success is True

    @pytest.mark.asyncio
    async def test_no_supervisor_means_no_gate(self):
        """Backwards compatible: a Toolbox without a supervisor still runs."""
        from toolbox import Toolbox
        tb = Toolbox()
        result = await tb.execute("list_dir", args=["."])
        assert result.success is True


# ---------------------------------------------------------------------------
# M3-6 — Gate external (MCP) tools (F-NEW-7)
# ---------------------------------------------------------------------------

class TestExternalToolGating:

    async def _dummy(self, **kwargs):
        return "ran"

    @pytest.mark.asyncio
    async def test_external_tool_denied_for_untrusted(self):
        from toolbox import Toolbox
        tb = Toolbox()
        tb.register_tool("srv_dangerous", self._dummy, "x", {}, source="srv", external=True)
        # Untrusted (non-owner) session cannot run an external tool.
        result = await tb.execute("srv_dangerous", is_owner=False, profile="messaging")
        assert result.success is False
        assert "external" in (result.error or "").lower()

    @pytest.mark.asyncio
    async def test_external_tool_allowed_for_owner(self):
        from toolbox import Toolbox
        tb = Toolbox()
        tb.register_tool("srv_ok", self._dummy, "x", {}, source="srv", external=True)
        result = await tb.execute("srv_ok", is_owner=True, profile="full")
        assert result.success is True

    def test_list_tools_marks_external(self):
        from toolbox import Toolbox
        tb = Toolbox()
        tb.register_tool("srv_t", self._dummy, "x", {}, source="srv", external=True)
        tools = {t["name"]: t for t in tb.list_tools()}
        assert tools["srv_t"]["external"] is True
        assert tools["srv_t"]["source"] == "srv"
        # built-ins are local/non-external
        assert tools["shell"]["external"] is False


# ---------------------------------------------------------------------------
# M3-1 — Slash-command executor wired to real kernel actions
# ---------------------------------------------------------------------------

class _FakeMem:
    def get_stats(self):
        return {"total_count": 2, "working_count": 0, "short_term_count": 2, "long_term_count": 0}
    async def retrieve(self, query, limit=5):
        return [{"score": 0.9, "content": "answer about " + query}]
    async def store(self, content, tier, metadata):
        return "id"


class _FakeBrain:
    model = "llama3.2:3b"


class _FakeStats:
    def get_full_snapshot(self):
        return {"cpu": {"percent": 1}, "memory": {"percent": 2}, "battery": {"percent": "AC"}}


class _FakeKernel:
    config = {"ai_provider": "ollama"}
    memory = _FakeMem()
    brain = _FakeBrain()
    system_stats = _FakeStats()
    supervisor = None
    toolbox = None


class TestSlashCommandExecutor:

    def _executor(self):
        from auto_reply import CommandExecutor
        return CommandExecutor(_FakeKernel())

    @pytest.mark.asyncio
    async def test_plain_text_is_not_a_command(self):
        assert await self._executor().execute("hello there") is None

    @pytest.mark.asyncio
    async def test_known_command_executes(self):
        out = await self._executor().execute("/status")
        assert "AETHER" in out and "ollama" in out

    @pytest.mark.asyncio
    async def test_memory_command_runs_retrieve(self):
        out = await self._executor().execute("/memory france")
        assert "france" in out.lower()

    @pytest.mark.asyncio
    async def test_owner_only_blocked_for_untrusted(self):
        from security.trust import TrustResolver
        out = await self._executor().execute("/reset", trust=TrustResolver().resolve("messaging"))
        assert "owner-only" in out.lower()

    @pytest.mark.asyncio
    async def test_requires_args_shows_usage(self):
        out = await self._executor().execute("/remember")
        assert out.lower().startswith("usage:")

    @pytest.mark.asyncio
    async def test_unknown_command_is_reported(self):
        out = await self._executor().execute("/notarealcommand")
        assert "unknown command" in out.lower()


# ---------------------------------------------------------------------------
# M3-2 — Self-destruct hardening (F8)
# ---------------------------------------------------------------------------

class TestSelfDestructHardening:

    def _engine(self, tmp_path):
        from security.self_destruct import SelfDestructEngine
        return SelfDestructEngine(config_path=str(tmp_path))

    @pytest.mark.asyncio
    async def test_no_pin_blocks_destructive(self, tmp_path):
        from security.self_destruct import DestructLevel
        e = self._engine(tmp_path)
        await e.initialize()
        r = await e.execute(DestructLevel.DATA_WIPE, countdown_s=0)
        assert r.success is False
        assert "no pin" in str(r.errors).lower()

    def test_weak_pin_rejected(self, tmp_path):
        e = self._engine(tmp_path)
        with pytest.raises(ValueError):
            e.set_pin("1")

    @pytest.mark.asyncio
    async def test_voice_bool_alone_is_insufficient(self, tmp_path):
        from security.self_destruct import DestructLevel
        e = self._engine(tmp_path)
        await e.initialize()
        e.set_pin("4242")
        # The spoofable boolean must NOT authorize a wipe on its own.
        r = await e.execute(DestructLevel.DATA_WIPE, pin="4242", voice_verified=True, countdown_s=0)
        assert r.success is False
        assert "second factor" in str(r.errors).lower()

    @pytest.mark.asyncio
    async def test_pin_plus_phrase_authorizes(self, tmp_path):
        from security.self_destruct import DestructLevel, DestructStatus
        e = self._engine(tmp_path)
        await e.initialize()
        e.set_pin("4242")
        r = await e.execute(DestructLevel.DATA_WIPE, pin="4242",
                            confirmation_phrase="CONFIRM DATA_WIPE", countdown_s=0)
        assert r.status == DestructStatus.COMPLETED

    def test_pin_is_salted_not_bare_sha256(self, tmp_path):
        e = self._engine(tmp_path)
        e.set_pin("hunter2")
        assert e._pin_hash.startswith("pbkdf2_")
        assert e.verify_pin("hunter2") is True
        assert e.verify_pin("wrong") is False

    def test_legacy_sha256_verifies_and_upgrades(self, tmp_path):
        import hashlib
        e = self._engine(tmp_path)
        e._pin_hash = hashlib.sha256("9999".encode()).hexdigest()
        assert e.verify_pin("9999") is True
        assert e._pin_hash.startswith("pbkdf2_")  # upgraded on success


# ---------------------------------------------------------------------------
# M3-3 — Experimental subsystems are off by default + honestly flagged
# ---------------------------------------------------------------------------

class TestExperimentalFlags:

    def test_experimental_defaults_off(self):
        from runtime_config import DEFAULT_CONFIG
        exp = DEFAULT_CONFIG.get("experimental", {})
        assert exp, "experimental config block missing"
        # Every experimental subsystem ships disabled by default.
        assert all(v is False for v in exp.values())
        for key in ("npu_acceleration", "federated_learning", "ebpf_monitor", "a2a_sync"):
            assert key in exp


# ---------------------------------------------------------------------------
# M2-2 — deep_memory batched persistence (F-NEW-5)
# ---------------------------------------------------------------------------

class TestDeepMemoryBatchPersist:

    @pytest.mark.asyncio
    async def test_batch_ingest_writes_once(self, tmp_path, monkeypatch):
        from memory.deep_memory import DeepMemory
        dm = DeepMemory(persist_path=str(tmp_path / "g.json"))
        writes = {"n": 0}
        real = DeepMemory._persist

        def counting(self):
            if not self._persist_suspended:
                writes["n"] += 1
            return real(self)

        monkeypatch.setattr(DeepMemory, "_persist", counting)
        items = [{"name": f"e{i}", "type": "custom",
                  "relationships": [{"target": f"t{i}", "type": "related_to"}]} for i in range(30)]
        await dm.batch_ingest(items)
        # 30 entities + 30 targets + 30 edges = 90 mutations, but ONE disk write.
        assert writes["n"] == 1, f"expected 1 batched write, got {writes['n']}"

    def test_constructor_uses_persist_path(self, tmp_path):
        """REGRESSION: main.py once called DeepMemory(storage_path=...) which the
        constructor rejects (Tier-4 deep memory was dead at runtime). Lock the
        accepted kwarg name."""
        import inspect
        from memory.deep_memory import DeepMemory
        params = inspect.signature(DeepMemory.__init__).parameters
        assert "persist_path" in params
        assert "storage_path" not in params
        # And it constructs + reports stats without error.
        dm = DeepMemory(persist_path=str(tmp_path / "g.json"))
        assert "total_entities" in dm.get_stats()

    @pytest.mark.asyncio
    async def test_single_mutation_still_writes(self, tmp_path, monkeypatch):
        from memory.deep_memory import DeepMemory, EntityType
        dm = DeepMemory(persist_path=str(tmp_path / "g.json"))
        writes = {"n": 0}
        real = DeepMemory._persist
        monkeypatch.setattr(DeepMemory, "_persist",
                            lambda self: (writes.__setitem__("n", writes["n"] + (0 if self._persist_suspended else 1)), real(self))[1])
        dm.add_entity("solo", EntityType.CUSTOM)
        assert writes["n"] == 1


# ---------------------------------------------------------------------------
# M2-3 — real list/delete API replaces query="*" scans
# ---------------------------------------------------------------------------

class TestLanceDBListAndDelete:

    @pytest.mark.asyncio
    async def test_list_and_delete_where(self, tmp_path, monkeypatch):
        import hashlib, math
        from memory.lancedb_store import LanceDBStore
        DIM = 768

        async def fake_embed(self, text):
            v = [0.0] * DIM
            for w in str(text).lower().split():
                v[int(hashlib.md5(w.encode()).hexdigest(), 16) % DIM] += 1.0
            n = math.sqrt(sum(x * x for x in v)) or 1.0
            return [x / n for x in v]

        monkeypatch.setattr(LanceDBStore, "_get_embedding", fake_embed)
        s = LanceDBStore(db_path=str(tmp_path / "db"))
        for i in range(5):
            await s.add(content=f"doc {i}", metadata={"document_id": "D1"},
                        table_name="docs", domain="work" if i < 3 else "home")

        rows = await s.list_rows("docs", limit=100)
        assert len(rows) == 5
        assert rows[0].get("metadata", {}).get("document_id") == "D1"

        ok = await s.delete_where("docs", "domain = 'work'")
        assert ok is True
        remaining = await s.list_rows("docs", limit=100)
        assert len(remaining) == 2


# ---------------------------------------------------------------------------
# M1-3 — OS-protected vault key (F6)
# ---------------------------------------------------------------------------

class TestKeyVaultProtection:

    def test_os_secret_roundtrip(self):
        from security import os_secret
        blob = b"a-fernet-key-value=="
        protected = os_secret.protect(blob)
        assert os_secret.unprotect(protected) == blob
        # On Windows the protected form must differ from plaintext (DPAPI).
        import sys
        if sys.platform == "win32":
            assert protected != blob
            assert os_secret.is_protected(protected)

    def test_vault_key_protected_on_disk(self, tmp_path):
        import sys
        from security.key_vault import KeyVault, FERNET_AVAILABLE
        from security import os_secret
        if not FERNET_AVAILABLE:
            pytest.skip("cryptography not installed")
        kp = tmp_path / ".vault_key"
        v = KeyVault(key_path=kp)
        # round-trip still works
        assert v.decrypt(v.encrypt("sk-secret")) == "sk-secret"
        if sys.platform == "win32":
            # The on-disk key is DPAPI-wrapped, not the raw Fernet key.
            assert os_secret.is_protected(kp.read_bytes())

    def test_legacy_plaintext_key_migrates(self, tmp_path):
        import sys
        from security.key_vault import KeyVault, FERNET_AVAILABLE
        from security import os_secret
        if not FERNET_AVAILABLE or sys.platform != "win32":
            pytest.skip("DPAPI migration is Windows-only")
        from cryptography.fernet import Fernet
        kp = tmp_path / "legacy_key"
        kp.write_bytes(Fernet.generate_key())  # legacy plaintext
        v = KeyVault(key_path=kp)
        assert os_secret.is_protected(kp.read_bytes())  # upgraded on load
        assert v.decrypt(v.encrypt("x")) == "x"


# ---------------------------------------------------------------------------
# M2-5 — consolidated firewall: supervisor.firewall exposes the async API
# ---------------------------------------------------------------------------

class TestFirewallConsolidation:

    def test_supervisor_firewall_is_canonical_async(self):
        import inspect
        from supervisor import AgenticSupervisor
        import security.network_firewall as canonical
        sup = AgenticSupervisor()
        assert isinstance(sup.firewall, canonical.NetworkFirewall)
        # The toolbox/egress guards call `await firewall.check(...)`.
        assert inspect.iscoroutinefunction(sup.firewall.check)
        assert hasattr(sup.firewall, "get_stats")
        assert hasattr(sup.firewall, "set_enabled")

    def test_shim_reexports_canonical(self):
        from supervisor.network_firewall import NetworkFirewall, FirewallDecision, FirewallVerdict
        import security.network_firewall as canonical
        assert NetworkFirewall is canonical.NetworkFirewall
        assert FirewallDecision is FirewallVerdict

    @pytest.mark.asyncio
    async def test_allowlist_matches_provider_urls(self):
        """Host-aware rule matching: `*.openai.com` must allow a full provider
        URL (was dead before the fix → only DENY-all worked)."""
        from security.network_firewall import NetworkFirewall, FirewallVerdict
        fw = NetworkFirewall()
        await fw.initialize()
        assert await fw.check("https://api.openai.com/v1/chat") == FirewallVerdict.ALLOWED
        assert await fw.check("https://api.groq.com/openai/v1") == FirewallVerdict.ALLOWED
        assert await fw.check("https://evil.example.com/x") == FirewallVerdict.DENIED


# ---------------------------------------------------------------------------
# #8 — RAG-context-aware query cache key
# ---------------------------------------------------------------------------

class TestQueryCacheContextKey:

    def test_context_changes_key(self):
        from brain.query_cache import QueryCache
        k_a = QueryCache.make_key("q", "m", 0.0, context="ctxA")
        k_b = QueryCache.make_key("q", "m", 0.0, context="ctxB")
        k_a2 = QueryCache.make_key("q", "m", 0.0, context="ctxA")
        assert k_a != k_b           # different retrieved context -> different key
        assert k_a == k_a2          # same context -> same key
        assert QueryCache.make_key("q", "m", 0.0) != k_a  # no-context distinct


# ---------------------------------------------------------------------------
# #12 — secret redaction in logs
# ---------------------------------------------------------------------------

class TestSecretRedaction:

    def _redact(self):
        from security.log_redact import redact_sensitive
        return redact_sensitive

    def test_nested_api_keys_redacted(self):
        red = self._redact()
        s = '{"message_type":"update_config","payload":{"config":{"api_keys":{"openai":"sk-secret","groq":"gsk_x"},"security":{"access_level":"admin"}}}}'
        out = red(s)
        assert "sk-secret" not in out and "gsk_x" not in out
        assert "REDACTED" in out
        assert "admin" in out  # non-secret values preserved

    def test_pin_and_key_redacted(self):
        red = self._redact()
        assert "4242" not in red('{"data":{"pin":"4242"}}')
        assert "sk-abc" not in red('{"payload":{"provider":"openai","key":"sk-abc"}}')
