#!/bin/bash
set -eo pipefail

PROJECT="/mnt/i/CYBERPUNK/nexus-ag"
PAYLOAD="/tmp/nexus-payload"
OUTPUT="${PROJECT}/nexus-data.iso"

echo "🧠 Building Nexus data ISO..."

rm -rf "$PAYLOAD"
mkdir -p "$PAYLOAD/nexus"

cp -r ${PROJECT}/nexus-app/kernel ${PAYLOAD}/nexus/
find ${PAYLOAD}/nexus/kernel -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
find ${PAYLOAD}/nexus/kernel -name '*.pyc' -delete 2>/dev/null || true
rm -rf ${PAYLOAD}/nexus/kernel/venv 2>/dev/null || true

# Copy the setup script that's already in rebuild-iso.sh as a heredoc
# We create a fresh one here
cat > ${PAYLOAD}/nexus/setup.sh <<'MAINSETUP'
#!/bin/bash
set -e
echo ""
echo "  🧠 Installing Nexus AIOS..."
echo ""
NH="/opt/nexus"
mkdir -p ${NH}/{app,bin,data}
mkdir -p /var/lib/nexus/{lancedb,config,models}
mkdir -p /var/log/nexus

# Find data disc
DATA=""
for p in /mnt/nexus-data /mnt/cdrom1 /run/media/root/NEXUS_DATA; do
    if [ -d "$p/nexus/kernel" ]; then
        DATA="$p"
        break
    fi
done
if [ -z "$DATA" ]; then
    for dev in /dev/sr1 /dev/sr0 /dev/cdrom1; do
        if [ -b "$dev" ]; then
            mkdir -p /mnt/nexus-data
            mount "$dev" /mnt/nexus-data 2>/dev/null || true
            if [ -d /mnt/nexus-data/nexus/kernel ]; then
                DATA="/mnt/nexus-data"
                break
            fi
            umount /mnt/nexus-data 2>/dev/null || true
        fi
    done
fi
if [ -z "$DATA" ]; then
    SD="$(cd "$(dirname "$0")" && pwd)"
    if [ -d "$(dirname "$SD")/nexus/kernel" ]; then
        DATA="$(dirname "$SD")"
    else
        DATA="$SD/.."
    fi
fi

echo "   Source: $DATA"
cp -r "${DATA}/nexus/kernel" ${NH}/app/
echo "   ✅ Kernel deployed"

# Create executables
cat > ${NH}/bin/nexus-kernel <<'BIN'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app NEXUS_HOME=/opt/nexus NEXUS_DATA=/var/lib/nexus
P="/opt/nexus/.venv/bin/python"
if [ ! -f "$P" ]; then P="$(which python3 2>/dev/null || which python)"; fi
exec "$P" /opt/nexus/app/kernel/main.py "$@"
BIN

cat > ${NH}/bin/nexus-core <<'BIN'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app NEXUS_HOME=/opt/nexus NEXUS_DATA=/var/lib/nexus
P="/opt/nexus/.venv/bin/python"
if [ ! -f "$P" ]; then P="$(which python3 2>/dev/null || which python)"; fi
exec "$P" /opt/nexus/app/kernel/linux/nexus_orchestrator.py "$@"
BIN

cat > ${NH}/bin/nexus-cli <<'BIN'
#!/bin/bash
export PYTHONPATH=/opt/nexus/app NEXUS_HOME=/opt/nexus
P="/opt/nexus/.venv/bin/python"
if [ ! -f "$P" ]; then P="$(which python3 2>/dev/null || which python)"; fi
exec "$P" /opt/nexus/app/kernel/linux/nexus_orchestrator.py --no-api "$@"
BIN

cat > ${NH}/bin/nexus-setup <<'BIN'
#!/bin/bash
set -e
V="/opt/nexus/.venv"
K="/opt/nexus/app/kernel"
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
    echo "✅ Environment exists"
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
  ║           Powered by Arch Linux                           ║
  ╠═══════════════════════════════════════════════════════════╣
  ║   nexus-setup    — Install Python deps (run first!)       ║
  ║   nexus-cli      — Chat with the AI                       ║
  ╚═══════════════════════════════════════════════════════════╝

MOTD
echo "nexus-aios" > /etc/hostname
echo ""
echo "   ✅ Nexus AIOS installed!"
echo "   Run: nexus-setup   then   nexus-cli"
MAINSETUP
chmod +x ${PAYLOAD}/nexus/setup.sh

echo "Payload: $(du -sh ${PAYLOAD}/nexus | cut -f1)"

# Build simple data ISO
rm -f "$OUTPUT"
xorriso -as mkisofs \
    -iso-level 3 \
    -full-iso9660-filenames \
    -joliet \
    -rational-rock \
    -volid "NEXUS_DATA" \
    -output "$OUTPUT" \
    "$PAYLOAD" 2>&1 | tail -5

if [ -f "$OUTPUT" ]; then
    SIZE=$(du -h "$OUTPUT" | cut -f1)
    echo ""
    echo "  ✅ Nexus data ISO built: $SIZE"
    echo "  File: $OUTPUT"
else
    echo "  ❌ Failed"
fi

rm -rf "$PAYLOAD"
