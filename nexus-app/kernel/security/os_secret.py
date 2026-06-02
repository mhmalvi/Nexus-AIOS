"""
OS-native secret protection (M1-3).

Wraps a small blob (e.g. the Fernet vault key) with the operating system's
user-bound secret facility so that read access to the file alone is NOT enough
to recover it:

  * Windows  → DPAPI (CryptProtectData, user scope) via ctypes — no extra deps.
  * Any OS   → the `keyring` library if installed (Credential Manager / macOS
               Keychain / libsecret), used by the caller for true keystore use.
  * Fallback → identity passthrough; on Unix the key file is still chmod 0600.

DPAPI-wrapped blobs carry a magic header so we can transparently migrate a
previously-plaintext key file to a protected one.
"""

from __future__ import annotations

import os
import sys

_DPAPI_MAGIC = b"DPAPI1:"


def _win_dpapi(data: bytes, encrypt: bool) -> bytes:
    """Call CryptProtectData / CryptUnprotectData via ctypes (user scope)."""
    import ctypes
    from ctypes import wintypes

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD),
                    ("pbData", ctypes.POINTER(ctypes.c_char))]

    def _to_blob(b: bytes) -> "DATA_BLOB":
        buf = ctypes.create_string_buffer(b, len(b))
        return DATA_BLOB(len(b), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))

    def _from_blob(blob: "DATA_BLOB") -> bytes:
        out = ctypes.string_at(blob.pbData, blob.cbData)
        return out

    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32

    in_blob = _to_blob(data)
    out_blob = DATA_BLOB()
    fn = crypt32.CryptProtectData if encrypt else crypt32.CryptUnprotectData
    # (pDataIn, desc, entropy, reserved, prompt, flags, pDataOut)
    if not fn(ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)):
        raise OSError("DPAPI operation failed")
    try:
        return _from_blob(out_blob)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def protect(data: bytes) -> bytes:
    """Return an OS-protected form of `data` (or `data` unchanged if no facility)."""
    if sys.platform == "win32":
        try:
            return _DPAPI_MAGIC + _win_dpapi(data, encrypt=True)
        except Exception:
            return data
    return data


def unprotect(blob: bytes) -> bytes:
    """Reverse `protect`. Passes through blobs that were never protected."""
    if blob.startswith(_DPAPI_MAGIC):
        if sys.platform != "win32":
            raise OSError("DPAPI-protected blob cannot be read off Windows")
        return _win_dpapi(blob[len(_DPAPI_MAGIC):], encrypt=False)
    return blob


def is_protected(blob: bytes) -> bool:
    return blob.startswith(_DPAPI_MAGIC)


def available() -> bool:
    """True if an OS-native protection facility is in effect (beyond file perms)."""
    return sys.platform == "win32"
