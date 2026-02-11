"""
Nexus Voice Module
Provides voice input/output capabilities via Faster-Whisper STT and Piper TTS
"""

from .voice_pipeline import VoicePipeline, TranscriptionResult
from .wake_word_detector import WakeWordDetector
from .tts_engine import TTSEngine

__all__ = [
    "VoicePipeline",
    "TranscriptionResult", 
    "WakeWordDetector",
    "TTSEngine"
]
