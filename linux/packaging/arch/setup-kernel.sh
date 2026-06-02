#!/bin/bash
# Nexus Kernel Setup Script for Arch Linux
# Creates the Python virtual environment and installs dependencies.

set -e

KERNEL_DIR="/opt/nexus/app/kernel"
VENV_DIR="/opt/nexus/.venv"
REQUIREMENTS_LOCK="$KERNEL_DIR/requirements.lock.txt"
REQUIREMENTS="$KERNEL_DIR/requirements.txt"

echo ":: Checking Nexus Kernel environment..."

if [ ! -d "$VENV_DIR" ]; then
    echo ":: Creating virtual environment at $VENV_DIR..."
    python -m venv "$VENV_DIR"

    # Ensure updated pip
    "$VENV_DIR/bin/pip" install --upgrade pip
fi

# Prefer lock file for reproducible builds
if [ -f "$REQUIREMENTS_LOCK" ]; then
    echo ":: Installing dependencies from requirements.lock.txt..."
    "$VENV_DIR/bin/pip" install -r "$REQUIREMENTS_LOCK"
elif [ -f "$REQUIREMENTS" ]; then
    echo ":: Installing dependencies from requirements.txt..."
    "$VENV_DIR/bin/pip" install -r "$REQUIREMENTS"
else
    echo ":: WARN: No requirements file found at $KERNEL_DIR"
fi

echo ":: Kernel environment setup complete."
