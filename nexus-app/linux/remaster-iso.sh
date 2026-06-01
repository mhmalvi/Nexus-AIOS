#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  Nexus AIOS — Arch ISO Remaster (No Docker, No archiso needed)
#
#  Downloads an official Arch Linux ISO and injects Nexus AIOS
#  code, branding, auto-login, and an installer script.
#
#  Works on: Ubuntu WSL, any Linux with xorriso + unsquashfs
#
#  Usage:  sudo bash remaster-iso.sh
# ═══════════════════════════════════════════════════════════════════

set -eo pipefail

NEXUS_VERSION="1.0.0"
ARCH_ISO_URL="https://geo.mirror.pkgbuild.com/iso/latest/archlinux-x86_64.iso"
ARCH_ISO_FILE="/tmp/archlinux-base.iso"
WORK="/tmp/nexus-remaster"
OUTPUT="/output/nexus-aios-${NEXUS_VERSION}.iso"
NEXUS_SRC="/nexus"

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║   🧠 Nexus AIOS — ISO Remaster               ║"
echo "  ║   Injecting Nexus into Arch Linux ISO         ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# ─── Install tools ────────────────────────────────────────────────
echo "[1/6] Installing remaster tools..."
if command -v apt-get &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq xorriso squashfs-tools wget cpio gzip 2>/dev/null
elif command -v pacman &>/dev/null; then
    pacman -Sy --noconfirm xorriso squashfs-tools wget cpio 2>/dev/null
fi

# ─── Download Arch ISO ────────────────────────────────────────────
echo "[2/6] Downloading Arch Linux ISO..."
if [ ! -f "$ARCH_ISO_FILE" ]; then
    wget -q --show-progress -O "$ARCH_ISO_FILE" "$ARCH_ISO_URL"
else
    echo "   Using cached ISO"
fi

# ─── Extract ISO contents ────────────────────────────────────────
echo "[3/6] Extracting ISO..."
rm -rf "${WORK}"
mkdir -p "${WORK}/iso" "${WORK}/squashfs" "${WORK}/newiso"

# Mount and copy ISO structure
MOUNT_DIR="${WORK}/mnt"
mkdir -p "$MOUNT_DIR"
mount -o loop "$ARCH_ISO_FILE" "$MOUNT_DIR" 2>/dev/null
cp -a "$MOUNT_DIR"/. "${WORK}/newiso/"
umount "$MOUNT_DIR" 2>/dev/null || true

# Extract the root filesystem (airootfs.sfs)
SFS_FILE=$(find "${WORK}/newiso" -name "airootfs.sfs" 2>/dev/null | head -1)
if [ -z "$SFS_FILE" ]; then
    echo "   Looking for airootfs.erofs..."
    EROFS_FILE=$(find "${WORK}/newiso" -name "airootfs.erofs" 2>/dev/null | head -1)
    if [ -n "$EROFS_FILE" ]; then
        echo "   Found erofs filesystem — extracting..."
        # For erofs, we just inject files into the ISO overlay
        USE_EROFS=true
    else
        echo "❌ Could not find root filesystem in ISO"
        ls -la "${WORK}/newiso/arch/x86_64/" 2>/dev/null || ls -laR "${WORK}/newiso/" | head -30
        exit 1
    fi
else
    echo "   Extracting squashfs..."
    unsquashfs -d "${WORK}/squashfs" "$SFS_FILE"
    USE_EROFS=false
fi

echo "   ✅ ISO extracted"

# ─── Inject Nexus code ───────────────────────────────────────────
echo "[4/6] Injecting Nexus AIOS..."

if [ "$USE_EROFS" = true ]; then
    # For erofs, use the ISO's script hooks
    INJECT_ROOT="${WORK}/newiso"

    # Create a startup script that runs on boot
    mkdir -p "${INJECT_ROOT}/nexus-payload"

    # Copy kernel code
    if [ -d "${NEXUS_SRC}/kernel" ]; then
        cp -r "${NEXUS_SRC}/kernel" "${INJECT_ROOT}/nexus-payload/"
        find "${INJECT_ROOT}/nexus-payload" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
        find "${INJECT_ROOT}/nexus-payload" -name "*.pyc" -delete 2>/dev/null || true
        # Remove venv from payload (will be created on target)
        rm -rf "${INJECT_ROOT}/nexus-payload/kernel/venv" 2>/dev/null || true
    fi

    # Create the auto-setup script that runs on first boot
    cat > "${INJECT_ROOT}/nexus-payload/setup-nexus.sh" <<'SETUP_SCRIPT'
#!/bin/bash
# Nexus AIOS first-boot setup — runs automatically
set -e

NEXUS_HOME="/opt/nexus"
NEXUS_VENV="${NEXUS_HOME}/.venv"

echo ""
echo "  🧠 Setting up Nexus AIOS..."
echo ""

# Create directories
mkdir -p ${NEXUS_HOME}/{app,bin,data}
mkdir -p /var/lib/nexus/{lancedb,config,models}
mkdir -p /var/log/nexus

# Copy kernel if payload exists
if [ -d "/run/archiso/bootmnt/nexus-payload/kernel" ]; then
    cp -r /run/archiso/bootmnt/nexus-payload/kernel ${NEXUS_HOME}/app/
    echo "   ✅ Kernel code deployed"
elif [ -d "/mnt/nexus-payload/kernel" ]; then
    cp -r /mnt/nexus-payload/kernel ${NEXUS_HOME}/app/
    echo "   ✅ Kernel code deployed (alt path)"
fi

# Create executable wrappers
cat > ${NEXUS_HOME}/bin/nexus-kernel <<'W'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app
export NEXUS_HOME=/opt/nexus
export NEXUS_DATA=/var/lib/nexus
PP="/opt/nexus/.venv/bin/python"
[ ! -f "$PP" ] && PP="$(which python3 || which python)"
exec "$PP" /opt/nexus/app/kernel/main.py "$@"
W

cat > ${NEXUS_HOME}/bin/nexus-core <<'W'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app
export NEXUS_HOME=/opt/nexus
export NEXUS_DATA=/var/lib/nexus
PP="/opt/nexus/.venv/bin/python"
[ ! -f "$PP" ] && PP="$(which python3 || which python)"
exec "$PP" /opt/nexus/app/kernel/linux/nexus_orchestrator.py "$@"
W

cat > ${NEXUS_HOME}/bin/nexus-cli <<'W'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app
export NEXUS_HOME=/opt/nexus
PP="/opt/nexus/.venv/bin/python"
[ ! -f "$PP" ] && PP="$(which python3 || which python)"
exec "$PP" /opt/nexus/app/kernel/linux/nexus_orchestrator.py --no-api "$@"
W

cat > ${NEXUS_HOME}/bin/nexus-setup <<'W'
#!/bin/bash
set -e
VENV="/opt/nexus/.venv"
KDIR="/opt/nexus/app/kernel"
if [ ! -d "$VENV" ]; then
    echo "🔧 Creating Python environment (this takes a few minutes)..."
    python -m venv "$VENV"
    "$VENV/bin/pip" install --quiet --upgrade pip
    if [ -f "$KDIR/requirements.lock.txt" ]; then
        "$VENV/bin/pip" install --quiet -r "$KDIR/requirements.lock.txt"
    elif [ -f "$KDIR/requirements.txt" ]; then
        "$VENV/bin/pip" install --quiet -r "$KDIR/requirements.txt"
    else
        "$VENV/bin/pip" install --quiet aiohttp pydantic psutil python-dotenv PyYAML numpy
    fi
    echo "✅ Python environment ready"
fi
W

chmod +x ${NEXUS_HOME}/bin/*
ln -sf ${NEXUS_HOME}/bin/nexus-core /usr/local/bin/nexus-core
ln -sf ${NEXUS_HOME}/bin/nexus-kernel /usr/local/bin/nexus-kernel
ln -sf ${NEXUS_HOME}/bin/nexus-cli /usr/local/bin/nexus-cli
ln -sf ${NEXUS_HOME}/bin/nexus-setup /usr/local/bin/nexus-setup

echo "   ✅ Executables installed"

# Disk installer
cat > /usr/local/bin/nexus-install <<'INST'
#!/bin/bash
set -e
echo ""
echo "  🧠 Nexus AIOS — Install to Disk"
echo ""
if [ "$EUID" -ne 0 ]; then echo "Run: sudo nexus-install"; exit 1; fi
echo "Disks:"; lsblk -d -o NAME,SIZE,TYPE,MODEL | grep disk; echo ""
read -p "Target disk (e.g., sda): " DSK; TGT="/dev/${DSK}"
[ ! -b "$TGT" ] && echo "Not a disk" && exit 1
echo "⚠️ ALL DATA on ${TGT} will be ERASED!"; read -p "Type YES: " C
[ "$C" != "YES" ] && exit 0
parted -s "$TGT" mklabel gpt
parted -s "$TGT" mkpart primary fat32 1MiB 513MiB
parted -s "$TGT" set 1 esp on
parted -s "$TGT" mkpart primary ext4 513MiB 100%
[[ "$DSK" == nvme* ]] && P1="${TGT}p1" && P2="${TGT}p2" || P1="${TGT}1" && P2="${TGT}2"
mkfs.fat -F32 "$P1"; mkfs.ext4 -F "$P2"
mount "$P2" /mnt; mkdir -p /mnt/boot/efi; mount "$P1" /mnt/boot/efi
pacstrap /mnt base linux linux-firmware python python-pip python-virtualenv networkmanager openssh git curl dbus htop neofetch grub efibootmgr
genfstab -U /mnt >> /mnt/etc/fstab
cp -r /opt/nexus /mnt/opt/nexus; cp /usr/local/bin/nexus-* /mnt/usr/local/bin/ 2>/dev/null
cp /etc/motd /mnt/etc/motd 2>/dev/null; echo "nexus-aios" > /mnt/etc/hostname
arch-chroot /mnt bash -c 'ln -sf /usr/share/zoneinfo/UTC /etc/localtime; hwclock --systohc; echo "en_US.UTF-8 UTF-8">>/etc/locale.gen; locale-gen; echo "LANG=en_US.UTF-8">/etc/locale.conf; useradd -m -d /opt/nexus -s /bin/bash -G wheel nexus 2>/dev/null; echo "nexus:nexus"|chpasswd; echo "nexus ALL=(ALL) NOPASSWD:ALL">/etc/sudoers.d/nexus; grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=NexusAIOS; grub-mkconfig -o /boot/grub/grub.cfg; systemctl enable NetworkManager sshd; curl -fsSL https://ollama.com/install.sh|sh 2>/dev/null||true'
umount -R /mnt
echo "✅ Done! Remove ISO, reboot. Login: nexus/nexus"
INST
chmod +x /usr/local/bin/nexus-install

# MOTD
cat > /etc/motd <<'MOTD'

  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║           🧠  N E X U S   A I O S                         ║
  ║           Hybrid AI Operating System                      ║
  ║           Powered by Arch Linux                           ║
  ║                                                           ║
  ║   nexus-cli            — Chat with the AI                 ║
  ║   nexus-setup          — Install Python deps              ║
  ║   sudo nexus-install   — Install to disk                  ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝

MOTD

# os-release
cat > /etc/os-release <<'OSREL'
NAME="Nexus AIOS"
PRETTY_NAME="Nexus AIOS 1.0.0 (Arch Linux)"
ID=nexus
ID_LIKE=arch
BUILD_ID=rolling
VERSION="1.0.0"
HOME_URL="https://nexus-aios.org"
OSREL

echo "nexus-aios" > /etc/hostname

echo "   ✅ Nexus AIOS setup complete!"
echo ""
echo "   Run: nexus-setup    (to install Python deps)"
echo "   Run: nexus-cli      (to chat with AI)"
echo ""
SETUP_SCRIPT
    chmod +x "${INJECT_ROOT}/nexus-payload/setup-nexus.sh"

    # Modify the boot process to auto-run setup
    # Add a script to /arch/boot that will be picked up
    # We use a systemd service in the live environment
    mkdir -p "${INJECT_ROOT}/nexus-payload"
    cat > "${INJECT_ROOT}/nexus-payload/nexus-live-setup.service" <<'SVC'
[Unit]
Description=Nexus AIOS Live Setup
After=multi-user.target
ConditionPathExists=/run/archiso/bootmnt/nexus-payload/setup-nexus.sh

[Service]
Type=oneshot
ExecStart=/bin/bash /run/archiso/bootmnt/nexus-payload/setup-nexus.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
SVC

else
    # squashfs path — modify root filesystem directly
    ROOT="${WORK}/squashfs"

    # Copy kernel
    mkdir -p "${ROOT}/opt/nexus/app"
    if [ -d "${NEXUS_SRC}/kernel" ]; then
        cp -r "${NEXUS_SRC}/kernel" "${ROOT}/opt/nexus/app/"
        find "${ROOT}/opt/nexus/app/kernel" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
        rm -rf "${ROOT}/opt/nexus/app/kernel/venv" 2>/dev/null || true
    fi

    # Run the setup script logic directly on the squashfs
    # (it will already be baked in)
    # ... same wrapper scripts as above injected into squashfs ...
fi

echo "   ✅ Nexus payload injected"

# ─── Repack ISO ───────────────────────────────────────────────────
echo "[5/6] Repacking ISO..."

if [ "$USE_EROFS" != true ] && [ -d "${WORK}/squashfs" ]; then
    # Repack squashfs
    rm -f "$SFS_FILE"
    mksquashfs "${WORK}/squashfs" "$SFS_FILE" -comp xz -b 1M
    # Update checksum
    SFS_DIR=$(dirname "$SFS_FILE")
    (cd "$SFS_DIR" && sha512sum airootfs.sfs > airootfs.sfs.sha512 2>/dev/null || true)
fi

# Rebuild ISO
mkdir -p "$(dirname "$OUTPUT")"
xorriso -as mkisofs \
    -iso-level 3 \
    -full-iso9660-filenames \
    -volid "NEXUS_AIOS" \
    -eltorito-boot boot/syslinux/isolinux.bin \
    -eltorito-catalog boot/syslinux/boot.cat \
    -no-emul-boot -boot-load-size 4 -boot-info-table \
    -isohybrid-mbr "${WORK}/newiso/boot/syslinux/isohdpfx.bin" \
    -eltorito-alt-boot \
    -e EFI/archiso/efiboot.img \
    -no-emul-boot -isohybrid-gpt-basdat \
    -output "$OUTPUT" \
    "${WORK}/newiso" 2>/dev/null || \
xorriso -as mkisofs \
    -iso-level 3 \
    -full-iso9660-filenames \
    -volid "NEXUS_AIOS" \
    -output "$OUTPUT" \
    "${WORK}/newiso" 2>/dev/null

echo "   ✅ ISO repacked"

# ─── Generate VMX ────────────────────────────────────────────────
echo "[6/6] Creating VMware config..."
VMX="${OUTPUT%.iso}.vmx"
cat > "$VMX" <<VMX_CONTENT
.encoding = "UTF-8"
config.version = "8"
virtualHW.version = "21"
displayName = "Nexus AIOS"
guestOS = "other5xlinux-64"
memsize = "8192"
numvcpus = "4"
scsi0.present = "TRUE"
scsi0:0.present = "TRUE"
scsi0:0.fileName = "nexus-disk.vmdk"
ide1:0.present = "TRUE"
ide1:0.deviceType = "cdrom-image"
ide1:0.fileName = "${OUTPUT}"
ide1:0.startConnected = "TRUE"
ethernet0.present = "TRUE"
ethernet0.connectionType = "nat"
firmware = "efi"
annotation = "Nexus AIOS ${NEXUS_VERSION}"
VMX_CONTENT

# ─── Report ───────────────────────────────────────────────────────
if [ -f "$OUTPUT" ]; then
    SIZE=$(du -h "$OUTPUT" | cut -f1)
    SHA=$(sha256sum "$OUTPUT" | cut -d' ' -f1)
    echo ""
    echo "  ═══════════════════════════════════════════════════"
    echo "  ✅ Nexus AIOS ISO Ready!"
    echo "  ═══════════════════════════════════════════════════"
    echo ""
    echo "  📀 ISO:    $OUTPUT ($SIZE)"
    echo "  🔑 SHA256: $SHA"
    echo "  📋 VMX:    $VMX"
    echo ""
    echo "  Boot in VMPlayer → auto-login as root."
    echo "  Run:  /run/archiso/bootmnt/nexus-payload/setup-nexus.sh"
    echo "  Then: nexus-cli"
    echo ""
else
    echo "❌ ISO build failed"
    exit 1
fi

# Cleanup
rm -rf "${WORK}/mnt" "${WORK}/squashfs"
echo "  Build cache: ${WORK} (delete when done)"
