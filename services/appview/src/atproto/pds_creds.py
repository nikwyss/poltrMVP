import base64
import os
from nacl import secret, utils
from nacl.exceptions import CryptoError

# SecretBox = XSalsa20-Poly1305 (24-byte nonce, 32-byte key).
#
# Key-Split: USER-Creds (auth_creds) und COMMUNITY-Creds (community_accounts)
# werden mit GETRENNTEN Master-Keys verschlüsselt, damit ein Leak des einen Dienstes
# nicht den anderen Credential-Topf öffnet. Auf Dev dürfen beide denselben Wert haben.
USER_KEY_ENV = "APPVIEW_USER_CREDS_MASTER_KEY_B64"   # appview only
COMMUNITY_KEY_ENV = "APPVIEW_COMMUNITY_CREDS_MASTER_KEY_B64"     # writer + CMS


def _load_key(env_var: str) -> bytes:
    key_b64 = os.getenv(env_var)
    if not key_b64:
        raise ValueError(f"{env_var} environment variable is not set")
    key = base64.b64decode(key_b64)
    if len(key) != secret.SecretBox.KEY_SIZE:
        raise ValueError("Master key must be 32 bytes")
    return key


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


# --- COMMUNITY-Creds (community_accounts) — writer/CMS/appview-gov path ----
def encrypt_community_password(plaintext: str) -> tuple[bytes, bytes]:
    return _encrypt(plaintext, _load_key(COMMUNITY_KEY_ENV))


def decrypt_community_password(ciphertext: bytes, nonce: bytes) -> str:
    return _decrypt(ciphertext, nonce, _load_key(COMMUNITY_KEY_ENV))
