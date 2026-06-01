"""
Nexus TTS Engine - Piper Text-to-Speech Integration
Provides natural-sounding speech synthesis using Piper TTS
"""

import asyncio
import io
import os
from typing import Optional, Callable
from pathlib import Path


class TTSEngine:
    """
    TTS Engine using Piper for high-quality neural speech synthesis
    
    Piper is a fast, local neural TTS engine that produces natural speech.
    
    Usage:
        tts = TTSEngine()
        await tts.initialize()
        await tts.speak("Hello, I'm Nexus!")
    """
    
    # Default voice - en_US-lessac-medium is a good quality US English voice
    DEFAULT_VOICE = "en_US-lessac-medium"
    VOICES_DIR = Path(__file__).parent / "voices"
    
    def __init__(
        self,
        voice: str = DEFAULT_VOICE,
        speed: float = 1.0,
        speaker_id: Optional[int] = None
    ):
        self.voice = voice
        self.speed = speed
        self.speaker_id = speaker_id
        self._piper = None
        self._is_initialized = False
        
    async def initialize(self) -> bool:
        """Initialize the TTS engine"""
        try:
            # Check if piper-tts is installed
            import piper
            
            print(f"🔊 Loading TTS voice: {self.voice}")
            
            # Piper downloads models on first use
            # The voice model will be cached locally
            self._piper = piper
            self._is_initialized = True
            
            print("✅ TTS engine initialized")
            return True
            
        except ImportError:
            print("❌ piper-tts not installed. Install with: pip install piper-tts")
            return False
        except Exception as e:
            print(f"❌ Failed to initialize TTS: {e}")
            return False
    
    async def speak(self, text: str) -> bool:
        """
        Synthesize and play speech
        
        Args:
            text: Text to speak
            
        Returns:
            True if successful
        """
        if not self._is_initialized:
            print("⚠️ TTS not initialized")
            return False
        
        try:
            # Run synthesis in executor to avoid blocking
            loop = asyncio.get_event_loop()
            audio_data = await loop.run_in_executor(
                None,
                self._synthesize,
                text
            )
            
            if audio_data:
                await self._play_audio(audio_data)
                return True
            return False
            
        except Exception as e:
            print(f"❌ TTS synthesis failed: {e}")
            return False
    
    def _synthesize(self, text: str) -> Optional[bytes]:
        """Synthesize text to audio bytes"""
        try:
            import subprocess
            import shutil
            
            # Check if piper binary is available
            piper_path = shutil.which("piper")
            if not piper_path:
                # Try to use piper as a Python module
                return self._synthesize_python(text)
            
            # Use piper CLI
            result = subprocess.run(
                [
                    piper_path,
                    "--model", self.voice,
                    "--output-raw"
                ],
                input=text.encode(),
                capture_output=True
            )
            
            if result.returncode == 0:
                return result.stdout
            else:
                print(f"⚠️ Piper error: {result.stderr.decode()}")
                return None
                
        except Exception as e:
            print(f"❌ Synthesis error: {e}")
            return None
    
    def _synthesize_python(self, text: str) -> Optional[bytes]:
        """Synthesize using piper Python bindings"""
        try:
            from piper import PiperVoice
            
            # Get or create voice model
            voice = PiperVoice.load(self.voice)
            
            # Synthesize to bytes
            audio_buffer = io.BytesIO()
            voice.synthesize(text, audio_buffer)
            
            return audio_buffer.getvalue()
            
        except Exception as e:
            print(f"⚠️ Python synthesis fallback failed: {e}")
            return None
    
    async def _play_audio(self, audio_data: bytes):
        """Play audio data through speakers"""
        try:
            import sounddevice as sd
            import numpy as np
            
            # Piper outputs 16-bit PCM at 22050 Hz by default
            audio = np.frombuffer(audio_data, dtype=np.int16)
            
            # Play audio
            sd.play(audio, samplerate=22050)
            sd.wait()  # Wait for playback to finish
            
        except ImportError:
            print("⚠️ sounddevice not available for audio playback")
            # Could fall back to wave file + system player
        except Exception as e:
            print(f"❌ Audio playback error: {e}")
    
    async def synthesize_to_file(self, text: str, output_path: str) -> bool:
        """
        Synthesize text and save to file
        
        Args:
            text: Text to synthesize
            output_path: Path to save WAV file
            
        Returns:
            True if successful
        """
        try:
            audio_data = await asyncio.get_event_loop().run_in_executor(
                None,
                self._synthesize,
                text
            )
            
            if audio_data:
                import wave
                
                with wave.open(output_path, 'wb') as wav:
                    wav.setnchannels(1)
                    wav.setsampwidth(2)  # 16-bit
                    wav.setframerate(22050)
                    wav.writeframes(audio_data)
                
                return True
            return False
            
        except Exception as e:
            print(f"❌ Failed to save audio: {e}")
            return False
    
    def set_speed(self, speed: float):
        """Set speech speed (0.5 = half speed, 2.0 = double speed)"""
        self.speed = max(0.25, min(4.0, speed))
    
    def set_voice(self, voice: str):
        """Change the voice model"""
        self.voice = voice
    
    @property
    def is_initialized(self) -> bool:
        return self._is_initialized
    
    async def shutdown(self):
        """Clean up resources"""
        self._is_initialized = False
        print("🔌 TTS engine shut down")
    
    # ========== Streaming TTS Feature ==========
    
    async def speak_streaming(
        self,
        text: str,
        on_sentence_start: Optional[Callable[[str], None]] = None
    ) -> bool:
        """
        Speak text with streaming - synthesize and play sentence-by-sentence.
        
        This reduces perceived latency by starting playback while still
        generating the rest of the response.
        
        Args:
            text: Full text to speak
            on_sentence_start: Optional callback when each sentence starts
            
        Returns:
            True if all sentences were spoken successfully
        """
        if not self._is_initialized:
            print("⚠️ TTS not initialized")
            return False
        
        # Split into sentences
        sentences = self._split_sentences(text)
        
        if not sentences:
            return True
        
        success = True
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            
            if on_sentence_start:
                on_sentence_start(sentence)
            
            try:
                # Synthesize this sentence
                loop = asyncio.get_event_loop()
                audio_data = await loop.run_in_executor(
                    None,
                    self._synthesize,
                    sentence
                )
                
                if audio_data:
                    # Play immediately (don't wait for next sentence synthesis)
                    await self._play_audio(audio_data)
                else:
                    success = False
                    
            except Exception as e:
                print(f"⚠️ Streaming TTS error on sentence: {e}")
                success = False
        
        return success
    
    def _split_sentences(self, text: str) -> list:
        """Split text into sentences for streaming TTS"""
        import re
        
        # Split on sentence-ending punctuation followed by space or end
        # Keeps the punctuation with the sentence
        pattern = r'(?<=[.!?])\s+'
        sentences = re.split(pattern, text)
        
        # Filter empty and clean up
        return [s.strip() for s in sentences if s.strip()]
    
    async def speak_with_chunks(
        self,
        text_generator,
        buffer_sentences: int = 1
    ) -> bool:
        """
        Speak from a streaming text generator (e.g., from LLM).
        
        Buffers incoming text until sentence boundaries are detected,
        then synthesizes and plays each sentence.
        
        Args:
            text_generator: Async generator yielding text chunks
            buffer_sentences: Number of complete sentences to buffer before speaking
            
        Returns:
            True if successful
        """
        if not self._is_initialized:
            return False
        
        buffer = ""
        sentences_spoken = 0
        
        async for chunk in text_generator:
            buffer += chunk
            
            # Check for complete sentences in buffer
            sentences = self._split_sentences(buffer)
            
            # If we have at least buffer_sentences complete sentences
            # (last one might be incomplete)
            while len(sentences) > buffer_sentences:
                sentence_to_speak = sentences.pop(0)
                
                # Speak this sentence
                await self.speak(sentence_to_speak)
                sentences_spoken += 1
                
                # Rebuild buffer from remaining sentences
                buffer = " ".join(sentences)
        
        # Speak any remaining text
        if buffer.strip():
            await self.speak(buffer.strip())
        
        return True
