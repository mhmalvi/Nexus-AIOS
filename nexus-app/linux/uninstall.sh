#!/bin/bash
# Nexus AIOS Uninstaller

set -e

echo "Uninstalling Nexus AIOS..."

if [ "$EUID" -ne 0 ]; then 
  echo "Please run as root"
  exit 1
fi

echo "Stopping services..."
systemctl stop nexus-kernel || true
systemctl disable nexus-kernel || true

echo "Removing systemd units..."
rm -f /etc/systemd/system/nexus-kernel.service
systemctl daemon-reload

echo "Removing application files..."
rm -rf /opt/nexus

echo "Removing D-Bus configuration..."
rm -f /usr/share/dbus-1/system.d/org.nexus.Agent.conf

read -p "Remove user data (/var/lib/nexus)? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf /var/lib/nexus
    rm -rf /var/log/nexus
    echo "User data removed."
fi

# Optional: remove user
# userdel nexus

echo "Uninstallation complete."
