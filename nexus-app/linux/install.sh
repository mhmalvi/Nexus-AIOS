#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  Nexus AIOS — Arch Linux Installer v2.0
#
#  This script installs Nexus AIOS on an existing Arch Linux system.
#  For the live ISO experience, use build-iso.sh instead.
#
#  Supports: Arch Linux, Manjaro, EndeavourOS, Artix, Garuda
#
#  What this installs:
#    - Python kernel (AI reasoning engine)
#    - Linux orchestrator (REST API + process supervisor)
#    - Ollama (local LLM runtime)
#    - Systemd services for auto-start
#    - D-Bus interface for IPC
# ═══════════════════════════════════════════════════════════════════

set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

NEXUS_HOME="/opt/nexus"
NEXUS_DATA="/var/lib/nexus"
NEXUS_LOG="/var/log/nexus"
NEXUS_VENV="${NEXUS_HOME}/.venv"
NEXUS_USER="nexus"
NEXUS_VERSION="1.0.0"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BOLD}${GREEN}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║  🧠 Nexus AIOS Installer — Arch Linux        ║"
echo "  ║     Hybrid AI Operating System v${NEXUS_VERSION}        ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Check root ──────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Please run as root: sudo bash install.sh${NC}"
  exit 1
fi

# ─── Detect distro ───────────────────────────────────────────────
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo -e "${CYAN}📋 Detected: ${BOLD}${NAME} ${VERSION_ID:-rolling}${NC}"
else
    echo -e "${YELLOW}⚠️ Cannot detect OS, proceeding assuming Arch-based${NC}"
fi

# Detect package manager
if command -v pacman &>/dev/null; then
    PKG_MGR="pacman"
elif command -v apt-get &>/dev/null; then
    PKG_MGR="apt"
elif command -v dnf &>/dev/null; then
    PKG_MGR="dnf"
else
    echo -e "${RED}❌ No supported package manager found${NC}"
    exit 1
fi

echo -e "   Package manager: ${PKG_MGR}"

# ─── Step 1: Create nexus user ──────────────────────────────────
echo -e "\n${YELLOW}[1/8] Creating nexus system user...${NC}"
if id "${NEXUS_USER}" &>/dev/null; then
    echo "   User '${NEXUS_USER}' already exists"
else
    useradd -r -m -d ${NEXUS_HOME} -s /bin/bash -G wheel,video,render ${NEXUS_USER} 2>/dev/null || \
    useradd -r -m -d ${NEXUS_HOME} -s /bin/bash ${NEXUS_USER}
    echo "nexus:nexus" | chpasswd
    echo "   ✅ User '${NEXUS_USER}' created (password: nexus)"
fi

# ─── Step 2: System Dependencies ─────────────────────────────────
echo -e "\n${YELLOW}[2/8] Installing system dependencies...${NC}"

case "$PKG_MGR" in
    pacman)
        pacman -Syu --noconfirm --needed \
            python python-pip python-virtualenv \
            base-devel git curl wget \
            openssl sqlite portaudio \
            dbus openssh net-tools htop neofetch \
            2>/dev/null
        
        # Optional: GUI deps (for building Tauri)
        pacman -S --noconfirm --needed \
            webkit2gtk-4.1 gtk3 libappindicator-gtk3 librsvg \
            2>/dev/null || echo "   ⚠️ GUI deps skipped (headless mode OK)"
        ;;
    apt)
        apt-get update -qq
        apt-get install -y -qq \
            python3 python3-pip python3-venv python3-dev \
            build-essential git curl wget \
            libssl-dev libsqlite3-dev portaudio19-dev \
            openssh-server net-tools htop neofetch \
            2>/dev/null
        apt-get install -y -qq \
            libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
            2>/dev/null || echo "   ⚠️ GUI deps skipped"
        ;;
    dnf)
        dnf install -y -q \
            python3 python3-pip python3-devel \
            gcc gcc-c++ make git curl wget \
            openssl-devel sqlite-devel portaudio-devel \
            openssh-server net-tools htop neofetch \
            2>/dev/null
        ;;
esac

echo "   ✅ System dependencies installed"

# ─── Step 3: Install Ollama ──────────────────────────────────────
echo -e "\n${YELLOW}[3/8] Checking Ollama LLM runtime...${NC}"
if ! command -v ollama &>/dev/null; then
    echo "   Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    echo "   ✅ Ollama installed"
else
    echo "   ✅ Ollama already installed"
fi

# ─── Step 4: Setup Directories ───────────────────────────────────
echo -e "\n${YELLOW}[4/8] Setting up directory structure...${NC}"

mkdir -p ${NEXUS_HOME}/{app,bin,data}
mkdir -p ${NEXUS_DATA}/{lancedb,config,models}
mkdir -p ${NEXUS_LOG}

echo "   ✅ Directories created"

# ─── Step 5: Python Virtual Environment ──────────────────────────
echo -e "\n${YELLOW}[5/8] Setting up Python environment...${NC}"

if [ ! -d "${NEXUS_VENV}" ]; then
    echo "   Creating virtual environment..."
    python -m venv ${NEXUS_VENV} 2>/dev/null || python3 -m venv ${NEXUS_VENV}
fi

# Use pinned deps if available
if [ -f "${SCRIPT_DIR}/../kernel/requirements.lock.txt" ]; then
    echo "   Installing pinned dependencies..."
    ${NEXUS_VENV}/bin/pip install --quiet --upgrade pip
    ${NEXUS_VENV}/bin/pip install --quiet -r "${SCRIPT_DIR}/../kernel/requirements.lock.txt"
elif [ -f "${SCRIPT_DIR}/../kernel/requirements.txt" ]; then
    echo "   Installing dependencies..."
    ${NEXUS_VENV}/bin/pip install --quiet --upgrade pip
    ${NEXUS_VENV}/bin/pip install --quiet -r "${SCRIPT_DIR}/../kernel/requirements.txt"
else
    echo "   Installing core dependencies..."
    ${NEXUS_VENV}/bin/pip install --quiet --upgrade pip
    ${NEXUS_VENV}/bin/pip install --quiet \
        langchain langchain-ollama lancedb aiohttp beautifulsoup4 \
        psutil pydantic python-dotenv PyYAML numpy
fi
echo "   ✅ Python environment ready"

# ─── Step 6: Deploy Application Code ─────────────────────────────
echo -e "\n${YELLOW}[6/8] Deploying Nexus application...${NC}"

cp -r "${SCRIPT_DIR}/../kernel" ${NEXUS_HOME}/app/
echo "   ✅ Kernel deployed"

# Create executable wrappers
cat > ${NEXUS_HOME}/bin/nexus-kernel <<'EOF'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app
export NEXUS_HOME=/opt/nexus
export NEXUS_DATA=/var/lib/nexus
exec /opt/nexus/.venv/bin/python /opt/nexus/app/kernel/main.py "$@"
EOF

cat > ${NEXUS_HOME}/bin/nexus-core <<'EOF'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app
export NEXUS_HOME=/opt/nexus
export NEXUS_DATA=/var/lib/nexus
exec /opt/nexus/.venv/bin/python /opt/nexus/app/kernel/linux/nexus_orchestrator.py "$@"
EOF

cat > ${NEXUS_HOME}/bin/nexus-cli <<'EOF'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app
export NEXUS_HOME=/opt/nexus
exec /opt/nexus/.venv/bin/python /opt/nexus/app/kernel/linux/nexus_orchestrator.py --no-api "$@"
EOF

cat > ${NEXUS_HOME}/bin/nexus-setup <<'EOF'
#!/bin/bash
set -e
VENV_DIR="/opt/nexus/.venv"
KERNEL_DIR="/opt/nexus/app/kernel"
if [ ! -d "${VENV_DIR}" ]; then
    python -m venv "${VENV_DIR}" 2>/dev/null || python3 -m venv "${VENV_DIR}"
    "${VENV_DIR}/bin/pip" install --quiet --upgrade pip
    if [ -f "${KERNEL_DIR}/requirements.lock.txt" ]; then
        "${VENV_DIR}/bin/pip" install --quiet -r "${KERNEL_DIR}/requirements.lock.txt"
    elif [ -f "${KERNEL_DIR}/requirements.txt" ]; then
        "${VENV_DIR}/bin/pip" install --quiet -r "${KERNEL_DIR}/requirements.txt"
    fi
fi
EOF

chmod +x ${NEXUS_HOME}/bin/*

ln -sf ${NEXUS_HOME}/bin/nexus-core /usr/local/bin/nexus-core
ln -sf ${NEXUS_HOME}/bin/nexus-kernel /usr/local/bin/nexus-kernel
ln -sf ${NEXUS_HOME}/bin/nexus-cli /usr/local/bin/nexus-cli
echo "   ✅ Executables: nexus-core, nexus-kernel, nexus-cli"

chown -R ${NEXUS_USER}:${NEXUS_USER} ${NEXUS_HOME}
chown -R ${NEXUS_USER}:${NEXUS_USER} ${NEXUS_DATA}
chown -R ${NEXUS_USER}:${NEXUS_USER} ${NEXUS_LOG}

# ─── Step 7: Systemd Services ────────────────────────────────────
echo -e "\n${YELLOW}[7/8] Installing systemd services...${NC}"

cat > /etc/systemd/system/nexus-core.service <<'SVC'
[Unit]
Description=Nexus AIOS Orchestrator
After=network.target ollama.service
Wants=ollama.service

[Service]
Type=simple
User=nexus
Group=nexus
WorkingDirectory=/opt/nexus/app
ExecStartPre=/opt/nexus/bin/nexus-setup
ExecStart=/opt/nexus/bin/nexus-core --daemon --port 9600
Restart=on-failure
RestartSec=5
Environment="NEXUS_HOME=/opt/nexus"
Environment="NEXUS_DATA=/var/lib/nexus"
Environment="OLLAMA_HOST=http://localhost:11434"
Environment="PYTHONUNBUFFERED=1"
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/nexus /var/log/nexus /opt/nexus /tmp
MemoryMax=8G
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nexus-core

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
systemctl enable nexus-core.service
echo "   ✅ nexus-core.service enabled"

# ─── Step 8: D-Bus + Branding ────────────────────────────────────
echo -e "\n${YELLOW}[8/8] Final configuration...${NC}"

mkdir -p /usr/share/dbus-1/system.d/
cat > /usr/share/dbus-1/system.d/org.nexus.Agent.conf <<'DBUS'
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-BUS Bus Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <policy user="nexus">
    <allow own="org.nexus.Agent"/>
    <allow own="org.nexus.Memory"/>
  </policy>
  <policy context="default">
    <allow send_destination="org.nexus.Agent"/>
    <allow send_destination="org.nexus.Memory"/>
  </policy>
</busconfig>
DBUS

# Nexus MOTD
cat > /etc/motd <<'MOTD'

  ╔═══════════════════════════════════════════════════════╗
  ║                                                       ║
  ║           🧠  N E X U S   A I O S                     ║
  ║           Hybrid AI Operating System                  ║
  ║           Powered by Arch Linux                       ║
  ║                                                       ║
  ║   Status:  systemctl status nexus-core                ║
  ║   CLI:     nexus-cli                                  ║
  ║   API:     http://localhost:9600/health                ║
  ║   Logs:    journalctl -u nexus-core -f                ║
  ║                                                       ║
  ╚═══════════════════════════════════════════════════════╝

MOTD

echo "   ✅ D-Bus + branding configured"

# ─── Pull default model ──────────────────────────────────────────
echo -e "\n${YELLOW}Pulling default LLM model...${NC}"
if systemctl is-active --quiet ollama 2>/dev/null; then
    ollama pull llama3.2:3b 2>/dev/null && echo "   ✅ llama3.2:3b ready" || echo "   ⚠️ Pull failed (retry: ollama pull llama3.2:3b)"
else
    echo "   ⚠️ Ollama not running. Start it first:"
    echo "      sudo systemctl start ollama"
    echo "      ollama pull llama3.2:3b"
fi

# ─── Done ─────────────────────────────────────────────────────────
echo -e "\n${BOLD}${GREEN}"
echo "  ═══════════════════════════════════════════════"
echo "  ✅ Nexus AIOS installed on Arch Linux!"
echo "  ═══════════════════════════════════════════════"
echo ""
echo "  Quick Start:"
echo "    sudo systemctl start nexus-core    # Start the AI"
echo "    nexus-cli                           # Chat with Nexus"
echo "    curl http://localhost:9600/health   # API health check"
echo ""
echo "  Login: nexus / nexus"
echo -e "${NC}"
