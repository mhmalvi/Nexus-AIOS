#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Nexus AIOS — ISO Builder v4 (proper boot image replay)
#  
#  Run: wsl -d Ubuntu -u root -- bash THIS_SCRIPT
# ═══════════════════════════════════════════════════════════════
set -eo pipefail

PROJECT="/mnt/i/CYBERPUNK/nexus-ag"
ORIG_ISO="${PROJECT}/archlinux-2026.01.01-x86_64.iso"
OUTPUT="${PROJECT}/nexus-aios-1.0.0.iso"
PAYLOAD="/tmp/nexus-payload"

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║   🧠 Nexus AIOS — ISO Builder v4             ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Build payload ───────────────────────────────────
echo "[1/3] Building Nexus payload..."
rm -rf "$PAYLOAD"
mkdir -p "$PAYLOAD/nexus"

cp -r ${PROJECT}/nexus-app/kernel ${PAYLOAD}/nexus/
find ${PAYLOAD}/nexus/kernel -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
find ${PAYLOAD}/nexus/kernel -name '*.pyc' -delete 2>/dev/null || true
rm -rf ${PAYLOAD}/nexus/kernel/venv 2>/dev/null || true

# Create setup.sh (embedded in the ISO payload)
cat > ${PAYLOAD}/nexus/setup.sh <<'SETUP'
#!/bin/bash
set -e
echo ""
echo "  🧠 Installing Nexus AIOS..."
echo ""
NH="/opt/nexus"
mkdir -p ${NH}/{app,bin,data}
mkdir -p /var/lib/nexus/{lancedb,config,models}
mkdir -p /var/log/nexus

ISO=""
for p in /run/archiso/bootmnt /mnt/archiso /cdrom; do
    [ -d "$p/nexus/kernel" ] && ISO="$p" && break
done
if [ -z "$ISO" ]; then
    SD="$(cd "$(dirname "$0")" && pwd)"
    ISO="$(dirname "$SD")"
fi

cp -r "${ISO}/nexus/kernel" ${NH}/app/
echo "   ✅ Kernel deployed"

cat > ${NH}/bin/nexus-kernel <<'BIN'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app NEXUS_HOME=/opt/nexus NEXUS_DATA=/var/lib/nexus
P="/opt/nexus/.venv/bin/python"
[ ! -f "$P" ] && P="$(which python3 2>/dev/null || which python)"
exec "$P" /opt/nexus/app/kernel/main.py "$@"
BIN

cat > ${NH}/bin/nexus-core <<'BIN'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app NEXUS_HOME=/opt/nexus NEXUS_DATA=/var/lib/nexus
P="/opt/nexus/.venv/bin/python"
[ ! -f "$P" ] && P="$(which python3 2>/dev/null || which python)"
exec "$P" /opt/nexus/app/kernel/linux/nexus_orchestrator.py "$@"
BIN

cat > ${NH}/bin/nexus-cli <<'BIN'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app NEXUS_HOME=/opt/nexus
P="/opt/nexus/.venv/bin/python"
[ ! -f "$P" ] && P="$(which python3 2>/dev/null || which python)"
exec "$P" /opt/nexus/app/kernel/linux/nexus_orchestrator.py --no-api "$@"
BIN

cat > ${NH}/bin/nexus-setup <<'BIN'
#!/bin/bash
set -e
V="/opt/nexus/.venv"; K="/opt/nexus/app/kernel"
if [ ! -d "$V" ]; then
    echo "🔧 Creating Python environment..."
    python -m venv "$V"
    "$V/bin/pip" install -q --upgrade pip
    if [ -f "$K/requirements.lock.txt" ]; then
        "$V/bin/pip" install -q -r "$K/requirements.lock.txt"
    elif [ -f "$K/requirements.txt" ]; then
        "$V/bin/pip" install -q -r "$K/requirements.txt"
    else
        "$V/bin/pip" install -q aiohttp pydantic psutil python-dotenv PyYAML numpy
    fi
    echo "✅ Python environment ready"
else
    echo "✅ Environment already exists"
fi
BIN

chmod +x ${NH}/bin/*
ln -sf ${NH}/bin/nexus-core /usr/local/bin/nexus-core
ln -sf ${NH}/bin/nexus-kernel /usr/local/bin/nexus-kernel
ln -sf ${NH}/bin/nexus-cli /usr/local/bin/nexus-cli
ln -sf ${NH}/bin/nexus-setup /usr/local/bin/nexus-setup

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
echo "nexus-aios" > /etc/hostname
echo ""
echo "   ✅ Nexus AIOS installed! Run: nexus-setup then nexus-cli"
SETUP
chmod +x ${PAYLOAD}/nexus/setup.sh

echo "   Payload ready: $(du -sh ${PAYLOAD}/nexus | cut -f1)"

# ─── Step 2: Verify original ISO is bootable ─────────────────
echo ""
echo "[2/3] Analyzing original ISO boot records..."
xorriso -indev "$ORIG_ISO" -report_el_torito plain 2>&1 | head -20
echo "---"
xorriso -indev "$ORIG_ISO" -report_el_torito as_mkisofs 2>&1 | head -20

# ─── Step 3: Build new ISO with boot replay ──────────────────
echo ""
echo "[3/3] Building bootable Nexus AIOS ISO..."
echo "   Reading from: $ORIG_ISO"
echo "   Writing to:   $OUTPUT"
echo "   Adding:       /nexus ($(du -sh ${PAYLOAD}/nexus | cut -f1))"
echo ""

# The magic: -indev reads original, -outdev writes new,
# -boot_image any replay copies boot records exactly
xorriso \
    -indev "$ORIG_ISO" \
    -outdev "$OUTPUT" \
    -boot_image any replay \
    -map "${PAYLOAD}/nexus" "/nexus" \
    -end 2>&1

echo ""
echo "=== Verifying output ISO ==="
xorriso -indev "$OUTPUT" -report_el_torito plain 2>&1 | head -10
echo "---"
xorriso -indev "$OUTPUT" -ls / 2>&1 | grep "'"

SIZE=$(du -h "$OUTPUT" | cut -f1)

echo ""
echo "  ═══════════════════════════════════════════════"
echo "  ✅ Nexus AIOS ISO Ready!"
echo "  ═══════════════════════════════════════════════"
echo ""
echo "  📀 ISO:  $OUTPUT"
echo "  📏 Size: $SIZE"
echo ""
echo "  Boot in VMware → run setup.sh → nexus-cli"
echo ""

rm -rf "$PAYLOAD"
