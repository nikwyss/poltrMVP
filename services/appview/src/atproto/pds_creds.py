import base64
import os
from nacl import secret, utils
from nacl.exceptions import CryptoError

# SecretBox = XSalsa20-Poly1305 (24-byte nonce, 32-byte key).
#
# Key-Split (vorbereitet): USER-Creds (auth_creds) und GOVERNANCE-Creds
# (governance_accounts) werden mit GETRENNTEN Master-Keys verschlüsselt, damit ein
# Leak des einen Dienstes nicht den anderen Credential-Topf öffnet. Auf Dev dürfen
# beide denselben Wert haben — die Env-Namen sind aber schon getrennt. Legacy-
# Fallback auf den alten Einzel-Key, solange nur dieser gesetzt ist.
USER_KEY_ENV = "APPVIEW_USER_CREDS_MASTER_KEY_B64"   # appview only
GOV_KEY_ENV = "APPVIEW_GOV_CREDS_MASTER_KEY_B64"     # writer + CMS (+ appview bis Phase 7)
_LEGACY_KEY_ENV = "APPVIEW_PDS_CREDS_MASTER_KEY_B64"


def _load_key(env_var: str) -> bytes:
    key_b64 = os.getenv(env_var) or os.getenv(_LEGACY_KEY_ENV)
    if not key_b64:
        raise ValueError(
            f"{env_var} (or legacy {_LEGACY_KEY_ENV}) environment variable is not set"
        )
    key = base64.b64decode(key_b64)
    if len(key) != secret.SecretBox.KEY_SIZE:
        raise ValueError("Master key must be 32 bytes")
    return key


def load_master_key() -> bytes:
    """Deprecated alias (legacy single key). New code uses the scoped helpers."""
    return _load_key(_LEGACY_KEY_ENV)


def _encrypt(plaintext: str, key: bytes) -> tuple[bytes, bytes]:
    box = secret.SecretBox(key)
    nonce = utils.random(secret.SecretBox.NONCE_SIZE)  # 24 bytes
    return box.encrypt(plaintext.encode("utf-8"), nonce).ciphertext, nonce


def _decrypt(ciphertext: bytes, nonce: bytes, key: bytes) -> str:
    box = secret.SecretBox(key)
    try:
        return box.decrypt(ciphertext, nonce).decode("utf-8")
    except CryptoError as e:
        raise ValueError("Decryption failed (wrong key or corrupted data)") from e


# --- USER-Creds (auth_creds) — appview app-password encryption ---------------
def encrypt_app_password(plaintext: str) -> tuple[bytes, bytes]:
    return _encrypt(plaintext, _load_key(USER_KEY_ENV))


def decrypt_app_password(ciphertext: bytes, nonce: bytes) -> str:
    return _decrypt(ciphertext, nonce, _load_key(USER_KEY_ENV))


# --- GOVERNANCE-Creds (governance_accounts) — writer/CMS/appview-gov path ----
def encrypt_gov_password(plaintext: str) -> tuple[bytes, bytes]:
    return _encrypt(plaintext, _load_key(GOV_KEY_ENV))


def decrypt_gov_password(ciphertext: bytes, nonce: bytes) -> str:
    return _decrypt(ciphertext, nonce, _load_key(GOV_KEY_ENV))
