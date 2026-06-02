"""
Shared audio-device serialization for the voice subsystem.

PortAudio (driven through the `sounddevice` module-global API: ``sd.rec`` /
``sd.play`` / ``sd.wait``) is NOT safe for overlapping capture + playback from
concurrent asyncio tasks. On Windows/WASAPI an overlap segfaults the whole
Python process (observed as "Kernel stdout stream closed" → crash-restart loop).

Every mic-capture path (VoicePipeline.start_listening) and every playback path
(TTSEngine._play_audio) acquires this single process-wide lock, making audio I/O
strictly half-duplex — the microphone is never open while TTS is speaking, and
two captures can never run at once.
"""

import asyncio
from typing import Optional

_audio_lock: Optional[asyncio.Lock] = None


def get_audio_lock() -> asyncio.Lock:
    """Return the process-wide audio I/O lock (created lazily on first use)."""
    global _audio_lock
    if _audio_lock is None:
        _audio_lock = asyncio.Lock()
    return _audio_lock
