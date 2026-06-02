"""
Async Bridge Client — external messaging transport

Connects Nexus to a self-hosted, open-source messaging gateway that bridges
WhatsApp, Telegram, Discord, Slack, Matrix, XMPP and other platforms behind a
single REST API. The gateway runs as a separate process; Nexus speaks to it over
HTTP:

    inbound : GET  /api/stream    (newline-delimited JSON, one message per line)
    outbound: POST /api/message   ({text, gateway, username})

The expected inbound message shape (per line)::

    {"text": "...", "username": "alice", "account": "telegram.acct",
     "protocol": "telegram", "gateway": "nexus-telegram", "id": "..."}

See ``ASYNC_BRIDGE.md`` for gateway setup.
"""

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import Optional, Callable, Awaitable, Dict

logger = logging.getLogger("aether.async_bridge")


def _load_async_token() -> Optional[str]:
    """Resolve the API token from env or ~/.aether/async_bridge_token."""
    token = os.environ.get("ASYNC_BRIDGE_TOKEN")
    if token:
        return token.strip()
    try:
        token_file = Path.home() / ".aether" / "async_bridge_token"
        if token_file.exists():
            return token_file.read_text(encoding="utf-8").strip() or None
    except Exception:
        pass
    return None


# Gateway "protocol" names → our ChannelType values. Anything not listed passes
# through unchanged (the kernel's inbound handler doesn't hard-validate).
_PROTOCOL_MAP = {
    "whatsapp": "whatsapp",
    "telegram": "telegram",
    "discord": "discord",
    "slack": "slack",
    "xmpp": "sms",        # closest existing bucket
    "email": "email",
}


class AsyncBridgeClient:
    """
    HTTP client for the Async messaging gateway.

    Interface mirrors any transport the kernel uses::

        client = AsyncBridgeClient(api_url="http://localhost:4242", token="...")
        client.set_callback(on_message)        # async cb(dict)
        await client.connect()                 # long-running stream loop
        await client.send_message("telegram", "alice", "hi")
    """

    def __init__(
        self,
        api_url: str = "http://localhost:4242",
        token: Optional[str] = None,
        default_gateway: str = "",
    ):
        self.api_url = api_url.rstrip("/")
        self.running = False
        self.connected = False  # True while the stream is live
        self._on_message: Optional[Callable[[dict], Awaitable[None]]] = None

        # Reconnect backoff: 5s → 5min cap, reset on a healthy stream so a
        # missing gateway doesn't flood the logs.
        self._reconnect_delay = 5
        self._max_reconnect_delay = 300
        self._current_delay = self._reconnect_delay
        self._consecutive_failures = 0

        self._default_gateway = default_gateway
        # Learn which gateway a channel's traffic arrived on, so replies route
        # back to the same gateway.
        self._channel_gateways: Dict[str, str] = {}

        self._token = token if token is not None else _load_async_token()
        if not self._token:
            logger.warning(
                "⚠️ No Async Bridge token configured (ASYNC_BRIDGE_TOKEN or "
                "~/.aether/async_bridge_token). API access may be rejected."
            )

    # ------------------------------------------------------------------
    # Setup / status
    # ------------------------------------------------------------------

    def set_callback(self, callback: Callable[[dict], Awaitable[None]]):
        """Set the async callback for incoming messages (receives a dict)."""
        self._on_message = callback

    def is_connected(self) -> bool:
        return self.connected

    @property
    def ws(self):
        """Compatibility shim: ChannelRouter checks ``client.ws`` truthiness."""
        return True if self.connected else None

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        return headers

    async def _backoff_sleep(self):
        delay = self._current_delay
        if self._consecutive_failures <= 3:
            logger.warning(
                "⚠️ Async Bridge gateway unreachable at %s — retrying in %ss "
                "(attempt %s)", self.api_url, delay, self._consecutive_failures,
            )
        else:
            logger.debug("Async Bridge retry in %ss (attempt %s)", delay, self._consecutive_failures)
        await asyncio.sleep(delay)
        self._current_delay = min(self._current_delay * 2, self._max_reconnect_delay)

    def _reset_backoff(self):
        self._current_delay = self._reconnect_delay
        self._consecutive_failures = 0

    # ------------------------------------------------------------------
    # Inbound stream
    # ------------------------------------------------------------------

    async def connect(self):
        """Stream inbound messages from /api/stream with reconnect/backoff."""
        self.running = True
        try:
            import httpx
        except ImportError:
            logger.error("❌ 'httpx' not installed. Async Bridge disabled.")
            return

        stream_url = f"{self.api_url}/api/stream"
        while self.running:
            try:
                logger.info("🔌 Connecting to Async Bridge stream at %s...", stream_url)
                timeout = httpx.Timeout(connect=10.0, read=None, write=10.0, pool=10.0)
                async with httpx.AsyncClient(timeout=timeout) as client:
                    async with client.stream("GET", stream_url, headers=self._headers()) as resp:
                        if resp.status_code != 200:
                            raise RuntimeError(f"stream HTTP {resp.status_code}")
                        logger.info("✅ Connected to Async Bridge")
                        self.connected = True
                        self._reset_backoff()

                        async for line in resp.aiter_lines():
                            if not self.running:
                                break
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                raw = json.loads(line)
                                await self._dispatch_inbound(raw)
                            except json.JSONDecodeError:
                                logger.debug("Non-JSON line from gateway: %s", line[:120])
                            except Exception as e:
                                logger.error("Error handling inbound message: %s", e)
            except Exception as e:
                self.connected = False
                self._consecutive_failures += 1
                logger.debug("Async Bridge stream lost/failed: %s", e)
                if self.running:
                    await self._backoff_sleep()
            finally:
                self.connected = False

    async def _dispatch_inbound(self, raw: dict):
        """Translate a gateway message into the kernel's inbound shape."""
        text = raw.get("text", "")
        if not text:
            return  # ignore join/leave/typing events with no text

        protocol = (raw.get("protocol") or "").lower()
        if not protocol:
            account = raw.get("account", "")  # "telegram.acct"
            protocol = account.split(".", 1)[0].lower() if account else "unknown"
        channel = _PROTOCOL_MAP.get(protocol, protocol)

        gateway = raw.get("gateway", "")
        if gateway:
            self._channel_gateways[channel] = gateway

        data = {
            "type": "inbound_message",
            "channel": channel,
            "sender": raw.get("username") or raw.get("userid") or "unknown",
            "content": {"text": text},
            "metadata": {
                "protocol": protocol,
                "gateway": gateway,
                "account": raw.get("account", ""),
                "id": raw.get("id", ""),
            },
        }

        if self._on_message:
            await self._on_message(data)

    # ------------------------------------------------------------------
    # Outbound
    # ------------------------------------------------------------------

    async def send_message(self, channel: str, recipient: str, text: str):
        """POST a message to /api/message, routed to the channel's gateway."""
        try:
            import httpx
        except ImportError:
            logger.error("httpx not available — cannot send message")
            return

        gateway = self._channel_gateways.get(channel) or self._default_gateway
        if not gateway:
            logger.warning(
                "⚠️ No gateway known for channel '%s' "
                "(set 'async_bridge_gateway' or wait for an inbound message).", channel,
            )
            return

        payload = {
            "text": text,
            "gateway": gateway,
            "username": "Nexus",
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self.api_url}/api/message",
                    headers=self._headers(),
                    json=payload,
                )
                if resp.status_code >= 400:
                    logger.error("Async Bridge send failed: HTTP %s %s", resp.status_code, resp.text[:200])
        except Exception as e:
            logger.error("Failed to send message: %s", e)

    async def disconnect(self):
        self.running = False
        self.connected = False
