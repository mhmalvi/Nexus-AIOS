
import sys
import os
import requests
import json
import subprocess
from datetime import datetime

def check_dependencies():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 🔍 Starting Diagnostic Check...")
    
    # 1. Check Python Version
    print(f"\n📊 System Info:")
    print(f"   Python: {sys.version.split()[0]} ({sys.executable})")
    print(f"   Platform: {sys.platform}")
    
    # 2. Check Ollama
    print(f"\n🧠 Checking AI Brain (Ollama):")
    try:
        response = requests.get("http://localhost:11434")
        if response.status_code == 200:
            print("   ✅ Ollama Service: RUNNING")
            
            # Check models
            try:
                tags = requests.get("http://localhost:11434/api/tags").json()
                models = [m['name'] for m in tags.get('models', [])]
                print(f"   ✅ Available Models: {', '.join(models)}")
                
                if not any('llama3.2' in m for m in models):
                     print("   ⚠️  WARNING: 'llama3.2' model missing! Run: ollama pull llama3.2")
            except:
                print("   ⚠️  Could not list models")
        else:
             print(f"   ❌ Ollama Service: Status {response.status_code}")
    except Exception as e:
        print(f"   ❌ Ollama Service: UNREACHABLE ({str(e)})")
        print("   👉 Fix: Run 'ollama serve' in a separate terminal")

    # 3. Check Venv
    print(f"\n📦 Checking Environment:")
    if sys.prefix == sys.base_prefix:
        print("   ⚠️  Not running in a virtual environment")
    else:
        print(f"   ✅ Virtual Environment: ACTIVE ({sys.prefix})")
        
    # 4. Check Kernel Files
    print(f"\n📂 Checking Kernel Integrity:")
    base_dir = os.path.dirname(os.path.abspath(__file__))
    required = ['main.py', 'brain', 'memory', 'agents']
    
    for item in required:
        path = os.path.join(base_dir, item)
        if os.path.exists(path):
             print(f"   ✅ Found {item}")
        else:
             print(f"   ❌ MISSING {item}")

    print("\n🏁 Diagnostic Complete.")

if __name__ == "__main__":
    check_dependencies()
