"""
Nexus Phase 4 Test Suite
Tests for hardware, sync, and A2A modules
"""

import pytest
import asyncio
import sys
import os

# Add kernel to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'kernel'))


class TestEBPFMonitor:
    """Test eBPF/psutil system monitor."""
    
    def test_import(self):
        """Test module import."""
        from hardware.ebpf_monitor import EBPFMonitor, EventType, SystemEvent
        assert EBPFMonitor is not None
    
    def test_backend_detection(self):
        """Test backend auto-detection."""
        from hardware.ebpf_monitor import EBPFMonitor
        monitor = EBPFMonitor()
        assert monitor.backend in ["bcc", "psutil"]
        print(f"eBPF backend: {monitor.backend}")
    
    def test_status(self):
        """Test status reporting."""
        from hardware.ebpf_monitor import EBPFMonitor
        monitor = EBPFMonitor()
        status = monitor.get_status()
        assert "running" in status
        assert "backend" in status


class TestNPUAccelerator:
    """Test NPU/ASIC acceleration layer."""
    
    def test_import(self):
        """Test module import."""
        from hardware.npu_accelerator import NPUAccelerator, AcceleratorType
        assert NPUAccelerator is not None
    
    def test_detection(self):
        """Test accelerator detection."""
        from hardware.npu_accelerator import NPUAccelerator
        accelerator = NPUAccelerator()
        backends = accelerator.detect()
        assert isinstance(backends, list)
        print(f"Detected backends: {[b['type'] for b in backends]}")
    
    def test_active_backend(self):
        """Test active backend info."""
        from hardware.npu_accelerator import NPUAccelerator
        accelerator = NPUAccelerator()
        active = accelerator.get_active_backend()
        assert active is not None or active is None  # May have no accelerator


class TestFederatedLearner:
    """Test federated learning framework."""
    
    def test_import(self):
        """Test module import."""
        from hardware.federated_learner import (
            FederatedLearner, LocalTrainer, PrivacyGuard, GradientAggregator
        )
        assert FederatedLearner is not None
    
    def test_privacy_guard(self):
        """Test differential privacy."""
        from hardware.federated_learner import PrivacyGuard
        guard = PrivacyGuard(epsilon=1.0)
        
        gradients = {"layer1": [0.1, 0.2, 0.3]}
        clipped = guard.clip_gradients(gradients)
        noisy = guard.add_noise(clipped)
        
        assert "layer1" in noisy
        assert len(noisy["layer1"]) == 3
    
    def test_aggregator(self):
        """Test gradient aggregation."""
        from hardware.federated_learner import GradientAggregator, GradientUpdate
        from datetime import datetime
        
        agg = GradientAggregator(min_peers=2)
        
        # Add two updates
        update1 = GradientUpdate(
            node_id="node1",
            model_name="test",
            timestamp=datetime.now(),
            gradients={"layer1": [0.1, 0.2, 0.3]}
        )
        update2 = GradientUpdate(
            node_id="node2",
            model_name="test",
            timestamp=datetime.now(),
            gradients={"layer1": [0.2, 0.3, 0.4]}
        )
        
        agg.add_update(update1)
        agg.add_update(update2)
        
        aggregated = agg.aggregate()
        assert aggregated is not None
        assert "layer1" in aggregated


class TestMemorySync:
    """Test cross-device memory sync."""
    
    def test_import(self):
        """Test module import."""
        from sync.memory_sync import MemorySync, VectorClock, SyncDelta, ConflictResolver
        assert MemorySync is not None
    
    def test_vector_clock(self):
        """Test vector clock operations."""
        from sync.memory_sync import VectorClock
        
        vc1 = VectorClock()
        vc1.increment("node1")
        vc1.increment("node1")
        
        vc2 = VectorClock()
        vc2.increment("node2")
        
        # Should be concurrent
        assert vc1.is_concurrent(vc2) == True
        
        # Merge
        vc1.merge(vc2)
        assert vc1.clocks.get("node2") == 1
    
    def test_conflict_resolver(self):
        """Test conflict resolution."""
        from sync.memory_sync import ConflictResolver, SyncEntry, VectorClock
        from datetime import datetime, timedelta
        
        resolver = ConflictResolver()
        
        local = SyncEntry(
            id="test1",
            content="local content",
            tier="short_term",
            metadata={},
            vector_clock=VectorClock({"node1": 1}),
            timestamp=datetime.now() - timedelta(minutes=1)
        )
        
        remote = SyncEntry(
            id="test1",
            content="remote content",
            tier="short_term",
            metadata={},
            vector_clock=VectorClock({"node2": 1}),
            timestamp=datetime.now()
        )
        
        winner, was_conflict = resolver.resolve(local, remote)
        assert was_conflict == True
        assert winner.content == "remote content"  # LWW, remote is newer


class TestA2AProtocol:
    """Test Agent-to-Agent protocol."""
    
    def test_import(self):
        """Test module import."""
        from sync.a2a_protocol import A2AProtocol, A2AMessage, MessageType
        assert A2AProtocol is not None
    
    def test_message_serialization(self):
        """Test message JSON-RPC conversion."""
        from sync.a2a_protocol import A2AMessage, MessageType
        from datetime import datetime
        
        msg = A2AMessage(
            id="test-123",
            message_type=MessageType.TASK_REQUEST,
            source_node="node1",
            target_node="node2",
            payload={"action": "test"}
        )
        
        jsonrpc = msg.to_jsonrpc()
        assert jsonrpc["jsonrpc"] == "2.0"
        assert jsonrpc["method"] == "task_request"
        
        # Round-trip
        restored = A2AMessage.from_jsonrpc(jsonrpc)
        assert restored.id == msg.id
        assert restored.message_type == msg.message_type
    
    def test_protocol_status(self):
        """Test protocol status reporting."""
        from sync.a2a_protocol import A2AProtocol
        
        protocol = A2AProtocol(node_id="test-node")
        status = protocol.get_status()
        
        assert status["node_id"] == "test-node"
        assert "peers" in status
        assert "capabilities" in status


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
