"""
Channel Router — Multi-Platform Messaging Hub

Routes messages between Nexus and external platforms
(WhatsApp, Telegram, Discord, Email) via the OpenClaw Gateway.

Responsibilities:
- Manage channel registrations and status
- Route inbound messages to kernel for AI processing
- Dispatch outbound messages to correct channel via OpenClaw
- Track message history and delivery status
- Support message templates and formatting per channel
"""

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional, Callable, Awaitable, Dict, List, Any

logger = logging.getLogger("aether.channels")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class ChannelType(str, Enum):
    WHATSAPP = "whatsapp"
    TELEGRAM = "telegram"
    DISCORD = "discord"
    EMAIL = "email"
    SLACK = "slack"
    SMS = "sms"


class MessageDirection(str, Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class DeliveryStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


@dataclass
class ChannelConfig:
    """Configuration for a messaging channel."""
    channel_type: ChannelType
    enabled: bool = False
    connected: bool = False
    display_name: str = ""
    config: Dict[str, Any] = field(default_factory=dict)
    last_activity: float = 0.0
    message_count: int = 0


@dataclass
class ChannelMessage:
    """A message flowing through the channel router."""
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    channel: str = ""
    direction: str = "inbound"
    sender: str = ""
    recipient: str = ""
    content: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    status: str = "pending"

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Channel Router
# ---------------------------------------------------------------------------

class ChannelRouter:
    """
    Routes messages between Nexus kernel and external messaging platforms.

    Works with OpenClawClient as the transport layer.

    Usage:
        router = ChannelRouter()
        router.set_openclaw_client(openclaw_client)
        router.set_kernel_callback(kernel_process_fn)

        # Enable channels
        router.enable_channel(ChannelType.WHATSAPP)
        router.enable_channel(ChannelType.TELEGRAM)

        # Send message
        await router.send("whatsapp", "+1234567890", "Hello from Nexus!")
    """

    def __init__(self):
        self._openclaw = None
        self._kernel_callback: Optional[Callable[[ChannelMessage], Awaitable[str]]] = None

        # Channel registry
        self._channels: Dict[str, ChannelConfig] = {}
        for ct in ChannelType:
            self._channels[ct.value] = ChannelConfig(
                channel_type=ct,
                display_name=ct.value.title()
            )

        # Message history (ring buffer, last N messages)
        self._history: List[ChannelMessage] = []
        self._max_history = 500

        # Auto-reply templates per channel
        self._templates: Dict[str, Dict[str, str]] = {
            "whatsapp": {
                "greeting": "👋 Hey! I'm Nexus, your AI assistant. How can I help?",
                "unavailable": "⏳ I'm processing your request. I'll get back to you shortly.",
                "error": "❌ Sorry, I encountered an issue. Please try again.",
            },
            "telegram": {
                "greeting": "🤖 Hello! I'm Nexus. Send me a message and I'll help.",
                "unavailable": "⏳ Processing your request...",
                "error": "❌ Something went wrong. Please retry.",
            },
            "discord": {
                "greeting": "**Nexus AI** is online. Type your query below.",
                "unavailable": "⏳ Working on it...",
                "error": "❌ Error processing request.",
            },
            "email": {
                "greeting": "Hello,\n\nThank you for reaching out. I'm Nexus, your AI assistant.\n\nHow can I help you today?",
                "unavailable": "Your request is being processed. You will receive a response shortly.",
                "error": "We encountered an issue processing your request. Please try again.",
            },
        }

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def set_openclaw_client(self, client):
        """Attach the OpenClaw WebSocket transport."""
        self._openclaw = client
        # Register our inbound handler
        if client:
            client.set_callback(self._handle_inbound)
            logger.info("✅ ChannelRouter connected to OpenClaw client")

    def set_kernel_callback(self, callback: Callable[[ChannelMessage], Awaitable[str]]):
        """Set the callback for processing inbound messages through the AI."""
        self._kernel_callback = callback

    # ------------------------------------------------------------------
    # Channel Management
    # ------------------------------------------------------------------

    def enable_channel(self, channel_type: ChannelType, config: Optional[Dict] = None) -> bool:
        """Enable a messaging channel."""
        key = channel_type.value
        if key in self._channels:
            self._channels[key].enabled = True
            if config:
                self._channels[key].config.update(config)
            logger.info(f"📱 Channel enabled: {key}")
            return True
        return False

    def disable_channel(self, channel_type: ChannelType) -> bool:
        """Disable a messaging channel."""
        key = channel_type.value
        if key in self._channels:
            self._channels[key].enabled = False
            logger.info(f"📵 Channel disabled: {key}")
            return True
        return False

    def get_channel_status(self) -> Dict[str, Any]:
        """Get status of all channels."""
        result = {}
        for key, ch in self._channels.items():
            result[key] = {
                "enabled": ch.enabled,
                "connected": ch.connected,
                "display_name": ch.display_name,
                "last_activity": ch.last_activity,
                "message_count": ch.message_count,
            }
        return result

    def get_channels_list(self) -> List[Dict[str, Any]]:
        """Get list of all channels with their config."""
        return [
            {
                "type": key,
                "enabled": ch.enabled,
                "connected": ch.connected,
                "display_name": ch.display_name,
                "message_count": ch.message_count,
                "last_activity": ch.last_activity,
            }
            for key, ch in self._channels.items()
        ]

    # ------------------------------------------------------------------
    # Inbound (External → Nexus)
    # ------------------------------------------------------------------

    async def _handle_inbound(self, data: dict):
        """
        Handle an inbound message from OpenClaw Gateway.

        Expected format from gateway:
        {
            "type": "inbound_message",
            "channel": "whatsapp",
            "sender": "+1234567890",
            "content": {"text": "Hello"},
            "metadata": {...}
        }
        """
        msg_type = data.get("type", "")
        if msg_type != "inbound_message":
            logger.debug(f"Ignoring non-message event: {msg_type}")
            return

        channel = data.get("channel", "unknown")
        sender = data.get("sender", "unknown")
        content = data.get("content", {})
        text = content.get("text", "")

        # Validate channel
        if channel not in self._channels:
            logger.warning(f"⚠️ Message from unknown channel: {channel}")
            return

        ch_config = self._channels[channel]
        if not ch_config.enabled:
            logger.info(f"📵 Ignoring message on disabled channel: {channel}")
            return

        # Create message record
        msg = ChannelMessage(
            channel=channel,
            direction=MessageDirection.INBOUND.value,
            sender=sender,
            content=text,
            metadata=data.get("metadata", {}),
        )

        # Track
        ch_config.message_count += 1
        ch_config.last_activity = time.time()
        ch_config.connected = True
        self._add_to_history(msg)

        logger.info(f"📨 Inbound [{channel}] from {sender}: {text[:80]}...")

        # Process through AI kernel
        if self._kernel_callback:
            try:
                reply_text = await self._kernel_callback(msg)
                if reply_text:
                    await self.send(channel, sender, reply_text)
            except Exception as e:
                logger.error(f"Kernel processing failed: {e}")
                # Send error template
                error_template = self._templates.get(channel, {}).get("error", "Error processing request.")
                await self.send(channel, sender, error_template)

    # ------------------------------------------------------------------
    # Outbound (Nexus → External)
    # ------------------------------------------------------------------

    async def send(self, channel: str, recipient: str, text: str) -> bool:
        """
        Send a message to an external channel.

        Args:
            channel: Channel type (whatsapp, telegram, discord, email)
            recipient: Recipient identifier (phone, chat_id, channel_id, email)
            text: Message text
        """
        if channel not in self._channels:
            logger.error(f"Unknown channel: {channel}")
            return False

        ch_config = self._channels[channel]
        if not ch_config.enabled:
            logger.warning(f"Cannot send: channel {channel} is disabled")
            return False

        if not self._openclaw:
            logger.error("Cannot send: OpenClaw client not connected")
            return False

        # Create message record
        msg = ChannelMessage(
            channel=channel,
            direction=MessageDirection.OUTBOUND.value,
            recipient=recipient,
            content=text,
        )

        try:
            # Dispatch via OpenClaw
            await self._openclaw.send_message(channel, recipient, text)
            msg.status = DeliveryStatus.SENT.value
            ch_config.message_count += 1
            ch_config.last_activity = time.time()
            self._add_to_history(msg)
            logger.info(f"📤 Outbound [{channel}] to {recipient}: {text[:80]}...")
            return True

        except Exception as e:
            msg.status = DeliveryStatus.FAILED.value
            self._add_to_history(msg)
            logger.error(f"Failed to send on {channel}: {e}")
            return False

    async def broadcast(self, text: str, channels: Optional[List[str]] = None) -> Dict[str, bool]:
        """Send a message to multiple channels."""
        results = {}
        targets = channels or [k for k, v in self._channels.items() if v.enabled]

        for ch in targets:
            # Broadcast uses a generic recipient placeholder
            results[ch] = await self.send(ch, "broadcast", text)

        return results

    # ------------------------------------------------------------------
    # History & Templates
    # ------------------------------------------------------------------

    def _add_to_history(self, msg: ChannelMessage):
        """Add message to history ring buffer."""
        self._history.append(msg)
        if len(self._history) > self._max_history:
            self._history = self._history[-self._max_history:]

    def get_history(self, channel: Optional[str] = None, limit: int = 50) -> List[dict]:
        """Get message history, optionally filtered by channel."""
        filtered = self._history
        if channel:
            filtered = [m for m in filtered if m.channel == channel]
        return [m.to_dict() for m in filtered[-limit:]]

    def get_template(self, channel: str, template_name: str) -> Optional[str]:
        """Get a message template for a channel."""
        return self._templates.get(channel, {}).get(template_name)

    def set_template(self, channel: str, template_name: str, text: str):
        """Set a message template for a channel."""
        if channel not in self._templates:
            self._templates[channel] = {}
        self._templates[channel][template_name] = text

    def get_stats(self) -> Dict[str, Any]:
        """Get overall messaging statistics."""
        total_messages = sum(ch.message_count for ch in self._channels.values())
        active_channels = sum(1 for ch in self._channels.values() if ch.enabled)
        connected_channels = sum(1 for ch in self._channels.values() if ch.connected)

        return {
            "total_messages": total_messages,
            "active_channels": active_channels,
            "connected_channels": connected_channels,
            "history_size": len(self._history),
            "gateway_connected": self._openclaw is not None and self._openclaw.ws is not None,
            "channels": self.get_channel_status(),
        }
