"""
Nexus Notification Tools - Email & Desktop Notifications
Provides notification capabilities for workflow automation.

Features:
- SMTP Email sending (async)
- Desktop notifications (cross-platform)
- SMS via Twilio (optional)
- Notification queuing
"""

import asyncio
import logging
import os
import platform
import smtplib
from dataclasses import dataclass, field
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from enum import Enum
from pathlib import Path
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class NotificationPriority(Enum):
    """Notification priority levels."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


@dataclass
class EmailConfig:
    """SMTP email configuration."""
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    username: str = ""
    password: str = ""
    from_address: str = ""
    use_tls: bool = True
    
    @classmethod
    def from_env(cls) -> "EmailConfig":
        """Load config from environment variables."""
        return cls(
            smtp_host=os.getenv("NEXUS_SMTP_HOST", "smtp.gmail.com"),
            smtp_port=int(os.getenv("NEXUS_SMTP_PORT", "587")),
            username=os.getenv("NEXUS_SMTP_USER", ""),
            password=os.getenv("NEXUS_SMTP_PASSWORD", ""),
            from_address=os.getenv("NEXUS_SMTP_FROM", ""),
            use_tls=os.getenv("NEXUS_SMTP_TLS", "true").lower() == "true"
        )


@dataclass
class NotificationResult:
    """Result of a notification send attempt."""
    success: bool
    notification_type: str
    recipient: str
    message: str
    error: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)


class EmailSender:
    """
    Async SMTP Email Sender.
    
    Supports:
    - Plain text and HTML emails
    - File attachments
    - Multiple recipients
    - CC and BCC
    
    Usage:
        sender = EmailSender(config)
        result = await sender.send(
            to="user@example.com",
            subject="Hello",
            body="This is a test email"
        )
    """
    
    def __init__(self, config: Optional[EmailConfig] = None):
        self.config = config or EmailConfig.from_env()
        self._is_configured = bool(self.config.username and self.config.password)
    
    @property
    def is_configured(self) -> bool:
        """Check if email is properly configured."""
        return self._is_configured
    
    async def send(
        self,
        to: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        attachments: Optional[List[str]] = None,
        priority: NotificationPriority = NotificationPriority.NORMAL
    ) -> NotificationResult:
        """
        Send an email asynchronously.
        
        Args:
            to: Recipient email address (or comma-separated list)
            subject: Email subject
            body: Plain text body
            html_body: Optional HTML body
            cc: Optional CC recipients
            bcc: Optional BCC recipients
            attachments: Optional list of file paths to attach
            priority: Notification priority
            
        Returns:
            NotificationResult with success status
        """
        if not self._is_configured:
            return NotificationResult(
                success=False,
                notification_type="email",
                recipient=to,
                message=subject,
                error="Email not configured. Set NEXUS_SMTP_* environment variables."
            )
        
        try:
            # Create message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = self.config.from_address or self.config.username
            msg["To"] = to
            
            if cc:
                msg["Cc"] = ", ".join(cc)
            
            # Set priority headers
            if priority == NotificationPriority.HIGH:
                msg["X-Priority"] = "2"
            elif priority == NotificationPriority.URGENT:
                msg["X-Priority"] = "1"
                msg["Importance"] = "high"
            
            # Attach plain text body
            msg.attach(MIMEText(body, "plain"))
            
            # Attach HTML body if provided
            if html_body:
                msg.attach(MIMEText(html_body, "html"))
            
            # Add attachments
            if attachments:
                for file_path in attachments:
                    await self._attach_file(msg, file_path)
            
            # Build recipient list
            all_recipients = [to]
            if cc:
                all_recipients.extend(cc)
            if bcc:
                all_recipients.extend(bcc)
            
            # Send email in thread pool
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                self._send_smtp,
                msg,
                all_recipients
            )
            
            logger.info(f"Email sent to {to}: {subject}")
            
            return NotificationResult(
                success=True,
                notification_type="email",
                recipient=to,
                message=subject
            )
            
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return NotificationResult(
                success=False,
                notification_type="email",
                recipient=to,
                message=subject,
                error=str(e)
            )
    
    def _send_smtp(self, msg: MIMEMultipart, recipients: List[str]):
        """Send email via SMTP (blocking)."""
        with smtplib.SMTP(self.config.smtp_host, self.config.smtp_port) as server:
            if self.config.use_tls:
                server.starttls()
            server.login(self.config.username, self.config.password)
            server.send_message(msg, to_addrs=recipients)
    
    async def _attach_file(self, msg: MIMEMultipart, file_path: str):
        """Attach a file to the message."""
        path = Path(file_path)
        if not path.exists():
            logger.warning(f"Attachment not found: {file_path}")
            return
        
        with open(path, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
        
        encoders.encode_base64(part)
        part.add_header(
            "Content-Disposition",
            f"attachment; filename={path.name}"
        )
        msg.attach(part)


class DesktopNotifier:
    """
    Cross-platform Desktop Notifications.
    
    Supports:
    - Windows (win10toast)
    - macOS (osascript)
    - Linux (notify-send)
    
    Usage:
        notifier = DesktopNotifier()
        result = await notifier.notify("Title", "Message body")
    """
    
    def __init__(self, app_name: str = "Nexus AIOS"):
        self.app_name = app_name
        self.system = platform.system()
        self._notifier = None
        self._is_available = self._check_availability()
    
    def _check_availability(self) -> bool:
        """Check if desktop notifications are available."""
        if self.system == "Windows":
            try:
                from win10toast import ToastNotifier
                self._notifier = ToastNotifier()
                return True
            except ImportError:
                logger.debug("win10toast not installed for Windows notifications")
                return False
        
        elif self.system == "Darwin":  # macOS
            return True  # osascript always available
        
        elif self.system == "Linux":
            # Check for notify-send
            import shutil
            return shutil.which("notify-send") is not None
        
        return False
    
    @property
    def is_available(self) -> bool:
        """Check if notifications are available on this platform."""
        return self._is_available
    
    async def notify(
        self,
        title: str,
        message: str,
        icon: Optional[str] = None,
        duration: int = 5,
        priority: NotificationPriority = NotificationPriority.NORMAL
    ) -> NotificationResult:
        """
        Show a desktop notification.
        
        Args:
            title: Notification title
            message: Notification body
            icon: Optional path to icon
            duration: How long to show (seconds)
            priority: Notification priority
            
        Returns:
            NotificationResult with success status
        """
        if not self._is_available:
            return NotificationResult(
                success=False,
                notification_type="desktop",
                recipient="local",
                message=title,
                error="Desktop notifications not available on this platform"
            )
        
        try:
            loop = asyncio.get_event_loop()
            
            if self.system == "Windows":
                await loop.run_in_executor(
                    None,
                    self._notify_windows,
                    title,
                    message,
                    duration,
                    icon
                )
            elif self.system == "Darwin":
                await self._notify_macos(title, message)
            elif self.system == "Linux":
                await self._notify_linux(title, message, icon, duration, priority)
            
            return NotificationResult(
                success=True,
                notification_type="desktop",
                recipient="local",
                message=title
            )
            
        except Exception as e:
            logger.error(f"Desktop notification failed: {e}")
            return NotificationResult(
                success=False,
                notification_type="desktop",
                recipient="local",
                message=title,
                error=str(e)
            )
    
    def _notify_windows(self, title: str, message: str, duration: int, icon: Optional[str]):
        """Windows notification (blocking)."""
        self._notifier.show_toast(
            title=title,
            msg=message,
            duration=duration,
            icon_path=icon,
            threaded=False
        )
    
    async def _notify_macos(self, title: str, message: str):
        """macOS notification using osascript."""
        script = f'display notification "{message}" with title "{title}"'
        proc = await asyncio.create_subprocess_exec(
            "osascript", "-e", script,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL
        )
        await proc.wait()
    
    async def _notify_linux(
        self,
        title: str,
        message: str,
        icon: Optional[str],
        duration: int,
        priority: NotificationPriority
    ):
        """Linux notification using notify-send."""
        args = ["notify-send", title, message]
        
        if icon:
            args.extend(["-i", icon])
        
        args.extend(["-t", str(duration * 1000)])  # milliseconds
        
        if priority == NotificationPriority.URGENT:
            args.extend(["-u", "critical"])
        elif priority == NotificationPriority.HIGH:
            args.extend(["-u", "normal"])
        else:
            args.extend(["-u", "low"])
        
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL
        )
        await proc.wait()


class SMSNotifier:
    """
    SMS Notifications via Twilio.
    
    Requires Twilio account and credentials in environment:
    - NEXUS_TWILIO_SID
    - NEXUS_TWILIO_TOKEN
    - NEXUS_TWILIO_FROM
    
    Usage:
        sms = SMSNotifier()
        result = await sms.send("+1234567890", "Your task completed!")
    """
    
    def __init__(self):
        self.account_sid = os.getenv("NEXUS_TWILIO_SID", "")
        self.auth_token = os.getenv("NEXUS_TWILIO_TOKEN", "")
        self.from_number = os.getenv("NEXUS_TWILIO_FROM", "")
        self._is_configured = bool(self.account_sid and self.auth_token and self.from_number)
        self._client = None
    
    @property
    def is_configured(self) -> bool:
        return self._is_configured
    
    def _get_client(self):
        """Get or create Twilio client."""
        if not self._client:
            try:
                from twilio.rest import Client
                self._client = Client(self.account_sid, self.auth_token)
            except ImportError:
                raise ImportError("Twilio not installed: pip install twilio")
        return self._client
    
    async def send(self, to: str, message: str) -> NotificationResult:
        """
        Send an SMS message.
        
        Args:
            to: Phone number (E.164 format, e.g., +1234567890)
            message: Message body (max 1600 chars)
            
        Returns:
            NotificationResult with success status
        """
        if not self._is_configured:
            return NotificationResult(
                success=False,
                notification_type="sms",
                recipient=to,
                message=message[:50],
                error="SMS not configured. Set NEXUS_TWILIO_* environment variables."
            )
        
        try:
            client = self._get_client()
            
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: client.messages.create(
                    body=message[:1600],
                    from_=self.from_number,
                    to=to
                )
            )
            
            logger.info(f"SMS sent to {to}: {result.sid}")
            
            return NotificationResult(
                success=True,
                notification_type="sms",
                recipient=to,
                message=message[:50]
            )
            
        except Exception as e:
            logger.error(f"SMS failed: {e}")
            return NotificationResult(
                success=False,
                notification_type="sms",
                recipient=to,
                message=message[:50],
                error=str(e)
            )


class NotificationManager:
    """
    Unified Notification Manager.
    
    Provides a single interface for all notification types.
    
    Usage:
        manager = NotificationManager()
        
        # Send email
        await manager.send_email("user@example.com", "Subject", "Body")
        
        # Send desktop notification
        await manager.send_desktop("Title", "Message")
        
        # Send SMS (if configured)
        await manager.send_sms("+1234567890", "Message")
    """
    
    def __init__(self, email_config: Optional[EmailConfig] = None):
        self.email = EmailSender(email_config)
        self.desktop = DesktopNotifier()
        self.sms = SMSNotifier()
    
    async def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        **kwargs
    ) -> NotificationResult:
        """Send an email notification."""
        return await self.email.send(to, subject, body, **kwargs)
    
    async def send_desktop(
        self,
        title: str,
        message: str,
        **kwargs
    ) -> NotificationResult:
        """Send a desktop notification."""
        return await self.desktop.notify(title, message, **kwargs)
    
    async def send_sms(
        self,
        to: str,
        message: str
    ) -> NotificationResult:
        """Send an SMS notification."""
        return await self.sms.send(to, message)
    
    def get_availability(self) -> Dict[str, bool]:
        """Get availability status of all notification types."""
        return {
            "email": self.email.is_configured,
            "desktop": self.desktop.is_available,
            "sms": self.sms.is_configured
        }


# Export for toolbox registration
__all__ = [
    "EmailSender", "EmailConfig",
    "DesktopNotifier",
    "SMSNotifier",
    "NotificationManager",
    "NotificationResult",
    "NotificationPriority"
]
