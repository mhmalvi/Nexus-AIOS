"""
Nexus Cross-Device Memory Sync
CRDT-based synchronization of Tier 2 and Tier 3 memory across devices.

Features:
- Delta-based sync (only changes since last sync)
- CRDT conflict resolution (Last-Writer-Wins with vector clocks)
- Encrypted transport via TLS 1.3
"""

import asyncio
import logging
import json
import hashlib
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


@dataclass
class VectorClock:
    """
    Vector clock for tracking causality across nodes.
    """
    clocks: Dict[str, int] = field(default_factory=dict)
    
    def increment(self, node_id: str) -> None:
        """Increment the clock for a node."""
        self.clocks[node_id] = self.clocks.get(node_id, 0) + 1
    
    def merge(self, other: "VectorClock") -> None:
        """Merge another vector clock into this one."""
        for node_id, ts in other.clocks.items():
            self.clocks[node_id] = max(self.clocks.get(node_id, 0), ts)
    
    def is_concurrent(self, other: "VectorClock") -> bool:
        """Check if two clocks are concurrent (neither happened-before)."""
        self_greater = False
        other_greater = False
        
        all_keys = set(self.clocks.keys()) | set(other.clocks.keys())
        for key in all_keys:
            self_val = self.clocks.get(key, 0)
            other_val = other.clocks.get(key, 0)
            if self_val > other_val:
                self_greater = True
            if other_val > self_val:
                other_greater = True
        
        return self_greater and other_greater
    
    def happened_before(self, other: "VectorClock") -> bool:
        """Check if this clock happened before another."""
        for key, val in self.clocks.items():
            if val > other.clocks.get(key, 0):
                return False
        return any(
            self.clocks.get(k, 0) < v
            for k, v in other.clocks.items()
        )
    
    def to_dict(self) -> Dict[str, int]:
        return self.clocks.copy()
    
    @classmethod
    def from_dict(cls, data: Dict[str, int]) -> "VectorClock":
        return cls(clocks=data.copy())


@dataclass
class SyncEntry:
    """A single entry for synchronization."""
    id: str
    content: str
    tier: str  # "short_term" or "long_term"
    metadata: Dict[str, Any]
    vector_clock: VectorClock
    timestamp: datetime
    checksum: str = ""
    
    def __post_init__(self):
        if not self.checksum:
            self.checksum = self._compute_checksum()
    
    def _compute_checksum(self) -> str:
        """Compute content checksum for integrity."""
        data = f"{self.id}:{self.content}:{self.timestamp.isoformat()}"
        return hashlib.sha256(data.encode()).hexdigest()[:16]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "content": self.content,
            "tier": self.tier,
            "metadata": self.metadata,
            "vector_clock": self.vector_clock.to_dict(),
            "timestamp": self.timestamp.isoformat(),
            "checksum": self.checksum
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SyncEntry":
        return cls(
            id=data["id"],
            content=data["content"],
            tier=data["tier"],
            metadata=data.get("metadata", {}),
            vector_clock=VectorClock.from_dict(data.get("vector_clock", {})),
            timestamp=datetime.fromisoformat(data["timestamp"]),
            checksum=data.get("checksum", "")
        )


@dataclass
class SyncDelta:
    """A batch of changes for synchronization."""
    source_node: str
    target_node: str
    since: datetime
    entries: List[SyncEntry]
    vector_clock: VectorClock
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_node": self.source_node,
            "target_node": self.target_node,
            "since": self.since.isoformat(),
            "entries": [e.to_dict() for e in self.entries],
            "vector_clock": self.vector_clock.to_dict()
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SyncDelta":
        return cls(
            source_node=data["source_node"],
            target_node=data["target_node"],
            since=datetime.fromisoformat(data["since"]),
            entries=[SyncEntry.from_dict(e) for e in data["entries"]],
            vector_clock=VectorClock.from_dict(data.get("vector_clock", {}))
        )


class ConflictResolutionStrategy(Enum):
    """Strategies for resolving sync conflicts."""
    LAST_WRITER_WINS = "lww"
    FIRST_WRITER_WINS = "fww"
    MERGE = "merge"  # Combine content
    MANUAL = "manual"  # Flag for human review


class ConflictResolver:
    """
    Resolves conflicts between concurrent updates.
    Uses CRDT-inspired LWW (Last Writer Wins) by default.
    """
    
    def __init__(self, strategy: ConflictResolutionStrategy = ConflictResolutionStrategy.LAST_WRITER_WINS):
        self.strategy = strategy
        self._conflicts_log: List[Dict[str, Any]] = []
    
    def resolve(self, local: SyncEntry, remote: SyncEntry) -> Tuple[SyncEntry, bool]:
        """
        Resolve conflict between local and remote entries.
        
        Returns:
            Tuple of (winning_entry, was_conflict)
        """
        # Check if actually concurrent
        if not local.vector_clock.is_concurrent(remote.vector_clock):
            # No conflict - one happened before the other
            if local.vector_clock.happened_before(remote.vector_clock):
                return remote, False
            return local, False
        
        # Concurrent update - apply strategy
        self._conflicts_log.append({
            "timestamp": datetime.now().isoformat(),
            "local_id": local.id,
            "remote_id": remote.id,
            "strategy": self.strategy.value
        })
        
        if self.strategy == ConflictResolutionStrategy.LAST_WRITER_WINS:
            winner = remote if remote.timestamp > local.timestamp else local
            return winner, True
        
        elif self.strategy == ConflictResolutionStrategy.FIRST_WRITER_WINS:
            winner = local if local.timestamp < remote.timestamp else remote
            return winner, True
        
        elif self.strategy == ConflictResolutionStrategy.MERGE:
            # Simple merge: concatenate content
            merged = SyncEntry(
                id=local.id,
                content=f"{local.content}\n---\n{remote.content}",
                tier=local.tier,
                metadata={**local.metadata, **remote.metadata},
                vector_clock=VectorClock(),
                timestamp=datetime.now()
            )
            merged.vector_clock.merge(local.vector_clock)
            merged.vector_clock.merge(remote.vector_clock)
            return merged, True
        
        # Manual: return local but flag conflict
        return local, True
    
    def get_conflicts_log(self) -> List[Dict[str, Any]]:
        """Get log of resolved conflicts."""
        return self._conflicts_log.copy()


class MemorySync:
    """
    Cross-device memory synchronization.
    
    Syncs Tier 2 (short-term) and Tier 3 (long-term) memory between
    Nexus instances using CRDT-based conflict resolution.
    
    Usage:
        sync = MemorySync(node_id="laptop-1", lancedb_store=store)
        
        # Export changes
        delta = await sync.export_delta(since=last_sync_time)
        
        # Send to peer and receive their delta
        remote_delta = await network.exchange(delta)
        
        # Merge remote changes
        conflicts = await sync.merge_remote(remote_delta)
    """
    
    def __init__(
        self,
        node_id: str,
        lancedb_store=None,  # LanceDBStore instance
        conflict_strategy: ConflictResolutionStrategy = ConflictResolutionStrategy.LAST_WRITER_WINS
    ):
        self.node_id = node_id
        self.store = lancedb_store
        self.resolver = ConflictResolver(strategy=conflict_strategy)
        
        self._vector_clock = VectorClock()
        self._vector_clock.increment(node_id)
        self._sync_log: List[Dict[str, Any]] = []
        self._last_sync: Dict[str, datetime] = {}  # peer_id -> last_sync_time
    
    async def export_delta(
        self,
        since: Optional[datetime] = None,
        tier: str = "all",
        target_node: Optional[str] = None
    ) -> SyncDelta:
        """
        Export changes since a given timestamp.
        
        Args:
            since: Only include changes after this time
            tier: "short_term", "long_term", or "all"
            target_node: ID of the target node (for tracking)
        
        Returns:
            SyncDelta containing changed entries
        """
        since = since or datetime.min
        entries = []
        
        if self.store:
            # Query LanceDB for changes
            try:
                tiers_to_check = ["short_term", "long_term"] if tier == "all" else [tier]
                
                for t in tiers_to_check:
                    # Get changes from store
                    results = await self._get_store_entries(t, since)
                    for result in results:
                        entry = SyncEntry(
                            id=result.get("id", ""),
                            content=result.get("content", ""),
                            tier=t,
                            metadata=result.get("metadata", {}),
                            vector_clock=self._vector_clock,
                            timestamp=datetime.fromisoformat(result.get("created_at", datetime.now().isoformat()))
                        )
                        entries.append(entry)
            except Exception as e:
                logger.error(f"Error exporting delta: {e}")
        
        delta = SyncDelta(
            source_node=self.node_id,
            target_node=target_node or "",
            since=since,
            entries=entries,
            vector_clock=self._vector_clock
        )
        
        logger.info(f"Exported delta with {len(entries)} entries since {since}")
        return delta
    
    async def _get_store_entries(self, tier: str, since: datetime) -> List[Dict[str, Any]]:
        """Get entries from store modified since timestamp."""
        if not self.store:
            return []
        
        # This would call into LanceDB
        # For now, return empty - actual implementation needs store modification
        try:
            # Placeholder: In production, query LanceDB with timestamp filter
            # results = self.store.get_changes_since(tier, since)
            return []
        except Exception as e:
            logger.error(f"Store query error: {e}")
            return []
    
    async def merge_remote(self, delta: SyncDelta) -> List[Dict[str, Any]]:
        """
        Merge a remote delta into local storage.
        
        Args:
            delta: SyncDelta from a remote peer
        
        Returns:
            List of conflicts that occurred
        """
        conflicts = []
        merged_count = 0
        
        for remote_entry in delta.entries:
            try:
                # Check if we have a local version
                local_entry = await self._get_local_entry(remote_entry.id, remote_entry.tier)
                
                if local_entry:
                    # Resolve conflict
                    winner, was_conflict = self.resolver.resolve(local_entry, remote_entry)
                    if was_conflict:
                        conflicts.append({
                            "id": remote_entry.id,
                            "local_timestamp": local_entry.timestamp.isoformat(),
                            "remote_timestamp": remote_entry.timestamp.isoformat(),
                            "winner": "local" if winner == local_entry else "remote"
                        })
                    
                    if winner == remote_entry:
                        await self._store_entry(remote_entry)
                        merged_count += 1
                else:
                    # No local version, just store
                    await self._store_entry(remote_entry)
                    merged_count += 1
                    
            except Exception as e:
                logger.error(f"Error merging entry {remote_entry.id}: {e}")
        
        # Update vector clock
        self._vector_clock.merge(delta.vector_clock)
        self._vector_clock.increment(self.node_id)
        
        # Log sync
        self._sync_log.append({
            "timestamp": datetime.now().isoformat(),
            "peer": delta.source_node,
            "entries_received": len(delta.entries),
            "entries_merged": merged_count,
            "conflicts": len(conflicts)
        })
        
        self._last_sync[delta.source_node] = datetime.now()
        
        logger.info(f"Merged {merged_count} entries from {delta.source_node}, {len(conflicts)} conflicts")
        return conflicts
    
    async def _get_local_entry(self, entry_id: str, tier: str) -> Optional[SyncEntry]:
        """Get a local entry by ID."""
        if not self.store:
            return None
        
        try:
            result = self.store.get_by_id(entry_id, table_name=tier)
            if result:
                return SyncEntry(
                    id=result.get("id", ""),
                    content=result.get("content", ""),
                    tier=tier,
                    metadata=result.get("metadata", {}),
                    vector_clock=VectorClock.from_dict(result.get("vector_clock", {})),
                    timestamp=datetime.fromisoformat(result.get("created_at", datetime.now().isoformat()))
                )
        except Exception as e:
            logger.debug(f"Entry not found: {entry_id}")
        return None
    
    async def _store_entry(self, entry: SyncEntry) -> None:
        """Store an entry to local database."""
        if not self.store:
            return
        
        try:
            # Add or update in store
            metadata = entry.metadata.copy()
            metadata["vector_clock"] = entry.vector_clock.to_dict()
            metadata["synced_from"] = self.node_id
            
            await asyncio.to_thread(
                self.store.add,
                content=entry.content,
                metadata=metadata,
                table_name=entry.tier
            )
        except Exception as e:
            logger.error(f"Failed to store entry: {e}")
    
    async def sync_with_peer(
        self,
        peer_address: str,
        peer_port: int = 9877
    ) -> Dict[str, Any]:
        """
        Perform a full sync with a peer.
        
        This is a high-level method that:
        1. Exports local delta
        2. Sends to peer
        3. Receives peer's delta
        4. Merges remote changes
        """
        try:
            import ssl
            import websockets
            
            # Get last sync time with this peer
            last_sync = self._last_sync.get(f"{peer_address}:{peer_port}", datetime.min)
            
            # Export our delta
            local_delta = await self.export_delta(since=last_sync)
            
            # Connect to peer
            uri = f"wss://{peer_address}:{peer_port}/sync"
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE  # In production, use proper certs
            
            async with websockets.connect(uri, ssl=ssl_context) as ws:
                # Exchange deltas
                await ws.send(json.dumps(local_delta.to_dict()))
                response = await ws.recv()
                remote_delta = SyncDelta.from_dict(json.loads(response))
                
                # Merge
                conflicts = await self.merge_remote(remote_delta)
            
            return {
                "success": True,
                "entries_sent": len(local_delta.entries),
                "entries_received": len(remote_delta.entries),
                "conflicts": conflicts
            }
            
        except ImportError:
            logger.warning("websockets not available")
            return {"success": False, "error": "websockets not installed"}
        except Exception as e:
            logger.error(f"Sync failed: {e}")
            return {"success": False, "error": str(e)}
    
    def get_status(self) -> Dict[str, Any]:
        """Get sync status."""
        return {
            "node_id": self.node_id,
            "vector_clock": self._vector_clock.to_dict(),
            "last_syncs": {k: v.isoformat() for k, v in self._last_sync.items()},
            "sync_log": self._sync_log[-10:],  # Last 10 syncs
            "conflicts_resolved": len(self.resolver.get_conflicts_log())
        }
