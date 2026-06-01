
import sounddevice as sd
import numpy as np
import time

print("🔍 Scanning Audio Devices for Signal...")

devices = sd.query_devices()
input_devices = [i for i, d in enumerate(devices) if d['max_input_channels'] > 0]

duration = 0.5
fs = 16000

for idx in input_devices:
    name = devices[idx]['name']
    print(f"\nTesting Device {idx}: {name}")
    try:
        recording = sd.rec(int(duration * fs), samplerate=fs, channels=1, dtype='float32', device=idx)
        sd.wait()
        
        amplitude = np.max(np.abs(recording))
        print(f"  Max Amplitude: {amplitude:.6f}")
        
        if amplitude > 0.01:
            print("  ✅ SIGNAL DETECTED!")
        else:
            print("  ❌ No signal")
            
    except Exception as e:
        print(f"  ⚠️ Error: {e}")

