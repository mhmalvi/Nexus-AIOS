"""
Nexus Wake Word Detector - OpenWakeWord Integration
Detects the wake phrase "Hey Nexus" to activate voice input
"""

import asyncio
import threading
from typing import Optional, Callable
import numpy as np


class WakeWordDetector:
    """
    Wake Word Detector using OpenWakeWord
    
    Listens for the wake phrase "Hey Nexus" and triggers a callback
    when detected.
    
    Usage:
        detector = WakeWordDetector()
        await detector.initialize()
        
        # Option 1: Blocking wait
        detected = await detector.wait_for_wake_word(timeout=30)
        
        # Option 2: Callback-based
        detector.set_callback(on_wake_word)
        await detector.start_continuous_detection()
    """
    
    WAKE_WORD = "hey_jarvis"  # OpenWakeWord model closest to "Hey Nexus"
    SAMPLE_RATE = 16000
    CHUNK_SIZE = 1280  # ~80ms of audio at 16kHz
    THRESHOLD = 0.5  # Detection confidence threshold
    
    def __init__(self, threshold: float = THRESHOLD, device_index: Optional[int] = None):
        self.threshold = threshold
        self.device_index = device_index
        self._model = None
        self._is_running = False
        self._stop_event = threading.Event()
        self._detection_callback: Optional[Callable[[], None]] = None
        self._detected_event = asyncio.Event()

    async def initialize(self) -> bool:
        """Initialize the wake word detection model"""
        try:
            import openwakeword
            from openwakeword.model import Model
            
            print("🔊 Loading wake word model...")
            
            # Download models if needed
            openwakeword.utils.download_models()
            
            # Load the model (hey_jarvis is similar to "Hey Nexus")
            self._model = Model(
                wakeword_models=[self.WAKE_WORD],
                inference_framework="onnx"
            )
            
            print(f"✅ Wake word model loaded: {self.WAKE_WORD}")
            return True
            
        except ImportError as e:
            print(f"❌ OpenWakeWord not installed: {e}")
            print("   Install with: pip install openwakeword")
            return False
        except Exception as e:
            print(f"❌ Failed to initialize wake word detector: {e}")
            return False
    
    def set_callback(self, callback: Callable[[], None]):
        """Set the callback to be called when wake word is detected"""
        self._detection_callback = callback
    
    async def wait_for_wake_word(self, timeout: float = None) -> bool:
        """
        Wait for the wake word to be detected
        
        Args:
            timeout: Maximum time to wait in seconds (None for indefinite)
            
        Returns:
            True if wake word was detected, False if timeout
        """
        if self._model is None:
            print("⚠️ Wake word detector not initialized")
            return False
        
        self._detected_event.clear()
        
        # Start detection in background
        detection_task = asyncio.create_task(self._detect_loop())
        
        try:
            if timeout:
                await asyncio.wait_for(self._detected_event.wait(), timeout=timeout)
            else:
                await self._detected_event.wait()
            return True
        except asyncio.TimeoutError:
            return False
        finally:
            self.stop()
            try:
                await detection_task
            except:
                pass

    async def _detect_loop(self):
        """Background detection loop"""
        try:
            import sounddevice as sd
        except ImportError:
            print("❌ sounddevice required for wake word detection")
            return
        
        self._is_running = True
        self._stop_event.clear()
        
        def audio_callback(indata, frames, time, status):
            if status:
                print(f"⚠️ Audio status: {status}")
            if not self._stop_event.is_set():
                # Process audio chunk
                audio = indata[:, 0] if indata.ndim > 1 else indata
                self._process_audio(audio.flatten())
        
        try:
            with sd.InputStream(
                samplerate=self.SAMPLE_RATE,
                channels=1,
                dtype='int16',
                blocksize=self.CHUNK_SIZE,
                callback=audio_callback,
                device=self.device_index
            ):
                while not self._stop_event.is_set():
                    await asyncio.sleep(0.05)
        finally:
            self._is_running = False
    
    def _process_audio(self, audio: np.ndarray):
        """Process audio chunk and check for wake word"""
        if self._model is None:
            return
        
        # OpenWakeWord expects int16 audio
        if audio.dtype != np.int16:
            audio = (audio * 32767).astype(np.int16)
        
        # Get predictions
        predictions = self._model.predict(audio)
        
        # Check each wake word model
        for wakeword, confidence in predictions.items():
            if confidence >= self.threshold:
                print(f"🔔 Wake word detected! ({wakeword}: {confidence:.2f})")
                self._detected_event.set()
                
                if self._detection_callback:
                    self._detection_callback()
                    
                # Reset the model to avoid repeated detections
                self._model.reset()
                break
    
    async def start_continuous_detection(self):
        """Start continuous wake word detection with callbacks"""
        if self._model is None:
            raise RuntimeError("Wake word detector not initialized")
        
        print("👂 Starting continuous wake word detection...")
        # Run in background task so we don't block the kernel main loop
        asyncio.create_task(self._detect_loop())
    
    def stop(self):
        """Stop detection"""
        self._stop_event.set()
    
    @property
    def is_running(self) -> bool:
        return self._is_running
    
    async def shutdown(self):
        """Clean up resources"""
        self.stop()
        await asyncio.sleep(0.1)  # Allow cleanup
        print("🔌 Wake word detector shut down")
