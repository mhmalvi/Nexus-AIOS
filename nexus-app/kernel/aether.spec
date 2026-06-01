# -*- mode: python ; coding: utf-8 -*-

"""
AETHER CLI - PyInstaller Specification
Bundles the `aether` agentic CLI into a standalone executable folder.

Built alongside the kernel by build.py. Produces dist/aether/aether(.exe),
which the desktop installer and the Linux ISO place on PATH as `aether`.
"""

from PyInstaller.utils.hooks import collect_all

block_cipher = None

# Hidden imports for the kernel subsystems the CLI loads dynamically
# (try/except guarded — bundle what we can, the CLI degrades if absent).
hidden_imports = [
    'aiohttp',
    'pydantic',
    'lancedb',
    'numpy',
]

datas = []

# LanceDB powers the optional memory tier; bundle it so `/memory` works.
try:
    tmp_ret = collect_all('lancedb')
    datas += tmp_ret[0]
    hidden_imports += tmp_ret[1]
except Exception:
    pass


a = Analysis(
    ['aether_cli.py'],
    pathex=['.'],          # ensure sibling kernel packages are importable
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Voice/whisper are not used by the CLI — keep the binary lean.
        'faster_whisper', 'openwakeword', 'sounddevice', 'piper',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='aether',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='aether',
)
