<#
.SYNOPSIS
    Install the `aether` CLI as a global command on Windows (current user).

.DESCRIPTION
    Creates an install dir under %LOCALAPPDATA%\Programs\Aether, places a launcher
    there, and adds it to the user PATH. If a PyInstaller build exists
    (kernel\dist\aether\aether.exe) it is copied for a self-contained command;
    otherwise a shim that runs the CLI from the source tree is installed.

    Open a new terminal afterwards, then run:  aether

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install-aether.ps1
#>

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$appRoot   = Split-Path -Parent $scriptDir            # nexus-app
$kernelDir = Join-Path $appRoot "kernel"
$distDir   = Join-Path $kernelDir "dist\aether"
$venvExe   = Join-Path $kernelDir "venv\Scripts\aether.exe"
$venvPy    = Join-Path $kernelDir "venv\Scripts\python.exe"
$installDir = Join-Path $env:LOCALAPPDATA "Programs\Aether"

Write-Host "Installing AETHER CLI to $installDir" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

$shimPath = Join-Path $installDir "aether.cmd"

if (Test-Path (Join-Path $distDir "aether.exe")) {
    Write-Host "  Found PyInstaller build - copying self-contained binary..." -ForegroundColor Green
    Copy-Item -Path (Join-Path $distDir "*") -Destination $installDir -Recurse -Force
} elseif (Test-Path $venvExe) {
    Write-Host "  Found venv install (pip install -e) - shimming to it." -ForegroundColor Green
    $lines = @('@echo off', ('"' + $venvExe + '" %*'), 'exit /b %ERRORLEVEL%')
    Set-Content -Path $shimPath -Value ($lines -join "`r`n") -Encoding ASCII
} elseif (Test-Path $venvPy) {
    Write-Host "  Found kernel venv - shimming to its Python." -ForegroundColor Green
    $lines = @('@echo off', ('"' + $venvPy + '" "' + $kernelDir + '\aether_cli.py" %*'), 'exit /b %ERRORLEVEL%')
    Set-Content -Path $shimPath -Value ($lines -join "`r`n") -Encoding ASCII
} else {
    Write-Host "  No build or venv found - installing a system-Python source shim." -ForegroundColor Yellow
    Write-Host "  (Requires deps on system Python, or run: py kernel\build.py)" -ForegroundColor Yellow
    $lines = @(
        '@echo off',
        'setlocal',
        'where py >nul 2>nul',
        'if %ERRORLEVEL%==0 (',
        ('  py "' + $kernelDir + '\aether_cli.py" %*'),
        '  exit /b %ERRORLEVEL%',
        ')',
        ('python "' + $kernelDir + '\aether_cli.py" %*'),
        'exit /b %ERRORLEVEL%'
    )
    Set-Content -Path $shimPath -Value ($lines -join "`r`n") -Encoding ASCII
}

# Add install dir to the user PATH if not already present.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$installDir*") {
    $newPath = if ([string]::IsNullOrEmpty($userPath)) { $installDir } else { "$userPath;$installDir" }
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Host "  Added $installDir to user PATH." -ForegroundColor Green
} else {
    Write-Host "  Install dir already on PATH." -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Open a NEW terminal and run:  aether" -ForegroundColor Cyan
