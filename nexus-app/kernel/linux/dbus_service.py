"""
Nexus D-Bus Service - Linux-Native IPC
Exposes Nexus AIOS capabilities to external Linux applications via D-Bus.

Interfaces:
- org.nexus.Agent: Query, ExecuteTool, GetHealth
- org.nexus.Memory: Store, Retrieve, GetStats
- org.nexus.Voice: Speak, StartListening
- org.nexus.A2A: Peer management, remote tasks
"""

import asyncio
import json
import logging
import platform
import threading
from typing import Dict, Any, Optional, Callable, Awaitable
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

# D-Bus imports - gracefully handle missing dependencies
DBUS_AVAILABLE = False
try:
    import dbus
    import dbus.service
    import dbus.mainloop.glib
    from gi.repository import GLib
    DBUS_AVAILABLE = True
except ImportError:
    logger.warning("D-Bus dependencies not available. Install dbus-python and PyGObject for Linux IPC.")
    dbus = None
    GLib = None


# Constants
DBUS_BUS_NAME = "org.nexus.Agent"
DBUS_OBJECT_PATH = "/org/nexus/Agent"
NEXUS_VERSION = "0.1.0"


@dataclass
class DBusConfig:
    """Configuration for D-Bus service."""
    bus_type: str = "session"  # "session" or "system"
    enable_agent: bool = True
    enable_memory: bool = True
    enable_voice: bool = True
    enable_a2a: bool = True


class NexusDBusError(Exception):
    """Custom exception for D-Bus errors."""
    pass


if DBUS_AVAILABLE:
    
    class NexusAgentInterface(dbus.service.Object):
        """
        org.nexus.Agent interface implementation.
        
        Methods:
        - Query(message, context) -> response, success
        - ExecuteTool(tool_name, args_json) -> result_json, success
        - GetHealth() -> health_json
        
        Signals:
        - AgentEvent(event_type, payload_json)
        - ApprovalRequired(request_id, action, risk_level, details_json)
        
        Properties:
        - Version, IsRunning, ActiveModel
        """
        
        def __init__(self, bus, object_path, kernel=None):
            dbus.service.Object.__init__(self, bus, object_path)
            self.kernel = kernel
            self._is_running = True
            self._active_model = "llama3.2:3b"
            self._loop = None
            
        def set_kernel(self, kernel):
            """Set the kernel reference after initialization."""
            self.kernel = kernel
            
        def set_event_loop(self, loop):
            """Set the asyncio event loop for async operations."""
            self._loop = loop
            
        def _run_async(self, coro):
            """Run an async coroutine from D-Bus callback."""
            if self._loop:
                future = asyncio.run_coroutine_threadsafe(coro, self._loop)
                return future.result(timeout=60)
            else:
                # Fallback: create new event loop
                return asyncio.run(coro)
        
        # ---- Methods ----
        
        @dbus.service.method(
            dbus_interface="org.nexus.Agent",
            in_signature="ss",
            out_signature="sb"
        )
        def Query(self, message: str, context: str) -> tuple:
            """Send a natural language query to Nexus."""
            try:
                logger.info(f"D-Bus Query: {message[:50]}...")
                
                if not self.kernel:
                    return json.dumps({"error": "Kernel not initialized"}), False
                
                # Parse context if provided
                ctx = json.loads(context) if context else {}
                
                # Process query through kernel
                async def process():
                    from dataclasses import dataclass as dc
                    @dc
                    class MockMessage:
                        id: str = "dbus_query"
                        message_type: str = "query"
                        payload: Dict[str, Any] = None
                        timestamp: str = ""
                        
                        def __post_init__(self):
                            self.payload = {"query": message, "context": ctx}
                    
                    result = await self.kernel._handle_query(MockMessage())
                    return result
                
                result = self._run_async(process())
                
                if hasattr(result, 'data') and result.data:
                    response = result.data.get("response", "")
                    return response, True
                else:
                    return str(result), True
                    
            except Exception as e:
                logger.error(f"D-Bus Query error: {e}")
                return json.dumps({"error": str(e)}), False
        
        @dbus.service.method(
            dbus_interface="org.nexus.Agent",
            in_signature="ss",
            out_signature="sb"
        )
        def ExecuteTool(self, tool_name: str, args_json: str) -> tuple:
            """Execute a specific tool."""
            try:
                logger.info(f"D-Bus ExecuteTool: {tool_name}")
                
                if not self.kernel:
                    return json.dumps({"error": "Kernel not initialized"}), False
                
                args = json.loads(args_json) if args_json else {}
                
                async def execute():
                    if hasattr(self.kernel, 'toolbox'):
                        result = await self.kernel.toolbox.execute(tool_name, args)
                        return {
                            "success": result.success,
                            "output": result.output,
                            "error": result.error
                        }
                    else:
                        return {"error": "Toolbox not available"}
                
                result = self._run_async(execute())
                return json.dumps(result), result.get("success", False)
                
            except Exception as e:
                logger.error(f"D-Bus ExecuteTool error: {e}")
                return json.dumps({"error": str(e)}), False
        
        @dbus.service.method(
            dbus_interface="org.nexus.Agent",
            in_signature="",
            out_signature="s"
        )
        def GetHealth(self) -> str:
            """Get current system health status."""
            try:
                health = {
                    "status": "healthy" if self._is_running else "stopped",
                    "version": NEXUS_VERSION,
                    "model": self._active_model,
                    "kernel_running": self.kernel is not None,
                    "components": {
                        "brain": self.kernel is not None and hasattr(self.kernel, 'brain'),
                        "memory": self.kernel is not None and hasattr(self.kernel, 'memory'),
                        "toolbox": self.kernel is not None and hasattr(self.kernel, 'toolbox'),
                        "voice": self.kernel is not None and hasattr(self.kernel, 'voice'),
                    }
                }
                
                # Check Ollama if kernel available
                if self.kernel and hasattr(self.kernel, 'brain'):
                    async def check_ollama():
                        return await self.kernel.brain.llm.check_health()
                    
                    try:
                        health["ollama_available"] = self._run_async(check_ollama())
                    except Exception:
                        health["ollama_available"] = False
                
                return json.dumps(health)
                
            except Exception as e:
                return json.dumps({"error": str(e), "status": "error"})
        
        # ---- Signals ----
        
        @dbus.service.signal(
            dbus_interface="org.nexus.Agent",
            signature="ss"
        )
        def AgentEvent(self, event_type: str, payload_json: str):
            """Emit an agent event."""
            pass
        
        @dbus.service.signal(
            dbus_interface="org.nexus.Agent",
            signature="ssss"
        )
        def ApprovalRequired(self, request_id: str, action: str, 
                            risk_level: str, details_json: str):
            """Emit when an action requires user approval."""
            pass
        
        # ---- Properties ----
        
        @dbus.service.method(
            dbus_interface=dbus.PROPERTIES_IFACE,
            in_signature="ss",
            out_signature="v"
        )
        def Get(self, interface_name: str, property_name: str):
            """Get a property value."""
            if interface_name == "org.nexus.Agent":
                if property_name == "Version":
                    return NEXUS_VERSION
                elif property_name == "IsRunning":
                    return self._is_running
                elif property_name == "ActiveModel":
                    return self._active_model
            raise dbus.exceptions.DBusException(
                "org.freedesktop.DBus.Error.UnknownProperty",
                f"Unknown property: {property_name}"
            )
        
        def emit_approval_required(self, request_id: str, action: str,
                                   risk_level: str, details: Dict[str, Any]):
            """Helper to emit ApprovalRequired signal."""
            self.ApprovalRequired(request_id, action, risk_level, json.dumps(details))
        
        def emit_agent_event(self, event_type: str, payload: Dict[str, Any]):
            """Helper to emit AgentEvent signal."""
            self.AgentEvent(event_type, json.dumps(payload))


    class NexusMemoryInterface(dbus.service.Object):
        """
        org.nexus.Memory interface implementation.
        
        Methods:
        - Store(content, tier, metadata_json) -> entry_id
        - Retrieve(query, tier, limit) -> results_json
        - GetStats() -> stats_json
        """
        
        def __init__(self, bus, object_path, memory=None):
            dbus.service.Object.__init__(self, bus, object_path)
            self.memory = memory
            self._loop = None
            
        def set_memory(self, memory):
            """Set the memory manager reference."""
            self.memory = memory
            
        def set_event_loop(self, loop):
            """Set the asyncio event loop."""
            self._loop = loop
            
        def _run_async(self, coro):
            """Run an async coroutine."""
            if self._loop:
                future = asyncio.run_coroutine_threadsafe(coro, self._loop)
                return future.result(timeout=30)
            else:
                return asyncio.run(coro)
        
        @dbus.service.method(
            dbus_interface="org.nexus.Memory",
            in_signature="sss",
            out_signature="s"
        )
        def Store(self, content: str, tier: str, metadata_json: str) -> str:
            """Store content in memory."""
            try:
                if not self.memory:
                    return json.dumps({"error": "Memory not initialized"})
                
                metadata = json.loads(metadata_json) if metadata_json else {}
                
                async def store():
                    entry_id = await self.memory.store(
                        content=content,
                        tier=tier,
                        metadata=metadata
                    )
                    return entry_id
                
                entry_id = self._run_async(store())
                return entry_id
                
            except Exception as e:
                logger.error(f"D-Bus Memory.Store error: {e}")
                return ""
        
        @dbus.service.method(
            dbus_interface="org.nexus.Memory",
            in_signature="ssu",
            out_signature="s"
        )
        def Retrieve(self, query: str, tier: str, limit: int) -> str:
            """Retrieve from memory."""
            try:
                if not self.memory:
                    return json.dumps({"error": "Memory not initialized"})
                
                async def retrieve():
                    results = await self.memory.retrieve(
                        query=query,
                        tier=tier if tier else "all",
                        limit=limit if limit > 0 else 5
                    )
                    return results
                
                results = self._run_async(retrieve())
                return json.dumps(results)
                
            except Exception as e:
                logger.error(f"D-Bus Memory.Retrieve error: {e}")
                return json.dumps({"error": str(e)})
        
        @dbus.service.method(
            dbus_interface="org.nexus.Memory",
            in_signature="",
            out_signature="s"
        )
        def GetStats(self) -> str:
            """Get memory statistics."""
            try:
                if not self.memory:
                    return json.dumps({"error": "Memory not initialized"})
                
                stats = self.memory.get_stats()
                return json.dumps(stats)
                
            except Exception as e:
                return json.dumps({"error": str(e)})


    class NexusVoiceInterface(dbus.service.Object):
        """
        org.nexus.Voice interface implementation.
        
        Methods:
        - Speak(text, streaming) -> success
        - StartListening(duration_seconds) -> transcription
        
        Signals:
        - WakeWordDetected()
        - TranscriptionComplete(text, confidence)
        """
        
        def __init__(self, bus, object_path, voice=None):
            dbus.service.Object.__init__(self, bus, object_path)
            self.voice = voice
            self._is_listening = False
            self._loop = None
            
        def set_voice(self, voice):
            """Set the voice pipeline reference."""
            self.voice = voice
            
        def set_event_loop(self, loop):
            """Set the asyncio event loop."""
            self._loop = loop
            
        def _run_async(self, coro):
            """Run an async coroutine."""
            if self._loop:
                future = asyncio.run_coroutine_threadsafe(coro, self._loop)
                return future.result(timeout=30)
            else:
                return asyncio.run(coro)
        
        @dbus.service.method(
            dbus_interface="org.nexus.Voice",
            in_signature="sb",
            out_signature="b"
        )
        def Speak(self, text: str, streaming: bool) -> bool:
            """Convert text to speech."""
            try:
                if not self.voice:
                    logger.warning("Voice pipeline not available")
                    return False
                
                async def speak():
                    if streaming:
                        return await self.voice.speak_streaming(text)
                    else:
                        return await self.voice.speak(text)
                
                return self._run_async(speak())
                
            except Exception as e:
                logger.error(f"D-Bus Voice.Speak error: {e}")
                return False
        
        @dbus.service.method(
            dbus_interface="org.nexus.Voice",
            in_signature="d",
            out_signature="s"
        )
        def StartListening(self, duration_seconds: float) -> str:
            """Start listening for speech input."""
            try:
                if not self.voice:
                    return ""
                
                self._is_listening = True
                
                async def listen():
                    result = await self.voice.start_listening(duration=duration_seconds)
                    self._is_listening = False
                    if result:
                        self.TranscriptionComplete(result.text, result.confidence)
                        return result.text
                    return ""
                
                return self._run_async(listen())
                
            except Exception as e:
                logger.error(f"D-Bus Voice.StartListening error: {e}")
                self._is_listening = False
                return ""
        
        @dbus.service.signal(dbus_interface="org.nexus.Voice", signature="")
        def WakeWordDetected(self):
            """Signal emitted when wake word is detected."""
            pass
        
        @dbus.service.signal(dbus_interface="org.nexus.Voice", signature="sd")
        def TranscriptionComplete(self, text: str, confidence: float):
            """Signal emitted when transcription is complete."""
            pass
        
        @dbus.service.method(
            dbus_interface=dbus.PROPERTIES_IFACE,
            in_signature="ss",
            out_signature="v"
        )
        def Get(self, interface_name: str, property_name: str):
            """Get a property value."""
            if interface_name == "org.nexus.Voice":
                if property_name == "IsListening":
                    return self._is_listening
            raise dbus.exceptions.DBusException(
                "org.freedesktop.DBus.Error.UnknownProperty",
                f"Unknown property: {property_name}"
            )


    class NexusA2AInterface(dbus.service.Object):
        """
        org.nexus.A2A interface implementation.
        
        Methods:
        - RequestA2AConnection, DisconnectPeer, RequestRemoteTask
        - QueryRemoteMemory, GetConnectedPeers
        
        Signals:
        - A2APeerDiscovered, A2APeerDisconnected, A2ATaskReceived
        """
        
        def __init__(self, bus, object_path, a2a_protocol=None):
            dbus.service.Object.__init__(self, bus, object_path)
            self.a2a = a2a_protocol
            self._local_node_id = ""
            self._loop = None
            
        def set_a2a(self, a2a_protocol):
            """Set the A2A protocol reference."""
            self.a2a = a2a_protocol
            if a2a_protocol:
                self._local_node_id = a2a_protocol.node_id
                
        def set_event_loop(self, loop):
            """Set the asyncio event loop."""
            self._loop = loop
            
        def _run_async(self, coro):
            """Run an async coroutine."""
            if self._loop:
                future = asyncio.run_coroutine_threadsafe(coro, self._loop)
                return future.result(timeout=60)
            else:
                return asyncio.run(coro)
        
        @dbus.service.method(
            dbus_interface="org.nexus.A2A",
            in_signature="su",
            out_signature="bs"
        )
        def RequestA2AConnection(self, peer_address: str, peer_port: int) -> tuple:
            """Request connection to a remote Nexus peer."""
            try:
                if not self.a2a:
                    return False, ""
                
                async def connect():
                    success = await self.a2a.connect_peer(peer_address, peer_port)
                    if success:
                        # Find the peer ID
                        peers = self.a2a.get_peers()
                        for peer in peers:
                            if peer.address == peer_address:
                                return True, peer.node_id
                    return False, ""
                
                return self._run_async(connect())
                
            except Exception as e:
                logger.error(f"D-Bus A2A.RequestA2AConnection error: {e}")
                return False, ""
        
        @dbus.service.method(
            dbus_interface="org.nexus.A2A",
            in_signature="s",
            out_signature="b"
        )
        def DisconnectPeer(self, peer_id: str) -> bool:
            """Disconnect from a peer."""
            try:
                if not self.a2a:
                    return False
                
                # Find and disconnect peer
                peers = self.a2a.get_peers()
                for peer in peers:
                    if peer.node_id == peer_id and peer.websocket:
                        async def disconnect():
                            await peer.websocket.close()
                            return True
                        return self._run_async(disconnect())
                
                return False
                
            except Exception as e:
                logger.error(f"D-Bus A2A.DisconnectPeer error: {e}")
                return False
        
        @dbus.service.method(
            dbus_interface="org.nexus.A2A",
            in_signature="ss",
            out_signature="sb"
        )
        def RequestRemoteTask(self, peer_id: str, task_json: str) -> tuple:
            """Send a task request to a remote agent."""
            try:
                if not self.a2a:
                    return json.dumps({"error": "A2A not available"}), False
                
                task = json.loads(task_json)
                
                async def request():
                    response = await self.a2a.request_task(peer_id, task)
                    if response:
                        return json.dumps(response.payload), True
                    return json.dumps({"error": "No response"}), False
                
                return self._run_async(request())
                
            except Exception as e:
                return json.dumps({"error": str(e)}), False
        
        @dbus.service.method(
            dbus_interface="org.nexus.A2A",
            in_signature="sss",
            out_signature="s"
        )
        def QueryRemoteMemory(self, peer_id: str, query: str, tier: str) -> str:
            """Query a remote agent's memory."""
            try:
                if not self.a2a:
                    return json.dumps({"error": "A2A not available"})
                
                async def query_memory():
                    response = await self.a2a.query_memory(peer_id, query, tier)
                    if response:
                        return json.dumps(response.payload)
                    return json.dumps({"error": "No response"})
                
                return self._run_async(query_memory())
                
            except Exception as e:
                return json.dumps({"error": str(e)})
        
        @dbus.service.method(
            dbus_interface="org.nexus.A2A",
            in_signature="",
            out_signature="s"
        )
        def GetConnectedPeers(self) -> str:
            """Get list of connected peers."""
            try:
                if not self.a2a:
                    return json.dumps([])
                
                peers = self.a2a.get_peers()
                peer_list = [
                    {
                        "node_id": p.node_id,
                        "address": p.address,
                        "port": p.port,
                        "capabilities": p.capabilities,
                        "connected_at": p.connected_at.isoformat()
                    }
                    for p in peers
                ]
                return json.dumps(peer_list)
                
            except Exception as e:
                return json.dumps({"error": str(e)})
        
        # ---- Signals ----
        
        @dbus.service.signal(dbus_interface="org.nexus.A2A", signature="ssus")
        def A2APeerDiscovered(self, peer_id: str, peer_address: str,
                              peer_port: int, capabilities_json: str):
            """Emitted when a new peer is discovered."""
            pass
        
        @dbus.service.signal(dbus_interface="org.nexus.A2A", signature="ss")
        def A2APeerDisconnected(self, peer_id: str, reason: str):
            """Emitted when a peer disconnects."""
            pass
        
        @dbus.service.signal(dbus_interface="org.nexus.A2A", signature="sss")
        def A2ATaskReceived(self, request_id: str, source_peer: str, task_json: str):
            """Emitted when a remote task request is received."""
            pass
        
        @dbus.service.method(
            dbus_interface=dbus.PROPERTIES_IFACE,
            in_signature="ss",
            out_signature="v"
        )
        def Get(self, interface_name: str, property_name: str):
            """Get a property value."""
            if interface_name == "org.nexus.A2A":
                if property_name == "LocalNodeId":
                    return self._local_node_id
                elif property_name == "ConnectedPeerCount":
                    if self.a2a:
                        return dbus.UInt32(len(self.a2a.get_peers()))
                    return dbus.UInt32(0)
            raise dbus.exceptions.DBusException(
                "org.freedesktop.DBus.Error.UnknownProperty",
                f"Unknown property: {property_name}"
            )


class NexusDBusService:
    """
    Main D-Bus service manager for Nexus AIOS.
    
    Coordinates all D-Bus interfaces and manages the GLib mainloop.
    
    Usage:
        service = NexusDBusService(kernel)
        service.start()  # Runs in background thread
        ...
        service.stop()
    """
    
    def __init__(self, kernel=None, config: Optional[DBusConfig] = None):
        self.kernel = kernel
        self.config = config or DBusConfig()
        self._running = False
        self._thread = None
        self._mainloop = None
        self._bus = None
        
        # Interface instances
        self.agent_interface = None
        self.memory_interface = None
        self.voice_interface = None
        self.a2a_interface = None
        
    def is_available(self) -> bool:
        """Check if D-Bus is available on this system."""
        return DBUS_AVAILABLE and platform.system() == "Linux"
    
    def start(self, event_loop=None):
        """Start the D-Bus service in a background thread."""
        if not self.is_available():
            logger.warning("D-Bus not available on this platform")
            return False
        
        if self._running:
            logger.warning("D-Bus service already running")
            return True
        
        self._event_loop = event_loop
        self._thread = threading.Thread(target=self._run_mainloop, daemon=True)
        self._thread.start()
        
        # Wait for service to register
        import time
        for _ in range(10):
            if self._running:
                return True
            time.sleep(0.1)
        
        return self._running
    
    def _run_mainloop(self):
        """Run the GLib mainloop (in background thread)."""
        try:
            # Initialize D-Bus mainloop
            dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
            
            # Connect to session bus
            if self.config.bus_type == "system":
                self._bus = dbus.SystemBus()
            else:
                self._bus = dbus.SessionBus()
            
            # Request bus name
            bus_name = dbus.service.BusName(DBUS_BUS_NAME, bus=self._bus)
            
            # Create interfaces
            if self.config.enable_agent:
                self.agent_interface = NexusAgentInterface(
                    self._bus, DBUS_OBJECT_PATH, self.kernel
                )
                if self._event_loop:
                    self.agent_interface.set_event_loop(self._event_loop)
            
            if self.config.enable_memory:
                self.memory_interface = NexusMemoryInterface(
                    self._bus, DBUS_OBJECT_PATH,
                    self.kernel.memory if self.kernel else None
                )
                if self._event_loop:
                    self.memory_interface.set_event_loop(self._event_loop)
            
            if self.config.enable_voice:
                self.voice_interface = NexusVoiceInterface(
                    self._bus, DBUS_OBJECT_PATH,
                    self.kernel.voice if self.kernel else None
                )
                if self._event_loop:
                    self.voice_interface.set_event_loop(self._event_loop)
            
            if self.config.enable_a2a:
                self.a2a_interface = NexusA2AInterface(
                    self._bus, DBUS_OBJECT_PATH,
                    self.kernel.a2a_protocol if self.kernel and hasattr(self.kernel, 'a2a_protocol') else None
                )
                if self._event_loop:
                    self.a2a_interface.set_event_loop(self._event_loop)
            
            logger.info(f"D-Bus service registered: {DBUS_BUS_NAME}")
            
            # Run mainloop
            self._mainloop = GLib.MainLoop()
            self._running = True
            self._mainloop.run()
            
        except Exception as e:
            logger.error(f"D-Bus service error: {e}")
            self._running = False
    
    def stop(self):
        """Stop the D-Bus service."""
        if not self._running:
            return
        
        self._running = False
        
        if self._mainloop:
            self._mainloop.quit()
        
        if self._thread:
            self._thread.join(timeout=2)
        
        logger.info("D-Bus service stopped")
    
    def update_kernel(self, kernel):
        """Update kernel reference after initialization."""
        self.kernel = kernel
        
        if self.agent_interface:
            self.agent_interface.set_kernel(kernel)
        
        if self.memory_interface and hasattr(kernel, 'memory'):
            self.memory_interface.set_memory(kernel.memory)
        
        if self.voice_interface and hasattr(kernel, 'voice'):
            self.voice_interface.set_voice(kernel.voice)
        
        if self.a2a_interface and hasattr(kernel, 'a2a_protocol'):
            self.a2a_interface.set_a2a(kernel.a2a_protocol)
    
    def emit_approval_required(self, request_id: str, action: str,
                               risk_level: str, details: Dict[str, Any]):
        """Emit ApprovalRequired signal from the agent interface."""
        if self.agent_interface:
            self.agent_interface.emit_approval_required(
                request_id, action, risk_level, details
            )
    
    def emit_agent_event(self, event_type: str, payload: Dict[str, Any]):
        """Emit AgentEvent signal from the agent interface."""
        if self.agent_interface:
            self.agent_interface.emit_agent_event(event_type, payload)


# Fallback class when D-Bus is not available
class NexusDBusServiceStub:
    """Stub implementation when D-Bus dependencies are not available."""
    
    def __init__(self, *args, **kwargs):
        pass
    
    def is_available(self) -> bool:
        return False
    
    def start(self, event_loop=None) -> bool:
        logger.debug("D-Bus service stub: not starting (dependencies unavailable)")
        return False
    
    def stop(self):
        pass
    
    def update_kernel(self, kernel):
        pass
    
    def emit_approval_required(self, *args, **kwargs):
        pass
    
    def emit_agent_event(self, *args, **kwargs):
        pass


# Export the appropriate class based on availability
if DBUS_AVAILABLE:
    DBusService = NexusDBusService
else:
    DBusService = NexusDBusServiceStub
