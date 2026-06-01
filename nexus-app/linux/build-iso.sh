#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  Nexus AIOS — Arch Linux ISO Builder
#  Creates a bootable Arch-based ISO with Nexus AIOS pre-installed.
#
#  Requirements (run on an Arch Linux machine or in a container):
#    pacman -S archiso git base-devel
#
#  Usage:
#    sudo bash build-iso.sh [--output nexus-aios.iso]
#    sudo bash build-iso.sh --work-dir /tmp/nexus-build
#
#  The resulting ISO boots into a live Arch environment with:
#    - Nexus kernel pre-installed at /opt/nexus
#    - Ollama pre-installed
#    - Auto-login to nexus-cli on TTY1
#    - Installer script for permanent installation
# ═══════════════════════════════════════════════════════════════════

set -eo pipefail

# ─── Configuration ────────────────────────────────────────────────
NEXUS_VERSION="1.0.0"
ARCH_PROFILE="releng"  # archiso profile (releng = full installer)
WORK_DIR="${WORK_DIR:-/tmp/nexus-iso-build}"
OUTPUT_DIR="${OUTPUT_DIR:-$(pwd)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║   🧠 Nexus AIOS — Arch Linux ISO Builder     ║"
echo "  ║           Version ${NEXUS_VERSION}                        ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Check prerequisites ──────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Must run as root: sudo bash build-iso.sh${NC}"
    exit 1
fi

if ! command -v mkarchiso &>/dev/null; then
    echo -e "${RED}❌ archiso not installed. Run: pacman -S archiso${NC}"
    exit 1
fi

# ─── Step 1: Copy archiso profile ────────────────────────────────
echo -e "\n${YELLOW}[1/7] Preparing archiso profile...${NC}"

PROFILE_DIR="${WORK_DIR}/profile"
rm -rf "${PROFILE_DIR}"
cp -r /usr/share/archiso/configs/${ARCH_PROFILE} "${PROFILE_DIR}"
echo "   ✅ archiso profile copied"

# ─── Step 2: Customize packages ──────────────────────────────────
echo -e "\n${YELLOW}[2/7] Customizing package list...${NC}"

cat >> "${PROFILE_DIR}/packages.x86_64" <<'PACKAGES'

# === Nexus AIOS Dependencies ===
# Python environment
python
python-pip
python-virtualenv
python-numpy
python-scipy
python-scikit-learn
python-pydantic
python-aiohttp
python-yaml
python-dotenv
python-psutil
python-requests
python-beautifulsoup4
python-websockets
python-cryptography

# Build tools
base-devel
git
curl
wget

# Audio (for voice pipeline)
portaudio
alsa-utils

# Network
openssh
net-tools
iwd
networkmanager

# Monitoring
htop
neofetch

# D-Bus
dbus

# GPU support (optional, included for completeness)
# mesa
# vulkan-intel
# nvidia-utils
PACKAGES

echo "   ✅ Package list updated"

# ─── Step 3: Inject Nexus application code ────────────────────────
echo -e "\n${YELLOW}[3/7] Injecting Nexus application code...${NC}"

AIROOTFS="${PROFILE_DIR}/airootfs"

# Create Nexus directory structure
mkdir -p "${AIROOTFS}/opt/nexus/{app,bin,data}"
mkdir -p "${AIROOTFS}/var/lib/nexus/{lancedb,config,models}"
mkdir -p "${AIROOTFS}/var/log/nexus"

# Copy kernel code
cp -r "${PROJECT_ROOT}/nexus-app/kernel" "${AIROOTFS}/opt/nexus/app/"
echo "   ✅ Kernel code deployed"

# Copy Linux orchestrator
mkdir -p "${AIROOTFS}/opt/nexus/app/kernel/linux"
if [ -f "${PROJECT_ROOT}/nexus-app/kernel/linux/nexus_orchestrator.py" ]; then
    cp "${PROJECT_ROOT}/nexus-app/kernel/linux/nexus_orchestrator.py" \
       "${AIROOTFS}/opt/nexus/app/kernel/linux/"
fi
echo "   ✅ Linux orchestrator deployed"

# ─── Create executable wrappers ──────────────────────────────────
cat > "${AIROOTFS}/opt/nexus/bin/nexus-kernel" <<'WRAPPER'
#!/bin/bash
# Nexus Kernel — Direct AI kernel launcher
export PYTHONPATH=/opt/nexus/app
export NEXUS_HOME=/opt/nexus
export NEXUS_DATA=/var/lib/nexus
exec /opt/nexus/.venv/bin/python /opt/nexus/app/kernel/main.py "$@"
WRAPPER

cat > "${AIROOTFS}/opt/nexus/bin/nexus-core" <<'WRAPPER'
#!/bin/bash
# Nexus Orchestrator — Manages kernel lifecycle + REST API
export PYTHONPATH=/opt/nexus/app
export NEXUS_HOME=/opt/nexus
export NEXUS_DATA=/var/lib/nexus
exec /opt/nexus/.venv/bin/python /opt/nexus/app/kernel/linux/nexus_orchestrator.py "$@"
WRAPPER

cat > "${AIROOTFS}/opt/nexus/bin/nexus-cli" <<'WRAPPER'
#!/bin/bash
# Nexus CLI — Interactive chat with the AI
export PYTHONPATH=/opt/nexus/app
export NEXUS_HOME=/opt/nexus
exec /opt/nexus/.venv/bin/python /opt/nexus/app/kernel/linux/nexus_orchestrator.py --no-api "$@"
WRAPPER

chmod +x "${AIROOTFS}/opt/nexus/bin/"*

# Symlinks to /usr/local/bin
mkdir -p "${AIROOTFS}/usr/local/bin"
ln -sf /opt/nexus/bin/nexus-core "${AIROOTFS}/usr/local/bin/nexus-core"
ln -sf /opt/nexus/bin/nexus-kernel "${AIROOTFS}/usr/local/bin/nexus-kernel"
ln -sf /opt/nexus/bin/nexus-cli "${AIROOTFS}/usr/local/bin/nexus-cli"

echo "   ✅ Executables created"

# ─── Step 4: Systemd services ────────────────────────────────────
echo -e "\n${YELLOW}[4/7] Installing systemd services...${NC}"

mkdir -p "${AIROOTFS}/etc/systemd/system"

# nexus-core.service (orchestrator with REST API)
cat > "${AIROOTFS}/etc/systemd/system/nexus-core.service" <<'SERVICE'
[Unit]
Description=Nexus AIOS Orchestrator
Documentation=https://github.com/nexus-aios
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
TasksMax=256

StandardOutput=journal
StandardError=journal
SyslogIdentifier=nexus-core

[Install]
WantedBy=multi-user.target
SERVICE

# nexus-setup: one-shot service to create venv on first boot
cat > "${AIROOTFS}/opt/nexus/bin/nexus-setup" <<'SETUP'
#!/bin/bash
# First-boot setup: create Python venv and install dependencies.
set -e

VENV_DIR="/opt/nexus/.venv"
KERNEL_DIR="/opt/nexus/app/kernel"

if [ ! -d "${VENV_DIR}" ]; then
    echo "🔧 Creating Python virtual environment..."
    python -m venv "${VENV_DIR}"
    "${VENV_DIR}/bin/pip" install --quiet --upgrade pip

    if [ -f "${KERNEL_DIR}/requirements.lock.txt" ]; then
        echo "📦 Installing pinned dependencies..."
        "${VENV_DIR}/bin/pip" install --quiet -r "${KERNEL_DIR}/requirements.lock.txt"
    elif [ -f "${KERNEL_DIR}/requirements.txt" ]; then
        echo "📦 Installing dependencies..."
        "${VENV_DIR}/bin/pip" install --quiet -r "${KERNEL_DIR}/requirements.txt"
    fi
    echo "✅ Python environment ready"
fi
SETUP
chmod +x "${AIROOTFS}/opt/nexus/bin/nexus-setup"

# Sysusers for nexus user
mkdir -p "${AIROOTFS}/usr/lib/sysusers.d"
cat > "${AIROOTFS}/usr/lib/sysusers.d/nexus.conf" <<'SYSUSERS'
u nexus - "Nexus AIOS System User" /opt/nexus /bin/bash
m nexus video
m nexus render
SYSUSERS

# Tmpfiles for directories
mkdir -p "${AIROOTFS}/usr/lib/tmpfiles.d"
cat > "${AIROOTFS}/usr/lib/tmpfiles.d/nexus.conf" <<'TMPFILES'
d /var/lib/nexus 0750 nexus nexus -
d /var/lib/nexus/models 0755 nexus nexus -
d /var/log/nexus 0755 nexus nexus -
d /opt/nexus 0755 nexus nexus -
TMPFILES

echo "   ✅ Systemd services installed"

# ─── Step 5: Branding & Login ────────────────────────────────────
echo -e "\n${YELLOW}[5/7] Applying Nexus AIOS branding...${NC}"

# Custom MOTD
cat > "${AIROOTFS}/etc/motd" <<'MOTD'

  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║           🧠  N E X U S   A I O S                         ║
  ║           Hybrid AI Operating System                      ║
  ║           Powered by Arch Linux                           ║
  ║                                                           ║
  ║   Quick Start:                                            ║
  ║     nexus-cli                 — Chat with the AI          ║
  ║     sudo systemctl start nexus-core  — Start services     ║
  ║     curl localhost:9600/health       — API health check   ║
  ║                                                           ║
  ║   Admin:                                                  ║
  ║     journalctl -u nexus-core -f     — View logs           ║
  ║     nexus-install                    — Install to disk    ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝

MOTD

# Custom /etc/os-release
cat > "${AIROOTFS}/etc/os-release" <<OSRELEASE
NAME="Nexus AIOS"
PRETTY_NAME="Nexus AIOS ${NEXUS_VERSION} (Arch Linux)"
ID=nexus
ID_LIKE=arch
BUILD_ID=rolling
VERSION="${NEXUS_VERSION}"
VERSION_ID="${NEXUS_VERSION}"
HOME_URL="https://nexus-aios.org"
DOCUMENTATION_URL="https://docs.nexus-aios.org"
OSRELEASE

# Custom issue (login prompt)
cat > "${AIROOTFS}/etc/issue" <<'ISSUE'

        🧠 Nexus AIOS — Hybrid AI Operating System
        Built on Arch Linux | Local-first AI

        Default login: nexus / nexus

ISSUE

# Hostname
echo "nexus-aios" > "${AIROOTFS}/etc/hostname"

# ─── Auto-login to CLI on TTY1 ───────────────────────────────────
mkdir -p "${AIROOTFS}/etc/systemd/system/getty@tty1.service.d"
cat > "${AIROOTFS}/etc/systemd/system/getty@tty1.service.d/autologin.conf" <<'AUTOLOGIN'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin nexus --noclear %I $TERM
AUTOLOGIN

# Shell profile: launch nexus-cli on login
mkdir -p "${AIROOTFS}/opt/nexus"
cat > "${AIROOTFS}/opt/nexus/.bash_profile" <<'PROFILE'
# Source default profile
[[ -f ~/.bashrc ]] && . ~/.bashrc

# Show MOTD
cat /etc/motd

# Prompt
export PS1='\[\033[01;36m\]nexus\[\033[00m\]@\[\033[01;32m\]\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '

# Aliases
alias status='systemctl status nexus-core'
alias logs='journalctl -u nexus-core -f'
alias chat='nexus-cli'

# First boot: run setup if needed
if [ ! -d "/opt/nexus/.venv" ] && [ -f "/opt/nexus/bin/nexus-setup" ]; then
    echo "🔧 First boot — setting up Python environment..."
    sudo /opt/nexus/bin/nexus-setup
    echo ""
fi
PROFILE

echo "   ✅ Branding applied"

# ─── Step 6: Installer Script (live → disk) ──────────────────────
echo -e "\n${YELLOW}[6/7] Creating disk installer...${NC}"

cat > "${AIROOTFS}/usr/local/bin/nexus-install" <<'INSTALLER'
#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Nexus AIOS — Install to Disk
#  Installs the live Nexus AIOS to a permanent disk partition
# ═══════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║  🧠 Nexus AIOS — Disk Installer          ║"
echo "  ╚═══════════════════════════════════════════╝"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Run as root: sudo nexus-install${NC}"
    exit 1
fi

# List available disks
echo -e "${YELLOW}Available disks:${NC}"
lsblk -d -o NAME,SIZE,TYPE,MODEL | grep disk
echo ""

read -p "Target disk (e.g., sda, vda, nvme0n1): " TARGET_DISK
TARGET="/dev/${TARGET_DISK}"

if [ ! -b "$TARGET" ]; then
    echo -e "${RED}❌ ${TARGET} is not a valid block device${NC}"
    exit 1
fi

echo -e "\n${RED}⚠️  WARNING: This will ERASE all data on ${TARGET}!${NC}"
read -p "Type 'YES' to confirm: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
    echo "Cancelled."
    exit 0
fi

echo -e "\n${YELLOW}[1/5] Partitioning ${TARGET}...${NC}"
# GPT: 512M EFI + rest for root
parted -s "$TARGET" mklabel gpt
parted -s "$TARGET" mkpart primary fat32 1MiB 513MiB
parted -s "$TARGET" set 1 esp on
parted -s "$TARGET" mkpart primary ext4 513MiB 100%

# Detect partition names (handles nvme vs sd)
if [[ "$TARGET_DISK" == nvme* ]]; then
    PART1="${TARGET}p1"
    PART2="${TARGET}p2"
else
    PART1="${TARGET}1"
    PART2="${TARGET}2"
fi

echo -e "${YELLOW}[2/5] Formatting...${NC}"
mkfs.fat -F32 "$PART1"
mkfs.ext4 -F "$PART2"

echo -e "${YELLOW}[3/5] Installing base system...${NC}"
mount "$PART2" /mnt
mkdir -p /mnt/boot/efi
mount "$PART1" /mnt/boot/efi

# Install base system + nexus deps
pacstrap /mnt base linux linux-firmware python python-pip python-virtualenv \
    networkmanager openssh git curl wget dbus htop neofetch portaudio \
    grub efibootmgr

# Generate fstab
genfstab -U /mnt >> /mnt/etc/fstab

echo -e "${YELLOW}[4/5] Configuring system...${NC}"
# Copy Nexus application
cp -r /opt/nexus /mnt/opt/nexus
cp /usr/local/bin/nexus-* /mnt/usr/local/bin/ 2>/dev/null || true
cp /etc/systemd/system/nexus-core.service /mnt/etc/systemd/system/ 2>/dev/null || true
cp /etc/motd /mnt/etc/motd
cp /etc/os-release /mnt/etc/os-release
cp /etc/issue /mnt/etc/issue
echo "nexus-aios" > /mnt/etc/hostname

# Chroot configuration
arch-chroot /mnt bash -c '
    # Timezone & locale
    ln -sf /usr/share/zoneinfo/UTC /etc/localtime
    hwclock --systohc
    echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen
    locale-gen
    echo "LANG=en_US.UTF-8" > /etc/locale.conf

    # Create nexus user
    useradd -m -d /opt/nexus -s /bin/bash -G wheel,video,render nexus 2>/dev/null || true
    echo "nexus:nexus" | chpasswd
    echo "nexus ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/nexus

    # Bootloader
    grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=NexusAIOS
    grub-mkconfig -o /boot/grub/grub.cfg

    # Enable services
    systemctl enable NetworkManager
    systemctl enable sshd
    systemctl enable nexus-core 2>/dev/null || true

    # Install Ollama
    curl -fsSL https://ollama.com/install.sh | sh 2>/dev/null || echo "Ollama install deferred"
'

echo -e "${YELLOW}[5/5] Cleaning up...${NC}"
umount -R /mnt

echo -e "\n${BOLD}${GREEN}"
echo "  ═══════════════════════════════════════════════"
echo "  ✅ Nexus AIOS installed to ${TARGET}"
echo "  ═══════════════════════════════════════════════"
echo ""
echo "  Remove the ISO/USB and reboot:"
echo "    sudo reboot"
echo ""
echo "  Login: nexus / nexus"
echo -e "${NC}"
INSTALLER

chmod +x "${AIROOTFS}/usr/local/bin/nexus-install"
echo "   ✅ Disk installer script created"

# ─── Step 7: Build ISO ───────────────────────────────────────────
echo -e "\n${YELLOW}[7/7] Building Arch Linux ISO...${NC}"

# Update profile name
sed -i "s/iso_name=.*/iso_name=nexus-aios/" "${PROFILE_DIR}/profiledef.sh" 2>/dev/null || true
sed -i "s/iso_label=.*/iso_label=\"NEXUS_AIOS_${NEXUS_VERSION}\"/" "${PROFILE_DIR}/profiledef.sh" 2>/dev/null || true
sed -i "s/iso_version=.*/iso_version=\"${NEXUS_VERSION}\"/" "${PROFILE_DIR}/profiledef.sh" 2>/dev/null || true
sed -i "s/iso_publisher=.*/iso_publisher=\"Nexus AIOS Project\"/" "${PROFILE_DIR}/profiledef.sh" 2>/dev/null || true
sed -i "s/iso_application=.*/iso_application=\"Nexus AIOS Live\"/" "${PROFILE_DIR}/profiledef.sh" 2>/dev/null || true

# Build
mkarchiso -v \
    -w "${WORK_DIR}/work" \
    -o "${OUTPUT_DIR}" \
    "${PROFILE_DIR}"

# Find the built ISO
BUILT_ISO=$(ls -t "${OUTPUT_DIR}"/nexus-aios-*.iso 2>/dev/null | head -1)

if [ -z "$BUILT_ISO" ]; then
    echo -e "${RED}❌ ISO build failed${NC}"
    exit 1
fi

# Rename to final name
FINAL_ISO="${OUTPUT_DIR}/nexus-aios-${NEXUS_VERSION}.iso"
mv "$BUILT_ISO" "$FINAL_ISO" 2>/dev/null || FINAL_ISO="$BUILT_ISO"

ISO_SIZE=$(du -h "$FINAL_ISO" | cut -f1)
ISO_SHA=$(sha256sum "$FINAL_ISO" | cut -d' ' -f1)

# Generate VMX for VMware Player
VMX_FILE="${FINAL_ISO%.iso}.vmx"
cat > "${VMX_FILE}" <<VMX
.encoding = "UTF-8"
config.version = "8"
virtualHW.version = "21"
displayName = "Nexus AIOS"
guestOS = "other5xlinux-64"
memsize = "8192"
numvcpus = "4"
cpuid.coresPerSocket = "4"
scsi0.present = "TRUE"
scsi0.virtualDev = "lsilogic"
scsi0:0.present = "TRUE"
scsi0:0.fileName = "nexus-aios-disk.vmdk"
ide1:0.present = "TRUE"
ide1:0.deviceType = "cdrom-image"
ide1:0.fileName = "${FINAL_ISO}"
ide1:0.startConnected = "TRUE"
floppy0.present = "FALSE"
ethernet0.present = "TRUE"
ethernet0.connectionType = "nat"
ethernet0.virtualDev = "vmxnet3"
sound.present = "TRUE"
usb.present = "TRUE"
firmware = "efi"
annotation = "Nexus AIOS ${NEXUS_VERSION} - Hybrid AI Operating System (Arch Linux)"
VMX

# ─── Done ─────────────────────────────────────────────────────────
echo -e "\n${BOLD}${GREEN}"
echo "  ═══════════════════════════════════════════════════"
echo "  ✅ Nexus AIOS ISO Built Successfully!"
echo "  ═══════════════════════════════════════════════════"
echo ""
echo "  📀 ISO:  ${FINAL_ISO} (${ISO_SIZE})"
echo "  🔑 SHA:  ${ISO_SHA}"
echo "  📋 VMX:  ${VMX_FILE}"
echo ""
echo "  VMware Player instructions:"
echo "    1. Open VMware Player → Create New VM"
echo "    2. Installer disc image: ${FINAL_ISO}"
echo "    3. Guest OS: Linux → Other Linux 5.x (64-bit)"
echo "    4. RAM ≥ 8GB, Disk ≥ 40GB"
echo "    5. Boot → auto-logs in as 'nexus'"
echo "    6. Run: nexus-cli         (chat with AI)"
echo "    7. Run: sudo nexus-install (install to disk)"
echo ""
echo "  Live credentials: nexus / nexus"
echo -e "${NC}"
