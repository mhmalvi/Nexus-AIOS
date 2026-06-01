
import sounddevice as sd
import numpy as np
import time

print("🎤 Testing Microphone Input...")
print(f"Devices:\n{sd.query_devices()}")

duration = 5  # seconds
fs = 16000

print(f"\nRecording for {duration} seconds...")
recording = sd.rec(int(duration * fs), samplerate=fs, channels=1, dtype='float32')
sd.wait()

print("Finished recording.")
max_amp = np.max(np.abs(recording))
print(f"Max Amplitude: {max_amp}")

if max_amp < 0.01:
    print("❌ Volume too low! Is the mic muted or not working?")
else:
    print("✅ Audio detected!")
