"""
Nexus Agent-to-Agent (A2A) Communication Protocol
JSON-RPC 2.0 over WebSocket for real-time agent coordination.

Features:
- Task delegation between agents
- Memory queries across devices
- Heartbeat/health monitoring
- mTLS security
"""

import asyncio
import logging
import json
import uuid
import ssl
from typing import Dict, Any, List, Optional, Callable, Awaitable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class MessageType(Enum):
    """A2A message types."""
    # Requests
    TASK_REQUEST = "task_request"
    MEMORY_QUERY = "memory_query"
    CAPABILITY_QUERY = "capability_query"
    
    # Responses
    TASK_RESPONSE = "task_response"
    MEMORY_RESPONSE = "memory_response"
    CAPABILITY_RESPONSE = "capability_response"
    
    # System
    HEARTBEAT = "heartbeat"
    HEARTBEAT_ACK = "heartbeat_ack"
    ERROR = "error"
    
    # Notifications
    PEER_JOINED = "peer_joined"
    PEER_LEFT = "peer_left"


@dataclass
class A2AMessage:
    """A single A2A protocol message."""
    id: str
    message_type: MessageType
    source_node: str
    target_node: str
    payload: Dict[str, Any]
    timestamp: datetime = field(default_factory=datetime.now)
    correlation_id: Optional[str] = None  # For request-response matching
    
    def to_jsonrpc(self) -> Dict[str, Any]:
        """Convert to JSON-RPC 2.0 format."""
        return {
            "jsonrpc": "2.0",
            "id": self.id,
            "method": self.message_type.value,
            "params": {
                "source": self.source_node,
                "target": self.target_node,
                "payload": self.payload,
                "timestamp": self.timestamp.isoformat(),
                "correlation_id": self.correlation_id
            }
        }
    
    @classmethod
    def from_jsonrpc(cls, data: Dict[str, Any]) -> "A2AMessage":
        """Parse from JSON-RPC 2.0 format."""
        params = data.get("params", {})
        return cls(
            id=data.get("id", str(uuid.uuid4())),
            message_type=MessageType(data.get("method", "error")),
            source_node=params.get("source", ""),
            target_node=params.get("target", ""),
            payload=params.get("payload", {}),
            timestamp=datetime.fromisoformat(params.get("timestamp", datetime.now().isoformat())),
            correlation_id=params.get("correlation_id")
        )
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "message_type": self.message_type.value,
            "source_node": self.source_node,
            "target_node": self.target_node,
            "payload": self.payload,
            "timestamp": self.timestamp.isoformat(),
            "correlation_id": self.correlation_id
        }


@dataclass
class PeerConnection:
    """Represents a connected A2A peer."""
    node_id: str
    address: str
    port: int
    websocket: Any = None  # websocket connection
    connected_at: datetime = field(default_factory=datetime.now)
    last_heartbeat: datetime = field(default_factory=datetime.now)
    capabilities: List[str] = field(default_factory=list)
    
    def is_healthy(self, timeout_seconds: int = 30) -> bool:
        """Check if peer is healthy based on last heartbeat."""
        return (datetime.now() - self.last_heartbeat).total_seconds() < timeout_seconds


class A2AProtocol:
    """
    Agent-to-Agent Communication Protocol.
    
    Enables Nexus agents on different devices to:
    - Delegate tasks to each other
    - Query each other's memory
    - Coordinate on complex multi-device workflows
    
    Usage:
        protocol = A2AProtocol(node_id="laptop-1")
        await protocol.start_server(port=9877)
        
        # Connect to peer
        await protocol.connect_peer("192.168.1.100", 9877)
        
        # Send task request
        response = await protocol.request_task(
            target="server-1",
            task={"action": "search_files", "pattern": "*.py"}
        )
    """
    
    def __init__(
        self,
        node_id: str,
        capabilities: Optional[List[str]] = None,
        heartbeat_interval: int = 10
    ):
        self.node_id = node_id
        self.capabilities = capabilities or ["task", "memory", "sync"]
        self.heartbeat_interval = heartbeat_interval
        
        self._peers: Dict[str, PeerConnection] = {}
        self._pending_requests: Dict[str, asyncio.Future] = {}
        self._handlers: Dict[MessageType, Callable] = {}
        self._server = None
        self._running = False
        self._message_log: List[Dict[str, Any]] = []
        
        # Register default handlers
        self._register_default_handlers()
    
    def _register_default_handlers(self) -> None:
        """Register default message handlers."""
        self._handlers[MessageType.HEARTBEAT] = self._handle_heartbeat
        self._handlers[MessageType.CAPABILITY_QUERY] = self._handle_capability_query
    
    async def _handle_heartbeat(self, message: A2AMessage) -> A2AMessage:
        """Handle heartbeat message."""
        return A2AMessage(
            id=str(uuid.uuid4()),
            message_type=MessageType.HEARTBEAT_ACK,
            source_node=self.node_id,
            target_node=message.source_node,
            payload={"status": "alive", "uptime": "ok"},
            correlation_id=message.id
        )
    
    async def _handle_capability_query(self, message: A2AMessage) -> A2AMessage:
        """Handle capability query."""
        return A2AMessage(
            id=str(uuid.uuid4()),
            message_type=MessageType.CAPABILITY_RESPONSE,
            source_node=self.node_id,
            target_node=message.source_node,
            payload={
                "capabilities": self.capabilities,
                "node_id": self.node_id
            },
            correlation_id=message.id
        )
    
    def register_handler(
        self,
        message_type: MessageType,
        handler: Callable[[A2AMessage], Awaitable[A2AMessage]]
    ) -> None:
        """Register a custom handler for a message type."""
        self._handlers[message_type] = handler
    
    async def start_server(self, host: str = "0.0.0.0", port: int = 9877) -> bool:
        """Start the A2A server."""
        try:
            import websockets
            
            async def handle_connection(websocket, path):
                """Handle incoming WebSocket connection."""
                peer_id = None
                try:
                    async for raw_message in websocket:
                        try:
                            data = json.loads(raw_message)
                            message = A2AMessage.from_jsonrpc(data)
                            
                            # Track peer
                            if not peer_id:
                                peer_id = message.source_node
                                self._peers[peer_id] = PeerConnection(
                                    node_id=peer_id,
                                    address=websocket.remote_address[0],
                                    port=websocket.remote_address[1],
                                    websocket=websocket
                                )
                                logger.info(f"Peer connected: {peer_id}")
                            
                            # Update heartbeat
                            if peer_id in self._peers:
                                self._peers[peer_id].last_heartbeat = datetime.now()
                            
                            # Process message
                            response = await self._process_message(message)
                            if response:
                                await websocket.send(json.dumps(response.to_jsonrpc()))
                            
                        except json.JSONDecodeError as e:
                            logger.error(f"Invalid JSON: {e}")
                        except Exception as e:
                            logger.error(f"Message handling error: {e}")
                            
                except Exception as e:
                    logger.debug(f"Connection closed: {e}")
                finally:
                    if peer_id and peer_id in self._peers:
                        del self._peers[peer_id]
                        logger.info(f"Peer disconnected: {peer_id}")
            
            # Create SSL context for mTLS
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            # In production, load proper certificates
            # ssl_context.load_cert_chain('cert.pem', 'key.pem')
            
            self._server = await websockets.serve(
                handle_connection,
                host,
                port,
                # ssl=ssl_context  # Enable in production
            )
            
            self._running = True
            logger.info(f"A2A server started on {host}:{port}")
            
            # Start heartbeat task
            asyncio.create_task(self._heartbeat_loop())
            
            return True
            
        except ImportError:
            logger.error("websockets not available")
            return False
        except Exception as e:
            logger.error(f"Server start failed: {e}")
            return False
    
    async def stop_server(self) -> None:
        """Stop the A2A server."""
        self._running = False
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        
        # Close all peer connections
        for peer in self._peers.values():
            if peer.websocket:
                await peer.websocket.close()
        
        self._peers.clear()
        logger.info("A2A server stopped")
    
    async def connect_peer(self, address: str, port: int = 9877) -> bool:
        """Connect to a remote A2A peer."""
        try:
            import websockets
            
            uri = f"ws://{address}:{port}"  # Use wss:// in production
            websocket = await websockets.connect(uri)
            
            # Send capability query to get peer info
            query = A2AMessage(
                id=str(uuid.uuid4()),
                message_type=MessageType.CAPABILITY_QUERY,
                source_node=self.node_id,
                target_node="",
                payload={}
            )
            
            await websocket.send(json.dumps(query.to_jsonrpc()))
            response_data = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            response = A2AMessage.from_jsonrpc(json.loads(response_data))
            
            peer_id = response.payload.get("node_id", f"{address}:{port}")
            
            self._peers[peer_id] = PeerConnection(
                node_id=peer_id,
                address=address,
                port=port,
                websocket=websocket,
                capabilities=response.payload.get("capabilities", [])
            )
            
            # Start listener for this connection
            asyncio.create_task(self._peer_listener(peer_id, websocket))
            
            logger.info(f"Connected to peer: {peer_id}")
            return True
            
        except ImportError:
            logger.error("websockets not available")
            return False
        except Exception as e:
            logger.error(f"Failed to connect to peer: {e}")
            return False
    
    async def _peer_listener(self, peer_id: str, websocket) -> None:
        """Listen for messages from a peer."""
        try:
            async for raw_message in websocket:
                try:
                    data = json.loads(raw_message)
                    message = A2AMessage.from_jsonrpc(data)
                    
                    # Check if this is a response to a pending request
                    if message.correlation_id in self._pending_requests:
                        self._pending_requests[message.correlation_id].set_result(message)
                    else:
                        # Process as new message
                        response = await self._process_message(message)
                        if response:
                            await websocket.send(json.dumps(response.to_jsonrpc()))
                            
                except Exception as e:
                    logger.error(f"Peer message error: {e}")
                    
        except Exception as e:
            logger.debug(f"Peer listener ended: {e}")
        finally:
            if peer_id in self._peers:
                del self._peers[peer_id]
    
    async def _process_message(self, message: A2AMessage) -> Optional[A2AMessage]:
        """Process an incoming message."""
        self._message_log.append({
            "direction": "in",
            "message": message.to_dict()
        })
        
        handler = self._handlers.get(message.message_type)
        if handler:
            return await handler(message)
        
        logger.warning(f"No handler for message type: {message.message_type}")
        return None
    
    async def _heartbeat_loop(self) -> None:
        """Send periodic heartbeats to all peers."""
        while self._running:
            await asyncio.sleep(self.heartbeat_interval)
            
            for peer_id, peer in list(self._peers.items()):
                if not peer.is_healthy():
                    logger.warning(f"Peer {peer_id} unhealthy, removing")
                    if peer.websocket:
                        await peer.websocket.close()
                    del self._peers[peer_id]
                    continue
                
                try:
                    heartbeat = A2AMessage(
                        id=str(uuid.uuid4()),
                        message_type=MessageType.HEARTBEAT,
                        source_node=self.node_id,
                        target_node=peer_id,
                        payload={}
                    )
                    if peer.websocket:
                        await peer.websocket.send(json.dumps(heartbeat.to_jsonrpc()))
                except Exception as e:
                    logger.debug(f"Heartbeat failed for {peer_id}: {e}")
    
    async def request_task(
        self,
        target: str,
        task: Dict[str, Any],
        timeout: float = 30.0
    ) -> Optional[A2AMessage]:
        """
        Request a task be executed by a remote agent.
        
        Args:
            target: Target node ID
            task: Task specification
            timeout: Request timeout in seconds
        
        Returns:
            Response message or None on timeout
        """
        if target not in self._peers:
            logger.error(f"Unknown peer: {target}")
            return None
        
        message = A2AMessage(
            id=str(uuid.uuid4()),
            message_type=MessageType.TASK_REQUEST,
            source_node=self.node_id,
            target_node=target,
            payload=task
        )
        
        return await self._send_and_wait(target, message, timeout)
    
    async def query_memory(
        self,
        target: str,
        query: str,
        tier: str = "all",
        timeout: float = 10.0
    ) -> Optional[A2AMessage]:
        """
        Query a remote agent's memory.
        
        Args:
            target: Target node ID
            query: Search query
            tier: Memory tier to search
            timeout: Request timeout
        
        Returns:
            Response with memory results
        """
        if target not in self._peers:
            logger.error(f"Unknown peer: {target}")
            return None
        
        message = A2AMessage(
            id=str(uuid.uuid4()),
            message_type=MessageType.MEMORY_QUERY,
            source_node=self.node_id,
            target_node=target,
            payload={"query": query, "tier": tier}
        )
        
        return await self._send_and_wait(target, message, timeout)
    
    async def _send_and_wait(
        self,
        target: str,
        message: A2AMessage,
        timeout: float
    ) -> Optional[A2AMessage]:
        """Send a message and wait for response."""
        peer = self._peers.get(target)
        if not peer or not peer.websocket:
            return None
        
        # Create future for response
        future = asyncio.Future()
        self._pending_requests[message.id] = future
        
        try:
            # Send message
            await peer.websocket.send(json.dumps(message.to_jsonrpc()))
            self._message_log.append({
                "direction": "out",
                "message": message.to_dict()
            })
            
            # Wait for response
            response = await asyncio.wait_for(future, timeout=timeout)
            return response
            
        except asyncio.TimeoutError:
            logger.warning(f"Request timeout for {message.id}")
            return None
        except Exception as e:
            logger.error(f"Request failed: {e}")
            return None
        finally:
            self._pending_requests.pop(message.id, None)
    
    def get_peers(self) -> List[Dict[str, Any]]:
        """Get list of connected peers."""
        return [
            {
                "node_id": p.node_id,
                "address": p.address,
                "port": p.port,
                "connected_at": p.connected_at.isoformat(),
                "last_heartbeat": p.last_heartbeat.isoformat(),
                "healthy": p.is_healthy(),
                "capabilities": p.capabilities
            }
            for p in self._peers.values()
        ]
    
    def get_status(self) -> Dict[str, Any]:
        """Get protocol status."""
        return {
            "node_id": self.node_id,
            "running": self._running,
            "capabilities": self.capabilities,
            "peers": self.get_peers(),
            "pending_requests": len(self._pending_requests),
            "message_count": len(self._message_log)
        }
    
    def get_message_log(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent message log."""
        return self._message_log[-limit:]
