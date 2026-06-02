"""
Nexus Wake Word Detector - OpenWakeWord Integration
Detects the wake phrase "Hey Nexus" to activate voice input
"""

import asyncio
import queue
import sys
import threading
import time
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
        loop = asyncio.get_running_loop()

        # Hand audio from PortAudio's real-time thread to a worker. The callback
        # MUST stay cheap: doing ML inference inside it stalls the audio thread
        # (constant "input overflow") and a stall/raise there can take the whole
        # process down with no Python traceback. So we only copy + enqueue here.
        audio_q: "queue.Queue" = queue.Queue(maxsize=50)
        overflow = {"count": 0, "last_log": 0.0}

        def audio_callback(indata, frames, time_info, status):
            if status:
                # Don't print from the audio thread on every block — just tally.
                overflow["count"] += 1
            if self._stop_event.is_set():
                return
            try:
                mono = indata[:, 0] if indata.ndim > 1 else indata
                # COPY: PortAudio reuses `indata`'s buffer after the callback returns.
                audio_q.put_nowait(np.array(mono, copy=True).flatten())
            except queue.Full:
                pass  # drop under backpressure rather than block the RT thread
            except Exception:
                pass  # never let an exception escape into the native callback

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
                    try:
                        chunk = audio_q.get_nowait()
                    except queue.Empty:
                        await asyncio.sleep(0.02)
                        continue
                    # Run inference OFF the event loop and the audio thread; a
                    # model error must not kill the stream or the kernel.
                    try:
                        await loop.run_in_executor(None, self._process_audio, chunk)
                    except Exception as e:
                        print(f"⚠️ Wake word processing error (recovered): {e}", file=sys.stderr)
                    # Throttled overflow summary (at most once per 10s).
                    now = time.time()
                    if overflow["count"] and now - overflow["last_log"] > 10:
                        print(f"⚠️ Audio input overflowed {overflow['count']}x in last interval", file=sys.stderr)
                        overflow["count"] = 0
                        overflow["last_log"] = now
        except Exception as e:
            print(f"⚠️ Wake word audio stream error (detection stopped): {e}", file=sys.stderr)
        finally:
            self._is_running = False

    def _process_audio(self, audio: np.ndarray):
        """Process audio chunk and check for wake word. Runs in a worker thread;
        must swallow its own errors so the audio stream/kernel stay alive."""
        if self._model is None:
            return
        try:
            # OpenWakeWord expects int16 audio
            if audio.dtype != np.int16:
                audio = (audio * 32767).astype(np.int16)

            predictions = self._model.predict(audio)

            for wakeword, confidence in predictions.items():
                if confidence >= self.threshold:
                    print(f"🔔 Wake word detected! ({wakeword}: {confidence:.2f})")
                    self._detected_event.set()

                    if self._detection_callback:
                        try:
                            self._detection_callback()
                        except Exception as e:
                            print(f"⚠️ Wake word callback error: {e}", file=sys.stderr)

                    # Reset the model to avoid repeated detections
                    self._model.reset()
                    break
        except Exception as e:
            print(f"⚠️ Wake word inference error (recovered): {e}", file=sys.stderr)
    
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
