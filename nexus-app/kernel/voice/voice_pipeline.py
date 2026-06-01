"""
Nexus Voice Pipeline - Faster-Whisper STT Integration
Provides speech-to-text transcription using the Faster-Whisper library
"""

import asyncio
import queue
import sys
import threading
from typing import Optional, Callable, Any
from dataclasses import dataclass
import numpy as np

# Lazy imports for optional voice dependencies
_whisper_model = None
_sounddevice = None


@dataclass
class TranscriptionResult:
    """Result of a transcription operation"""
    text: str
    language: str
    confidence: float
    duration: float
    is_final: bool


class VoicePipeline:
    """
    Voice Pipeline - Handles STT, TTS, and wake word detection
    
    Components:
    - Faster-Whisper for speech-to-text
    - Piper TTS for text-to-speech
    - OpenWakeWord for wake word detection
    
    Usage:
        pipeline = VoicePipeline()
        await pipeline.initialize()
        
        # Listen for voice input
        result = await pipeline.listen_and_transcribe()
        
        # Generate speech output
        await pipeline.speak("Hello, how can I help you?")
    """
    
    DEFAULT_WHISPER_MODEL = "base.en"  # Options: tiny, base, small, medium, large-v3
    DEFAULT_SAMPLE_RATE = 16000
    DEFAULT_CHANNELS = 1
    
    def __init__(
        self,
        whisper_model: str = DEFAULT_WHISPER_MODEL,
        device: str = "auto",  # "cpu", "cuda", or "auto"
        compute_type: str = "int8",  # "float16", "int8", or "float32"
        sample_rate: int = DEFAULT_SAMPLE_RATE,
    ):
        self.whisper_model_name = whisper_model
        self.device = device
        self.compute_type = compute_type
        self.sample_rate = sample_rate
        
        self.device_index = None  # Explicit audio device index
        self._whisper_model = None
        self._tts_engine = None
        self._wake_word_detector = None
        
        self._is_listening = False
        self._audio_queue: queue.Queue = queue.Queue()
        self._stop_event = threading.Event()
        
        self._on_transcription: Optional[Callable[[TranscriptionResult], Any]] = None
        self._on_wake_word: Optional[Callable[[], Any]] = None
        
    async def initialize(self) -> bool:
        """Initialize the voice pipeline components"""
        try:
            # Import and initialize Faster-Whisper
            from faster_whisper import WhisperModel
            
            device = self.device
            if device == "auto":
                try:
                    import torch
                    device = "cuda" if torch.cuda.is_available() else "cpu"
                except ImportError:
                    print("⚠️ Torch not found, defaulting to CPU")
                    device = "cpu"
            
            print(f"🎤 Loading Whisper model '{self.whisper_model_name}' on {device}...")
            self._whisper_model = WhisperModel(
                self.whisper_model_name,
                device=device,
                compute_type=self.compute_type
            )
            print("✅ Whisper model loaded")
            
            # Try to initialize TTS (optional)
            try:
                from .tts_engine import TTSEngine
                self._tts_engine = TTSEngine()
                await self._tts_engine.initialize()
                print("✅ TTS engine initialized")
            except Exception as e:
                print(f"⚠️ TTS not available: {e}")
                
            # Try to initialize wake word detector (optional)
            try:
                from .wake_word_detector import WakeWordDetector
                
                # Auto-select best microphone
                self.device_index = self._find_active_microphone()
                if self.device_index is not None:
                     print(f"🎤 Using Microphone Device Index: {self.device_index}")
                
                self._wake_word_detector = WakeWordDetector(device_index=self.device_index)
                await self._wake_word_detector.initialize()
                print("✅ Wake word detector initialized")
            except Exception as e:
                print(f"⚠️ Wake word detection not available: {e}")
            
            return True
            
        except ImportError as e:
            print(f"❌ Voice dependencies not installed: {e}")
            print("   Install with: pip install faster-whisper openwakeword piper-tts sounddevice")
            return False
        except Exception as e:
            print(f"❌ Failed to initialize voice pipeline: {e}")
            return False
    
    
    def _find_active_microphone(self) -> Optional[int]:
        """Find the audio device with the strongest signal or priority name"""
        try:
            import sounddevice as sd
            print("🔍 Scanning for active microphone...")
            devices = sd.query_devices()
            
            # 1. Prioritize known high-quality devices by name
            priority_names = ["pd400", "fifine", "podcast", "blue", "yeti", "rode", "shure"]
            
            # Find all input devices
            candidates = [i for i, d in enumerate(devices) if d['max_input_channels'] > 0]
            
            # First pass: Look for priority devices
            for idx in candidates:
                name = devices[idx]['name'].lower()
                if any(p in name for p in priority_names):
                     print(f"🎤 Found priority device: {devices[idx]['name']} (Index {idx})")
                     return idx
            
            # 2. If no priority device, scan for signal
            best_device = None
            max_amp = 0.0
            
            for idx in candidates:
                try:
                    # Quick check for signal (0.2s)
                    rec = sd.rec(int(0.2 * 16000), samplerate=16000, channels=1, dtype='float32', device=idx)
                    sd.wait()
                    amp = np.max(np.abs(rec))
                    if amp > max_amp:
                        max_amp = amp
                        best_device = idx
                except:
                    continue
            
            # Lower threshold for detection
            if best_device is not None: 
                # Even a weak signal is better than nothing if it's the only one
                return best_device
            
            # Fallback to defaults
            return None
        except Exception as e:
            print(f"⚠️ Microphone scan failed: {e}")
            return None

    def set_transcription_callback(self, callback: Callable[[TranscriptionResult], Any]):
        """Set callback for when transcription is complete"""
        self._on_transcription = callback
        
    def set_wake_word_callback(self, callback: Callable[[], Any]):
        """Set callback for when wake word is detected"""
        self._on_wake_word = callback
    
    async def transcribe(self, audio_data: np.ndarray) -> TranscriptionResult:
        """Transcribe audio data to text"""
        if self._whisper_model is None:
            raise RuntimeError("Voice pipeline not initialized. Call initialize() first.")
        
        # Run transcription in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            self._transcribe_sync,
            audio_data
        )
        return result
    
    def _transcribe_sync(self, audio_data: np.ndarray) -> TranscriptionResult:
        """Synchronous transcription (runs in executor)"""
        # Ensure audio is float32 normalized to [-1, 1]
        if audio_data.dtype != np.float32:
            audio_data = audio_data.astype(np.float32)
        if audio_data.max() > 1.0 or audio_data.min() < -1.0:
            audio_data = audio_data / 32768.0  # Normalize from int16 range
        
        segments, info = self._whisper_model.transcribe(
            audio_data,
            beam_size=5,
            language="en",
            vad_filter=True,  # Filter out non-speech
        )
        
        # Collect all segment text
        full_text = ""
        total_confidence = 0.0
        segment_count = 0
        
        for segment in segments:
            full_text += segment.text
            total_confidence += segment.avg_logprob
            segment_count += 1
        
        avg_confidence = total_confidence / max(segment_count, 1)
        
        return TranscriptionResult(
            text=full_text.strip(),
            language=info.language,
            confidence=avg_confidence,
            duration=info.duration,
            is_final=True
        )

    async def start_listening(self, duration: float = 5.0) -> Optional[TranscriptionResult]:
        """
        Start listening for audio input and return transcription
        
        Args:
            duration: Maximum duration to listen in seconds
            
        Returns:
            TranscriptionResult if speech detected, None otherwise
        """
        try:
            import sounddevice as sd
        except ImportError:
            print("❌ sounddevice not installed. Install with: pip install sounddevice")
            return None
        
        self._is_listening = True
        self._stop_event.clear()
        
        # Record audio
        print(f"🎤 Listening for {duration} seconds on device {self.device_index}...")
        
        try:
            try:
                audio_data = sd.rec(
                    int(duration * self.sample_rate),
                    samplerate=self.sample_rate,
                    channels=1,
                    dtype='float32',
                    device=self.device_index
                )
                sd.wait()  # Wait until recording is finished
            except Exception as e:
                # Common PortAudio overflow error
                if "input overflow" in str(e).lower():
                    print("⚠️ Audio input overflow (ignoring)", file=sys.stderr)
                    return None
                raise e
            
            # Flatten to 1D
            audio_data = audio_data.flatten()
            
            # Check audio stats for debugging
            max_amp = np.max(np.abs(audio_data))
            print(f"🎤 Audio captured. Max Amp: {max_amp:.6f}", file=sys.stderr)
            
            # --- AUDIO NORMALIZATION ---
            # If audio is quiet but not silent, boost it
            if 0.001 < max_amp < 0.5:
                # Target peak around 0.8
                gain = 0.8 / max_amp
                # Cap gain to avoid massive noise implosion (max 50x)
                gain = min(gain, 50.0)
                print(f"🔊 Boosting audio by {gain:.2f}x", file=sys.stderr)
                audio_data = audio_data * gain
            
            # Transcribe
            result = await self.transcribe(audio_data)
            
            if self._on_transcription:
                self._on_transcription(result)
            
            return result
            
        finally:
            self._is_listening = False
    
    def stop_listening(self):
        """Stop the current listening session"""
        self._stop_event.set()
        self._is_listening = False
    
    async def speak(self, text: str) -> bool:
        """
        Convert text to speech and play it
        
        Args:
            text: Text to speak
            
        Returns:
            True if successful, False otherwise
        """
        if self._tts_engine is None:
            print("⚠️ TTS engine not available")
            return False
            
        try:
            await self._tts_engine.speak(text)
            return True
        except Exception as e:
            print(f"❌ TTS failed: {e}")
            return False
    
    @property
    def is_listening(self) -> bool:
        """Check if currently listening"""
        return self._is_listening
    
    @property
    def is_initialized(self) -> bool:
        """Check if pipeline is initialized"""
        return self._whisper_model is not None
    
    async def wait_for_wake_word(self, timeout: float = None) -> bool:
        """
        Wait for wake word to be detected
        
        Args:
            timeout: Maximum time to wait (None for indefinite)
            
        Returns:
            True if wake word detected, False if timeout
        """
        if self._wake_word_detector is None:
            print("⚠️ Wake word detector not available")
            return False
            
        return await self._wake_word_detector.wait_for_wake_word(timeout)
    
    async def listen_with_wake_word(self, listen_duration: float = 5.0) -> Optional[TranscriptionResult]:
        """
        Wait for wake word, then listen and transcribe
        
        Args:
            listen_duration: How long to listen after wake word
            
        Returns:
            TranscriptionResult or None
        """
        print("👂 Waiting for wake word 'Hey Nexus'...")
        
        detected = await self.wait_for_wake_word(timeout=30.0)
        
        if detected:
            print("🔔 Wake word detected!")
            if self._on_wake_word:
                self._on_wake_word()
            return await self.start_listening(duration=listen_duration)
        
        return None
    
    async def shutdown(self):
        """Clean up resources"""
        self.stop_listening()
        
        if self._wake_word_detector:
            await self._wake_word_detector.shutdown()
            
        if self._tts_engine:
            await self._tts_engine.shutdown()
        
        print("🔌 Voice pipeline shut down")
    
    # ========== Streaming Voice Features ==========
    
    async def speak_streaming(self, text: str) -> bool:
        """
        Speak with streaming - reduces latency by playing sentence-by-sentence.
        
        Instead of waiting for the entire response to be synthesized,
        this plays each sentence as soon as it's ready.
        
        Args:
            text: Full text to speak
            
        Returns:
            True if successful
        """
        if self._tts_engine is None:
            print("⚠️ TTS engine not available")
            return False
        
        if hasattr(self._tts_engine, 'speak_streaming'):
            return await self._tts_engine.speak_streaming(text)
        else:
            # Fallback to regular speak
            return await self.speak(text)
    
    async def speak_with_llm_stream(self, brain, prompt: str) -> bool:
        """
        Speak LLM response as it streams - minimal latency.
        
        Streams tokens from the LLM, buffers until sentence boundaries,
        and speaks each sentence immediately.
        
        Args:
            brain: Brain instance with stream_generate method
            prompt: Prompt to send to LLM
            
        Returns:
            True if successful
        """
        if self._tts_engine is None:
            print("⚠️ TTS engine not available")
            return False
        
        if hasattr(self._tts_engine, 'speak_with_chunks'):
            # Use the LLM's streaming generator
            async def llm_generator():
                async for chunk in brain.stream_generate(prompt):
                    yield chunk
            
            return await self._tts_engine.speak_with_chunks(llm_generator())
        else:
            # Fallback: generate full response then speak
            response = await brain.generate(prompt)
            return await self.speak(response)
