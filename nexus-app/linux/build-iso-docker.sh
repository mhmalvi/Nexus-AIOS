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
KERNEL_DIR="/opt/nexus/app/kernel"
if [ ! -d "$V" ]; then
    echo "🔧 Creating Python environment..."
    python -m venv "$V"
    "$V/bin/pip" install -q --upgrade pip
    # Install from requirements.lock.txt if available (full dependency set)
    if [ -f "${KERNEL_DIR}/requirements.lock.txt" ]; then
        echo "📦 Installing from requirements.lock.txt..."
        "$V/bin/pip" install -q -r "${KERNEL_DIR}/requirements.lock.txt"
    elif [ -f "${KERNEL_DIR}/requirements.txt" ]; then
        echo "📦 Installing from requirements.txt..."
        "$V/bin/pip" install -q -r "${KERNEL_DIR}/requirements.txt"
    else
        echo "📦 Installing core dependencies..."
        "$V/bin/pip" install -q aiohttp pydantic psutil python-dotenv PyYAML numpy langchain langchain-ollama lancedb
    fi
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

# Copy systemd service files
echo "   - Installing systemd services..."
SYSTEMD_SRC="${PROJECT_DIR}/linux/systemd"
if [ -d "$SYSTEMD_SRC" ]; then
    for svc in nexus-core.service nexus-kernel.service nexus-kernel.socket nexus-ollama.service; do
        if [ -f "${SYSTEMD_SRC}/${svc}" ]; then
            cp "${SYSTEMD_SRC}/${svc}" "${PROFILE_DIR}/airootfs/etc/systemd/system/${svc}"
        fi
    done
fi

# Create nexus-core wrapper script
cat > "${PROFILE_DIR}/airootfs/opt/nexus/bin/nexus-core" <<'CORE'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app NEXUS_HOME=/opt/nexus NEXUS_DATA=/var/lib/nexus
P="/opt/nexus/.venv/bin/python"
[ ! -f "$P" ] && P="/usr/bin/python3"
exec "$P" /opt/nexus/app/kernel/linux/nexus_orchestrator.py "$@"
CORE
chmod +x "${PROFILE_DIR}/airootfs/opt/nexus/bin/nexus-core"

# Create Sway auto-start config for graphical sessions
mkdir -p "${PROFILE_DIR}/airootfs/etc/sway"
cat > "${PROFILE_DIR}/airootfs/etc/sway/config" <<'SWAY'
# Nexus AIOS - Sway Window Manager Config
set $mod Mod4
output * bg #0a0a0f solid_color
exec /opt/nexus/bin/nexus-core --daemon --port 9600
exec foot
bindsym $mod+Return exec foot
bindsym $mod+d exec foot -e nexus-cli
bindsym $mod+Shift+q kill
bindsym $mod+Shift+e exit
SWAY

# Ollama install script (runs on first boot)
cat > "${PROFILE_DIR}/airootfs/opt/nexus/bin/nexus-install-ollama" <<'OLLAMA'
#!/bin/bash
set -e
if [ ! -f /usr/local/bin/ollama ]; then
    echo "📦 Installing Ollama..."
    curl -fsSL https://ollama.ai/install.sh | sh
    echo "✅ Ollama installed"
else
    echo "✅ Ollama already installed"
fi
# Create model directory
mkdir -p /var/lib/nexus/models
chown -R nexus:nexus /var/lib/nexus/models
OLLAMA
chmod +x "${PROFILE_DIR}/airootfs/opt/nexus/bin/nexus-install-ollama"

# First-boot service — installs Ollama + pulls default model + enables services
cat > "${PROFILE_DIR}/airootfs/etc/systemd/system/nexus-firstboot.service" <<'FIRSTBOOT'
[Unit]
Description=Nexus AIOS First Boot Setup
ConditionPathExists=!/var/lib/nexus/.firstboot-done
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/opt/nexus/bin/nexus-firstboot
TimeoutStartSec=600

[Install]
WantedBy=multi-user.target
FIRSTBOOT

cat > "${PROFILE_DIR}/airootfs/opt/nexus/bin/nexus-firstboot" <<'FB'
#!/bin/bash
set -e
echo "🚀 Nexus AIOS — First Boot Setup"

# 1. Create nexus user if missing
id nexus &>/dev/null || useradd -r -m -d /var/lib/nexus -s /bin/bash nexus

# 2. Setup Python venv
/opt/nexus/bin/nexus-setup

# 3. Install Ollama
/opt/nexus/bin/nexus-install-ollama

# 4. Start Ollama and pull default model
systemctl start nexus-ollama || true
sleep 3
su - nexus -c "ollama pull llama3.2:3b" || echo "⚠️ Model pull failed (will retry on next boot)"

# 5. Enable core services
systemctl enable nexus-ollama nexus-core 2>/dev/null || true

# 6. Mark first boot done
mkdir -p /var/lib/nexus
touch /var/lib/nexus/.firstboot-done
chown -R nexus:nexus /var/lib/nexus

echo "✅ First boot setup complete"
FB
chmod +x "${PROFILE_DIR}/airootfs/opt/nexus/bin/nexus-firstboot"

# Enable first-boot service
mkdir -p "${PROFILE_DIR}/airootfs/etc/systemd/system/multi-user.target.wants"
ln -sf /etc/systemd/system/nexus-firstboot.service "${PROFILE_DIR}/airootfs/etc/systemd/system/multi-user.target.wants/nexus-firstboot.service"

# Branding
echo "Nexus AIOS" > "${PROFILE_DIR}/airootfs/etc/hostname"
cat > "${PROFILE_DIR}/airootfs/etc/motd" <<'MOTD'

  N E X U S   A I O S
  Powered by Arch Linux

  First boot runs automatically:
    - Python venv + dependencies
    - Ollama install + model pull (llama3.2)
    - Service auto-start (nexus-core, nexus-ollama)

  Commands:
    nexus-cli               # Interactive AI terminal
    systemctl status nexus-core  # Check kernel status

  Graphical Session:
    sway                    # Launch Wayland desktop
    http://localhost:9600   # Web UI (after build)

MOTD

# 3. Create Dockerfile
echo "[3/5] Creating Dockerfile..."
cat > Dockerfile.nexus <<'DOCKER'
FROM archlinux:latest

# Install build tools + Python (for venv pre-creation)
RUN pacman -Syu --noconfirm archiso make git python python-pip python-virtualenv

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

# Add python and core packages
echo "python" >> /build/profile/packages.x86_64
echo "python-pip" >> /build/profile/packages.x86_64
echo "python-virtualenv" >> /build/profile/packages.x86_64
echo "git" >> /build/profile/packages.x86_64
echo "fastfetch" >> /build/profile/packages.x86_64
echo "curl" >> /build/profile/packages.x86_64
echo "wget" >> /build/profile/packages.x86_64
echo "htop" >> /build/profile/packages.x86_64

# Tauri runtime dependencies (GTK, WebKit)
echo "webkit2gtk-4.1" >> /build/profile/packages.x86_64
echo "gtk3" >> /build/profile/packages.x86_64
echo "libappindicator-gtk3" >> /build/profile/packages.x86_64
echo "librsvg" >> /build/profile/packages.x86_64
echo "glib2" >> /build/profile/packages.x86_64
echo "cairo" >> /build/profile/packages.x86_64
echo "pango" >> /build/profile/packages.x86_64
echo "gdk-pixbuf2" >> /build/profile/packages.x86_64
echo "libsoup3" >> /build/profile/packages.x86_64
echo "openssl" >> /build/profile/packages.x86_64

# Minimal window manager (Sway for Wayland)
echo "sway" >> /build/profile/packages.x86_64
echo "swaybg" >> /build/profile/packages.x86_64
echo "foot" >> /build/profile/packages.x86_64
echo "xorg-xwayland" >> /build/profile/packages.x86_64
echo "wayland" >> /build/profile/packages.x86_64
echo "mesa" >> /build/profile/packages.x86_64

# GPU drivers (NVIDIA + AMD for LLM acceleration)
echo "nvidia-open" >> /build/profile/packages.x86_64
echo "nvidia-utils" >> /build/profile/packages.x86_64
echo "cuda" >> /build/profile/packages.x86_64
echo "vulkan-radeon" >> /build/profile/packages.x86_64
echo "libva-mesa-driver" >> /build/profile/packages.x86_64
echo "rocm-hip-runtime" >> /build/profile/packages.x86_64

# Audio (for voice features)
echo "pipewire" >> /build/profile/packages.x86_64
echo "pipewire-pulse" >> /build/profile/packages.x86_64
echo "wireplumber" >> /build/profile/packages.x86_64

# Pre-create Python virtual environment with dependencies (offline-ready)
echo "➡️  Pre-creating Python venv with kernel dependencies..."
VENV_DIR="/build/nexus-overlay/airootfs/opt/nexus/.venv"
python -m venv "$VENV_DIR" 2>/dev/null || true
if [ -f "$VENV_DIR/bin/pip" ]; then
    "$VENV_DIR/bin/pip" install -q --upgrade pip 2>/dev/null || true
    KERNEL_DIR="/build/nexus-overlay/airootfs/opt/nexus/app/kernel"
    if [ -f "${KERNEL_DIR}/requirements.lock.txt" ]; then
        "$VENV_DIR/bin/pip" install -q -r "${KERNEL_DIR}/requirements.lock.txt" 2>/dev/null || echo "WARN: Some deps failed (may need network)"
    elif [ -f "${KERNEL_DIR}/requirements.txt" ]; then
        "$VENV_DIR/bin/pip" install -q -r "${KERNEL_DIR}/requirements.txt" 2>/dev/null || echo "WARN: Some deps failed"
    fi
fi

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
