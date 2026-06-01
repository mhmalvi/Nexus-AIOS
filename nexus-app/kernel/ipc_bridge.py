"""
Nexus Shared Memory IPC Bridge
High-performance IPC for large payload transfers between Python and Rust
"""

import mmap
import struct
import json
import os
from typing import Optional, Dict, Any
from dataclasses import dataclass
from enum import IntEnum
from pathlib import Path
import tempfile


class MessageType(IntEnum):
    """IPC message types"""
    REQUEST = 1
    RESPONSE = 2
    EVENT = 3
    HEARTBEAT = 4


@dataclass
class SharedMemoryMessage:
    """Message structure for shared memory IPC"""
    msg_type: MessageType
    payload_size: int
    payload: bytes
    

class SharedMemoryBridge:
    """
    Shared Memory IPC Bridge for low-latency communication.
    
    Uses memory-mapped files for zero-copy data transfer between
    the Python kernel and Rust orchestrator.
    
    Protocol:
    - Header: [msg_type: u8][payload_size: u32][ready_flag: u8]
    - Payload: Raw bytes (JSON or binary)
    
    This provides 10-100x faster transfer for large payloads
    compared to stdin/stdout pipes.
    """
    
    HEADER_SIZE = 6  # 1 + 4 + 1 bytes
    DEFAULT_BUFFER_SIZE = 1024 * 1024  # 1 MB
    
    def __init__(
        self,
        name: str = "nexus_ipc",
        buffer_size: int = DEFAULT_BUFFER_SIZE,
        is_server: bool = False
    ):
        self.name = name
        self.buffer_size = buffer_size
        self.is_server = is_server
        
        self._shm_path = self._get_shm_path()
        self._mmap: Optional[mmap.mmap] = None
        self._file = None
        self._initialized = False
    
    def _get_shm_path(self) -> Path:
        """Get platform-appropriate shared memory path"""
        if os.name == 'nt':  # Windows
            return Path(tempfile.gettempdir()) / f"{self.name}.shm"
        else:  # Linux/macOS
            return Path("/dev/shm") / self.name if Path("/dev/shm").exists() else Path(tempfile.gettempdir()) / f"{self.name}.shm"
    
    def initialize(self) -> bool:
        """Initialize the shared memory region"""
        try:
            if self.is_server:
                # Create/truncate the file
                self._file = open(self._shm_path, "wb+")
                self._file.write(b'\x00' * (self.HEADER_SIZE + self.buffer_size))
                self._file.flush()
            else:
                # Open existing file
                if not self._shm_path.exists():
                    return False
                self._file = open(self._shm_path, "rb+")
            
            # Create memory map
            self._mmap = mmap.mmap(
                self._file.fileno(),
                self.HEADER_SIZE + self.buffer_size
            )
            
            self._initialized = True
            return True
            
        except Exception as e:
            print(f"❌ Failed to initialize shared memory: {e}")
            return False
    
    def write_message(self, msg_type: MessageType, payload: bytes) -> bool:
        """Write a message to shared memory"""
        if not self._initialized or self._mmap is None:
            return False
        
        payload_size = len(payload)
        if payload_size > self.buffer_size:
            print(f"⚠️ Payload too large: {payload_size} > {self.buffer_size}")
            return False
        
        try:
            # Pack header: type (1) + size (4) + ready (1)
            header = struct.pack("<BIB", msg_type, payload_size, 0)
            
            # Write header + payload
            self._mmap.seek(0)
            self._mmap.write(header)
            self._mmap.write(payload)
            
            # Set ready flag
            self._mmap.seek(5)  # Position of ready flag
            self._mmap.write(b'\x01')
            
            self._mmap.flush()
            return True
            
        except Exception as e:
            print(f"❌ Write error: {e}")
            return False
    
    def read_message(self, wait: bool = False, timeout_ms: int = 1000) -> Optional[SharedMemoryMessage]:
        """Read a message from shared memory"""
        if not self._initialized or self._mmap is None:
            return None
        
        try:
            import time
            start = time.time()
            
            while True:
                # Read header
                self._mmap.seek(0)
                header = self._mmap.read(self.HEADER_SIZE)
                
                msg_type, payload_size, ready = struct.unpack("<BIB", header)
                
                if ready == 1:
                    # Read payload
                    payload = self._mmap.read(payload_size)
                    
                    # Clear ready flag
                    self._mmap.seek(5)
                    self._mmap.write(b'\x00')
                    self._mmap.flush()
                    
                    return SharedMemoryMessage(
                        msg_type=MessageType(msg_type),
                        payload_size=payload_size,
                        payload=payload
                    )
                
                if not wait:
                    return None
                
                # Check timeout
                if (time.time() - start) * 1000 > timeout_ms:
                    return None
                
                time.sleep(0.001)  # 1ms sleep
                
        except Exception as e:
            print(f"❌ Read error: {e}")
            return None
    
    def write_json(self, msg_type: MessageType, data: Dict[str, Any]) -> bool:
        """Write JSON data to shared memory"""
        payload = json.dumps(data).encode('utf-8')
        return self.write_message(msg_type, payload)
    
    def read_json(self, wait: bool = False, timeout_ms: int = 1000) -> Optional[Dict[str, Any]]:
        """Read JSON data from shared memory"""
        msg = self.read_message(wait, timeout_ms)
        if msg is None:
            return None
        
        try:
            return json.loads(msg.payload.decode('utf-8'))
        except json.JSONDecodeError:
            return None
    
    def cleanup(self):
        """Clean up shared memory resources"""
        if self._mmap:
            self._mmap.close()
        
        if self._file:
            self._file.close()
        
        if self.is_server and self._shm_path.exists():
            try:
                os.remove(self._shm_path)
            except:
                pass
        
        self._initialized = False
    
    @property
    def is_available(self) -> bool:
        return self._initialized
    

class HybridIPCBridge:
    """
    Hybrid IPC Bridge - Uses shared memory for large payloads,
    falls back to stdio for small messages and compatibility.
    
    Threshold-based switching:
    - Small messages (< 4KB): Use stdio (lower setup overhead)
    - Large messages (>= 4KB): Use shared memory (faster transfer)
    """
    
    SIZE_THRESHOLD = 4096  # 4KB
    
    def __init__(self):
        self._shm_bridge: Optional[SharedMemoryBridge] = None
        self._shm_initialized = False
    
    def initialize_shared_memory(self, is_server: bool = False) -> bool:
        """Try to initialize shared memory bridge"""
        self._shm_bridge = SharedMemoryBridge(is_server=is_server)
        self._shm_initialized = self._shm_bridge.initialize()
        return self._shm_initialized
    
    def should_use_shm(self, payload_size: int) -> bool:
        """Determine if shared memory should be used for this payload"""
        return self._shm_initialized and payload_size >= self.SIZE_THRESHOLD
    
    def send(self, msg_type: MessageType, data: Dict[str, Any]) -> bool:
        """Send message via optimal channel"""
        payload = json.dumps(data).encode('utf-8')
        
        if self.should_use_shm(len(payload)):
            return self._shm_bridge.write_message(msg_type, payload)
        else:
            # Fallback to stdout (existing behavior)
            import sys
            line = json.dumps({"type": int(msg_type), "data": data})
            print(line, flush=True)
            return True
    
    def receive(self, timeout_ms: int = 100) -> Optional[Dict[str, Any]]:
        """Receive message from either channel"""
        # Check shared memory first
        if self._shm_initialized:
            msg = self._shm_bridge.read_json(wait=False)
            if msg:
                return msg
        
        # Fallback handled by main loop's stdin reading
        return None
    
    def cleanup(self):
        """Clean up resources"""
        if self._shm_bridge:
            self._shm_bridge.cleanup()
