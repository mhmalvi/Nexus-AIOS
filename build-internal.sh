#!/bin/bash
set -e
echo "➡️  Inside Docker: Setting up archiso profile..."

# Use container-local filesystem for work (NTFS breaks symlinks/devnodes)
WORK="/tmp/archiso-work"
mkdir -p "$WORK"

# Copy standard releng profile into the profile dir
cp -r /usr/share/archiso/configs/releng/* /build/profile/

# Overlay Nexus files into the profile
# Overlay Nexus files into the profile
echo "   Overlaying Nexus files..."
# Copy kernel source
mkdir -p /build/profile/airootfs/opt/nexus/kernel
echo "   Copying kernel..."
cp -r /build/nexus-app/kernel/* /build/profile/airootfs/opt/nexus/kernel/

# If nexus-overlay exists, copy it (for config files etc)
if [ -d "/build/nexus-overlay/airootfs" ]; then
    cp -r /build/nexus-overlay/airootfs/* /build/profile/airootfs/
fi

# Fix execute permissions (NTFS doesn't preserve +x)
echo "   Fixing permissions..."
chmod +x /build/profile/airootfs/opt/nexus/bin/* 2>/dev/null || true
chmod +x /build/profile/airootfs/usr/local/bin/* 2>/dev/null || true
chmod +x /build/profile/airootfs/opt/nexus/kernel/*.py 2>/dev/null || true
chmod +x /build/profile/airootfs/opt/nexus/kernel/main.py 2>/dev/null || true

# Add extra packages
echo "   Adding packages..."
cat >> /build/profile/packages.x86_64 <<PKGS
python
python-pip
python-virtualenv
git
fastfetch
curl
wget
htop
PKGS

# Build the ISO — work dir is on container's own ext4 filesystem
echo "➡️  Starting mkarchiso (work dir: $WORK)..."
mkarchiso -v -w "$WORK" -o /build/out /build/profile

echo "✅ mkarchiso complete!"
ls -lh /build/out/
