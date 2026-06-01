# -*- mode: python ; coding: utf-8 -*-

"""
Nexus Kernel - PyInstaller Specification
Bundles the Python kernel into a single executable folder.
"""

from PyInstaller.utils.hooks import collect_all

block_cipher = None

# Collect hidden imports for dynamic loading
hidden_imports = [
    'uvicorn',
    'fastapi',
    'pydantic',
    'faster_whisper',
    'openwakeword',
    'sounddevice',
    'piper',
    'psutil',
    'lancedb',
    'numpy',
    'engineio.async_drivers.aiohttp',  # Crucial for socket.io
    'sklearn.utils._typedefs',         # Common sklearn hidden import
    'sklearn.neighbors._partition_nodes',
]

# Collect data files (models, config)
# Format: (source_path, dest_path)
datas = [
    ('en_US-lessac-medium.onnx', '.'),
    ('en_US-lessac-medium.onnx.json', '.'),
]

# Example: If we had a models folder
# datas += [('models', 'models')]

# Collect complex packages that might need binaries or data
# faster-whisper, openwakeword often need special handling
tmp_ret = collect_all('faster_whisper')
datas += tmp_ret[0]
hidden_imports += tmp_ret[1]

tmp_ret = collect_all('openwakeword')
datas += tmp_ret[0]
hidden_imports += tmp_ret[1]

tmp_ret = collect_all('lancedb')
datas += tmp_ret[0]
hidden_imports += tmp_ret[1]


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
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
    name='nexus-kernel',
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
    name='nexus-kernel',
)
