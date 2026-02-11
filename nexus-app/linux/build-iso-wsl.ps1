# ═══════════════════════════════════════════════════════════════════
#  Nexus AIOS — Build Arch Linux ISO from Windows
#
#  This script uses WSL with Arch Linux to build the Nexus AIOS ISO.
#
#  Prerequisites:
#    Option A: WSL with Arch Linux
#      - Install from Microsoft Store: "Arch WSL" or ArchWSL
#      - Or use: https://github.com/yuk7/ArchWSL
#
#    Option B: WSL with Ubuntu (uses docker to run archiso)
#      - wsl --install -d Ubuntu
#      - Docker must be available in WSL
#
#  Usage:
#    .\build-iso-wsl.ps1
#    .\build-iso-wsl.ps1 -UseDocker    # Use Docker if no Arch WSL
# ═══════════════════════════════════════════════════════════════════

param(
    [switch]$UseDocker
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ╔═══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║  🧠 Nexus AIOS — Arch Linux ISO Builder      ║" -ForegroundColor Cyan
Write-Host "  ╚═══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Get paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path "$scriptDir\..\..").Path
$linuxProjectRoot = ($projectRoot -replace '\\', '/' -replace '^([A-Za-z]):', '/mnt/$1').ToLower()

Write-Host "📁 Project root: $projectRoot"
Write-Host "🐧 WSL path:     $linuxProjectRoot"
Write-Host ""

# Check WSL
$wslDistros = wsl --list --quiet 2>$null
if (-not $wslDistros) {
    Write-Host "❌ WSL not available." -ForegroundColor Red
    Write-Host "   Install WSL: wsl --install" -ForegroundColor Yellow
    Write-Host "   Install Arch: https://github.com/yuk7/ArchWSL" -ForegroundColor Yellow
    exit 1
}

# Detect Arch Linux in WSL
$hasArch = $wslDistros | Where-Object { $_ -match "Arch" }

if ($hasArch -and -not $UseDocker) {
    # ─── Method 1: Direct Arch WSL ────────────────────────────────
    Write-Host "🏗️  Using Arch Linux WSL directly" -ForegroundColor Green
    Write-Host ""

    # Install archiso
    Write-Host "[1/3] Installing archiso in Arch WSL..." -ForegroundColor Yellow
    wsl -d Arch -- bash -c "sudo pacman -Syu --noconfirm --needed archiso git base-devel"

    # Run the ISO builder
    Write-Host "[2/3] Building Nexus AIOS ISO..." -ForegroundColor Yellow
    $outputPath = "$linuxProjectRoot/nexus-app"
    wsl -d Arch -- sudo bash "$linuxProjectRoot/nexus-app/linux/build-iso.sh"

    Write-Host "[3/3] Build complete!" -ForegroundColor Green

}
else {
    # ─── Method 2: Docker with Arch container ─────────────────────
    Write-Host "🐳 Using Docker with Arch Linux container" -ForegroundColor Green
    Write-Host ""

    # Check Docker in WSL
    Write-Host "[1/3] Checking Docker..." -ForegroundColor Yellow
    wsl bash -c "docker --version" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Docker not available in WSL." -ForegroundColor Red
        Write-Host "   Install Docker Desktop or run in WSL:" -ForegroundColor Yellow
        Write-Host "     curl -fsSL https://get.docker.com | sh" -ForegroundColor Gray
        exit 1
    }

    # Build ISO using Arch Linux Docker container
    Write-Host "[2/3] Building ISO in Arch container..." -ForegroundColor Yellow

    $dockerCmd = @"
docker run --rm --privileged \
    -v "$linuxProjectRoot":/nexus \
    -v /tmp/nexus-iso-output:/output \
    archlinux:latest bash -c '
        pacman -Syu --noconfirm archiso git base-devel &&
        cd /nexus/nexus-app &&
        OUTPUT_DIR=/output bash linux/build-iso.sh
    '
"@
    wsl bash -c $dockerCmd

    # Copy output
    Write-Host "[3/3] Copying ISO..." -ForegroundColor Yellow
    wsl bash -c "cp /tmp/nexus-iso-output/nexus-aios-*.iso '$linuxProjectRoot/nexus-app/'"
}

# Check for output
$isoPath = Get-ChildItem "$projectRoot\nexus-app\nexus-aios-*.iso" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($isoPath) {
    Write-Host ""
    Write-Host "  ═══════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  ✅ Nexus AIOS ISO Built Successfully!" -ForegroundColor Green
    Write-Host "  ═══════════════════════════════════════════════" -ForegroundColor Green
    Write-Host ""
    Write-Host "  📀 ISO: $($isoPath.FullName)" -ForegroundColor White
    Write-Host "  📏 Size: $([math]::Round($isoPath.Length / 1GB, 2)) GB" -ForegroundColor White
    Write-Host ""
    Write-Host "  VMware Player:" -ForegroundColor Yellow
    Write-Host "    1. Create New VM → Linux → Other Linux 5.x 64-bit" -ForegroundColor Gray
    Write-Host "    2. Point to this ISO" -ForegroundColor Gray
    Write-Host "    3. RAM ≥ 8GB, Disk ≥ 40GB, EFI firmware" -ForegroundColor Gray
    Write-Host "    4. Boot → auto-login as 'nexus'" -ForegroundColor Gray
    Write-Host "    5. Run: sudo nexus-install  (install to disk)" -ForegroundColor Gray
    Write-Host "    6. Run: nexus-cli           (chat with AI)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Live login: nexus / nexus" -ForegroundColor Yellow
}
else {
    Write-Host ""
    Write-Host "⚠️ ISO may have built but wasn't found locally." -ForegroundColor Yellow
    Write-Host "   Check: $projectRoot\nexus-app\" -ForegroundColor Gray
}
