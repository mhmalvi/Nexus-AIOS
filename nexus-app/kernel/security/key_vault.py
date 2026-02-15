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
        """Load the vault key from disk or generate a new one."""
        self._key_path.parent.mkdir(parents=True, exist_ok=True)

        if self._key_path.exists():
            key = self._key_path.read_bytes().strip()
        else:
            key = Fernet.generate_key()
            self._key_path.write_bytes(key)

        # Restrict permissions on Unix
        if os.name != "nt":
            try:
                os.chmod(self._key_path, 0o600)
                os.chmod(self._key_path.parent, 0o700)
            except OSError:
                pass

        return key

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
