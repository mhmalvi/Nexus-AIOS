"""
Nexus Build Script
Automates the build process for the Python kernel using PyInstaller.
"""

import os
import subprocess
import shutil
import sys
from pathlib import Path

def print_step(step):
    print(f"\n{'='*40}")
    print(f"🏗️  {step}")
    print(f"{'='*40}")

def check_requirements():
    print_step("Checking Build Requirements")
    
    try:
        import PyInstaller
        print(f"✅ PyInstaller found: {PyInstaller.__version__}")
    except ImportError:
        print("❌ PyInstaller not found. Installing...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    # List of critical libraries to verify
    critical_libs = ["faster_whisper", "openwakeword", "psutil", "lancedb"]
    for lib in critical_libs:
        try:
            __import__(lib)
            print(f"✅ {lib} found")
        except ImportError:
            print(f"⚠️  {lib} NOT found - build might fail or be incomplete")

def clean_build():
    print_step("Cleaning Previous Build")
    
    dirs_to_remove = ["build", "dist"]
    for d in dirs_to_remove:
        path = Path(d)
        if path.exists():
            print(f"🗑️  Removing {d}...")
            shutil.rmtree(path)
    print("✅ Clean complete")

def build_kernel():
    print_step("Building Nexus Kernel")
    
    spec_file = "nexus_kernel.spec"
    if not Path(spec_file).exists():
        print(f"❌ Spec file {spec_file} not found!")
        return False
        
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--clean",
        spec_file
    ]
    
    print(f"🚀 Running: {' '.join(cmd)}")
    result = subprocess.run(cmd)
    
    if result.returncode == 0:
        print("✅ Build successful!")
        return True
    else:
        print("❌ Build failed")
        return False

def verify_build():
    print_step("Verifying Build")
    
    dist_dir = Path("dist/nexus-kernel")
    exe_name = "nexus-kernel.exe" if os.name == 'nt' else "nexus-kernel"
    exe_path = dist_dir / exe_name
    
    if exe_path.exists():
        print(f"✅ Executable found: {exe_path}")
        print(f"📦 Size: {exe_path.stat().st_size / 1024 / 1024:.2f} MB")
        return True
    else:
        print(f"❌ Executable missing at: {exe_path}")
        return False

def main():
    # Ensure we are in the kernel directory
    script_dir = Path(__file__).parent.absolute()
    os.chdir(script_dir)
    print(f"📂 Working directory: {os.getcwd()}")
    
    check_requirements()
    clean_build()
    
    if build_kernel():
        verify_build()
        print("\n🎉 Nexus Kernel Build Complete! Output in /dist/nexus-kernel")
    else:
        print("\n💥 Build Failed.")
        sys.exit(1)

if __name__ == "__main__":
    main()
