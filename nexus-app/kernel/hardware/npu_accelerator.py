"""
Nexus NPU/ASIC Acceleration Layer
Unified API for hardware-accelerated inference.

Supported backends:
- NVIDIA CUDA/TensorRT
- Intel OpenVINO (for Intel NPU/iGPU)
- CPU fallback (with optimizations)
"""

import logging
import os
from typing import Dict, Any, List, Optional, Union
from dataclasses import dataclass
from enum import Enum
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class AcceleratorType(Enum):
    """Available accelerator backends."""
    CUDA = "cuda"
    TENSORRT = "tensorrt"
    OPENVINO = "openvino"
    CPU = "cpu"
    NONE = "none"


@dataclass
class AcceleratorInfo:
    """Information about a detected accelerator."""
    type: AcceleratorType
    name: str
    memory_mb: int
    compute_capability: Optional[str] = None
    available: bool = True
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type.value,
            "name": self.name,
            "memory_mb": self.memory_mb,
            "compute_capability": self.compute_capability,
            "available": self.available
        }


class BaseAccelerator(ABC):
    """Abstract base for accelerator backends."""
    
    @abstractmethod
    def is_available(self) -> bool:
        """Check if this accelerator is available."""
        pass
    
    @abstractmethod
    def get_info(self) -> AcceleratorInfo:
        """Get accelerator information."""
        pass
    
    @abstractmethod
    async def run_inference(
        self,
        model_path: str,
        inputs: Dict[str, Any],
        **kwargs
    ) -> Dict[str, Any]:
        """Run inference on the accelerator."""
        pass


class CUDAAccelerator(BaseAccelerator):
    """NVIDIA CUDA acceleration backend."""
    
    def __init__(self):
        self._torch = None
        self._device_info: Optional[AcceleratorInfo] = None
    
    def is_available(self) -> bool:
        try:
            import torch
            self._torch = torch
            return torch.cuda.is_available()
        except ImportError:
            return False
    
    def get_info(self) -> AcceleratorInfo:
        if self._device_info:
            return self._device_info
        
        if not self.is_available():
            return AcceleratorInfo(
                type=AcceleratorType.NONE,
                name="N/A",
                memory_mb=0,
                available=False
            )
        
        import torch
        device_name = torch.cuda.get_device_name(0)
        memory_mb = torch.cuda.get_device_properties(0).total_memory // (1024 * 1024)
        capability = torch.cuda.get_device_capability(0)
        
        self._device_info = AcceleratorInfo(
            type=AcceleratorType.CUDA,
            name=device_name,
            memory_mb=memory_mb,
            compute_capability=f"{capability[0]}.{capability[1]}",
            available=True
        )
        return self._device_info
    
    async def run_inference(
        self,
        model_path: str,
        inputs: Dict[str, Any],
        **kwargs
    ) -> Dict[str, Any]:
        """Run inference using PyTorch CUDA."""
        import torch
        
        # For Ollama-served models, we delegate to Ollama
        # This is a placeholder for custom model loading
        logger.info(f"CUDA inference requested for {model_path}")
        
        return {
            "status": "delegated",
            "backend": "cuda",
            "message": "Ollama handles GPU acceleration automatically"
        }


class OpenVINOAccelerator(BaseAccelerator):
    """Intel OpenVINO acceleration backend for NPU/iGPU."""
    
    def __init__(self):
        self._ov = None
        self._core = None
        self._device_info: Optional[AcceleratorInfo] = None
    
    def is_available(self) -> bool:
        try:
            import openvino as ov
            self._ov = ov
            self._core = ov.Core()
            # Check for NPU or GPU device
            devices = self._core.available_devices
            return "NPU" in devices or "GPU" in devices
        except ImportError:
            return False
        except Exception as e:
            logger.debug(f"OpenVINO not available: {e}")
            return False
    
    def get_info(self) -> AcceleratorInfo:
        if self._device_info:
            return self._device_info
        
        if not self.is_available():
            return AcceleratorInfo(
                type=AcceleratorType.NONE,
                name="N/A",
                memory_mb=0,
                available=False
            )
        
        devices = self._core.available_devices
        preferred = "NPU" if "NPU" in devices else ("GPU" if "GPU" in devices else "CPU")
        
        self._device_info = AcceleratorInfo(
            type=AcceleratorType.OPENVINO,
            name=f"Intel {preferred}",
            memory_mb=0,  # OpenVINO doesn't expose this easily
            available=True
        )
        return self._device_info
    
    async def run_inference(
        self,
        model_path: str,
        inputs: Dict[str, Any],
        **kwargs
    ) -> Dict[str, Any]:
        """Run inference using OpenVINO."""
        if not self._core:
            return {"error": "OpenVINO not initialized"}
        
        try:
            # Load and compile model
            model = self._core.read_model(model_path)
            devices = self._core.available_devices
            device = "NPU" if "NPU" in devices else ("GPU" if "GPU" in devices else "CPU")
            compiled = self._core.compile_model(model, device)
            
            # Run inference
            result = compiled(inputs)
            
            return {
                "status": "success",
                "backend": "openvino",
                "device": device,
                "output": result
            }
        except Exception as e:
            logger.error(f"OpenVINO inference error: {e}")
            return {"error": str(e)}


class CPUAccelerator(BaseAccelerator):
    """Optimized CPU fallback backend."""
    
    def __init__(self):
        self._device_info: Optional[AcceleratorInfo] = None
    
    def is_available(self) -> bool:
        return True  # CPU is always available
    
    def get_info(self) -> AcceleratorInfo:
        if self._device_info:
            return self._device_info
        
        import platform
        import psutil
        
        self._device_info = AcceleratorInfo(
            type=AcceleratorType.CPU,
            name=platform.processor() or "Unknown CPU",
            memory_mb=psutil.virtual_memory().total // (1024 * 1024),
            available=True
        )
        return self._device_info
    
    async def run_inference(
        self,
        model_path: str,
        inputs: Dict[str, Any],
        **kwargs
    ) -> Dict[str, Any]:
        """Run inference on CPU (delegates to Ollama)."""
        return {
            "status": "delegated",
            "backend": "cpu",
            "message": "Ollama handles CPU inference automatically"
        }


class NPUAccelerator:
    """
    Unified NPU/ASIC Acceleration API.
    
    Automatically detects available accelerators and provides
    a single interface for hardware-accelerated inference.
    
    Usage:
        accelerator = NPUAccelerator()
        info = accelerator.detect()
        result = await accelerator.run_inference(model, inputs)
    """
    
    def __init__(self, preferred_backend: Optional[str] = None):
        """
        Initialize the accelerator.
        
        Args:
            preferred_backend: Force a specific backend (cuda, openvino, cpu)
        """
        self.preferred_backend = preferred_backend
        self._backends: Dict[AcceleratorType, BaseAccelerator] = {}
        self._active_backend: Optional[BaseAccelerator] = None
        
        # Initialize backends
        self._init_backends()
    
    def _init_backends(self) -> None:
        """Initialize all available backends."""
        # Order matters - preference order
        backend_classes = [
            (AcceleratorType.CUDA, CUDAAccelerator),
            (AcceleratorType.OPENVINO, OpenVINOAccelerator),
            (AcceleratorType.CPU, CPUAccelerator),
        ]
        
        for acc_type, acc_class in backend_classes:
            try:
                backend = acc_class()
                if backend.is_available():
                    self._backends[acc_type] = backend
                    if self._active_backend is None:
                        self._active_backend = backend
            except Exception as e:
                logger.debug(f"Failed to init {acc_type}: {e}")
        
        # Override with preferred backend if specified
        if self.preferred_backend:
            try:
                pref_type = AcceleratorType(self.preferred_backend)
                if pref_type in self._backends:
                    self._active_backend = self._backends[pref_type]
            except ValueError:
                logger.warning(f"Unknown backend: {self.preferred_backend}")
    
    def detect(self) -> List[Dict[str, Any]]:
        """Detect all available accelerators."""
        return [
            backend.get_info().to_dict()
            for backend in self._backends.values()
        ]
    
    def get_active_backend(self) -> Optional[AcceleratorInfo]:
        """Get information about the active backend."""
        if self._active_backend:
            return self._active_backend.get_info()
        return None
    
    def set_backend(self, backend_type: str) -> bool:
        """
        Switch to a specific backend.
        
        Args:
            backend_type: One of 'cuda', 'openvino', 'cpu'
        
        Returns:
            True if switch was successful
        """
        try:
            acc_type = AcceleratorType(backend_type)
            if acc_type in self._backends:
                self._active_backend = self._backends[acc_type]
                logger.info(f"Switched to {backend_type} backend")
                return True
        except ValueError:
            pass
        return False
    
    async def run_inference(
        self,
        model_path: str,
        inputs: Dict[str, Any],
        **kwargs
    ) -> Dict[str, Any]:
        """
        Run inference on the active accelerator.
        
        For Ollama-served models, this delegates to Ollama.
        For custom ONNX/OpenVINO models, runs directly.
        """
        if not self._active_backend:
            return {"error": "No accelerator available"}
        
        return await self._active_backend.run_inference(
            model_path, inputs, **kwargs
        )
    
    def get_status(self) -> Dict[str, Any]:
        """Get accelerator status."""
        active = self._active_backend.get_info() if self._active_backend else None
        return {
            "active_backend": active.to_dict() if active else None,
            "available_backends": list(b.value for b in self._backends.keys()),
            "preferred": self.preferred_backend
        }
    
    async def benchmark(self, iterations: int = 10) -> Dict[str, float]:
        """
        Run a simple benchmark across available backends.
        
        Returns dict of backend -> ops/second
        """
        import time
        results = {}
        
        for acc_type, backend in self._backends.items():
            try:
                start = time.perf_counter()
                for _ in range(iterations):
                    # Simple matrix multiplication benchmark
                    if acc_type == AcceleratorType.CUDA:
                        import torch
                        a = torch.randn(1000, 1000, device='cuda')
                        b = torch.randn(1000, 1000, device='cuda')
                        c = torch.mm(a, b)
                        torch.cuda.synchronize()
                    else:
                        import numpy as np
                        a = np.random.randn(1000, 1000)
                        b = np.random.randn(1000, 1000)
                        c = np.dot(a, b)
                
                elapsed = time.perf_counter() - start
                results[acc_type.value] = iterations / elapsed
            except Exception as e:
                logger.debug(f"Benchmark failed for {acc_type}: {e}")
                results[acc_type.value] = 0.0
        
        return results
