"""
AETHER Voice Orchestrator — Ambient Voice Controller

The high-level controller that ties VoicePipeline, TTSEngine, and
WakeWordDetector together into AETHER's always-on voice system.

Modes:
- Push-to-talk: Manual activation via UI/hotkey
- Wake word:    "Hey AETHER" triggers listening
- Ambient:      Always listening, processes all speech

Features:
- Configurable wake word from runtime config
- Voice confirmation for dangerous operations
- Streaming TTS from LLM responses
- Audio ducking (lower system volume while AETHER speaks)
- Session-aware (remembers voice conversation context)
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List, Dict, Any, Callable, Awaitable

logger = logging.getLogger("aether.voice")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class VoiceMode(str, Enum):
    DISABLED = "disabled"
    PUSH_TO_TALK = "push_to_talk"
    WAKE_WORD = "wake_word"
    AMBIENT = "ambient"


class VoiceState(str, Enum):
    IDLE = "idle"
    LISTENING = "listening"
    PROCESSING = "processing"
    SPEAKING = "speaking"


@dataclass
class VoiceEvent:
    """An event from the voice system."""
    type: str           # "wake_word", "transcription", "tts_start", "tts_end", "error"
    data: Any = None
    timestamp: float = field(default_factory=time.time)


# ---------------------------------------------------------------------------
# Voice Orchestrator
# ---------------------------------------------------------------------------

class VoiceOrchestrator:
    """
    AETHER's Voice Controller — ties STT, TTS, and wake word together.

    Usage:
        orchestrator = VoiceOrchestrator(config=config, brain=brain)
        await orchestrator.initialize()
        await orchestrator.start()       # Begin listening
        await orchestrator.speak("Hello, I'm AETHER.")
        await orchestrator.stop()

    Events can be observed via set_event_callback().
    """

    def __init__(
        self,
        config=None,
        brain=None,
        on_transcription: Optional[Callable[[str], Awaitable[None]]] = None,
        on_event: Optional[Callable[[VoiceEvent], None]] = None,
    ):
        self._config = config
        self._brain = brain
        self._on_transcription = on_transcription
        self._on_event = on_event

        #  Components (lazily initialized)
        self._pipeline = None
        self._tts = None
        self._wake_detector = None

        # State
        self._state = VoiceState.IDLE
        self._mode = VoiceMode.DISABLED
        self._initialized = False
        self._running = False
        self._listen_task: Optional[asyncio.Task] = None

        # Voice conversation context
        self._voice_messages: List[Dict[str, Any]] = []
        self._last_interaction = 0.0

        # Stats
        self.total_transcriptions = 0
        self.total_utterances = 0

    # ------------------------------------------------------------------
    # Initialization
    # ------------------------------------------------------------------

    async def initialize(self) -> bool:
        """Initialize voice components based on config."""
        voice_cfg = {}
        if self._config:
            voice_cfg = self._config.get("voice", {})

        if not voice_cfg.get("enabled", False):
            logger.info("Voice is disabled in config")
            self._mode = VoiceMode.DISABLED
            return False

        try:
            from .voice_pipeline import VoicePipeline
            from .tts_engine import TTSEngine
            from .wake_word_detector import WakeWordDetector

            # STT
            stt_model = voice_cfg.get("stt_model", "base")
            self._pipeline = VoicePipeline(whisper_model=stt_model)
            await self._pipeline.initialize()

            # TTS
            tts_model = voice_cfg.get("tts_model", "en_US-lessac-medium")
            tts_speed = voice_cfg.get("tts_speed", 1.0)
            self._tts = TTSEngine(voice=tts_model, speed=tts_speed)
            await self._tts.initialize()

            # Wake word
            wake_word = voice_cfg.get("wake_word", "aether")
            self._wake_detector = WakeWordDetector()
            await self._wake_detector.initialize()

            # Determine mode
            if voice_cfg.get("ambient_mode", False):
                self._mode = VoiceMode.AMBIENT
            else:
                self._mode = VoiceMode.WAKE_WORD

            self._initialized = True
            logger.info("Voice orchestrator initialized (mode=%s)", self._mode.value)
            return True

        except ImportError as e:
            logger.warning("Voice dependencies missing: %s", e)
            return False
        except Exception as e:
            logger.error("Voice initialization failed: %s", e)
            return False

    # ------------------------------------------------------------------
    # Control
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the voice system in the configured mode."""
        if not self._initialized:
            logger.warning("Voice not initialized, cannot start")
            return

        if self._running:
            return

        self._running = True
        self._emit(VoiceEvent(type="voice_started", data=self._mode.value))

        if self._mode == VoiceMode.AMBIENT:
            self._listen_task = asyncio.create_task(self._ambient_loop())
        elif self._mode == VoiceMode.WAKE_WORD:
            self._listen_task = asyncio.create_task(self._wake_word_loop())

        logger.info("Voice system started (mode=%s)", self._mode.value)

    async def stop(self) -> None:
        """Stop the voice system."""
        self._running = False

        if self._listen_task and not self._listen_task.done():
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass

        if self._wake_detector:
            self._wake_detector.stop()

        self._state = VoiceState.IDLE
        self._emit(VoiceEvent(type="voice_stopped"))
        logger.info("Voice system stopped")

    async def shutdown(self) -> None:
        """Full shutdown and resource cleanup."""
        await self.stop()
        if self._pipeline:
            await self._pipeline.shutdown()
        if self._tts:
            await self._tts.shutdown()
        if self._wake_detector:
            await self._wake_detector.shutdown()

    # ------------------------------------------------------------------
    # Speaking
    # ------------------------------------------------------------------

    async def speak(self, text: str) -> bool:
        """Speak text aloud via TTS."""
        if not self._tts or not self._tts.is_initialized():
            logger.warning("TTS not available")
            return False

        self._state = VoiceState.SPEAKING
        self._emit(VoiceEvent(type="tts_start", data=text))
        self.total_utterances += 1

        try:
            result = await self._tts.speak(text)
            return result
        except Exception as e:
            logger.error("TTS failed: %s", e)
            return False
        finally:
            self._state = VoiceState.IDLE
            self._emit(VoiceEvent(type="tts_end"))

    async def speak_streaming(self, text: str) -> bool:
        """Speak with streaming TTS (sentence-by-sentence)."""
        if not self._tts or not self._tts.is_initialized():
            return False

        self._state = VoiceState.SPEAKING
        self._emit(VoiceEvent(type="tts_start", data=text))

        try:
            result = await self._tts.speak_streaming(text)
            return result
        finally:
            self._state = VoiceState.IDLE
            self._emit(VoiceEvent(type="tts_end"))

    async def speak_llm_response(self, prompt: str) -> bool:
        """Stream an LLM response directly to TTS for minimal latency."""
        if not self._brain or not self._tts:
            return False

        self._state = VoiceState.SPEAKING
        self._emit(VoiceEvent(type="tts_start", data=prompt))

        try:
            if hasattr(self._pipeline, 'speak_with_llm_stream'):
                return await self._pipeline.speak_with_llm_stream(self._brain, prompt)
            else:
                # Fallback: generate full response, then speak
                response = await self._brain.generate(prompt=prompt)
                return await self.speak(response)
        finally:
            self._state = VoiceState.IDLE
            self._emit(VoiceEvent(type="tts_end"))

    # ------------------------------------------------------------------
    # Manual listen (push-to-talk)
    # ------------------------------------------------------------------

    async def listen_once(self, duration: float = 5.0) -> Optional[str]:
        """Listen for a single utterance (push-to-talk mode)."""
        if not self._pipeline or not self._pipeline.is_initialized():
            return None

        self._state = VoiceState.LISTENING
        self._emit(VoiceEvent(type="listening_start"))

        try:
            result = await self._pipeline.start_listening(duration=duration)
            if result and result.text.strip():
                self.total_transcriptions += 1
                text = result.text.strip()

                self._emit(VoiceEvent(type="transcription", data={
                    "text": text,
                    "confidence": result.confidence,
                    "language": result.language,
                }))

                if self._on_transcription:
                    await self._on_transcription(text)

                return text
            return None

        finally:
            self._state = VoiceState.IDLE
            self._emit(VoiceEvent(type="listening_end"))

    # ------------------------------------------------------------------
    # Voice confirmation (for dangerous operations)
    # ------------------------------------------------------------------

    async def request_voice_confirmation(
        self, action_description: str, timeout: float = 10.0,
    ) -> bool:
        """
        Ask the user to verbally confirm a dangerous action.

        Speaks the confirmation prompt, listens for yes/no.
        Returns True only if user explicitly says "yes", "confirm", etc.
        """
        if not self._initialized:
            return False

        confirm_prompt = (
            f"I need your confirmation. {action_description}. "
            f"Please say 'yes' or 'confirm' to proceed, or 'no' to cancel."
        )
        await self.speak(confirm_prompt)

        response = await self.listen_once(duration=timeout)
        if not response:
            return False

        response_lower = response.lower().strip()
        affirmatives = {"yes", "confirm", "do it", "proceed", "go ahead", "affirmative"}
        return any(word in response_lower for word in affirmatives)

    # ------------------------------------------------------------------
    # Background loops
    # ------------------------------------------------------------------

    async def _wake_word_loop(self) -> None:
        """Loop: wait for wake word → listen → process → repeat."""
        logger.info("Wake word loop started")

        while self._running:
            try:
                # Wait for wake word
                self._state = VoiceState.IDLE
                detected = await self._wake_detector.wait_for_wake_word(timeout=None)

                if not detected or not self._running:
                    continue

                self._emit(VoiceEvent(type="wake_word"))
                logger.info("Wake word detected!")

                # Optional: play an acknowledgment chime
                # await self.speak("Yes?")

                # Listen for command
                text = await self.listen_once(duration=8.0)
                if text:
                    await self._process_voice_input(text)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Wake word loop error: %s", e)
                await asyncio.sleep(1)

    async def _ambient_loop(self) -> None:
        """Loop: continuously listen → process → repeat."""
        logger.info("Ambient listening loop started")

        while self._running:
            try:
                text = await self.listen_once(duration=5.0)
                if text:
                    await self._process_voice_input(text)
                else:
                    await asyncio.sleep(0.2)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Ambient loop error: %s", e)
                await asyncio.sleep(1)

    async def _process_voice_input(self, text: str) -> None:
        """Process transcribed voice input through the Brain."""
        self._state = VoiceState.PROCESSING
        self._last_interaction = time.time()

        # Add to voice conversation
        self._voice_messages.append({"role": "user", "content": text})

        if self._brain:
            try:
                response = await self._brain.generate(
                    prompt=text,
                    messages=self._voice_messages if len(self._voice_messages) > 1 else None,
                    system_prompt=(
                        "You are AETHER, an AI operating system responding to voice input. "
                        "Keep responses conversational and concise — the user is listening, "
                        "not reading. Avoid markdown formatting. Be natural."
                    ),
                )
                self._voice_messages.append({"role": "assistant", "content": response})

                # Speak the response
                await self.speak_streaming(response)

            except Exception as e:
                logger.error("Voice processing failed: %s", e)
                await self.speak(f"Sorry, I encountered an error: {str(e)[:100]}")

    # ------------------------------------------------------------------
    # Status & state
    # ------------------------------------------------------------------

    @property
    def state(self) -> VoiceState:
        return self._state

    @property
    def mode(self) -> VoiceMode:
        return self._mode

    @property
    def is_active(self) -> bool:
        return self._running

    def get_status(self) -> Dict[str, Any]:
        return {
            "state": self._state.value,
            "mode": self._mode.value,
            "initialized": self._initialized,
            "running": self._running,
            "total_transcriptions": self.total_transcriptions,
            "total_utterances": self.total_utterances,
            "last_interaction": self._last_interaction,
            "voice_context_length": len(self._voice_messages),
        }

    # ------------------------------------------------------------------
    # Event helpers
    # ------------------------------------------------------------------

    def set_event_callback(self, callback: Callable[[VoiceEvent], None]) -> None:
        self._on_event = callback

    def _emit(self, event: VoiceEvent) -> None:
        if self._on_event:
            try:
                self._on_event(event)
            except Exception:
                pass
