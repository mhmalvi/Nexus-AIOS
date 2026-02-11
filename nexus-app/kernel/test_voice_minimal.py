
import sounddevice as sd
import numpy as np
import time

def test_mic():
    print("Testing Microphone Access...")
    try:
        # Query devices
        devices = sd.query_devices()
        print(f"Found {len(devices)} devices")
        
        # Find default input
        default_input = sd.query_devices(kind='input')
        print(f"Default Input: {default_input['name']}")
        
        # Record 3 seconds
        fs = 16000
        seconds = 3
        print(f"Recording {seconds} seconds...")
        
        myrecording = sd.rec(int(seconds * fs), samplerate=fs, channels=1)
        sd.wait()  # Wait until recording is finished
        
        print("Recording finished")
        
        # Analyze
        max_val = np.max(np.abs(myrecording))
        print(f"Max Amplitude: {max_val:.4f}")
        
        if max_val > 0.001:
            print("✅ Signal detected!")
        else:
            print("⚠️ No signal detected (too quiet or muted)")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_mic()
