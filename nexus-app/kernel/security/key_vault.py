"""
Nexus Key Vault — Fernet-based encryption for API keys at rest.

Generates a machine-local encryption key on first use and stores it in
~/.aether/.vault_key (owner-only permissions on Unix). API keys are
encrypted before writing to config.json and decrypted transparently on read.

Requires: cryptography (pip install cryptography)
"""

import base64
import os
from pathlib import Path
from typing import Dict, Optional

from . import os_secret

# Graceful fallback if cryptography is not installed
try:
    from cryptography.fernet import Fernet
    FERNET_AVAILABLE = True
except ImportError:
    FERNET_AVAILABLE = False
    Fernet = None


VAULT_KEY_FILE = Path.home() / ".aether" / ".vault_key"
ENCRYPTED_PREFIX = "enc::"


class KeyVault:
    """Encrypt/decrypt API keys using Fernet symmetric encryption."""

    def __init__(self, key_path: Optional[Path] = None):
        self._key_path = key_path or VAULT_KEY_FILE
        self._fernet: Optional[object] = None

        if FERNET_AVAILABLE:
            self._fernet = Fernet(self._load_or_create_key())

    def _load_or_create_key(self) -> bytes:
        """Load the vault key from disk or generate a new one.

        On Windows the key is wrapped with DPAPI (user-bound) so that copying
        ~/.aether/.vault_key to another user/machine is useless (M1-3). A
        pre-existing plaintext key is transparently migrated to the protected
        form on load. On Unix we rely on 0600 file permissions.
        """
        self._key_path.parent.mkdir(parents=True, exist_ok=True)

        if self._key_path.exists():
            raw = self._key_path.read_bytes().strip()
            try:
                key = os_secret.unprotect(raw)
            except Exception:
                key = raw  # unreadable protection → treat as raw (will re-key below)
            # Migrate a legacy plaintext key to OS-protected storage in place.
            if not os_secret.is_protected(raw) and os_secret.available():
                self._write_key(key)
        else:
            key = Fernet.generate_key()
            self._write_key(key)

        return key

    def _write_key(self, key: bytes) -> None:
        """Persist the vault key, OS-protected where available, 0600 on Unix."""
        self._key_path.write_bytes(os_secret.protect(key))
        if os.name != "nt":
            try:
                os.chmod(self._key_path, 0o600)
                os.chmod(self._key_path.parent, 0o700)
            except OSError:
                pass

    @property
    def available(self) -> bool:
        return self._fernet is not None

    def encrypt(self, plaintext: str) -> str:
        """Encrypt a plaintext string. Returns prefixed ciphertext."""
        if not self._fernet or not plaintext:
            return plaintext
        token = self._fernet.encrypt(plaintext.encode("utf-8"))
        return ENCRYPTED_PREFIX + token.decode("ascii")

    def decrypt(self, ciphertext: str) -> str:
        """Decrypt a ciphertext string. Returns plaintext. Passes through unencrypted values."""
        if not self._fernet or not ciphertext:
            return ciphertext
        if not ciphertext.startswith(ENCRYPTED_PREFIX):
            return ciphertext  # Not encrypted, return as-is
        try:
            token = ciphertext[len(ENCRYPTED_PREFIX):].encode("ascii")
            return self._fernet.decrypt(token).decode("utf-8")
        except Exception:
            return ""  # Corrupted token — return empty rather than crash

    def encrypt_keys(self, api_keys: Dict[str, str]) -> Dict[str, str]:
        """Encrypt all non-empty API key values."""
        result = {}
        for provider, key in api_keys.items():
            if key and not key.startswith(ENCRYPTED_PREFIX):
                result[provider] = self.encrypt(key)
            else:
                result[provider] = key
        return result

    def decrypt_keys(self, api_keys: Dict[str, str]) -> Dict[str, str]:
        """Decrypt all API key values."""
        return {provider: self.decrypt(key) for provider, key in api_keys.items()}
