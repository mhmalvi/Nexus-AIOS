#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Nexus AIOS — Official ISO Builder (Docker Version) - v2
#  
#  This uses the official 'mkarchiso' tool inside an Arch Linux
#  Docker container to build a pristine, bootable ISO.
# ═══════════════════════════════════════════════════════════════
set -e

PROJECT_DIR=$(pwd)
OUTPUT_DIR="${PROJECT_DIR}/out"
WORK_DIR="${PROJECT_DIR}/work"
PROFILE_DIR="${PROJECT_DIR}/nexus-profile"

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║   🧠 Nexus AIOS — Docker ISO Builder v2      ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# 1. Cleanup previous runs
echo "[1/5] Cleaning up specific work directories..."
echo "   - Removing $WORK_DIR"
rm -rf "$WORK_DIR" 2>/dev/null || true
echo "   - Removing $PROFILE_DIR"
rm -rf "$PROFILE_DIR" 2>/dev/null || true
mkdir -p "$OUTPUT_DIR"

# 2. Extract Nexus Kernel Payload
echo "[2/5] Preparing Nexus payload..."
mkdir -p "$PROFILE_DIR"

# Create the structure for our custom files
echo "   - Creating directories..."
mkdir -p "${PROFILE_DIR}/airootfs/opt/nexus/app"
mkdir -p "${PROFILE_DIR}/airootfs/opt/nexus/bin"
mkdir -p "${PROFILE_DIR}/airootfs/var/lib/nexus"
mkdir -p "${PROFILE_DIR}/airootfs/etc/systemd/system"
mkdir -p "${PROFILE_DIR}/airootfs/usr/local/bin"

# Copy Kernel
echo "   - Copying Kernel (using tar for speed)..."
mkdir -p "${PROFILE_DIR}/airootfs/opt/nexus/app/kernel"
tar -cf - -C "${PROJECT_DIR}/nexus-app/kernel" . | tar -xf - -C "${PROFILE_DIR}/airootfs/opt/nexus/app/kernel"

# Clean artifacts
echo "   - Cleaning artifacts..."
find "${PROFILE_DIR}/airootfs/opt/nexus/app/kernel" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find "${PROFILE_DIR}/airootfs/opt/nexus/app/kernel" -name "*.pyc" -delete 2>/dev/null || true
rm -rf "${PROFILE_DIR}/airootfs/opt/nexus/app/kernel/venv" 2>/dev/null || true

# Create Setup Scripts (same logic as before, but baked into airootfs)
echo "   - Creating setup scripts..."
cat > "${PROFILE_DIR}/airootfs/opt/nexus/bin/nexus-setup" <<'EOF'
#!/bin/bash
set -e
V="/opt/nexus/.venv"
if [ ! -d "$V" ]; then
    echo "🔧 Creating Python environment..."
    python -m venv "$V"
    "$V/bin/pip" install -q --upgrade pip
    "$V/bin/pip" install -q aiohttp pydantic psutil python-dotenv PyYAML numpy
    echo "✅ Python environment ready"
else
    echo "✅ Environment exists"
fi
EOF
chmod +x "${PROFILE_DIR}/airootfs/opt/nexus/bin/nexus-setup"

cat > "${PROFILE_DIR}/airootfs/opt/nexus/bin/nexus-cli" <<'EOF'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app NEXUS_HOME=/opt/nexus
P="/opt/nexus/.venv/bin/python"
[ ! -f "$P" ] && P="/usr/bin/python"
exec "$P" /opt/nexus/app/kernel/linux/nexus_orchestrator.py --no-api "$@"
EOF
chmod +x "${PROFILE_DIR}/airootfs/opt/nexus/bin/nexus-cli"

# Symlinks
ln -sf /opt/nexus/bin/nexus-setup "${PROFILE_DIR}/airootfs/usr/local/bin/nexus-setup"
ln -sf /opt/nexus/bin/nexus-cli "${PROFILE_DIR}/airootfs/usr/local/bin/nexus-cli"

# Branding
echo "Nexus AIOS" > "${PROFILE_DIR}/airootfs/etc/hostname"
cat > "${PROFILE_DIR}/airootfs/etc/motd" <<'MOTD'

  🧠  N E X U S   A I O S
  Powered by Arch Linux

  Run: nexus-setup
  Run: nexus-cli

MOTD

# 3. Create Dockerfile
echo "[3/5] Creating Dockerfile..."
cat > Dockerfile.nexus <<'DOCKER'
FROM archlinux:latest

# Install build tools
RUN pacman -Syu --noconfirm archiso make git

# Configuration
WORKDIR /build
CMD ["bash", "/build/build-internal.sh"]
DOCKER

# 4. Create Internal Build Script
cat > build-internal.sh <<'INTERNAL'
#!/bin/bash
set -e
echo "➡️  Inside Docker: Setting up profile..."

# Copy standard releng profile
cp -r /usr/share/archiso/configs/releng/* /build/profile/

# overlay our files
cp -r /build/nexus-overlay/airootfs/* /build/profile/airootfs/

# Add python to packages
echo "python" >> /build/profile/packages.x86_64
echo "python-pip" >> /build/profile/packages.x86_64
echo "python-virtualenv" >> /build/profile/packages.x86_64
echo "git" >> /build/profile/packages.x86_64
echo "neofetch" >> /build/profile/packages.x86_64

# Build it
echo "➡️  Starting mkarchiso..."
mkarchiso -v -w /build/work -o /build/out /build/profile
INTERNAL
chmod +x build-internal.sh

# 5. Run Build
echo "[4/5] Building Docker builder image..."
docker build -t nexus-builder -f Dockerfile.nexus .

echo "[5/5] Running mkarchiso (this will take time - downloading packages)..."
# Privileged is required for loop mounting inside the container
docker run --privileged --rm \
    -v "${OUTPUT_DIR}:/build/out" \
    -v "${WORK_DIR}:/build/work" \
    -v "${PROFILE_DIR}:/build/nexus-overlay" \
    -v "${PROJECT_DIR}/build-internal.sh:/build/build-internal.sh" \
    -v "${PROJECT_DIR}/nexus-profile:/build/profile" \
    nexus-builder

echo "✅ Done!"
ls -lh "${OUTPUT_DIR}"
