#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Nexus AIOS — Build ISO (run this in WSL Ubuntu)
#  
#  Usage from Windows PowerShell:
#    wsl -d Ubuntu -- sudo bash /mnt/i/CYBERPUNK/nexus-ag/nexus-app/linux/build-nexus-iso.sh
# ═══════════════════════════════════════════════════════

set -eo pipefail

NEXUS_VERSION="1.0.0"
PROJECT="/mnt/i/CYBERPUNK/nexus-ag"
ARCH_ISO="${PROJECT}/archlinux-2026.01.01-x86_64.iso"
WORK="/tmp/nexus-remaster"
OUTPUT="${PROJECT}/nexus-aios-${NEXUS_VERSION}.iso"

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║   🧠 Nexus AIOS — ISO Builder                ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# ─── Install tools ────────────────────────────────────────────
echo "[1/5] Installing tools..."
apt-get update -qq 2>/dev/null
apt-get install -y -qq xorriso squashfs-tools cpio gzip 2>/dev/null
echo "   ✅ Tools ready"

# ─── Check ISO ────────────────────────────────────────────────
echo "[2/5] Checking Arch ISO..."
if [ ! -f "$ARCH_ISO" ]; then
    echo "❌ ISO not found at: $ARCH_ISO"
    exit 1
fi
echo "   ✅ Found: $(basename "$ARCH_ISO") ($(du -h "$ARCH_ISO" | cut -f1))"

# ─── Extract ISO ──────────────────────────────────────────────
echo "[3/5] Extracting ISO (this takes a minute)..."
rm -rf "${WORK}"
mkdir -p "${WORK}/mnt" "${WORK}/newiso"

mount -o loop,ro "$ARCH_ISO" "${WORK}/mnt" 2>/dev/null
cp -a "${WORK}/mnt"/. "${WORK}/newiso/"
umount "${WORK}/mnt"
rmdir "${WORK}/mnt"

echo "   ✅ ISO extracted"
echo "   Contents:"
ls "${WORK}/newiso/" 2>/dev/null

# ─── Inject Nexus payload ─────────────────────────────────────
echo "[4/5] Injecting Nexus AIOS..."

# Create payload directory on ISO
mkdir -p "${WORK}/newiso/nexus"

# Copy kernel code (stripped of venv and pycache)
if [ -d "${PROJECT}/nexus-app/kernel" ]; then
    cp -r "${PROJECT}/nexus-app/kernel" "${WORK}/newiso/nexus/"
    find "${WORK}/newiso/nexus/kernel" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
    find "${WORK}/newiso/nexus/kernel" -name "*.pyc" -delete 2>/dev/null || true
    rm -rf "${WORK}/newiso/nexus/kernel/venv" 2>/dev/null || true
    echo "   ✅ Kernel code bundled"
else
    echo "   ⚠️ Kernel not found"
fi

# Create the master setup script
cat > "${WORK}/newiso/nexus/setup.sh" <<'SETUP'
#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Nexus AIOS — Post-boot Setup
#  Run after booting from this ISO:
#    bash /run/archiso/bootmnt/nexus/setup.sh
# ═══════════════════════════════════════════════════════
set -e

echo ""
echo "  🧠 Installing Nexus AIOS..."
echo ""

NH="/opt/nexus"
mkdir -p ${NH}/{app,bin,data}
mkdir -p /var/lib/nexus/{lancedb,config,models}
mkdir -p /var/log/nexus

# Find where the ISO is mounted
ISO_MNT=""
for p in /run/archiso/bootmnt /mnt/archiso /cdrom; do
    [ -d "$p/nexus/kernel" ] && ISO_MNT="$p" && break
done

if [ -z "$ISO_MNT" ]; then
    echo "⚠️ Cannot find ISO mount. Trying current directory..."
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    ISO_MNT="$SCRIPT_DIR/.."
fi

# Copy kernel
cp -r "${ISO_MNT}/nexus/kernel" ${NH}/app/
echo "   ✅ Kernel deployed to ${NH}/app/kernel"

# ── Executable wrappers ──
cat > ${NH}/bin/nexus-kernel <<'W'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app NEXUS_HOME=/opt/nexus NEXUS_DATA=/var/lib/nexus
P="/opt/nexus/.venv/bin/python"; [ ! -f "$P" ] && P="$(which python3 2>/dev/null || which python)"
exec "$P" /opt/nexus/app/kernel/main.py "$@"
W

cat > ${NH}/bin/nexus-core <<'W'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app NEXUS_HOME=/opt/nexus NEXUS_DATA=/var/lib/nexus
P="/opt/nexus/.venv/bin/python"; [ ! -f "$P" ] && P="$(which python3 2>/dev/null || which python)"
exec "$P" /opt/nexus/app/kernel/linux/nexus_orchestrator.py "$@"
W

cat > ${NH}/bin/nexus-cli <<'W'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app NEXUS_HOME=/opt/nexus
P="/opt/nexus/.venv/bin/python"; [ ! -f "$P" ] && P="$(which python3 2>/dev/null || which python)"
exec "$P" /opt/nexus/app/kernel/linux/nexus_orchestrator.py --no-api "$@"
W

cat > ${NH}/bin/nexus-setup <<'W'
#!/bin/bash
set -e
V="/opt/nexus/.venv"; K="/opt/nexus/app/kernel"
if [ ! -d "$V" ]; then
    echo "🔧 Creating Python environment..."
    python -m venv "$V"
    "$V/bin/pip" install -q --upgrade pip
    [ -f "$K/requirements.lock.txt" ] && "$V/bin/pip" install -q -r "$K/requirements.lock.txt" && echo "✅ Done" && exit 0
    [ -f "$K/requirements.txt" ] && "$V/bin/pip" install -q -r "$K/requirements.txt" && echo "✅ Done" && exit 0
    "$V/bin/pip" install -q aiohttp pydantic psutil python-dotenv PyYAML numpy lancedb langchain langchain-ollama
    echo "✅ Python environment ready"
else
    echo "✅ Python environment already exists"
fi
W

chmod +x ${NH}/bin/*
ln -sf ${NH}/bin/nexus-core /usr/local/bin/nexus-core
ln -sf ${NH}/bin/nexus-kernel /usr/local/bin/nexus-kernel
ln -sf ${NH}/bin/nexus-cli /usr/local/bin/nexus-cli
ln -sf ${NH}/bin/nexus-setup /usr/local/bin/nexus-setup

# ── Disk installer ──
cat > /usr/local/bin/nexus-install <<'INST'
#!/bin/bash
set -e
echo "  🧠 Nexus AIOS — Install to Disk"
[ "$EUID" -ne 0 ] && echo "Run: sudo nexus-install" && exit 1
echo "Disks:"; lsblk -d -o NAME,SIZE,TYPE,MODEL | grep disk; echo ""
read -p "Target (e.g., sda): " D; T="/dev/$D"
[ ! -b "$T" ] && echo "Not valid" && exit 1
echo "⚠️ ERASE ALL on $T?"; read -p "YES to confirm: " C; [ "$C" != "YES" ] && exit 0
parted -s $T mklabel gpt
parted -s $T mkpart primary fat32 1MiB 513MiB
parted -s $T set 1 esp on
parted -s $T mkpart primary ext4 513MiB 100%
[[ "$D" == nvme* ]] && P1="${T}p1" && P2="${T}p2" || P1="${T}1" && P2="${T}2"
mkfs.fat -F32 $P1; mkfs.ext4 -F $P2
mount $P2 /mnt; mkdir -p /mnt/boot/efi; mount $P1 /mnt/boot/efi
pacstrap /mnt base linux linux-firmware python python-pip python-virtualenv networkmanager openssh git curl dbus htop neofetch grub efibootmgr
genfstab -U /mnt >> /mnt/etc/fstab
cp -r /opt/nexus /mnt/opt/; cp /usr/local/bin/nexus-* /mnt/usr/local/bin/ 2>/dev/null; cp /etc/motd /mnt/etc/ 2>/dev/null
echo "nexus-aios" > /mnt/etc/hostname
arch-chroot /mnt bash -c 'ln -sf /usr/share/zoneinfo/UTC /etc/localtime; hwclock --systohc; echo "en_US.UTF-8 UTF-8">>/etc/locale.gen; locale-gen; echo LANG=en_US.UTF-8>/etc/locale.conf; useradd -m -G wheel -s /bin/bash nexus 2>/dev/null||true; echo nexus:nexus|chpasswd; echo "nexus ALL=(ALL) NOPASSWD:ALL">/etc/sudoers.d/nexus; grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=NexusAIOS; grub-mkconfig -o /boot/grub/grub.cfg; systemctl enable NetworkManager sshd; curl -fsSL https://ollama.com/install.sh|sh 2>/dev/null||true'
umount -R /mnt; echo "✅ Done! Reboot. Login: nexus/nexus"
INST
chmod +x /usr/local/bin/nexus-install

# ── Branding ──
cat > /etc/motd <<'MOTD'

  ╔═══════════════════════════════════════════════════════════╗
  ║           🧠  N E X U S   A I O S                         ║
  ║           Hybrid AI Operating System                      ║
  ║           Powered by Arch Linux                           ║
  ╠═══════════════════════════════════════════════════════════╣
  ║   nexus-setup           — Install Python deps (first!)    ║
  ║   nexus-cli             — Chat with the AI                ║
  ║   sudo nexus-install    — Install permanently to disk     ║
  ╚═══════════════════════════════════════════════════════════╝

MOTD

cat > /etc/os-release <<'OSREL'
NAME="Nexus AIOS"
PRETTY_NAME="Nexus AIOS 1.0.0 (Arch Linux)"
ID=nexus
ID_LIKE=arch
VERSION="1.0.0"
OSREL

echo "nexus-aios" > /etc/hostname
echo "   ✅ Nexus AIOS fully installed. Run nexus-setup then nexus-cli"
SETUP

chmod +x "${WORK}/newiso/nexus/setup.sh"

# Also create an auto-run profile hook
# When root auto-logs in, this runs the Nexus setup once
mkdir -p "${WORK}/newiso/nexus"
cat > "${WORK}/newiso/nexus/auto-setup.sh" <<'AUTORUN'
#!/bin/bash
# Auto-run on first live boot: inject into root's profile
MARKER="/tmp/.nexus-setup-done"
if [ ! -f "$MARKER" ]; then
    # Find ISO mount
    ISO=""
    for p in /run/archiso/bootmnt /mnt/archiso; do
        [ -f "$p/nexus/setup.sh" ] && ISO="$p" && break
    done
    if [ -n "$ISO" ]; then
        bash "$ISO/nexus/setup.sh"
        touch "$MARKER"
    fi
fi
cat /etc/motd 2>/dev/null
AUTORUN
chmod +x "${WORK}/newiso/nexus/auto-setup.sh"

PAYLOAD_SIZE=$(du -sh "${WORK}/newiso/nexus/" | cut -f1)
echo "   ✅ Payload: ${PAYLOAD_SIZE} injected"

# ─── Modify boot to brand it ─────────────────────────────────
# Update GRUB/syslinux menu titles
find "${WORK}/newiso" -name "grub.cfg" -exec sed -i 's/Arch Linux/Nexus AIOS/g' {} \; 2>/dev/null || true
find "${WORK}/newiso" -name "*.cfg" -exec sed -i 's/Arch Linux/Nexus AIOS/g' {} \; 2>/dev/null || true

echo "   ✅ Boot menu branded"

# ─── Repack ISO ───────────────────────────────────────────────
echo "[5/5] Repacking ISO..."

# Find the boot files for xorriso
ISOHDPFX=$(find "${WORK}/newiso" -name "isohdpfx.bin" 2>/dev/null | head -1)
EFIBOOT=$(find "${WORK}/newiso" -name "efiboot.img" -o -name "efiboot.fat" 2>/dev/null | head -1)
ISOLINUX=$(find "${WORK}/newiso" -name "isolinux.bin" 2>/dev/null | head -1)
ELTORITO=$(find "${WORK}/newiso" -name "eltorito.img" 2>/dev/null | head -1)

# Make paths relative to newiso
REL_EFIBOOT=""
REL_ISOLINUX=""
if [ -n "$EFIBOOT" ]; then
    REL_EFIBOOT="${EFIBOOT#${WORK}/newiso/}"
fi
if [ -n "$ISOLINUX" ]; then
    REL_ISOLINUX="${ISOLINUX#${WORK}/newiso/}"
fi

echo "   Boot files: isohdpfx=$([ -n "$ISOHDPFX" ] && echo "✅" || echo "❌") efi=$([ -n "$REL_EFIBOOT" ] && echo "✅" || echo "❌") syslinux=$([ -n "$REL_ISOLINUX" ] && echo "✅" || echo "❌")"

# Build ISO — try full BIOS+EFI hybrid first, then fallback
if [ -n "$ISOHDPFX" ] && [ -n "$REL_ISOLINUX" ] && [ -n "$REL_EFIBOOT" ]; then
    echo "   Building hybrid BIOS+EFI ISO..."
    xorriso -as mkisofs \
        -iso-level 3 \
        -full-iso9660-filenames \
        -volid "NEXUS_AIOS" \
        -b "${REL_ISOLINUX}" \
        -no-emul-boot -boot-load-size 4 -boot-info-table \
        -isohybrid-mbr "${ISOHDPFX}" \
        -eltorito-alt-boot \
        -e "${REL_EFIBOOT}" \
        -no-emul-boot -isohybrid-gpt-basdat \
        -output "$OUTPUT" \
        "${WORK}/newiso"

elif [ -n "$ELTORITO" ] && [ -n "$REL_EFIBOOT" ]; then
    REL_ELTORITO="${ELTORITO#${WORK}/newiso/}"
    echo "   Building EFI ISO..."
    xorriso -as mkisofs \
        -iso-level 3 \
        -full-iso9660-filenames \
        -volid "NEXUS_AIOS" \
        -eltorito-boot "${REL_ELTORITO}" \
        -no-emul-boot \
        -eltorito-alt-boot \
        -e "${REL_EFIBOOT}" \
        -no-emul-boot -isohybrid-gpt-basdat \
        -output "$OUTPUT" \
        "${WORK}/newiso"
else
    echo "   Building basic ISO..."
    xorriso -as mkisofs \
        -iso-level 3 \
        -full-iso9660-filenames \
        -volid "NEXUS_AIOS" \
        -output "$OUTPUT" \
        "${WORK}/newiso"
fi

# ─── Report ───────────────────────────────────────────────────
if [ -f "$OUTPUT" ]; then
    SIZE=$(du -h "$OUTPUT" | cut -f1)
    SHA=$(sha256sum "$OUTPUT" | cut -d' ' -f1)
    echo ""
    echo "  ═══════════════════════════════════════════════"
    echo "  ✅ Nexus AIOS ISO Built!"
    echo "  ═══════════════════════════════════════════════"
    echo ""
    echo "  📀 ISO:    $OUTPUT"
    echo "  📏 Size:   $SIZE"
    echo "  🔑 SHA256: $SHA"
    echo ""
    echo "  Next steps:"
    echo "    1. Open VMware Player → New VM"
    echo "    2. Point to this ISO"
    echo "    3. Guest: Other Linux 5.x 64-bit"
    echo "    4. RAM ≥ 8GB, Disk ≥ 40GB"
    echo "    5. Boot → auto-login as root"
    echo "    6. Run: bash /run/archiso/bootmnt/nexus/setup.sh"
    echo "    7. Run: nexus-setup   (install Python deps)"
    echo "    8. Run: nexus-cli     (chat with AI)"
    echo ""
else
    echo "❌ ISO build failed"
    exit 1
fi

# Cleanup
rm -rf "${WORK}/mnt" 2>/dev/null
echo "  Temp files at ${WORK} — delete when done"
