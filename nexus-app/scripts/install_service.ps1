
# Install Nexus as Windows Service
# Requires Administrator privileges

param (
    [string]$Action = "Install" # Install, Uninstall, Start, Stop
)

$ServiceName = "NexusAIOS"
$BinPath = Join-Path $PSScriptRoot "..\src-tauri\target\release\nexus-app.exe"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "You must run this script as Administrator!"
    exit 1
}

switch ($Action) {
    "Install" {
        Write-Host "Installing $ServiceName..."
        New-Service -Name $ServiceName -BinaryPathName $BinPath -DisplayName "Nexus AIOS Kernel" -StartupType Automatic
        Write-Host "Done."
    }
    "Uninstall" {
        Write-Host "Uninstalling $ServiceName..."
        Remove-Service -Name $ServiceName
        Write-Host "Done."
    }
    "Start" {
        Start-Service -Name $ServiceName
    }
    "Stop" {
        Stop-Service -Name $ServiceName
    }
}
