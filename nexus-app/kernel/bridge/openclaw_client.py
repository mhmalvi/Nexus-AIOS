"""
OpenClaw Bridge Client
Connects Nexus to the OpenClaw Gateway for external messaging (WhatsApp, Discord, etc.)
"""

import asyncio
import json
import logging
import time
from typing import Optional, Callable, Awaitable

logger = logging.getLogger(__name__)

class OpenClawClient:
    """
    WebSocket client to connect to OpenClaw Gateway.
    
    Responsibilities:
    - Maintain connection to Gateway
    - Receive external messages (WhatsApp, Discord)
    - Forward messages to Nexus Kernel
    - Send replies back to Gateway
    """
    
    def __init__(self, gateway_url: str = "ws://localhost:8080/v1/s2s"):
        self.gateway_url = gateway_url
        self.ws = None
        self.running = False
        self._on_message: Optional[Callable[[dict], Awaitable[None]]] = None
        self._reconnect_delay = 5
        self._ssl_context = None

        # Auto-configure SSL for wss:// URLs
        if self.gateway_url.startswith("wss://"):
            import ssl
            self._ssl_context = ssl.create_default_context()

    def set_callback(self, callback: Callable[[dict], Awaitable[None]]):
        """Set the async callback for incoming messages."""
        self._on_message = callback

    async def connect(self):
        """Connect to the gateway loop."""
        self.running = True
        try:
            import websockets
        except ImportError:
            logger.error("❌ 'websockets' library not installed. OpenClaw bridge disabled.")
            return

        while self.running:
            try:
                logger.info(f"🔌 Connecting to OpenClaw Gateway at {self.gateway_url}...")
                async with websockets.connect(self.gateway_url, ssl=self._ssl_context) as ws:
                    self.ws = ws
                    logger.info(f"✅ Connected to OpenClaw Gateway")
                    
                    # Handshake / Auth could go here
                    await self._send_handshake()

                    # Message Loop
                    async for msg_str in ws:
                        if not self.running: break
                        try:
                            data = json.loads(msg_str)
                            if self._on_message:
                                await self._on_message(data)
                        except json.JSONDecodeError:
                            logger.error("Invalid JSON from OpenClaw")
                        except Exception as e:
                            logger.error(f"Error handling OpenClaw message: {e}")
                            
            except (websockets.exceptions.ConnectionClosedError, OSError) as e:
                logger.warning(f"⚠️ OpenClaw connection lost/failed: {e}")
                self.ws = None
                if self.running:
                    await asyncio.sleep(self._reconnect_delay)
            except Exception as e:
                logger.error(f"❌ OpenClaw critical error: {e}")
                await asyncio.sleep(self._reconnect_delay)

    async def _send_handshake(self):
        """Send initial handshake packet."""
        if self.ws:
            payload = {
                "type": "handshake",
                "client": "nexus_kernel",
                "version": "1.0.0",
                "timestamp": time.time()
            }
            await self.ws.send(json.dumps(payload))

    async def send_message(self, channel: str, recipient: str, text: str):
        """Send a message out to an external channel."""
        if not self.ws:
            logger.warning(f"⚠️ Cannot send to {channel}: OpenClaw disconnected")
            return
            
        payload = {
            "type": "outbound_message",
            "channel": channel,
            "recipient": recipient,
            "content": {"text": text},
            "timestamp": time.time()
        }
        
        try:
            await self.ws.send(json.dumps(payload))
        except Exception as e:
            logger.error(f"Failed to send OpenClaw message: {e}")

    # === Channel Specific Helpers ===

    async def send_whatsapp(self, phone: str, text: str):
        """Send a WhatsApp message via OpenClaw."""
        await self.send_message("whatsapp", phone, text)

    async def send_telegram(self, chat_id: str, text: str):
        """Send a Telegram message via OpenClaw."""
        await self.send_message("telegram", chat_id, text)

    async def send_discord(self, channel_id: str, text: str):
        """Send a Discord message via OpenClaw."""
        await self.send_message("discord", channel_id, text)

    async def stop(self):
        """Stop the client."""
        self.running = False
        if self.ws:
            await self.ws.close()
            self.ws = None
