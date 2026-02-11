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

    def set_callback(self, callback: Callable[[dict], Awaitable[None]]):
        """Set the async callback for incoming messages."""
        self._on_message = callback

    async def connect(self):
        """Connect to the gateway loop."""
        self.running = True
        while self.running:
            try:
                # Stub: Real implementation would use websockets.connect
                # import websockets
                # async with websockets.connect(self.gateway_url) as ws:
                #     self.ws = ws
                #     logger.info(f"✅ Connected to OpenClaw Gateway at {self.gateway_url}")
                #     await self._handle_messages()
                
                # Mock loop for now since we don't have the server
                logger.debug("OpenClaw bridge waiting for connection (mock)...")
                await asyncio.sleep(10)
                
            except Exception as e:
                logger.error(f"OpenClaw connection error: {e}")
                await asyncio.sleep(self._reconnect_delay)

    async def _handle_messages(self):
        """Handle incoming WebSocket messages."""
        if not self.ws:
            return
            
        async for msg_str in self.ws:
            try:
                data = json.loads(msg_str)
                if self._on_message:
                    await self._on_message(data)
            except json.JSONDecodeError:
                logger.error("Invalid JSON from OpenClaw")

    async def send_message(self, channel: str, recipient: str, text: str):
        """Send a message out to an external channel."""
        if not self.ws:
            logger.warning("Cannot send message: OpenClaw disconnected")
            return
            
        payload = {
            "type": "outbound_message",
            "channel": channel,
            "recipient": recipient,
            "content": {"text": text},
            "timestamp": time.time()
        }
        
        await self.ws.send(json.dumps(payload))

    async def stop(self):
        """Stop the client."""
        self.running = False
        if self.ws:
            await self.ws.close()
