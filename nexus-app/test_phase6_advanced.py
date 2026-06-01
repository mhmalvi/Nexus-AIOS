"""
Nexus Phase 6 Advanced Tests
Validates Federated Learning networking and NPU accelerator detection.
"""

import pytest
import asyncio
import os
import sys
from datetime import datetime

# Add kernel to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'kernel'))

from hardware.federated_learner import GradientTransport, GradientUpdate, PeerInfo
from hardware.npu_accelerator import NPUAccelerator, AcceleratorType


@pytest.mark.asyncio
class TestFederatedNetworking:
    """Test A2A networking components."""

    async def test_gradient_transport(self):
        received = []
        
        def on_receive(update):
            received.append(update)
            
        # Start transport on localhost
        transport = GradientTransport(port=19876, on_receive=on_receive)
        await transport.start()
        
        try:
            # Create dummy update
            update = GradientUpdate(
                node_id="test-node",
                model_name="test-model",
                timestamp=datetime.now(),
                gradients={"layer1": [0.1, 0.2]},
                metadata={}
            )
            
            # Send to self
            peer = PeerInfo(
                node_id="self",
                address="127.0.0.1",
                port=19876,
                last_seen=datetime.now()
            )
            
            success = await transport.send(peer, update)
            assert success is True
            
            # Wait for processing
            await asyncio.sleep(0.1)
            
            assert len(received) == 1
            assert received[0].node_id == "test-node"
            assert received[0].gradients["layer1"] == [0.1, 0.2]
            
        finally:
            await transport.stop()


@pytest.mark.asyncio
class TestNPUAccelerator:
    """Test NPU/Accelerator logic."""
    
    async def test_detect_backends(self):
        acc = NPUAccelerator()
        backends = acc.detect()
        assert len(backends) > 0
        
        # CPU should always be present
        has_cpu = any(b["type"] == "cpu" for b in backends)
        assert has_cpu

    async def test_cpu_fallback(self):
        """Ensure CPU works even if others missing."""
        acc = NPUAccelerator(preferred_backend="cpu")
        active = acc.get_active_backend()
        assert active is not None
        assert active.type == AcceleratorType.CPU
        
        result = await acc.run_inference("dummy", {"input": []})
        assert result["backend"] == "cpu"
        assert result["status"] == "delegated"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
