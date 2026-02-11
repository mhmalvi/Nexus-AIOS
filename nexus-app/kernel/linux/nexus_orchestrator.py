#!/usr/bin/env python3
"""
Nexus Linux Orchestrator — Replaces Rust nexus-core on Linux.

On Windows, the Rust/Tauri binary manages the kernel subprocess and pipes
messages via stdin/stdout. On Linux headless servers, this Python orchestrator
provides the same functionality:

  - Spawns and supervises kernel/main.py
  - Provides a REST API (port 9600) for external integrations
  - Provides a WebSocket API for real-time streaming
  - Acts as /opt/nexus/bin/nexus-core for systemd

Usage:
    python nexus_orchestrator.py                 # Interactive
    python nexus_orchestrator.py --daemon        # Systemd mode
    python nexus_orchestrator.py --port 9600     # Custom port
"""

import asyncio
import json
import os
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Optional, Dict, Any

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DEFAULT_PORT = 9600
KERNEL_SCRIPT = Path(__file__).resolve().parent.parent / "main.py"
PYTHON_BIN = sys.executable  # Same interpreter


# ---------------------------------------------------------------------------
# Kernel Process Manager (mirrors Rust ProcessManager)
# ---------------------------------------------------------------------------
class KernelProcess:
    """Manages the Python kernel as a subprocess with crash recovery."""

    def __init__(self):
        self.process: Optional[asyncio.subprocess.Process] = None
        self.running = False
        self.crash_count = 0
        self.max_retries = 5
        self._response_waiters: Dict[str, asyncio.Future] = {}
        self._event_handlers = []

    async def start(self):
        """Spawn kernel/main.py as subprocess."""
        if self.running:
            return

        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"

        self.process = await asyncio.create_subprocess_exec(
            PYTHON_BIN, str(KERNEL_SCRIPT), "--daemon",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        self.running = True
        self.crash_count = 0
        print(f"🧠 Kernel started (PID {self.process.pid})", file=sys.stderr)

        # Start stdout/stderr readers
        asyncio.create_task(self._read_stdout())
        asyncio.create_task(self._read_stderr())
        asyncio.create_task(self._watch_exit())

    async def stop(self):
        """Gracefully stop the kernel."""
        self.running = False
        if self.process and self.process.returncode is None:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), timeout=10)
            except asyncio.TimeoutError:
                self.process.kill()
        self.process = None
        print("🛑 Kernel stopped", file=sys.stderr)

    async def send(self, message_type: str, payload: dict) -> dict:
        """Send a message to the kernel and wait for the response."""
        if not self.process or not self.running:
            await self.start()

        msg_id = str(uuid.uuid4())
        msg = json.dumps({
            "id": msg_id,
            "message_type": message_type,
            "payload": payload
        })

        future = asyncio.get_event_loop().create_future()
        self._response_waiters[msg_id] = future

        self.process.stdin.write((msg + "\n").encode())
        await self.process.stdin.drain()

        try:
            return await asyncio.wait_for(future, timeout=120)
        except asyncio.TimeoutError:
            self._response_waiters.pop(msg_id, None)
            return {"error": "Kernel response timeout", "success": False}

    async def _read_stdout(self):
        """Read JSON responses from kernel stdout."""
        while self.running and self.process:
            try:
                line = await self.process.stdout.readline()
                if not line:
                    break
                text = line.decode().strip()
                if not text:
                    continue

                try:
                    data = json.loads(text)
                    msg_id = data.get("id", "")

                    # Resolve waiting future
                    if msg_id in self._response_waiters:
                        self._response_waiters.pop(msg_id).set_result(data)

                    # Broadcast to event handlers
                    for handler in self._event_handlers:
                        try:
                            await handler(data)
                        except Exception:
                            pass

                except json.JSONDecodeError:
                    print(f"🐍 [Kernel]: {text}", file=sys.stderr)
            except Exception:
                break

    async def _read_stderr(self):
        """Read kernel log lines from stderr."""
        while self.running and self.process:
            try:
                line = await self.process.stderr.readline()
                if not line:
                    break
                print(f"🐍 {line.decode().rstrip()}", file=sys.stderr)
            except Exception:
                break

    async def _watch_exit(self):
        """Monitor for unexpected kernel exit and auto-restart."""
        if not self.process:
            return
        await self.process.wait()
        if self.running:
            self.crash_count += 1
            print(f"⚠️ Kernel crashed (count: {self.crash_count})", file=sys.stderr)
            if self.crash_count <= self.max_retries:
                delay = min(2 ** self.crash_count, 30)
                print(f"🔄 Restarting in {delay}s...", file=sys.stderr)
                await asyncio.sleep(delay)
                self.process = None
                await self.start()
            else:
                self.running = False
                print("❌ Max retries exceeded, kernel not restarting", file=sys.stderr)

    def on_event(self, handler):
        self._event_handlers.append(handler)


# ---------------------------------------------------------------------------
# REST + WebSocket Server (aiohttp)
# ---------------------------------------------------------------------------
async def create_web_server(kernel: KernelProcess, port: int):
    """Create a lightweight HTTP API server for the orchestrator."""
    try:
        from aiohttp import web
    except ImportError:
        print("⚠️ aiohttp not installed — REST API disabled", file=sys.stderr)
        return None

    app = web.Application()

    # --- REST Endpoints ---

    async def handle_health(request):
        return web.json_response({
            "status": "healthy" if kernel.running else "stopped",
            "pid": kernel.process.pid if kernel.process else None,
            "crash_count": kernel.crash_count,
            "uptime": "running",
        })

    async def handle_query(request):
        body = await request.json()
        query = body.get("query", "")
        if not query:
            return web.json_response({"error": "No query"}, status=400)
        result = await kernel.send("query", {"query": query, "context_mode": "auto"})
        return web.json_response(result)

    async def handle_status(request):
        result = await kernel.send("status", {})
        return web.json_response(result)

    async def handle_command(request):
        body = await request.json()
        result = await kernel.send("command", body)
        return web.json_response(result)

    async def handle_config(request):
        body = await request.json()
        result = await kernel.send("update_config", body)
        return web.json_response(result)

    async def handle_stop(request):
        await kernel.stop()
        return web.json_response({"status": "stopped"})

    # --- WebSocket for real-time streaming ---
    async def handle_ws(request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        async def broadcast(data):
            if not ws.closed:
                await ws.send_json(data)

        kernel.on_event(broadcast)

        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    result = await kernel.send(
                        data.get("type", "query"),
                        data.get("payload", {})
                    )
                    await ws.send_json(result)
                except Exception as e:
                    await ws.send_json({"error": str(e)})

        return ws

    # --- Route registration ---
    app.router.add_get("/health", handle_health)
    app.router.add_post("/api/query", handle_query)
    app.router.add_get("/api/status", handle_status)
    app.router.add_post("/api/command", handle_command)
    app.router.add_post("/api/config", handle_config)
    app.router.add_post("/api/stop", handle_stop)
    app.router.add_get("/ws", handle_ws)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    print(f"🌐 REST API listening on http://0.0.0.0:{port}", file=sys.stderr)
    print(f"   POST /api/query    — Send a query", file=sys.stderr)
    print(f"   GET  /api/status   — Kernel status", file=sys.stderr)
    print(f"   GET  /ws           — WebSocket stream", file=sys.stderr)
    return runner


# ---------------------------------------------------------------------------
# CLI Interface
# ---------------------------------------------------------------------------
async def interactive_cli(kernel: KernelProcess):
    """Simple REPL for direct interaction."""
    print("\n💬 Nexus CLI — Type a message (Ctrl+C to quit)\n")
    loop = asyncio.get_event_loop()

    while kernel.running:
        try:
            query = await loop.run_in_executor(None, lambda: input("nexus> "))
            if not query.strip():
                continue
            if query.strip().lower() in ("exit", "quit", "q"):
                break

            if query.startswith("/status"):
                result = await kernel.send("status", {})
            elif query.startswith("/config "):
                parts = query.split(" ", 2)
                if len(parts) == 3:
                    result = await kernel.send("update_config", {
                        "key": parts[1], "value": parts[2]
                    })
                else:
                    print("Usage: /config <key> <value>")
                    continue
            else:
                result = await kernel.send("query", {"query": query})

            # Print response
            if isinstance(result, dict):
                data = result.get("data", {})
                response = data.get("response", json.dumps(result, indent=2))
                print(f"\n🤖 {response}\n")
            else:
                print(f"\n{result}\n")

        except (KeyboardInterrupt, EOFError):
            break


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def main():
    import argparse

    parser = argparse.ArgumentParser(description="Nexus Linux Orchestrator")
    parser.add_argument("--daemon", action="store_true", help="Run in daemon mode (no CLI)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"REST API port (default: {DEFAULT_PORT})")
    parser.add_argument("--no-api", action="store_true", help="Disable REST API")
    args = parser.parse_args()

    kernel = KernelProcess()

    # Handle signals
    def shutdown(sig, _):
        print(f"\n🛑 Received signal {sig}, shutting down...", file=sys.stderr)
        asyncio.create_task(kernel.stop())
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Start kernel
    await kernel.start()

    # Start REST API
    runner = None
    if not args.no_api:
        runner = await create_web_server(kernel, args.port)

    # Systemd notify
    if args.daemon:
        try:
            from linux import sd_notify
            sd_notify("READY=1")
            sd_notify("STATUS=Nexus Orchestrator running")
        except ImportError:
            pass

    if args.daemon:
        # Daemon mode: just keep running
        while kernel.running:
            await asyncio.sleep(1)
    else:
        # Interactive mode
        await interactive_cli(kernel)

    await kernel.stop()
    if runner:
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
