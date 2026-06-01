"""
AETHER Voice Module
Provides voice input/output and ambient listening capabilities.

Components:
- VoicePipeline: Faster-Whisper STT integration
- TTSEngine: Piper neural text-to-speech
- WakeWordDetector: OpenWakeWord wake phrase detection
- VoiceOrchestrator: High-level ambient voice controller
"""

from .voice_pipeline import VoicePipeline, TranscriptionResult
from .wake_word_detector import WakeWordDetector
from .tts_engine import TTSEngine
from .orchestrator import VoiceOrchestrator, VoiceMode, VoiceState, VoiceEvent

__all__ = [
    "VoicePipeline",
    "TranscriptionResult",
    "WakeWordDetector",
    "TTSEngine",
    "VoiceOrchestrator",
    "VoiceMode",
    "VoiceState",
    "VoiceEvent",
]
