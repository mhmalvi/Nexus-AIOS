"""
Tests for the Async Bridge transport client.

Verifies the inbound translation produces exactly the dict shape the kernel's
inbound handler expects, gateway learning for replies, and outbound payload
construction — without needing a live gateway.
"""

import pytest

from bridge.async_bridge_client import AsyncBridgeClient


@pytest.mark.asyncio
async def test_inbound_translation_telegram():
    client = AsyncBridgeClient(api_url="http://localhost:4242", token="t")
    received = []
    client.set_callback(lambda data: received.append(data) or _noop())

    # A gateway message as delivered on /api/stream
    raw = {
        "text": "hello there",
        "username": "alice",
        "userid": "123",
        "account": "telegram.mytelegram",
        "protocol": "telegram",
        "gateway": "nexus-telegram",
        "id": "msg-1",
    }
    await client._dispatch_inbound(raw)

    assert len(received) == 1
    msg = received[0]
    # Kernel-agnostic inbound shape — kernel handler is transport-agnostic.
    assert msg["type"] == "inbound_message"
    assert msg["channel"] == "telegram"
    assert msg["sender"] == "alice"
    assert msg["content"]["text"] == "hello there"
    assert msg["metadata"]["gateway"] == "nexus-telegram"
    # Gateway is learned so replies route back to the same place.
    assert client._channel_gateways["telegram"] == "nexus-telegram"


@pytest.mark.asyncio
async def test_inbound_ignores_empty_text():
    client = AsyncBridgeClient()
    received = []
    client.set_callback(lambda data: received.append(data) or _noop())
    await client._dispatch_inbound({"text": "", "protocol": "discord"})
    assert received == []  # join/leave/typing events with no text are dropped


@pytest.mark.asyncio
async def test_protocol_inferred_from_account():
    client = AsyncBridgeClient()
    received = []
    client.set_callback(lambda data: received.append(data) or _noop())
    await client._dispatch_inbound({"text": "hi", "account": "discord.guild", "username": "bob"})
    assert received[0]["channel"] == "discord"


@pytest.mark.asyncio
async def test_outbound_uses_learned_gateway(monkeypatch):
    client = AsyncBridgeClient(api_url="http://localhost:4242", token="secret")
    client._channel_gateways["telegram"] = "nexus-telegram"

    captured = {}

    class _Resp:
        status_code = 200
        text = ""

    class _FakeClient:
        def __init__(self, *a, **k):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            return False
        async def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return _Resp()

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", _FakeClient)

    await client.send_message("telegram", "alice", "reply text")

    assert captured["url"].endswith("/api/message")
    assert captured["json"]["gateway"] == "nexus-telegram"
    assert captured["json"]["text"] == "reply text"
    assert captured["headers"]["Authorization"] == "Bearer secret"


@pytest.mark.asyncio
async def test_outbound_without_gateway_is_noop(monkeypatch):
    client = AsyncBridgeClient()  # no default gateway, none learned

    called = {"posted": False}

    class _FakeClient:
        def __init__(self, *a, **k):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            return False
        async def post(self, *a, **k):
            called["posted"] = True

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", _FakeClient)

    await client.send_message("telegram", "alice", "text")  # should not raise
    assert called["posted"] is False


def _noop():
    """Adapter so a sync lambda can be used as the async callback in tests."""
    async def _a():
        return None
    return _a()
