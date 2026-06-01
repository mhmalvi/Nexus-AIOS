# NexusOS WSL Bridge Creator
# Creates a minimal Nexus environment in WSL2

$ErrorActionPreference = "Stop"

Write-Host "🚀 NexusOS WSL Bridge Creator" -ForegroundColor Green

# 1. Check if WSL is installed
if (-not (Get-Command "wsl" -ErrorAction SilentlyContinue)) {
    Write-Host "Error: WSL is not installed. Please install WSL first." -ForegroundColor Red
    exit 1
}

# 2. Check if Ubuntu is installed
$distro = "Ubuntu-22.04"
if (-not (wsl --list | Select-String $distro)) {
    Write-Host "Installing $distro..."
    wsl --install -d $distro
}

# 3. Configure Distro
Write-Host "Configuring Nexus bridge in WSL..."
wsl -d $distro -u root -- bash -c "
    apt-get update && 
    apt-get install -y python3 python3-pip python3-venv git &&
    useradd -m nexus || true &&
    mkdir -p /opt/nexus &&
    chown nexus:nexus /opt/nexus
"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ NexusOS Bridge configured successfully!" -ForegroundColor Green
    Write-Host "You can now use the WSL2 bridge in Nexus AIOS."
} else {
    Write-Host "❌ Failed to configure WSL bridge." -ForegroundColor Red
}
