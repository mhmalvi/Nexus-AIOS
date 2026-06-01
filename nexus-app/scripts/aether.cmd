@echo off
setlocal
REM ---------------------------------------------------------------------------
REM AETHER CLI launcher (Windows).
REM Prefers a bundled aether.exe placed next to this shim (PyInstaller build);
REM otherwise runs the CLI directly from the kernel source tree.
REM ---------------------------------------------------------------------------
set "HERE=%~dp0"

if exist "%HERE%aether.exe" (
  "%HERE%aether.exe" %*
  exit /b %ERRORLEVEL%
)

set "KERNEL_DIR=%HERE%..\kernel"
where py >nul 2>nul
if %ERRORLEVEL%==0 (
  py "%KERNEL_DIR%\aether_cli.py" %*
  exit /b %ERRORLEVEL%
)
python "%KERNEL_DIR%\aether_cli.py" %*
exit /b %ERRORLEVEL%
