# Async Bridge — messaging gateway setup

Nexus's external messaging (WhatsApp / Telegram / Discord / Slack / …) runs on
top of a **self-hosted, open-source messaging gateway** that exposes a single
REST API. Nexus talks to it via `bridge/async_bridge_client.py`. Any gateway
that implements the small contract below works.

## Gateway API contract

The Async Bridge client expects two endpoints:

| Method & path | Purpose | Shape |
|---|---|---|
| `GET /api/stream` | inbound stream | newline-delimited JSON, one message per line |
| `POST /api/message` | outbound send | `{ "text": "...", "gateway": "<name>", "username": "Nexus" }` |

Inbound message (one JSON object per line):

```json
{
  "text": "hello there",
  "username": "alice",
  "account": "telegram.myacct",
  "protocol": "telegram",
  "gateway": "nexus-telegram",
  "id": "..."
}
```

Auth: a bearer token via the `Authorization: Bearer <token>` header.

> A widely-used open-source gateway that already speaks this exact REST contract
> (its `api` protocol) can be self-hosted to bridge 20+ platforms. Configure its
> API bind address, a token, and one gateway per platform, then point Nexus at it.

## Point Nexus at it

Set these in **Settings → Messaging** (or `runtime_config`):

| Key | Value |
|---|---|
| `messaging_provider` | `"async"` |
| `async_bridge_url` | `"http://localhost:4242"` |
| `async_bridge_token` | the gateway API token (or env `ASYNC_BRIDGE_TOKEN` / `~/.aether/async_bridge_token`) |
| `async_bridge_gateway` | default gateway name for outbound replies (optional once an inbound message has been seen — the gateway is learned per channel) |

Restart the kernel. You should see `🔗 Async Bridge transport configured` then
`✅ Connected to Async Bridge`. Inbound messages stream from `GET /api/stream`;
replies POST to `/api/message`.

## Notes
- `messaging_provider="none"` (default) disables messaging entirely — no
  connection attempts, no log spam.
- The transport is selected in `main.py::_create_messaging_transport`; it exposes
  `set_callback` / `connect` / `send_message` / `is_connected`, so nothing else
  in the kernel depends on the specific gateway.
