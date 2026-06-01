
import subprocess
import sys
import json
import time
import os

def test_nexus_kernel():
    print("🧪 Starting Nexus Kernel Integration Test...")
    
    # 1. Check Ollama
    try:
        import requests
        resp = requests.get('http://localhost:11434/api/tags')
        if resp.status_code == 200:
            print("✅ Ollama is Online")
            print(f"   Models available: {[m['name'] for m in resp.json()['models']]}")
        else:
            print("❌ Ollama responded with error")
            return
    except Exception as e:
        print(f"❌ Ollama check failed: {e}")
        return

    # 2. Start Kernel Process
    kernel_path = os.path.join("nexus-app", "kernel", "main.py")
    python_exe = os.path.join("nexus-app", "kernel", "venv", "Scripts", "python.exe")
    
    print(f"🚀 Spawning Kernel: {kernel_path}")
    
    process = subprocess.Popen(
        [python_exe, kernel_path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    
    # Wait for initialization
    time.sleep(2)
    
    # 3. Send Query
    query = {
        "id": "TEST-001",
        "message_type": "query",
        "payload": {
            "query": "Hello, are you operational?"
        }
    }
    
    print(f"📤 Sending Query: {json.dumps(query)}")
    process.stdin.write(json.dumps(query) + "\n")
    process.stdin.flush()
    
    # 4. Read Response
    print("⏳ Waiting for response (this may take a few seconds)...")
    
    max_retries = 20
    response_found = False
    
    for _ in range(max_retries):
        line = process.stdout.readline()
        if line:
            try:
                data = json.loads(line)
                if data.get("message_type") == "response":
                    print("\n✅ KERNEL RESPONSE RECEIVED:")
                    print("-" * 50)
                    print(json.dumps(data, indent=2))
                    print("-" * 50)
                    if data.get("success"):
                        print("🎉 TEST PASSED: System is functional.")
                    else:
                        print("⚠️ TEST FAILED: Kernel reported error.")
                    response_found = True
                    break
            except json.JSONDecodeError:
                print(f"   [Raw Output]: {line.strip()}")
        time.sleep(1)
        
    if not response_found:
        print("❌ TEST TIMEOUT: No response received.")
        # Check stderr
        print("\n[Kernel Stderr]:")
        for _ in range(10):
            err = process.stderr.readline()
            if err: print(err.strip())
            
    # Cleanup
    process.terminate()


def test_voice_pipeline():
    """Test voice pipeline initialization (optional)"""
    print("\n🎤 Testing Voice Pipeline...")
    
    try:
        # Add kernel to path
        import sys
        sys.path.insert(0, os.path.join("nexus-app", "kernel"))
        
        from voice import VoicePipeline
        
        pipeline = VoicePipeline(whisper_model="base.en", device="cpu")
        print("✅ VoicePipeline instantiated")
        
        # Test that it's not initialized yet
        assert not pipeline.is_initialized, "Pipeline should not be initialized yet"
        print("✅ VoicePipeline state is correct")
        
        # Note: Full initialization requires model download
        # We just test instantiation here
        print("🎉 Voice Pipeline test passed (basic instantiation)")
        return True
        
    except ImportError as e:
        print(f"⚠️ Voice dependencies not installed: {e}")
        print("   Install with: pip install faster-whisper openwakeword piper-tts sounddevice")
        return False
    except Exception as e:
        print(f"❌ Voice pipeline test failed: {e}")
        return False


if __name__ == "__main__":
    test_nexus_kernel()
    test_voice_pipeline()
