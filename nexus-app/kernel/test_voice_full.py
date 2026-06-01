
import sys
import os
import asyncio

# Ensure we can import from the kernel directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    print("Checking imports...")
    import sounddevice as sd
    print("✅ sounddevice imported")
    
    import faster_whisper
    print(f"✅ faster_whisper imported (v{faster_whisper.__version__ if hasattr(faster_whisper, '__version__') else '?'})")
    
    import openwakeword
    print("✅ openwakeword imported")
    
    try:
        import piper
        print("✅ piper-tts imported")
    except ImportError:
        print("⚠️ piper-tts NOT found (optional but recommended)")

    
    from voice import VoicePipeline
    print("✅ VoicePipeline class imported")

except ImportError as e:
    print(f"❌ Import failed: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Unexpected error during import: {e}")
    sys.exit(1)

async def test_pipeline():
    print("\nInstantiating VoicePipeline...")
    try:
        pipeline = VoicePipeline(whisper_model="tiny.en", device="cpu") # Use tiny/cpu for quick test
        print("✅ Pipeline instantiated")
        
        print("Initializing pipeline (this might download models)...")
        # specific initialization test
        success = await pipeline.initialize()
        if success:
            print("✅ Pipeline initialized successfully")
        else:
            print("❌ Pipeline initialization returned False")
            
    except Exception as e:
        print(f"❌ Pipeline test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_pipeline())
